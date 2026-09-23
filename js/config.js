/* ---------------------------------------------------------------------
   STATUTORY RATE CONFIG — Kenya, effective 1 Feb 2026.
   Update these if KRA / NSSF / SHIF gazette new rates. Values also
   editable live from the "Statutory rates & settings" panel.
--------------------------------------------------------------------- */
let RATES = {
  nssfLEL: 9000,        // Tier I lower earnings limit
  nssfUEL: 108000,      // Tier II upper earnings limit
  nssfRate: 0.06,        // employee & employer, each
  shifRate: 0.0275,      // % of gross
  shifMin: 300,          // minimum monthly SHIF
  ahlRate: 0.015,        // Affordable Housing Levy, employee & employer, each
  personalRelief: 2400,  // monthly
  insuranceReliefRate: 0.15,
  insuranceReliefCap: 5000,
  pensionReliefCap: 30000, // combined statutory + voluntary pension relief cap
  nitaLevy: 50,          // per employee per month, employer cost
  bands: [
    { upTo: 24000, rate: 0.10 },
    { upTo: 32333, rate: 0.25 },
    { upTo: 500000, rate: 0.30 },
    { upTo: 800000, rate: 0.325 },
    { upTo: Infinity, rate: 0.35 }
  ]
};

/* ---------------------------------------------------------------------
   SUPABASE CONFIG — paste your project's values here.
   Dashboard → Project Settings → API → Project URL / anon public key.
   The anon key is safe to expose in frontend code; Row Level Security
   (see schema.sql) is what actually restricts access to each user's own data.
--------------------------------------------------------------------- */
const SUPABASE_URL = 'https://fmargcknmofzpihujzdc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2-DM351xvcU2tXUIuX-vQg_CTpuRD3q';
// "Remember me" support: when checked, the session persists across browser restarts (localStorage).
// When unchecked, it's kept only for the current browser session (sessionStorage) - closing the
// browser signs the person out. getItem checks both so an existing session is found either way;
// setItem decides where a NEW session gets written based on the checkbox at the moment of sign-in.
let rememberMeChoice = true;
const rememberAwareStorage = {
  getItem: (key) => window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key),
  setItem: (key, value) => {
    if(rememberMeChoice){
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  },
  removeItem: (key) => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: rememberAwareStorage } });

/* ---------------- Lazy-loaded libraries ----------------
   jsPDF, autotable, and JSZip together are several hundred KB — loading them eagerly on
   every visit meant even just signing in paid that cost, whether or not you ever exported
   anything. These now load once, the first time an export action actually needs them, and
   are cached afterward so it only ever happens once per session.
------------------------------------------------------------------------------------------ */
const _loadedScripts = {};
function loadScriptOnce(src){
  if(_loadedScripts[src]) return _loadedScripts[src];
  _loadedScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => { delete _loadedScripts[src]; reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(s);
  });
  return _loadedScripts[src];
}
async function ensurePdfLibsLoaded(){
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
}
async function ensureZipLibLoaded(){
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
}
async function ensureXlsxLibLoaded(){
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
}