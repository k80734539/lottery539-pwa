const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const FILES = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/logic.js', 'js/store.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'data/history.json', 'data/results.json'];

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
  if (url.pathname.endsWith('/data/results.json')) {
    e.respondWith(fetch(req).then(res => { if (!res.ok) throw new Error('bad'); const copy = res.clone(); caches.open(DATA).then(c => c.put('data/results.json', copy)); return res; })
      .catch(() => caches.match('data/results.json').then(r => r || caches.open(DATA).then(c => c.match('data/results.json')))
        .then(r => r ? r.blob().then(b => new Response(b, { headers: { 'content-type': 'application/json', 'x-from-cache': '1' } })) : Response.error())));
    return;
  }
  // 程式：快取優先，背景更新
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
