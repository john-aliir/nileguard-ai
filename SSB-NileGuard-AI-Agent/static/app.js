const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let transactions = [];
let latestAssessment = null;

function money(amount, currency='USD') {
  return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(Number(amount||0));
}
function riskClass(level='') {
  if (level === 'High risk') return 'risk-high';
  if (level === 'Review') return 'risk-review';
  if (level === 'Low risk') return 'risk-low';
  return 'risk-unavailable';
}
function riskPill(level) { return `<span class="risk-pill ${riskClass(level)}">${escapeHtml(level||'Unavailable')}</span>`; }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(message) {
  const el=$('#toast'); el.textContent=message; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2800);
}
function navigate(view) {
  $$('.view').forEach(v=>v.classList.toggle('active-view',v.id===`view-${view}`));
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const active=$(`.nav-item[data-view="${view}"]`);
  $('#pageCrumb').textContent=active ? active.textContent.trim().replace(/\s+\d+$/,'') : view;
  $('#sidebar').classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
$$('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));
$('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.add('open'));
$('#closeSidebar').addEventListener('click',()=>$('#sidebar').classList.remove('open'));
$('#topAlerts').addEventListener('click',()=>navigate('alerts'));
$('#dismissBanner').addEventListener('click',()=>$('#demoBanner').remove());

function transactionRow(tx, full=false) {
  return `<tr>
    <td><span class="tx-id">${escapeHtml(tx.id||'TXN-NEW')}</span><span class="tx-sub">${escapeHtml(tx.account||'Test account')}</span></td>
    ${full?`<td>${escapeHtml(tx.account||'—')}</td>`:''}
    <td><span class="type-pill">${escapeHtml(tx.type)}</span></td>
    <td><span class="amount">${money(tx.amount,tx.currency||'USD')}</span></td>
    ${full?`<td>${escapeHtml(tx.location||'—')}</td>`:''}
    <td>${riskPill(tx.risk_level)}</td>
    ${full?`<td><button class="row-link" data-transaction="${escapeHtml(tx.id)}">Analyze →</button></td>`:`<td><button class="row-link" data-transaction="${escapeHtml(tx.id)}">Review</button></td>`}
  </tr>`;
}
function renderTransactions() {
  $('#transactionRows').innerHTML=transactions.map(tx=>transactionRow(tx)).join('');
  $('#allTransactionRows').innerHTML=transactions.map(tx=>transactionRow(tx,true)).join('');
  $('#metricTotal').textContent=String(transactions.length).padStart(2,'0');
  $('#metricHigh').textContent=transactions.filter(t=>t.risk_level==='High risk').length;
  $('#metricReview').textContent=transactions.filter(t=>t.risk_level==='Review').length;
  const flagged=transactions.filter(t=>t.risk_level==='High risk'||t.risk_level==='Review');
  $('#alertQueueCount').textContent=String(flagged.length).padStart(2,'0');
  $('.alert-count').textContent=String(flagged.length).padStart(2,'0');
  $('#alertList').innerHTML=flagged.slice(0,4).map(alertItem).join('') || '<p class="tx-sub">No alerts in this sample set.</p>';
  $('#fullAlertList').innerHTML=flagged.map(tx=>`<article class="full-alert-card"><div class="alert-card-top">${riskPill(tx.risk_level)}<span class="tx-sub">${escapeHtml(tx.id)}</span></div><h3>${money(tx.amount)} ${escapeHtml(tx.type.toLowerCase().replace('_',' '))}</h3><p>${escapeHtml((tx.reasons||[]).join('; '))}</p><div class="alert-card-foot"><span class="tx-sub">${escapeHtml(tx.location)} · ${tx.hour}:00</span><button class="row-link" data-transaction="${escapeHtml(tx.id)}">Inspect transaction →</button></div></article>`).join('') || '<div class="panel">No alerts found in the sample feed.</div>';
  $$('[data-transaction]').forEach(btn=>btn.addEventListener('click',()=>loadTransaction(btn.dataset.transaction)));
}
function alertItem(tx) {
  const high=tx.risk_level==='High risk';
  return `<div class="alert-item"><div class="alert-mark ${high?'high':'review'}">${high?'⚑':'◷'}</div><div class="alert-copy"><strong>${escapeHtml(tx.id)} · ${money(tx.amount)}</strong><p>${escapeHtml((tx.reasons||[])[0]||'Review transaction context')}</p><div class="alert-meta"><span>${escapeHtml(tx.location)} · ${tx.hour}:00</span><button data-transaction="${escapeHtml(tx.id)}">Inspect →</button></div></div></div>`;
}
function loadTransaction(id) {
  const tx=transactions.find(t=>t.id===id); if(!tx)return;
  const form=$('#analyzeForm');
  ['amount','balance','type','hour','location','device_change'].forEach(k=>{if(form.elements[k] && tx[k]!==undefined)form.elements[k].value=tx[k]});
  navigate('analyze');
  if(tx.risk_score!==undefined){latestAssessment=tx; renderResult(tx);}
}
async function fetchStatus() {
  try {
    const s=await fetch('/api/status').then(r=>r.json());
    $('#sidebarModelLabel').textContent=s.label; $('#sidebarModelDetail').textContent=s.detail;
    $('#metricModel').textContent=s.mode==='connected'?'Connected':'Demo';
    $('#metricModelFoot').textContent=s.mode==='connected'?'Model artifact loaded':'Illustrative rules active';
    if(s.mode==='connected') { $('#demoBanner').style.display='none'; $('.pulse').style.background='#24b48a'; }
  } catch(e) { $('#sidebarModelDetail').textContent='Backend unavailable'; }
}
async function fetchTransactions() {
  try {
    transactions=await fetch('/api/transactions').then(r=>r.json());
    renderTransactions();
    if(transactions.every(t=>!t.is_demo)) { $('#demoBanner').style.display='none'; }
  } catch(e) { toast('Could not load transactions. Is the Flask server running?'); }
}
function renderResult(result) {
  $('#emptyResult').classList.add('hidden'); $('#analysisResult').classList.remove('hidden');
  if(result.error){$('#analysisResult').innerHTML=`<div class="result-body"><p>${escapeHtml(result.error)}</p></div>`;return;}
  const score=Number(result.risk_score||0);
  const recs=result.recommendations||[];
  const reasons=result.reasons||[];
  $('#analysisResult').innerHTML=`<div class="result-body">
    <div class="result-summary"><div class="score-ring"><span>${score}%</span></div><div class="score-copy">${riskPill(result.risk_level)}<h3>${escapeHtml(result.prediction)}</h3><p>${result.is_demo?'Illustrative demo score':'Score returned by loaded model'} · not proof of fraud</p></div></div>
    <div class="result-section"><h3>Signals to review</h3><ul class="reason-list">${reasons.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    <div class="result-section"><h3>Recommended next steps</h3><ul class="recommendation-list">${recs.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    <div class="result-footnote">${result.is_demo?'DEMO MODE: this result comes from illustrative rules and is not generated by your trained Colab model.':'Confirm model preprocessing and validate results before operational use.'} Use authorized bank procedures and human review.</div>
    <button class="secondary-btn" style="margin-top:14px" id="askAboutResult">Ask assistant about this result →</button></div>`;
  $('#askAboutResult').addEventListener('click',()=>{navigate('assistant');sendChat('Why was this transaction flagged?',result)});
}
$('#analyzeForm').addEventListener('reset',()=>setTimeout(()=>{ $('#analysisResult').classList.add('hidden');$('#emptyResult').classList.remove('hidden'); latestAssessment=null; },0));
$('#analyzeForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget; const btn=$('#analyzeButton'); btn.disabled=true;btn.textContent='Analyzing…';
  const data=Object.fromEntries(new FormData(form).entries());
  try {
    const response=await fetch('/api/predict',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||'Prediction failed');
    latestAssessment=result;renderResult(result);toast('Transaction analysis completed');
  } catch(err){toast(err.message||'Could not contact backend');}
  finally{btn.disabled=false;btn.innerHTML='Run risk analysis <span>→</span>';}
});
$('#transactionSearch').addEventListener('input',e=>{
  const q=e.target.value.toLowerCase();
  $('#allTransactionRows').innerHTML=transactions.filter(t=>`${t.id} ${t.type} ${t.account}`.toLowerCase().includes(q)).map(t=>transactionRow(t,true)).join('');
  $$('[data-transaction]').forEach(btn=>btn.addEventListener('click',()=>loadTransaction(btn.dataset.transaction)));
});

function addMessage(text, who) {
  const wrap=document.createElement('div');wrap.className=`message ${who==='user'?'user-message':'assistant-message'}`;
  const avatar=document.createElement('div');avatar.className='message-avatar';avatar.textContent=who==='user'?'You':'✧';
  const bubble=document.createElement('div');bubble.className='bubble';
  // Render as text to avoid interpreting chat content as HTML.
  bubble.textContent=text;
  wrap.append(avatar,bubble);$('#chatMessages').append(wrap);$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
}
async function sendChat(message, context=null) {
  if(!message.trim())return;
  addMessage(message,'user');$('#chatInput').value='';
  const wait='Thinking…'; addMessage(wait,'assistant');
  const last=$$('#chatMessages .assistant-message .bubble').slice(-1)[0];
  try {
    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,transaction:context||latestAssessment||{}})});
    const data=await r.json();last.textContent=data.reply||'I could not prepare an answer.';
  } catch(e) {last.textContent='I could not reach the backend. Make sure app.py is running in VS Code.';}
  $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
}
$('#chatForm').addEventListener('submit',e=>{e.preventDefault();sendChat($('#chatInput').value)});
$$('[data-question]').forEach(b=>b.addEventListener('click',()=>sendChat(b.dataset.question)));
fetchStatus();fetchTransactions();
