/* ---------------- Auth ---------------- */
function showAuthError(msg){ document.getElementById('authError').textContent = msg || ''; }
function scrollPageDown(){
  const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 40);
  window.scrollTo({ top: nearBottom ? 0 : document.body.scrollHeight, behavior: 'smooth' });
}
function updateScrollFabIcon(){
  const fab = document.getElementById('scrollFab');
  if(!fab) return;
  const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 40);
  fab.innerHTML = nearBottom
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`;
  fab.title = nearBottom ? 'Back to top' : 'Scroll down';
  fab.classList.toggle('hidden', document.body.scrollHeight <= window.innerHeight + 80);
}
window.addEventListener('scroll', updateScrollFabIcon);
window.addEventListener('resize', updateScrollFabIcon);

function togglePasswordVisibility(){
  const input = document.getElementById('authPassword');
  const open = document.getElementById('eyeIconOpen');
  const closed = document.getElementById('eyeIconClosed');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  open.style.display = showing ? '' : 'none';
  closed.style.display = showing ? 'none' : '';
}
function toggleAuthMode(){
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  const isSignup = authMode === 'signup';
  document.getElementById('authTitle').textContent = isSignup ? 'Create account' : 'Sign in';
  document.getElementById('authSubmit').textContent = isSignup ? 'Create account' : 'Sign in';
  document.getElementById('authToggle').innerHTML = isSignup
    ? `Already have an account? <a onclick="toggleAuthMode()">Sign in</a>`
    : `No account yet? <a onclick="toggleAuthMode()">Create one</a>`;
  document.getElementById('authPassword').setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
  document.querySelectorAll('.auth-signup-only').forEach(el => { el.style.display = isSignup ? '' : 'none'; });
  document.getElementById('authRememberRow').style.display = isSignup ? 'none' : 'flex';
  document.getElementById('authSideTitle').textContent = isSignup ? 'Get started with Edhafu Payroll' : 'Welcome back';
  document.getElementById('authSideBody').textContent = isSignup
    ? 'Create your account to run statutory-compliant payroll, leave, and wages for your companies.'
    : 'Sign in to manage payroll, leave, and wages for your companies.';
  showAuthError('');
}
async function handleAuthSubmit(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  showAuthError('');

  if(authMode === 'signin'){
    rememberMeChoice = document.getElementById('authRememberMe').checked;
    if(!email || !password){ showAuthError('Enter an email and password.'); return; }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if(error){ showAuthError(error.message); return; }
    await boot();
    return;
  }

  const fullName = document.getElementById('authFullName').value.trim();
  const company = document.getElementById('authCompany').value.trim();
  const phone = document.getElementById('authPhone').value.trim();
  const commsOptIn = document.getElementById('authCommsOptIn').checked;

  if(!fullName){ showAuthError('Enter your full name.'); return; }
  if(!email || !password){ showAuthError('Enter an email and password.'); return; }
  if(!company){ showAuthError('Enter your company name.'); return; }
  if(!phone){ showAuthError('Enter your telephone number.'); return; }
  if(password.length < 8){ showAuthError('Password must be at least 8 characters.'); return; }

  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName, company, phone, comms_opt_in: commsOptIn } }
  });
  if(error){
    // Some Supabase configurations return an explicit error for a duplicate email.
    if(/already registered|already exists|user already/i.test(error.message)){
      showAuthError('An account with this email already exists. Try signing in instead, or use "Forgot password" if you\'ve forgotten it.');
    } else {
      showAuthError(error.message);
    }
    return;
  }
  // Other configurations (with email confirmation required, like ours) don't return an
  // explicit error for a duplicate email - Supabase deliberately avoids confirming which
  // emails are registered, the same reasoning as the password reset flow. Instead it signals
  // a duplicate by returning a user object with an empty "identities" array.
  if(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){
    showAuthError('An account with this email already exists. Try signing in instead, or use "Forgot password" if you\'ve forgotten it.');
    return;
  }
  showAuthError('Account created. Check your email if confirmation is required, then sign in.');
}
async function handleForgotPassword(){
  const email = prompt('Enter your account email — we\'ll send a password reset link:');
  if(!email) return;
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
  if(error){ alert('Could not send reset email: ' + error.message); return; }
  alert(`If an account exists for ${email}, a password reset link has been sent. Check your inbox (and spam folder).`);
}
async function handlePasswordUpdate(){
  const password = document.getElementById('resetPassword').value;
  const errEl = document.getElementById('resetError');
  errEl.textContent = '';
  if(password.length < 8){ errEl.textContent = 'Password must be at least 8 characters.'; return; }
  const { error } = await sb.auth.updateUser({ password });
  if(error){ errEl.textContent = error.message; return; }
  alert('Password updated. You can now sign in with your new password.');
  document.getElementById('resetScreen').style.display = 'none';
  await boot();
}
async function handleSignOut(){
  await sb.auth.signOut();
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('landingScreen').style.display = 'flex';
}

function openCompanyProfilePanel(){
  const c = state.clients[state.activeClient];
  if(!c) return;
  openPanel(`
    <div class="settings-panel">
      <h3 style="font-size:13px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-bottom:16px;">Company profile — ${esc(c.name)}</h3>
      <div class="settings-grid">
        <div class="settings-field"><label>Employer KRA PIN</label><input value="${esc(c.kraPin)}" placeholder="P0..." onchange="updateClientField('kraPin', this.value)"/></div>
        <div class="settings-field"><label>NSSF employer number</label><input value="${esc(c.nssfEmployerNo)}" onchange="updateClientField('nssfEmployerNo', this.value)"/></div>
        <div class="settings-field"><label>SHA employer number</label><input value="${esc(c.shaEmployerNo)}" onchange="updateClientField('shaEmployerNo', this.value)"/></div>
        <div class="settings-field"><label>Telephone number</label><input type="tel" value="${esc(c.phone)}" placeholder="07XX XXX XXX" onchange="updateClientField('phone', this.value)"/></div>
        <div class="settings-field"><label>Brand color (on payslip PDFs)</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="color" value="${c.brandColor||'#123C36'}" style="width:40px;height:32px;padding:2px;background:var(--bg);border:1px solid var(--line);border-radius:4px;" onchange="updateClientField('brandColor', this.value); openCompanyProfilePanel()"/>
            <input value="${c.brandColor||'#123C36'}" onchange="updateClientField('brandColor', this.value); openCompanyProfilePanel()" />
          </div>
        </div>
        <div class="settings-field">
          <label>Company logo (on payslip PDFs)</label>
          <div style="display:flex;gap:8px;align-items:center;">
            ${c.logoDataUrl ? `<img src="${c.logoDataUrl}" style="height:32px;border-radius:3px;background:#fff;padding:2px;" />` : ''}
            <button class="btn" style="font-size:11.5px;padding:6px 10px;" onclick="document.getElementById('logoFileInput').click()">${c.logoDataUrl ? 'Change' : 'Upload'}</button>
            ${c.logoDataUrl ? `<button class="btn" style="font-size:11.5px;padding:6px 10px;" onclick="removeLogo()">Remove</button>` : ''}
            <input type="file" id="logoFileInput" accept="image/*" style="display:none;" onchange="handleLogoUpload(event)" />
          </div>
        </div>
        ${c.logoDataUrl ? `
        <div class="settings-field">
          <label>Logo size on PDFs (${Math.round(c.logoSize||60)}pt wide)</label>
          <input type="range" min="24" max="140" step="2" value="${c.logoSize||60}"
            oninput="this.previousElementSibling.textContent = 'Logo size on PDFs (' + this.value + 'pt wide)'"
            onchange="updateClientField('logoSize', parseFloat(this.value)); openCompanyProfilePanel()"
            style="width:100%;accent-color:var(--gold);" />
        </div>` : ''}
      </div>

      ${renderPlanSection(c)}
    </div>
  `);
}
function renderPlanSection(c){
  const activeCount = c.employees.filter(e => e.name && e.name.trim() && e.employmentStatus !== 'Terminated').length;
  const currentTier = (c.isPaid && c.subscribedTier) ? (PRICING_TIERS.find(t => t.name === c.subscribedTier) || getTierForCount(activeCount)) : getTierForCount(activeCount);
  const inTrial = !c.isPaid && (!c.trialPeriodUsed || c.trialPeriodUsed === (c.period||''));
  const currentIndex = PRICING_TIERS.findIndex(t => t.name === currentTier.name);

  return `
    <h3 style="font-size:13px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-top:22px;margin-bottom:10px;">Plan &amp; billing</h3>
    <div style="font-size:12.5px;color:var(--ink);margin-bottom:12px;">
      ${inTrial
        ? `✨ On free trial — full access to every feature for one payroll cycle.`
        : c.isPaid
          ? `Currently on the <strong>${esc(currentTier.name)}</strong> plan (${activeCount} employee${activeCount===1?'':'s'}).`
          : `Trial used, not yet subscribed. ${activeCount} employee${activeCount===1?'':'s'} — needs the <strong>${esc(currentTier.name)}</strong> plan to continue.`
      }
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px;">
      ${PRICING_TIERS.map((t, i) => {
        const isCurrent = c.isPaid && t.name === currentTier.name;
        const priceText = t.price === null ? t.note : (t.price === 0 ? 'Free' : `KES ${fmt(t.price)}/mo`);
        return `
        <div style="background:var(--bg);border:1px solid ${isCurrent ? 'var(--gold)' : 'var(--line)'};border-radius:6px;padding:12px;">
          <div style="font-size:12.5px;font-weight:600;color:var(--ink);">${esc(t.name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">${priceText}</div>
          ${isCurrent
            ? `<div style="font-size:10.5px;color:var(--gold);font-weight:600;">CURRENT PLAN</div>`
            : `<button class="btn" style="width:100%;font-size:11px;padding:5px 8px;" onclick="subscribeToTier('${esc(t.name)}')">${c.isPaid ? (i > currentIndex ? 'Upgrade' : 'Downgrade') : 'Subscribe'}</button>`
          }
        </div>
      `}).join('')}
    </div>
  `;
}
/* ---------------- First-time product tour --------------------------------------------------
   A simple, reliable step-through walkthrough — not a live spotlight overlay, since that needs
   fragile positioning math that breaks on window resize. This reuses the same panel style
   already used everywhere else in the app, which is both simpler and more consistent. -------- */
const TOUR_STEPS = [
  { title: 'Welcome to Edhafu Payroll', body: "This is your Kenya statutory payroll workspace, built for accountants managing multiple client companies, and for individual companies managing their own payroll directly. This quick tour covers the essentials in under a minute." },
  { title: 'Dashboard', body: "The Dashboard is your home screen for each client — real payroll, leave, and wages numbers with charts, updated automatically as you work. No fabricated data, ever — everything shown is computed from what's actually in the system." },
  { title: 'Payroll', body: "Add employees, enter salaries, and Edhafu Payroll handles PAYE, NSSF, SHIF, and the Housing Levy automatically, verified against real KRA/NSSF/SHA sample formats. Finalize a period to lock in that month's history permanently." },
  { title: 'Wages', body: "A separate register for daily and casual workers — date, name, ID, amount, payment method — kept apart from regular payroll since KRA treats casual work differently for tax purposes." },
  { title: 'Leave Management', body: "Track entitlements, submit and approve leave requests, and see utilization at a glance — all tied to the same employee records as Payroll." },
  { title: 'Company Profile', body: "Each client's KRA PIN, NSSF/SHA numbers, branding, and logo live here — tucked away so the main Payroll screen stays focused on the numbers you're actually working with." },
  { title: 'Pricing & your free trial', body: "Every new client gets one full payroll cycle completely free, every feature included. After that, plans are priced by how many employees you're running payroll for — never per client company." },
];
let tourStepIndex = 0;
function renderTourStep(){
  const step = TOUR_STEPS[tourStepIndex];
  const isLast = tourStepIndex === TOUR_STEPS.length - 1;
  openPanel(`
    <div class="settings-panel">
      <div style="font-size:10.5px;color:var(--muted);margin-bottom:6px;">Step ${tourStepIndex+1} of ${TOUR_STEPS.length}</div>
      <h3 style="font-size:16px;color:var(--gold);font-family:'Fraunces',serif;font-weight:600;margin-bottom:12px;">${esc(step.title)}</h3>
      <div style="font-size:13.5px;color:var(--ink);line-height:1.6;margin-bottom:24px;">${esc(step.body)}</div>
      <div style="display:flex;gap:8px;">
        ${tourStepIndex > 0 ? `<button class="btn" onclick="tourStepIndex--; renderTourStep();">Back</button>` : ''}
        <button class="btn" style="margin-left:auto;" onclick="closePanel(); localStorage.setItem('hasSeenTour','true');">Skip</button>
        <button class="btn primary" onclick="${isLast ? "closePanel(); localStorage.setItem('hasSeenTour','true');" : 'tourStepIndex++; renderTourStep();'}">${isLast ? 'Done' : 'Next'}</button>
      </div>
    </div>
  `);
}
function startTour(){
  tourStepIndex = 0;
  renderTourStep();
}

function openAccountPanel(){
  const ownedCount = Object.values(state.clients).filter(c => c.ownerId === state.currentUserId).length;
  openPanel(`
    <div class="settings-panel">
      <h3 style="font-size:13px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-bottom:16px;">Account profile</h3>
      <div style="font-size:13px;color:var(--ink);padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;">
        <span style="color:var(--muted);">Email</span><span>${esc(state.currentUserEmail || '')}</span>
      </div>
      <div style="font-size:13px;color:var(--ink);padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;">
        <span style="color:var(--muted);">Member since</span><span>${state.currentUserCreatedAt ? new Date(state.currentUserCreatedAt).toLocaleDateString('en-KE') : '—'}</span>
      </div>
      <div style="font-size:13px;color:var(--ink);padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;">
        <span style="color:var(--muted);">Clients you own</span><span>${ownedCount}</span>
      </div>

      <button class="btn" style="margin-top:6px;width:100%;" onclick="startTour()">Take a tour</button>

      <h3 style="font-size:12px;color:#EF4444;font-family:'Inter',sans-serif;font-weight:600;margin-top:24px;margin-bottom:8px;">Danger zone</h3>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:12px;">Permanently deletes your login. This can't be undone.</div>
      <button class="btn" style="border-color:#EF4444;color:#EF4444;" onclick="deleteMyAccount()">Delete my account</button>
    </div>
  `);
}
async function deleteMyAccount(){
  // Quick client-side check first, just for fast feedback - the real, unbypassable check
  // happens server-side in the Edge Function regardless of what this shows.
  const ownedCount = Object.values(state.clients).filter(c => c.ownerId === state.currentUserId).length;
  if(ownedCount > 0){
    alert(`You still own ${ownedCount} client${ownedCount===1?'':'s'}. Delete or hand those off first — deleting your account would permanently delete all of their payroll history too, which can't be undone.`);
    return;
  }
  const typed = prompt('This permanently deletes your login account. This cannot be undone.\n\nType DELETE to confirm:');
  if(typed === null) return;
  if(typed.trim() !== 'DELETE'){
    alert('That did not match. Nothing was deleted.');
    return;
  }
  const { data, error } = await sb.functions.invoke('delete-own-account');
  if(error || data?.error){
    alert('Could not delete your account: ' + (data?.error || error.message));
    return;
  }
  alert('Your account has been deleted.');
  await sb.auth.signOut();
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
}
