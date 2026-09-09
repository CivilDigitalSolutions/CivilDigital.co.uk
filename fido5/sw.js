/* ==========================================================================
   FiDo-5 — Offline worker.
   Scoped to /fido5/ so it can never serve or cache anything else on the site.

   Code and data are network-first: a release must never wait for a second
   visit to appear, and a stale script is indistinguishable from a reverted
   one. The cache is the offline fallback, not the first choice.

   Bulk assets — audio, images — are cache-first, because that is where
   cache-first actually pays and their content is fixed for a given release.
   Bump VERSION on release and every old cache is dropped.
   ========================================================================== */

const VERSION = 'fido5-v9';

/* Fetched fresh whenever the network allows. Anything the game's behaviour
   depends on belongs here, including the voice manifest: it decides whether
   FiDo-5 speaks, so serving yesterday's copy silences him. */
const LIVE = /\.(?:html|js|css|json|webmanifest)$|\/$/;

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
  'js/boss.js',
  'js/loot.js',
  'js/entities.js',
  'js/render.js',
  'js/sprites.js',
  'js/progression.js',
  'js/save.js',
  'js/audio.js',
  'js/input.js',
  'js/ui.js',
  'js/voice.js',
  'audio/vo/manifest.json',
  '../assets/css/styles.css',
  '../assets/js/main.js',
  '../images/favicon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll fails the whole install if one entry 404s, so add individually.
      // reload skips the HTTP cache, so a fresh install cannot seed itself
      // with the very files it is meant to replace.
      .then((c) => Promise.all(
        ASSETS.map((a) => c.add(new Request(a, { cache: 'reload' })).catch(() => null))
      ))
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

  const live = req.mode === 'navigate' || LIVE.test(url.pathname);

  e.respondWith(
    live
      /* Network-first: the newest release wins, the cache covers being offline. */
      ? fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => caches.match(req).then((hit) => hit || caches.match('play.html')))

      /* Cache-first for audio and images, refreshed quietly for next time. */
      : caches.match(req).then((hit) => {
          if (hit) {
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
