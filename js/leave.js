/* ---------------- Leave management ---------------- */
const LEAVE_TYPES = ['Annual Leave','Sick Leave','Maternity Leave','Paternity Leave','Compassionate Leave','Unpaid Leave','Other'];

async function ensureViewDataLoaded(view, companyId){
  if(view === 'leave' || view === 'dashboard'){
    await ensureLeaveRequestsLoaded(companyId);
  }
  if(view === 'wages' || view === 'dashboard'){
    await ensureWagesLoaded(companyId);
  }
}
async function switchView(view){
  const c = state.clients[state.activeClient];
  if(!c) return;
  c.view = view;
  render();
  await ensureViewDataLoaded(view, state.activeClient);
  render();
}

function daysBetween(startDate, endDate){
  const start = new Date(startDate), end = new Date(endDate);
  if(isNaN(start) || isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1; // inclusive of both start and end dates
}

function leaveSummaryForEmployee(c, empId){
  const requests = c.leaveRequests.filter(l => l.employeeId === empId);
  const taken = requests.filter(l => l.status === 'Approved').reduce((s,l) => s + Number(l.days||0), 0);
  const pending = requests.filter(l => l.status === 'Pending').reduce((s,l) => s + Number(l.days||0), 0);
  const emp = c.employees.find(e => e.id === empId);
  const entitlement = emp ? Number(emp.annualLeaveEntitlement ?? 21) : 21;
  return { entitlement, taken, pending, remaining: entitlement - taken };
}

async function submitLeaveRequest(evt){
  evt.preventDefault();
  const c = state.clients[state.activeClient];
  const form = evt.target;
  const employeeId = form.employeeId.value;
  const leaveType = form.leaveType.value;
  const startDate = form.startDate.value;
  const endDate = form.endDate.value;
  const notes = form.notes.value.trim();
  if(!employeeId || !startDate || !endDate){ alert('Pick an employee, start date, and end date.'); return; }
  const days = daysBetween(startDate, endDate);
  if(days <= 0){ alert('End date must be on or after the start date.'); return; }

  const newId = crypto.randomUUID();
  const { error } = await sb.from('leave_requests').insert({
    id: newId, company_id: state.activeClient, employee_id: employeeId, leave_type: leaveType,
    start_date: startDate, end_date: endDate, days, status: 'Pending', notes
  });
  if(error){ alert('Could not submit leave request: ' + error.message); return; }

  c.leaveRequests.unshift({ id: newId, employeeId, leaveType, startDate, endDate, days, status: 'Pending', notes });
  render();
}

async function decideLeaveRequest(requestId, newStatus){
  const c = state.clients[state.activeClient];
  const req = c.leaveRequests.find(l => l.id === requestId);
  if(!req) return;
  const { error } = await sb.from('leave_requests').update({ status: newStatus, decided_at: new Date().toISOString() }).eq('id', requestId);
  if(error){ alert('Could not update request: ' + error.message); return; }
  req.status = newStatus;
  const emp = c.employees.find(e => e.id === req.employeeId);
  logAudit(`Leave request ${newStatus}`, `${emp ? emp.name : 'Unknown'} — ${req.leaveType} (${req.days} days)`);
  render();
}

async function deleteLeaveRequest(requestId){
  if(!confirm('Delete this leave request? This cannot be undone.')) return;
  const c = state.clients[state.activeClient];
  const { error } = await sb.from('leave_requests').delete().eq('id', requestId);
  if(error){ alert('Could not delete: ' + error.message); return; }
  c.leaveRequests = c.leaveRequests.filter(l => l.id !== requestId);
  render();
}
