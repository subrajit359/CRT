/* CrLearn service worker — web push only. */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "CrLearn", body: event.data?.text() || "" }; }
  const title = data.title || "CrLearn";
  const options = {
    body: data.body || "",
    icon: data.icon || "/logo.png",
    badge: data.badge || "/notification-icon.png",
    tag: data.tag || "reasonal",
    data: { link: data.link || "/notifications", kind: data.kind || "general" },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        try {
          const url = new URL(c.url);
          if (url.origin === self.location.origin) {
            c.focus();
            return c.navigate(link);
          }
        } catch (e) {}
      }
      return self.clients.openWindow(link);
    })
  );
});
