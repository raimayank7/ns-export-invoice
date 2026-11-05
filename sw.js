const CACHE = 'ns-export-invoice-2d0b207f6f';
const SHELL = ["/", "/assets/base.css?v=ceba346051", "/assets/doc.css?v=757271abe2", "/assets/i18n.js?v=35752e6a8c", "/assets/store.js?v=425a88f908", "/assets/core.js?v=76e512bd6f", "/assets/safe.js?v=2dfed74206", "/assets/help.js?v=ddaed68b26", "/assets/books.js?v=c16d2ce560", "/assets/extras.js?v=857c723793", "/assets/gstfetch.js?v=77942f1a8e", "/assets/docs.js?v=059fd354c9", "/assets/docmore.js?v=9de01ddeb6", "/assets/export.js?v=93f6432d81", "/assets/einv.js?v=cd7ddf3c80", "/assets/safe.css?v=f3b3edd6eb", "/assets/desk.js?v=9a150c505b", "/assets/desk.css?v=0ce22ea803", "/assets/contact.js?v=d065ca16d0", "/assets/xlsx.js?v=9c9abd01b6", "/assets/tally.js?v=7b3f6fd707", "/assets/acct.js?v=78527f0909"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('ns-') && n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin !== location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|assets\.niveshsahayak\.in/.test(u.host))
      e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); return res; })));
    return;
  }
  if (r.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/')) {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match('/'))));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: false }).then(m => m || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); } return res; })));
});
