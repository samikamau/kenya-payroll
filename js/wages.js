/* ---------------- Wages register (standalone) - daily/casual wage workers.
   Deliberately kept separate from the main payroll engine: not fed into PAYE/NSSF/SHIF.
   Just a clean, exportable log an accountant can hand over or file independently. ------- */
const PAYMENT_METHODS = ['Cash','M-Pesa','Bank Transfer'];

const WAGES_IMPORT_HEADERS = ['Date','Full Names','ID Number','KRA PIN','Amount','Payment Method','Voucher Number','Payment Ref No.'];
function exportWagesImportTemplate(){
  const rows = [WAGES_IMPORT_HEADERS, [
    '2026-09-05','John Otieno Wanjala','30112233','A012345678Z','1500','Cash','PV-001','QGH4X9K2LM'
  ]];
  downloadCSV(rows, 'wages_import_template.csv');
}

async function handleWagesCSVImport(event){
  const file = event.target.files[0];
  if(!file) return;
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)){ event.target.value = ''; return; }

  const text = await file.text();
  const rows = parseCSVText(text);
  if(rows.length < 2){ alert('That file has no data rows to import.'); event.target.value = ''; return; }

  const headerRow = rows[0].map((h, i) => (i === 0 ? h.replace(/^\uFEFF/, '') : h).trim().toLowerCase());
  const dataRows = rows.slice(1);
  const fieldMap = {
    'date':'date', 'full names':'fullNames', 'id number':'idNumber', 'kra pin':'kraPin',
    'amount':'amount', 'payment method':'paymentMethod', 'voucher number':'voucherNumber', 'payment ref no.':'paymentRefNo'
  };

  const newWages = dataRows.map(cells => {
    const w = { date:'', fullNames:'', idNumber:'', kraPin:'', amount:0, paymentMethod:'Cash', voucherNumber:'', paymentRefNo:'' };
    headerRow.forEach((h, i) => {
      const field = fieldMap[h];
      if(!field) return;
      const raw = (cells[i]||'').trim();
      w[field] = field === 'amount' ? (parseFloat(raw.replace(/,/g,'')) || 0) : raw;
    });
    return w;
  }).filter(w => w.date && w.fullNames && w.idNumber && w.amount > 0);

  if(newWages.length === 0){
    alert('No valid rows found. Each row needs at least a Date, Full Names, ID Number, and Amount greater than zero.');
    event.target.value = '';
    return;
  }

  const dbRows = newWages.map(w => ({
    id: crypto.randomUUID(), company_id: state.activeClient, wage_date: w.date, full_names: w.fullNames,
    id_number: w.idNumber, kra_pin: w.kraPin, amount: w.amount, payment_method: w.paymentMethod || 'Cash', voucher_number: w.voucherNumber, payment_ref_no: w.paymentRefNo
  }));

  const { error } = await sb.from('wages').insert(dbRows);
  if(error){ alert('Import failed: ' + error.message); event.target.value = ''; return; }

  dbRows.forEach((row, idx) => {
    c.wages.unshift({ id: row.id, date: newWages[idx].date, fullNames: newWages[idx].fullNames, idNumber: newWages[idx].idNumber,
                       kraPin: newWages[idx].kraPin, amount: newWages[idx].amount, paymentMethod: newWages[idx].paymentMethod || 'Cash',
                       voucherNumber: newWages[idx].voucherNumber, paymentRefNo: newWages[idx].paymentRefNo });
  });
  logAudit('Wages imported', `${dbRows.length} entries imported from CSV`);
  render();
  alert(`Imported ${dbRows.length} wage entr${dbRows.length===1?'y':'ies'}.`);
  event.target.value = '';
}

async function submitWageEntry(evt){
  evt.preventDefault();
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  const form = evt.target;
  const date = form.wageDate.value;
  const fullNames = form.fullNames.value.trim();
  const idNumber = form.idNumber.value.trim();
  const kraPin = form.kraPin.value.trim();
  const amount = parseFloat(form.amount.value) || 0;
  const paymentMethod = form.paymentMethod.value;
  const voucherNumber = form.voucherNumber.value.trim();
  const paymentRefNo = form.paymentRefNo.value.trim();

  if(!date || !fullNames || !idNumber){ alert('Date, full names, and ID number are required.'); return; }
  if(amount <= 0){ alert('Enter an amount greater than zero.'); return; }

  const newId = crypto.randomUUID();
  const { error } = await sb.from('wages').insert({
    id: newId, company_id: state.activeClient, wage_date: date, full_names: fullNames,
    id_number: idNumber, kra_pin: kraPin, amount, payment_method: paymentMethod, voucher_number: voucherNumber, payment_ref_no: paymentRefNo
  });
  if(error){ alert('Could not save wage entry: ' + error.message); return; }

  c.wages.unshift({ id: newId, date, fullNames, idNumber, kraPin, amount, paymentMethod, voucherNumber, paymentRefNo });
  logAudit('Wage entry added', `${fullNames} — ${fmt(amount)} (${paymentMethod})`);
  form.reset();
  render();
}

async function deleteWageEntry(id){
  if(!confirm('Delete this wage entry? This cannot be undone.')) return;
  const c = state.clients[state.activeClient];
  const { error } = await sb.from('wages').delete().eq('id', id);
  if(error){ alert('Could not delete: ' + error.message); return; }
  c.wages = c.wages.filter(w => w.id !== id);
  render();
}

async function downloadWagesExcel(evt){
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  if(c.wages.length === 0){ alert('No wage entries to export yet.'); return; }
  const btn = evt.target; const originalText = btn.textContent;
  btn.textContent = 'Preparing...'; btn.disabled = true;
  try{
    await ensureXlsxLibLoaded();
    const rows = c.wages.map(w => ({
      'Date': w.date, 'Full Names': w.fullNames, 'ID Number': w.idNumber,
      'KRA PIN': w.kraPin, 'Amount': w.amount, 'Payment Method': w.paymentMethod, 'Voucher Number': w.voucherNumber, 'Payment Ref No.': w.paymentRefNo
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Wages');
    XLSX.writeFile(wb, `${(c.name||'wages').replace(/\s+/g,'_')}_wages_register.xlsx`);
  } catch(err){
    alert('Could not build the Excel file: ' + err.message);
  } finally {
    btn.textContent = originalText; btn.disabled = false;
  }
}

async function downloadWagesPDF(evt){
  const c = state.clients[state.activeClient];
  if(!requireAccess(c)) return;
  if(c.wages.length === 0){ alert('No wage entries to export yet.'); return; }
  const btn = evt.target; const originalText = btn.textContent;
  btn.textContent = 'Preparing...'; btn.disabled = true;
  try{
    await ensurePdfLibsLoaded();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:'a4', orientation:'landscape' });
    const [br, bg, bb] = hexToRgb(c.brandColor || '#123C36');
    const left = 40; let y = 50;

    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.setTextColor(br,bg,bb);
    doc.text(`${c.name || 'Wages Register'}`, left, y);
    doc.setTextColor(20,20,20);
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    doc.text('Daily / casual wages register', left, y + 16);
    y += 36;

    const total = c.wages.reduce((s,w) => s + (w.amount||0), 0);

    doc.autoTable({
      startY: y,
      head: [['Date','Full Names','ID Number','KRA PIN','Amount','Payment Method','Voucher No.','Payment Ref No.']],
      body: c.wages.map(w => [w.date, w.fullNames, w.idNumber, w.kraPin||'-', fmt(w.amount), w.paymentMethod, w.voucherNumber||'-', w.paymentRefNo||'-']),
      foot: [['', '', '', 'TOTAL', fmt(total), '', '', '']],
      margin: { left: 40, right: 40 },
      styles: { fontSize: 8.5, cellPadding: 5 },
      headStyles: { fillColor: [br,bg,bb], textColor: [255,255,255], fontStyle:'bold' },
      footStyles: { fillColor: [235,235,235], textColor: [20,20,20], fontStyle:'bold' },
      theme: 'grid'
    });

    doc.save(`${(c.name||'wages').replace(/\s+/g,'_')}_wages_register.pdf`);
  } catch(err){
    alert('Could not build the PDF: ' + err.message);
  } finally {
    btn.textContent = originalText; btn.disabled = false;
  }
}

function renderWagesView(main, c){
  const total = c.wages.reduce((s,w) => s + (w.amount||0), 0);

  main.innerHTML = `
    ${viewTabsHtml(c)}
    <div class="topbar">
      <h2 style="font-family:'Fraunces',serif;font-weight:500;font-size:24px;margin:0;">${esc(c.name) || 'Client'} — Wages Register</h2>
    </div>
    <div style="font-size:11.5px;color:var(--muted);margin-bottom:18px;max-width:640px;">
      For daily and casual wage workers — kept separate from regular payroll. If someone works for you continuously beyond about a month, they should move to the main Payroll tab instead, since KRA treats them as a regular employee at that point (full PAYE, not casual-exempt).
    </div>

    <div class="summary" style="margin-bottom:20px;">
      <div class="card"><div class="label">Total entries</div><div class="value">${c.wages.length}</div></div>
      <div class="card accent"><div class="label">Total paid</div><div class="value">${fmt(total)}</div></div>
    </div>

    <div class="settings-panel">
      <h3 style="font-size:13px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-bottom:12px;">Add wage entry</h3>
      <form onsubmit="submitWageEntry(event)">
        <div class="settings-grid">
          <div class="settings-field"><label>Date</label><input type="date" name="wageDate" required/></div>
          <div class="settings-field"><label>Full names</label><input name="fullNames" required placeholder="e.g. John Otieno Wanjala"/></div>
          <div class="settings-field"><label>ID Number</label><input name="idNumber" required/></div>
          <div class="settings-field"><label>KRA PIN</label><input name="kraPin"/></div>
          <div class="settings-field"><label>Payment voucher number</label><input name="voucherNumber"/></div>
          <div class="settings-field"><label>Payment Ref No.</label><input name="paymentRefNo" placeholder="M-Pesa code, bank ref, cheque no."/></div>
          <div class="settings-field"><label>Amount</label><input type="number" name="amount" required min="0" step="0.01"/></div>
          <div class="settings-field"><label>Payment method</label>
            <select name="paymentMethod" style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:6px 8px;font-size:12.5px;">
              ${PAYMENT_METHODS.map(m => `<option>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn primary" type="submit" style="margin-top:12px;">Add entry</button>
      </form>
    </div>

    <div class="actions">
      <button class="btn primary" onclick="downloadWagesExcel(event)">Download Excel</button>
      <button class="btn" onclick="downloadWagesPDF(event)">Download PDF</button>
    </div>
    <div class="actions">
      <button class="btn" onclick="exportWagesImportTemplate()">Download import template</button>
      <button class="btn" onclick="document.getElementById('wagesCsvInput').click()">Import wages (CSV)</button>
      <input type="file" id="wagesCsvInput" accept=".csv" style="display:none;" onchange="handleWagesCSVImport(event)" />
    </div>

    <div class="table-wrap scroll-table">
      <table>
        <thead>
          <tr><th>Date</th><th>Full Names</th><th>ID Number</th><th>KRA PIN</th><th>Amount</th><th>Payment Method</th><th>Voucher No.</th><th>Payment Ref No.</th><th></th></tr>
        </thead>
        <tbody>
          ${c.wages.length === 0 ? `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:24px;">No wage entries yet.</td></tr>` : ''}
          ${c.wages.map(w => `
            <tr>
              <td class="mono">${esc(w.date)}</td>
              <td class="name-cell">${esc(w.fullNames)}</td>
              <td class="mono">${esc(w.idNumber)}</td>
              <td class="mono">${esc(w.kraPin) || '-'}</td>
              <td class="num">${fmt(w.amount)}</td>
              <td>${esc(w.paymentMethod)}</td>
              <td class="mono">${esc(w.voucherNumber) || '-'}</td>
              <td class="mono">${esc(w.paymentRefNo) || '-'}</td>
              <td><span class="row-del" style="opacity:.6;" onclick="deleteWageEntry('${w.id}')">&times;</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
