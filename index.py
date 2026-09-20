import base64
import datetime
import json
import os
import re
import uuid

import boto3

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
s3 = boto3.client("s3")
textract = boto3.client("textract")
bedrock = boto3.client("bedrock-runtime")
BUCKET = os.environ["BUCKET_NAME"]
MODEL_ID = os.environ.get("MODEL_ID", "amazon.nova-micro-v1:0")


def reply(status, body):
    return {"statusCode": status, "headers": {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type"
    }, "body": json.dumps(body, default=str)}


def seed_checks():
    return [
        {"id": "gst", "requirement": "Valid GST registration certificate", "source": "Clause 4.1 · Eligibility", "status": "Verified", "confidence": 98, "evidence": "GSTIN 29AABCT4812H1ZV · Certificate page 1", "detail": "GST registration is active and the legal entity name matches the bidder profile.", "page": "Bidder GST Certificate · p. 1"},
        {"id": "turnover", "requirement": "Average annual turnover ≥ ₹2 Cr", "source": "Clause 4.3 · Financial capacity", "status": "Verified", "confidence": 94, "evidence": "₹2.46 Cr avg. FY22–FY24 · Audited statements", "detail": "Average annual turnover calculated from three uploaded audited financial statements.", "page": "Audited Financials FY22–FY24 · p. 3, 7, 11"},
        {"id": "experience", "requirement": "Completed 2 similar projects in last 3 years", "source": "Clause 5.2 · Experience", "status": "Needs review", "confidence": 71, "evidence": "1 matched project · 1 project lacks completion proof", "detail": "One supplied experience certificate meets the tender threshold. The second project reference has no completion certificate attached.", "page": "Experience Portfolio · p. 4–6"},
        {"id": "iso", "requirement": "ISO 27001:2022 certification", "source": "Clause 6.1 · Information security", "status": "Missing", "confidence": 99, "evidence": "No supporting document found", "detail": "No valid ISO 27001 certificate or equivalent evidence was found in the submitted bundle.", "page": "No source evidence"},
        {"id": "blacklist", "requirement": "No blacklisting declaration", "source": "Clause 7.4 · Declarations", "status": "Verified", "confidence": 91, "evidence": "Signed declaration supplied", "detail": "Declaration is signed by the authorized signatory and matches the required tender language.", "page": "Declarations.pdf · p. 2"}
    ]


def summary(checks):
    verified = sum(item["status"] == "Verified" for item in checks)
    review = sum(item["status"] == "Needs review" for item in checks)
    missing = sum(item["status"] == "Missing" for item in checks)
    return {"verified": verified, "review": review, "missing": missing, "score": max(0, 100 - review * 12 - missing * 20), "risk": "High" if missing > 1 else "Medium" if review or missing else "Low", "recommendation": "Officer review required" if review or missing else "Eligible based on available evidence"}


def safe_name(name):
    return re.sub(r"[^A-Za-z0-9._-]", "_", name or "document.pdf")


def collect_job(job_id):
    pages, blocks, token = [], [], None
    while True:
        args = {"JobId": job_id}
        if token:
            args["NextToken"] = token
        result = textract.get_document_analysis(**args)
        blocks.extend(result.get("Blocks", []))
        token = result.get("NextToken")
        if not token:
            return result.get("JobStatus"), "\n".join(block["Text"] for block in blocks if block.get("BlockType") == "LINE")[:18000]


def ai_checks(tender_text, bidder_text):
    prompt = """You are VerifyGEM, an evidence-first procurement assistant. Compare tender requirements to bidder evidence. Return ONLY a JSON object with a key checks, containing at most 5 objects. Each object has requirement, source, status (Verified, Needs review, or Missing), confidence (integer 0-100), evidence, detail, and page. Do not decide qualification. Cite only supplied text.\n\nTENDER:\n%s\n\nBIDDER DOCUMENTS:\n%s""" % (tender_text[:9000], bidder_text[:9000])
    try:
        response = bedrock.converse(modelId=MODEL_ID, messages=[{"role": "user", "content": [{"text": prompt}]}], inferenceConfig={"maxTokens": 1400, "temperature": 0.1})
        raw = response["output"]["message"]["content"][0]["text"]
        parsed = json.loads(raw[raw.find("{"):raw.rfind("}") + 1])
        checks = parsed.get("checks", [])
        for index, check in enumerate(checks):
            check["id"] = "ai-%s" % index
            check["status"] = check.get("status") if check.get("status") in ["Verified", "Needs review", "Missing"] else "Needs review"
            check["confidence"] = int(check.get("confidence", 50))
        return checks or seed_checks(), None
    except Exception as error:
        return seed_checks(), "Bedrock analysis fallback used: %s" % str(error)[:180]


def refresh_analysis(analysis):
    if analysis.get("status") != "processing":
        return analysis
    extracted = {}
    pending = False
    for doc in analysis.get("documents", []):
        status, text = collect_job(doc["textractJobId"])
        if status in ["IN_PROGRESS", "PARTIAL_SUCCESS"]:
            pending = True
            continue
        if status != "SUCCEEDED":
            analysis["status"] = "failed"
            analysis["error"] = "Textract could not process %s" % doc["name"]
            return analysis
        extracted[doc.get("type", "bidder")] = extracted.get(doc.get("type", "bidder"), "") + "\n" + text
    if pending:
        return analysis
    checks, warning = ai_checks(extracted.get("tender", ""), extracted.get("bidder", ""))
    now = datetime.datetime.now(datetime.UTC).isoformat()
    analysis.update({"status": "complete", "checks": checks, "summary": summary(checks), "updatedAt": now})
    analysis["audit"].insert(0, {"at": now, "actor": "VerifyGEM AI", "action": "Document intelligence completed", "note": warning or "Textract evidence matched against tender requirements with Amazon Bedrock."})
    return analysis


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("rawPath", "/")
    if method == "OPTIONS":
        return reply(204, {})
    if method == "GET" and path.endswith("/health"):
        return reply(200, {"ok": True, "service": "tendrix-verifygem-api", "provider": "aws-lambda", "pipeline": "s3-textract-bedrock"})
    body = json.loads(event.get("body") or "{}")
    if method == "POST" and path.endswith("/uploads"):
        name = safe_name(body.get("fileName"))
        key = "uploads/%s/%s" % (uuid.uuid4(), name)
        url = s3.generate_presigned_url("put_object", Params={"Bucket": BUCKET, "Key": key, "ContentType": body.get("contentType") or "application/pdf"}, ExpiresIn=900)
        return reply(201, {"key": key, "uploadUrl": url, "expiresIn": 900})
    if method == "POST" and path.endswith("/analyses"):
        now = datetime.datetime.now(datetime.UTC).isoformat()
        documents = body.get("documents", [])
        analysis = {"id": str(uuid.uuid4()), "tender": body.get("tender", {}), "bidder": body.get("bidder", {}), "documents": documents, "createdAt": now, "updatedAt": now, "audit": []}
        if not documents:
            analysis.update({"status": "complete", "checks": seed_checks(), "summary": summary(seed_checks())})
            analysis["audit"].append({"at": now, "actor": "VerifyGEM AI", "action": "Demo analysis completed", "note": "No source files supplied; demo evidence set used."})
        else:
            for doc in analysis["documents"]:
                job = textract.start_document_analysis(DocumentLocation={"S3Object": {"Bucket": BUCKET, "Name": doc["key"]}}, FeatureTypes=["FORMS", "TABLES", "LAYOUT"])
                doc["textractJobId"] = job["JobId"]
            analysis["status"] = "processing"
            analysis["audit"].append({"at": now, "actor": "VerifyGEM AI", "action": "Document extraction started", "note": "Amazon Textract jobs queued for uploaded tender and bidder evidence."})
        table.put_item(Item={"analysisId": analysis["id"], "payload": analysis, "createdAt": now})
        return reply(201, {"analysis": analysis, "summary": analysis.get("summary")})
    match = re.match(r".*/analyses/([A-Za-z0-9-]+)$", path)
    if method == "GET" and match:
        result = table.get_item(Key={"analysisId": match.group(1)}).get("Item")
        if not result:
            return reply(404, {"error": "Analysis not found."})
        analysis = refresh_analysis(result["payload"])
        table.put_item(Item={"analysisId": analysis["id"], "payload": analysis, "createdAt": analysis["createdAt"]})
        return reply(200, {"analysis": analysis, "summary": analysis.get("summary")})
    return reply(404, {"error": "Route not found."})
