self.addEventListener('push', (event) => {
  console.log('[SW] Push recebido:', event);
  
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (e) {
    console.error('[SW] Erro ao processar JSON do push:', e);
    data = { title: 'Nova Notificação', body: event.data?.text() || 'Você tem uma nova atualização.' };
  }

  const title = data.title || '💰 Pagamento Recebido!';
  const options = {
    body: data.body || 'Uma nova venda foi confirmada no seu checkout.',
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    data: data.url || '/dashboard',
    vibrate: [200, 100, 200],
    tag: 'payment-notification',
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Ver Dashboard' }
    ],
    // iOS specific attributes if needed in future
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notificação clicada:', event.notification.tag);
  event.notification.close();
  const urlToOpen = event.notification.data || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window open with this URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Clean up old caches if necessary
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativado e pronto.');
  event.waitUntil(clients.claim());
});
