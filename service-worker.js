/**
 * Service Worker – Multiversaires PWA
 * Stratégie : Cache First pour les assets statiques
 */

const CACHE_NAME = 'multiversaires-v2.0.0';
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

// Installation : mise en cache des assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Mise en cache des assets statiques');
      return cache.addAll(ASSETS_TO_CACHE.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Certains assets n\'ont pas pu être mis en cache:', err));
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch : Cache First, puis réseau
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET et les extensions Chrome
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Mettre en cache les nouvelles ressources
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback pour les pages HTML
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
