const CACHE = 'ft-shell-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/offline.html', '/icon.svg'])))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
// Hanya halaman navigasi yang punya cadangan offline; data lokasi tidak pernah dicache.
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')))
})
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data.json() } catch (_) { /* abaikan */ }
  e.waitUntil(self.registration.showNotification(d.title || 'Family Tracker', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag,
    data: { url: d.url || '/notifikasi' }, requireInteraction: !!d.urgent,
    vibrate: d.urgent ? [300, 150, 300, 150, 600] : [100],
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus() }
    return clients.openWindow(url)
  }))
})
