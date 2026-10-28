// Service worker: guscio applicativo + dati in cache; i documenti vanno in cache solo se salvati esplicitamente.
const SHELL = "nv-shell-v3", DOCS = "nv-docs-v1";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "assets/icons/icon.svg",
  "data/products.json","data/documents.json","data/parts.json","data/diagnostics.json","data/errors.json","data/updates.json","data/contacts.json","data/faq.json","data/config.json","assets/img/logo.png","assets/img/logo-sm.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, DOCS].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  if (r.url.includes("/docs/")) { e.respondWith(caches.open(DOCS).then(c => c.match(r)).then(m => m || fetch(r))); return; }
  // network-first per avere dati aggiornati, cache come ripiego offline
  e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(SHELL).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r)));
});
