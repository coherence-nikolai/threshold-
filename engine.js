/* Threshold Engine v2 (Stage 2A)
   - slow mythic depth curve
   - dissolving field control
   - silence weighting
   - rare direct transmission (timed)
   - invisible evolution
   - localStorage only
*/

const intro = document.getElementById("intro");
const ui = document.getElementById("ui");
const questionEl = document.getElementById("question");
const nextBtn = document.getElementById("next");
const fieldSelector = document.getElementById("field-selector");
const languageToggle = document.getElementById("language-toggle");

// ---------- State ----------
const STORAGE_KEY = "threshold_state_v2";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const now = Date.now();
let state = loadState() || {
  depthScore: 0,              // 0..100 (slow curve)
  shownCount: 0,              // total questions shown
  visits: 0,                  // visit count
  lastVisitTs: 0,
  lastShown: { en: {}, es: {} }, // per lang/field, store recent indices
  langOverride: null,         // "en" | "es" | null
  fieldPinned: null           // field chosen by user until selector dissolves
};

// visit tracking (slow mythic)
if (!state.lastVisitTs || (now - state.lastVisitTs) > 60 * 60 * 1000) {
  state.visits += 1;
  state.lastVisitTs = now;
  saveState(state);
}

// language
let currentLang =
  state.langOverride ||
  (navigator.language && navigator.language.toLowerCase().startsWith("es") ? "es" : "en");

// field
let currentField = state.fieldPinned || "self";

// timing for “linger”
let lastActionTs = now;

// ---------- Intro ----------
setTimeout(() => {
  intro.style.display = "none";
  ui.style.display = "flex";
  render();
}, 6000);

// ---------- Depth curve (slow) ----------
function updateDepthScore() {
  const t = Date.now();
  const lingerMs = Math.max(0, t - lastActionTs);
  lastActionTs = t;

  // Slow, mythic: small increments (0.10 .. 0.60) per interaction depending on linger.
  const lingerFactor = Math.min(lingerMs / 12000, 1); // 0..1 over ~12s
  const inc = 0.12 + 0.45 * lingerFactor;

  // Also dampen growth as depth rises (log-ish)
  const damp = 1 - Math.min(state.depthScore / 140, 0.6);
  state.depthScore = Math.min(100, state.depthScore + inc * damp);

  saveState(state);
}

function depthBand() {
  const d = state.depthScore;
  if (d < 20) return 1;      // Mirror
  if (d < 50) return 2;      // Destabilise
  return 3;                  // Awakening
}

// ---------- Field control dissolution ----------
function applyFieldControlDissolve() {
  const d = state.depthScore;

  // Stage 1: fully visible
  if (d < 20) {
    fieldSelector.style.opacity = "1";
    fieldSelector.style.pointerEvents = "auto";
    fieldSelector.style.display = "flex";
    return;
  }

  // Stage 2: fades and becomes “soft”
  if (d >= 20 && d < 50) {
    fieldSelector.style.display = "flex";
    fieldSelector.style.opacity = "0.25";
    fieldSelector.style.pointerEvents = "auto"; // still usable but visually less inviting
    return;
  }

  // Stage 3: gone
  fieldSelector.style.opacity = "0";
  fieldSelector.style.pointerEvents = "none";
  fieldSelector.style.display = "none";
}

// ---------- Silence weighting ----------
function silenceWeight() {
  const d = state.depthScore;
  if (d < 20) return 0.10;
  if (d < 50) return 0.20;
  if (d < 80) return 0.35;
  return 0.40;
}

// ---------- Rare Direct Transmission ----------
const TRANSMISSION = {
  en: {
    2: ["You already know.", "Stop searching for permission.", "There is no later."],
    3: ["Nothing is missing.", "No one is coming.", "This is already it."]
  },
  es: {
    2: ["Ya lo sabes.", "No necesitas permiso.", "No hay después."],
    3: ["No falta nada.", "No viene nadie.", "Esto ya es."]
  }
};

function transmissionChance() {
  const d = state.depthScore;
  if (d < 40) return 0;
  if (d < 80) return 0.03;
  return 0.05;
}

let inTransmission = false;
let transmissionUnlockTs = 0;

function maybeShowTransmission() {
  const chance = transmissionChance();
  if (chance <= 0) return false;
  if (Math.random() > chance) return false;

  const band = depthBand();
  const pool = TRANSMISSION[currentLang][band] || TRANSMISSION[currentLang][2];
  const line = pool[Math.floor(Math.random() * pool.length)];

  inTransmission = true;
  transmissionUnlockTs = Date.now() + 9000; // lock for ~9s
  questionEl.textContent = line;

  // Hide/disable next briefly; user taps anywhere after unlock
  nextBtn.style.opacity = "0.25";
  nextBtn.style.pointerEvents = "none";

  // Allow tap anywhere after lock
  document.body.style.cursor = "pointer";
  return true;
}

function exitTransmission() {
  inTransmission = false;
  nextBtn.style.opacity = "1";
  nextBtn.style.pointerEvents = "auto";
  document.body.style.cursor = "default";
}

// ---------- Non-repeat helper (small) ----------
function getRecentSet(lang, field) {
  state.lastShown[lang] = state.lastShown[lang] || {};
  state.lastShown[lang][field] = state.lastShown[lang][field] || [];
  return state.lastShown[lang][field];
}

function rememberIndex(lang, field, idx) {
  const arr = getRecentSet(lang, field);
  arr.push(idx);
  // keep last 12 indices
  while (arr.length > 12) arr.shift();
  saveState(state);
}

function pickQuestionFromPool(pool, recentIdxs) {
  if (pool.length === 1) return { text: pool[0], idx: 0 };

  // try 8 times to avoid repeats
  for (let i = 0; i < 8; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!recentIdxs.includes(idx)) return { text: pool[idx], idx };
  }
  // fallback
  const idx = Math.floor(Math.random() * pool.length);
  return { text: pool[idx], idx };
}

// ---------- Field selection logic ----------
function chooseField() {
  // If user pinned a field (and field control still exists), respect it
  if (state.fieldPinned && state.depthScore < 50) return state.fieldPinned;

  // Otherwise, choose based on silence weighting + current selection soft preference
  const wSilence = silenceWeight();
  const roll = Math.random();

  if (roll < wSilence) return "silence";

  // Otherwise keep currentField unless selector is dissolved and field is silence (avoid over-silence)
  return currentField || "self";
}

// ---------- Render ----------
function render() {
  applyFieldControlDissolve();

  // If currently in a transmission state, don't overwrite it.
  if (inTransmission) return;

  updateDepthScore();

  // chance to show transmission
  if (maybeShowTransmission()) {
    state.shownCount += 1;
    saveState(state);
    return;
  }

  const field = chooseField();
  const pool = (QUESTION_DATA[currentLang] && QUESTION_DATA[currentLang][field]) || ["…"];

  const recent = getRecentSet(currentLang, field);
  const picked = pickQuestionFromPool(pool, recent);

  questionEl.textContent = picked.text;
  rememberIndex(currentLang, field, picked.idx);

  state.shownCount += 1;
  saveState(state);
}

// ---------- Events ----------
nextBtn.addEventListener("click", () => {
  if (inTransmission) return;
  render();
});

fieldSelector.addEventListener("click", (e) => {
  const f = e.target && e.target.dataset && e.target.dataset.field;
  if (!f) return;
  currentField = f;

  // only pin field while selector is in control stages
  if (state.depthScore < 50) state.fieldPinned = f;
  saveState(state);
  render();
});

languageToggle.addEventListener("click", () => {
  currentLang = currentLang === "en" ? "es" : "en";
  state.langOverride = currentLang;
  saveState(state);
  render();
});

// Tap anywhere to continue after transmission lock
document.addEventListener("click", () => {
  if (!inTransmission) return;
  if (Date.now() < transmissionUnlockTs) return;
  exitTransmission();
  render();
});
