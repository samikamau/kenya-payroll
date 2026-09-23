/* ---------------- Render ---------------- */
function render(){
  renderRail();
  renderMain();
  updateScrollFabIcon();
  const addCompanyBtn = document.getElementById('addCompanyBtn');
  if(addCompanyBtn) addCompanyBtn.style.display = Object.keys(state.clients).length > 0 ? 'block' : 'none';
}
function renderRail(){
  const list = document.getElementById('clientList');
  const entries = Object.entries(state.clients);
  list.innerHTML = `
    <select onchange="selectClient(this.value)" style="width:100%;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:9px 10px;font-family:'Inter',sans-serif;font-size:13.5px;margin-bottom:8px;">
      ${entries.map(([id,c]) => `<option value="${id}" ${id===state.activeClient?'selected':''}>${esc(c.name) || 'Untitled Client'}${c.ownerId !== state.currentUserId ? ' (shared)' : ''}</option>`).join('')}
    </select>
    ${entries.length > 0 ? `<button class="rail-btn" style="color:#F3A9A0;" onclick="deleteClient(state.activeClient, event)">Delete this client</button>` : ''}
  `;
}

function viewTabsHtml(c){
  const tab = (key, label) => `<button onclick="switchView('${key}')" style="padding:10px 18px;background:none;border:none;border-bottom:2px solid ${c.view===key?'var(--gold)':'transparent'};color:${c.view===key?'var(--ink)':'var(--muted)'};font-family:'Inter',sans-serif;font-size:13px;font-weight:${c.view===key?'600':'400'};cursor:pointer;">${label}</button>`;
  return `
    <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--line);">
      ${tab('dashboard', 'Dashboard')}
      ${tab('payroll', 'Payroll')}
      ${tab('wages', 'Wages')}
      ${tab('leave', 'Leave Management')}
    </div>
  `;
}

let leaveFilter = { employeeId:'', status:'', type:'' };

function renderLeaveView(main, c){
  const summaries = c.employees.map(e => ({ e, s: leaveSummaryForEmployee(c, e.id) }));
  const totalEntitlement = summaries.reduce((s,x) => s + x.s.entitlement, 0);
  const totalTaken = summaries.reduce((s,x) => s + x.s.taken, 0);
  const totalRemaining = summaries.reduce((s,x) => s + x.s.remaining, 0);
  const pendingCount = c.leaveRequests.filter(l => l.status === 'Pending').length;
  const utilizationPct = totalEntitlement > 0 ? (totalTaken / totalEntitlement * 100) : 0;

  const filteredRequests = c.leaveRequests.filter(l => {
    if(leaveFilter.employeeId && l.employeeId !== leaveFilter.employeeId) return false;
    if(leaveFilter.status && l.status !== leaveFilter.status) return false;
    if(leaveFilter.type && l.leaveType !== leaveFilter.type) return false;
    return true;
  });

  main.innerHTML = `
    ${viewTabsHtml(c)}
    <div class="topbar">
      <h2 style="font-family:'Fraunces',serif;font-weight:500;font-size:24px;margin:0;">${esc(c.name) || 'Client'} — Leave Management</h2>
    </div>

    <div class="summary">
      <div class="card"><div class="label">Total entitlement (days)</div><div class="value">${fmt(totalEntitlement)}</div></div>
      <div class="card deduct"><div class="label">Total taken (approved)</div><div class="value">${fmt(totalTaken)}</div></div>
      <div class="card accent"><div class="label">Total remaining</div><div class="value">${fmt(totalRemaining)}</div></div>
      <div class="card"><div class="label">Pending requests</div><div class="value">${pendingCount}</div></div>
    </div>

    ${totalEntitlement > 0 ? `
    <div class="composition-wrap">
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">LEAVE UTILIZATION — ${utilizationPct.toFixed(1)}% of total entitlement used</div>
      <div class="composition-bar">
        <div style="width:${Math.min(utilizationPct,100).toFixed(2)}%;background:var(--gold);" title="Taken: ${fmt(totalTaken)} days (${utilizationPct.toFixed(1)}%)"></div>
        <div style="width:${Math.max(0,100-utilizationPct).toFixed(2)}%;background:var(--panel-2);" title="Remaining: ${fmt(totalRemaining)} days"></div>
      </div>
    </div>` : ''}

    <div class="table-wrap">
      <table>
        <thead><tr><th>Employee</th><th>Entitlement</th><th>Taken</th><th>Remaining</th><th>Pending</th></tr></thead>
        <tbody>
          ${summaries.map(({e,s}) => `
            <tr onclick="leaveFilter.employeeId = leaveFilter.employeeId === '${e.id}' ? '' : '${e.id}'; render();" style="cursor:pointer; ${leaveFilter.employeeId===e.id ? 'background:rgba(176,141,87,0.08);' : ''}">
              <td class="name-cell">${esc(e.name) || 'Unnamed'}</td>
              <td class="num">${fmt(s.entitlement)}</td>
              <td class="num">${fmt(s.taken)}</td>
              <td class="num" style="color:${s.remaining<0?'#EF4444':'var(--gold)'};">${fmt(s.remaining)}</td>
              <td class="num">${fmt(s.pending)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="settings-panel">
      <h3 style="font-size:13px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-bottom:12px;">New leave request</h3>
      <form onsubmit="submitLeaveRequest(event)">
        <div class="settings-grid">
          <div class="settings-field"><label>Employee</label>
            <select name="employeeId" required style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:6px 8px;font-size:12.5px;">
              <option value="">Select employee</option>
              ${c.employees.map(e => `<option value="${e.id}">${esc(e.name) || 'Unnamed'}</option>`).join('')}
            </select>
          </div>
          <div class="settings-field"><label>Leave type</label>
            <select name="leaveType" style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:6px 8px;font-size:12.5px;">
              ${LEAVE_TYPES.map(t => `<option>${t}</option>`).join('')}
            </select>
          </div>
          <div class="settings-field"><label>Start date</label><input type="date" name="startDate" required/></div>
          <div class="settings-field"><label>End date</label><input type="date" name="endDate" required/></div>
          <div class="settings-field" style="grid-column:1 / -1;"><label>Notes (optional)</label><input name="notes" placeholder="e.g. Family event"/></div>
        </div>
        <button class="btn primary" type="submit" style="margin-top:12px;">Submit request</button>
      </form>
    </div>

    <div class="table-wrap" style="margin-top:20px;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <select onchange="leaveFilter.status=this.value; render();" style="background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:6px 8px;font-size:12px;">
          <option value="">All statuses</option>
          <option ${leaveFilter.status==='Pending'?'selected':''}>Pending</option>
          <option ${leaveFilter.status==='Approved'?'selected':''}>Approved</option>
          <option ${leaveFilter.status==='Rejected'?'selected':''}>Rejected</option>
        </select>
        <select onchange="leaveFilter.type=this.value; render();" style="background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:6px 8px;font-size:12px;">
          <option value="">All leave types</option>
          ${LEAVE_TYPES.map(t => `<option ${leaveFilter.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
        ${leaveFilter.employeeId ? `<span style="font-size:12px;color:var(--muted);">Filtered to one employee &mdash; <a style="color:var(--gold);cursor:pointer;" onclick="leaveFilter.employeeId=''; render();">clear</a></span>` : ''}
      </div>
      <table>
        <thead><tr><th>Employee</th><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Status</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          ${filteredRequests.length === 0 ? `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px;">No leave requests match this filter.</td></tr>` : ''}
          ${filteredRequests.map(l => {
            const emp = c.employees.find(e => e.id === l.employeeId);
            const statusColor = l.status === 'Approved' ? 'var(--gold)' : l.status === 'Rejected' ? '#EF4444' : 'var(--muted)';
            return `
            <tr>
              <td class="name-cell">${esc(emp ? emp.name : 'Unknown')}</td>
              <td>${esc(l.leaveType)}</td>
              <td class="mono">${l.startDate}</td>
              <td class="mono">${l.endDate}</td>
              <td class="num">${fmt(l.days)}</td>
              <td style="color:${statusColor};font-weight:600;">${l.status}</td>
              <td style="color:var(--muted);font-size:12px;">${esc(l.notes)}</td>
              <td style="white-space:nowrap;">
                ${l.status === 'Pending' ? `
                  <span style="color:var(--gold);cursor:pointer;font-size:12px;margin-right:8px;" onclick="decideLeaveRequest('${l.id}','Approved')">Approve</span>
                  <span style="color:#EF4444;cursor:pointer;font-size:12px;margin-right:8px;" onclick="decideLeaveRequest('${l.id}','Rejected')">Reject</span>
                ` : ''}
                <span class="row-del" style="opacity:.6;" onclick="deleteLeaveRequest('${l.id}')">&times;</span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}
