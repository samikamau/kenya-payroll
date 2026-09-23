function renderMain(){
  const main = document.getElementById('mainArea');
  const c = state.clients[state.activeClient];
  if(!c){
    main.innerHTML = `
      <div class="empty-state" style="text-align:center;padding-top:80px;">
        <h2 style="font-family:'Fraunces',serif;font-weight:500;margin-bottom:10px;">Welcome to Edhafu Payroll</h2>
        <div style="color:var(--muted);font-size:13.5px;margin-bottom:22px;">Get started by adding your first company.</div>
        <button class="btn primary" style="font-size:14px;padding:12px 28px;" onclick="addClient()">Enter a Company</button>
      </div>
    `;
    return;
  }

  if(c.view === 'leave'){ renderLeaveView(main, c); return; }
  if(c.view === 'wages'){ renderWagesView(main, c); return; }
  if(c.view === 'dashboard'){ renderDashboardView(main, c); return; }

  const results = c.employees.map(e => ({ e, r: calcEmployee(e) }));
  const visibleResults = showAllEmployees ? results : results.slice(0, employeeRowLimit);
  const totals = results.reduce((acc, {r}) => {
    acc.gross += r.gross; acc.nssf += r.nssfEmployee; acc.shif += r.shif;
    acc.ahl += r.ahlEmployee; acc.paye += r.paye; acc.net += r.net;
    acc.employerCost += r.employerCost; acc.otherDeduct += r.otherDeduct;
    return acc;
  }, {gross:0,nssf:0,shif:0,ahl:0,paye:0,net:0,employerCost:0,otherDeduct:0});
  const totalDeductions = totals.nssf + totals.shif + totals.ahl + totals.paye + totals.otherDeduct;
  const activeEmployees = c.employees.filter(e => e.name && e.name.trim() && e.employmentStatus !== 'Terminated').length;

  // Composition bar: each segment as a % of gross pay, so the bar always sums to 100% of what
  // was actually earned this period - built entirely from real totals above, nothing hard-coded.
  const compSegments = totals.gross > 0 ? [
    { label:'Net pay',        value: totals.net,         color:'#10B981' },
    { label:'PAYE',           value: totals.paye,        color:'#EF4444' },
    { label:'NSSF',           value: totals.nssf,        color:'#2563EB' },
    { label:'SHIF',           value: totals.shif,        color:'#F59E0B' },
    { label:'Housing Levy',   value: totals.ahl,         color:'#123C36' },
    { label:'Other ded.',     value: totals.otherDeduct, color:'#64748B' }
  ].filter(s => s.value > 0) : [];

  main.innerHTML = `
    ${viewTabsHtml(c)}
    <div class="topbar">
      <input class="company-name-input" value="${esc(c.name)}" placeholder="Client name"
        oninput="updateClientField('name', this.value)" />
      <div class="period-row">
        <input type="month" value="${c.period || ''}" onchange="updateClientField('period', this.value)" />
      </div>
    </div>

    ${isPeriodClosed(c, c.period) ? `
      <div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);border-radius:6px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:#EF4444;">
        🔒 <strong>${c.period} is closed and permanently read-only.</strong> Nothing about this period can ever be changed again, by anyone. Switch to a different period above to make edits elsewhere.
      </div>
    ` : (getPeriodRecord(c, c.period) && getPeriodRecord(c, c.period).status === 'Processed' ? `
      <div style="background:rgba(176,141,87,0.1);border:1px solid rgba(176,141,87,0.35);border-radius:6px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:var(--gold);">
        🔒 <strong>${c.period} is processed and locked for editing.</strong> Click "Reopen payroll to amend" below if you need to make a correction.
      </div>
    ` : '')}

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
      ${c.isPaid
        ? `<span style="font-size:12px;background:rgba(176,141,87,0.15);color:var(--gold);padding:5px 10px;border-radius:4px;">Active (paid)</span>
           ${state.isPlatformAdmin ? `<button class="btn" style="font-size:11.5px;padding:5px 10px;" onclick="markClientUnpaid()">Move back to trial</button>` : ''}`
        : (c.trialPeriodUsed
            ? `<span style="font-size:12px;background:rgba(239,68,68,0.18);color:#EF4444;padding:5px 10px;border-radius:4px;">Free trial used (${c.trialPeriodUsed})${c.trialPeriodUsed !== (c.period||'') ? ' \u2014 new periods blocked' : ''}</span>
               ${state.isPlatformAdmin
                  ? `<button class="btn primary" style="font-size:11.5px;padding:5px 10px;" onclick="markClientPaid()">Mark as paid</button>`
                  : `<span style="font-size:11.5px;color:var(--muted);">Made payment? Contact Edhafu Payroll to activate this client.</span>`
               }`
            : `<span style="font-size:12.5px;font-weight:600;background:linear-gradient(135deg, #123C36, #1F5149);color:#FFFFFF;padding:6px 12px;border-radius:5px;box-shadow:0 0 0 1px rgba(18,60,54,0.35);">✨ Free trial: 1 payroll cycle available, try it now</span>`
          )
      }
      <button class="btn" style="margin-left:auto;font-size:11.5px;display:flex;align-items:center;gap:6px;" onclick="openCompanyProfilePanel()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Company profile
      </button>
    </div>


    <div class="summary">
      <div class="card"><div class="label">Active employees</div><div class="value">${activeEmployees}</div></div>
      <div class="card"><div class="label">Total gross pay</div><div class="value">${fmt(totals.gross)}</div></div>
      <div class="card accent"><div class="label">Total net pay</div><div class="value">${fmt(totals.net)}</div></div>
      <div class="card deduct"><div class="label">Total PAYE</div><div class="value">${fmt(totals.paye)}</div></div>
      <div class="card deduct"><div class="label">Total NSSF/SHIF</div><div class="value">${fmt(totals.nssf + totals.shif)}</div></div>
      <div class="card"><div class="label">Total employer cost</div><div class="value">${fmt(totals.employerCost)}</div></div>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:12.5px;color:var(--muted);">
      <span>Show</span>
      <input type="number" min="1" value="${employeeRowLimit}" onchange="setEmployeeRowLimit(this.value)" ${showAllEmployees ? 'disabled' : ''}
        style="width:56px;background:var(--panel);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:5px 6px;font-family:'JetBrains Mono',monospace;font-size:12.5px;" />
      <span>employees per page</span>
      ${c.employees.length > employeeRowLimit ? `
        <span style="color:var(--line);">&middot;</span>
        <a style="color:var(--gold);cursor:pointer;" onclick="toggleShowAllEmployees()">${showAllEmployees ? 'Show only ' + employeeRowLimit : 'Show all ' + c.employees.length}</a>
      ` : ''}
      <span style="margin-left:auto;">Showing ${visibleResults.length} of ${c.employees.length}</span>
    </div>

    <div class="table-wrap scroll-table">
      <table>
        <colgroup>
          ${EMP_TABLE_COLS.map(col => `<col id="col-${col.key}" style="width:${getColWidth(col.key)}px;">`).join('')}
        </colgroup>
        <thead>
          <tr>
            ${EMP_TABLE_COLS.map(col => `
              <th>${esc(col.label)}${col.resizable ? `<span class="col-resize-handle" onmousedown="startColResize(event,'${col.key}')"></span>` : ''}</th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${visibleResults.map(({e,r}) => `
            <tr onclick="openDrawer('${e.id}')">
              <td class="row-del" onclick="event.stopPropagation(); deleteEmployeeRow('${e.id}')">&times;</td>
              <td class="name-cell" onclick="event.stopPropagation()">
                <input value="${esc(e.name)}" placeholder="Name" onchange="updateEmployeeField('${e.id}','name',this.value)" />
              </td>
              <td onclick="event.stopPropagation()"><input class="mono" type="number" value="${e.basic||''}" placeholder="0" ${e.name&&e.name.trim()?'':'disabled title="Enter the employee\'s name first"'} onchange="updateEmployeeField('${e.id}','basic',this.value)" /></td>
              <td onclick="event.stopPropagation()"><input class="mono" type="number" value="${e.allowances||''}" placeholder="0" ${e.name&&e.name.trim()?'':'disabled title="Enter the employee\'s name first"'} onchange="updateEmployeeField('${e.id}','allowances',this.value)" /></td>
              <td onclick="event.stopPropagation()"><input class="mono" type="number" value="${e.overtimePay||''}" placeholder="0" ${e.name&&e.name.trim()?'':'disabled title="Enter the employee\'s name first"'} onchange="updateEmployeeField('${e.id}','overtimePay',this.value)" /></td>
              <td onclick="event.stopPropagation()"><input class="mono" type="number" value="${e.pension||''}" placeholder="0" ${e.name&&e.name.trim()?'':'disabled title="Enter the employee\'s name first"'} onchange="updateEmployeeField('${e.id}','pension',this.value)" /></td>
              <td onclick="event.stopPropagation()"><input class="mono" type="number" value="${e.insurance||''}" placeholder="0" ${e.name&&e.name.trim()?'':'disabled title="Enter the employee\'s name first"'} onchange="updateEmployeeField('${e.id}','insurance',this.value)" /></td>
              <td class="num" style="color:var(--muted);" title="Manage in the deductions panel — click the row">${fmt(r.otherDeduct)}</td>
              <td class="num">${fmt(r.nssfEmployee)}</td>
              <td class="num">${fmt(r.shif)}</td>
              <td class="num">${fmt(r.ahlEmployee)}</td>
              <td class="num">${fmt(r.paye)}</td>
              <td class="num net">${fmt(r.net)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button class="add-row-btn" onclick="addEmployeeRow()">+ Add employee</button>
    </div>

    ${(() => {
      const periodRecord = c.period ? getPeriodRecord(c, c.period) : null;
      const status = periodRecord ? periodRecord.status : null;
      if(status === 'Closed'){
        return `
          <div class="actions">
            <span style="font-size:12.5px;background:rgba(239,68,68,0.18);color:#EF4444;padding:8px 14px;border-radius:5px;font-weight:600;">
              🔒 ${c.period} is CLOSED — permanently locked. Closed by ${esc(periodRecord.closedBy)} on ${periodRecord.closedAt ? new Date(periodRecord.closedAt).toLocaleDateString('en-KE') : ''}.
            </span>
          </div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:-12px;margin-bottom:20px;">Switch to a different pay period above to make changes. This period's figures cannot be edited, reopened, or deleted by anyone, through any part of this app.</div>
        `;
      }
      if(status === 'Processed'){
        return `
          <div class="actions">
            <span style="font-size:12.5px;background:rgba(176,141,87,0.15);color:var(--gold);padding:8px 14px;border-radius:5px;font-weight:600;">
              🔒 ${c.period} is Processed and locked for editing.
            </span>
            <button class="btn" onclick="reopenPeriod()">Reopen payroll to amend</button>
            <button class="btn" style="border-color:#EF4444;color:#EF4444;" onclick="closePeriod()">Close ${c.period} permanently</button>
          </div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:-12px;margin-bottom:20px;">Editing is locked until reopened — this is logged. Closing is a separate, irreversible step for once you're certain this period is final.</div>
        `;
      }
      if(status === 'Reopened'){
        return `
          <div class="actions">
            <span style="font-size:12.5px;background:rgba(245,158,11,0.18);color:#F59E0B;padding:8px 14px;border-radius:5px;font-weight:600;">
              ✎ ${c.period} is reopened for amendment.
            </span>
            <button class="btn primary" onclick="finalizePayrollRun(event)">Process ${c.period} again</button>
          </div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:-12px;margin-bottom:20px;">Make your corrections above, then process again to re-lock this period.</div>
        `;
      }
      return `
        <div class="actions">
          <button class="btn primary" onclick="finalizePayrollRun(event)">Finalize payroll for ${c.period || 'this period'}</button>
        </div>
      `;
    })()}

    <div class="actions">
      <button class="btn primary" onclick="exportCSV()">Export payroll register (CSV)</button>
      <button class="btn" onclick="exportPayrollRegisterPDF()">Export payroll register (PDF)</button>
      <button class="btn" onclick="exportKRA()">KRA P10A file</button>
      <button class="btn" onclick="exportNSSF(event)">NSSF return file</button>
      <button class="btn" onclick="exportSHA(event)">SHA/SHIF return file</button>
    </div>
    <div class="actions">
      <button class="btn" onclick="exportImportTemplate()">Download import template</button>
      <button class="btn" onclick="document.getElementById('csvFileInput').click()">Import employees (CSV)</button>
      <input type="file" id="csvFileInput" accept=".csv" style="display:none;" onchange="handleCSVImport(event)" />
      <button class="btn" onclick="downloadAllPayslipsZip(event)">Download all payslips (ZIP)</button>
      <button class="btn primary" onclick="emailAllPayslips(event)">Email all payslips</button>
    </div>
    <div class="settings-note" style="margin-top:-16px;margin-bottom:26px;max-width:640px;">
      These three exports match real KRA P10A, NSSF, and SHA sample templates column-for-column. Fill in KRA PIN, National ID, NSSF/SHA numbers, and payroll number per employee (click a row &rarr; Statutory identifiers) for a complete file, or bulk-load them with "Import employees (CSV)" using the template above. If any authority changes its template layout, bring me the new sample and I'll update the export to match.
    </div>
  `;
}
