// Couchline's service worker. It caches nothing (a watch room needs the live server anyway);
// it exists so Android lets Couchline be installed and appear in the share sheet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
