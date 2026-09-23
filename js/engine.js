const DEDUCTION_TYPES = ['Salary Advance','Loan Repayment','Damaged Asset/Equipment','Union Dues','Other'];
const BONUS_TYPES = ['Bonus','Commission','Arrears','One-off Payment','Other'];
function isRecurring(item){ return item.recurring !== false; } // undefined/true = recurring (matches existing pre-flag data unchanged)

function sumDeductions(items){
  return (items||[]).reduce((s,d) => s + (parseFloat(d.amount)||0), 0);
}

function splitName(fullName){
  const parts = (fullName||'').trim().split(/\s+/).filter(Boolean);
  if(parts.length === 0) return { surname:'', otherNames:'' };
  if(parts.length === 1) return { surname: parts[0], otherNames:'' };
  return { surname: parts[parts.length-1], otherNames: parts.slice(0,-1).join(' ') };
}

function calcPAYE(taxable){
  let remaining = taxable, tax = 0, lower = 0;
  for(const b of RATES.bands){
    const bandAmount = Math.max(0, Math.min(remaining, b.upTo - lower));
    tax += bandAmount * b.rate;
    remaining -= bandAmount;
    lower = b.upTo;
    if(remaining <= 0) break;
  }
  return tax;
}

function sumBonuses(items){
  return (items||[]).reduce((s,d) => s + (parseFloat(d.amount)||0), 0);
}
function calcEmployee(e){
  const basic = Number(e.basic)||0;
  const allowances = Number(e.allowances)||0;
  const overtimePay = Number(e.overtimePay)||0;
  const bonusPay = sumBonuses(e.bonusItems);
  const gross = basic + allowances + overtimePay + bonusPay; // one-off bonuses are taxable cash pay, like overtime, but NOT part of the NSSF pensionable base (basic only, below)

  const tier1 = Math.min(basic, RATES.nssfLEL) * RATES.nssfRate;
  const tier2 = Math.max(0, Math.min(basic, RATES.nssfUEL) - RATES.nssfLEL) * RATES.nssfRate;
  const nssfEmployee = tier1 + tier2;
  const nssfEmployer = nssfEmployee;

  const shif = gross > 0 ? Math.max(gross * RATES.shifRate, RATES.shifMin) : 0;
  const ahlEmployee = gross * RATES.ahlRate;
  const ahlEmployer = gross * RATES.ahlRate;

  const voluntaryPension = Math.min(Number(e.pension)||0, Math.max(0, RATES.pensionReliefCap - nssfEmployee));

  const taxable = Math.max(0, gross - nssfEmployee - shif - ahlEmployee - voluntaryPension);
  const grossTax = calcPAYE(taxable);
  const insuranceRelief = Math.min((Number(e.insurance)||0) * RATES.insuranceReliefRate, RATES.insuranceReliefCap);
  const paye = Math.max(0, grossTax - RATES.personalRelief - insuranceRelief);

  const otherDeduct = sumDeductions(e.deductionItems);
  const totalDeductions = nssfEmployee + shif + ahlEmployee + voluntaryPension + paye + otherDeduct;
  const net = gross - totalDeductions;

  const nita = gross > 0 ? RATES.nitaLevy : 0;
  const employerCost = gross + nssfEmployer + ahlEmployer + nita;

  return { gross, overtimePay, bonusPay, nssfEmployee, nssfEmployer, shif, ahlEmployee, ahlEmployer,
           voluntaryPension, taxable, grossTax, insuranceRelief, paye,
           otherDeduct, totalDeductions, net, nita, employerCost };
}
