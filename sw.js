/* ═══════════════════════════════════════════════════════════
   AMP KART — Service Worker  (Production Grade)
   Strategy: Cache-First for assets, Network-First for HTML
   ═══════════════════════════════════════════════════════════ */

const SW_VERSION   = 'v6';
const CACHE_STATIC = `ampkart-static-${SW_VERSION}`;
const CACHE_PAGES  = `ampkart-pages-${SW_VERSION}`;
const CACHE_IMG    = `ampkart-images-${SW_VERSION}`;

/* ── FILES TO PRE-CACHE ON INSTALL ──────────────────────── */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/calculator.html',
  '/compressor.html',
  '/qr.html',
  '/manifest.json'
];

/* ── OFFLINE FALLBACK HTML ───────────────────────────────── */
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>AMP KART — Offline</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Poppins',system-ui,sans-serif;background:#000;color:#fff;
         min-height:100vh;display:flex;align-items:center;justify-content:center;
         text-align:center;padding:24px}
    .wrap{max-width:340px}
    .icon{font-size:56px;margin-bottom:16px}
    h1{font-size:22px;font-weight:800;color:#FFD600;margin-bottom:8px;letter-spacing:1px}
    p{font-size:13px;color:rgba(255,255,255,.55);line-height:1.6;margin-bottom:24px}
    button{background:#FFD600;color:#000;font-weight:700;font-size:13px;
           padding:12px 28px;border-radius:10px;border:none;cursor:pointer;
           letter-spacing:.4px;transition:.15s}
    button:active{transform:scale(.97)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="icon">📡</div>
    <h1>YOU'RE OFFLINE</h1>
    <p>No internet connection detected.<br>
       Please check your connection and try again.</p>
    <button onclick="location.reload()">↻ Try Again</button>
  </div>
</body>
</html>`;

/* ════════════════════════════════════════════════════════════
   INSTALL — Pre-cache all critical assets
   ════════════════════════════════════════════════════════════ */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      /* Cache static assets */
      const staticCache = await caches.open(CACHE_STATIC);
      await staticCache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[SW] Pre-cache partial failure (non-fatal):', err);
      });

      /* Cache offline fallback */
      const pagesCache = await caches.open(CACHE_PAGES);
      await pagesCache.put(
        new Request('/offline.html'),
        new Response(OFFLINE_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      );

      /* Activate immediately without waiting */
      await self.skipWaiting();
    })()
  );
});

/* ════════════════════════════════════════════════════════════
   ACTIVATE — Clean old caches, claim all clients
   ════════════════════════════════════════════════════════════ */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      /* Remove stale caches from previous versions */
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k =>
            (k.startsWith('ampkart-static-') ||
             k.startsWith('ampkart-pages-')  ||
             k.startsWith('ampkart-images-') ||
             k.startsWith('ampkart-tools-')) /* legacy name */
            && k !== CACHE_STATIC
            && k !== CACHE_PAGES
            && k !== CACHE_IMG
          )
          .map(k => caches.delete(k))
      );

      /* Take control of all open tabs immediately */
      await self.clients.claim();
    })()
  );
});

/* ════════════════════════════════════════════════════════════
   FETCH — Smart routing strategy
   ════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET and browser-extension requests */
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  /* ── STRATEGY 1: HTML pages → Network-First, fallback to cache then offline ── */
  if (request.headers.get('accept')?.includes('text/html') ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/') {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  /* ── STRATEGY 2: Images → Cache-First with background refresh ── */
  if (request.destination === 'image' ||
      /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  /* ── STRATEGY 3: Fonts / CDN → Cache-First (long-lived) ── */
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  /* ── STRATEGY 4: Everything else → Stale-While-Revalidate ── */
  event.respondWith(staleWhileRevalidate(request));
});

/* ════════════════════════════════════════════════════════════
   STRATEGY HELPERS
   ════════════════════════════════════════════════════════════ */

/** Network-first for HTML pages — ensures fresh content when online */
async function networkFirstHTML(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_PAGES);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    /* Offline: try cache first */
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    /* Ultimate fallback: offline page */
    const offline = await caches.match('/offline.html');
    return offline || new Response('Offline', { status: 503 });
  }
}

/** Cache-first for images — serve from cache immediately, update in background */
async function cacheFirstImage(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_IMG);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('', { status: 408 });
  }
}

/** Cache-first for static/CDN assets */
async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('', { status: 503 });
  }
}

/** Stale-While-Revalidate — serve cache instantly, update in background */
async function staleWhileRevalidate(request) {
  const cache       = await caches.open(CACHE_STATIC);
  const cached      = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) cache.put(request, networkResponse.clone());
      return networkResponse;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response('', { status: 503 });
}

/* ════════════════════════════════════════════════════════════
   MESSAGE — Handle update commands from the page
   ════════════════════════════════════════════════════════════ */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
  }
});