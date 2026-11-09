/**
 * GiftoraX Premium QR Studio — script.js
 * ═══════════════════════════════════════
 * Clean, modular, production-grade QR generator logic.
 * Dependencies: qr-code-styling@1.5.0, color-thief@2.3.0
 */

'use strict';

// ════════════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════════════

const LS_KEY_SETTINGS = 'gx_qr_settings';
const LS_KEY_HISTORY  = 'gx_qr_history';
const HISTORY_MAX     = 5;
const UPDATE_DEBOUNCE = 280; // ms

/** Embedded GX fallback logo — used when /images/logo.jpg is not found */
const FALLBACK_LOGO_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0E0E18"/>
      <stop offset="100%" style="stop-color:#1A1A2E"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#E6C97A"/>
      <stop offset="100%" style="stop-color:#A68A45"/>
    </linearGradient>
  </defs>
  <rect width="240" height="240" rx="52" fill="url(#bg)"/>
  <rect x="2" y="2" width="236" height="236" rx="51" fill="none" stroke="url(#gold)" stroke-width="2" opacity="0.5"/>
  <text x="120" y="135" font-family="Georgia, serif" font-size="96" font-weight="bold"
        fill="url(#gold)" text-anchor="middle" dominant-baseline="middle" letter-spacing="-3">GX</text>
</svg>
`)}`;

// ════════════════════════════════════════════════════════════
//  APPLICATION STATE
// ════════════════════════════════════════════════════════════

const state = {
  url:              'https://www.ampkart.co.in',
  dotStyle:         'classy',
  eyeOuterStyle:    'extra-rounded',
  eyeInnerStyle:    'dot',
  dotColor:         '#1A1A1A',
  cornerColor:      '#C9A857',
  bgColor:          '#ffffff',
  logoImage:        null,    // base64 data URL, set after load
  logoMode:         'default', // 'default' | 'upload' | 'none'
  qrSize:           340,
  isUpdating:       false,
};

// ════════════════════════════════════════════════════════════
//  QR CODE INSTANCE
// ════════════════════════════════════════════════════════════

let qrCode = null;
let updateTimer = null;
let colorThief = null;

// ════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════

/**
 * Show toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
let _toastTimer = null;
function showToast(message, type = 'success') {
  const toast   = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const icon    = toast.querySelector('.toast-icon');

  toastMsg.textContent = message;

  const colors = { success: 'var(--gold)', error: 'var(--error)', info: 'var(--text-2)' };
  icon.setAttribute('stroke', colors[type] || colors.success);

  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

/**
 * Get responsive QR size based on viewport
 */
function getQRSize() {
  const vw = window.innerWidth;
  if (vw >= 1280) return 360;
  if (vw >= 1024) return 340;
  if (vw >= 640)  return Math.min(320, vw - 80);
  return Math.min(300, vw - 60);
}

/**
 * Convert hex color to luminance (0–1)
 */
function hexToLuminance(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Evaluate contrast ratio between dot color and background
 * Updates the contrast indicator UI
 */
function updateContrastIndicator() {
  const el   = document.getElementById('contrastIndicator');
  const text = document.getElementById('contrastText');

  const dotLum = hexToLuminance(state.dotColor);
  const bgLum  = hexToLuminance(state.bgColor);

  const lighter = Math.max(dotLum, bgLum);
  const darker  = Math.min(dotLum, bgLum);
  const ratio   = (lighter + 0.05) / (darker + 0.05);

  el.classList.remove('good', 'warn', 'bad');

  if (ratio >= 5) {
    el.classList.add('good');
    text.textContent = `High contrast (${ratio.toFixed(1)}:1) — fully scannable`;
  } else if (ratio >= 3) {
    el.classList.add('warn');
    text.textContent = `Moderate contrast (${ratio.toFixed(1)}:1) — may have issues`;
  } else {
    el.classList.add('bad');
    text.textContent = `Low contrast (${ratio.toFixed(1)}:1) — likely unscannable`;
  }
}

/**
 * Deep-darken a color to ensure it's scannable (dots must be dark)
 * @param {number[]} rgb [r, g, b]
 * @returns {string} hex color
 */
function ensureDarkColor(r, g, b) {
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  if (lum > 0.45) {
    r = Math.max(0, Math.floor(r * 0.3));
    g = Math.max(0, Math.floor(g * 0.3));
    b = Math.max(0, Math.floor(b * 0.3));
  }
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/**
 * Promise-based FileReader
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Wait for an Image element to fully load
 */
function waitForImageLoad(img) {
  return new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth) return resolve(img);
    img.onload  = () => resolve(img);
    img.onerror = reject;
  });
}

// ════════════════════════════════════════════════════════════
//  IMAGE CENTERING (KEY FIX)
//  Pre-processes any image into a perfectly centered square
//  canvas before passing to qr-code-styling.
//  This eliminates all misalignment regardless of aspect ratio.
// ════════════════════════════════════════════════════════════

/**
 * @param {string} src  — data URL or path
 * @param {number} padding — fraction of canvas size to pad (default 0.10)
 * @returns {Promise<string>} — centered square PNG data URL
 */
async function prepareLogoImage(src, padding = 0.10) {
  return new Promise(async (resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      // Attempt load; if it fails return original
      img.onerror = () => resolve(src);
      img.src = src;

      await waitForImageLoad(img);

      const SIZE   = 500;
      const canvas = document.createElement('canvas');
      canvas.width  = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');

      // Transparent background
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Available draw area after padding
      const padPx    = SIZE * padding;
      const drawArea = SIZE - padPx * 2;

      // Scale to fit, preserving aspect ratio
      const scale = Math.min(drawArea / img.naturalWidth, drawArea / img.naturalHeight);
      const w = img.naturalWidth  * scale;
      const h = img.naturalHeight * scale;

      // Perfect center calculation
      const x = (SIZE - w) / 2;
      const y = (SIZE - h) / 2;

      // Enable high-quality downsampling
      ctx.imageSmoothingEnabled  = true;
      ctx.imageSmoothingQuality  = 'high';

      ctx.drawImage(img, x, y, w, h);
      resolve(canvas.toDataURL('image/png'));

    } catch (err) {
      console.warn('[QR] prepareLogoImage failed, using raw src:', err);
      resolve(src); // graceful fallback
    }
  });
}

// ════════════════════════════════════════════════════════════
//  DEFAULT LOGO LOADER
//  Tries /images/logo.jpg first, falls back to embedded SVG
// ════════════════════════════════════════════════════════════

async function loadDefaultLogo() {
  return new Promise(async (resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      try {
        // Convert <img> to canvas data URL (required for qr-code-styling)
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || 200;
        canvas.height = img.naturalHeight || 200;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

        // Center it properly
        state.logoImage = await prepareLogoImage(dataUrl);
        console.log('[QR] Loaded /images/logo.png as default logo');
        resolve(true);
      } catch (err) {
        // Canvas tainted (CORS) — fall back to SVG
        console.warn('[QR] Canvas taint on logo.png, using fallback SVG');
        state.logoImage = await prepareLogoImage(FALLBACK_LOGO_SVG);
        resolve(false);
      }
    };

    img.onerror = async () => {
      console.info('[QR] /images/logo.png not found — using embedded GX logo');
      state.logoImage = await prepareLogoImage(FALLBACK_LOGO_SVG);
      resolve(false);
    };

     // Default logo path set to Photo/logo.png
    img.src = `Photo/logo.png?v=${Date.now()}`;

  });
}

// ════════════════════════════════════════════════════════════
//  QR CODE INITIALIZATION
// ════════════════════════════════════════════════════════════

function buildQROptions() {
  const size = state.qrSize;
  return {
    width:  size,
    height: size,
    type:   'canvas',
    data:   state.url || 'https://www.ampkart.co.in',
    image:  state.logoMode !== 'none' ? state.logoImage : undefined,
    margin: Math.round(size * 0.04), // 4% margin — scales with export size

    qrOptions: {
      typeNumber:           0,
      mode:                 'Byte',
      errorCorrectionLevel: 'H', // High — required for logos
    },

    imageOptions: {
      hideBackgroundDots: true,
      // 0.28 = sweet spot: logo visible, QR scannable
      imageSize:   0.28,
      // Adequate white halo around logo for error-correction zone
      margin:      Math.max(6, Math.round(size * 0.02)),
      crossOrigin: 'anonymous',
      saveAsBlob:  true,
    },

    dotsOptions: {
      color: state.dotColor,
      type:  state.dotStyle,
    },

    backgroundOptions: {
      color: state.bgColor,
    },

    cornersSquareOptions: {
      color: state.cornerColor,
      type:  state.eyeOuterStyle,
    },

    cornersDotOptions: {
      color: state.cornerColor,
      type:  state.eyeInnerStyle,
    },
  };
}

function initQR() {
  state.qrSize = getQRSize();
  qrCode = new QRCodeStyling(buildQROptions());
  qrCode.append(document.getElementById('qr-preview'));
}

// ════════════════════════════════════════════════════════════
//  QR UPDATE (debounced + animated)
// ════════════════════════════════════════════════════════════

function scheduleUpdate(immediate = false) {
  clearTimeout(updateTimer);
  if (immediate) {
    performUpdate();
  } else {
    updateTimer = setTimeout(performUpdate, UPDATE_DEBOUNCE);
  }
}

// Naya variable pending updates ko track karne ke liye
let hasPendingUpdate = false;

// MISSING FUNCTION JO DELETE HO GAYA THA (Yehi error aur download issue ki wajah tha)
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function performUpdate() {
  if (state.isUpdating) {
    hasPendingUpdate = true;
    return;
  }

  state.isUpdating = true;
  hasPendingUpdate = false;

  const preview = document.getElementById('qr-preview');
  const overlay = document.getElementById('qrOverlay');
  const urlDisplay = document.getElementById('currentUrlDisplay');

  try {
    // Loading overlay show karein
    overlay.classList.add('visible');
    preview.classList.add('fading');

    await sleep(200); // Ab yeh yahan error nahi dega!

    // Purane canvas ko destroy karke naya lagana
    const oldCanvas = preview.querySelector('canvas');
    if (oldCanvas) {
      oldCanvas.remove();
    }
    // Naya fresh QR instance generate karein naye settings ke sath
    qrCode = new QRCodeStyling(buildQROptions());
    qrCode.append(preview);

    // URL text update
    urlDisplay.textContent = state.url;

    await sleep(320);

    // Animation in
    preview.classList.remove('fading');
    preview.classList.add('showing');
    overlay.classList.remove('visible');

    await sleep(300);
    preview.classList.remove('showing');

  } catch (error) {
    console.error('[QR] Update fail ho gaya:', error);
    preview.classList.remove('fading', 'showing');
    overlay.classList.remove('visible');
  } finally {
    state.isUpdating = false;
    saveSettings();

    // Agar user ne jaldi-jaldi click kiya tha, to next update trigger karein
    if (hasPendingUpdate) {
      scheduleUpdate(true);
    }
  }
}



// ════════════════════════════════════════════════════════════
//  TAB SYSTEM
// ════════════════════════════════════════════════════════════

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      // Deactivate all
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      // Activate target
      btn.classList.add('active');
      const pane = document.getElementById(`pane-${targetTab}`);
      if (pane) pane.classList.add('active');
    });
  });
}

// ════════════════════════════════════════════════════════════
//  PATTERN SELECTION
// ════════════════════════════════════════════════════════════

function initPatternPanel() {
  const grid = document.getElementById('patternGrid');
  if (!grid) return;

  // Restore active state from state
  grid.querySelectorAll('.option-card').forEach(card => {
    card.classList.toggle('active', card.dataset.pattern === state.dotStyle);
  });

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.option-card');
    if (!card) return;

    const pattern = card.dataset.pattern;
    if (!pattern) return;

    // Update UI
    grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    // Update state
    state.dotStyle = pattern;
    scheduleUpdate();
  });
}

// ════════════════════════════════════════════════════════════
//  EYE STYLE SELECTION
// ════════════════════════════════════════════════════════════

function initEyePanel() {
  const grid = document.getElementById('eyesGrid');
  if (!grid) return;

  // Restore active state
  grid.querySelectorAll('.option-card').forEach(card => {
    const matchOuter = card.dataset.eyeOuter === state.eyeOuterStyle;
    const matchInner = card.dataset.eyeInner === state.eyeInnerStyle;
    card.classList.toggle('active', matchOuter && matchInner);
  });

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.option-card');
    if (!card || !card.dataset.eyeOuter) return;

    grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    state.eyeOuterStyle = card.dataset.eyeOuter;
    state.eyeInnerStyle = card.dataset.eyeInner;
    scheduleUpdate();
  });
}

// ════════════════════════════════════════════════════════════
//  LOGO PANEL
// ════════════════════════════════════════════════════════════

function initLogoPanel() {
  const btnDefault = document.getElementById('btnDefaultLogo');
  const labelUpload = document.getElementById('labelUploadLogo');
  const fileInput  = document.getElementById('logoUploadInput');
  const btnNoLogo  = document.getElementById('btnNoLogo');
  const preview    = document.getElementById('logoUploadPreview');
  const thumbImg   = document.getElementById('logoThumbImg');
  const fileName   = document.getElementById('logoFileName');
  const btnApplyColors = document.getElementById('btnApplyLogoColors');

  function setLogoButtonState(mode) {
    btnDefault.classList.toggle('active', mode === 'default');
    labelUpload.classList.toggle('active', mode === 'upload');
  }

  // Default Logo
  btnDefault.addEventListener('click', async () => {
    state.logoMode = 'default';
    setLogoButtonState('default');

    // Re-load default logo
    await loadDefaultLogo();
    preview.classList.remove('show');
    scheduleUpdate(true);
    showToast('Default GX logo applied');
  });

  // Upload Logo & Auto-Apply Colors (Magic Update)
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      labelUpload.style.opacity = '0.5';
      labelUpload.style.pointerEvents = 'none';

      // Read file
      const rawDataUrl = await readFileAsDataURL(file);

      // Pre-process into centered square before applying
      const centeredDataUrl = await prepareLogoImage(rawDataUrl, 0.10);

      state.logoImage = centeredDataUrl;
      state.logoMode  = 'upload';

      setLogoButtonState('upload');

      // Show preview
      thumbImg.src = rawDataUrl; // show original in thumb
      fileName.textContent = file.name.length > 22
        ? file.name.slice(0, 20) + '…'
        : file.name;
      preview.classList.add('show');

      // Store raw for color extraction
      labelUpload._rawDataUrl = rawDataUrl;

      // ==========================================
      // AUTOMATIC THEME EXTRACTION 
      // ==========================================
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = rawDataUrl;
      await waitForImageLoad(img);

      // Extract 3 dominant colors
      const palette  = colorThief.getPalette(img, 3);
      const primary  = palette[0];
      const secondary = palette[1] || palette[0];

      // Logo colors ko QR code format mein convert karein
      const autoDotHex    = ensureDarkColor(primary[0], primary[1], primary[2]);
      const autoCornerHex = `#${secondary[0].toString(16).padStart(2,'0')}${secondary[1].toString(16).padStart(2,'0')}${secondary[2].toString(16).padStart(2,'0')}`;

      // Colors automatically apply karein
      applyColor('dot', autoDotHex);
      applyColor('corner', autoCornerHex);

      scheduleUpdate(true);
      showToast('Logo uploaded & Theme auto-applied ✨');

    } catch (err) {
      showToast('Failed to load image — try another file', 'error');
      console.error('[QR] Logo upload error:', err);
    } finally {
      labelUpload.style.opacity = '';
      labelUpload.style.pointerEvents = '';
      fileInput.value = ''; // reset so same file can be re-selected
    }
  });


  // Remove Logo
  btnNoLogo.addEventListener('click', () => {
    state.logoMode  = 'none';
    state.logoImage = undefined;
    setLogoButtonState(null);
    preview.classList.remove('show');
    scheduleUpdate(true);
    showToast('Logo removed');
  });

  // Apply Logo Colors
  btnApplyColors.addEventListener('click', async () => {
    const rawUrl = labelUpload._rawDataUrl;
    if (!rawUrl) return;

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = rawUrl;
      await waitForImageLoad(img);

      const palette  = colorThief.getPalette(img, 3);
      const primary  = palette[0];
      const secondary = palette[1] || palette[0];

      const dotHex    = ensureDarkColor(primary[0], primary[1], primary[2]);
      const cornerHex = `#${secondary[0].toString(16).padStart(2,'0')}${secondary[1].toString(16).padStart(2,'0')}${secondary[2].toString(16).padStart(2,'0')}`;

      // Apply extracted colors
      applyColor('dot', dotHex);
      applyColor('corner', cornerHex);

      scheduleUpdate(true);
      showToast('Logo colors applied ✨');

    } catch (err) {
      showToast('Could not extract colors from this image', 'error');
    }
  });
}

// ════════════════════════════════════════════════════════════
//  COLOR SYSTEM
// ════════════════════════════════════════════════════════════

function applyColor(type, hexValue) {
  const normalized = hexValue.toUpperCase();

  if (type === 'dot') {
    state.dotColor = hexValue;
    document.getElementById('dotColorSwatch').style.background = hexValue;
    document.getElementById('dotColorHex').textContent = normalized;
    document.getElementById('dotColorInput').value = hexValue;
  } else if (type === 'corner') {
    state.cornerColor = hexValue;
    document.getElementById('cornerColorSwatch').style.background = hexValue;
    document.getElementById('cornerColorHex').textContent = normalized;
    document.getElementById('cornerColorInput').value = hexValue;
  } else if (type === 'bg') {
    state.bgColor = hexValue;
    document.getElementById('bgColorSwatch').style.background = hexValue;
    document.getElementById('bgColorHex').textContent = normalized;
    document.getElementById('bgColorInput').value = hexValue;
  }

  updateContrastIndicator();
}

function initColorPickers() {
  const pickers = [
    { inputId: 'dotColorInput',    type: 'dot'    },
    { inputId: 'cornerColorInput', type: 'corner' },
    { inputId: 'bgColorInput',     type: 'bg'     },
  ];

  pickers.forEach(({ inputId, type }) => {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('input', (e) => {
      applyColor(type, e.target.value);
      scheduleUpdate();
    });
  });

  // Init display from state
  applyColor('dot',    state.dotColor);
  applyColor('corner', state.cornerColor);
  applyColor('bg',     state.bgColor);
}

// ════════════════════════════════════════════════════════════
//  URL INPUT SYSTEM
// ════════════════════════════════════════════════════════════

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function initUrlInput() {
  const input     = document.getElementById('urlInput');
  const status    = document.getElementById('urlStatus');
  const errorEl   = document.getElementById('urlError');
  const generateBtn = document.getElementById('generateBtn');

  // Populate from state
  input.value = state.url;
  updateUrlStatus(state.url, input, status, errorEl);

  // Live validation as user types
  input.addEventListener('input', () => {
    const val = input.value.trim();
    updateUrlStatus(val, input, status, errorEl);
    // Live update only if valid
    if (isValidUrl(val)) {
      state.url = val;
      scheduleUpdate();
    }
  });

  // Enter key → generate
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generateBtn.click();
  });

  // Generate button
  generateBtn.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) return;

    if (!isValidUrl(val)) {
      input.classList.add('invalid');
      input.classList.remove('valid');
      errorEl.classList.add('show');
      input.focus();
      showToast('Enter a valid URL (must start with https://)', 'error');
      return;
    }

    state.url = val;
    saveToHistory(val);
    renderHistory();
    scheduleUpdate(true);
    showToast('QR code updated ✓');

    // Button flash feedback
    const btnText = document.getElementById('generateBtnText');
    btnText.textContent = '✓ Done';
    setTimeout(() => { btnText.textContent = 'Generate'; }, 1200);
  });
}

function updateUrlStatus(val, input, status, errorEl) {
  if (!val) {
    input.classList.remove('valid', 'invalid');
    status.classList.remove('valid', 'invalid');
    errorEl.classList.remove('show');
    return;
  }
  const valid = isValidUrl(val);
  input.classList.toggle('valid',   valid);
  input.classList.toggle('invalid', !valid);
  status.classList.toggle('valid',   valid);
  status.classList.toggle('invalid', !valid);
  if (!valid) errorEl.classList.add('show');
  else        errorEl.classList.remove('show');
}

// ════════════════════════════════════════════════════════════
//  URL HISTORY
// ════════════════════════════════════════════════════════════

function saveToHistory(url) {
  let history = getHistory();
  history = history.filter(u => u !== url); // dedup
  history.unshift(url);
  history = history.slice(0, HISTORY_MAX);
  localStorage.setItem(LS_KEY_HISTORY, JSON.stringify(history));
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY_HISTORY)) || [];
  } catch { return []; }
}

function renderHistory() {
  const history    = getHistory();
  const container  = document.getElementById('historyList');
  const historyBox = document.getElementById('urlHistory');
  const urlInput   = document.getElementById('urlInput');
  const urlStatus  = document.getElementById('urlStatus');
  const urlError   = document.getElementById('urlError');

  if (!history.length) {
    historyBox.classList.remove('show');
    return;
  }

  historyBox.classList.add('show');
  container.innerHTML = '';

  history.forEach(url => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span title="${url}">${url}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    `;
    item.addEventListener('click', () => {
      urlInput.value = url;
      state.url = url;
      updateUrlStatus(url, urlInput, urlStatus, urlError);
      scheduleUpdate(true);
      showToast('URL loaded from history');
    });
    container.appendChild(item);
  });
}

// ════════════════════════════════════════════════════════════
//  DOWNLOAD SYSTEM
// ════════════════════════════════════════════════════════════

async function triggerDownload(format, exportSize) {
  const isLarge = exportSize > state.qrSize;

  // If exporting at different size, temporarily resize
  if (isLarge) {
    const scaleFactor = exportSize / state.qrSize;
    qrCode.update({
      width:  exportSize,
      height: exportSize,
      margin: Math.round(state.qrSize * 0.04 * scaleFactor),
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: 0.28,
        margin: Math.max(6, Math.round(state.qrSize * 0.02 * scaleFactor)),
        crossOrigin: 'anonymous',
        saveAsBlob: true,
      },
    });
    await sleep(300);
  }

  try {
    await qrCode.download({
      name:      'GiftoraX-Premium-QR',
      extension: format,
    });
    showToast(`${format.toUpperCase()} downloaded (${exportSize}×${exportSize})`);
  } catch (err) {
    showToast('Download failed — please try again', 'error');
    console.error('[QR] Download error:', err);
  } finally {
    if (isLarge) {
      // Restore preview size
      await sleep(100);
      qrCode.update({
        width:  state.qrSize,
        height: state.qrSize,
        margin: Math.round(state.qrSize * 0.04),
        imageOptions: {
          hideBackgroundDots: true,
          imageSize: 0.28,
          margin: Math.max(6, Math.round(state.qrSize * 0.02)),
          crossOrigin: 'anonymous',
          saveAsBlob: true,
        },
      });
    }
  }
}

function initDownload() {
  // PNG download
  document.getElementById('btnDownloadPng').addEventListener('click', async () => {
    const size = parseInt(document.getElementById('resSelect').value);
    await triggerDownload('png', size);
  });

  // SVG download (always at preview size)
  document.getElementById('btnDownloadSvg').addEventListener('click', async () => {
    await triggerDownload('svg', state.qrSize);
  });

  // 4K download with loading state
  document.getElementById('btnDownload4K').addEventListener('click', async () => {
    const btn     = document.getElementById('btnDownload4K');
    const icon    = document.getElementById('dlIcon4k');
    const spinner = document.getElementById('dlSpinner4k');
    const text    = document.getElementById('dlText4k');
    const size    = parseInt(document.getElementById('resSelect').value);

    btn.disabled = true;
    icon.style.display    = 'none';
    spinner.style.display = 'block';
    text.textContent      = 'Generating…';

    await triggerDownload('png', size);

    btn.disabled = false;
    icon.style.display    = '';
    spinner.style.display = 'none';
    text.textContent      = 'Download 4K';
  });
}

// ════════════════════════════════════════════════════════════
//  RESET
// ════════════════════════════════════════════════════════════

async function resetAll() {
  // Reset state to defaults
  state.url           = 'https://giftorax.in';
  state.dotStyle      = 'classy';
  state.eyeOuterStyle = 'extra-rounded';
  state.eyeInnerStyle = 'dot';
  state.dotColor      = '#1A1A1A';
  state.cornerColor   = '#C9A857';
  state.bgColor       = '#ffffff';
  state.logoMode      = 'default';

  // Reset URL input
  const urlInput = document.getElementById('urlInput');
  urlInput.value = state.url;
  urlInput.classList.remove('valid', 'invalid');
  document.getElementById('urlStatus').classList.remove('valid', 'invalid');
  document.getElementById('urlError').classList.remove('show');

  // Reset pattern + eye selections
  document.querySelectorAll('#patternGrid .option-card').forEach(c => {
    c.classList.toggle('active', c.dataset.pattern === state.dotStyle);
  });
  document.querySelectorAll('#eyesGrid .option-card').forEach(c => {
    c.classList.toggle('active',
      c.dataset.eyeOuter === state.eyeOuterStyle &&
      c.dataset.eyeInner === state.eyeInnerStyle
    );
  });

  // Reset colors
  applyColor('dot',    state.dotColor);
  applyColor('corner', state.cornerColor);
  applyColor('bg',     state.bgColor);

  // Reset logo button states
  document.getElementById('btnDefaultLogo').classList.add('active');
  document.getElementById('labelUploadLogo').classList.remove('active');
  document.getElementById('logoUploadPreview').classList.remove('show');
  document.getElementById('logoUploadInput').value = '';

  // Reload default logo
  await loadDefaultLogo();

  // Clear localStorage
  localStorage.removeItem(LS_KEY_SETTINGS);

  scheduleUpdate(true);
  showToast('Reset to defaults ✓');
}

function initReset() {
  document.getElementById('resetBtn').addEventListener('click', resetAll);
}

// ════════════════════════════════════════════════════════════
//  LOCALSTORAGE — SAVE / RESTORE SETTINGS
// ════════════════════════════════════════════════════════════

function saveSettings() {
  const data = {
    url:           state.url,
    dotStyle:      state.dotStyle,
    eyeOuterStyle: state.eyeOuterStyle,
    eyeInnerStyle: state.eyeInnerStyle,
    dotColor:      state.dotColor,
    cornerColor:   state.cornerColor,
    bgColor:       state.bgColor,
    // Don't save logoImage (too large) — save mode only
    logoMode:      state.logoMode === 'upload' ? 'default' : state.logoMode,
  };
  try {
    localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(data));
  } catch (e) {
    // Quota exceeded — ignore
  }
}

function restoreSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY_SETTINGS);
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.url           ) state.url           = data.url;
    if (data.dotStyle      ) state.dotStyle       = data.dotStyle;
    if (data.eyeOuterStyle ) state.eyeOuterStyle  = data.eyeOuterStyle;
    if (data.eyeInnerStyle ) state.eyeInnerStyle  = data.eyeInnerStyle;
    if (data.dotColor      ) state.dotColor       = data.dotColor;
    if (data.cornerColor   ) state.cornerColor    = data.cornerColor;
    if (data.bgColor       ) state.bgColor        = data.bgColor;
    if (data.logoMode      ) state.logoMode       = data.logoMode;

    console.log('[QR] Settings restored from localStorage');
  } catch (e) {
    console.warn('[QR] Failed to restore settings:', e);
  }
}

// ════════════════════════════════════════════════════════════
//  RESPONSIVE RESIZE
// ════════════════════════════════════════════════════════════

function initResizeHandler() {
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const newSize = getQRSize();
      if (Math.abs(newSize - state.qrSize) > 24) {
        state.qrSize = newSize;
        qrCode.update({ width: newSize, height: newSize });
      }
    }, 250);
  });
}

// ════════════════════════════════════════════════════════════
//  SYNC UI FROM STATE
//  (restores option cards + inputs to match restored state)
// ════════════════════════════════════════════════════════════

function syncUIFromState() {
  // URL
  const urlInput = document.getElementById('urlInput');
  if (urlInput) urlInput.value = state.url;
  document.getElementById('currentUrlDisplay').textContent = state.url;

  // Pattern cards
  document.querySelectorAll('#patternGrid .option-card').forEach(c => {
    c.classList.toggle('active', c.dataset.pattern === state.dotStyle);
  });

  // Eye cards
  document.querySelectorAll('#eyesGrid .option-card').forEach(c => {
    c.classList.toggle('active',
      c.dataset.eyeOuter === state.eyeOuterStyle &&
      c.dataset.eyeInner === state.eyeInnerStyle
    );
  });

  // Colors
  applyColor('dot',    state.dotColor);
  applyColor('corner', state.cornerColor);
  applyColor('bg',     state.bgColor);

  // Logo buttons
  const btnDefault = document.getElementById('btnDefaultLogo');
  const labelUpload = document.getElementById('labelUploadLogo');
  btnDefault.classList.toggle('active', state.logoMode === 'default');
  labelUpload.classList.toggle('active', state.logoMode === 'upload');
}

// ════════════════════════════════════════════════════════════
//  MAIN INIT
// ════════════════════════════════════════════════════════════

async function init() {
  // 1. Restore persisted settings (fast)
  restoreSettings();

  // 2. Render history
  renderHistory();

  // 3. Load default/fallback logo
  await loadDefaultLogo();

  // 4. Init QR code instance
  initQR();

  // 5. Init ColorThief
  colorThief = new ColorThief();

  // 6. Sync UI to state (after restoring settings)
  syncUIFromState();

  // 7. Init all UI modules
  initTabs();
  initPatternPanel();
  initEyePanel();
  initLogoPanel();
  initColorPickers();
  initUrlInput();
  initDownload();
  initReset();
  initResizeHandler();

  // 8. Initial QR render (immediate)
  scheduleUpdate(true);

  console.log('[GiftoraX QR Studio] Initialized ✓');
}

// ─── Bootstrap ─────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}