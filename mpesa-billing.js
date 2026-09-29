/* mpesa-billing.js - Edhafu Payroll: M-Pesa payment for account plans.
   Works with the account-level billing in index.html (state.subscription, PRICING_TIERS,
   calcTierPrice). Each subscriber has an account number (EP2050, EP2051 ...), and each
   payment adds one month. Free keeps its existing flow.
   Load AFTER the main inline script:  <script src="mpesa-billing.js"></script>        */
(function () {
  const MPESA_GREEN = "#00A651";
  const kes = (n) => "KES " + Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });
  const fmtDate = (d) => new Date(d).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi",
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let busy = false;

  // Billing is on the companies the subscriber OWNS (shared companies are billed to their owner)
  function ownedCompanies() {
    return Object.values(state.clients || {}).filter((c) => c.ownerId === state.currentUserId);
  }
  function ownedEmployeeTotal() {
    return ownedCompanies().reduce((s, c) =>
      s + c.employees.filter((e) => e.name && e.name.trim() && e.employmentStatus !== "Terminated").length, 0);
  }
  function previewPrice(tier, n) {
    if (tier === "Test") return 1;
    return calcTierPrice(tier, n);         // same function the app uses for display
  }
  function isExpired() {
    const s = state.subscription || {};
    return !!(s.isPaid && s.paidUntil && new Date(s.paidUntil) <= new Date());
  }
  function suggestTier() {
    const n = ownedEmployeeTotal();
    return n > 15 ? "Enterprise" : "Starter";
  }
  function realTier(t) {
    return t && t !== "Free" && t !== "Test" ? t : suggestTier();
  }

  // The plan is decided by headcount (owned companies), never chosen
  function billTier() {
    return getTierForCount(ownedEmployeeTotal()).name;
  }
  function billLine(n) {
    const tier = billTier();
    if (tier === "Free") return `Free plan (up to 2 employees): ${kes(0)}`;
    if (tier === "Starter") {
      return n <= 5
        ? `Starter, up to 5 employees: ${kes(500)}`
        : `Starter: ${kes(500)} for the first 5 + ${n - 5} &times; ${kes(100)} = ${kes(calcTierPrice("Starter", n))}`;
    }
    return `Enterprise: ${kes(1500)} for the first 15 + ${n - 15} &times; ${kes(30)} = ${kes(calcTierPrice("Enterprise", n))}`;
  }
  function billTableHtml() {
    const n = ownedEmployeeTotal();
    const rows = ownedCompanies().map((c) => {
      const k = c.employees.filter((e) => e.name && e.name.trim() && e.employmentStatus !== "Terminated").length;
      return `<div class="payslip-line"><span>${esc(c.name || "Company")}</span><span>${k}</span></div>`;
    }).join("");
    return `
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">ACTIVE EMPLOYEES</div>
        ${rows}
        <div class="payslip-line total"><span>Total</span><span>${n}</span></div>
        <div style="font-size:12px;color:var(--ink);margin-top:8px;">${billLine(n)}</div>
      </div>`;
  }

  /* ---------- Load account number and paid-until ---------- */
  async function loadBilling() {
    const { data } = await sb.rpc("get_my_subscriber");
    const row = data?.[0];
    if (!row) return;
    state.accountNumber = row.account_number;
    if (state.subscription) state.subscription.paidUntil = row.paid_until;
    if (typeof render === "function" && state.currentUserId) render();
  }
  const _origFetch = window.fetchAllData;
  window.fetchAllData = async function () { await _origFetch(); await loadBilling(); };
  (async function waitForLogin() {
    for (let i = 0; i < 60; i++) {
      if (state && state.currentUserId && state.subscription) { await loadBilling(); return; }
      await sleep(500);
    }
  })();

  /* ---------- Access gate: expired paid plans must renew ---------- */
  const _origRequireAccess = window.requireAccess;
  window.requireAccess = function (c) {
    if (isExpired()) {
      alert(`Your ${state.subscription.subscribedTier || ""} plan expired on ${fmtDate(state.subscription.paidUntil)}. Renew with M-Pesa to continue.`);
      openBill();
      return false;
    }
    return _origRequireAccess(c);
  };

  /* ---------- Plan section: account number, paid until, Renew ---------- */
  const _origPlan = window.renderPlanSection;
  window.renderPlanSection = function (c) {
    const n0 = ownedEmployeeTotal();
    const tier0 = billTier();
    const amt0 = tier0 === "Free" ? 0 : calcTierPrice(tier0, n0);
    let html = `
      <h3 style="font-size:13px;color:var(--gold);font-family:'Inter',sans-serif;font-weight:600;margin-top:22px;margin-bottom:10px;">Plan &amp; billing</h3>
      ${billTableHtml()}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:2px solid var(--ink);padding-top:8px;">
        <span style="font-weight:600;">Monthly bill</span>
        <span class="mono" style="font-weight:600;">${kes(amt0)}</span>
      </div>
      ${tier0 === "Free" && !(state.subscription.isPaid && state.subscription.subscribedTier === "Free")
        ? `<button class="btn" style="margin-top:10px;width:100%;" onclick="openPlanChooser()">Activate Free plan</button>`
        : tier0 !== "Free" ? `<button class="btn" style="margin-top:10px;width:100%;background:${MPESA_GREEN};border-color:${MPESA_GREEN};color:#fff;font-weight:700;" onclick="openPlanChooser()">Pay ${kes(amt0)} with M-Pesa</button>` : ""}`;
    const s = state.subscription || {};
    const exp = isExpired();
    html += `
      <div style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px;">
        ${state.accountNumber ? `<span style="color:var(--muted);">Account <strong class="mono" style="color:var(--ink);">${esc(state.accountNumber)}</strong></span>` : ""}
        ${s.isPaid && s.paidUntil ? `<span style="color:${exp ? "#EF4444" : "var(--muted)"};">${exp ? "Expired on" : "Paid until"} <strong>${fmtDate(s.paidUntil)}</strong></span>` : ""}
      </div>`;
    return html;
  };

  /* ---------- Account panel: show the account number ---------- */
  const _origAccount = window.openAccountPanel;
  window.openAccountPanel = function () {
    _origAccount();
    const panel = document.querySelector("#panelContent .settings-panel");
    if (!panel || !state.accountNumber) return;
    const s = state.subscription || {};
    const planText = s.isPaid
      ? `${esc(s.subscribedTier || "Paid")}${s.paidUntil ? `, ${isExpired() ? "expired" : "paid until"} ${fmtDate(s.paidUntil)}` : ""}`
      : "Not subscribed";
    const rows = `
      <div style="font-size:13px;color:var(--ink);padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;">
        <span style="color:var(--muted);">Account number</span><span class="mono" style="font-weight:600;">${esc(state.accountNumber)}</span>
      </div>
      <div style="font-size:13px;color:var(--ink);padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;">
        <span style="color:var(--muted);">Plan</span><span>${planText}</span>
      </div>`;
    const heading = panel.querySelector("h3");
    if (heading) heading.insertAdjacentHTML("afterend", rows);
  };

  /* ---------- Subscribe: Free keeps the old flow, paid plans go to M-Pesa ---------- */
  const _origSubscribe = window.subscribeToTier;
  window.subscribeToTier = function (tierName) {
    if (tierName === "Test") return openMpesaCheckout("Test");
    return openBill();
  };
  // One exact bill based on headcount
  function openBill() {
    const tier = billTier();
    const s = state.subscription || {};
    if (tier === "Free") {
      if (s.isPaid && s.subscribedTier === "Free") {
        alert("Your account is on the Free plan (up to 2 employees). Nothing to pay.");
        return;
      }
      return _origSubscribe("Free");          // existing Free activation form
    }
    return openMpesaCheckout(tier);
  }

  async function openMpesaCheckout(tierName) {
    if (!state.accountNumber) await loadBilling();
    const n = ownedEmployeeTotal();
    const companies = ownedCompanies().length;
    if (tierName === "Starter" && n > 15) {
      alert(`Your account has ${n} active employees across your companies. The Starter plan covers up to 15, please choose Enterprise.`);
      return;
    }
    const amount = previewPrice(tierName, n);
    let last = null;
    if (state.activeClient) {
      const res = await sb.from("subscription_requests").select("*")
        .eq("company_id", state.activeClient).order("created_at", { ascending: false }).limit(1).maybeSingle();
      last = res.data;
    }
    const s = state.subscription || {};
    const active = s.isPaid && s.paidUntil && !isExpired();
    const c = state.clients[state.activeClient];

    openPanel(`
      <div class="settings-panel">
        <div style="background:${MPESA_GREEN};color:#fff;margin:-18px -20px 16px;padding:14px 20px;border-radius:6px 6px 0 0;">
          <div style="font-weight:800;font-size:18px;letter-spacing:.02em;">M-PESA</div>
          <div style="font-size:12px;opacity:.9;">${esc(tierName)} plan &middot; Account <span class="mono">${esc(state.accountNumber || "")}</span></div>
        </div>
        ${tierName === "Test" ? "" : billTableHtml()}
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;border-top:2px solid var(--ink);padding-top:8px;">
          <span style="font-size:13px;font-weight:600;color:var(--ink);">Amount due (1 month)</span>
          <span class="mono" style="font-size:20px;font-weight:600;color:var(--ink);">${kes(amount)}</span>
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:14px;">
          ${active ? `Currently paid until ${fmtDate(s.paidUntil)}. This payment adds a month on top.` : "Your plan activates for all your companies as soon as M-Pesa confirms payment."}
        </div>
        <form onsubmit="mpesaSubmit(event, '${esc(tierName)}')">
          <div class="settings-grid">
            <div class="settings-field"><label>First name</label><input name="firstName" required value="${esc(last?.first_name || "")}"/></div>
            <div class="settings-field"><label>Last name</label><input name="lastName" required value="${esc(last?.last_name || "")}"/></div>
            <div class="settings-field"><label>Email</label><input type="email" name="email" required value="${esc(last?.email || state.currentUserEmail || "")}"/></div>
            <div class="settings-field">
              <label>County</label>
              <select name="county" required style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:7px 8px;font-size:12.5px;">
                <option value="">Select County</option>
                ${KENYA_COUNTIES.map((k) => `<option ${last?.county === k ? "selected" : ""}>${k}</option>`).join("")}
              </select>
            </div>
            <div class="settings-field" style="grid-column:1 / -1;">
              <label>M-Pesa number (you'll get the payment prompt here)</label>
              <input type="tel" name="mpesaPhone" required inputmode="numeric" placeholder="0712 345 678" value="${esc(last?.phone || c?.phone || "")}"/>
            </div>
          </div>
          <label style="display:flex;align-items:flex-start;gap:8px;font-size:11.5px;color:var(--muted);margin-top:14px;">
            <input type="checkbox" name="tosAgree" required style="margin-top:2px;accent-color:${MPESA_GREEN};"/>
            I have read and understood Edhafu Payroll's Terms of Service
          </label>
          <button id="mpPayBtn" type="submit" class="btn" style="margin-top:16px;width:100%;background:${MPESA_GREEN};border-color:${MPESA_GREEN};color:#fff;font-weight:700;font-size:14px;padding:11px;">
            Pay ${kes(amount)} with M-Pesa
          </button>
          <div id="mpStatus" role="status" aria-live="polite" style="margin-top:12px;font-size:12.5px;min-height:18px;"></div>
        </form>
      </div>
    `);
  }

  function showStatus(msg, isError, waiting) {
    const el = document.getElementById("mpStatus");
    if (!el) return;
    el.style.color = isError ? "#EF4444" : "var(--ink)";
    el.innerHTML = waiting
      ? `<span class="mp-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${MPESA_GREEN};margin-right:8px;"></span>${esc(msg)}`
      : esc(msg);
  }
  if (!document.getElementById("mpPulseStyle")) {
    const st = document.createElement("style");
    st.id = "mpPulseStyle";
    st.textContent = "@keyframes mpPulse{50%{opacity:.25}} .mp-dot{animation:mpPulse 1.3s ease-in-out infinite} @media (prefers-reduced-motion: reduce){.mp-dot{animation:none}}";
    document.head.appendChild(st);
  }

  function friendly(err) {
    if (!err) return "Couldn't start the payment. Try again.";
    if (err.includes("Invalid Safaricom number")) return "Enter a Safaricom number, for example 0712 345 678.";
    if (err.includes("Not signed in")) return "Your session has ended. Sign in again and retry.";
    return err;
  }

  async function poll(checkoutId) {
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const { data } = await sb.rpc("get_payment_status", { p_checkout: checkoutId });
      const row = data?.[0];
      if (row && row.status !== "PENDING") return row;
    }
    return null;
  }

  window.mpesaSubmit = async function (evt, tierName) {
    evt.preventDefault();
    if (busy) return;
    const f = evt.target;
    const btn = document.getElementById("mpPayBtn");
    const body = {
      tier: tierName, company_id: state.activeClient,
      phone: f.mpesaPhone.value.trim(),
      first_name: f.firstName.value.trim(), last_name: f.lastName.value.trim(),
      email: f.email.value.trim(), county: f.county.value,
    };

    busy = true; btn.disabled = true;
    showStatus("Sending the payment prompt to your phone...", false, true);

    const { data, error } = await sb.functions.invoke("mpesa-stkpush", { body });
    let result = data;
    if (error) {
      try { result = await error.context.json(); } catch (_) { result = { ok: false, error: error.message }; }
    }
    if (!result?.ok) {
      busy = false; btn.disabled = false;
      return showStatus(friendly(result?.error), true);
    }

    showStatus("Check your phone and enter your M-Pesa PIN to confirm.", false, true);
    const row = await poll(result.checkout_request_id);
    busy = false; btn.disabled = false;

    if (!row) return showStatus("M-Pesa hasn't confirmed yet. If you entered your PIN, your plan will activate within a few minutes. Refresh to check.", true);
    if (row.status === "CANCELLED") return showStatus("You cancelled the prompt on your phone. No money was taken. You can try again.", true);
    if (row.status !== "SUCCESS") return showStatus(`The payment didn't go through (${row.result_desc || "unknown reason"}). You can try again.`, true);

    await sleep(1500);
    const fresh = (await sb.rpc("get_payment_status", { p_checkout: result.checkout_request_id })).data?.[0] || row;

    state.subscription.isPaid = true;
    state.subscription.subscribedTier = tierName;
    state.subscription.paidUntil = fresh.paid_until;
    if (state.activeClient) logAudit("Subscription paid", `${tierName} plan, account ${fresh.account_number}, M-Pesa ${row.mpesa_receipt}, ${kes(row.mpesa_amount)}`);
    render();

    openPanel(`
      <div class="settings-panel" style="position:relative;">
        <div style="position:absolute;top:18px;right:20px;border:3px solid ${MPESA_GREEN};color:${MPESA_GREEN};border-radius:4px;font-weight:800;letter-spacing:.12em;padding:2px 8px;transform:rotate(-8deg);">PAID</div>
        <h3 style="font-size:16px;color:var(--ink);font-family:'Fraunces',serif;font-weight:600;margin-bottom:14px;">Payment received</h3>
        <div class="payslip-line"><span>Account number</span><span>${esc(fresh.account_number)}</span></div>
        <div class="payslip-line"><span>M-Pesa receipt</span><span>${esc(row.mpesa_receipt)}</span></div>
        <div class="payslip-line"><span>Amount</span><span>${kes(row.mpesa_amount)}</span></div>
        <div class="payslip-line"><span>Plan</span><span>${esc(tierName)}</span></div>
        <div class="payslip-line"><span>Companies covered</span><span>${ownedCompanies().length}</span></div>
        ${fresh.paid_until ? `<div class="payslip-line total"><span>Active until</span><span>${fmtDate(fresh.paid_until)}</span></div>` : ""}
        <button class="btn primary" style="margin-top:16px;width:100%;" onclick="closePanel()">Done</button>
      </div>
    `);
  };

  /* =====================================================================
     BILLING BAR, PLAN CHOOSER, ONE-COMPANY LIMIT
     ===================================================================== */

  // Free trial, Free plan, or expired = restricted (one company)
  function isRestricted() {
    if (state.isPlatformAdmin) return false;
    const s = state.subscription || {};
    return !(s.isPaid && s.subscribedTier !== "Free" && !isExpired());
  }
  function daysLeft() {
    const s = state.subscription || {};
    if (!s.paidUntil) return null;
    return Math.ceil((new Date(s.paidUntil) - new Date()) / 86400000);
  }

  // ---- Bar shown at the top of every page ----
  function billingBarHtml() {
    const s = state.subscription || {};
    const acct = state.accountNumber
      ? `<span style="color:var(--muted);">Account <strong class="mono" style="color:var(--ink);">${esc(state.accountNumber)}</strong></span>` : "";
    let text, tone = "var(--ink)", bg = "var(--panel)", border = "var(--line)", btnLabel = "Pay Subscription";

    if (s.isPaid && s.subscribedTier !== "Free") {
      const d = daysLeft();
      const tier = esc(s.subscribedTier || "Paid");
      if (d === null) {
        text = `<strong>${tier}</strong> plan, active`;
      } else if (d <= 0) {
        text = `<strong>${tier}</strong> plan <strong>expired on ${fmtDate(s.paidUntil)}</strong>. Payroll exports are locked until you renew.`;
        tone = "#B3261E"; bg = "rgba(239,68,68,0.08)"; border = "rgba(239,68,68,0.35)"; btnLabel = "Renew now";
      } else if (d <= 7) {
        text = `<strong>${tier}</strong> plan, expires <strong>${fmtDate(s.paidUntil)}</strong> (${d} day${d === 1 ? "" : "s"} left)`;
        tone = "#92400E"; bg = "rgba(245,158,11,0.10)"; border = "rgba(245,158,11,0.40)"; btnLabel = "Renew";
      } else {
        text = `<strong>${tier}</strong> plan, paid until <strong>${fmtDate(s.paidUntil)}</strong>`;
        btnLabel = "Renew";
      }
    } else if (s.isPaid && s.subscribedTier === "Free") {
      text = `<strong>Free plan</strong>: up to 2 employees and 1 company`;
    } else if (s.trialPeriodUsed) {
      text = `<strong>Free trial used</strong> (${esc(s.trialPeriodUsed)}). Subscribe to keep running payroll.`;
      tone = "#B3261E"; bg = "rgba(239,68,68,0.08)"; border = "rgba(239,68,68,0.35)";
    } else {
      text = `<strong>Free trial</strong>: 1 payroll cycle and 1 company`;
    }

    const n = ownedEmployeeTotal();
    const tier = billTier();
    const amt = tier === "Free" ? 0 : calcTierPrice(tier, n);
    const hideBtn = tier === "Free" && s.isPaid && s.subscribedTier === "Free";
    if (tier !== "Free") btnLabel = `${btnLabel === "Pay Subscription" ? "Pay" : btnLabel} ${kes(amt)}`;
    else if (!hideBtn) btnLabel = "Activate Free plan";
    const billNote = `<span style="color:var(--muted);">${n} employee${n === 1 ? "" : "s"}, ${tier} plan</span>`;
    return `
      <div id="mpBillingBar" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;
           background:${bg};border:1px solid ${border};border-radius:6px;padding:10px 14px;margin-bottom:18px;font-size:12.5px;">
        <span style="color:${tone};">${text}</span>
        ${acct}
        ${billNote}
        ${hideBtn ? "" : `<button class="btn" style="margin-left:auto;background:${MPESA_GREEN};border-color:${MPESA_GREEN};color:#fff;font-weight:600;"
          onclick="openPlanChooser()">${btnLabel}</button>`}
      </div>`;
  }

  const _origRender = window.render;
  window.render = function () {
    _origRender();
    const main = document.getElementById("mainArea");
    if (main && state.currentUserId && !document.getElementById("mpBillingBar")) {
      main.insertAdjacentHTML("afterbegin", billingBarHtml());
    }
  };

  // ---- Plan chooser ----
  window.openPlanChooser = function () { openBill(); };

  // ---- One company on free trial / Free plan ----
  const _origAddClient = window.addClient;
  window.addClient = function () {
    if (isRestricted() && ownedCompanies().length >= 1) {
      alert("On the free trial or Free plan your account can have one company. Pay for a subscription to add more companies.");
      openPlanChooser();
      return;
    }
    return _origAddClient();
  };
  const _origSubmitNewClient = window.submitNewClient;
  window.submitNewClient = async function (evt) {
    if (isRestricted() && ownedCompanies().length >= 1) {
      evt.preventDefault();
      alert("On the free trial or Free plan your account can have one company. Pay for a subscription to add more companies.");
      closePanel(); openPlanChooser();
      return;
    }
    return _origSubmitNewClient(evt);
  };
})();
