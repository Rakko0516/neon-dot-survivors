// PWA：Service Worker登録・アップデート検知・更新履歴の取得
import { APP_VERSION } from './version.js';

export const pwa = { reg: null, waiting: null, changelog: [], installPrompt: null };
let onUpdate = null;

export function compareVersion(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

export async function fetchChangelog() {
  try {
    const res = await fetch('./changelog.json?t=' + Date.now(), { cache: 'no-store' });
    const json = await res.json();
    pwa.changelog = Array.isArray(json.entries) ? json.entries : [];
  } catch {
    // オフライン時はService Workerのキャッシュから
    try {
      const res = await fetch('./changelog.json');
      const json = await res.json();
      pwa.changelog = json.entries || [];
    } catch {}
  }
  return pwa.changelog;
}

/** @param {(info:{worker, entries})=>void} handler 新バージョン準備完了時に呼ばれる */
export async function initPWA(handler) {
  onUpdate = handler;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pwa.installPrompt = e;
  });
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    pwa.reg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) notifyWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) notifyWaiting(nw);
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    // 定期的に更新チェック（30分ごと + アプリに戻ってきた時）
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch (e) {
    console.warn('SW register failed', e);
  }
}

async function notifyWaiting(worker) {
  pwa.waiting = worker;
  const all = await fetchChangelog();
  let entries = all.filter((e) => e.version && compareVersion(e.version, APP_VERSION) > 0);
  // 番号が戻った更新（履歴の整理など）でも、最新のお知らせは見せる
  if (!entries.length && all[0] && all[0].version !== APP_VERSION) entries = [all[0]];
  // 裏に回っている時は端末通知も出す
  if (document.visibilityState === 'hidden' && pwa.reg && 'Notification' in window && Notification.permission === 'granted') {
    pwa.reg.showNotification('アップデートがあります', {
      body: entries[0] ? `v${entries[0].version} ${entries[0].title || ''}` : 'タップして最新版に更新',
      icon: './icons/icon-192.png',
      badge: './icons/badge-96.png',
      tag: 'update',
    }).catch(() => {});
  }
  onUpdate && onUpdate({ worker, entries });
}

/** オフライン用に保存してもらうBGMを指定（遊べるステージの分だけ。通信量の節約）。起動後に main.js から呼ぶ */
export function warmAudio(bgmKeys) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((r) => r.active && r.active.postMessage({ type: 'WARM_AUDIO', bgm: bgmKeys })).catch(() => {});
}

export function applyUpdate() {
  if (pwa.waiting) pwa.waiting.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
