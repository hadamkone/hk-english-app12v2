/**
 * sw.js — Service Worker pour "Programme d'anglais HK"
 * Stratégie : Cache-First pour les assets statiques,
 *              Network-First pour les requêtes réseau dynamiques.
 */

const CACHE_NAME = 'anglais-hk-v1';
const OFFLINE_PAGE = './index.html';

// Assets à mettre en cache dès l'installation
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png'
];

// ─── INSTALLATION ────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installation…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pré-cache des assets statiques');
        // On utilise { cache: 'reload' } pour éviter les réponses HTTP périmées
        return cache.addAll(
          PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' }))
        );
      })
      .then(() => self.skipWaiting()) // Active immédiatement le nouveau SW
  );
});

// ─── ACTIVATION ──────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activation…');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)   // Supprime les anciens caches
          .map(name => {
            console.log('[SW] Suppression ancien cache :', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim()) // Prend le contrôle des onglets ouverts
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // On ne gère que les requêtes GET
  if (request.method !== 'GET') return;

  // Ignorer les requêtes vers des origines externes (analytics, CDN tiers…)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // ── Cache-First : asset trouvé dans le cache ──────────────────────────
        // On rafraîchit le cache en arrière-plan (stale-while-revalidate)
        const fetchPromise = fetch(request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => { /* réseau indisponible, on garde le cache */ });

        // On retourne immédiatement la version en cache
        event.waitUntil(fetchPromise);
        return cachedResponse;
      }

      // ── Network-First : asset absent du cache ─────────────────────────────
      return fetch(request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
            return networkResponse;
          }
          // On met en cache la réponse pour les prochains accès hors-ligne
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          return networkResponse;
        })
        .catch(() => {
          // ── Fallback hors-ligne ───────────────────────────────────────────
          // Pour les pages HTML, on sert la page principale en cache
          if (request.headers.get('Accept') && request.headers.get('Accept').includes('text/html')) {
            return caches.match(OFFLINE_PAGE);
          }
          // Pour les autres assets, on retourne une réponse vide
          return new Response('', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
    })
  );
});

// ─── MESSAGES (optionnel : forcer la mise à jour depuis l'UI) ─────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
