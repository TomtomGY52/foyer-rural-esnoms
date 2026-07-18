const CACHE_NAME = 'foyer-rural-cache-v2.1';
const ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/app.js',
  '/logo.png'
];

// Install Event
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network-first fallback to cache)
self.addEventListener('fetch', e => {
  // Only cache GET requests and skip firebase/firestore/auth dynamic requests
  if (e.request.method !== 'GET' || e.request.url.includes('/__/firebase/') || e.request.url.includes('googleapis.com')) {
    return;
  }
  
  e.respondWith(
    fetch(e.request).then(response => {
      const rc = response.clone();
      caches.open(CACHE_NAME).then(cache => {
        cache.put(e.request, rc);
      });
      return response;
    }).catch(() => {
      return caches.match(e.request);
    })
  );
});
