/* ---------------- Dashboard - pulls together real Payroll, Leave, and Wages data for the
   active client. Everything shown is computed from data already loaded; nothing is invented
   or estimated. Set as the default view, per request. ------------------------------------- */
function svgDonutChart(segments, size){
  size = size || 148;
  const total = segments.reduce((s,seg) => s + seg.value, 0);
  const radius = size/2 - 16;
  const cx = size/2, cy = size/2;
  const circumference = 2 * Math.PI * radius;
  if(total <= 0){
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--line)" stroke-width="18"></circle>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="var(--muted)" font-size="11" font-family="Inter, sans-serif">No data</text>
    </svg>`;
  }
  let offset = 0;
  const arcs = segments.filter(s => s.value > 0).map(seg => {
    const fraction = seg.value / total;
    const dash = fraction * circumference;
    const circle = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="18"
      stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"><title>${seg.label}: ${fmt(seg.value)}</title></circle>`;
    offset += dash;
    return circle;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}</svg>`;
}
function donutLegend(segments){
  const total = segments.reduce((s,seg) => s + seg.value, 0);
  return segments.filter(s => s.value > 0).map(s => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;">
      <span class="composition-swatch" style="background:${s.color};flex-shrink:0;"></span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);" title="${esc(s.label)}">${esc(s.label)}</span>
      <span class="mono" style="flex-shrink:0;width:64px;text-align:right;color:var(--ink);">${fmt(s.value)}</span>
      <span class="mono" style="flex-shrink:0;width:44px;text-align:right;color:var(--muted);font-size:11px;">${total>0 ? (s.value/total*100).toFixed(1) : '0'}%</span>
    </div>
  `).join('');
}

function renderDashboardView(main, c){
  const results = c.employees.map(e => ({ e, r: calcEmployee(e) }));
  const activeEmployees = c.employees.filter(e => e.name && e.name.trim() && e.employmentStatus !== 'Terminated').length;
  const payrollTotals = results.reduce((acc,{r}) => {
    acc.gross += r.gross; acc.net += r.net; acc.paye += r.paye;
    acc.nssf += r.nssfEmployee; acc.shif += r.shif; acc.ahl += r.ahlEmployee; acc.other += r.otherDeduct;
    return acc;
  }, { gross:0, net:0, paye:0, nssf:0, shif:0, ahl:0, other:0 });

  const leaveSummaries = c.employees.map(e => leaveSummaryForEmployee(c, e.id));
  const totalLeaveEntitlement = leaveSummaries.reduce((s,x) => s + x.entitlement, 0);
  const totalLeaveTaken = leaveSummaries.reduce((s,x) => s + x.taken, 0);
  const pendingLeaveCount = c.leaveRequests.filter(l => l.status === 'Pending').length;
  const leaveUtilizationPct = totalLeaveEntitlement > 0 ? (totalLeaveTaken/totalLeaveEntitlement*100) : 0;

  const totalWages = c.wages.reduce((s,w) => s + (w.amount||0), 0);
  const wagesByMethod = PAYMENT_METHODS.map((m,i) => ({
    label: m, value: c.wages.filter(w => w.paymentMethod === m).reduce((s,w) => s + (w.amount||0), 0),
    color: ['#10B981','#2563EB','#F59E0B'][i] || '#64748B'
  }));

  const totalCompensation = payrollTotals.net + totalWages;

  // Insights - every line is directly derived from the numbers above, nothing estimated.
  const insights = [];
  if(activeEmployees > 0) insights.push(`${activeEmployees} active employee${activeEmployees===1?'':'s'} on payroll this period.`);
  if(pendingLeaveCount > 0) insights.push(`${pendingLeaveCount} leave request${pendingLeaveCount===1?'':'s'} awaiting your decision.`);
  if(totalLeaveEntitlement > 0) insights.push(`${leaveUtilizationPct.toFixed(0)}% of total annual leave entitlement has been used so far.`);
  if(c.wages.length > 0) insights.push(`${c.wages.length} wage entr${c.wages.length===1?'y':'ies'} logged, totaling ${fmt(totalWages)}.`);
  if(payrollTotals.paye > 0) insights.push(`Total PAYE due this period: ${fmt(payrollTotals.paye)}.`);
  const topMethod = wagesByMethod.filter(m=>m.value>0).sort((a,b)=>b.value-a.value)[0];
  if(topMethod) insights.push(`${topMethod.label} is the most-used payment method for wages, at ${fmt(topMethod.value)}.`);
  if(insights.length === 0) insights.push('No data yet — add employees, run payroll, or log a wage entry to see insights here.');

  main.innerHTML = `
    ${viewTabsHtml(c)}
    <div class="topbar">
      <h2 style="font-family:'Fraunces',serif;font-weight:500;font-size:26px;margin:0;">${esc(c.name) || 'Client'} — Dashboard</h2>
    </div>

    <div class="summary" style="margin-bottom:24px;">
      <div class="card"><div class="label">Active employees</div><div class="value">${activeEmployees}</div></div>
      <div class="card accent"><div class="label">Payroll net pay</div><div class="value">${fmt(payrollTotals.net)}</div></div>
      <div class="card"><div class="label">Total wages paid</div><div class="value">${fmt(totalWages)}</div></div>
      <div class="card accent"><div class="label">Total compensation</div><div class="value">${fmt(totalCompensation)}</div></div>
      <div class="card deduct"><div class="label">Pending leave requests</div><div class="value">${pendingLeaveCount}</div></div>
      <div class="card"><div class="label">Leave utilization</div><div class="value">${leaveUtilizationPct.toFixed(0)}%</div></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 440px));gap:16px;margin-bottom:24px;justify-content:center;">
      <div class="composition-wrap" style="margin-bottom:0;">
        <div style="font-size:11px;color:var(--muted);margin-bottom:12px;text-align:center;">PAYROLL COMPOSITION</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:18px;">
          ${svgDonutChart([
            { label:'Net pay', value: payrollTotals.net, color:'#10B981' },
            { label:'PAYE', value: payrollTotals.paye, color:'#EF4444' },
            { label:'NSSF', value: payrollTotals.nssf, color:'#2563EB' },
            { label:'SHIF', value: payrollTotals.shif, color:'#F59E0B' },
            { label:'Housing Levy', value: payrollTotals.ahl, color:'#123C36' },
            { label:'Other ded.', value: payrollTotals.other, color:'#64748B' }
          ])}
          <div style="flex:0 1 230px;min-width:0;">${donutLegend([
            { label:'Net pay', value: payrollTotals.net, color:'#10B981' },
            { label:'PAYE', value: payrollTotals.paye, color:'#EF4444' },
            { label:'NSSF', value: payrollTotals.nssf, color:'#2563EB' },
            { label:'SHIF', value: payrollTotals.shif, color:'#F59E0B' },
            { label:'Housing Levy', value: payrollTotals.ahl, color:'#123C36' },
            { label:'Other ded.', value: payrollTotals.other, color:'#64748B' }
          ])}</div>
        </div>
      </div>

      <div class="composition-wrap" style="margin-bottom:0;">
        <div style="font-size:11px;color:var(--muted);margin-bottom:12px;text-align:center;">WAGES BY PAYMENT METHOD</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:18px;">
          ${svgDonutChart(wagesByMethod)}
          <div style="flex:0 1 230px;min-width:0;">${donutLegend(wagesByMethod)}</div>
        </div>
      </div>

      <div class="composition-wrap" style="margin-bottom:0;">
        <div style="font-size:11px;color:var(--muted);margin-bottom:12px;text-align:center;">LEAVE STATUS BREAKDOWN</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:18px;">
          ${svgDonutChart([
            { label:'Approved', value: c.leaveRequests.filter(l=>l.status==='Approved').length, color:'#10B981' },
            { label:'Pending', value: c.leaveRequests.filter(l=>l.status==='Pending').length, color:'#F59E0B' },
            { label:'Rejected', value: c.leaveRequests.filter(l=>l.status==='Rejected').length, color:'#EF4444' }
          ])}
          <div style="flex:0 1 230px;min-width:0;">${donutLegend([
            { label:'Approved', value: c.leaveRequests.filter(l=>l.status==='Approved').length, color:'#10B981' },
            { label:'Pending', value: c.leaveRequests.filter(l=>l.status==='Pending').length, color:'#F59E0B' },
            { label:'Rejected', value: c.leaveRequests.filter(l=>l.status==='Rejected').length, color:'#EF4444' }
          ])}</div>
        </div>
      </div>
    </div>

    <div class="settings-panel">
      <h3 style="font-size:13px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-bottom:12px;">Insights</h3>
      ${insights.map(i => `<div style="font-size:13px;color:var(--ink);padding:6px 0;border-bottom:1px solid var(--line);">• ${esc(i)}</div>`).join('')}
    </div>
  `;
}
