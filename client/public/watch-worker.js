self.addEventListener("push", event => {
  let message;
  try {
    message = event.data?.json();
  } catch {
    message = undefined;
  }
  if (!message || typeof message.title !== "string" || typeof message.body !== "string") {
    event.waitUntil(self.registration.showNotification("GPU Price Tracker", {
      body: "Open the tracker to check your watchlist.",
    }));
    return;
  }
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    tag: message.tag,
    data: { url: message.url },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const scope = self.registration.scope;
  let target = scope;
  try {
    const candidate = new URL(event.notification.data?.url, scope);
    if (candidate.href.startsWith(scope)) target = candidate.href;
  } catch {
    // Open the dashboard if a notification lacks a usable listing link.
  }
  event.waitUntil(self.clients.openWindow(target));
});
