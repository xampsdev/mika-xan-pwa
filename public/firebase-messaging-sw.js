/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Parse Firebase config dynamically from registration URL query parameters (avoids hardcoded keys)
const swUrl = new URL(self.location.href);
const apiKey = swUrl.searchParams.get('apiKey');
const projectId = swUrl.searchParams.get('projectId');
const messagingSenderId = swUrl.searchParams.get('messagingSenderId');
const appId = swUrl.searchParams.get('appId');
const authDomain = swUrl.searchParams.get('authDomain');
const storageBucket = swUrl.searchParams.get('storageBucket');

if (apiKey && projectId) {
  try {
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

    firebase.initializeApp({
      apiKey,
      authDomain: authDomain || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: storageBucket || `${projectId}.firebasestorage.app`,
      messagingSenderId: messagingSenderId || '',
      appId: appId || '',
    });

    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Background FCM message:', payload);

      const title = payload.notification?.title || payload.data?.title || '🐾 Mika & Xan - Check-in';
      const options = {
        body: payload.notification?.body || payload.data?.body || 'Um novo pet realizou check-in no sistema.',
        icon: '/pwa-192x192.png',
        badge: '/apple-touch-icon.png',
        tag: payload.data?.stayId || 'mika-xan-checkin',
        data: {
          url: payload.data?.url || '/?view=admin',
          stayId: payload.data?.stayId || '',
        },
        actions: [
          {
            action: 'open_admin',
            title: 'Ver no Painel',
          },
        ],
      };

      return self.registration.showNotification(title, options);
    });
  } catch (err) {
    console.warn('[firebase-messaging-sw.js] Firebase SDK init notice:', err);
  }
}

// Standard Web Push Event Handler (functions independently without requiring hardcoded Firebase credentials)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || payload.notification?.title || '🐾 Mika & Xan - Check-in';
    const options = {
      body: payload.body || payload.notification?.body || 'Um novo check-in acabou de chegar no sistema.',
      icon: '/pwa-192x192.png',
      badge: '/apple-touch-icon.png',
      tag: payload.tag || payload.data?.stayId || 'mika-xan-alert',
      data: {
        url: payload.url || payload.data?.url || '/?view=admin',
        stayId: payload.stayId || payload.data?.stayId || '',
      },
      vibrate: [200, 100, 200],
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('🐾 Mika & Xan', {
        body: text,
        icon: '/pwa-192x192.png',
      })
    );
  }
});

// Handle notification click to focus existing tab or open admin route
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/?view=admin';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If an open window of our app exists, focus it and navigate
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            if ('navigate' in client) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
