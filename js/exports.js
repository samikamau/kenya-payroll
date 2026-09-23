function downloadCSV(rows, filename){
  const csv = rows.map(row => row.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportKRA(){
  // Matches the KRA iTax P10A "Simplified" employee details format - no header row,
  // 25 fixed-position columns. Verified against a real KRA-generated sample.
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  const rows = c.employees.map(e=>{
    const r = calcEmployee(e);
    return [
      e.pin || '',
      e.name || '',
      e.residentialStatus || 'Resident',
      e.employeeType || 'Primary Employee',
      e.disability || 'No',
      e.disability === 'Yes' ? (e.exemptionCertNo||'') : '',
      e.basic || 0,
      (e.allowances || 0) + (e.overtimePay || 0), // this column's documented purpose explicitly includes overtime
      0,                                  // value of quarters
      e.benefitAmount || 0,               // other non-cash benefit value
      e.benefitDescription || 'Benefit not given',
      '',
      0,
      '',
      Math.round(r.shif * 100) / 100,
      Math.round(r.nssfEmployee * 100) / 100,
      0,                                  // owner occupied interest
      0,                                  // additional retirement contribution
      0,                                  // post retirement medical fund
      Math.round(r.ahlEmployee * 100) / 100,
      '',
      RATES.personalRelief,
      Math.round(r.insuranceRelief * 100) / 100,
      '',
      Math.round(r.paye * 100) / 100
    ];
  });
  downloadCSV(rows, `${(c.name||'client').replace(/\s+/g,'_')}_P10A_${c.period||''}.csv`);
}

async function exportNSSF(evt){
  // Matches the NSSF new-format upload: PAYROLL NUMBER, SURNAME, OTHER NAMES, ID NO, KRA PIN, NSSF NO, GROSS PAY, VOLUNTARY
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  const btn = evt.target; const originalText = btn.textContent;
  btn.textContent = 'Preparing...'; btn.disabled = true;
  try{
    await ensureXlsxLibLoaded();
    const rows = c.employees.map(e=>{
      const { surname, otherNames } = splitName(e.name);
      const r = calcEmployee(e);
      return {
        'PAYROLL NUMBER': e.payrollNumber||'', 'SURNAME': surname, 'OTHER NAMES': otherNames,
        'ID NO': e.idNumber||'', 'KRA PIN': e.pin||'', 'NSSF NO': e.nssfNo||'',
        'GROSS PAY': Math.round(r.gross), 'VOLUNTARY': 0
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NSSF');
    XLSX.writeFile(wb, `${(c.name||'client').replace(/\s+/g,'_')}_NSSF_${c.period||''}.xlsx`);
  } catch(err){
    alert('Could not build the Excel file: ' + err.message);
  } finally {
    btn.textContent = originalText; btn.disabled = false;
  }
}

async function exportSHA(evt){
  // Matches the SHA/SHIF upload: PAYROLL NUMBER, FIRSTNAME, LASTNAME, IDENTITY TYPE, ID NO, KRA PIN, NHIF NO, CONTRIBUTION AMOUNT, PHONE
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  const btn = evt.target; const originalText = btn.textContent;
  btn.textContent = 'Preparing...'; btn.disabled = true;
  try{
    await ensureXlsxLibLoaded();
    const rows = c.employees.map(e=>{
      const { surname, otherNames } = splitName(e.name);
      const r = calcEmployee(e);
      return {
        'PAYROLL NUMBER': e.payrollNumber||'', 'FIRSTNAME': otherNames, 'LASTNAME': surname,
        'IDENTITY TYPE': e.identityType||'National ID', 'ID NO': e.idNumber||'', 'KRA PIN': e.pin||'',
        'NHIF NO': e.shaNo||'', 'CONTRIBUTION AMOUNT': Math.round(r.shif), 'PHONE': e.phone||''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SHA_SHIF');
    XLSX.writeFile(wb, `${(c.name||'client').replace(/\s+/g,'_')}_SHA_SHIF_${c.period||''}.xlsx`);
  } catch(err){
    alert('Could not build the Excel file: ' + err.message);
  } finally {
    btn.textContent = originalText; btn.disabled = false;
  }
}

/* ---------------- Bulk import ---------------- */
const IMPORT_HEADERS = [
  'Payroll Number','National ID','Name','Phone','Email','KRA PIN','NSSF Number','SHA Number','Basic Salary',
  'Allowances','Overtime Pay','Pension','Insurance Premium','Other Deductions',
  'Residential Status','Employee Type','Disability','Exemption Certificate No',
  'Identity Type','Benefit Description','Benefit Amount','Department','Employment Status'
];
const IMPORT_FIELD_MAP = {
  'name':'name', 'kra pin':'pin', 'national id':'idNumber', 'nssf number':'nssfNo', 'sha number':'shaNo',
  'payroll number':'payrollNumber', 'phone':'phone', 'email':'email', 'basic salary':'basic', 'allowances':'allowances',
  'overtime pay':'overtimePay',
  'pension':'pension', 'insurance premium':'insurance', 'other deductions':'otherDeduct',
  'residential status':'residentialStatus', 'employee type':'employeeType', 'disability':'disability',
  'exemption certificate no':'exemptionCertNo', 'identity type':'identityType',
  'benefit description':'benefitDescription', 'benefit amount':'benefitAmount',
  'department':'department', 'employment status':'employmentStatus'
};
const IMPORT_NUMERIC_FIELDS = ['basic','allowances','overtimePay','pension','insurance','otherDeduct','benefitAmount'];

function exportImportTemplate(){
  const rows = [IMPORT_HEADERS, [
    'EMP001','30112233','John Otieno Wanjala','0711000000','john.otieno@example.com','A012345678Z','1122334455','30112233','30000',
    '0','0','0','0','0','Resident','Primary Employee','No','','National ID','Benefit not given','0','Finance','Active'
  ]];
  downloadCSV(rows, 'employee_import_template.csv');
}

function parseCSVText(text){
  // Minimal RFC-4180 style parser: handles quoted fields, escaped quotes, commas inside quotes.
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const ch = text[i], next = text[i+1];
    if(inQuotes){
      if(ch === '"' && next === '"'){ field += '"'; i++; }
      else if(ch === '"'){ inQuotes = false; }
      else field += ch;
    } else {
      if(ch === '"') inQuotes = true;
      else if(ch === ','){ row.push(field); field = ''; }
      else if(ch === '\r'){ /* skip */ }
      else if(ch === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

async function handleCSVImport(event){
  const file = event.target.files[0];
  if(!file) return;
  const text = await file.text();
  const rows = parseCSVText(text);
  if(rows.length < 2){ alert('That file has no data rows to import.'); event.target.value = ''; return; }

  const headerRow = rows[0].map((h, i) => (i === 0 ? h.replace(/^\uFEFF/, '') : h).trim().toLowerCase());
  const dataRows = rows.slice(1);

  const newEmployees = dataRows.map(cells => {
    const emp = {
      name:'', pin:'', idNumber:'', nssfNo:'', shaNo:'', payrollNumber:'', phone:'', email:'',
      basic:0, allowances:0, overtimePay:0, pension:0, insurance:0, otherDeduct:0,
      residentialStatus:'Resident', employeeType:'Primary Employee', disability:'No',
      exemptionCertNo:'', identityType:'National ID', benefitDescription:'Benefit not given', benefitAmount:0,
      department:'', employmentStatus:'Active'
    };
    headerRow.forEach((h, i) => {
      const field = IMPORT_FIELD_MAP[h];
      if(!field) return;
      let raw = (cells[i]||'').trim();
      if(raw.startsWith("'")) raw = raw.slice(1); // strip Excel's text-protection apostrophe (e.g. on NSSF/ID numbers)
      if(IMPORT_NUMERIC_FIELDS.includes(field)){
        raw = raw.replace(/,/g, ''); // strip thousand separators (e.g. "30,000.00") before parsing
        emp[field] = parseFloat(raw) || 0;
      } else {
        emp[field] = raw;
      }
    });
    // The single "Other Deductions" import column becomes one "Other" line item,
    // since deductions are now tracked as a categorized list per employee.
    emp.deductionItems = emp.otherDeduct ? [{ type:'Other', description:'Imported', amount: emp.otherDeduct }] : [];
    delete emp.otherDeduct;
    return emp;
  }).filter(e => e.name); // skip rows with no name

  if(newEmployees.length === 0){
    alert('No valid rows found. Make sure the CSV has a "Name" column with values.');
    event.target.value = '';
    return;
  }

  const companyId = state.activeClient;
  const dbRows = newEmployees.map(e => ({
    company_id: companyId, name: e.name, pin: e.pin, id_number: e.idNumber, nssf_no: e.nssfNo, sha_no: e.shaNo,
    payroll_number: e.payrollNumber, phone: e.phone, email: e.email, basic: e.basic, allowances: e.allowances, overtime_pay: e.overtimePay,
    pension: e.pension, insurance: e.insurance, deduction_items: e.deductionItems,
    residential_status: e.residentialStatus, employee_type: e.employeeType, disability: e.disability,
    exemption_cert_no: e.exemptionCertNo, identity_type: e.identityType,
    benefit_description: e.benefitDescription, benefit_amount: e.benefitAmount,
    department: e.department, employment_status: e.employmentStatus
  }));

  const { data, error } = await sb.from('employees').insert(dbRows).select();
  if(error){ alert('Import failed: ' + error.message); event.target.value = ''; return; }

  const c = state.clients[companyId];
  data.forEach((row, idx) => {
    c.employees.push({ id: row.id, ...newEmployees[idx] });
  });
  render();
  alert(`Imported ${data.length} employee${data.length===1?'':'s'}.`);
  event.target.value = '';
}

function exportCSV(){
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  const rows = [[
    'Name','Basic','Allowances','Gross',
    'NSSF (Employee)','NSSF (Employer)',
    'SHIF','Housing Levy (Employee)','Housing Levy (Employer)','NITA Levy (Employer)',
    'PAYE','Other Deductions','Net Pay','Total Employer Cost'
  ]];
  let t = { nssfE:0, nssfEr:0, shif:0, ahlE:0, ahlEr:0, nita:0, paye:0, otherD:0, net:0, employerCost:0, gross:0 };
  c.employees.forEach(e=>{
    const r = calcEmployee(e);
    rows.push([e.name, e.basic, e.allowances, Math.round(r.gross),
      Math.round(r.nssfEmployee), Math.round(r.nssfEmployer),
      Math.round(r.shif), Math.round(r.ahlEmployee), Math.round(r.ahlEmployer), Math.round(r.nita),
      Math.round(r.paye), Math.round(r.otherDeduct), Math.round(r.net), Math.round(r.employerCost)]);
    t.gross+=r.gross; t.nssfE+=r.nssfEmployee; t.nssfEr+=r.nssfEmployer; t.shif+=r.shif;
    t.ahlE+=r.ahlEmployee; t.ahlEr+=r.ahlEmployer; t.nita+=r.nita; t.paye+=r.paye;
    t.otherD+=r.otherDeduct; t.net+=r.net; t.employerCost+=r.employerCost;
  });
  rows.push(['TOTAL', '', '', Math.round(t.gross), Math.round(t.nssfE), Math.round(t.nssfEr),
    Math.round(t.shif), Math.round(t.ahlE), Math.round(t.ahlEr), Math.round(t.nita),
    Math.round(t.paye), Math.round(t.otherD), Math.round(t.net), Math.round(t.employerCost)]);
  downloadCSV(rows, `${(c.name||'payroll').replace(/\s+/g,'_')}_payroll_register_${c.period||''}.csv`);
}

async function exportPayrollRegisterPDF(){
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  await ensurePdfLibsLoaded();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4', orientation:'landscape' });
  const [br, bg, bb] = hexToRgb(c.brandColor || '#123C36');
  const left = 40; let y = 50;

  if(c.logoDataUrl){
    const logoW = Math.min(c.logoSize || 60, 90); // cap slightly smaller here so it doesn't crowd a landscape header
    const logoH = logoW * (c.logoAspect || 0.75);
    try{ doc.addImage(c.logoDataUrl, 'PNG', left, y - 30, logoW, logoH); }catch(e){}
  }
  const textLeft = c.logoDataUrl ? left + Math.min(c.logoSize || 60, 90) + 14 : left;
  doc.setFont('helvetica','bold'); doc.setFontSize(17);
  doc.setTextColor(br,bg,bb);
  doc.text(c.name || 'Payroll Register', textLeft, y);
  doc.setTextColor(20,20,20);
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text(`Pay period: ${c.period || 'Not set'}   |   Employer KRA PIN: ${c.kraPin || '-'}`, textLeft, y + 16);
  y += 40;

  const head = [[
    'Name','Basic','Allowances','Gross','NSSF (Emp)','NSSF (Er)','SHIF',
    'Housing (Emp)','Housing (Er)','NITA','PAYE','Other Ded.','Net Pay','Employer Cost'
  ]];
  const body = [];
  const totals = { basic:0, allowances:0, gross:0, nssfE:0, nssfEr:0, shif:0, ahlE:0, ahlEr:0, nita:0, paye:0, otherD:0, net:0, cost:0 };
  c.employees.forEach(e=>{
    const r = calcEmployee(e);
    body.push([
      e.name||'-', fmt(e.basic), fmt(e.allowances), fmt(r.gross), fmt(r.nssfEmployee), fmt(r.nssfEmployer),
      fmt(r.shif), fmt(r.ahlEmployee), fmt(r.ahlEmployer), fmt(r.nita), fmt(r.paye), fmt(r.otherDeduct), fmt(r.net), fmt(r.employerCost)
    ]);
    totals.basic+=e.basic||0; totals.allowances+=e.allowances||0; totals.gross+=r.gross;
    totals.nssfE+=r.nssfEmployee; totals.nssfEr+=r.nssfEmployer; totals.shif+=r.shif;
    totals.ahlE+=r.ahlEmployee; totals.ahlEr+=r.ahlEmployer; totals.nita+=r.nita;
    totals.paye+=r.paye; totals.otherD+=r.otherDeduct; totals.net+=r.net; totals.cost+=r.employerCost;
  });
  const footRow = [[
    'TOTAL', fmt(totals.basic), fmt(totals.allowances), fmt(totals.gross), fmt(totals.nssfE), fmt(totals.nssfEr),
    fmt(totals.shif), fmt(totals.ahlE), fmt(totals.ahlEr), fmt(totals.nita), fmt(totals.paye), fmt(totals.otherD), fmt(totals.net), fmt(totals.cost)
  ]];

  doc.autoTable({
    startY: y,
    head, body, foot: footRow,
    margin: { left: 40, right: 40 },
    styles: { fontSize: 7.5, cellPadding: 4 },
    headStyles: { fillColor: [br,bg,bb], textColor: [255,255,255], fontStyle:'bold' },
    footStyles: { fillColor: [235,235,235], textColor: [20,20,20], fontStyle:'bold' },
    columnStyles: { 0: { halign:'left' } },
    theme: 'grid'
  });

  const finalY = doc.lastAutoTable.finalY + 20;
  doc.setFont('helvetica','italic'); doc.setFontSize(8);
  doc.setTextColor(140,140,140);
  doc.text('Generated by Edhafu Payroll. Verify statutory figures against current KRA/NSSF/SHA rates.', left, finalY);

  doc.save(`${(c.name||'payroll').replace(/\s+/g,'_')}_payroll_register_${c.period||''}.pdf`);
}
