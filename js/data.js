/* ---------------- Data layer (Supabase) ---------------- */
async function fetchAllData(){
  const { data: companies, error } = await sb.from('companies').select('*').order('created_at');
  if(error){ alert('Could not load clients: ' + error.message); return; }
  state.clients = {};

  // Load every company concurrently instead of one-after-another - this is the single biggest
  // speed fix. With 5 clients, the old code did 20 sequential network round-trips before
  // rendering anything; this does them all in parallel instead. Leave requests and the audit
  // log are also deferred entirely until you actually open that tab/panel, since most logins
  // never touch them for most clients - payroll_periods stays eager since the payroll view
  // needs it immediately to show locked/processed status correctly on first paint.
  await Promise.all(companies.map(async (c) => {
    const [{ data: employees }, { data: payrollPeriods }] = await Promise.all([
      sb.from('employees').select('*').eq('company_id', c.id).order('created_at'),
      sb.from('payroll_periods').select('*').eq('company_id', c.id)
    ]);
    state.clients[c.id] = {
      name: c.name, period: c.period, kraPin: c.kra_pin, ownerId: c.user_id,
      nssfEmployerNo: c.nssf_employer_no, shaEmployerNo: c.sha_employer_no,
      brandColor: c.brand_color || '#123C36', logoDataUrl: c.logo_data_url || '',
      logoSize: c.logo_size || 60, logoAspect: c.logo_aspect || 0.75,
      isPaid: c.is_paid || false, trialPeriodUsed: c.trial_period_used || null, subscribedTier: c.subscribed_tier || null, phone: c.phone || '',
      view: 'dashboard',
      auditLog: [], auditLogLoaded: false,
      leaveRequests: [], leaveRequestsLoaded: false,
      wages: [], wagesLoaded: false,
      payrollPeriods: (payrollPeriods||[]).map(p => ({ id: p.id, period: p.period, status: p.status, employeeCount: p.employee_count, totalGross: p.total_gross, totalNet: p.total_net, totalPaye: p.total_paye, closedBy: p.closed_by, closedAt: p.closed_at })),
      employees: (employees||[]).map(e => ({
        id: e.id, name: e.name, pin: e.pin, idNumber: e.id_number, nssfNo: e.nssf_no, shaNo: e.sha_no,
        basic: e.basic, allowances: e.allowances, pension: e.pension, insurance: e.insurance, deductionItems: e.deduction_items || [],
        payrollNumber: e.payroll_number||'', phone: e.phone||'', email: e.email||'', residentialStatus: e.residential_status||'Resident',
        employeeType: e.employee_type||'Primary Employee', disability: e.disability||'No', exemptionCertNo: e.exemption_cert_no||'',
        benefitDescription: e.benefit_description||'Benefit not given', benefitAmount: e.benefit_amount||0, identityType: e.identity_type||'National ID',
        department: e.department||'', employmentStatus: e.employment_status||'Active',
        annualLeaveEntitlement: e.annual_leave_entitlement ?? 21, overtimePay: e.overtime_pay || 0,
        bonusItems: e.bonus_items || []
      }))
    };
  }));

  if(companies.length > 0){
    state.activeClient = companies[0].id;
  }
  // If zero companies, activeClient stays null - renderMain shows a clear "Enter a Company"
  // call-to-action instead of silently auto-creating one for them.
}

async function ensureLeaveRequestsLoaded(companyId){
  const c = state.clients[companyId];
  if(!c || c.leaveRequestsLoaded) return;
  const { data: leaveRequests } = await sb.from('leave_requests').select('*').eq('company_id', companyId).order('start_date', { ascending: false });
  c.leaveRequests = (leaveRequests||[]).map(l => ({
    id: l.id, employeeId: l.employee_id, leaveType: l.leave_type, startDate: l.start_date, endDate: l.end_date,
    days: l.days, status: l.status, notes: l.notes||''
  }));
  c.leaveRequestsLoaded = true;
}
async function ensureWagesLoaded(companyId){
  const c = state.clients[companyId];
  if(!c || c.wagesLoaded) return;
  const { data: wages } = await sb.from('wages').select('*').eq('company_id', companyId).order('wage_date', { ascending: false });
  c.wages = (wages||[]).map(w => ({
    id: w.id, date: w.wage_date, fullNames: w.full_names, idNumber: w.id_number,
    kraPin: w.kra_pin||'', amount: w.amount||0, paymentMethod: w.payment_method||'Cash', voucherNumber: w.voucher_number||'', paymentRefNo: w.payment_ref_no||''
  }));
  c.wagesLoaded = true;
}
async function ensureAuditLogLoaded(companyId){
  const c = state.clients[companyId];
  if(!c || c.auditLogLoaded) return;
  const { data: auditLog } = await sb.from('audit_log').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50);
  c.auditLog = (auditLog||[]).map(a => ({ id: a.id, userEmail: a.user_email, action: a.action, details: a.details, createdAt: a.created_at }));
  c.auditLogLoaded = true;
}
async function boot(){
  const { data: { session } } = await sb.auth.getSession();
  if(!session){
    document.getElementById('landingScreen').style.display = 'flex';
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appRoot').style.display = 'none';
    return;
  }
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appRoot').style.display = 'flex';
  document.getElementById('userBadge').textContent = session.user.email;
  state.currentUserId = session.user.id;
  state.currentUserEmail = session.user.email;
  state.currentUserCreatedAt = session.user.created_at;
  const { data: isAdmin } = await sb.rpc('is_platform_admin');
  state.isPlatformAdmin = isAdmin === true;
  document.getElementById('adminBtn').style.display = state.isPlatformAdmin ? 'block' : 'none';
  await fetchAllData();
  render();
  if(state.activeClient){
    const c = state.clients[state.activeClient];
    await ensureViewDataLoaded(c.view, state.activeClient);
    render();
  }
  if(!localStorage.getItem('hasSeenTour')){
    setTimeout(startTour, 400); // slight delay so the panel doesn't appear before the page has visibly settled
  }
}
