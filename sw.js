const CACHE = "rhs-installs-v4";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./plays.json",
  "./schedule.json",
  "./pdfs/week1-practice.pdf",
  "./pdfs/motions.pdf",
  "./manifest.json",
  "./icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      // Cache every play image + PDF listed in plays.json
      const res = await fetch("./plays.json");
      const data = await res.json();
      const urls = new Set();
      for (const p of data.plays) {
        urls.add("./" + p.image);
        urls.add("./" + p.pdf);
      }
      for (const d of data.days) {
        urls.add("./" + d.pdf);
      }
      await Promise.all(
        [...urls].map(async (url) => {
          try {
            await cache.add(url);
          } catch (e) {
            console.warn("skip cache", url, e);
          }
        })
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        if (req.mode === "navigate") {
          return caches.match("./index.html");
        }
        throw err;
      }
    })()
  );
});
