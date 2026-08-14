/**
 * Service Worker – Multiversaires PWA v5.0.0
 * Stratégie : Network-First pour le code (mise à jour automatique sans vider le cache)
 * + Fallback Cache pour le mode offline.
 */

const CACHE_NAME = 'multiversaires-v5.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/timer.js',
  './js/milestones.js',
  './js/calendar.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
];

// Installation : forcer le remplacement immédiat du SW
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW v5.0.0] Mise en cache initiale');
      return cache.addAll(ASSETS_TO_CACHE.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Avertissement mise en cache:', err));
    })
  );
});

// Activation : prendre le contrôle immédiatement et supprimer tous les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Nettoyage ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch : Stratégie Network-First pour toujours charger le dernier code en ligne
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Network-First pour HTML, JS, CSS et JSON
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Mode hors-ligne : fallback sur le cache local
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
