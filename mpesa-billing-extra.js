/* mpesa-billing-extra.js - account-level billing: top bar with exact bill,
   no company-level controls. Load AFTER mpesa-billing.js */
(function () {
  const G = "#00A651";
  const kes = (n) => "KES " + Number(n || 0).toLocaleString("en-KE");
  const fmtDate = (d) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
  const owned = () => Object.values(state.clients || {}).filter((c) => c.ownerId === state.currentUserId);
  const headcount = () => owned().reduce((s, c) =>
    s + c.employees.filter((e) => e.name && e.name.trim() && e.employmentStatus !== "Terminated").length, 0);

  // Plan decided by headcount: Free = one company and up to 2 employees
  function billTier() {
    const n = headcount();
    if (n <= 2 && owned().length <= 1) return "Free";
    return n <= 15 ? "Starter" : "Enterprise";
  }
  function billAmount() {
    const t = billTier();
    return t === "Free" ? 0 : calcTierPrice(t, headcount());
  }
  window.payAccountSubscription = function () {
    const s = state.subscription || {};
    const t = billTier();
    if (t === "Free") {
      if (s.isPaid && s.subscribedTier === "Free") { alert("Your account is on the Free plan. Nothing to pay."); return; }
      return subscribeToTier("Free");
    }
    return subscribeToTier(t);
  };

  // Account bar at the top of every page
  function barHtml() {
    const s = state.subscription || {};
    const n = headcount(), t = billTier(), amt = billAmount();
    const expired = s.isPaid && s.paidUntil && new Date(s.paidUntil) <= new Date();
    const daysLeft = s.paidUntil ? Math.ceil((new Date(s.paidUntil) - new Date()) / 86400000) : null;
    let text, bg = "var(--panel)", border = "var(--line)", color = "var(--ink)", btn = `Pay ${kes(amt)}`;

    if (s.isPaid && s.subscribedTier !== "Free") {
      const tier = esc(s.subscribedTier || "Paid");
      if (!s.paidUntil) text = `<strong>${tier}</strong> plan, active`;
      else if (expired) { text = `<strong>${tier}</strong> plan <strong>expired on ${fmtDate(s.paidUntil)}</strong>`; bg = "rgba(239,68,68,0.08)"; border = "rgba(239,68,68,0.35)"; color = "#B3261E"; btn = `Renew ${kes(amt)}`; }
      else if (daysLeft <= 7) { text = `<strong>${tier}</strong> plan, expires <strong>${fmtDate(s.paidUntil)}</strong> (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)`; bg = "rgba(245,158,11,0.10)"; border = "rgba(245,158,11,0.40)"; color = "#92400E"; btn = `Renew ${kes(amt)}`; }
      else { text = `<strong>${tier}</strong> plan, paid until <strong>${fmtDate(s.paidUntil)}</strong>`; btn = `Renew ${kes(amt)}`; }
    } else if (s.isPaid && s.subscribedTier === "Free") {
      text = t === "Free" ? `<strong>Free plan</strong>: 1 company, up to 2 employees` : `<strong>Free plan outgrown</strong>: pay to keep running payroll`;
    } else if (s.trialPeriodUsed) {
      text = `<strong>Free trial used</strong> (${esc(s.trialPeriodUsed)}). Subscribe to keep running payroll.`;
      bg = "rgba(239,68,68,0.08)"; border = "rgba(239,68,68,0.35)"; color = "#B3261E";
    } else {
      text = `<strong>Free trial</strong>: 1 payroll cycle and 1 company`;
    }
    const hideBtn = t === "Free" && s.isPaid && s.subscribedTier === "Free";
    if (t === "Free" && !hideBtn) btn = "Activate Free plan";

    return `
      <div id="mpBillingBarX" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:${bg};border:1px solid ${border};border-radius:6px;padding:10px 14px;margin-bottom:18px;font-size:12.5px;">
        <span style="color:${color};">${text}</span>
        ${state.accountNumber ? `<span style="color:var(--muted);">Account <strong class="mono" style="color:var(--ink);">${esc(state.accountNumber)}</strong></span>` : ""}
        <span style="color:var(--muted);">${n} employee${n === 1 ? "" : "s"}, ${t} plan</span>
        ${hideBtn ? "" : `<button class="btn" style="margin-left:auto;background:${G};border-color:${G};color:#fff;font-weight:600;" onclick="payAccountSubscription()">${btn}</button>`}
      </div>`;
  }

  // Company profile: no plan cards, just a note
  window.renderPlanSection = function () {
    return `<div style="margin-top:22px;padding:12px 14px;border:1px dashed var(--line);border-radius:6px;font-size:12px;color:var(--muted);">
      Billing covers your whole account, not individual companies. Your plan, paid-until date and payment button
      are in the bar at the top of the page${state.accountNumber ? ` (account <strong class="mono" style="color:var(--ink);">${esc(state.accountNumber)}</strong>)` : ""}.
    </div>`;
  };

  // After every render: remove company-level badges/buttons, add the account bar
  const _render = window.render;
  window.render = function () {
    _render();
    const profileBtn = document.querySelector('#mainArea button[onclick="openCompanyProfilePanel()"]');
    if (profileBtn) [...profileBtn.parentElement.children].forEach((el) => { if (el !== profileBtn) el.remove(); });
    const main = document.getElementById("mainArea");
    if (main && state.currentUserId && !document.getElementById("mpBillingBar") && !document.getElementById("mpBillingBarX")) {
      main.insertAdjacentHTML("afterbegin", barHtml());
    }
  };
  setTimeout(() => { if (state.currentUserId) render(); }, 1500);

  // Platform Admin: paid/trial control on ACCOUNTS, not companies
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
      const email = row.querySelector("span")?.textContent.trim();
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