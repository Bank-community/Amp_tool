/* Code Compiler – paste code, name it, pick a language, download it as-is.
 * Everything runs locally. The code is treated as plain text only:
 * never executed, never uploaded, never stored.
 *
 * Editor: native <textarea> + line-number gutter. It needs no CDN, so it
 * can't fail to load and stays fast on 5,000+ line files.
 */
(() => {
  'use strict';

  /* ---------- Config ---------- */
  const LANGS = {
    html: { ext: 'html', mime: 'text/html;charset=utf-8', label: 'HTML' },
    css:  { ext: 'css',  mime: 'text/css;charset=utf-8',  label: 'CSS' },
    js:   { ext: 'js',   mime: 'text/javascript;charset=utf-8', label: 'JavaScript' },
    txt:  { ext: 'txt',  mime: 'text/plain;charset=utf-8', label: 'Text' }
  };
  const EXT_RE = /\.(html?|css|m?js|txt)$/i;
  const EXT_MAP = { htm: 'html', html: 'html', css: 'css', js: 'js', mjs: 'js', txt: 'txt' };
  const BAD_CHARS = /[\u0000-\u001f<>:"\/\\|?*]/g;
  const BIG_BYTES = 5 * 1024 * 1024;

  /* ---------- Elements ---------- */
  const $ = (id) => document.getElementById(id);
  const code = $('code'), gutter = $('gutter'), fname = $('fname');
  const pasteBtn = $('pasteBtn'), dlBtn = $('dlBtn');
  const radios = [...document.querySelectorAll('input[name="lang"]')];

  /* ---------- State ---------- */
  let lang = '';            // selected language key
  let userPicked = false;   // true once the user clicks a language card
  let locked = false;       // blocks repeated downloads
  let tabTrap = true;       // Esc releases Tab so keyboard users can leave the editor
  let lastLines = -1, raf = 0, toastTimer = 0;

  /* ---------- UI helpers ---------- */
  function toast(msg, type = 'info') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 3400);
  }

  function confirmBox(title, msg) {
    const dlg = $('dlg');
    if (typeof dlg.showModal !== 'function') return Promise.resolve(window.confirm(msg));
    $('dlgT').textContent = title;
    $('dlgM').textContent = msg;
    dlg.returnValue = '';
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
    });
  }

  function reveal() {
    $('step2').hidden = false;
    $('step3').hidden = false;
  }

  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  /* ---------- Editor: stats + gutter ---------- */
  function countLines(v) {
    let n = 1;
    for (let i = v.indexOf('\n'); i !== -1; i = v.indexOf('\n', i + 1)) n++;
    return n;
  }

  function onInput() {
    if (raf) return;                       // coalesce bursts into one update per frame
    raf = requestAnimationFrame(() => {
      raf = 0;
      const v = code.value;
      const lines = v ? countLines(v) : 0;
      const shown = Math.max(lines, 1);
      if (shown !== lastLines) {           // rebuild gutter only when line count changes
        lastLines = shown;
        const parts = new Array(shown);
        for (let i = 0; i < shown; i++) parts[i] = i + 1;
        gutter.textContent = parts.join('\n');
        gutter.style.minWidth = (String(shown).length + 2) + 'ch';
      }
      gutter.scrollTop = code.scrollTop;
      $('stLines').textContent = lines.toLocaleString();
      $('stChars').textContent = v.length.toLocaleString();
      $('stSize').textContent = fmtSize(new Blob([v]).size);
      refresh();
    });
  }

  function setCode(text) {
    code.value = text;
    code.scrollTop = code.scrollLeft = 0;
    lastLines = -1;
    onInput();
  }

  function insertText(t) {
    code.focus();
    // execCommand keeps the native undo stack; setRangeText is the fallback
    if (!document.execCommand('insertText', false, t)) {
      code.setRangeText(t, code.selectionStart, code.selectionEnd, 'end');
      onInput();
    }
  }

  code.addEventListener('input', onInput);
  code.addEventListener('scroll', () => { gutter.scrollTop = code.scrollTop; });
  code.addEventListener('blur', () => { tabTrap = true; });
  code.addEventListener('paste', () => setTimeout(autoSuggest, 0));

  code.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { tabTrap = false; return; }
    if (e.key === 'Tab' && tabTrap && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      insertText('\t');
    }
  });

  // Auto-indent on Enter. beforeinput also fires for Android soft keyboards.
  code.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertLineBreak') return;
    e.preventDefault();
    const v = code.value, s = code.selectionStart;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const indent = v.slice(lineStart, s).match(/^[ \t]*/)[0];
    const opens = s > 0 && '{[('.includes(v[s - 1]);
    insertText('\n' + indent + (opens ? '\t' : ''));
  });

  /* ---------- Filename + language ---------- */
  function cleanName(raw) {
    let n = raw.replace(BAD_CHARS, '').trim();
    while (EXT_RE.test(n)) n = n.replace(EXT_RE, '');   // no duplicate extensions
    return n.replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 100);
  }

  function extFromName(raw) {
    const m = raw.trim().match(EXT_RE);
    return m ? EXT_MAP[m[1].toLowerCase()] : '';
  }

  // Guess the type from the content. Anything that isn't clearly HTML, JS or CSS is plain text.
  function sniff(text) {
    const s = text.trimStart().slice(0, 3000);
    if (!s) return '';
    if (/^<(!doctype|!--|\/?[a-z][\w-]*[\s>\/])/i.test(s)) return 'html';
    if (/\b(function\s*[\w$]*\s*\(|(?:const|let|var)\s+[\w$]+\s*[=;,]|import\s[^\n]*\sfrom\s|export\s+(?:default|const|let|function|class|async)|class\s+\w+\s*(?:extends\s+\w+\s*)?\{|console\.\w+|document\.\w+|require\(|=>)/.test(s)) return 'js';
    if (/(^|\n)\s*(@[a-z-]+|[.#:\[]?[\w*-][^{;\n]*)\{[^}]*:/.test(s)) return 'css';
    return 'txt';
  }

  function selectLang(key, picked) {
    lang = key;
    if (picked) userPicked = true;
    radios.forEach((r) => { r.checked = r.value === key; });
    refresh();
  }

  function autoSuggest() {
    if (userPicked) return;
    const key = extFromName(fname.value) || sniff(code.value);
    if (key) {
      selectLang(key, false);
      $('langHint').textContent = LANGS[key].label + ' suggested automatically. Tap another card to change it.';
    }
  }

  radios.forEach((r) => r.addEventListener('change', () => {
    selectLang(r.value, true);
    $('langHint').textContent = LANGS[r.value].label + ' selected.';
  }));

  fname.addEventListener('input', () => {
    const cleaned = fname.value.replace(BAD_CHARS, '');
    if (cleaned !== fname.value) fname.value = cleaned;
    autoSuggest();
    refresh();
  });
  fname.addEventListener('blur', () => {
    // tidy visible text, keep a typed extension out of the way
    const n = cleanName(fname.value);
    if (n || !fname.value.trim()) fname.value = n;
    refresh();
  });

  /* ---------- Validation + preview ---------- */
  function problem() {
    if (!code.value.trim()) return 'Add some code first.';
    if (!cleanName(fname.value)) return 'Enter a file name.';
    if (!lang) return 'Select a language: HTML, CSS, JavaScript or Text.';
    return '';
  }

  function finalName() {
    const n = cleanName(fname.value);
    return n && lang ? n + '.' + LANGS[lang].ext : '';
  }

  function refresh() {
    const name = finalName();
    const p = problem();
    $('preview').textContent = name || '—';
    const st = $('status');
    st.textContent = p || 'Ready to download.';
    st.className = 'status' + (p ? '' : ' ready');
    dlBtn.setAttribute('aria-disabled', String(!!p || locked));
  }

  /* ---------- Paste ---------- */
  // Open Editor: reveal, scroll to it and focus (no clipboard access, nothing replaced).
  function openEditor() {
    reveal();
    $('step2').scrollIntoView({ behavior: 'smooth', block: 'start' });
    code.focus({ preventScroll: true });
  }

  function clipboardMessage(err) {
    if (!window.isSecureContext) return 'Clipboard needs a secure page (HTTPS or localhost). Tap Open Editor to paste manually.';
    if (err && err.name === 'NotAllowedError') return 'Clipboard permission was denied. Allow it in your browser’s site settings, or tap Open Editor.';
    return 'Clipboard access unavailable. Tap Open Editor to paste manually.';
  }

  async function pasteFromClipboard() {
    if (pasteBtn.classList.contains('busy')) return;
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      toast(clipboardMessage(), 'warn');
      return;
    }
    pasteBtn.classList.add('busy');
    $('pasteLbl').textContent = 'Reading clipboard…';
    let text;
    try {
      text = await navigator.clipboard.readText();   // whole clipboard in one call
    } catch (err) {
      toast(clipboardMessage(err), 'warn');
      return;
    } finally {
      pasteBtn.classList.remove('busy');
      $('pasteLbl').textContent = 'Paste Code';
    }
    if (!text) { toast('Clipboard is empty. Copy your code first.', 'warn'); return; }

    if (code.value.length) {
      const ok = await confirmBox('Replace existing code?', 'The editor already has code. Pasting will replace it.');
      if (!ok) return;
    }
    setCode(text);
    reveal();
    userPicked = false;
    autoSuggest();
    const lines = countLines(text);
    toast('Code pasted successfully! ' + lines.toLocaleString() + ' lines.', 'ok');
    if (text.length > BIG_BYTES) toast('Large file (' + fmtSize(text.length) + '). The editor may feel slower.', 'info');
    $('step2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  pasteBtn.addEventListener('click', pasteFromClipboard);
  $('openBtn').addEventListener('click', openEditor);

  /* ---------- Editor controls ---------- */
  $('selBtn').addEventListener('click', () => {
    if (!code.value) return toast('Editor is empty.', 'err');
    code.focus();
    code.select();
    code.setSelectionRange(0, code.value.length);   // iOS/Android need the explicit range
  });

  $('copyBtn').addEventListener('click', async () => {
    if (!code.value) return toast('Nothing to copy.', 'err');
    try {
      await navigator.clipboard.writeText(code.value);
      toast('Code copied.', 'ok');
    } catch (err) {
      code.focus();
      code.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
      toast(ok ? 'Code copied.' : 'Copy failed. Use Select All, then copy manually.', ok ? 'ok' : 'err');
    }
  });

  $('undoBtn').addEventListener('click', () => { code.focus(); document.execCommand('undo'); });
  $('redoBtn').addEventListener('click', () => { code.focus(); document.execCommand('redo'); });

  $('clearBtn').addEventListener('click', async () => {
    if (!code.value) return toast('Editor is already empty.', 'info');
    if (await confirmBox('Clear all code?', 'This removes everything from the editor.')) {
      setCode('');
      toast('Editor cleared.', 'ok');
    }
  });

  /* ---------- Download ---------- */
  function download() {
    if (locked) return;
    const p = problem();
    if (p) { toast(p, 'err'); return; }

    locked = true;
    refresh();
    const name = finalName();
    try {
      const blob = new Blob([code.value], { type: LANGS[lang].mime });  // exact editor content
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);  // free the Blob URL
      toast('Download started: ' + name, 'ok');
    } catch (err) {
      toast('Download failed. Try again or use Copy Code instead.', 'err');
    }
    setTimeout(() => { locked = false; refresh(); }, 1500);
  }

  dlBtn.addEventListener('click', download);

  /* ---------- Init ---------- */
  onInput();
})();