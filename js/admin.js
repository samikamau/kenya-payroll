let adminDataCache = null;
let adminFilterEmail = '';
let adminFilterActivity = '';

async function openPlatformAdminPanel(){
  if(!state.isPlatformAdmin){ alert('Not authorized.'); return; }
  openPanel(`<div class="settings-panel"><div style="color:var(--muted);font-size:13px;">Loading platform stats…</div></div>`);

  const [{ data: stats, error: statsError }, { data: companiesList, error: companiesError }, { data: accountsList, error: accountsError }] = await Promise.all([
    sb.rpc('admin_get_platform_stats'),
    sb.rpc('admin_get_all_companies'),
    sb.rpc('admin_get_all_accounts')
  ]);

  if(statsError || companiesError || accountsError){
    openPanel(`<div class="settings-panel"><div style="color:#EF4444;font-size:13px;">Could not load platform data: ${esc((statsError||companiesError||accountsError).message)}</div></div>`);
    return;
  }

  adminDataCache = {
    stats: stats[0] || { total_accounts:0, total_companies:0, paid_companies:0, trial_companies:0 },
    companies: companiesList || [],
    accounts: accountsList || []
  };
  adminFilterEmail = '';
  adminFilterActivity = '';
  renderAdminPanelContent();
}

function clientActivityStatus(lastPayrollRun){
  if(!lastPayrollRun) return 'Dormant';
  const daysSince = (Date.now() - new Date(lastPayrollRun).getTime()) / (1000*60*60*24);
  if(daysSince <= 7) return 'Live';
  if(daysSince <= 45) return 'Active';
  return 'Dormant';
}
const ACTIVITY_COLORS = { Live:'#10B981', Active:'#2563EB', Dormant:'#EF4444' };

async function adminTogglePaidStatus(companyId, currentlyPaid, clientName){
  const verb = currentlyPaid ? 'move back to trial' : 'activate (mark as paid)';
  if(!confirm(`Are you sure you want to ${verb} "${clientName}"?`)) return;
  const { error } = await sb.rpc('admin_set_paid_status', { target_company_id: companyId, new_status: !currentlyPaid });
  if(error){ alert('Could not update: ' + error.message); return; }
  const c = adminDataCache.companies.find(x => x.id === companyId);
  if(c) c.is_paid = !currentlyPaid;
  // If this admin also happens to own/share this exact client locally, keep that view in sync too.
  const localClient = state.clients[companyId];
  if(localClient) localClient.isPaid = !currentlyPaid;
  renderAdminPanelContent();
}

function renderAdminPanelContent(){
  if(!adminDataCache) return;
  const { stats: s, companies, accounts } = adminDataCache;
  let filteredCompanies = adminFilterEmail ? companies.filter(c => c.owner_email === adminFilterEmail) : companies;
  if(adminFilterActivity) filteredCompanies = filteredCompanies.filter(c => clientActivityStatus(c.last_payroll_run) === adminFilterActivity);
  const uniqueEmails = [...new Set(accounts.map(a => a.email))].sort();
  const activityCounts = { Live:0, Active:0, Dormant:0 };
  companies.forEach(c => activityCounts[clientActivityStatus(c.last_payroll_run)]++);

  openPanel(`
    <div class="settings-panel">
      <h3 style="font-size:13px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-bottom:4px;">Platform Admin</h3>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:16px;">Visible only to you — enforced by the database, not just this screen.</div>

      <div class="summary" style="margin-bottom:12px;">
        <div class="card"><div class="label">Total accounts</div><div class="value">${s.total_accounts}</div></div>
        <div class="card"><div class="label">Total clients</div><div class="value">${s.total_companies}</div></div>
        <div class="card accent"><div class="label">Paid</div><div class="value">${s.paid_companies}</div></div>
        <div class="card deduct"><div class="label">On trial</div><div class="value">${s.trial_companies}</div></div>
      </div>

      <div class="summary" style="margin-bottom:20px;">
        <div class="card" style="border-color:${ACTIVITY_COLORS.Live};"><div class="label">Live (7 days)</div><div class="value" style="color:${ACTIVITY_COLORS.Live};">${activityCounts.Live}</div></div>
        <div class="card" style="border-color:${ACTIVITY_COLORS.Active};"><div class="label">Active (45 days)</div><div class="value" style="color:${ACTIVITY_COLORS.Active};">${activityCounts.Active}</div></div>
        <div class="card" style="border-color:${ACTIVITY_COLORS.Dormant};"><div class="label">Dormant</div><div class="value" style="color:${ACTIVITY_COLORS.Dormant};">${activityCounts.Dormant}</div></div>
      </div>

      <div style="display:flex;gap:10px;margin-bottom:14px;">
        <div class="settings-field" style="flex:1;">
          <label>Filter by accountant</label>
          <select onchange="adminFilterEmail=this.value; renderAdminPanelContent();" style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:7px 8px;font-size:12.5px;">
            <option value="">All accountants (${companies.length})</option>
            ${uniqueEmails.map(e => `<option value="${esc(e)}" ${adminFilterEmail===e?'selected':''}>${esc(e)} (${companies.filter(c=>c.owner_email===e).length})</option>`).join('')}
          </select>
        </div>
        <div class="settings-field" style="flex:1;">
          <label>Filter by activity</label>
          <select onchange="adminFilterActivity=this.value; renderAdminPanelContent();" style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:7px 8px;font-size:12.5px;">
            <option value="">All (${companies.length})</option>
            <option value="Live" ${adminFilterActivity==='Live'?'selected':''}>Live (${activityCounts.Live})</option>
            <option value="Active" ${adminFilterActivity==='Active'?'selected':''}>Active (${activityCounts.Active})</option>
            <option value="Dormant" ${adminFilterActivity==='Dormant'?'selected':''}>Dormant (${activityCounts.Dormant})</option>
          </select>
        </div>
      </div>

      <h3 style="font-size:12px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-bottom:8px;">Clients (${filteredCompanies.length})</h3>
      <div style="max-height:320px;overflow-y:auto;margin-bottom:20px;">
        ${filteredCompanies.length === 0 ? `<div style="color:var(--muted);font-size:12px;padding:10px 0;">No clients match this filter.</div>` : ''}
        ${filteredCompanies.map(c => {
          const status = clientActivityStatus(c.last_payroll_run);
          return `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:12px;">
            <div style="min-width:0;">
              <div style="color:var(--ink);display:flex;align-items:center;gap:6px;">
                ${esc(c.client_name) || 'Untitled Client'}
                <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${ACTIVITY_COLORS[status]}22;color:${ACTIVITY_COLORS[status]};">${status}</span>
              </div>
              <div style="color:var(--muted);font-size:11px;">${esc(c.owner_email)}${c.last_payroll_run ? ' · last payroll ' + new Date(c.last_payroll_run).toLocaleDateString('en-KE') : ' · no payroll run yet'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              <span style="color:${c.is_paid ? 'var(--gold)' : '#EF4444'};white-space:nowrap;">${c.is_paid ? 'Paid' : 'Trial'}</span>
              <button class="btn" style="font-size:10.5px;padding:4px 8px;" onclick="adminTogglePaidStatus('${c.id}', ${c.is_paid}, '${esc(c.client_name).replace(/'/g,"\\'")}')">${c.is_paid ? 'Move to trial' : 'Activate'}</button>
            </div>
          </div>
        `}).join('')}
      </div>

      <h3 style="font-size:12px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-bottom:8px;">All accounts (${accounts.length})</h3>
      <div style="max-height:220px;overflow-y:auto;">
        ${accounts.map(a => `
          <div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12px;">
            <span style="color:var(--ink);">${esc(a.email)}</span>
            <span style="color:var(--muted);font-size:11px;white-space:nowrap;">Joined ${new Date(a.created_at).toLocaleDateString('en-KE')}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `);
}

function renderSettings(){
  return `
    <div class="settings-panel">
      <h3 style="font-size:13px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;">Statutory rates in effect</h3>
      <div class="settings-grid">
        <div class="settings-field"><label>NSSF lower limit (Tier I)</label><div class="mono" style="padding:6px 8px;color:var(--ink);">${fmt(RATES.nssfLEL)}</div></div>
        <div class="settings-field"><label>NSSF upper limit (Tier II)</label><div class="mono" style="padding:6px 8px;color:var(--ink);">${fmt(RATES.nssfUEL)}</div></div>
        <div class="settings-field"><label>NSSF rate (each side)</label><div class="mono" style="padding:6px 8px;color:var(--ink);">${(RATES.nssfRate*100).toFixed(1)}%</div></div>
        <div class="settings-field"><label>SHIF rate</label><div class="mono" style="padding:6px 8px;color:var(--ink);">${(RATES.shifRate*100).toFixed(2)}%</div></div>
        <div class="settings-field"><label>SHIF minimum</label><div class="mono" style="padding:6px 8px;color:var(--ink);">${fmt(RATES.shifMin)}</div></div>
        <div class="settings-field"><label>Housing Levy rate (each side)</label><div class="mono" style="padding:6px 8px;color:var(--ink);">${(RATES.ahlRate*100).toFixed(1)}%</div></div>
        <div class="settings-field"><label>Personal relief (monthly)</label><div class="mono" style="padding:6px 8px;color:var(--ink);">${fmt(RATES.personalRelief)}</div></div>
        <div class="settings-field"><label>Insurance relief cap</label><div class="mono" style="padding:6px 8px;color:var(--ink);">${fmt(RATES.insuranceReliefCap)}</div></div>
        <div class="settings-field"><label>NITA levy (per employee)</label><div class="mono" style="padding:6px 8px;color:var(--ink);">${fmt(RATES.nitaLevy)}</div></div>
      </div>
      <div class="settings-note">
        Rates shown reflect NSSF Tier limits effective 1 Feb 2026, SHIF at 2.75% of gross (min KES 300), Housing Levy at 1.5%/1.5%, and PAYE bands of 10/25/30/32.5/35%. These are managed centrally by Edhafu Payroll and updated when KRA, NSSF, or SHA publish a new gazette notice — they can't be edited here, so every client on the platform always calculates against the same correct figures. If you believe a rate needs updating, contact us directly.
      </div>
    </div>
  `;
}
