const CACHE_NAME = 'amwaj-v2';
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
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});

// =============================================
// === Push Notification Handler (FCM/VAPID) ===
// =============================================
self.addEventListener('push', function(event) {
  let data = { title: 'أمواج الصياد', body: 'تنبيه جديد!', url: '/', type: 'general' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: 'logo.png.jpeg',
    badge: 'logo.png.jpeg',
    vibrate: [200, 100, 200],
    tag: data.type || 'general',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/',
      type: data.type
    },
    actions: [
      { action: 'open', title: 'فتح' },
      { action: 'close', title: 'إغلاق' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// =============================================
// === Local Notification from Page Message  ===
// =============================================
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, url, tag, requireInteraction } = event.data;
    const options = {
      body: body || '',
      icon: 'logo.png.jpeg',
      badge: 'logo.png.jpeg',
      vibrate: [200, 100, 200],
      tag: tag || 'amwaj-notification',
      renotify: true,
      requireInteraction: requireInteraction !== false,
      data: { url: url || '/' },
      dir: 'rtl',
      lang: 'ar'
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});

// =============================================
// === Notification Click Handler            ===
// =============================================
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is already open, focus it and navigate
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
