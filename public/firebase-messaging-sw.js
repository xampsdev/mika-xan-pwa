/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Firebase Cloud Messaging Service Worker for background push notifications
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Initialize Firebase inside the Service Worker
firebase.initializeApp({
  apiKey: 'AIzaSyDqe7sAl4OPUJeT0p_1qau0xqatVFpZb8c',
  authDomain: 'mika-xan-pets.firebaseapp.com',
  projectId: 'mika-xan-pets',
  storageBucket: 'mika-xan-pets.firebasestorage.app',
  messagingSenderId: '148546515294',
  appId: '1:148546515294:web:78482a1b8165b0ad8e1fcf',
});

const messaging = firebase.messaging();

// Handle background notifications pushed from Firebase Cloud Messaging
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

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
