const VERSION = 'v11';
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const FILES = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/logic.js', 'js/store.js', 'js/arena.js', 'js/lehe.js', 'js/chart.js', 'js/sync.js', 'js/original.js', 'js/suggest.js', 'js/track.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'data/history.json', 'data/results.json', 'data/k3km8000_picks.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // 開獎資料：網路優先，失敗退回快取
  const dyn = ['results.json', 'arena_picks.json', 'k3km8000_picks.json'].find(f => url.pathname.endsWith('/data/' + f));
  if (dyn) {
    const key = 'data/' + dyn;
    e.respondWith(fetch(req).then(res => { if (!res.ok) throw new Error('bad'); const copy = res.clone(); caches.open(DATA).then(c => c.put(key, copy)); return res; })
      .catch(() => caches.match(key).then(r => r || caches.open(DATA).then(c => c.match(key)))
        .then(r => r ? r.blob().then(b => new Response(b, { headers: { 'content-type': 'application/json', 'x-from-cache': '1' } })) : Response.error())));
    return;
  }
  // 程式：快取優先，背景更新
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
