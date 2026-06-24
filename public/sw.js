const CACHE = "PARISA-V10";
const STATIC = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json", "/logo.jpg"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API calls — always network, never cache
  if (url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/chat") ||
      url.pathname.startsWith("/voice") ||
      url.pathname.startsWith("/analyze") ||
      url.pathname.startsWith("/log") ||
      url.pathname.startsWith("/drive") ||
      url.pathname.startsWith("/image") ||
      url.pathname.startsWith("/refresh-drive")) return;

  // HTML, JS, CSS — network first so fixes deploy immediately
  const isCore = ["/", "/index.html", "/app.js", "/style.css"].includes(url.pathname);
  if (isCore) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets (images, manifest) — cache first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});

self.addEventListener("push", (e) => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || "PARISA AI", {
      body: data.body || "",
      icon: "/logo.jpg",
      badge: "/logo.jpg",
      silent: false,
      data: {},
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cls) => {
    if (cls.length) return cls[0].focus();
    return self.clients.openWindow("/");
  }));
});
