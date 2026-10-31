// Service worker : l'app s'ouvre hors ligne une fois visitée.
// Les modèles d'IA ne passent pas ici : WebLLM gère son propre cache.
// v2 : purge les 404 que la v1 avait pu garder (page blanche si un fichier JS manquait).
const VERSION = "parle-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  // Ne supprimer que les anciennes versions de NOTRE cache (parle-v1, parle-v2…) :
  // les modèles (webllm/*, transformers-cache, parle-voice-*) pèsent des Go et sont gérés ailleurs.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => /^parle-v\d+$/.test(k) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Pages : réseau d'abord (dernière version), cache si hors ligne.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(self.registration.scope))),
    );
    return;
  }

  // Fichiers versionnés de Next : cache d'abord. Seules les réponses valides sont gardées :
  // un 404 passager (déploiement en cours) mis en cache bloquerait l'app pour toujours.
  if (url.pathname.includes("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          (hit && hit.ok && hit) ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Le reste (icônes…) : cache, puis mise à jour en arrière-plan.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || net;
    }),
  );
});
