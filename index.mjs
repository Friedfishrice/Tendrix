import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 8787);
const analyses = new Map();

const baseChecks = [
  { id: 'gst', requirement: 'Valid GST registration certificate', source: 'Clause 4.1 · Eligibility', status: 'Verified', confidence: 98, evidence: 'GSTIN 29AABCT4812H1ZV · Certificate page 1', detail: 'GST registration is active and the legal entity name matches the bidder profile.', page: 'Bidder GST Certificate · p. 1', connector: 'GSTN' },
  { id: 'turnover', requirement: 'Average annual turnover ≥ ₹2 Cr', source: 'Clause 4.3 · Financial capacity', status: 'Verified', confidence: 94, evidence: '₹2.46 Cr avg. FY22–FY24 · Audited statements', detail: 'Average annual turnover calculated from three uploaded audited financial statements.', page: 'Audited Financials FY22–FY24 · p. 3, 7, 11', connector: 'Document intelligence' },
  { id: 'experience', requirement: 'Completed 2 similar projects in last 3 years', source: 'Clause 5.2 · Experience', status: 'Needs review', confidence: 71, evidence: '1 matched project · 1 project lacks completion proof', detail: 'One supplied experience certificate meets the tender threshold. The second project reference has no completion certificate attached.', page: 'Experience Portfolio · p. 4–6', connector: 'Document intelligence' },
  { id: 'iso', requirement: 'ISO 27001:2022 certification', source: 'Clause 6.1 · Information security', status: 'Missing', confidence: 99, evidence: 'No supporting document found', detail: 'No valid ISO 27001 certificate or equivalent evidence was found in the submitted bundle.', page: 'No source evidence', connector: 'Document intelligence' },
  { id: 'blacklist', requirement: 'No blacklisting declaration', source: 'Clause 7.4 · Declarations', status: 'Verified', confidence: 91, evidence: 'Signed declaration dated 18 Sep 2026', detail: 'Declaration is signed by the authorized signatory and matches the required tender language.', page: 'Declarations.pdf · p. 2', connector: 'Declaration review' }
];

function summary(checks) {
  const verified = checks.filter((check) => check.status === 'Verified').length;
  const review = checks.filter((check) => check.status === 'Needs review').length;
  const missing = checks.filter((check) => check.status === 'Missing').length;
  return { verified, review, missing, score: 78, risk: 'Medium', recommendation: 'Eligible with review items' };
}

function seedAnalysis(input = {}) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const analysis = {
    id,
    status: 'complete',
    tender: input.tender || { name: 'Tender_RFP_SmartCity.pdf', tenderId: 'GEM/2026/B/487192' },
    bidder: input.bidder || { name: 'Acme_Bidder_Bundle.zip', legalName: 'Acme Systems Pvt. Ltd.' },
    checks: structuredClone(baseChecks),
    audit: [{ id: randomUUID(), at: now, actor: 'VerifyGEM AI', action: 'Analysis completed', note: 'Extracted tender requirements and matched bidder evidence.' }],
    createdAt: now,
    updatedAt: now
  };
  analyses.set(id, analysis);
  return analysis;
}

const demoAnalysis = seedAnalysis();

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
  res.end(JSON.stringify(body));
}

async function jsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Request body must be valid JSON.'); }
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;
  try {
    if (req.method === 'GET' && route === '/api/health') return send(res, 200, { ok: true, service: 'tendrix-verifygem-api', provider: 'local-demo' });
    if (req.method === 'GET' && route === '/api/analyses/demo') return send(res, 200, { analysis: demoAnalysis, summary: summary(demoAnalysis.checks) });
    if (req.method === 'POST' && route === '/api/analyses') {
      const body = await jsonBody(req);
      const analysis = seedAnalysis(body);
      return send(res, 201, { analysis, summary: summary(analysis.checks) });
    }
    const analysisMatch = route.match(/^\/api\/analyses\/([\w-]+)$/);
    if (req.method === 'GET' && analysisMatch) {
      const analysis = analyses.get(analysisMatch[1]);
      return analysis ? send(res, 200, { analysis, summary: summary(analysis.checks) }) : send(res, 404, { error: 'Analysis not found.' });
    }
    const decisionMatch = route.match(/^\/api\/analyses\/([\w-]+)\/checks\/([\w-]+)\/decision$/);
    if (req.method === 'POST' && decisionMatch) {
      const analysis = analyses.get(decisionMatch[1]);
      if (!analysis) return send(res, 404, { error: 'Analysis not found.' });
      const body = await jsonBody(req);
      const check = analysis.checks.find((item) => item.id === decisionMatch[2]);
      if (!check) return send(res, 404, { error: 'Compliance check not found.' });
      if (!['Verified', 'Needs review', 'Missing'].includes(body.status)) return send(res, 422, { error: 'Invalid status.' });
      check.status = body.status;
      check.officerNote = body.note || '';
      analysis.updatedAt = new Date().toISOString();
      analysis.audit.unshift({ id: randomUUID(), at: analysis.updatedAt, actor: body.actor || 'Procurement officer', action: `Decision changed to ${body.status}`, note: body.note || 'Manual decision update.' });
      return send(res, 200, { analysis, summary: summary(analysis.checks) });
    }
    return send(res, 404, { error: 'Route not found.' });
  } catch (error) { return send(res, 400, { error: error.message }); }
}).listen(port, () => console.log(`VerifyGEM API listening on http://localhost:${port}`));
