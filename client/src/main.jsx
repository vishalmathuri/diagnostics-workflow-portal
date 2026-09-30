import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import AuditTimeline from './AuditTimeline.jsx';

async function api(path,token,options={}) {
  const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error||'Request failed');
  return data;
}
const labels={registered:'Registered',in_progress:'In progress',result_entered:'Awaiting review',approved:'Approved',rejected:'Rejected'};
function App() {
  const [auth,setAuth]=useState(null),[email,setEmail]=useState('staff@example.test'),[password,setPassword]=useState('StaffDemo123!');
  const [samples,setSamples]=useState([]),[history,setHistory]=useState([]),[tab,setTab]=useState('queue');
  const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [sampleForm,setSampleForm]=useState({code:'',test_name:'',specimen_type:''});
  const [resultForm,setResultForm]=useState({value_text:'',unit:''}),[selected,setSelected]=useState(null),[reviewNote,setReviewNote]=useState('');
  const [auditSample,setAuditSample]=useState(null);
  async function refresh() {
    if (!auth) return;
    try {
      const [work,results]=await Promise.all([
        api(`/samples?q=${encodeURIComponent(query)}&${status?`status=${status}`:''}`,auth.token),
        api(`/results?q=${encodeURIComponent(query)}`,auth.token)
      ]);
      setSamples(work); setHistory(results);
    } catch(e) { setError(e.message); }
  }
  useEffect(()=>{ refresh(); },[auth,query,status]);
  async function act(fn,message) {
    setError('');setNotice('');
    try { await fn();setNotice(message);setSelected(null);setReviewNote('');await refresh(); }
    catch(e) { setError(e.message); }
  }
  async function login(e) {
    e.preventDefault();setError('');
    try {setAuth(await api('/auth/login',null,{method:'POST',body:JSON.stringify({email,password})}));setPassword('');}
    catch(e) {setError(e.message);}
  }
  if (!auth) return <main className="login"><div className="brand">◇ <span>DIAGNOSTICS / WORKFLOW</span></div><section className="loginCard"><p className="eyebrow">SYNTHETIC DATA DEMO</p><h1>Sign in to the portal</h1><p>Track samples from registration through review.</p><form onSubmit={login}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button>Sign in</button></form>{error&&<p className="error">{error}</p>}<p className="hint">Demo accounts are listed in README.md.</p></section></main>;
  return <div className="app"><aside><div className="brand">◇ <span>DIAGNOSTICS<br/>WORKFLOW</span></div><p className="sideLabel">WORKSPACE</p><button className={tab==='queue'?'active':''} onClick={()=>setTab('queue')}>▤ &nbsp; Sample queue</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>⌕ &nbsp; Result history</button><div className="sideFoot"><div className="avatar">{auth.user.role[0].toUpperCase()}</div><div><strong>{auth.user.role}</strong><small>{auth.user.email}</small></div><button className="logout" onClick={()=>{setAuth(null);setSamples([]);setHistory([]);setAuditSample(null);setSelected(null);setError('');}}>Sign out</button></div></aside>
    <main className="content"><header><div><p className="eyebrow">OPERATIONS / {tab.toUpperCase()}</p><h1>{tab==='queue'?'Sample queue':'Result history'}</h1><p className="subtitle">{tab==='queue'?'Manage the journey from collection to reviewed result.':'Search finalized, reviewer approved results.'}</p></div><span className="role">{auth.user.role} access</span></header>
    {error&&<div className="alert error">{error}<button onClick={()=>setError('')}>×</button></div>}{notice&&<div className="alert success">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
    {tab==='queue'&&<div className="stats"><div><small>ALL SAMPLES</small><strong>{samples.length}</strong></div><div><small>AWAITING REVIEW</small><strong>{samples.filter(x=>x.status==='result_entered').length}</strong></div><div><small>APPROVED</small><strong>{samples.filter(x=>x.status==='approved').length}</strong></div></div>}
    {tab==='queue'&&auth.user.role==='staff'&&<section className="panel"><div className="panelTitle"><div><h2>Register a sample</h2><p>Use synthetic IDs only, for example SYN-1005.</p></div></div><form className="register" onSubmit={e=>{e.preventDefault();act(async()=>{await api('/samples',auth.token,{method:'POST',body:JSON.stringify(sampleForm)});setSampleForm({code:'',test_name:'',specimen_type:''});},'Sample registered.');}}><label>Sample code<input placeholder="SYN-1005" value={sampleForm.code} onChange={e=>setSampleForm({...sampleForm,code:e.target.value})} required/></label><label>Test name<input placeholder="e.g. Glucose" value={sampleForm.test_name} onChange={e=>setSampleForm({...sampleForm,test_name:e.target.value})} required/></label><label>Specimen<input placeholder="e.g. Plasma" value={sampleForm.specimen_type} onChange={e=>setSampleForm({...sampleForm,specimen_type:e.target.value})} required/></label><button>Add sample</button></form></section>}
    <section className="panel"><div className="panelTitle"><div><h2>{tab==='queue'?'Current samples':'Approved results'}</h2><p>{tab==='queue'?'Update processing and review decisions.':'Only approved results are shown here.'}</p></div></div><div className="filters"><input aria-label="Search" placeholder="Search sample code or test name" value={query} onChange={e=>setQuery(e.target.value)}/>{tab==='queue'&&<select aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(labels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select>}</div><div className="tableWrap"><table><thead><tr><th>Sample</th><th>Test / specimen</th><th>{tab==='queue'?'Status':'Result'}</th><th>{tab==='queue'?'Result':'Reviewed'}</th>{tab==='queue'&&<th>Action</th>}</tr></thead><tbody>{(tab==='queue'?samples:history).map(row=><tr key={row.id||row.code}><td><strong>{row.code}</strong><button className="auditLink" aria-label={`View audit timeline for ${row.code}`} onClick={()=>setAuditSample(row)}>View timeline</button><small>{tab==='queue'?new Date(row.created_at).toLocaleDateString():''}</small></td><td>{row.test_name}<small>{row.specimen_type}</small></td><td>{tab==='queue'?<span className={`pill ${row.status}`}>{labels[row.status]}</span>:<strong>{row.value_text} {row.unit}</strong>}</td><td>{tab==='queue'?(row.value_text?`${row.value_text} ${row.unit}`:'—'):new Date(row.reviewed_at).toLocaleString()}</td>{tab==='queue'&&<td>{auth.user.role==='staff'&&row.status==='registered'&&<button className="small" onClick={()=>act(()=>api(`/samples/${row.id}/status`,auth.token,{method:'PATCH',body:JSON.stringify({status:'in_progress'})}),'Processing started.')}>Start</button>}{auth.user.role==='staff'&&['in_progress','rejected'].includes(row.status)&&<button className="small" onClick={()=>{setSelected(row);setResultForm({value_text:row.value_text||'',unit:row.unit||''});}}>Enter result</button>}{auth.user.role==='reviewer'&&row.status==='result_entered'&&<button className="small" onClick={()=>setSelected(row)}>Review</button>}</td>}</tr>)}{!(tab==='queue'?samples:history).length&&<tr><td colSpan="5" className="empty">No matching records found.</td></tr>}</tbody></table></div></section>
    {selected&&<div className="backdrop" onClick={()=>setSelected(null)}><section className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><p className="eyebrow">{selected.code} / {selected.test_name}</p><h2>{auth.user.role==='staff'?'Enter result':'Review result'}</h2>{auth.user.role==='staff'?<form onSubmit={e=>{e.preventDefault();act(()=>api(`/samples/${selected.id}/result`,auth.token,{method:'POST',body:JSON.stringify(resultForm)}),'Result submitted for review.');}}><label>Result value<input value={resultForm.value_text} onChange={e=>setResultForm({...resultForm,value_text:e.target.value})} required/></label><label>Unit (optional)<input value={resultForm.unit} onChange={e=>setResultForm({...resultForm,unit:e.target.value})}/></label><button>Submit for review</button></form>:<div><p className="resultBox">{selected.value_text} {selected.unit}</p><label>Review note (required for rejection)<textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} rows="3"/></label><div className="actions"><button className="secondary" onClick={()=>act(()=>api(`/samples/${selected.id}/review`,auth.token,{method:'POST',body:JSON.stringify({decision:'rejected',note:reviewNote})}),'Result returned to staff.')}>Reject</button><button onClick={()=>act(()=>api(`/samples/${selected.id}/review`,auth.token,{method:'POST',body:JSON.stringify({decision:'approved',note:reviewNote})}),'Result approved.')}>Approve result</button></div></div>}</section></div>}
    {auditSample&&<AuditTimeline sample={auditSample} token={auth.token} onClose={()=>setAuditSample(null)}/>}
    <footer>Portfolio demonstration · Fictional sample data only</footer></main></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
