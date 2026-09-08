/* ==========================================================================
   FiDo-5 — Offline worker.
   Scoped to /fido5/ so it can never serve or cache anything else on the site.
   Cache-first for the game's own files, because they are versioned by name in
   the cache key: bump VERSION on release and the old cache is dropped.
   ========================================================================== */

const VERSION = 'fido5-v1';
const ASSETS = [
  './',
  'play.html',
  'index.html',
  'manifest.webmanifest',
  'css/game.css',
  'css/landing.css',
  'js/main.js',
  'js/game.js',
  'js/data.js',
  'js/chunks.js',
  'js/world.js',
  'js/player.js',
  'js/fido5.js',
  'js/combat.js',
  'js/loot.js',
  'js/entities.js',
  'js/render.js',
  'js/sprites.js',
  'js/progression.js',
  'js/save.js',
  'js/audio.js',
  'js/input.js',
  'js/ui.js',
  '../assets/css/styles.css',
  '../assets/js/main.js',
  '../images/favicon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll fails the whole install if one entry 404s, so add individually.
      .then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // Refresh in the background so a new release is picked up next visit.
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('play.html'));
    })
  );
});
