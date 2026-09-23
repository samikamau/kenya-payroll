/* ---------------- Actions ---------------- */
async function handleLogoUpload(event){
  const file = event.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ alert('Please choose an image file.'); return; }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Resize down to a sane max width so we're not storing multi-MB phone photos in the database.
  // Aspect ratio is captured here and stored separately, so the PDF render never distorts the logo
  // regardless of what size the user picks later.
  const { resized, aspect } = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 320;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ resized: canvas.toDataURL('image/png'), aspect: img.height / img.width });
    };
    img.src = dataUrl;
  });

  const c = state.clients[state.activeClient];
  c.logoDataUrl = resized; c.logoAspect = aspect;
  await sb.from('companies').update({ logo_data_url: resized, logo_aspect: aspect }).eq('id', state.activeClient);
  render();
}

function removeLogo(){
  updateClientField('logoDataUrl', '');
  render();
}

async function addClient(){
  const { data: userData } = await sb.auth.getUser();
  if(!userData?.user?.id){
    alert('Could not confirm your login session. Try signing out and back in.');
    return;
  }
  if(!userData.user.email_confirmed_at){
    alert('Please confirm your email address before adding a client — check your inbox for the confirmation link we sent when you signed up. Contact us if you need it resent.');
    return;
  }
  openPanel(`
    <div class="settings-panel">
      <h3 style="font-size:14px;color:var(--gold);font-family:'Fraunces',serif;font-weight:600;margin-bottom:14px;">Add a company</h3>
      <form onsubmit="submitNewClient(event)">
        <div class="settings-field"><label>Company name *</label><input name="companyName" placeholder="e.g. Spero Enterprises" autofocus/></div>
        <div class="settings-grid" style="margin-top:12px;">
          <div class="settings-field"><label>Employer KRA PIN</label><input name="kraPin" placeholder="P0..." /></div>
          <div class="settings-field"><label>NSSF employer number</label><input name="nssfEmployerNo" /></div>
          <div class="settings-field"><label>SHA employer number</label><input name="shaEmployerNo" /></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:10px;">Only the company name is required — everything else can be filled in or edited later.</div>
        <button class="btn primary" type="submit" style="margin-top:14px;width:100%;">Save</button>
      </form>
    </div>
  `);
}

async function submitNewClient(evt){
  evt.preventDefault();
  const { data: userData } = await sb.auth.getUser();
  if(!userData?.user?.id){ alert('Could not confirm your login session. Try signing out and back in.'); return; }

  const name = evt.target.companyName.value;
  const cleanName = name.trim();
  if(!cleanName){ alert('A company name is required.'); return; }
  if(cleanName.toLowerCase() === 'untitled client'){ alert("Please use the company's actual name."); return; }

  const kraPin = evt.target.kraPin.value.trim();
  const nssfEmployerNo = evt.target.nssfEmployerNo.value.trim();
  const shaEmployerNo = evt.target.shaEmployerNo.value.trim();

  // Generate the ID ourselves and insert plainly, without asking Supabase to hand the row
  // back in the same request. Chaining .select() after .insert() requires the SELECT policy
  // to succeed for a row that's a split second old, which can behave unreliably - this avoids
  // that dependency entirely, since we already know every value we just inserted.
  const newId = crypto.randomUUID();
  const { error } = await sb.from('companies').insert({
    id: newId, user_id: userData.user.id, name: cleanName,
    kra_pin: kraPin, nssf_employer_no: nssfEmployerNo, sha_employer_no: shaEmployerNo
  });
  if(error){ alert(error.message); return; }
  state.clients[newId] = { name: cleanName, period:'', kraPin, nssfEmployerNo, shaEmployerNo, ownerId: userData.user.id,
                            brandColor:'#123C36', logoDataUrl:'', logoSize:60, logoAspect:0.75,
                            isPaid:false, trialPeriodUsed:null, subscribedTier:null, phone:'', view:'dashboard', leaveRequests:[], auditLog:[], payrollPeriods:[], employees: [] };
  state.activeClient = newId;
  closePanel();
  render();
}
let _pendingDeleteCode = null;
let _pendingDeleteExpiry = 0;

async function deleteClient(id, ev){
  if(ev) ev.stopPropagation();
  const client = state.clients[id];
  if(!client) return;

  const clientName = client.name || 'this client';
  if(!confirm(`Delete "${clientName}" and all its payroll data? This cannot be undone.`)) return;

  const { data: userData } = await sb.auth.getUser();
  const email = userData?.user?.email;
  if(!email){ alert('Could not confirm your account email. Please sign in again and retry.'); return; }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  _pendingDeleteCode = code;
  _pendingDeleteExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

  try{
    const { error } = await sb.functions.invoke('send-verification-code', {
      body: { to: email, code, purpose: `deleting the client "${clientName}"` }
    });
    if(error) throw error;
  } catch(err){
    let detail = err.message || 'the verification email function may not be set up yet.';
    try{
      if(err.context && typeof err.context.json === 'function'){
        const body = await err.context.json();
        if(body && body.error) detail = body.error;
      }
    }catch(_){ /* fall back to the generic message above if the body can't be read */ }
    alert('Could not send a verification code: ' + detail);
    return;
  }

  const entered = prompt(`For your security, a 6-digit verification code was just sent to ${email}.\n\nEnter it below to permanently delete "${clientName}":`);
  if(entered === null) return; // user cancelled — nothing deleted
  if(Date.now() > _pendingDeleteExpiry){
    alert('That code has expired. Click delete again to get a new one.');
    return;
  }
  if(entered.trim() !== _pendingDeleteCode){
    alert('Incorrect code. The client was not deleted.');
    return;
  }
  _pendingDeleteCode = null;

  const { error } = await sb.from('companies').delete().eq('id', id);
  if(error){ alert(error.message); return; }
  delete state.clients[id];
  const names = Object.keys(state.clients);
  if(names.length === 0){
    await addClient();
  } else if(state.activeClient === id){
    state.activeClient = names[0];
  }
  render();
}
async function selectClient(id){
  state.activeClient = id;
  render();
  const c = state.clients[id];
  if(c) await ensureViewDataLoaded(c.view, id);
  render();
}

async function logAudit(action, details){
  try{
    const { data: userData } = await sb.auth.getUser();
    const newId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const { error } = await sb.from('audit_log').insert({
      id: newId, company_id: state.activeClient, user_email: userData?.user?.email || '', action, details: details || '', created_at: createdAt
    });
    if(error){ console.error('audit log failed', error); return; }
    const c = state.clients[state.activeClient];
    if(c && c.auditLog) c.auditLog.unshift({ id: newId, userEmail: userData?.user?.email || '', action, details: details || '', createdAt });
  } catch(e){ console.error('audit log failed', e); }
}

/* ---------------- Payroll period locking ----------------
   Once a period is Closed, it becomes permanently read-only — enforced first here for a clean
   UX (the person gets a clear message instead of a silent failed save), and enforced again,
   unconditionally, at the database level via RLS (migration_010) so the lock holds even if
   someone bypasses the app entirely and talks to Supabase directly.
------------------------------------------------------------------------------------------- */
function getPeriodRecord(c, period){
  return (c.payrollPeriods||[]).find(pp => pp.period === period);
}
function isPeriodClosed(c, period){
  const p = getPeriodRecord(c, period);
  return !!(p && p.status === 'Closed');
}
function isPeriodLocked(c, period){
  // Both 'Processed' and 'Closed' block direct editing. The difference: Processed can be
  // reopened (an explicit, logged action); Closed cannot, ever, per the two documents'
  // resolved rule - this is the only place that distinction is decided.
  const p = getPeriodRecord(c, period);
  return !!(p && (p.status === 'Processed' || p.status === 'Closed'));
}
function blockIfClosed(c){
  const p = getPeriodRecord(c, c.period);
  if(p && p.status === 'Closed'){
    alert(`${c.period} is closed and permanently locked. Switch to a different (open) pay period to make changes — closed periods cannot be amended, by anyone, through any part of this app.`);
    return true;
  }
  if(p && p.status === 'Processed'){
    alert(`${c.period} has been processed and is locked for editing. Click "Reopen payroll" below to amend it before re-processing, or switch to a different period.`);
    return true;
  }
  return false;
}

async function reopenPeriod(){
  const c = state.clients[state.activeClient];
  const record = getPeriodRecord(c, c.period);
  if(!record || record.status !== 'Processed'){
    alert('Only a Processed (not yet closed) period can be reopened.');
    return;
  }
  if(!confirm(`Reopen ${c.period} for editing? This is logged. You'll need to process it again once you're done amending it.`)) return;
  const { error } = await sb.from('payroll_periods').update({ status: 'Reopened' }).eq('id', record.id);
  if(error){ alert('Could not reopen: ' + error.message); return; }
  record.status = 'Reopened';
  logAudit('Payroll period reopened', `${c.period} — reopened for amendment`);
  render();
}

/* ---------------- Free trial gating ----------------
   Each client gets one free payroll cycle (one pay period). The first time any
   payslip/export action is used for a client, that period is locked in as their
   trial period. Trying to run a DIFFERENT period afterward is blocked until the
   client is marked as paid. This is a manual gate for now — no automated billing
   is wired up yet, so "mark as paid" is a judgment call you make after collecting
   payment outside the app (M-Pesa, bank transfer, etc.).
------------------------------------------------------------------------------ */
function hasRealClientName(c){
  const name = (c.name || '').trim().toLowerCase();
  return name.length > 0 && name !== 'untitled client';
}
/* ---------------- Pricing tiers - based on active employee count per account, not per client.
   The free trial is separate from this: it gives FULL access (any tier, any feature) for
   exactly one payroll cycle. Only after that cycle is used does the tier system take over —
   small accounts (<=3 employees) can continue indefinitely on the free tier with its real
   limits (no branding, no payslip email); anything larger must be marked paid. ------------- */
const PRICING_TIERS = [
  { name:'Free', min:0, max:3, price:0, note:'Full features' },
  { name:'Starter', min:4, max:15, price:999, note:'Full features' },
  { name:'Enterprise', min:16, max:Infinity, price:null, note:'KES 1,000 + KES 50 per additional employee, full features' }
];
function getTierForCount(count){
  return PRICING_TIERS.find(t => count >= t.min && count <= t.max) || PRICING_TIERS[PRICING_TIERS.length-1];
}
function requireAccess(c){
  if(!hasRealClientName(c)){
    alert('Give this client a real name (top of the page) before running payroll for them — "Untitled Client" can\'t be used for anything beyond initial setup.');
    return false;
  }
  if(c.isPaid) return true;
  const currentPeriod = c.period || '(no period set)';
  if(!c.trialPeriodUsed){
    c.trialPeriodUsed = currentPeriod;
    sb.from('companies').update({ trial_period_used: currentPeriod }).eq('id', state.activeClient);
    return true; // trial: full access, any tier, for this one cycle
  }
  if(c.trialPeriodUsed === currentPeriod) return true; // still within that same trial cycle

  // Trial is used up and this account isn't paid - every tier is now a paid tier, so this
  // blocks regardless of size, same rule for a 2-employee account as a 200-employee one.
  const activeCount = c.employees.filter(e => e.name && e.name.trim() && e.employmentStatus !== 'Terminated').length;
  const tier = getTierForCount(activeCount);
  alert(`This client's free payroll cycle (${c.trialPeriodUsed}) has already been used. With ${activeCount} employee${activeCount===1?'':'s'}, this account needs the ${tier.name} plan (${tier.price ? 'KES '+fmt(tier.price)+'/month' : tier.note}) to continue. See the Pricing tab, then contact us to activate — or mark this client as paid if it's already arranged.`);
  return false;
}
async function markClientPaid(){
  const c = state.clients[state.activeClient];
  if(!c) return;
  if(!state.isPlatformAdmin){
    alert('Only the Edhafu Payroll admin can activate paid status for a client. If you\'ve made payment, contact us and we\'ll activate it for you.');
    return;
  }
  if(!confirm(`Mark "${c.name || 'this client'}" as paid? This unlocks unlimited payroll cycles for them.`)) return;
  const { error } = await sb.from('companies').update({ is_paid: true }).eq('id', state.activeClient);
  if(error){ alert('Could not update paid status: ' + error.message); return; }
  c.isPaid = true;
  logAudit('Client marked as paid', c.name || '');
  render();
}
async function markClientUnpaid(){
  const c = state.clients[state.activeClient];
  if(!c) return;
  if(!state.isPlatformAdmin){
    alert('Only the Edhafu Payroll admin can change paid status for a client.');
    return;
  }
  if(!confirm(`Move "${c.name || 'this client'}" back to trial status? They'll be restricted again once their trial period is used.`)) return;
  const { error } = await sb.from('companies').update({ is_paid: false }).eq('id', state.activeClient);
  if(error){ alert('Could not update paid status: ' + error.message); return; }
  c.isPaid = false;
  logAudit('Client moved back to trial', c.name || '');
  render();
}
async function updateClientField(field, value){
  state.clients[state.activeClient][field] = value;
  const { error } = await sb.from('companies').update({ [CLIENT_DB_FIELD[field]]: value }).eq('id', state.activeClient);
  if(error) console.error(error);
}
async function addEmployeeRow(){
  const c = state.clients[state.activeClient];
  if(!hasRealClientName(c)){
    alert('Give this client a real name (top of the page) before adding employees.');
    return;
  }
  if(blockIfClosed(c)) return;
  const newId = crypto.randomUUID();
  const { error } = await sb.from('employees').insert({ id: newId, company_id: state.activeClient });
  if(error){ alert(error.message); return; }
  state.clients[state.activeClient].employees.push({
    id: newId, name:'', pin:'', idNumber:'', nssfNo:'', shaNo:'',
    basic:0, allowances:0, pension:0, insurance:0, deductionItems:[],
    payrollNumber:'', phone:'', email:'', residentialStatus:'Resident', employeeType:'Primary Employee',
    disability:'No', exemptionCertNo:'', benefitDescription:'Benefit not given', benefitAmount:0, identityType:'National ID',
    department:'', employmentStatus:'Active', annualLeaveEntitlement:21, overtimePay:0, bonusItems:[]
  });
  showAllEmployees = true; // so the newly added row is immediately visible, not hidden past the current page limit
  render();
  logAudit('Employee added', `New employee row created`);
}
async function deleteEmployeeRow(empId){
  const c = state.clients[state.activeClient];
  if(blockIfClosed(c)) return;
  const emp = c.employees.find(e => e.id === empId);
  const empName = emp ? (emp.name || 'Unnamed employee') : 'Unknown';
  const { error } = await sb.from('employees').delete().eq('id', empId);
  if(error){ alert(error.message); return; }
  c.employees = c.employees.filter(e => e.id !== empId);
  logAudit('Employee removed', empName);
  if(c.employees.length === 0){ await addEmployeeRow(); return; }
  render();
}
async function updateEmployeeField(empId, field, value){
  const c = state.clients[state.activeClient];
  if(blockIfClosed(c)){ render(); return; }
  const emp = c.employees.find(e => e.id === empId);
  const oldValue = emp[field];
  emp[field] = TEXT_FIELDS.includes(field) ? value : (parseFloat(value) || 0);
  render();
  const { error } = await sb.from('employees').update({ [EMP_DB_FIELD[field]]: emp[field] }).eq('id', empId);
  if(error) console.error(error);
  if(field === 'basic' && oldValue !== emp[field]){
    logAudit('Salary changed', `${emp.name || 'Unnamed employee'}: ${fmt(oldValue)} -> ${fmt(emp[field])}`);
  }
}

const _deductionSaveTimers = {};
async function saveDeductionItems(empId, items){
  const { error } = await sb.from('employees').update({ deduction_items: items }).eq('id', empId);
  if(error) console.error(error);
}
function saveDeductionItemsDebounced(empId, items){
  clearTimeout(_deductionSaveTimers[empId]);
  _deductionSaveTimers[empId] = setTimeout(() => saveDeductionItems(empId, items), 500);
}
function addDeductionItem(empId){
  const c = state.clients[state.activeClient];
  if(blockIfClosed(c)) return;
  const emp = c.employees.find(e => e.id === empId);
  if(!emp.deductionItems) emp.deductionItems = [];
  emp.deductionItems.push({ type: DEDUCTION_TYPES[0], description:'', amount: 0, recurring: true });
  saveDeductionItems(empId, emp.deductionItems);
  openDrawer(empId);
}
function refreshDrawerTotals(empId){
  const c = state.clients[state.activeClient];
  const emp = c.employees.find(e => e.id === empId);
  if(!emp) return;
  const r = calcEmployee(emp);
  const totalEl = document.getElementById('drawerOtherDeductTotal');
  if(totalEl) totalEl.textContent = fmt(r.otherDeduct);
  const bonusEl = document.getElementById('drawerBonusTotal');
  if(bonusEl) bonusEl.textContent = fmt(r.bonusPay);
  const netEl = document.getElementById('drawerNetPay');
  if(netEl) netEl.textContent = 'KES ' + fmt(r.net);
}
function updateDeductionItem(empId, idx, field, value){
  const c = state.clients[state.activeClient];
  if(blockIfClosed(c)){ openDrawer(empId); return; }
  const emp = c.employees.find(e => e.id === empId);
  emp.deductionItems[idx][field] = (field === 'amount') ? (parseFloat(value)||0) : (field === 'recurring' ? value : value);
  if(field === 'amount'){
    saveDeductionItemsDebounced(empId, emp.deductionItems);
  } else {
    saveDeductionItems(empId, emp.deductionItems);
  }
  render(); // safe: only touches the main table/rail, never the open drawer, so focus is never lost
  if(field === 'type' || field === 'recurring'){
    openDrawer(empId); // not continuous typing, a full refresh here is fine
  } else {
    refreshDrawerTotals(empId); // patches just the total + net pay figures live, without rebuilding inputs mid-keystroke
  }
}
function removeDeductionItem(empId, idx){
  const c = state.clients[state.activeClient];
  if(blockIfClosed(c)) return;
  const emp = c.employees.find(e => e.id === empId);
  emp.deductionItems.splice(idx, 1);
  saveDeductionItems(empId, emp.deductionItems);
  render();
  openDrawer(empId);
}

/* ---------------- One-off pay items (bonus, commission, etc.) - mirrors deduction items above ---------------- */
const _bonusSaveTimers = {};
async function saveBonusItems(empId, items){
  const { error } = await sb.from('employees').update({ bonus_items: items }).eq('id', empId);
  if(error) console.error(error);
}
function saveBonusItemsDebounced(empId, items){
  clearTimeout(_bonusSaveTimers[empId]);
  _bonusSaveTimers[empId] = setTimeout(() => saveBonusItems(empId, items), 500);
}
function addBonusItem(empId){
  const c = state.clients[state.activeClient];
  if(blockIfClosed(c)) return;
  const emp = c.employees.find(e => e.id === empId);
  if(!emp.bonusItems) emp.bonusItems = [];
  emp.bonusItems.push({ type: BONUS_TYPES[0], description:'', amount: 0, recurring: false }); // one-off pay defaults to NOT recurring — the common case
  saveBonusItems(empId, emp.bonusItems);
  openDrawer(empId);
}
function updateBonusItem(empId, idx, field, value){
  const c = state.clients[state.activeClient];
  if(blockIfClosed(c)){ openDrawer(empId); return; }
  const emp = c.employees.find(e => e.id === empId);
  emp.bonusItems[idx][field] = (field === 'amount') ? (parseFloat(value)||0) : value;
  if(field === 'amount'){
    saveBonusItemsDebounced(empId, emp.bonusItems);
  } else {
    saveBonusItems(empId, emp.bonusItems);
  }
  render();
  if(field === 'type' || field === 'recurring'){
    openDrawer(empId);
  } else {
    refreshDrawerTotals(empId);
  }
}
function removeBonusItem(empId, idx){
  const c = state.clients[state.activeClient];
  if(blockIfClosed(c)) return;
  const emp = c.employees.find(e => e.id === empId);
  emp.bonusItems.splice(idx, 1);
  saveBonusItems(empId, emp.bonusItems);
  render();
  openDrawer(empId);
}
