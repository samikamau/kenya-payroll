/* ui-tabs.js - Edhafu Payroll: styled view tabs with Payroll as the primary action.
   Load AFTER the main script (and after the billing files). */
(function () {
  const css = `
    .tabs-x { display:flex; gap:6px; padding:5px; margin-bottom:20px; width:fit-content; max-width:100%;
      overflow-x:auto; background:var(--panel-2); border:1px solid var(--line); border-radius:10px; }
    .tab-x { display:flex; align-items:center; gap:8px; padding:9px 16px; border:0; border-radius:7px;
      background:transparent; color:var(--muted); font:500 13px 'Inter',sans-serif; cursor:pointer;
      white-space:nowrap; transition:background .15s, color .15s, box-shadow .15s, transform .15s; }
    .tab-x svg { width:16px; height:16px; flex:none; }
    .tab-x:hover { color:var(--ink); background:rgba(255,255,255,.75); }
    .tab-x.active { background:var(--panel); color:var(--ink); font-weight:600; box-shadow:0 1px 3px rgba(18,60,54,.15); }
    .tab-x:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }

    /* Payroll: the main action */
    .tab-x.primary { background:var(--gold); color:#fff; font-weight:600; padding:9px 18px; }
    .tab-x.primary:hover { background:#1F5149; color:#fff; transform:translateY(-1px);
      box-shadow:0 4px 12px rgba(18,60,54,.28); }
    .tab-x.primary.active { box-shadow:0 0 0 2px var(--panel-2), 0 0 0 4px var(--gold); }
    .tab-x.primary:focus-visible { outline-color:#F59E0B; }
    .tab-badge { font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:999px;
      background:#F59E0B; color:#17202A; letter-spacing:.01em; }
    .tab-badge.done { background:rgba(255,255,255,.18); color:#fff; }
    @media (prefers-reduced-motion: reduce) { .tab-x { transition:none; } .tab-x.primary:hover { transform:none; } }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICONS = {
    dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
    payroll: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
    wages: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
    leave: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>'),
  };

  function periodLabel(p) {
    if (!p) return "";
    const [y, m] = p.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return isNaN(d) ? p : d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
  }
  function payrollBadge(c) {
    if (!c.period) return `<span class="tab-badge">Set period</span>`;
    const rec = typeof getPeriodRecord === "function" ? getPeriodRecord(c, c.period) : null;
    const status = rec ? rec.status : null;
    if (status === "Closed") return `<span class="tab-badge done">Closed</span>`;
    if (status === "Processed") return `<span class="tab-badge done">Processed</span>`;
    if (status === "Reopened") return `<span class="tab-badge">Finish ${periodLabel(c.period)}</span>`;
    return `<span class="tab-badge">Run ${periodLabel(c.period)}</span>`;
  }

  window.viewTabsHtml = function (c) {
    const tab = (key, label, extra = "", primary = false) => {
      const isActive = c.view === key;
      return `<button type="button" role="tab" aria-selected="${isActive}"
        class="tab-x${primary ? " primary" : ""}${isActive ? " active" : ""}"
        onclick="switchView('${key}')">${ICONS[key]}<span>${label}</span>${extra}</button>`;
    };
    return `
      <div class="tabs-x" role="tablist" aria-label="Sections">
        ${tab("dashboard", "Dashboard")}
        ${tab("payroll", "Payroll", payrollBadge(c), true)}
        ${tab("wages", "Wages")}
        ${tab("leave", "Leave Management")}
      </div>`;
  };

  if (typeof render === "function" && state && state.currentUserId) render();
})();
