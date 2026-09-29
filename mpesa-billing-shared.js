/* mpesa-billing-shared.js - payment is for the SUBSCRIBER (company owner) only.
   People with shared access see the owner's plan, cannot pay, and their access
   to a shared company follows the OWNER's subscription. Load AFTER mpesa-billing-extra.js */
(function () {
  const fmtDate = (d) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const owned = () => Object.values(state.clients || {}).filter((c) => c.ownerId === state.currentUserId);
  const isShared = (c) => !!c && c.ownerId !== state.currentUserId;

  // ---------- Owner's billing for each shared company ----------
  async function loadOwnerBilling() {
    const shared = Object.entries(state.clients || {}).filter(([, c]) => isShared(c));
    await Promise.all(shared.map(async ([id, c]) => {
      const { data } = await sb.rpc("get_company_owner_billing", { p_company_id: id });
      c.ownerBilling = (data && data[0]) || null;
    }));
  }
  const _fetch = window.fetchAllData;
  window.fetchAllData = async function () { await _fetch(); await loadOwnerBilling(); };
  (async function waitForClients() {
    for (let i = 0; i < 60; i++) {
      if (state.currentUserId && Object.keys(state.clients || {}).length) { await loadOwnerBilling(); render(); return; }
      await sleep(500);
    }
  })();

  function ownerActive(c) {
    const b = c.ownerBilling;
    if (!b) return false;
    if (b.is_paid) return !b.paid_until || new Date(b.paid_until) > new Date();
    return !b.trial_period_used || b.trial_period_used === (c.period || "");   // owner still in trial cycle
  }
  function ownerStatus(c) {
    const b = c.ownerBilling;
    if (!b) return "plan status unavailable";
    if (b.is_paid) {
      if (!b.paid_until) return `${esc(b.subscribed_tier || "Paid")} plan, active`;
      return new Date(b.paid_until) > new Date()
        ? `${esc(b.subscribed_tier || "Paid")} plan, paid until ${fmtDate(b.paid_until)}`
        : `${esc(b.subscribed_tier || "Paid")} plan, expired on ${fmtDate(b.paid_until)}`;
    }
    return b.trial_period_used ? `free trial used (${esc(b.trial_period_used)})` : "free trial";
  }

  // ---------- Only the subscriber can pay ----------
  function payBlockReason() {
    const c = state.clients[state.activeClient];
    if (owned().length === 0) {
      return "Only the account owner (subscriber) can pay. The companies you can see are shared with you and billed to their owners.";
    }
    if (isShared(c)) {
      return `"${c.name}" is shared with you and billed to its owner${c.ownerBilling ? ` (${c.ownerBilling.owner_email})` : ""}. Switch to one of your own companies to manage your own subscription.`;
    }
    return null;
  }
  const _pay = window.payAccountSubscription;
  window.payAccountSubscription = function () {
    const m = payBlockReason();
    if (m) { alert(m); return; }
    return _pay();
  };
  const _subscribe = window.subscribeToTier;
  window.subscribeToTier = function (tier) {
    const m = payBlockReason();
    if (m) { alert(m); return; }
    return _subscribe(tier);
  };

  // ---------- Shared company access follows the OWNER's subscription ----------
  const _requireAccess = window.requireAccess;
  window.requireAccess = function (c) {
    if (isShared(c) && !state.isPlatformAdmin) {
      if (!hasRealClientName(c)) { alert("This company needs a real name before running payroll."); return false; }
      if (ownerActive(c)) return true;
      alert(`The subscription covering "${c.name}" is inactive (${ownerStatus(c)}). Ask the owner${c.ownerBilling ? ` (${c.ownerBilling.owner_email})` : ""} to renew.`);
      return false;
    }
    return _requireAccess(c);
  };

  // ---------- Bar: owner's status on shared companies, no Pay button ----------
  const _render = window.render;
  window.render = function () {
    _render();
    const bar = document.getElementById("mpBillingBarX");
    if (!bar) return;
    const c = state.clients[state.activeClient];
    if (isShared(c)) {
      const ok = ownerActive(c);
      bar.style.background = ok ? "var(--panel)" : "rgba(239,68,68,0.08)";
      bar.style.borderColor = ok ? "var(--line)" : "rgba(239,68,68,0.35)";
      bar.innerHTML = `<span style="color:${ok ? "var(--ink)" : "#B3261E"};">
        <strong>Shared company</strong>, billed to its owner${c.ownerBilling ? ` <strong>${esc(c.ownerBilling.owner_email)}</strong>` : ""}: ${ownerStatus(c)}.
        ${ok ? "" : "Ask the owner to renew."}</span>`;
    } else if (owned().length === 0) {
      bar.innerHTML = `<span style="color:var(--muted);">You don't own any companies yet. Companies shared with you are billed to their owners.</span>`;
    }
  };
})();
