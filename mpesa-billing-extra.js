/* mpesa-billing-extra.js - Edhafu Payroll account billing with M-Pesa (standalone).
   Account number, top billing bar with exact bill, M-Pesa checkout, expiry,
   one company on trial/Free, admin controls per account. Load AFTER the main script. */
(function () {
  const G = "#00A651";
  const kes = (n) => "KES " + Number(n || 0).toLocaleString("en-KE");
  const fmtDate = (d) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const owned = () => Object.values(state.clients || {}).filter((c) => c.ownerId === state.currentUserId);
  const active = (c) => c.employees.filter((e) => e.name && e.name.trim() && e.employmentStatus !== "Terminated").length;
  const headcount = () => owned().reduce((s, c) => s + active(c), 0);
  let busy = false;

  // ---------- Plan decided by headcount ----------
  function billTier() {
    const n = headcount();
    if (n <= 2 && owned().length <= 1) return "Free";
    return n <= 15 ? "Starter" : "Enterprise";
  }
  function price(tier, n) {
    if (tier === "Test") return 1;
    if (tier === "Starter") return n <= 5 ? 500 : 500 + 100 * (n - 5);
    if (tier === "Enterprise") return 1500 + 30 * Math.max(0, n - 15);
    return 0;
  }
  function billLine(n, t) {
    if (t === "Free") return "Free plan (one company, up to 2 employees): " + kes(0);
    if (t === "Starter") {
      if (n <= 2) return "Starter minimum: " + kes(500) + " (the Free plan covers one company only)";
      return n <= 5 ? "Starter, up to 5 employees: " + kes(500)
        : `Starter: ${kes(500)} for the first 5 + ${n - 5} &times; ${kes(100)} = ${kes(price("Starter", n))}`;
    }
    return `Enterprise: ${kes(1500)} for the first 15 + ${n - 15} &times; ${kes(30)} = ${kes(price("Enterprise", n))}`;
  }
  const sub = () => state.subscription || {};
  const isExpired = () => !!(sub().isPaid && sub().paidUntil && new Date(sub().paidUntil) <= new Date());
  function isRestricted() {
    if (state.isPlatformAdmin) return false;
    const s = sub();
    return !(s.isPaid && s.subscribedTier !== "Free" && !isExpired());
  }

  // ---------- Load account number + paid until ----------
  async function loadBilling() {
    const { data } = await sb.rpc("get_my_subscriber");
    const row = data && data[0];
    if (!row) return;
    state.accountNumber = row.account_number;
    if (state.subscription) state.subscription.paidUntil = row.paid_until;
  }
  const _fetch = window.fetchAllData;
  window.fetchAllData = async function () { await _fetch(); await loadBilling(); };
  (async function waitForLogin() {
    for (let i = 0; i < 60; i++) {
      if (state.currentUserId && state.subscription) { await loadBilling(); if (typeof render === "function") render(); return; }
      await sleep(500);
    }
  })();

  // ---------- Access gate ----------
  const _requireAccess = window.requireAccess;
  window.requireAccess = function (c) {
    const s = sub();
    if (!state.isPlatformAdmin && s.isPaid && s.subscribedTier === "Free" && billTier() !== "Free") {
      alert("Your account has outgrown the Free plan (one company, up to 2 employees). Pay for a subscription to continue.");
      openBill(); return false;
    }
    if (isExpired()) {
      alert(`Your plan expired on ${fmtDate(s.paidUntil)}. Renew with M-Pesa to continue.`);
      openBill(); return false;
    }
    return _requireAccess(c);
  };

  // ---------- Subscribe = one exact bill ----------
  const _subscribe = window.subscribeToTier;
  window.subscribeToTier = function (tierName) {
    if (tierName === "Test") return openCheckout("Test");
    return openBill();
  };
  function openBill() {
    const t = billTier(), s = sub();
    if (t === "Free") {
      if (s.isPaid && s.subscribedTier === "Free") { alert("Your account is on the Free plan. Nothing to pay."); return; }
      return _subscribe("Free");
    }
    return openCheckout(t);
  }
  window.payAccountSubscription = openBill;

  function billTable() {
    const n = headcount();
    const rows = owned().map((c) => `<div class="payslip-line"><span>${esc(c.name || "Company")}</span><span>${active(c)}</span></div>`).join("");
    return `<div style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">ACTIVE EMPLOYEES</div>
      ${rows}<div class="payslip-line total"><span>Total</span><span>${n}</span></div>
      <div style="font-size:12px;color:var(--ink);margin-top:8px;">${billLine(n, billTier())}</div></div>`;
  }

  // ---------- M-Pesa checkout ----------
  async function openCheckout(tier) {
    if (!state.accountNumber) await loadBilling();
    const n = headcount();
    const amount = price(tier, n);
    let last = null;
    if (state.activeClient) {
      const r = await sb.from("subscription_requests").select("*").eq("company_id", state.activeClient)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      last = r.data;
    }
    const s = sub(), c = state.clients[state.activeClient];
    const running = s.isPaid && s.paidUntil && !isExpired();
    openPanel(`
      <div class="settings-panel">
        <div style="background:${G};color:#fff;margin:-18px -20px 16px;padding:14px 20px;border-radius:6px 6px 0 0;">
          <div style="font-weight:800;font-size:18px;letter-spacing:.02em;">M-PESA</div>
          <div style="font-size:12px;opacity:.9;">${esc(tier)} plan &middot; Account <span class="mono">${esc(state.accountNumber || "")}</span></div>
        </div>
        ${tier === "Test" ? "" : billTable()}
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid var(--ink);padding-top:8px;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:600;">Amount due (1 month)</span>
          <span class="mono" style="font-size:20px;font-weight:600;">${kes(amount)}</span>
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:14px;">
          ${running ? `Currently paid until ${fmtDate(s.paidUntil)}. This payment adds a month on top.` : "Your plan activates for all your companies once M-Pesa confirms payment."}
        </div>
        <form onsubmit="mpesaSubmitX(event, '${esc(tier)}')">
          <div class="settings-grid">
            <div class="settings-field"><label>First name</label><input name="firstName" required value="${esc(last?.first_name || "")}"/></div>
            <div class="settings-field"><label>Last name</label><input name="lastName" required value="${esc(last?.last_name || "")}"/></div>
            <div class="settings-field"><label>Email</label><input type="email" name="email" required value="${esc(last?.email || state.currentUserEmail || "")}"/></div>
            <div class="settings-field"><label>County</label>
              <select name="county" required style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:7px 8px;font-size:12.5px;">
                <option value="">Select County</option>
                ${KENYA_COUNTIES.map((k) => `<option ${last?.county === k ? "selected" : ""}>${k}</option>`).join("")}
              </select></div>
            <div class="settings-field" style="grid-column:1 / -1;"><label>M-Pesa number (you'll get the payment prompt here)</label>
              <input type="tel" name="mpesaPhone" required inputmode="numeric" placeholder="0712 345 678" value="${esc(last?.phone || c?.phone || "")}"/></div>
          </div>
          <label style="display:flex;align-items:flex-start;gap:8px;font-size:11.5px;color:var(--muted);margin-top:14px;">
            <input type="checkbox" name="tosAgree" required style="margin-top:2px;accent-color:${G};"/>
            I have read and understood Edhafu Payroll's Terms of Service</label>
          <button id="mpPayBtnX" type="submit" class="btn" style="margin-top:16px;width:100%;background:${G};border-color:${G};color:#fff;font-weight:700;font-size:14px;padding:11px;">Pay ${kes(amount)} with M-Pesa</button>
          <div id="mpStatusX" role="status" aria-live="polite" style="margin-top:12px;font-size:12.5px;min-height:18px;"></div>
        </form>
      </div>`);
  }
  function status(msg, err) {
    const el = document.getElementById("mpStatusX");
    if (!el) return;
    el.style.color = err ? "#EF4444" : "var(--ink)";
    el.textContent = msg;
  }
  async function poll(id) {
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const { data } = await sb.rpc("get_payment_status", { p_checkout: id });
      const row = data && data[0];
      if (row && row.status !== "PENDING") return row;
    }
    return null;
  }
  window.mpesaSubmitX = async function (evt, tier) {
    evt.preventDefault();
    if (busy) return;
    const f = evt.target, btn = document.getElementById("mpPayBtnX");
    const body = { tier, company_id: state.activeClient, phone: f.mpesaPhone.value.trim(),
      first_name: f.firstName.value.trim(), last_name: f.lastName.value.trim(), email: f.email.value.trim(), county: f.county.value };
    busy = true; btn.disabled = true;
    status("Sending the payment prompt to your phone...");
    const { data, error } = await sb.functions.invoke("mpesa-stkpush", { body });
    let result = data;
    if (error) { try { result = await error.context.json(); } catch (_) { result = { ok: false, error: error.message }; } }
    if (!result || !result.ok) { busy = false; btn.disabled = false; return status((result && result.error) || "Couldn't start the payment. Try again.", true); }
    status("Check your phone and enter your M-Pesa PIN to confirm.");
    const row = await poll(result.checkout_request_id);
    busy = false; btn.disabled = false;
    if (!row) return status("M-Pesa hasn't confirmed yet. If you entered your PIN, your plan will activate within a few minutes. Refresh to check.", true);
    if (row.status === "CANCELLED") return status("You cancelled the prompt on your phone. No money was taken.", true);
    if (row.status !== "SUCCESS") return status(`The payment didn't go through (${row.result_desc || "unknown reason"}).`, true);
    await sleep(1500);
    const fresh = ((await sb.rpc("get_payment_status", { p_checkout: result.checkout_request_id })).data || [])[0] || row;
    state.subscription.isPaid = true; state.subscription.subscribedTier = tier; state.subscription.paidUntil = fresh.paid_until;
    if (state.activeClient) logAudit("Subscription paid", `${tier} plan, account ${fresh.account_number}, M-Pesa ${row.mpesa_receipt}, ${kes(row.mpesa_amount)}`);
    render();
    openPanel(`
      <div class="settings-panel" style="position:relative;">
        <div style="position:absolute;top:18px;right:20px;border:3px solid ${G};color:${G};border-radius:4px;font-weight:800;letter-spacing:.12em;padding:2px 8px;transform:rotate(-8deg);">PAID</div>
        <h3 style="font-size:16px;font-family:'Fraunces',serif;font-weight:600;margin-bottom:14px;">Payment received</h3>
        <div class="payslip-line"><span>Account number</span><span>${esc(fresh.account_number)}</span></div>
        <div class="payslip-line"><span>M-Pesa receipt</span><span>${esc(row.mpesa_receipt)}</span></div>
        <div class="payslip-line"><span>Amount</span><span>${kes(row.mpesa_amount)}</span></div>
        <div class="payslip-line"><span>Plan</span><span>${esc(tier)}</span></div>
        <div class="payslip-line"><span>Companies covered</span><span>${owned().length}</span></div>
        ${fresh.paid_until ? `<div class="payslip-line total"><span>Active until</span><span>${fmtDate(fresh.paid_until)}</span></div>` : ""}
        <button class="btn primary" style="margin-top:16px;width:100%;" onclick="closePanel()">Done</button>
      </div>`);
  };

  // ---------- Top billing bar ----------
  function barHtml() {
    const s = sub(), n = headcount(), t = billTier(), amt = price(t, n);
    const d = s.paidUntil ? Math.ceil((new Date(s.paidUntil) - new Date()) / 86400000) : null;
    let text, bg = "var(--panel)", border = "var(--line)", color = "var(--ink)", btn = `Pay ${kes(amt)}`;
    const red = () => { bg = "rgba(239,68,68,0.08)"; border = "rgba(239,68,68,0.35)"; color = "#B3261E"; };
    if (s.isPaid && s.subscribedTier !== "Free") {
      const tier = esc(s.subscribedTier || "Paid");
      if (!s.paidUntil) text = `<strong>${tier}</strong> plan, active`;
      else if (d <= 0) { text = `<strong>${tier}</strong> plan <strong>expired on ${fmtDate(s.paidUntil)}</strong>`; red(); btn = `Renew ${kes(amt)}`; }
      else if (d <= 7) { text = `<strong>${tier}</strong> plan, expires <strong>${fmtDate(s.paidUntil)}</strong> (${d} day${d === 1 ? "" : "s"} left)`; bg = "rgba(245,158,11,0.10)"; border = "rgba(245,158,11,0.40)"; color = "#92400E"; btn = `Renew ${kes(amt)}`; }
      else { text = `<strong>${tier}</strong> plan, paid until <strong>${fmtDate(s.paidUntil)}</strong>`; btn = `Renew ${kes(amt)}`; }
    } else if (s.isPaid && s.subscribedTier === "Free") {
      if (t === "Free") text = "<strong>Free plan</strong>: 1 company, up to 2 employees";
      else { text = "<strong>Free plan outgrown</strong>: pay to keep running payroll"; red(); }
    } else if (s.trialPeriodUsed) {
      text = `<strong>Free trial used</strong> (${esc(s.trialPeriodUsed)}). Subscribe to keep running payroll.`; red();
    } else {
      text = "<strong>Free trial</strong>: 1 payroll cycle and 1 company";
    }
    const hide = t === "Free" && s.isPaid && s.subscribedTier === "Free";
    if (t === "Free" && !hide) btn = "Activate Free plan";
    return `<div id="mpBillingBarX" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:${bg};border:1px solid ${border};border-radius:6px;padding:10px 14px;margin-bottom:18px;font-size:12.5px;">
      <span style="color:${color};">${text}</span>
      ${state.accountNumber ? `<span style="color:var(--muted);">Account <strong class="mono" style="color:var(--ink);">${esc(state.accountNumber)}</strong></span>` : ""}
      <span style="color:var(--muted);">${n} employee${n === 1 ? "" : "s"}, ${t} plan</span>
      ${hide ? "" : `<button class="btn" style="margin-left:auto;background:${G};border-color:${G};color:#fff;font-weight:600;" onclick="payAccountSubscription()">${btn}</button>`}
    </div>`;
  }
  const _render = window.render;
  window.render = function () {
    _render();
    const p = document.querySelector('#mainArea button[onclick="openCompanyProfilePanel()"]');
    if (p) [...p.parentElement.children].forEach((el) => { if (el !== p) el.remove(); });
    ["mpBillingBar"].forEach((id) => { const old = document.getElementById(id); if (old) old.remove(); });
    const main = document.getElementById("mainArea");
    if (main && state.currentUserId && !document.getElementById("mpBillingBarX")) main.insertAdjacentHTML("afterbegin", barHtml());
  };

  // ---------- Company profile: note instead of plan cards ----------
  window.renderPlanSection = function () {
    return `<div style="margin-top:22px;padding:12px 14px;border:1px dashed var(--line);border-radius:6px;font-size:12px;color:var(--muted);">
      Billing covers your whole account, not individual companies. Your plan, paid-until date and payment button are in the bar at the top of the page${state.accountNumber ? ` (account <strong class="mono" style="color:var(--ink);">${esc(state.accountNumber)}</strong>)` : ""}.</div>`;
  };

  // ---------- Account panel: account number ----------
  const _account = window.openAccountPanel;
  window.openAccountPanel = function () {
    _account();
    const panel = document.querySelector("#panelContent .settings-panel");
    const h = panel && panel.querySelector("h3");
    if (!h || !state.accountNumber) return;
    const s = sub();
    const plan = s.isPaid ? `${esc(s.subscribedTier || "Paid")}${s.paidUntil ? `, ${isExpired() ? "expired" : "paid until"} ${fmtDate(s.paidUntil)}` : ""}` : "Not subscribed";
    h.insertAdjacentHTML("afterend", `
      <div style="font-size:13px;padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;"><span style="color:var(--muted);">Account number</span><span class="mono" style="font-weight:600;">${esc(state.accountNumber)}</span></div>
      <div style="font-size:13px;padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;"><span style="color:var(--muted);">Plan</span><span>${plan}</span></div>`);
  };

  // ---------- One company on free trial / Free plan ----------
  const _addClient = window.addClient;
  window.addClient = function () {
    if (isRestricted() && owned().length >= 1) {
      alert("On the free trial or Free plan your account can have one company. Pay for a subscription to add more companies.");
      return openBill();
    }
    return _addClient();
  };

  // ---------- Platform Admin: paid/trial control per ACCOUNT ----------
  const _admin = window.renderAdminPanelContent;
  window.renderAdminPanelContent = function () {
    _admin();
    const panel = document.getElementById("panelContent");
    if (!panel || typeof adminDataCache === "undefined" || !adminDataCache) return;
    panel.querySelectorAll('button[onclick^="adminToggleAccountPaidStatus"]').forEach((b) => b.remove());
    const h = [...panel.querySelectorAll("h3")].find((x) => x.textContent.trim().startsWith("All accounts"));
    const list = h && h.nextElementSibling;
    if (!list) return;
    [...list.children].forEach((row) => {
      const email = row.querySelector("span") && row.querySelector("span").textContent.trim();
      const b = adminDataCache.billingByEmail[email];
      if (!email || !b || !b.user_id) return;
      row.style.alignItems = "center";
      const wrap = document.createElement("span");
      wrap.style.cssText = "display:flex;align-items:center;gap:8px;flex-shrink:0;";
      const label = document.createElement("span");
      label.textContent = b.is_paid ? (b.subscribed_tier || "Paid") : "Trial";
      label.style.cssText = "font-size:11px;white-space:nowrap;color:" + (b.is_paid ? "var(--gold)" : "#EF4444") + ";";
      const toggle = document.createElement("button");
      toggle.className = "btn";
      toggle.style.cssText = "font-size:10.5px;padding:4px 8px;";
      toggle.textContent = b.is_paid ? "Move to trial" : "Activate";
      toggle.addEventListener("click", () => adminToggleAccountPaidStatus(b.user_id, email, !!b.is_paid));
      wrap.append(label, toggle);
      row.appendChild(wrap);
    });
  };
})();