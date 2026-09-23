
let state = { clients: {}, activeClient: null, currentUserId: null };
let employeeRowLimit = parseInt(localStorage.getItem('employeeRowLimit')) || 5;

const EMP_TABLE_COLS = [
  { key:'del', label:'', width:22, resizable:false },
  { key:'name', label:'Employee', width:170, resizable:true },
  { key:'basic', label:'Basic', width:95, resizable:true },
  { key:'allowances', label:'Allowances', width:95, resizable:true },
  { key:'overtime', label:'Overtime', width:90, resizable:true },
  { key:'pension', label:'Pension', width:90, resizable:true },
  { key:'insurance', label:'Insurance', width:90, resizable:true },
  { key:'otherded', label:'Other ded.', width:90, resizable:true },
  { key:'nssf', label:'NSSF', width:80, resizable:true },
  { key:'shif', label:'SHIF', width:80, resizable:true },
  { key:'housing', label:'Housing', width:85, resizable:true },
  { key:'paye', label:'PAYE', width:85, resizable:true },
  { key:'netpay', label:'Net pay', width:100, resizable:true }
];
let employeeColWidths = {};
try{ employeeColWidths = JSON.parse(localStorage.getItem('employeeColWidths') || '{}'); }catch(e){ employeeColWidths = {}; }
function getColWidth(key){
  const col = EMP_TABLE_COLS.find(c => c.key === key);
  return employeeColWidths[key] || (col ? col.width : 90);
}
let _resizeState = null;
function startColResize(evt, key){
  evt.preventDefault();
  const th = evt.target.closest('th');
  _resizeState = { key, startX: evt.clientX, startWidth: th.offsetWidth };
  evt.target.classList.add('resizing');
  document.addEventListener('mousemove', handleColResize);
  document.addEventListener('mouseup', stopColResize);
}
function handleColResize(evt){
  if(!_resizeState) return;
  const delta = evt.clientX - _resizeState.startX;
  const newWidth = Math.max(45, _resizeState.startWidth + delta);
  const colEl = document.getElementById('col-' + _resizeState.key);
  if(colEl) colEl.style.width = newWidth + 'px';
}
function stopColResize(){
  if(!_resizeState) return;
  const colEl = document.getElementById('col-' + _resizeState.key);
  if(colEl){
    employeeColWidths[_resizeState.key] = parseInt(colEl.style.width);
    localStorage.setItem('employeeColWidths', JSON.stringify(employeeColWidths));
  }
  document.querySelectorAll('.col-resize-handle.resizing').forEach(el => el.classList.remove('resizing'));
  document.removeEventListener('mousemove', handleColResize);
  document.removeEventListener('mouseup', stopColResize);
  _resizeState = null;
}

let showAllEmployees = false;
function setEmployeeRowLimit(value){
  const n = parseInt(value);
  employeeRowLimit = (n && n > 0) ? n : 5;
  localStorage.setItem('employeeRowLimit', employeeRowLimit);
  showAllEmployees = false;
  render();
}
function toggleShowAllEmployees(){
  showAllEmployees = !showAllEmployees;
  render();
}
let authMode = 'signin'; // or 'signup'

function esc(str){
  // Escapes text before it's interpolated into HTML attributes or content - prevents a
  // client/employee name containing a stray quote or angle bracket from breaking out of
  // an attribute and injecting arbitrary HTML/JS (stored XSS).
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function fmt(n){
  n = Math.round(n||0);
  if(n === 0) return '-';
  return n.toLocaleString('en-KE');
}
const TEXT_FIELDS = ['name','pin','idNumber','nssfNo','shaNo','payrollNumber','phone','email',
                      'residentialStatus','employeeType','disability','exemptionCertNo',
                      'benefitDescription','identityType','department','employmentStatus'];
const EMP_DB_FIELD = { name:'name', pin:'pin', idNumber:'id_number', nssfNo:'nssf_no', shaNo:'sha_no',
                        basic:'basic', allowances:'allowances', pension:'pension', insurance:'insurance', deductionItems:'deduction_items',
                        payrollNumber:'payroll_number', phone:'phone', email:'email', residentialStatus:'residential_status',
                        employeeType:'employee_type', disability:'disability', exemptionCertNo:'exemption_cert_no',
                        benefitDescription:'benefit_description', benefitAmount:'benefit_amount', identityType:'identity_type',
                        department:'department', employmentStatus:'employment_status', annualLeaveEntitlement:'annual_leave_entitlement',
                        overtimePay:'overtime_pay', bonusItems:'bonus_items' };
const CLIENT_DB_FIELD = { name:'name', period:'period', kraPin:'kra_pin', nssfEmployerNo:'nssf_employer_no', shaEmployerNo:'sha_employer_no',
                           brandColor:'brand_color', logoDataUrl:'logo_data_url', logoSize:'logo_size', logoAspect:'logo_aspect',
                           isPaid:'is_paid', trialPeriodUsed:'trial_period_used', phone:'phone' };

function hexToRgb(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex||'').trim());
  if(!m) return [176,141,87]; // fallback gold
  return [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)];
}
