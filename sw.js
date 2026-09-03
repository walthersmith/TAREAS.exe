// Service worker: cachea los estáticos para que la app funcione sin conexión.
// Sólo se registra al servir por HTTP; abriendo por file:// no interviene.
const CACHE = "tareas-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
  "./icon-maskable.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // cache: "reload" evita sembrar la caché desde la caché HTTP del
      // navegador, que es como el SW acaba fijando una versión vieja de la app.
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero y caché sólo como respaldo sin conexión. Las navegaciones se
// piden además con cache: "reload" para que una edición del código se vea en
// la siguiente recarga en vez de quedar clavada una versión vieja.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  // No interceptar cross-origin: YouTube, Icecast, etc. Cachear un stream
  // de radio infinito o devolver index.html como "iframe_api" rompe el lofi.
  const reqUrl = new URL(e.request.url);
  if (reqUrl.origin !== self.location.origin) return;

  const req = new Request(e.request.url, { cache: "reload" });

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((hit) => hit || caches.match("./index.html"))
      )
  );
});
