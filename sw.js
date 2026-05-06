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

// Push Notification Support
self.addEventListener('push', function(event) {
  let data = { title: 'أمواج الصياد', body: 'تنبيه جديد من المطعم!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: 'logo.png.jpeg',
    badge: 'logo.png.jpeg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
