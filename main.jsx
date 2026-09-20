import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle, ArrowRight, BarChart3, Bell, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Download, FileCheck2, FileText, Filter, FolderOpen,
  LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Search, Settings,
  ShieldCheck, SlidersHorizontal, UploadCloud, UserRound, X
} from 'lucide-react';
import './styles.css';
import './upload.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787/api';

const seedChecks = [
  { id: 1, requirement: 'Valid GST registration certificate', source: 'Clause 4.1 · Eligibility', status: 'Verified', confidence: 98, evidence: 'GSTIN 29AABCT4812H1ZV · Certificate page 1', detail: 'GST registration is active and the legal entity name matches the bidder profile.', page: 'Bidder GST Certificate · p. 1' },
  { id: 2, requirement: 'Average annual turnover ≥ ₹2 Cr', source: 'Clause 4.3 · Financial capacity', status: 'Verified', confidence: 94, evidence: '₹2.46 Cr avg. FY22–FY24 · Audited statements', detail: 'Average annual turnover calculated from three uploaded audited financial statements.', page: 'Audited Financials FY22–FY24 · p. 3, 7, 11' },
  { id: 3, requirement: 'Completed 2 similar projects in last 3 years', source: 'Clause 5.2 · Experience', status: 'Needs review', confidence: 71, evidence: '1 matched project · 1 project lacks completion proof', detail: 'One supplied experience certificate meets the tender threshold. The second project reference has no completion certificate attached.', page: 'Experience Portfolio · p. 4–6' },
  { id: 4, requirement: 'ISO 27001:2022 certification', source: 'Clause 6.1 · Information security', status: 'Missing', confidence: 99, evidence: 'No supporting document found', detail: 'No valid ISO 27001 certificate or equivalent evidence was found in the submitted bundle.', page: 'No source evidence' },
  { id: 5, requirement: 'No blacklisting declaration', source: 'Clause 7.4 · Declarations', status: 'Verified', confidence: 91, evidence: 'Signed declaration dated 18 Sep 2026', detail: 'Declaration is signed by the authorized signatory and matches the required tender language.', page: 'Declarations.pdf · p. 2' },
];

const statusMeta = {
  Verified: { className: 'verified', icon: Check },
  'Needs review': { className: 'review', icon: AlertTriangle },
  Missing: { className: 'missing', icon: X },
};

function App() {
  const [checks, setChecks] = useState(seedChecks);
  const [active, setActive] = useState('Overview');
  const [selected, setSelected] = useState(seedChecks[2]);
  const [showUpload, setShowUpload] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('All');

  const filteredChecks = useMemo(() => filter === 'All' ? checks : checks.filter(c => c.status === filter), [filter]);
  const counts = useMemo(() => ({
    verified: checks.filter(c => c.status === 'Verified').length,
    review: checks.filter(c => c.status === 'Needs review').length,
    missing: checks.filter(c => c.status === 'Missing').length,
  }), []);

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const runAnalysis = async (files = []) => {
    setIsProcessing(true);
    try {
      const documents = await Promise.all(files.map(async (file, index) => {
        const uploadResponse = await fetch(`${API_BASE_URL}/uploads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/pdf' }) });
        if (!uploadResponse.ok) throw new Error('Could not prepare document upload.');
        const { key, uploadUrl } = await uploadResponse.json();
        const storageResponse = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/pdf' }, body: file });
        if (!storageResponse.ok) throw new Error(`Could not upload ${file.name}.`);
        return { key, name: file.name, type: index === 0 ? 'tender' : 'bidder' };
      }));
      const response = await fetch(`${API_BASE_URL}/analyses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tender: { name: files[0]?.name || 'Tender_RFP_SmartCity.pdf', tenderId: 'GEM/2026/B/487192' }, bidder: { name: files[1]?.name || 'Acme_Bidder_Bundle.zip', legalName: 'Acme Systems Pvt. Ltd.' }, documents }) });
      if (!response.ok) throw new Error('The analysis service is unavailable.');
      let { analysis } = await response.json();
      for (let attempt = 0; analysis.status === 'processing' && attempt < 18; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        const poll = await fetch(`${API_BASE_URL}/analyses/${analysis.id}`);
        if (!poll.ok) throw new Error('The analysis service could not retrieve its result.');
        ({ analysis } = await poll.json());
      }
      if (analysis.status === 'processing') throw new Error('Analysis is still processing. Please retry in a moment.');
      if (analysis.status === 'failed') throw new Error(analysis.error || 'Document analysis failed.');
      setChecks(analysis.checks || seedChecks);
      setSelected((analysis.checks || seedChecks)[2]);
      setShowUpload(false);
      notify(`Analysis complete — ${(analysis.checks || []).length} compliance checks created.`);
    } catch (error) { notify(error.message || 'Analysis could not be completed.'); }
    finally { setIsProcessing(false); }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">T</div><span>TENDRIX</span></div>
      <div className="workspace"><span className="workspace-dot"></span><span>Procurement Ops</span><ChevronDown size={15}/></div>
      <nav>
        {[
          [LayoutDashboard, 'Overview'], [FolderOpen, 'Tenders'], [ShieldCheck, 'VerifyGEM'],
          [FileText, 'Reports'], [BarChart3, 'Insights']
        ].map(([Icon, label]) => <button key={label} onClick={() => setActive(label)} className={active === label ? 'nav-item active' : 'nav-item'}><Icon size={18}/><span>{label}</span>{label === 'VerifyGEM' && <span className="nav-badge">2</span>}</button>)}
      </nav>
      <div className="sidebar-foot">
        <button className="nav-item"><Settings size={18}/><span>Settings</span></button>
        <div className="profile"><div className="avatar">SK</div><div><strong>Shreyas Kumar</strong><span>Procurement officer</span></div><MoreHorizontal size={18}/></div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><button className="mobile-menu"><Menu size={20}/></button><div className="breadcrumbs"><span>VerifyGEM</span><ChevronRight size={15}/><strong>Bid compliance review</strong></div><div className="top-actions"><button className="icon-button"><Bell size={19}/><i></i></button><div className="top-avatar">SK</div></div></header>
      <section className="page-head">
        <div><div className="eyebrow"><span className="pulse"></span> ANALYSIS COMPLETE</div><h1>Bid compliance review</h1><p>Smart City IT Infrastructure · Tender ID: GEM/2026/B/487192</p></div>
        <div className="head-actions"><button className="button secondary" onClick={() => notify('PDF report prepared for download.')}><Download size={17}/> Export report</button><button className="button primary" onClick={() => setShowUpload(true)}><Plus size={18}/> New analysis</button></div>
      </section>

      <section className="overview-grid">
        <div className="score-card"><div className="score-top"><div><span className="card-label">COMPLIANCE SCORE</span><h2>78<span>/100</span></h2></div><div className="score-ring"><svg viewBox="0 0 42 42"><circle className="ring-base" cx="21" cy="21" r="15.5"/><circle className="ring-value" cx="21" cy="21" r="15.5" pathLength="100" strokeDasharray="78 100"/></svg><strong>78%</strong></div></div><p><span className="green-dot"></span> Eligible with review items</p></div>
        <Metric icon={<Check size={19}/>} label="Verified" count={counts.verified} tone="green" />
        <Metric icon={<AlertTriangle size={19}/>} label="Needs review" count={counts.review} tone="amber" />
        <Metric icon={<X size={19}/>} label="Missing" count={counts.missing} tone="red" />
        <div className="risk-card"><div><span className="card-label">RISK SIGNAL</span><h3>Medium</h3><p>1 blocking requirement</p></div><div className="risk-bars"><span></span><span></span><span className="filled"></span><span className="filled"></span><span className="filled"></span></div></div>
      </section>

      <section className="content-grid">
        <div className="checks-panel panel"><div className="panel-title"><div><h2>Compliance checks</h2><p>Evidence-backed verification against tender requirements</p></div><button className="more-button"><MoreHorizontal size={20}/></button></div>
          <div className="table-toolbar"><div className="filter-tabs">{['All', 'Verified', 'Needs review', 'Missing'].map(x => <button key={x} onClick={() => setFilter(x)} className={filter === x ? 'selected' : ''}>{x}{x !== 'All' && <span>{x === 'Verified' ? counts.verified : x === 'Needs review' ? counts.review : counts.missing}</span>}</button>)}</div><button className="filter-btn"><SlidersHorizontal size={16}/> Filters</button></div>
          <div className="check-list">{filteredChecks.map(check => <CheckRow key={check.id} check={check} selected={selected.id === check.id} onClick={() => setSelected(check)} />)}</div>
        </div>
        <EvidencePanel check={selected} onNotify={notify}/>
      </section>
    </main>
    {showUpload && <UploadModal isProcessing={isProcessing} onClose={() => !isProcessing && setShowUpload(false)} onRun={runAnalysis}/>} 
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>;
}

function Metric({ icon, label, count, tone }) { return <div className={`metric-card ${tone}`}><div className="metric-icon">{icon}</div><div><span className="card-label">{label.toUpperCase()}</span><h3>{count}<span> requirements</span></h3></div></div> }
function CheckRow({ check, selected, onClick }) { const meta = statusMeta[check.status]; const Icon = meta.icon; return <button className={`check-row ${selected ? 'selected' : ''}`} onClick={onClick}><span className={`status-icon ${meta.className}`}><Icon size={15}/></span><div className="check-main"><strong>{check.requirement}</strong><span>{check.source}</span></div><div className="confidence"><span>{check.confidence}%</span><div><i style={{ width: `${check.confidence}%` }}></i></div></div><span className={`status-pill ${meta.className}`}>{check.status}</span><ChevronRight className="chevron" size={17}/></button> }
function EvidencePanel({ check, onNotify }) { const meta = statusMeta[check.status]; const Icon = meta.icon; return <aside className="evidence-panel panel"><div className="evidence-head"><div className="icon-well"><FileCheck2 size={20}/></div><div><span className="card-label">EVIDENCE REVIEW</span><h2>Requirement detail</h2></div></div><div className="requirement-block"><span>REQUIREMENT</span><h3>{check.requirement}</h3><p>{check.source}</p></div><div className="decision"><div><span>VERIFYGEM DECISION</span><div className={`status-pill ${meta.className}`}><Icon size={14}/>{check.status}</div></div><strong>{check.confidence}%<small> confidence</small></strong></div><div className="evidence-box"><div className="evidence-label"><span>EXTRACTED EVIDENCE</span><button onClick={() => onNotify('Evidence reference copied.')}><FileText size={15}/> Open source</button></div><p>“{check.evidence}”</p><footer><FileText size={14}/>{check.page}</footer></div><div className="ai-note"><div className="sparkle">✦</div><div><strong>Why VerifyGEM flagged this</strong><p>{check.detail}</p></div></div><div className="review-actions"><button className="button secondary" onClick={() => onNotify('Marked for manual review.')}><UserRound size={16}/> Assign reviewer</button><button className="button primary" onClick={() => onNotify('Decision approved and added to audit trail.')}><Check size={16}/> Approve</button></div><div className="audit"><Clock3 size={15}/><span>Last processed today at 10:42 AM</span></div></aside> }
function UploadModal({ onClose, onRun, isProcessing }) {
  const [files, setFiles] = useState([]);
  const inputRef = useRef(null);
  return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}><X size={19}/></button><div className="modal-icon"><UploadCloud size={24}/></div><h2>Start a new analysis</h2><p>Upload the tender first, then one or more bidder documents. VerifyGEM will extract, compare, and explain every compliance decision.</p><input ref={inputRef} className="file-input" type="file" accept="application/pdf,image/png,image/jpeg" multiple onChange={(event) => setFiles([...event.target.files])}/><div className="upload-area" onClick={() => inputRef.current?.click()}><UploadCloud size={24}/><strong>{files.length ? `${files.length} document${files.length > 1 ? 's' : ''} selected` : 'Drop documents here'}</strong><span>PDF, PNG, JPG · up to 25 MB per file</span><button type="button" className="browse" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>Browse files</button></div><div className="demo-files">{files.length ? files.map((file) => <React.Fragment key={file.name}><FileText size={17}/><span>{file.name}</span><Check size={16}/></React.Fragment>) : <><FileText size={17}/><span>1. Tender / RFP document</span><FileText size={17}/><span>2. Bidder evidence bundle</span></>}</div><button className="button primary full" disabled={isProcessing} onClick={() => onRun(files)}>{isProcessing ? <><span className="spinner"></span> VerifyGEM is analysing…</> : <><ShieldCheck size={18}/> Run compliance analysis</>}</button></div></div> }

createRoot(document.getElementById('root')).render(<App />);
