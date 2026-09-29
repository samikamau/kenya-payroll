/* mpesa-billing-extra.js - billing controls at ACCOUNT level only.
   Load AFTER mpesa-billing.js */
(function () {
  // 1. Company profile: no plan cards, just a note
  window.renderPlanSection = function () {
    return `<div style="margin-top:22px;padding:12px 14px;border:1px dashed var(--line);border-radius:6px;font-size:12px;color:var(--muted);">
      Billing covers your whole account, not individual companies. Your plan, paid-until date and payment button
      are in the bar at the top of the page${state.accountNumber ? ` (account <strong class="mono" style="color:var(--ink);">${esc(state.accountNumber)}</strong>)` : ""}.
    </div>`;
  };

  // 2. Payroll page: remove company-level paid/trial badges and admin buttons
  const _render = window.render;
  window.render = function () {
    _render();
    const btn = document.querySelector('#mainArea button[onclick="openCompanyProfilePanel()"]');
    if (btn) [...btn.parentElement.children].forEach((el) => { if (el !== btn) el.remove(); });
  };

  // 3. Platform Admin: paid/trial control on ACCOUNTS, not companies
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