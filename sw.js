const CACHE_NAME = 'amwaj-v1';
const assets = [
  '/',
  'index.html',
  'style.css',
  'main.js',
  'data.js',
  'logo.png.jpeg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});
