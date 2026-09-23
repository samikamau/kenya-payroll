async function finalizePayrollRun(evt){
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  if(!c.period){ alert('Set a pay period first (top of the page) before finalizing.'); return; }
  if(blockIfClosed(c)) return;
  if(!confirm(`Finalize payroll for "${c.name || 'this client'}" — ${c.period}?\n\nThis permanently records each employee's pay for this period, which future dashboard features (trend charts, salary history) will be built on. Finalizing the same period again later just updates that period's record rather than duplicating it — safe to re-run if you correct something, right up until you close the period.`)) return;

  const btn = evt.target;
  const originalText = btn.textContent;
  btn.textContent = 'Finalizing...'; btn.disabled = true;

  const rows = c.employees.map(e => {
    const r = calcEmployee(e);
    return {
      company_id: state.activeClient,
      employee_id: e.id,
      period: c.period,
      employee_name: e.name || 'Unnamed',
      department: e.department || '',
      payroll_number: e.payrollNumber || '',
      basic: e.basic || 0,
      allowances: e.allowances || 0,
      overtime_pay: e.overtimePay || 0,
      bonus_pay: r.bonusPay,
      gross: r.gross,
      nssf_employee: r.nssfEmployee,
      nssf_employer: r.nssfEmployer,
      shif: r.shif,
      ahl_employee: r.ahlEmployee,
      ahl_employer: r.ahlEmployer,
      nita: r.nita,
      paye: r.paye,
      other_deductions: r.otherDeduct,
      net_pay: r.net,
      employer_cost: r.employerCost,
      finalized_at: new Date().toISOString()
    };
  });

  const { error } = await sb.from('payroll_runs').upsert(rows, { onConflict: 'employee_id,period' });
  if(error){ btn.textContent = originalText; btn.disabled = false; alert('Could not finalize: ' + error.message); return; }

  const periodTotals = rows.reduce((acc,r) => {
    acc.gross += r.gross; acc.net += r.net_pay; acc.paye += r.paye;
    return acc;
  }, { gross:0, net:0, paye:0 });

  const { error: periodError } = await sb.from('payroll_periods').upsert({
    company_id: state.activeClient, period: c.period, status: 'Processed',
    employee_count: rows.length, total_gross: periodTotals.gross, total_net: periodTotals.net, total_paye: periodTotals.paye
  }, { onConflict: 'company_id,period' });

  if(periodError){ btn.textContent = originalText; btn.disabled = false; alert('Payroll data was saved, but the period status could not be updated: ' + periodError.message); return; }

  // Fetch the id as a separate, plain query afterward - an upsert can't safely generate the id
  // client-side (an existing row must keep its original id on conflict), and a follow-up select
  // in its own request avoids the same-statement RETURNING+policy interaction entirely.
  const { data: periodRow } = await sb.from('payroll_periods').select('id').eq('company_id', state.activeClient).eq('period', c.period).single();

  btn.textContent = originalText; btn.disabled = false;

  const existing = getPeriodRecord(c, c.period);
  const rec = { id: periodRow?.id, period: c.period, status: 'Processed', employeeCount: rows.length,
                totalGross: periodTotals.gross, totalNet: periodTotals.net, totalPaye: periodTotals.paye,
                closedBy: '', closedAt: null };
  if(existing) Object.assign(existing, rec); else c.payrollPeriods.push(rec);

  // Roll-over: one-off pay/deduction items (not marked "Recurring") are now locked into this
  // period's history via the snapshot above - clear them from the live employee record so they
  // don't silently reappear next period. Recurring items are left untouched; that's what makes
  // next period a review-and-amend process instead of re-entering everything from scratch.
  let clearedCount = 0;
  for(const e of c.employees){
    const keptDeductions = (e.deductionItems||[]).filter(isRecurring);
    const keptBonuses = (e.bonusItems||[]).filter(isRecurring);
    const deductionsChanged = keptDeductions.length !== (e.deductionItems||[]).length;
    const bonusesChanged = keptBonuses.length !== (e.bonusItems||[]).length;
    if(deductionsChanged || bonusesChanged){
      clearedCount++;
      e.deductionItems = keptDeductions;
      e.bonusItems = keptBonuses;
      await sb.from('employees').update({ deduction_items: keptDeductions, bonus_items: keptBonuses }).eq('id', e.id);
    }
  }

  logAudit('Payroll finalized', `${c.period} — ${rows.length} employee record(s)${clearedCount ? `, one-off items cleared for ${clearedCount} employee(s)` : ''}`);
  render();
  alert(`Payroll finalized for ${c.period}. ${rows.length} employee record(s) saved to history.${clearedCount ? ` One-off pay/deductions cleared for ${clearedCount} employee(s) — recurring items carry forward automatically.` : ''} You can close this period once you're satisfied it's correct — closing is permanent.`);
}

async function closePeriod(){
  const c = state.clients[state.activeClient];
  if(!c.period){ return; }
  const record = getPeriodRecord(c, c.period);
  if(!record || record.status !== 'Processed'){
    alert('Finalize this period first — a period can only be closed after payroll has been finalized for it.');
    return;
  }
  const typed = prompt(`Closing ${c.period} is PERMANENT. Once closed, nothing about this period — salaries, deductions, payslips, totals — can ever be edited or deleted again through this app, by you or anyone else with access to this client.\n\nType the period exactly (${c.period}) to confirm:`);
  if(typed === null) return;
  if(typed.trim() !== c.period){
    alert('That did not match. Nothing was closed.');
    return;
  }
  const { data: userData } = await sb.auth.getUser();
  const closedBy = userData?.user?.email || '';
  const closedAt = new Date().toISOString();
  const { error } = await sb.from('payroll_periods').update({
    status: 'Closed', closed_by: closedBy, closed_at: closedAt
  }).eq('id', record.id);
  if(error){ alert('Could not close period: ' + error.message); return; }
  record.status = 'Closed'; record.closedBy = closedBy; record.closedAt = closedAt;
  logAudit('Payroll period closed', `${c.period} — permanently locked (${record.employeeCount} employees, net pay ${fmt(record.totalNet)})`);
  render();
  alert(`${c.period} is now closed and permanently read-only.`);
}

async function downloadAllPayslipsZip(evt){
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  if(c.employees.length === 0){ alert('No employees to generate payslips for.'); return; }

  const btn = evt.target;
  const originalText = btn.textContent;
  btn.textContent = 'Preparing ZIP...'; btn.disabled = true;

  try{
    await ensureZipLibLoaded();
    const zip = new JSZip();
    const usedNames = {};
    for(const emp of c.employees){
      const { doc, filename } = await generatePayslipPDF(emp.id);
      // Guard against duplicate filenames (e.g. two employees with the same name)
      let finalName = filename;
      if(usedNames[finalName]){
        usedNames[finalName]++;
        finalName = finalName.replace(/\.pdf$/, `_${usedNames[finalName]}.pdf`);
      } else {
        usedNames[finalName] = 1;
      }
      zip.file(finalName, doc.output('blob'));
    }
    const content = await zip.generateAsync({ type:'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(c.name||'payslips').replace(/\s+/g,'_')}_${c.period||''}_payslips.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch(err){
    alert('Could not build the ZIP file: ' + err.message);
  } finally {
    btn.textContent = originalText; btn.disabled = false;
  }
}

async function emailAllPayslips(evt){
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  const targets = c.employees.filter(e => e.email);
  const skipped = c.employees.filter(e => !e.email);
  if(targets.length === 0){
    alert('No employees have an email address on file yet. Add emails under each employee\'s Statutory identifiers first.');
    return;
  }
  if(!confirm(`Send payslips to ${targets.length} employee(s) with an email on file?${skipped.length ? ` (${skipped.length} employee(s) will be skipped \u2014 no email on file.)` : ''}`)) return;

  const btn = evt.target;
  const originalText = btn.textContent;
  let sent = 0; const failed = [];

  for(const emp of targets){
    btn.textContent = `Sending... (${sent + failed.length + 1}/${targets.length})`;
    btn.disabled = true;
    try{
      const { doc } = await generatePayslipPDF(emp.id);
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const { error } = await sb.functions.invoke('send-payslip', {
        body: { to: emp.email, employeeName: emp.name, companyName: c.name, period: c.period, pdfBase64 }
      });
      if(error) throw error;
      sent++;
    } catch(err){
      failed.push(emp.name || 'Unnamed');
    }
    await new Promise(r => setTimeout(r, 350)); // gentle pacing to avoid rate limits
  }

  btn.textContent = originalText; btn.disabled = false;
  let summary = `Sent ${sent} of ${targets.length} payslip(s).`;
  if(skipped.length) summary += ` ${skipped.length} skipped (no email on file).`;
  if(failed.length) summary += ` Failed: ${failed.join(', ')}.`;
  alert(summary);
}
