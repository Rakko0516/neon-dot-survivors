// Service Worker：オフライン対応・アップデート配信・プッシュ通知
// VERSION を変えると全プレイヤーに「アップデートがあります」が表示されます（tools/bump-version.mjs が自動で変更）
const VERSION = '0.5.3';
// 更新履歴を作り直してバージョン番号を戻したため、古いキャッシュと名前がかぶらないよう r4 を付ける
// BUILD：更新履歴に載せない小さな修正を配信するときに上げる（バージョン番号はそのまま）
const BUILD = 6;
const CACHE = 'nds-r4-' + VERSION + '-b' + BUILD;
const RUNTIME = 'nds-runtime';
// 音のファイル（バージョンをまたいで残す。中身の指紋 ?v= ごとに保存）
const AUDIO = 'nds-audio';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './changelog.json',
  './css/style.css',
  './js/art.js',
  './js/audio.js',
  './js/cloud.js',
  './js/config.js',
  './js/data.js',
  './js/enemies.js',
  './js/gachafx.js',
  './js/game.js',
  './js/helpart.js',
  './js/main.js',
  './js/meta.js',
  './js/profile.js',
  './js/pwa.js',
  './js/save.js',
  './js/stage.js',
  './js/ui.js',
  './js/version.js',
  './icons/apple-touch-icon.png',
  './icons/badge-96.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './img/title-blur.jpg',
  './img/title.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('nds-') && k !== CACHE && k !== RUNTIME && k !== AUDIO).map((k) => caches.delete(k)));
    // 以前の方式で保存した音（指紋なし）は消す
    const rt = await caches.open(RUNTIME);
    for (const r of await rt.keys()) if (new URL(r.url).pathname.includes('/audio/')) await rt.delete(r);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  // オフラインでも全ステージの音が鳴るよう、まだ保存していない音を裏でダウンロード
  if (e.data && e.data.type === 'WARM_AUDIO') e.waitUntil(warmAudio(Array.isArray(e.data.bgm) ? e.data.bgm : null, e.data.se !== false));
});

let warming = null;
/** bgm：保存しておくBGMの名前（無ければ全部）。効果音はいつも全部 */
function warmAudio(bgmKeys, withSe = true) {
  if (warming) return warming.then(() => warmAudio(bgmKeys, withSe));
  warming = (async () => {
    const res = await fetch('./audio/sources.json', { cache: 'no-store' });
    if (!res.ok) return;
    const src = await res.json();
    const all = new Set(), want = [];
    for (const kind of ['bgm', 'se']) {
      for (const [name, s] of Object.entries(src[kind] || {})) {
        const url = new URL(`./audio/${kind}/${name}.bin?v=${s.v || '0'}`, self.location).href;
        all.add(url);
        if (kind === 'se' ? withSe : !bgmKeys || bgmKeys.includes(name)) want.push(url);
      }
    }
    const c = await caches.open(AUDIO);
    // もう使わない古い音（差し替え前のもの）を消す
    for (const r of await c.keys()) if (!all.has(r.url)) await c.delete(r);
    // 足りない音を1つずつ取ってくる（通信を占有しないように順番に）
    for (const url of want) {
      if (await c.match(url)) continue;
      try { const r = await fetch(url); if (r.ok) await c.put(url, r); } catch { return; }
    }
  })().catch(() => {}).finally(() => { warming = null; });
  return warming;
}

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
    // 音の対応表：最新を取りに行き、オフラインなら保存したもの
    if (url.pathname.endsWith('/audio/sources.json')) {
      e.respondWith(fetch(req, { cache: 'no-store' }).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put('./audio/sources.json', copy)); }
        return res;
      }).catch(() => caches.open(RUNTIME).then((c) => c.match('./audio/sources.json'))));
      return;
    }
    // 音のファイル：保存済みならそれを使う（指紋つきなので古い音が鳴ることはない）
    if (url.pathname.includes('/audio/') && url.pathname.endsWith('.bin')) {
      e.respondWith(caches.open(AUDIO).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && url.searchParams.has('v') && req.headers.get('X-NDS-Keep') !== '0') c.put(req, res.clone());
        return res;
      }));
      return;
    }
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
  const title = d.title || 'ドットラッシュ！';
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
