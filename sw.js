// Service Worker：オフライン対応・アップデート配信・プッシュ通知
// VERSION を変えると全プレイヤーに「アップデートがあります」が表示されます（tools/bump-version.mjs が自動で変更）
const VERSION = '0.4.3';
const CACHE = 'nds-' + VERSION;
const RUNTIME = 'nds-runtime';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/game.js',
  './js/data.js',
  './js/art.js',
  './js/stage.js',
  './js/audio.js',
  './js/save.js',
  './js/cloud.js',
  './js/pwa.js',
  './js/ui.js',
  './js/meta.js',
  './js/profile.js',
  './js/gachafx.js',
  './js/config.js',
  './js/version.js',
  './manifest.webmanifest',
  './changelog.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/badge-96.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('nds-') && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 同じサイト内のファイル
  if (url.origin === self.location.origin) {
    // 更新履歴は常に最新を取りに行く（オフライン時はキャッシュ）
    if (url.pathname.endsWith('/changelog.json') || url.pathname.endsWith('/gifts.json')) {
      e.respondWith(fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(url.pathname.endsWith('/gifts.json') ? './gifts.json' : './changelog.json', copy));
        return res;
      }).catch(() => caches.match(url.pathname.endsWith('/gifts.json') ? './gifts.json' : './changelog.json')));
      return;
    }
    if (url.pathname.endsWith('/sw.js')) return;
    e.respondWith(
      caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && !url.pathname.endsWith('.html')) {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  // フォントとFirebase SDKはキャッシュしてオフラインでも動くように
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

// ===== プッシュ通知（Firebase Cloud Messaging のデータメッセージ） =====
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { data: { body: e.data && e.data.text() } }; }
  const d = p.data || p.notification || p;
  const title = d.title || 'ネオンドット・サバイバーズ';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '新しいお知らせがあります',
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    tag: d.tag || 'news',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); return; }
    }
    await self.clients.openWindow(target);
  })());
});
