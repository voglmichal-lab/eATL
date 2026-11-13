/* eTechLog service worker – the app opens without signal.
   App files: network first (new version whenever online), cache as fallback.
   Libraries, fonts, icons: cache first (they never change under the same name).
   Requests to Supabase (other origin) are never touched – sync is handled in the app. */
importScripts('version.js');
const CACHE = 'etl-' + (self.ETL_VERSION || 'dev');
const SHELL = ['./', 'index.html', 'app.css', 'fonts.css', 'app.js', 'ftl.js', 'config.js', 'version.js', 'manifest.webmanifest',
  'vendor/supabase.js', 'vendor/591.supabase.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/qrcode.min.js', 'vendor/jsqr.min.js',
  'vendor/pdf-lib.min.js', 'vendor/fontkit.min.js', 'fonts/pdf/barlow-400.ttf', 'fonts/pdf/barlow-600.ttf', 'fonts/pdf/plexmono-400.ttf', 'fonts/pdf/plexmono-600.ttf',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const FONTS = [
  'barlow-latin-400', 'barlow-latin-500', 'barlow-latin-600', 'barlow-latin-700',
  'barlow-latin-ext-400', 'barlow-latin-ext-500', 'barlow-latin-ext-600', 'barlow-latin-ext-700',
  'barlow-condensed-latin-500', 'barlow-condensed-latin-600', 'barlow-condensed-latin-700',
  'barlow-condensed-latin-ext-500', 'barlow-condensed-latin-ext-600', 'barlow-condensed-latin-ext-700',
  'ibm-plex-mono-latin-400', 'ibm-plex-mono-latin-500', 'ibm-plex-mono-latin-600',
  'ibm-plex-mono-latin-ext-400', 'ibm-plex-mono-latin-ext-500', 'ibm-plex-mono-latin-ext-600'
].map(f => 'fonts/' + f + '-normal.woff2');

// Everything the app needs to start and work without signal must be cached, or the new version is not installed
// (the previous one keeps running). Fonts and icons are best effort: a missing one never blocks offline start.
const REQUIRED = SHELL.filter(f => !f.startsWith('icons/'));
const OPTIONAL = SHELL.filter(f => f.startsWith('icons/')).concat(FONTS);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(REQUIRED.map(u => new Request(u, { cache: 'reload' })))
    .then(() => Promise.all(OPTIONAL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('etl-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const immutable = p => /\/(vendor|fonts|icons)\//.test(p);
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (immutable(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return res;
    })));
    return;
  }
  // app shell: try the network briefly, fall back to the cached copy (weak signal on the apron)
  e.respondWith(Promise.race([fetch(req), timeout(4000)]).then(res => {
    if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
