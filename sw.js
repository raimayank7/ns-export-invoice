const CACHE = 'ns-export-invoice-9378b21b57';
const SHELL = ["/", "/assets/base.css?v=bb5852b14f", "/assets/doc.css?v=3c60cdb583", "/assets/i18n.js?v=5f16ab77eb", "/assets/store.js?v=85f91703b6", "/assets/core.js?v=2f2095abfa", "/assets/safe.js?v=69ce2e3766", "/assets/help.js?v=ddaed68b26", "/assets/books.js?v=b80078c8e4", "/assets/extras.js?v=6479f34b4b", "/assets/gstfetch.js?v=77942f1a8e", "/assets/docs.js?v=48ca5fc5fb", "/assets/docmore.js?v=9de01ddeb6", "/assets/export.js?v=93f6432d81", "/assets/einv.js?v=e7e8f96589", "/assets/safe.css?v=f3b3edd6eb", "/assets/desk.js?v=c1e190d263", "/assets/desk.css?v=28ee17df01", "/assets/contact.js?v=d065ca16d0", "/assets/xlsx.js?v=9c9abd01b6", "/assets/tally.js?v=bb798e5007", "/assets/acct.js?v=5ab3ff2906"];
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
