const CACHE = 'mivtzaim-v59';
const SHELL = ['./', 'index.html', 'style.css', 'i18n.js', 'foods.js', 'depts.js', 'app.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// קודם רשת, ובלי חיבור – מהמטמון. בקשות API לא נשמרות.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request)),
  );
});

self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: '🛒', body: '' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: 'icon-192.png', badge: 'icon-192.png', dir: data.dir || 'auto', lang: data.lang || '',
    data: { url: data.url || '/' }, tag: 'deals',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((ws) => {
    const w = ws.find((x) => 'focus' in x);
    return w ? w.focus() : clients.openWindow(e.notification.data.url);
  }));
});
