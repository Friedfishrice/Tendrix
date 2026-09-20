# Tendrix VerifyGEM

AI-assisted, evidence-first bid compliance verification for GeM procurement teams.

## What works now

- Responsive procurement officer dashboard
- Local API with analysis creation, retrieval, manual decision endpoints, and audit trail
- AWS CloudFormation stack for encrypted documents, serverless API, and persistent audits
- A deployed AWS API returns an explainable compliance report for the demo workflow

## Run locally

Open two terminals in this folder:

```powershell
npm run server
npm run dev
```

Then open `http://localhost:5173`.

## AWS deployment

Deploy `infrastructure/template.yaml` in CloudFormation using **Asia Pacific (Mumbai) / ap-south-1**. The stack creates:

- A private, AES-256 encrypted S3 bucket whose uploaded documents expire after 7 days
- A DynamoDB on-demand audit table
- A single-concurrency Lambda API with a public Function URL

After deployment, copy the `ApiUrl` output into a local `.env` file:

```powershell
VITE_API_URL=https://your-lambda-id.lambda-url.ap-south-1.on.aws
```

Restart `npm run dev`. The app will then call the AWS Lambda backend.

## Cost guardrails

The stack uses pay-per-request serverless services, no VPC, no NAT Gateway, no always-on compute, and seven-day document expiration. It is designed for a hackathon demo under a $20 cap. Configure AWS Budget alerts at $10, $15, and $19 before broader testing.

## Next implementation milestones

1. Add browser-to-S3 uploads using short-lived presigned URLs.
2. Run Amazon Textract once per uploaded document and persist extraction results.
3. Send only relevant extracted clauses/evidence to Amazon Bedrock for structured rule matching.
4. Add officer decisions to the persistent audit trail.
