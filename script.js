/* ============================================================
   EnviaShipping — Courier Cost Calculator  v2
   UI upgraded: rAF batching, zero layout thrash, smooth reveals
   Business logic unchanged.
   ============================================================ */

/* ── RATE DATA ──────────────────────────────────────────────
   rates[courierKey][weight][zone] = base price (INR)
   ─────────────────────────────────────────────────────────── */
const RATE_DATA = {

  "Delhivery Surface": {
    0.5: { A: 34, B: 36, C: 42, D: 51, E: 58, F: 62 },
    1:   { A: 47, B: 54, C: 60, D: 78, E: 82, F: 89 },
    1.5: { A: 64, B: 72, C: 77, D: 89, E: 138, F: 142 },
    2:   { A: 82, B: 90, C: 94, D: 101, E: 195, F: 195 },
    2.5: { A: 101, B: 110, C: 116, D: 127, E: 210, F: 215 },
    3:   { A: 116, B: 124, C: 129, D: 144, E: 210, F: 215 },
    3.5: { A: 133, B: 140, C: 147, D: 165, E: 217, F: 224 },
    4:   { A: 149, B: 159, C: 164, D: 186, E: 224, F: 234 },
    4.5: { A: 182, B: 214, C: 231, D: 266, E: 320, F: 346 },
    5:   { A: 149, B: 159, C: 164, D: 186, E: 224, F: 234 },
  },

  "Delhivery Air": {
    0.5: { A: 34, B: 35, C: 55, D: 61, E: 69, F: 76 },
    1:   { A: 58, B: 63, C: 99, D: 110, E: 124, F: 138 },
    1.5: { A: 83, B: 91, C: 144, D: 158, E: 179, F: 200 },
    2:   { A: 109, B: 120, C: 188, D: 206, E: 234, F: 261 },
    2.5: { A: 134, B: 148, C: 232, D: 255, E: 289, F: 323 },
    3:   { A: 160, B: 176, C: 277, D: 303, E: 344, F: 385 },
    3.5: { A: 185, B: 204, C: 321, D: 351, E: 399, F: 447 },
    4:   { A: 211, B: 232, C: 366, D: 400, E: 454, F: 509 },
    4.5: { A: 237, B: 261, C: 410, D: 448, E: 509, F: 570 },
    5:   { A: 262, B: 289, C: 454, D: 497, E: 564, F: 632 },
  },

  "Xpressbees Surface": {
    0.5: { A: 30, B: 33, C: 39, D: 43, E: 46, F: 52 },
    1:   { A: 53, B: 58, C: 67, D: 73, E: 83, F: 92 },
    1.5: { A: 66, B: 72, C: 83, D: 89, E: 103, F: 114 },
    2:   { A: 80, B: 87, C: 99, D: 106, E: 123, F: 135 },
    2.5: { A: 93, B: 101, C: 114, D: 123, E: 143, F: 157 },
    3:   { A: 106, B: 116, C: 130, D: 140, E: 163, F: 179 },
    3.5: { A: 119, B: 130, C: 145, D: 156, E: 182, F: 200 },
    4:   { A: 133, B: 144, C: 161, D: 173, E: 202, F: 222 },
    4.5: { A: 159, B: 183, C: 223, D: 242, E: 275, F: 285 },
    5:   { A: 120, B: 138, C: 162, D: 174, E: 222, F: 244 },
  },

  "Xpressbees Air": {
    0.5: { A: 35, B: 38, C: 50, D: 56, E: 63, F: 70 },
    1:   { A: 63, B: 68, C: 91, D: 101, E: 113, F: 125 },
    1.5: { A: 90, B: 98, C: 133, D: 147, E: 164, F: 181 },
    2:   { A: 118, B: 129, C: 174, D: 192, E: 216, F: 238 },
    2.5: { A: 145, B: 159, C: 216, D: 238, E: 267, F: 294 },
    3:   { A: 173, B: 189, C: 257, D: 283, E: 317, F: 349 },
    3.5: { A: 201, B: 220, C: 299, D: 329, E: 369, F: 406 },
    4:   { A: 228, B: 250, C: 340, D: 374, E: 420, F: 462 },
    4.5: { A: 256, B: 280, C: 381, D: 420, E: 471, F: 519 },
    5:   { A: 283, B: 311, C: 423, D: 465, E: 522, F: 574 },
  },

  "Ekart Standard": {
    0.5: { A: 29, B: 32, C: 36, D: 39, E: 52, F: 58 },
    1:   { A: 49, B: 54, C: 60, D: 65, E: 82, F: 92 },
    1.5: { A: 57, B: 64, C: 70, D: 79, E: 99, F: 111 },
    2:   { A: 65, B: 74, C: 80, D: 93, E: 116, F: 130 },
    2.5: { A: 73, B: 84, C: 90, D: 106, E: 132, F: 148 },
    3:   { A: 82, B: 95, C: 101, D: 120, E: 149, F: 166 },
    3.5: { A: 90, B: 105, C: 111, D: 134, E: 166, F: 185 },
    4:   { A: 99, B: 115, C: 122, D: 148, E: 183, F: 204 },
    4.5: { A: 107, B: 125, C: 132, D: 162, E: 200, F: 223 },
    5:   { A: 116, B: 136, C: 142, D: 176, E: 217, F: 242 },
  },

  "Ekart Expedited": {
    0.5: { A: 29, B: 33, C: 66, D: 75, E: 84, F: 94 },
    1:   { A: 49, B: 55, C: 126, D: 141, E: 159, F: 178 },
    1.5: { A: 67, B: 76, C: 187, D: 207, E: 233, F: 261 },
    2:   { A: 67, B: 97, C: 247, D: 273, E: 308, F: 345 },
    2.5: { A: 85, B: 107, C: 277, D: 306, E: 345, F: 386 },
    3:   { A: 103, B: 118, C: 307, D: 339, E: 382, F: 428 },
    3.5: { A: 111, B: 128, C: 336, D: 372, E: 419, F: 469 },
    4:   { A: 120, B: 139, C: 366, D: 405, E: 456, F: 511 },
    4.5: { A: 128, B: 149, C: 396, D: 437, E: 493, F: 552 },
    5:   { A: 137, B: 159, C: 426, D: 470, E: 531, F: 594 },
  },

  "Ecom Express": {
    0.5: { A: 27, B: 33, C: 39, D: 46, E: 47, F: 53 },
    1:   { A: 51, B: 60, C: 72, D: 78, E: 91, F: 102 },
    1.5: { A: 74, B: 83, C: 95, D: 101, E: 114, F: 128 },
    2:   { A: 98, B: 107, C: 118, D: 125, E: 138, F: 154 },
    2.5: { A: 121, B: 134, C: 151, D: 158, E: 182, F: 198 },
    3:   { A: 144, B: 161, C: 184, D: 191, E: 226, F: 242 },
    3.5: { A: 167, B: 188, C: 217, D: 224, E: 270, F: 286 },
    4:   { A: 190, B: 215, C: 250, D: 257, E: 314, F: 330 },
    4.5: { A: 213, B: 242, C: 283, D: 290, E: 358, F: 374 },
    5:   { A: 236, B: 269, C: 316, D: 323, E: 402, F: 418 },
  },

  "Amazon Shipping": {
    0.5: { A: 32, B: 36, C: 41, D: 43, E: 54, F: 60 },
    1:   { A: 53, B: 59, C: 66, D: 72, E: 84, F: 94 },
    1.5: { A: 73, B: 82, C: 92, D: 100, E: 113, F: 126 },
    2:   { A: 93, B: 105, C: 117, D: 128, E: 143, F: 159 },
    2.5: { A: 113, B: 128, C: 143, D: 157, E: 173, F: 192 },
    3:   { A: 134, B: 151, C: 169, D: 185, E: 203, F: 225 },
    3.5: { A: 154, B: 174, C: 194, D: 213, E: 232, F: 258 },
    4:   { A: 174, B: 197, C: 220, D: 242, E: 262, F: 291 },
    4.5: { A: 194, B: 220, C: 246, D: 270, E: 292, F: 324 },
    5:   { A: 215, B: 234, C: 271, D: 298, E: 321, F: 357 },
  },
};

const COD_FLAT = {
  "Delhivery Surface":  35,
  "Delhivery Air":      35,
  "Xpressbees Surface": 33,
  "Xpressbees Air":     33,
  "Ekart Standard":     33,
  "Ekart Expedited":    33,
  "Ecom Express":       33,
  "Amazon Shipping":    39,
};

const COURIER_META = {
  "Delhivery Surface":  { emoji: "🚛", type: "Surface",   speed: "3–6 days" },
  "Delhivery Air":      { emoji: "✈️",  type: "Air",       speed: "1–3 days" },
  "Xpressbees Surface": { emoji: "🚚", type: "Surface",   speed: "3–5 days" },
  "Xpressbees Air":     { emoji: "🛫", type: "Air",       speed: "1–2 days" },
  "Ekart Standard":     { emoji: "📦", type: "Standard",  speed: "3–5 days" },
  "Ekart Expedited":    { emoji: "⚡",  type: "Expedited", speed: "1–2 days" },
  "Ecom Express":       { emoji: "🏃", type: "Express",   speed: "2–4 days" },
  "Amazon Shipping":    { emoji: "🔶", type: "Standard",  speed: "2–4 days" },
};

/* ── STATE ── */
let codMode = "percent";
let toastTimer = null;

/* ── DOM REFS — resolved once, never queried again ── */
const $ = (id) => document.getElementById(id);

const orderAmountEl  = $("order-amount");
const weightEl       = $("weight-select");
const zoneEl         = $("zone-select");
const codToggleEl    = $("cod-toggle");
const rtoToggleEl    = $("rto-toggle");
const gstToggleEl    = $("gst-toggle");
const codSubWrapEl   = $("cod-sub-wrap");
const codPercentBtn  = $("cod-percent-btn");
const codFlatBtn     = $("cod-flat-btn");
const calcBtn        = $("calc-btn");
const saveBtn        = $("save-btn");
const emptyState     = $("empty-state");
const resultsSection = $("results-section");
const cardsGrid      = $("cards-grid");
const bestNameEl     = $("best-name");
const bestDescEl     = $("best-desc");
const bestPriceEl    = $("best-price");
const toastEl        = $("toast");

// Toggle rows for .is-on styling
const codRow  = $("cod-row");
const rtoRow  = $("rto-row");
const gstRow  = $("gst-row");

/* ── INIT ── */
function init() {
  loadSettings();
  bindEvents();
  // Sync toggle-row highlight state on load
  syncToggleRowState(codRow,  codToggleEl);
  syncToggleRowState(rtoRow,  rtoToggleEl);
  syncToggleRowState(gstRow,  gstToggleEl);
}

/* ── EVENTS ── */
function bindEvents() {
  calcBtn.addEventListener("click", calculate);
  saveBtn.addEventListener("click", saveSettings);

  // COD toggle — open sub-panel via max-height (no reflow)
  codToggleEl.addEventListener("change", () => {
    codSubWrapEl.classList.toggle("open", codToggleEl.checked);
    syncToggleRowState(codRow, codToggleEl);
  });

  rtoToggleEl.addEventListener("change", () => syncToggleRowState(rtoRow, rtoToggleEl));
  gstToggleEl.addEventListener("change", () => syncToggleRowState(gstRow, gstToggleEl));

  codPercentBtn.addEventListener("click", () => setCodMode("percent"));
  codFlatBtn.addEventListener("click",   () => setCodMode("flat"));

  // Auto-recalculate only if results already visible
  const autoCalcEls = [orderAmountEl, weightEl, zoneEl, codToggleEl, rtoToggleEl, gstToggleEl];
  autoCalcEls.forEach(el =>
    el.addEventListener("change", () => {
      if (resultsSection.classList.contains("visible")) calculate();
    })
  );
}

function setCodMode(mode) {
  codMode = mode;
  codPercentBtn.classList.toggle("active", mode === "percent");
  codFlatBtn.classList.toggle("active",    mode === "flat");
}

function syncToggleRowState(row, input) {
  row.classList.toggle("is-on", input.checked);
}

/* ── CALCULATION (pure functions, no DOM touch) ── */
function getBaseRate(courierName, weight, zone) {
  const rates = RATE_DATA[courierName];
  if (!rates) return null;
  const row = rates[weight];
  if (!row) return null;
  if (row[zone] !== undefined) return row[zone];
  // Zone F fallback: E + 10%
  if (zone === "F" && row["E"] !== undefined) return Math.round(row["E"] * 1.1);
  return null;
}

function calcCODCharge(orderAmount, isCOD) {
  if (!isCOD) return 0;
  return codMode === "percent"
    ? Math.max(Math.round(orderAmount * 0.02), 1)
    : 40;
}

function computeCourier(courierName, params) {
  const { weight, zone, orderAmount, isCOD, isRTO, isGST } = params;
  const baseRate = getBaseRate(courierName, weight, zone);
  if (baseRate === null) return null;

  const codCharge = calcCODCharge(orderAmount, isCOD);
  const subtotal  = baseRate + codCharge;
  const gstAmount = isGST ? Math.round(subtotal * 0.18 * 100) / 100 : 0;
  let   total     = subtotal + gstAmount;
  if (isRTO) total *= 2;

  return {
    courierName,
    baseRate,
    codCharge,
    gstAmount: Math.round(gstAmount * 100) / 100,
    total:     Math.round(total * 100) / 100,
  };
}

/* ── MAIN CALCULATE ── */
function calculate() {
  const params = {
    orderAmount: parseFloat(orderAmountEl.value) || 0,
    weight:      parseFloat(weightEl.value),
    zone:        zoneEl.value,
    isCOD:       codToggleEl.checked,
    isRTO:       rtoToggleEl.checked,
    isGST:       gstToggleEl.checked,
  };

  // Pure computation — no DOM involved
  const results = Object.keys(RATE_DATA)
    .map(name => computeCourier(name, params))
    .filter(Boolean)
    .sort((a, b) => a.total - b.total);

  // Batch all DOM writes in a single rAF to avoid forced reflow
  requestAnimationFrame(() => renderResults(results, params));
}

/* ── RENDER — all DOM writes in one paint cycle ── */
function renderResults(results, params) {
  if (!results.length) return;

  const best = results[0];
  const meta = COURIER_META[best.courierName] || {};

  // ── 1. Update best banner text nodes (no layout change)
  bestNameEl.textContent  = best.courierName;
  bestDescEl.textContent  = `${meta.type || ""} · ${meta.speed || ""} · Zone ${params.zone}`;
  bestPriceEl.textContent = `₹${best.total.toFixed(2)}`;

  // ── 2. Build ALL card fragments in memory first (no DOM reflow)
  const fragment = document.createDocumentFragment();
  const cardEls  = [];

  results.forEach((r, idx) => {
    const el = buildCard(r, idx, results.length);
    fragment.appendChild(el);
    cardEls.push(el);
  });

  // ── 3. One DOM write: replace grid contents
  cardsGrid.innerHTML = "";
  cardsGrid.appendChild(fragment);

  // ── 4. Hide empty state & show results (opacity only — no layout)
  emptyState.classList.add("hidden");
  resultsSection.classList.add("visible");

  // ── 5. Stagger card reveals using successive rAFs
  //       Each card gets its own frame so browser can composite smoothly.
  //       Using transform + opacity — GPU composited, zero layout cost.
  cardEls.forEach((card, idx) => {
    // Schedule reveal: base delay 30ms × index, capped for comfort
    const delay = Math.min(idx * 35, 280);
    setTimeout(() => {
      requestAnimationFrame(() => card.classList.add("revealed"));
    }, delay);
  });
}

/* ── BUILD CARD — returns a detached DOM node (no reflow) ── */
function buildCard(r, idx, total) {
  const isCheapest = idx === 0;
  const meta = COURIER_META[r.courierName] || { emoji: "📦", type: "Standard", speed: "—" };

  const card = document.createElement("div");
  card.className = "courier-card" + (isCheapest ? " cheapest" : "");

  // Use textContent for user data to avoid XSS and innerHTML parse cost
  const nameEl = document.createElement("span");
  nameEl.className = "card-name-text";
  nameEl.textContent = r.courierName;

  const emojiEl = document.createElement("span");
  emojiEl.className = "card-emoji";
  emojiEl.textContent = meta.emoji;

  const nameRow = document.createElement("div");
  nameRow.className = "card-courier-name";
  nameRow.appendChild(emojiEl);
  nameRow.appendChild(nameEl);

  if (isCheapest) {
    const tag = document.createElement("span");
    tag.className = "cheapest-tag";
    tag.textContent = "✓ Cheapest";
    nameRow.appendChild(tag);
  }

  // Breakdown
  const breakdown = document.createElement("div");
  breakdown.className = "card-breakdown";
  breakdown.appendChild(makeBreakdown("Base Rate", `₹${r.baseRate}`, "is-accent"));
  breakdown.appendChild(makeBreakdown("COD",      `₹${r.codCharge.toFixed(2)}`, r.codCharge > 0 ? "is-amber" : ""));
  breakdown.appendChild(makeBreakdown("GST 18%",  `₹${r.gstAmount.toFixed(2)}`, ""));
  breakdown.appendChild(makeBreakdown("Speed",     meta.speed, ""));

  const cardLeft = document.createElement("div");
  cardLeft.className = "card-left";
  cardLeft.appendChild(nameRow);
  cardLeft.appendChild(breakdown);

  // Right: total
  const totalLabelEl = document.createElement("div");
  totalLabelEl.className = "card-total-label";
  totalLabelEl.textContent = "Total Cost";

  const totalEl = document.createElement("div");
  totalEl.className = "card-total";
  totalEl.textContent = `₹${r.total.toFixed(2)}`;

  const rankEl = document.createElement("div");
  rankEl.className = "card-rank";
  rankEl.textContent = `#${idx + 1} of ${total}`;

  const cardRight = document.createElement("div");
  cardRight.className = "card-right";
  cardRight.appendChild(totalLabelEl);
  cardRight.appendChild(totalEl);
  cardRight.appendChild(rankEl);

  card.appendChild(cardLeft);
  card.appendChild(cardRight);

  return card;
}

function makeBreakdown(label, value, valClass) {
  const item = document.createElement("div");
  item.className = "breakdown-item";

  const lbl = document.createElement("span");
  lbl.className = "bi-label";
  lbl.textContent = label;

  const val = document.createElement("span");
  val.className = "bi-val" + (valClass ? ` ${valClass}` : "");
  val.textContent = value;

  item.appendChild(lbl);
  item.appendChild(val);
  return item;
}

/* ── SETTINGS ── */
function saveSettings() {
  const settings = {
    orderAmount: orderAmountEl.value,
    weight:      weightEl.value,
    zone:        zoneEl.value,
    cod:         codToggleEl.checked,
    codMode,
    rto:         rtoToggleEl.checked,
    gst:         gstToggleEl.checked,
  };
  try {
    localStorage.setItem("enviashipping_v2", JSON.stringify(settings));
    showToast("✅  Settings saved");
  } catch {
    showToast("⚠️  Could not save settings");
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem("enviashipping_v2");
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.orderAmount !== undefined) orderAmountEl.value = s.orderAmount;
    if (s.weight) weightEl.value = s.weight;
    if (s.zone)   zoneEl.value   = s.zone;
    if (s.cod !== undefined) {
      codToggleEl.checked = s.cod;
      codSubWrapEl.classList.toggle("open", s.cod);
    }
    if (s.codMode) setCodMode(s.codMode);
    if (s.rto !== undefined) rtoToggleEl.checked = s.rto;
    if (s.gst !== undefined) gstToggleEl.checked = s.gst;
  } catch { /* ignore corrupt data */ }
}

/* ── TOAST — GPU-composited show/hide ── */
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

/* ── BOOT ── */
document.addEventListener("DOMContentLoaded", init);
