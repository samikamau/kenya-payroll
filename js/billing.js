const KENYA_COUNTIES = ['Mombasa','Kwale','Kilifi','Tana River','Lamu','Taita-Taveta','Garissa','Wajir','Mandera',
  'Marsabit','Isiolo','Meru','Tharaka-Nithi','Embu','Kitui','Machakos','Makueni','Nyandarua','Nyeri','Kirinyaga',
  "Murang'a",'Kiambu','Turkana','West Pokot','Samburu','Trans Nzoia','Uasin Gishu','Elgeyo-Marakwet','Nandi',
  'Baringo','Laikipia','Nakuru','Narok','Kajiado','Kericho','Bomet','Kakamega','Vihiga','Bungoma','Busia',
  'Siaya','Kisumu','Homa Bay','Migori','Kisii','Nyamira','Nairobi'];

async function subscribeToTier(tierName){
  const c = state.clients[state.activeClient];
  const tier = PRICING_TIERS.find(t => t.name === tierName);
  const activeCount = c.employees.filter(e => e.name && e.name.trim() && e.employmentStatus !== 'Terminated').length;
  const priceText = tier.price === null ? tier.note : (tier.price === 0 ? 'Free' : `KES ${fmt(tier.price)}/month`);

  if(c.isPaid){
    // Already subscribed once before - an upgrade/downgrade just changes the plan, no need
    // to re-collect contact details that were already captured on first subscription.
    if(!confirm(`Switch "${c.name}" to the ${tierName} plan (${priceText})?`)) return;
    const { data: lastRequest } = await sb.from('subscription_requests').select('*').eq('company_id', state.activeClient).order('created_at', { ascending:false }).limit(1).maybeSingle();
    const { error } = await sb.rpc('submit_subscription_and_activate', {
      p_company_id: state.activeClient, p_tier: tierName,
      p_first_name: lastRequest?.first_name || '', p_last_name: lastRequest?.last_name || '',
      p_email: lastRequest?.email || state.currentUserEmail || '', p_phone: lastRequest?.phone || '', p_county: lastRequest?.county || ''
    });
    if(error){ alert('Could not switch plans: ' + error.message); return; }
    logAudit('Plan changed', `Switched to ${tierName} plan`);
    c.subscribedTier = tierName;
    alert(`"${c.name}" is now on the ${tierName} plan.`);
    openCompanyProfilePanel();
    return;
  }

  openPanel(`
    <div class="settings-panel">
      <h3 style="font-size:14px;color:var(--gold);font-family:'Fraunces',serif;font-weight:600;margin-bottom:4px;">Subscribe — ${esc(tierName)} plan</h3>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:18px;">${priceText} for ${esc(c.name)}. We'll be in touch to confirm payment and activate this plan.</div>
      <form onsubmit="submitSubscriptionRequest(event, '${esc(tierName)}')">
        <div class="settings-grid">
          <div class="settings-field"><label>Company / Organization</label><input value="${esc(c.name)}" disabled style="opacity:0.7;"/></div>
          <div class="settings-field"><label>No. of employees</label><input value="${activeCount}" disabled style="opacity:0.7;"/></div>
          <div class="settings-field"><label>First name</label><input name="firstName" required/></div>
          <div class="settings-field"><label>Last name</label><input name="lastName" required/></div>
          <div class="settings-field"><label>Email</label><input type="email" name="email" required value="${esc(state.currentUserEmail||'')}"/></div>
          <div class="settings-field"><label>Phone</label><input type="tel" name="phone" required placeholder="07XX XXX XXX"/></div>
          <div class="settings-field">
            <label>County</label>
            <select name="county" required style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:7px 8px;font-size:12.5px;">
              <option value="">Select County</option>
              ${KENYA_COUNTIES.map(county => `<option>${county}</option>`).join('')}
            </select>
          </div>
        </div>
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:11.5px;color:var(--muted);margin-top:14px;">
          <input type="checkbox" name="tosAgree" required style="margin-top:2px;accent-color:var(--gold);"/>
          I have read and understood Edhafu Payroll's Terms of Service
        </label>
        <button class="btn primary" type="submit" style="margin-top:16px;width:100%;">Submit</button>
      </form>
    </div>
  `);
}

async function submitSubscriptionRequest(evt, tierName){
  evt.preventDefault();
  const c = state.clients[state.activeClient];
  const form = evt.target;
  const firstName = form.firstName.value.trim();
  const lastName = form.lastName.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const county = form.county.value;

  if(!firstName || !lastName || !email || !phone || !county){ alert('Please fill in every field.'); return; }

  const { error } = await sb.rpc('submit_subscription_and_activate', {
    p_company_id: state.activeClient, p_tier: tierName,
    p_first_name: firstName, p_last_name: lastName, p_email: email, p_phone: phone, p_county: county
  });
  if(error){ alert('Could not activate your subscription: ' + error.message); return; }

  c.isPaid = true; // unlocked immediately — payment is invoiced/collected separately afterward
  c.subscribedTier = tierName;
  logAudit('Client subscribed', `${tierName} plan — activated instantly, invoice to follow`);
  closePanel();
  alert(`Thanks, ${firstName} — "${c.name}" is now active on the ${tierName} plan. You have full access right away — an invoice for payment will follow separately.`);
  switchView('dashboard');
}

function renderPricingView(main, c){
  const activeCount = c.employees.filter(e => e.name && e.name.trim() && e.employmentStatus !== 'Terminated').length;
  const currentTier = (c.isPaid && c.subscribedTier) ? (PRICING_TIERS.find(t => t.name === c.subscribedTier) || getTierForCount(activeCount)) : getTierForCount(activeCount);
  const trialExhausted = !c.isPaid && c.trialPeriodUsed && c.trialPeriodUsed !== (c.period||'');
  const inTrial = !c.isPaid && (!c.trialPeriodUsed || c.trialPeriodUsed === (c.period||''));

  main.innerHTML = `
    ${viewTabsHtml(c)}
    <div class="topbar">
      <h2 style="font-family:'Fraunces',serif;font-weight:500;font-size:24px;margin:0;">Pricing</h2>
    </div>
    <div style="font-size:11.5px;color:var(--muted);margin-bottom:20px;max-width:640px;">
      Priced per account, by total active employee count — not per client company. Your free trial gives full access to every feature for one complete payroll cycle, regardless of size. After that, every account needs a paid plan to keep running payroll — pricing scales down per employee as you grow, never up.
    </div>

    <div style="margin-bottom:20px;padding:14px 16px;border-radius:6px;background:${inTrial ? 'rgba(176,141,87,0.12)' : (c.isPaid ? 'rgba(126,199,160,0.12)' : 'rgba(239,68,68,0.12)')};border:1px solid ${inTrial ? 'rgba(176,141,87,0.4)' : (c.isPaid ? 'rgba(126,199,160,0.4)' : 'rgba(239,68,68,0.4)')};font-size:13px;">
      ${inTrial
        ? `✨ <strong>${esc(c.name)}</strong> is on its free trial cycle — full access to every feature, any employee count, for this one payroll period.`
        : c.isPaid
          ? `<strong>${esc(c.name)}</strong> is Active (paid) — full access, currently ${activeCount} active employee${activeCount===1?'':'s'} (maps to the <strong>${currentTier.name}</strong> tier by headcount).`
          : `<strong>${esc(c.name)}</strong> has ${activeCount} active employee${activeCount===1?'':'s'} — the <strong>${currentTier.name}</strong> plan (${currentTier.price ? 'KES '+fmt(currentTier.price)+'/month' : currentTier.note}) applies. ${trialExhausted ? 'The free trial cycle has been used — this account needs to be marked paid to continue running payroll.' : ''}`
      }
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:14px;">
      ${PRICING_TIERS.map(t => {
        const currentIndex = PRICING_TIERS.findIndex(x => x.name === currentTier.name);
        const thisIndex = PRICING_TIERS.findIndex(x => x.name === t.name);
        const isCurrent = c.isPaid && t.name === currentTier.name;
        let actionLabel = 'Subscribe';
        if(c.isPaid && !isCurrent){
          actionLabel = thisIndex > currentIndex ? 'Upgrade' : 'Downgrade';
        }
        return `
        <div style="background:var(--panel);border:1px solid ${isCurrent ? 'var(--gold)' : 'var(--line)'};border-radius:8px;padding:20px 18px;${isCurrent ? 'box-shadow:0 0 0 1px var(--gold);' : ''}">
          <div style="font-family:'Fraunces',serif;font-size:18px;color:var(--ink);margin-bottom:4px;">${t.name}</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:14px;">${t.max===Infinity ? t.min+'+' : t.min+'–'+t.max} employees</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:22px;color:${isCurrent?'var(--gold)':'var(--ink)'};margin-bottom:10px;">
            ${t.price === null ? 'KES 1,000 + KES 50/employee' : t.price === 0 ? 'Free' : 'KES ' + fmt(t.price)}
            ${t.price !== null && t.price > 0 ? `<span style="font-size:11px;color:var(--muted);font-family:'Inter',sans-serif;">/month</span>` : ''}
          </div>
          <div style="font-size:12px;color:var(--muted);line-height:1.5;">${esc(t.note)}</div>
          ${isCurrent
            ? `<div style="margin-top:14px;padding:8px;text-align:center;border-radius:5px;background:rgba(176,141,87,0.15);font-size:11px;color:var(--gold);font-weight:600;">CURRENT PLAN</div>`
            : `<button class="btn primary" style="margin-top:14px;width:100%;font-size:12px;" onclick="subscribeToTier('${esc(t.name)}')">${actionLabel}</button>`
          }
        </div>
      `}).join('')}
    </div>

    <div style="font-size:11px;color:var(--muted);margin-top:20px;">
      To upgrade a client's plan, contact Edhafu Payroll — activation is confirmed by your admin once payment is arranged.
    </div>
  `;
}
