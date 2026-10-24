// エントリーポイント：画面・育成・戦闘の流れをつなぐ
import { charSprite, enemySprite, icon, toURL, frameURL, bandURL, patternURL, floorTile, rockTile, spikeTile, wallDeco, T } from './art.js';
import * as D from './data.js';
import {
  store, load, commit, onChange, exportFile, parseImportText, replaceSave, summary,
  formatPlayTime, formatDate, addPlayTime, hasPrevBackup, restorePrev, resetAll,
} from './save.js';
import {
  cloud, initCloud, onCloud, signIn, signOut, upload, restoreFromCloud, setSyncHandlers,
  enablePush, disablePush, pushSupported, autoBackup, setSyncGate,
} from './cloud.js';
import { pwa, initPWA, applyUpdate, fetchChangelog, isStandalone, isIOS, warmAudio } from './pwa.js';
import { APP_VERSION } from './version.js';
import { initAudio, preloadAudio, sfx, setVolume, playBgm, stopBgm, bgmForBiome, setAudioKeep } from './audio.js';
import { modal, toast, confirmBox, esc, closeAllModals } from './ui.js';
import { Game, ATK_ANIM, animStep } from './game.js';
import * as M from './meta.js';
import * as PF from './profile.js';
import { playGacha } from './gachafx.js';
import * as EN from './enemies.js';
import { diagramURL, enemyURL } from './helpart.js';
import { previewLayout } from './stage.js';
import { MOVED_TO, MOVE_FROM } from './config.js';
import { packForMove, unpackMove } from './save.js';

// 他のサイトの中に埋め込まれて操作を盗まれないようにする（クリックジャッキング対策の二重化）
if (window.top !== window.self) {
  try { window.top.location = window.self.location; } catch { document.documentElement.innerHTML = ''; throw new Error('framed'); }
}

const $ = (s, r = document) => r.querySelector(s);

// ===== 画面サイズに合わせた自動調整 =====
// スマホは等倍、タブレット・PCなど大きい画面では、スマホと同じ見た目のまま全体を拡大する
// PC・iPad横向きなど横に広い画面は「横画面レイアウト」（.wide）に切り替える
const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
function fitScreen() {
  const vv = window.visualViewport;
  const w = vv ? vv.width : innerWidth, h = vv ? vv.height : innerHeight;
  const wide = !isPhone() && w >= 960 && w / h >= 1.2;
  // 横画面は「幅1000・高さ620」を基準に、画面いっぱいまで拡大
  const z = wide ? Math.max(1, Math.min(1.7, w / 1000, h / 620)) : Math.max(1, Math.min(1.6, Math.min(w / 440, h / 860)));
  const root = document.documentElement;
  root.classList.toggle('wide', wide);
  root.style.setProperty('--z', z.toFixed(3));
  root.style.setProperty('--app-h', h + 'px');
  applyPortraitLock(w, h);
}

/**
 * スマホを横向きにしても、画面は縦向きのまま表示する（iPhoneは向きを固定できないので、画面を逆に回して打ち消す）
 * rot：0 = そのまま / -90 = 左に倒した（端末の上が左）/ 90 = 右に倒した
 */
const appRot = { rot: 0, w: 0, h: 0 };
function applyPortraitLock(w, h) {
  const app = document.getElementById('app');
  const root = document.documentElement;
  let rot = 0;
  // 本当に端末を横にしたときだけ回す。キーボードが出て画面の高さが縮んだだけ（横長に見える）のときは回さない
  const t = screen.orientation?.type;
  const deviceLandscape = t ? t.startsWith('landscape') : typeof window.orientation === 'number' ? Math.abs(window.orientation) === 90 : true;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
  if (isPhone() && w > h && deviceLandscape && !(typing && !appRot.rot)) {
    const angle = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 90);
    rot = (angle === 270 || angle === -90) ? 90 : -90;
  }
  appRot.rot = rot; appRot.w = w; appRot.h = h;
  root.classList.toggle('sideways', rot !== 0);
  if (!rot) {
    app.style.cssText = '';
    root.style.removeProperty('--safe-t'); root.style.removeProperty('--safe-b');
    return;
  }
  // 中身は「縦長」：幅＝画面の高さ、高さ＝画面の幅
  app.style.cssText = `position:fixed;left:0;top:0;width:${h}px;height:${w}px;transform-origin:0 0;`
    + (rot === -90 ? `transform:translateY(${h}px) rotate(-90deg);` : `transform:translateX(${w}px) rotate(90deg);`);
  root.style.setProperty('--app-h', w + 'px');
  // ノッチ側が中身の「上」になるので、安全領域の値を入れ替える
  const probe = document.getElementById('safe-probe');
  if (probe) {
    const cs = getComputedStyle(probe);
    const L = cs.paddingLeft, R = cs.paddingRight;
    root.style.setProperty('--safe-t', rot === -90 ? L : R);
    root.style.setProperty('--safe-b', rot === -90 ? R : L);
  }
  const z = Math.max(1, Math.min(1.6, Math.min(h / 440, w / 860)));
  root.style.setProperty('--z', z.toFixed(3));
}
/** 画面上の座標（指の位置）→ 中身の座標 */
function toApp(x, y) {
  if (appRot.rot === -90) return [appRot.h - y, x];
  if (appRot.rot === 90) return [y, appRot.w - x];
  return [x, y];
}
// Android のホーム画面アプリでは縦向きに固定（iPhoneは仕組み上できないので案内で対応）
try { screen.orientation?.lock?.('portrait').catch(() => {}); } catch {}
fitScreen();
// iPhoneは回転した直後に古い大きさを返すことがあるので、少し時間をおいてもう一度合わせる
const refit = () => { fitScreen(); for (const t of [120, 350, 800]) setTimeout(fitScreen, t); };
addEventListener('resize', refit);
addEventListener('orientationchange', refit);
screen.orientation?.addEventListener?.('change', refit);
if (window.visualViewport) visualViewport.addEventListener('resize', fitScreen);
const data = () => store.save.data;

let tab = 'home';
let partyTab = 'equip';
let viewChar = null;     // キャラ画面で見ているキャラ
let invFilter = 'all';
let gachaType = 'char';
let charBanner = 'p1'; // キャラガチャの種類（ピックアップ1・2・通常）
let inBattle = false;
let game = null;
let pendingUpdate = null;
const newItems = new Set();

const TIPS = [
  'レベルアップすると3つのスキルがスロットで出てきます。好きなものを1つ選ぼう',
  '部屋の敵を一定数倒すと上のゲートが開きます。5部屋目にはボスが待っています',
  'トゲの上はダメージ、毒や溶岩の水場もダメージ。水や氷の上は足が遅くなります',
  '虹色の枠は特殊スキル。スーパーモードは10秒間無敵になります',
  '装備は全身8か所。指輪は2つまで付けられます',
  'キャラごとに固有武器と固有能力があります。ステージに合わせて選ぼう',
  '設定からセーブデータをファイルに書き出せます。機種変更のときに使おう',
];

// ===================== 起動 =====================
async function boot() {
  applyTheme();
  const tapped = waitTitle();
  load();
  const d = data();
  setVolume({ bgm: d.settings.bgmVol, se: d.settings.seVol });
  setAudioKeep(d.settings.offlineAuto);
  preloadAudio();
  hydrate(document);
  render();
  bindGlobal();

  onChange(() => {
    // クラウドのセーブを読み込んで連携済みの印が消えても、ログイン中なら付け直す
    if (cloud.user && !data().stats.googleLinked) { data().stats.googleLinked = 1; commit(); return; }
    updateWallet(); if (!inBattle) render();
  });
  onCloud(() => {
    updateCloudDot();
    // 常時ミッション「Google連携をしよう」：一度でもログインしたら達成
    if (cloud.user && !data().stats.googleLinked) { data().stats.googleLinked = 1; commit(); }
    if (tab === 'settings' && !inBattle) render();
  });
  setSyncHandlers({ onConflict: askConflict, onApplyRemote: (save) => { replaceSave(save, true); toast('クラウドのセーブを読み込みました'); } });
  setSyncGate(() => !inBattle && !titleOpen && !document.querySelector('.overlay'));
  setInterval(() => { if (document.visibilityState === 'visible') addPlayTime(15); }, 15000);
  window.addEventListener('offline', () => toast('オフラインになりました。このまま遊べます（データはこの端末に保存されます）'));
  window.addEventListener('online', () => toast('オンラインに戻りました'));

  initPWA(onUpdateReady);
  setTimeout(warmPlayable, 9000);
  initCloud();
  await Promise.all([fetchChangelog().catch(() => {}), tapped]);
  render();
  await afterBoot();
}

/** オフラインでも鳴るよう、いま遊べるステージ（クリア済み＋次）のBGMとボス曲を端末に保存してもらう */
function warmPlayable() {
  const st = data().settings;
  setAudioKeep(st.offlineAuto);
  if (!st.offlineAuto) return;
  const skip = new Set(st.offlineSkip);
  const keys = skip.has('base') ? [] : [...BASE_BGM];
  D.BIOMES.forEach((b, i) => { if (D.worldOpen(data(), i + 1) && !skip.has('st:' + b.id)) keys.push(...stageBgm(b)); });
  warmAudio(keys, !skip.has('base'));
}
const BASE_BGM = ['title', 'home', 'menu', 'gacha', 'boss', 'clear', 'gameover'];
const stageBgm = (b) => [bgmForBiome(b.id), 'boss_' + b.boss, ...(b.bgm ? [b.bgm] : [])];

// ===================== オフライン用の保存（設定） =====================
const AUDIO_CACHE = 'nds-audio';
async function offlineGroups() {
  const src = await (await fetch('./audio/sources.json')).json();
  const url = (kind, k) => new URL(`./audio/${kind}/${k}.bin?v=${src[kind][k].v || '0'}`, location.href).href;
  const item = (kind, k) => (src[kind]?.[k] ? [{ url: url(kind, k), size: src[kind][k].size || 0 }] : []);
  const groups = [{ id: 'base', label: '基本（メニューの曲・効果音）', items: [...BASE_BGM.flatMap((k) => item('bgm', k)), ...Object.keys(src.se).flatMap((k) => item('se', k))] }];
  D.BIOMES.forEach((b, i) => groups.push({ id: 'st:' + b.id, label: `STAGE ${i + 1}　${b.name}`, sub: 'ステージ曲＋ボス曲', items: [...new Set(stageBgm(b))].flatMap((k) => item('bgm', k)) }));
  return groups;
}
const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
async function offlineModal() {
  if (!('caches' in window)) { toast('この端末ではオフライン用の保存が使えません'); return; }
  const st = data().settings;
  const groups = await offlineGroups();
  const cache = await caches.open(AUDIO_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  let used = 0;
  const rows = groups.map((g) => {
    const total = g.items.reduce((a, x) => a + x.size, 0);
    const got = g.items.filter((x) => have.has(x.url));
    used += got.reduce((a, x) => a + x.size, 0);
    const state = !g.items.length ? 'none' : got.length === g.items.length ? 'all' : got.length ? 'part' : 'none';
    return `<div class="off-row">
      <div class="off-l"><b>${g.label}</b><small>${g.sub ? g.sub + '・' : ''}${mb(total)}</small></div>
      <span class="off-st ${state}">${state === 'all' ? '保存済み' : state === 'part' ? '一部' : '未保存'}</span>
      ${state === 'all' ? `<button class="btn small dark" data-off-del="${g.id}">削除</button>` : `<button class="btn small teal" data-off-save="${g.id}">保存</button>`}
    </div>`;
  }).join('');
  const v = await modal({
    title: 'オフライン用の保存',
    body: `<p class="muted" style="margin-top:0">BGMや効果音を端末に保存しておくと、通信がなくても音が鳴ります。容量が気になるときは削除できます（削除しても、遊ぶときに通信があれば普通に鳴ります）。</p>
      <div class="set-row"><div class="lbl">遊べるステージの曲を自動で保存<small>オフにすると、自分で「保存」したものだけ残します</small></div><button class="toggle ${st.offlineAuto ? 'on' : ''}" data-off-auto aria-label="自動で保存"></button></div>
      <div class="off-sum">保存している容量：<b>${mb(used)}</b></div>
      <div class="off-all"><button class="btn small teal" data-off-save="*">すべて保存</button><button class="btn small dark" data-off-del="*">すべて削除</button></div>
      <div class="off-list">${rows}</div>`,
    buttons: [{ label: '閉じる', value: null }],
    onMount: (ov, close) => {
      ov.querySelector('[data-off-auto]').addEventListener('click', () => close('auto'));
      ov.querySelectorAll('[data-off-save]').forEach((b) => b.addEventListener('click', () => close('save:' + b.dataset.offSave)));
      ov.querySelectorAll('[data-off-del]').forEach((b) => b.addEventListener('click', () => close('del:' + b.dataset.offDel)));
    },
  });
  if (!v) return;
  if (v === 'auto') {
    st.offlineAuto = !st.offlineAuto;
    commit();
    setAudioKeep(st.offlineAuto);
    if (st.offlineAuto) warmPlayable();
    toast(st.offlineAuto ? '遊べるステージの曲を自動で保存します' : '自動で保存しないようにしました');
    return offlineModal();
  }
  const [op, id] = v.split(':').length > 2 ? [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)] : v.split(':');
  const targets = id === '*' ? groups : groups.filter((g) => g.id === id);
  const skip = new Set(st.offlineSkip);
  if (op === 'save') {
    if (!navigator.onLine) { toast('保存するには通信が必要です'); return offlineModal(); }
    const list = targets.flatMap((g) => g.items).filter((x) => !have.has(x.url));
    toast(`保存しています…（${mb(list.reduce((a, x) => a + x.size, 0))}）`);
    let ok = 0;
    for (const x of list) {
      try { const r = await fetch(x.url); if (r.ok) { await cache.put(x.url, r); ok++; } } catch {}
    }
    for (const g of targets) skip.delete(g.id);
    toast(ok === list.length ? '保存しました' : `${list.length - ok}個の保存に失敗しました（通信を確認してください）`);
  } else {
    if (id === '*' && !(await confirmBox('すべて削除', '保存しているBGMと効果音をすべて削除しますか？（ゲームのデータは消えません）', '削除する', 'red'))) return offlineModal();
    for (const x of targets.flatMap((g) => g.items)) await cache.delete(x.url);
    for (const g of targets) skip.add(g.id);
    toast('削除しました');
  }
  st.offlineSkip = [...skip];
  commit();
  return offlineModal();
}

// ===================== タイトル画面 =====================
let titleOpen = true;
/**
 * タイトル画面（ムービー）。画面のどこかをタップするまで待つ（このタップで音も使えるようになる）
 * ・黒い画面から始まり、ムービーの準備ができたらクロスディゾルブで表示
 * ・初回はイントロから、2回目以降（同じタブで開き直したとき）はループから
 * ・イントロ中のタップはイントロを飛ばしてロゴの画面へ（ここで音が出せるようになりタイトル曲が流れる）
 * ・「TAP TO START」が出ていればタップでゲーム開始（ムービーを destroy してから）
 */
function waitTitle() {
  const el = $('#title');
  $('#title-ver').textContent = 'v' + APP_VERSION;
  playBgm('title');
  let seen = false;
  try { seen = sessionStorage.getItem('titleSeen') === '1'; } catch {}
  const TR = window.DotRushTitle;
  const cv = $('#titleCanvas'), blur = $('#title-blur');
  let movie = null;
  const show = () => el.classList.add('shown');
  try {
    if (TR) {
      movie = TR.create(cv, { skipIntro: seen });
      movie.ready.then(() => { try { sessionStorage.setItem('titleSeen', '1'); } catch {} show(); }).catch(show);
    }
  } catch { movie = null; }
  if (!movie) { el.classList.add('no-movie'); show(); }
  setTimeout(show, 4000); // 念のため（フォントが読めなくても4秒で表示）
  // 画面の両脇：ムービーをぼかして敷く（小さく写すだけなので軽い）
  const bg = blur.getContext('2d');
  const tapReady = () => !movie || movie.phase === 'loop' || movie.time >= TR.LOGO_T + 2.8;
  const tick = setInterval(() => {
    try { bg.drawImage(cv, 0, 0, blur.width, blur.height); } catch {}
    el.classList.toggle('tap-ready', tapReady());
  }, 120);
  // タップしたところに丸いエフェクト
  const ripple = (x, y) => {
    const box = $('#title-ripples');
    const r = document.createElement('i');
    r.className = 'tr';
    r.style.left = x + 'px'; r.style.top = y + 'px';
    r.innerHTML = '<b></b><b></b><b></b>' + Array.from({ length: 8 }, (_, i) => `<s style="--a:${i * 45}deg"></s>`).join('');
    box.appendChild(r);
    setTimeout(() => r.remove(), 900);
  };
  return new Promise((resolve) => {
    let done = false;
    const go = (e) => {
      if (done) return;
      if (e.type === 'keydown' && !['Enter', ' ', 'Space'].includes(e.key)) return;
      e.preventDefault();
      const x = e.clientX || innerWidth / 2, y = e.clientY || innerHeight / 2;
      ripple(x, y);
      initAudio();
      if (!el.classList.contains('shown')) return;
      // イントロの途中：イントロを飛ばしてロゴの画面へ（タイトル曲もここから流れる）
      if (movie && !tapReady()) {
        sfx('click');
        movie.restart(true);
        el.classList.remove('skip'); void el.offsetWidth; el.classList.add('skip');
        return;
      }
      done = true;
      sfx('unlock');
      el.classList.add('go');
      setTimeout(() => {
        clearInterval(tick);
        try { movie?.destroy(); } catch {}
        el.classList.add('out'); titleOpen = false; resolve();
      }, 380);
      setTimeout(() => { el.classList.add('hidden'); }, 850);
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', go);
    el.focus({ preventScroll: true });
  });
}

/** URLの引っ越し：旧URLでは案内を出し、新URLでは持ってきたセーブを読み込む */
async function handleMove() {
  // 新URL側：#move=... で届いたセーブを読み込む
  const m = location.hash.match(/^#move=([A-Za-z0-9_-]{1,400000})$/);
  if (location.hash.startsWith('#move=')) history.replaceState(null, '', location.pathname + location.search);
  if (m) {
    // 悪意のあるリンクでセーブを書き換えられないよう、旧URLから移動してきたときだけ受け付ける
    if (!MOVE_FROM.some((o) => document.referrer.startsWith(o))) {
      toast('このリンクからはデータを読み込めません');
      return false;
    }
    try {
      const r = await unpackMove(m[1]);
      if (!r.ok) throw new Error(r.error);
      if (await confirmCompare('引っ越しデータを読み込みますか？', r.save, '旧URLから持ってきたデータで、この端末のデータを上書きします。')) {
        replaceSave(r.save, false);
        toast('セーブデータを引き継ぎました！');
        autoBackup(true);
      }
    } catch (e) {
      toast('引っ越しデータを読み込めませんでした。設定のファイル読み込みをお試しください');
    }
    return false;
  }
  // 旧URL側：新しいURLへ案内
  if (!MOVED_TO) return false;
  const target = new URL(MOVED_TO);
  // 新URL本体と、そのプレビュー用URL（xxx.dot-rush.pages.dev）、手元での確認では案内しない
  if (location.origin === target.origin || location.hostname.endsWith('.' + target.hostname) || ['localhost', '127.0.0.1'].includes(location.hostname)) return false;
  const v = await modal({
    title: 'ゲームのURLが変わりました',
    sound: 'panel',
    dismiss: false,
    body: `<p style="margin-top:0">新しいURLに引っ越しました。<br><b>${esc(target.host)}</b></p>
      <p>下のボタンを押すと、<b>今のセーブデータを持ったまま</b>新しいURLで開きます。</p>
      <p class="muted">ホーム画面に追加している人は、新しいURLで開いたあと、もう一度「ホーム画面に追加」してください（古いアイコンは削除してOKです）。</p>`,
    buttons: [{ label: 'データを持って移動', value: 'go', cls: 'red' }],
  });
  if (v === 'go') {
    const packed = await packForMove();
    location.href = target.origin + target.pathname + '#move=' + packed;
  }
  return true;
}

let lastGrantCheck = Date.now();
/**
 * ホーム画面に追加したアプリで初めて開いたとき：お知らせ通知を受け取るか聞く（1回だけ）
 * すでに許可済みなら、受け取り先（トークン）を静かに更新する
 */
async function askPushOnce() {
  const d = data();
  if (!pushSupported() || !cloud.enabled) return;
  if (Notification.permission === 'granted') {
    if (d.settings.notify) enablePush(pwa.reg, d.playerId, true).catch(() => {});
    return;
  }
  if (!isStandalone() || d.settings.notifyAsked || Notification.permission !== 'default') return;
  d.settings.notifyAsked = true; commit();
  await modal({
    title: 'お知らせ通知',
    sound: 'panel2',
    body: `<div class="push-ask"><img class="px" data-icon="megaphone" data-color="#ff7a3a" alt="">
      <p>アップデートやイベント、プレゼントのお知らせを通知で受け取りますか？</p>
      <p class="muted">あとから設定画面でオン・オフできます</p></div>`,
    buttons: [{ label: 'あとで', value: null }, { label: '受け取る', value: 'yes', cls: 'teal' }],
    onMount: (ov) => {
      hydrate(ov);
      // iPhone はタップした瞬間に許可を求める必要があるので、ボタンのクリックで直接呼ぶ
      ov.querySelector('.mbtns [data-i="1"]').addEventListener('click', () => {
        enablePush(pwa.reg, d.playerId).then(() => { d.settings.notify = true; commit(); toast('通知をオンにしました'); render(); })
          .catch((e) => toast(e.message));
      }, true);
    },
  });
}
/** 起動後：ログインボーナス → 運営プレゼント → お知らせ */
async function afterBoot() {
  if (await handleMove()) return;
  const forgot = M.checkMissionReset();
  const idx = M.checkLoginBonus();
  await M.syncGifts();
  const granted = await M.syncGrants().catch(() => 0);
  if (granted) toast(`運営からのプレゼントが ${granted}件 届きました`);
  render();
  if (forgot) toast(`受け取り忘れのミッション報酬（${forgot}件）をプレゼントボックスに送りました`);
  if (idx !== null) await loginModal(idx);
  if (pendingUpdate) await showUpdatePopup();
  await askPushOnce();
  showNewsIfUnread();
  // 0時をまたいで開きっぱなしでも受け取れるように
  const recheck = async () => {
    if (inBattle || document.querySelector('.overlay')) return;
    const forgot = M.checkMissionReset();
    if (forgot) { render(); toast(`受け取り忘れのミッション報酬（${forgot}件）をプレゼントボックスに送りました`); }
    if (Date.now() - lastGrantCheck > 5 * 60 * 1000) {
      lastGrantCheck = Date.now();
      const n = await M.syncGrants().catch(() => 0);
      if (n) { render(); toast(`運営からのプレゼントが ${n}件 届きました`); }
    }
    const i = M.checkLoginBonus();
    if (i !== null) { render(); await loginModal(i); }
  };
  setInterval(recheck, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recheck(); });
}

/** 枠や模様の画像を生成してCSS変数に入れる */
function applyTheme() {
  const r = document.documentElement.style;
  r.setProperty('--f-panel', `url(${frameURL('panel')})`);
  r.setProperty('--f-paper', `url(${frameURL('paper')})`);
  r.setProperty('--f-gold', `url(${frameURL('gold')})`);
  r.setProperty('--f-dark', `url(${frameURL('dark')})`);
  r.setProperty('--band', `url(${bandURL()})`);
  r.setProperty('--pattern', `url(${patternURL('#3aa79c', '#4ab8ac')})`);
}

// ===================== ドット絵の流し込み =====================
const portraitCache = new Map();
function portraitURL(id) {
  if (portraitCache.has(id)) return portraitCache.get(id);
  const s = charSprite(D.CHARACTERS[id], 'idle');
  const c = document.createElement('canvas');
  c.width = s.width; c.height = 18;
  c.getContext('2d').drawImage(s, 0, 0);
  const url = toURL(c, 6);
  portraitCache.set(id, url);
  return url;
}
function hydrate(root) {
  root.querySelectorAll('img[data-icon]').forEach((img) => {
    img.src = toURL(icon(img.dataset.icon, img.dataset.color || '#ffd23a', img.dataset.color2), 5, `i:${img.dataset.icon}${img.dataset.color}${img.dataset.color2 || ''}`);
  });
  root.querySelectorAll('img[data-char]').forEach((img) => {
    const def = D.CHARACTERS[img.dataset.char];
    img.src = toURL(charSprite(def, img.dataset.frame || 'idle'), 6, `c:${def.id}${img.dataset.frame || ''}`);
  });
  root.querySelectorAll('img[data-portrait]').forEach((img) => { img.src = portraitURL(img.dataset.portrait); });
  root.querySelectorAll('img[data-char][data-anim]').forEach((img) => animChars.add(img));
  if (animChars.size && !animTimer) animTimer = setInterval(stepCharAnim, 80);
}

// ===== メニューのキャラ：待機アニメーション（呼吸・まばたき）と、ときどき／タップで攻撃のポーズ =====
const animChars = new Set();
let animTimer = 0;
function stepCharAnim() {
  const t = performance.now() / 1000;
  for (const img of animChars) {
    if (!img.isConnected) { animChars.delete(img); continue; }
    const def = D.CHARACTERS[img.dataset.char];
    if (!def) continue;
    let pose = '';
    // タップした時だけ、そのキャラの攻撃のポーズ（ゆっくりめに再生）。ふだんは自然に立っている
    const anim = ATK_ANIM[def.weapon];
    const st = anim && img.dataset.atk ? animStep(anim, (t - +img.dataset.atk) / 1.6) : null;
    if (st) pose = st.pose;
    else {
      if (t % 1.6 >= 0.8) pose = 'b';
      const bt = (t + 0.4) % 3.6;
      if (bt < 0.12 || (bt > 0.3 && bt < 0.4 && Math.floor(t / 3.6) % 3 === 0)) pose += 'k';
    }
    if (img.dataset.pose === pose) continue;
    img.dataset.pose = pose;
    img.src = toURL(charSprite(def, 'idle', pose), 6, `c:${def.id}|${pose}`);
  }
  if (!animChars.size) { clearInterval(animTimer); animTimer = 0; }
}
document.addEventListener('pointerdown', (e) => {
  const img = e.target.closest?.('img[data-char][data-anim]');
  if (img) img.dataset.atk = performance.now() / 1000;
});

// ===== アイコン（プロフィール） =====
function iconURL(id) {
  const def = PF.iconDef(id);
  if (def.char) return portraitURL(def.char);
  return toURL(enemySprite(def.type, def.pal, { crown: def.crown }), 5, 'ic:' + def.id);
}
/** アイコン＋フレームのHTML */
function avatarHTML(iconId, frameId, size = 48) {
  const def = PF.iconDef(iconId);
  return `<span class="av fr-${frameId}" style="--s:${size}px;--cbg:${def.bg}"><img src="${iconURL(iconId)}" alt=""></span>`;
}

/** 数字をカウントアップさせる（UIアニメーション） */
const countState = new WeakMap();
/** 上の所持数：100万以上は「1.23M」のように短く（枠からはみ出さないように） */
const shortNum = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : n >= 1e7 ? 1 : 2)}M` : n.toLocaleString());
function countTo(el, to, fmt = (n) => n.toLocaleString()) {
  const from = countState.get(el) ?? to;
  countState.set(el, to);
  el.parentElement.title = el.parentElement.title.replace(/：.*$/, '') + '：' + to.toLocaleString();
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 600;
  el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump');
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1 && countState.get(el) === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateWallet() {
  const d = data();
  countTo($('#pill-gold'), d.gold, shortNum);
  countTo($('#pill-cticket'), d.ticketsChar, shortNum);
  countTo($('#pill-eticket'), d.ticketsEquip, shortNum);
  countTo($('#pill-diamond'), d.diamonds || 0, shortNum);
  $('#rank-num').textContent = d.rank.lv;
  $('#me-name').textContent = d.profile.name;
  $('#me-exp').style.width = Math.min(100, (d.rank.exp / PF.rankNeed(d.rank.lv)) * 100) + '%';
  const key = d.profile.icon + d.profile.frame;
  const av = $('#me-av');
  if (av.dataset.k !== key) { av.dataset.k = key; av.innerHTML = avatarHTML(d.profile.icon, d.profile.frame, 46); }
  const tc = $('.tab-char');
  if (tc && tc.dataset.char !== d.selectedChar) { tc.dataset.char = d.selectedChar; hydrate(tc.parentElement); }
}
function updateCloudDot() {
  const el = $('#cloud-dot');
  el.className = 'cloud-dot';
  if (cloud.user) el.classList.add(cloud.status === 'syncing' ? 'syncing' : cloud.status === 'error' ? 'error' : 'ok');
}

// 場面ごとのBGM（メニュー画面）
function menuBgm() {
  if (tab === 'gacha') return 'gacha';
  if (tab === 'party' || tab === 'settings') return 'menu';
  return 'home';
}

// ===================== タブ描画 =====================
const TABS = { home: homeHTML, party: partyHTML, gacha: gachaHTML, settings: settingsHTML };

const TAB_ORDER = ['home', 'party', 'gacha', 'settings'];
let lastTab = 'home';
function render() {
  const el = $('#tab-content');
  const changed = el.dataset.cur !== tab + partyTab;
  const keep = changed ? 0 : el.scrollTop;
  el.innerHTML = TABS[tab]();
  if (changed) {
    // Tabs：左右どちらから来たかでスライド方向を変える ＋ 一覧を段差表示
    const dir = TAB_ORDER.indexOf(tab) >= TAB_ORDER.indexOf(lastTab) ? 'r' : 'l';
    el.classList.remove('tab-in-r', 'tab-in-l'); void el.offsetWidth;
    if (lastTab !== tab) el.classList.add('tab-in-' + dir);
    lastTab = tab;
    el.querySelectorAll('.inv, .char-grid, .home-icons, .btn-grid, .slot-col, .stage-strip').forEach((g) => {
      g.classList.add('reveal');
      [...g.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 20)));
      setTimeout(() => g.classList.remove('reveal'), 1200);
    });
  }
  el.dataset.cur = tab + partyTab;
  el.classList.remove(...[...el.classList].filter((c) => c.startsWith('tab-') && !c.startsWith('tab-in') || c.startsWith('sub-')));
  el.classList.add('tab-' + tab, 'sub-' + partyTab);
  hydrate(el);
  if (tab === 'home') drawStagePreview();
  if (tab === 'gacha') setupCarousel();
  if (!inBattle && !titleOpen && !$('#loading:not(.hidden)')) playBgm(menuBgm(), 'home');
  el.scrollTop = keep;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#settings-badge').classList.toggle('hidden', !pendingUpdate);
  updateWallet();
  updateCloudDot();
}

/** 装備している部位（装備していなければ null）。装備は全キャラ共通 */
function equippedSlot(uid) {
  const eq = data().equip;
  for (const k of Object.keys(eq)) if (eq[k] === uid) return k;
  return null;
}
function hasUnreadNews() {
  const latest = pwa.changelog[0];
  return !!(latest && latest.id !== data().seenNews);
}
function starsHTML(n, max = 5) {
  return `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(max - n)}</span></span>`;
}

/** アイテムのタイル（レア度枠） */
function itemTile(it, opt = {}) {
  const base = D.EQUIP[it.base];
  const R = D.RARITIES[it.rarity];
  const owner = opt.noOwner ? null : equippedSlot(it.uid);
  return `<button class="itile ${it.rarity === 'SSR' ? 'ssr' : ''} ${newItems.has(it.uid) ? 'new' : ''}" style="--rc:${R.color};--rd:${R.dark}" data-act="${opt.act || 'item'}" data-uid="${it.uid}" ${opt.slot ? `data-slot="${opt.slot}"` : ''}>
    <img class="ic px" data-icon="${base.icon}" data-color="${base.color}" alt="">
    <span class="rar ol">${R.name}</span>
    <span class="lv ol">LV:${it.level}</span>
    ${it.plus ? `<span class="plus ol">${'★'.repeat(it.plus)}</span>` : ''}
    ${owner ? '<span class="eqd ol">E</span>' : ''}
  </button>`;
}

// ----- ホーム -----
/** Marquee：お知らせの最新タイトルとプレゼント情報を横に流す */
function tickerHTML() {
  const d = data();
  const msgs = [];
  const latest = pwa.changelog[0];
  if (latest) msgs.push(`${latest.version ? 'v' + latest.version + ' ' : ''}${latest.title || ''}`);
  if (d.presents.length) msgs.push(`プレゼントが ${d.presents.length} 件届いています`);
  const ready = M.claimableCount();
  if (ready) msgs.push(`受け取れるミッション報酬が ${ready} 件あります`);
  msgs.push(`ようこそ、${d.profile.name} さん！ ランク${d.rank.lv}`);
  const text = msgs.map(esc).join('　★　');
  return `<div class="ticker"><div class="track" style="--dur:${Math.max(12, text.length * 0.28)}s"><span>${text}</span></div></div>`;
}

function homeIcon(act, ic, color, label, badge) {
  return `<button class="hicon" data-act="${act}"><img class="px" data-icon="${ic}" data-color="${color}" alt=""><span class="ol">${label}</span>${badge ? `<i class="hbadge">${badge}</i>` : ''}</button>`;
}
/** 先のステージも見えるように、クリア済み+6（最低30）まで表示 */
const stageViewMax = () => D.STAGE_COUNT;
const isLocked = (n) => !D.stageOpen(data(), n);
/** ロック中のステージを開くには、どこをクリアすればいいか */
function unlockHint(n) {
  const { w, L } = D.stageInfo(n);
  if (L > 1) return `STAGE ${w}-${L - 1} をクリアで解放`;
  return `STAGE ${w - 1}-${D.LEVELS_PER_WORLD} をクリアで解放`;
}

/** ホームのステージ選択：◀▶はワールド移動、下の収納式ボタンで 〇-1〜〇-10 を選ぶ */
let lvDrawerOpen = false;   // 引き出しが開いているか（再描画しても保つ）
let lvDrawerAnim = '';      // 次の描画で流すアニメ（'in'：タイルを順番に出す）
let stageSlide = '';        // ワールド移動のときの見本スライド方向
function levelDrawerHTML(d, info) {
  const w = info.w, done = D.worldCleared(d, w), N = D.LEVELS_PER_WORLD;
  const pips = Array.from({ length: N }, (_, i) => {
    const L = i + 1, s = D.stageNo(w, L);
    return `<i class="${L === info.L ? 'cur' : ''} ${L <= done ? 'done' : D.stageOpen(d, s) ? 'open' : ''}"></i>`;
  }).join('');
  const tiles = Array.from({ length: N }, (_, i) => {
    const L = i + 1, s = D.stageNo(w, L);
    const st = L <= done ? 'clear' : D.stageOpen(d, s) ? 'open' : 'lock';
    return `<button class="lv-tile ${st} ${L === info.L ? 'sel' : ''} ${L === N ? 'final' : ''}" data-act="pick-level" data-n="${s}" style="--i:${i}" ${st === 'lock' ? 'aria-disabled="true"' : ''}>
      <b class="ol">${w}-${L}</b><small>${D.STRUCT_NAMES[i]}</small>
      ${st === 'clear' ? '<em class="ck">✓</em>' : ''}${st === 'lock' ? '<img class="px lk" data-icon="lock" data-color="#c8b890" alt="">' : ''}
    </button>`;
  }).join('');
  const cls = [lvDrawerOpen ? 'open' : '', lvDrawerAnim ? 'anim-' + lvDrawerAnim : ''].join(' ');
  lvDrawerAnim = '';
  return `<div class="lv-drawer ${cls}" style="--bc:${info.biome.floor[0]}">
    <button class="lv-handle" data-act="toggle-levels" aria-expanded="${lvDrawerOpen}">
      <span class="lv-cap ol">ワールド${w}</span>
      <span class="lv-pips">${pips}</span>
      <span class="lv-cnt">${done}/${N}</span>
      <span class="lv-chev">▼</span>
    </button>
    <div class="lv-body"><div class="lv-inner"><div class="lv-grid">${tiles}</div></div></div>
  </div>`;
}
/** ワールド w を開いたときに選ぶステージ（遊べる中で一番先。ロック中なら 〇-1） */
function worldEntry(d, w) {
  const L = Math.min(D.LEVELS_PER_WORLD, D.worldCleared(d, w) + 1);
  const s = D.stageNo(w, L);
  return D.stageOpen(d, s) ? s : D.stageNo(w, 1);
}
/** 引き出しの開け閉め（再描画せずにクラスだけ切り替えてアニメを出す） */
function toggleLevelDrawer(btn) {
  const dr = btn.closest('.lv-drawer');
  lvDrawerOpen = !lvDrawerOpen;
  dr.classList.remove('anim-in', 'anim-out', 'anim-world');
  void dr.offsetWidth;
  dr.classList.toggle('open', lvDrawerOpen);
  dr.classList.add(lvDrawerOpen ? 'anim-in' : 'anim-out');
  btn.setAttribute('aria-expanded', lvDrawerOpen);
  clearTimeout(toggleLevelDrawer.t);
  toggleLevelDrawer.t = setTimeout(() => dr.classList.remove('anim-in', 'anim-out'), 900);
  sfx('click');
}

function homeHTML() {
  const d = data();
  const cid = d.selectedChar;
  const pw = D.power(D.charStats(d, cid));
  const n = d.selectedStage;
  const info = D.stageInfo(n);
  const locked = isLocked(n);
  const cleared = D.stageCleared(d, n);
  const rooms = Array.from({ length: D.ROOMS_PER_STAGE }, (_, i) => `<i class="${i === D.ROOMS_PER_STAGE - 1 ? 'boss' : ''}"></i>`).join('<span class="arrow">›</span>');
  return `
  <div class="home-icons">
    ${homeIcon('present', 'gift', '#ff6a8a', 'プレゼント', d.presents.length)}
    ${homeIcon('missions', 'scroll', '#e8d8a8', 'ミッション', M.claimableCount())}
    ${homeIcon('login-bonus', 'calendar', '#7ac8ff', 'ログボ', 0)}
    ${homeIcon('news', 'megaphone', '#ff7a3a', 'お知らせ', hasUnreadNews() ? '!' : 0)}
    ${homeIcon('enemy-book', 'skull', '#e8e0d0', 'てき図鑑', 0)}
  </div>
  ${tickerHTML()}
  <div class="home-top">
    ${!isStandalone() ? '<button class="chip" data-act="install">ホーム画面に追加</button>' : ''}
    <button class="chip" data-act="stage-list">ステージ一覧</button>
  </div>
  <div class="panel stage-card">
    <div class="stage-ribbon ${locked ? 'locked' : ''}">${locked ? '<img class="px" data-icon="lock" data-color="#ffd23a" alt="">' : ''}<span class="no ol">${info.name}</span><span class="nm ol">${info.sub}</span></div>
    <div class="stage-view">
      <button class="stage-arrow l" data-act="stage-prev" ${info.w <= 1 ? 'disabled' : ''} aria-label="前のワールド"><span>◀</span><small>W${Math.max(1, info.w - 1)}</small></button>
      <canvas id="stage-preview" class="${stageSlide ? 'slide-' + stageSlide : ''}"></canvas>
      ${locked ? `<div class="stage-lock"><img class="px" data-icon="lock" data-color="#ffd23a" alt=""><span class="ol">${unlockHint(n)}</span></div>` : ''}
      <button class="stage-arrow r" data-act="stage-next" ${info.w >= D.BIOMES.length ? 'disabled' : ''} aria-label="次のワールド"><span>▶</span><small>W${Math.min(D.BIOMES.length, info.w + 1)}</small></button>
    </div>
    ${levelDrawerHTML(d, info)}
    <div class="rooms"><span class="muted">部屋</span>${rooms}<span class="muted">BOSS</span></div>
    <div class="stage-meta">
      <span>推奨戦闘力 <span class="${pw >= info.recommended ? 'ok' : 'warn'}">${info.recommended.toLocaleString()}</span></span>
      <span>${D.CHARACTERS[cid].name} 戦闘力 ${pw.toLocaleString()}</span>
    </div>
    ${cleared ? '<div class="muted" style="text-align:center;color:#7aff8a">クリア済み</div>' : ''}
    <div class="help-tg"><span>初めて会う敵の説明<small>${d.settings.enemyHelp ? '出撃中に初めての敵が出たら、止めて説明します' : 'オフ：説明を出さずにそのまま進みます'}</small></span><button class="toggle ${d.settings.enemyHelp ? 'on' : ''}" data-act="toggle-enemy-help" aria-label="初めて会う敵の説明"></button></div>
  </div>
  ${locked
    ? `<button class="btn btn-start locked" disabled><img class="px" data-icon="lock" data-color="#8a7a60" alt=""> ロック中</button>`
    : '<button class="btn red btn-start" data-act="start">出撃</button>'}`;
}

function stageListModal() {
  const d = data();
  const worlds = D.BIOMES.map((b, wi) => {
    const w = wi + 1;
    const cells = [];
    for (let L = 1; L <= D.LEVELS_PER_WORLD; L++) {
      const n = D.stageNo(w, L);
      const st = D.stageCleared(d, n) ? 'clear' : isLocked(n) ? 'lock' : 'open';
      cells.push(`<button class="stile ${st} ${n === d.selectedStage ? 'sel' : ''}" data-n="${n}" style="--bc:${b.floor[0]};--bd:${b.side}">
        <span class="sn ol">${w}-${L}</span><span class="sb">${D.STRUCT_NAMES[L - 1]}</span>
        ${st === 'lock' ? '<img class="px lk" data-icon="lock" data-color="#ffd23a" alt="">' : st === 'clear' ? '<span class="ck ol">✓</span>' : ''}
      </button>`);
    }
    const done = D.worldCleared(d, w);
    return `<div class="sw-h"><b>ワールド${w}　${b.name}</b><span>${done} / ${D.LEVELS_PER_WORLD}</span></div><div class="stage-grid">${cells.join('')}</div>`;
  }).join('');
  modal({
    title: 'ステージ一覧',
    body: `<p class="muted" style="margin-top:0">ステージは各ワールド10個（〇-1〜〇-10）。〇-10をクリアすると次のワールドが開放されます。ロック中のステージも中身を見られます。</p>${worlds}`,
    buttons: [{ label: '閉じる', value: null }],
    onMount: (ov, close) => {
      hydrate(ov);
      ov.querySelectorAll('.stile').forEach((b) => b.addEventListener('click', () => {
        d.selectedStage = +b.dataset.n;
        sfx('click');
        close();
        commit();
      }));
      const sel = ov.querySelector('.stile.sel');
      if (sel) sel.scrollIntoView({ block: 'center' });
    },
  });
}

/** ステージの見本（実際のタイルで描く） */
function drawStagePreview() {
  const cv = $('#stage-preview');
  if (!cv) return;
  const d = data();
  const info = D.stageInfo(d.selectedStage);
  const B = info.biome;
  const W = 15, H = 8;
  cv.width = W * T; cv.height = H * T;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const alt = (x * 7 + y * 3 + d.selectedStage) % 9 < 3;
    g.drawImage(floorTile(B, (x * 13 + y * 7) % 8 * 31 + 5, alt), x * T, y * T);
  }
  // 両端の飾り
  g.fillStyle = B.side; g.globalAlpha = 0.5; g.fillRect(0, 0, 2 * T, H * T); g.fillRect(13 * T, 0, 2 * T, H * T); g.globalAlpha = 1;
  for (let i = 0; i < 4; i++) {
    const dl = wallDeco(B, i * 17 + 3), dr = wallDeco(B, i * 29 + 7);
    g.drawImage(dl, 2 + (i % 2) * 6, i * 30 - 8);
    g.drawImage(dr, 13 * T + (i % 2) * 4, i * 30 - 4);
  }
  // そのステージの構造（〇-1〜〇-10）を見本に描く：中央 9 列ぶん
  const lay = previewLayout(info.L);
  const PX = 3, pcx = 7, pcy = 6;   // 構造の左端の列、キャラの位置
  const at = (x, y) => (lay[y] || '')[x - PX] || '.';
  const rk = rockTile(B, 9), sp = spikeTile(B);
  const free = [];
  for (let y = 0; y < H; y++) for (let x = PX; x < PX + 9; x++) {
    const c = (x === pcx && y >= pcy - 1) ? '.' : at(x, y);
    if (c === '~') {
      g.fillStyle = B.pool.color; g.fillRect(x * T, y * T, T, T);
      if (at(x, y - 1) !== '~') { g.fillStyle = B.pool.rim; g.fillRect(x * T, y * T, T, 3); }
    } else if (c === '^') g.drawImage(sp, x * T, y * T);
    else if (c === 'R') g.drawImage(rk, x * T, y * T - 4);
    else if (Math.abs(x - pcx) + Math.abs(y - pcy) > 2) free.push([x, y]);
  }
  // 敵：空いているマスから、ばらけるように選ぶ
  const en = B.mobs.map((id) => EN.MOBS[id]);
  const want = [[4, 3], [11, 4], [8, 1], [10, 6]];
  want.forEach(([wx, wy], k) => {
    if (!free.length) return;
    let bi = 0, bd = 1e9;
    free.forEach(([x, y], i) => { const dd = (x - wx) ** 2 + (y - wy) ** 2; if (dd < bd) { bd = dd; bi = i; } });
    const [x, y] = free.splice(bi, 1)[0];
    const m = en[k % en.length];
    const s = enemySprite(m.sprite, m.pal);
    g.drawImage(s, Math.round((x + 0.5) * T - s.width / 2), Math.round((y + 0.5) * T - s.height / 2));
  });
  const cs = charSprite(D.CHARACTERS[d.selectedChar], 'idle');
  g.fillStyle = 'rgba(30,10,30,0.35)'; g.beginPath(); g.ellipse(7.5 * T, 6.9 * T, 7, 2.5, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(cs, Math.round(7.5 * T - cs.width / 2), Math.round(6.9 * T - cs.height + 2));
  if (isLocked(d.selectedStage)) { g.fillStyle = 'rgba(20,10,20,0.55)'; g.fillRect(0, 0, cv.width, cv.height); }
}

// ----- 装備・キャラ -----
function partyHTML() {
  return `<div class="subtabs">
      <button class="btn ${partyTab === 'equip' ? 'active' : ''}" data-act="party-tab" data-t="equip">装備</button>
      <button class="btn ${partyTab === 'chars' ? 'active' : ''}" data-act="party-tab" data-t="chars">キャラ変更・強化</button>
    </div>
    <button class="preset-btn" data-act="presets"><img class="px" data-icon="book" data-color="#ffd23a" alt=""><span>プリセット<small>キャラと装備の組み合わせを保存・呼び出し</small></span><b>${presetSlots()}枠</b></button>` + (partyTab === 'equip' ? equipHTML() : charsHTML());
}

// ===================== プリセット（キャラ＋装備の組み合わせ） =====================
/** 使えるプリセットの数＝仲間になっているキャラの数 */
const presetSlots = () => Object.values(data().chars).filter((c) => c.unlocked).length;
function presetRow(p, i, slots) {
  const d = data();
  if (i >= slots) {
    return `<div class="pr-row lock"><img class="px pr-lock" data-icon="lock" data-color="#9a8a70" alt=""><div class="pr-main"><b>プリセット ${i + 1}</b><small>キャラをあと${i + 1 - slots}人仲間にすると使えます</small></div></div>`;
  }
  const name = (p && p.name) || `プリセット ${i + 1}`;
  if (!p) {
    return `<div class="pr-row empty"><div class="pr-main"><b>${esc(name)}</b><small>まだ保存していません</small></div>
      <button class="btn small teal" data-pr="save:${i}">今の編成を保存</button></div>`;
  }
  const c = D.CHARACTERS[p.char];
  const gear = D.SLOTS.map((s) => {
    const it = d.items.find((x) => x.uid === p.equip[s.id]);
    if (!it) return `<span class="pr-g none"></span>`;
    const b = D.EQUIP[it.base];
    return `<span class="pr-g" style="--rc:${D.RARITIES[it.rarity].color}"><img class="px" data-icon="${b.icon}" data-color="${b.color}" alt=""></span>`;
  }).join('');
  const same = p.char === d.selectedChar && D.SLOTS.every((s) => (p.equip[s.id] ?? null) === (d.equip[s.id] ?? null));
  return `<div class="pr-row ${same ? 'cur' : ''}">
    <div class="pr-top"><img class="pr-face" data-portrait="${p.char}" alt="${c.name}"><div class="pr-main"><b>${esc(name)}</b><small>${c.name}${same ? '・いまの編成' : ''}</small></div>
      <button class="btn small" data-pr="name:${i}" aria-label="名前を変える">名前</button></div>
    <div class="pr-gear">${gear}</div>
    <div class="pr-btns"><button class="btn small red" data-pr="load:${i}" ${same ? 'disabled' : ''}>呼び出す</button><button class="btn small teal" data-pr="save:${i}">上書き保存</button></div>
  </div>`;
}
async function presetModal() {
  const d = data();
  const slots = presetSlots();
  const total = Object.keys(D.CHARACTERS).length;
  const v = await modal({
    title: 'プリセット',
    body: `<p class="muted" style="margin-top:0">いまのキャラと装備の組み合わせを保存して、ボタン1つで呼び出せます。仲間のキャラが増えるたびに、使える枠が1つ増えます（${slots} / ${total}枠）。</p>
      <div class="pr-list">${Array.from({ length: total }, (_, i) => presetRow(d.presets[i] || null, i, slots)).join('')}</div>`,
    buttons: [{ label: '閉じる', value: null }],
    onMount: (ov, close) => {
      hydrate(ov);
      ov.querySelectorAll('[data-pr]').forEach((b) => b.addEventListener('click', () => close(b.dataset.pr)));
    },
  });
  if (!v) return;
  const [op, n] = v.split(':');
  const i = +n;
  if (i >= slots) return presetModal();
  const p = d.presets[i] || null;
  if (op === 'save') {
    if (p && !(await confirmBox('上書き保存', `「${esc(p.name || `プリセット ${i + 1}`)}」を、いまの編成（${D.CHARACTERS[d.selectedChar].name}と装備）で上書きしますか？`, '上書きする', 'teal'))) return presetModal();
    while (d.presets.length <= i) d.presets.push(null);
    d.presets[i] = { name: p?.name || '', char: d.selectedChar, equip: { ...d.equip } };
    sfx('equip');
    commit();
    toast('プリセットに保存しました');
  } else if (op === 'load' && p) {
    // なくなった装備（売却・合成で使った）は外れた状態で呼び出す
    const have = new Set(d.items.map((x) => x.uid));
    const used = new Set();
    let missing = 0;
    for (const s of D.SLOTS) {
      const u = p.equip[s.id];
      if (u != null && have.has(u) && !used.has(u)) { d.equip[s.id] = u; used.add(u); }
      else { if (u != null) missing++; d.equip[s.id] = null; }
    }
    if (d.chars[p.char]?.unlocked) d.selectedChar = p.char;
    sfx('equip');
    commit();
    toast(missing ? `呼び出しました（なくなった装備が${missing}つあったので外れています）` : `「${p.name || `プリセット ${i + 1}`}」を呼び出しました`);
  } else if (op === 'name' && p) {
    let val = p.name || '';
    const ok = await modal({
      title: 'プリセットの名前',
      body: `<input class="pr-name" maxlength="12" value="${esc(val)}" placeholder="プリセット ${i + 1}" autocomplete="off"><p class="muted">12文字まで。空にすると「プリセット ${i + 1}」になります。</p>`,
      buttons: [{ label: 'キャンセル', value: false }, { label: '決定', value: true, cls: 'teal' }],
      onMount: (ov) => { const inp = ov.querySelector('.pr-name'); inp.addEventListener('input', () => { val = inp.value; }); inp.focus(); },
    });
    if (ok) { p.name = String(val).replace(/[<>"'`&\u0000-\u001f]/g, '').trim().slice(0, 12); commit(); toast('名前を変更しました'); }
  }
  return presetModal();
}
/** 仲間が増えたときのお知らせ文 */
const presetNote = (n) => `<p class="pr-note">プリセットの枠が <b>+${n}</b>（いま ${presetSlots()}枠）</p>`;

function equipHTML() {
  const d = data();
  const cid = d.selectedChar;
  const cs = d.chars[cid];
  const st = D.charStats(d, cid);
  const slotTile = (s) => {
    const it = d.items.find((i) => i.uid === d.equip[s.id]);
    if (it) return itemTile(it, { act: 'slot', slot: s.id, noOwner: true });
    const sample = Object.values(D.EQUIP).find((e) => e.type === s.type);
    return `<button class="itile empty" data-act="slot" data-slot="${s.id}"><img class="px" data-icon="${sample.icon}" data-color="#9a8a70" alt="">${s.name}</button>`;
  };
  const left = D.SLOTS.filter((s) => s.side === 'L').map(slotTile).join('');
  const right = D.SLOTS.filter((s) => s.side === 'R').map(slotTile).join('');
  const groups = { all: '全て', weapon: '武器', armor: '防具', acc: 'アクセ' };
  const inGroup = (it) => {
    const t = D.EQUIP[it.base].type;
    if (invFilter === 'all') return true;
    if (invFilter === 'weapon') return t === 'weapon';
    if (invFilter === 'armor') return ['head', 'body', 'arms', 'feet'].includes(t);
    return ['neck', 'ring'].includes(t);
  };
  const sorted = d.items.filter(inGroup).sort((a, b) =>
    D.RARITY_ORDER.indexOf(b.rarity) - D.RARITY_ORDER.indexOf(a.rarity) || b.level - a.level || b.uid - a.uid);
  return `
  <div class="equip-stage">
    <div class="slot-col l">${left}</div>
    <div class="equip-center">
      <img class="px" data-char="${cid}" alt="">
      <div class="statbar">ATK: <b>${st.atk.toLocaleString()}</b> HP: <b>${st.hp.toLocaleString()}</b><br>戦闘力 <b>${D.power(st).toLocaleString()}</b></div>
    </div>
    <div class="slot-col r">${right}</div>
  </div>
  <div class="inv-tools">
    <div class="filter">${Object.entries(groups).map(([k, v]) => `<button class="btn small ${invFilter === k ? 'active' : ''}" data-act="inv-filter" data-f="${k}">${v}</button>`).join('')}</div>
    <button class="btn small dark" data-act="auto-equip">おまかせ</button>
  </div>
  <div class="panel" style="margin-top:0">
    ${sorted.length ? `<div class="inv">${sorted.map((it) => itemTile(it)).join('')}</div>` : '<div class="muted">装備がありません。ステージクリアや抽選で手に入ります。</div>'}
    <div class="row" style="margin-top:8px"><span class="muted">${d.items.length} 個</span><span class="spacer"></span><button class="btn small dark" data-act="sell-n">N装備をまとめて売却</button></div>
  </div>`;
}

/** 仲間になっていないキャラの「どうすれば仲間になるか」（タイルの短い表示） */
function unlockLabel(c) {
  const u = c.unlock || {};
  if (u.rank) return `Rank${u.rank}`;
  if (u.diamond) return 'ダイヤ';
  if (u.gacha) return c.banner ? 'PICK UP' : 'ガチャ';
  return `STAGE${u.stage}-1`;
}
function charsHTML() {
  const d = data();
  if (!viewChar || !D.CHARACTERS[viewChar]) viewChar = d.selectedChar;
  const id = viewChar;
  const c = D.CHARACTERS[id];
  const cs = d.chars[id];
  const st = D.charStats(d, id);
  const W = D.SKILLS[c.weapon];
  const cost = D.charUpgradeCost(cs.level);
  const maxed = cs.level >= D.CHAR_MAX_LV;
  const tiles = Object.entries(D.CHARACTERS).map(([cid, cc]) => {
    const s = d.chars[cid];
    return `<button class="ctile ${cid === id ? 'active' : ''} ${s.unlocked ? '' : 'locked'}" style="--cbg:${cc.bg}" data-act="view-char" data-id="${cid}">
      <img data-portrait="${cid}" alt="${cc.name}">
      ${s.unlocked ? `<span class="lvl ol">Lv${s.level}</span>${s.awaken ? `<span class="pct ol">+${s.awaken}</span>` : ''}` : `<span class="lockic ol"><img class="px" data-icon="lock" data-color="#ffd23a" alt="">${unlockLabel(cc)}</span>`}
      ${cc.stars === 5 ? '<span class="star5"></span>' : ''}
      ${cid === d.selectedChar ? '<span class="using ol">出撃</span>' : ''}
    </button>`;
  }).join('');
  let actions;
  if (!cs.unlocked) {
    const price = M.charPrice(id), have = d.diamonds || 0, u = c.unlock || {};
    const buyBtn = `<button class="btn dia-buy ${have >= price ? '' : 'short'}" data-act="buy-char" data-id="${id}"><img class="px" data-icon="diamond" data-color="#5ad8ff" alt=""><span><small>ダイヤで仲間にする</small>${price.toLocaleString()}</span></button>`;
    const bn = c.banner ? D.CHAR_BANNERS.find((b) => b.id === c.banner) : null;
    if (u.rank) {
      actions = `<div class="rank-unlock"><b>Rank ${u.rank}</b> になると仲間になります<small>ランク報酬のキャラです（いま Rank ${d.rank.lv}）</small></div>`;
    } else if (u.diamond) {
      actions = `<div class="muted" style="text-align:center;margin-bottom:6px">${price.toLocaleString()}ダイヤで仲間になる特別なキャラです（ガチャには出ません）</div>
        <div class="btn-grid one">${buyBtn}</div>`;
    } else {
      actions = `<div class="muted" style="text-align:center;margin-bottom:6px">${bn ? `「${bn.name}」で手に入ります。ダイヤでも仲間にできます` : u.gacha ? 'キャラガチャで手に入ります。ダイヤでも仲間にできます' : `STAGE ${u.stage}-1 クリア・キャラガチャ・ダイヤで仲間になります`}</div>
        <div class="btn-grid">
          ${buyBtn}
          <button class="btn red" data-act="goto-gacha" ${bn ? `data-bid="${bn.id}"` : ''}>キャラガチャへ</button>
        </div>`;
    }
  } else {
    actions = `<div class="btn-grid">
      <button class="btn red" data-act="char-up" data-id="${id}" ${maxed || d.gold < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `強化 <img class="px" data-icon="coin" data-color="#ffcf3a" alt="">${cost.toLocaleString()}`}</button>
      <button class="btn ${id === d.selectedChar ? '' : 'teal'}" data-act="select-char" data-id="${id}" ${id === d.selectedChar ? 'disabled' : ''}>${id === d.selectedChar ? '出撃中' : '決定'}</button>
    </div>`;
  }
  return `
  <div class="char-show" style="--cbg:${c.bg}">
    <img class="big px" data-char="${id}" data-anim alt="${c.name}" ${cs.unlocked ? '' : 'style="filter:brightness(0) opacity(.5)"'}>
    <div class="char-info darkf">
      <div class="nm ol">${c.name}</div>
      <div class="role">${c.role}</div>
      ${starsHTML(c.stars)}
      <div class="lvline">Lv. ${cs.level} / ${D.CHAR_MAX_LV}${cs.awaken ? `<span class="awk">覚醒+${cs.awaken}</span>` : ''}</div>
      <div class="st">ATK : ${st.atk.toLocaleString()}<br>HP : ${st.hp.toLocaleString()}</div>
      <div class="sep"></div>
      <button class="ability" data-act="ability" data-k="w" data-id="${id}"><img class="px" data-icon="${W.icon}" data-color="${W.color}" alt=""><span>${W.name}<small>固有武器</small></span></button>
      <button class="ability" data-act="ability" data-k="t" data-id="${id}"><img class="px" data-icon="star" data-color="#ff9a3c" alt=""><span>${c.trait.name}<small>${c.trait.desc}</small></span></button>
    </div>
  </div>
  <div class="char-grid">${tiles}</div>
  <div class="char-actions" style="margin-top:10px">${actions}</div>`;
}

/** ダイヤでキャラを仲間にする（確認 → 演出） */
async function buyCharModal(id) {
  const d = data();
  const c = D.CHARACTERS[id];
  if (!c || d.chars[id].unlocked) return;
  const price = M.charPrice(id), have = d.diamonds || 0, short = have < price;
  const DIA = '<img class="px" data-icon="diamond" data-color="#5ad8ff" alt="">';
  sfx('click');
  const ok = await modal({
    title: 'ダイヤで仲間にする',
    sound: 'panel2',
    body: `<div class="buy-char">
      <div class="bc-card s${c.stars}" style="--cbg:${c.bg}"><img class="px" data-char="${id}" data-anim alt="${c.name}"><i class="bc-shine"></i></div>
      <div class="bc-name ol">${c.name}</div>
      <div class="bc-role">${c.role}</div>
      ${starsHTML(c.stars)}
      <div class="bc-price">${DIA}<b>${price.toLocaleString()}</b></div>
      <div class="bc-have">所持ダイヤ ${have.toLocaleString()} <i>▶</i> <b class="${short ? 'short' : ''}">${short ? `${(price - have).toLocaleString()} 足りません` : (have - price).toLocaleString()}</b></div>
      <p class="muted bc-hint">★5：${D.CHAR_PRICE[5]}　★4：${D.CHAR_PRICE[4]}　★3：${D.CHAR_PRICE[3]} ダイヤ<br>ダイヤは覚醒+5のキャラがガチャで出たとき・ランク100からのランク報酬などでもらえます</p>
    </div>`,
    buttons: [{ label: 'やめる', value: null }, { label: short ? '足りません' : '仲間にする', value: 'ok', cls: 'gold', disabled: short }],
    onMount: (ov) => { hydrate(ov); if (short) { const b = ov.querySelector('.mbtns [data-i="1"]'); if (b) b.disabled = true; } },
  });
  if (ok !== 'ok') return;
  if (!M.buyChar(id)) { sfx('error'); toast('ダイヤが足りません'); return; }
  sfx('levelup');
  await modal({
    cls: 'rankup',
    sound: 'panel',
    body: `<div class="ru-burst"></div>
      <div class="ru-title ol">NEW!</div>
      <div class="buy-char got"><div class="bc-card s${c.stars}" style="--cbg:${c.bg}"><img class="px" data-char="${id}" data-anim alt="${c.name}"><i class="bc-shine"></i></div>
      <div class="bc-name ol">${c.name} が仲間になった！</div></div>
      ${presetNote(1)}`,
    buttons: [{ label: 'OK', value: true, cls: 'teal' }],
    onMount: hydrate,
  });
  render();
}

// ===================== まとめて強化 =====================
const statVal = (k, v) => (D.PERCENT_STATS.has(k) ? `${(v * 100).toFixed(1).replace(/\.0$/, '')}%` : Math.round(v).toLocaleString());
/**
 * 上げたいレベルを選んで、まとめて強化する画面（キャラ・装備共通）
 * @param o.cur 今のレベル / o.max 最大レベル / o.costAt(lv) lv→lv+1 に必要なコイン / o.statsAt(lv) {キー:値}
 * @returns 選んだレベル（やめたら null）
 */
function bulkUpgradeModal(o) {
  const d = data();
  const { cur, max } = o;
  const totalTo = (to) => { let s = 0; for (let l = cur; l < to; l++) s += o.costAt(l); return s; };
  // 今のコインで上げられる最大レベル
  let afford = cur;
  for (let s = 0; afford < max && s + o.costAt(afford) <= d.gold; afford++) s += o.costAt(afford);
  let target = Math.min(max, cur + 1);
  const quick = [1, 5, 10];
  const before = o.statsAt(cur);
  return modal({
    title: `${o.title} を強化`,
    sound: 'panel2',
    body: `<div class="bu">
      <div class="bu-lv"><span class="bu-from">Lv ${cur}</span><span class="bu-arrow">▶</span><span class="bu-to ol" id="bu-to"></span></div>
      <input type="range" class="bu-range" id="bu-range" min="${cur + 1}" max="${max}" step="1" value="${target}" ${max - cur <= 1 ? 'disabled' : ''} aria-label="強化後のレベル">
      <div class="bu-quick">
        ${quick.map((n) => `<button class="btn small" data-bu="${n}" ${cur + n > max ? 'disabled' : ''}>+${n}</button>`).join('')}
        <button class="btn small gold" data-bu="afford" ${afford <= cur ? 'disabled' : ''}>買える分</button>
        <button class="btn small" data-bu="max">MAX</button>
      </div>
      <div class="bu-stats" id="bu-stats"></div>
      <div class="bu-cost" id="bu-cost"></div>
    </div>`,
    buttons: [{ label: 'やめる', value: null }, { label: '強化する', value: 'ok', cls: 'gold' }],
    onMount: (ov, close) => {
      hydrate(ov);
      const range = ov.querySelector('#bu-range');
      const okBtn = ov.querySelector('.mbtns [data-i="1"]');
      const update = () => {
        const cost = totalTo(target);
        const after = o.statsAt(target);
        ov.querySelector('#bu-to').textContent = `Lv ${target}${target >= max ? '（MAX）' : ''}`;
        ov.querySelector('#bu-stats').innerHTML = Object.keys(after).map((k) =>
          `<div><span>${D.STAT_NAMES[k] || k}</span><b>${statVal(k, before[k] || 0)}</b><i>▶</i><b class="up">${statVal(k, after[k])}</b></div>`).join('');
        const short = cost > d.gold;
        ov.querySelector('#bu-cost').innerHTML = `必要コイン <img class="px" data-icon="coin" data-color="#ffcf3a" alt=""><b class="${short ? 'short' : ''}">${cost.toLocaleString()}</b><small>（所持 ${d.gold.toLocaleString()}）</small>`;
        hydrate(ov.querySelector('#bu-cost'));
        okBtn.disabled = short;
        okBtn.textContent = short ? 'コインが足りません' : `+${target - cur} 強化する`;
        range.value = target;
      };
      range.addEventListener('input', () => { target = +range.value; update(); sfx('reel'); });
      ov.querySelectorAll('[data-bu]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.bu;
        target = k === 'max' ? max : k === 'afford' ? afford : Math.min(max, cur + +k);
        update();
      }));
      update();
    },
  }).then((v) => (v === 'ok' ? target : null));
}

/** 選んだレベルまで強化（コインを確認してから） */
function applyUpgrade(obj, cur, to, costAt) {
  const d = data();
  let cost = 0;
  for (let l = cur; l < to; l++) cost += costAt(l);
  if (to <= cur || d.gold < cost) return false;
  d.gold -= cost;
  obj.level = to;
  M.track('upgrade', to - cur);
  sfx('levelup');
  commit();
  toast(`Lv ${to} に強化しました！（-${cost.toLocaleString()}コイン）`);
  return true;
}

async function itemModal(uid, slotId) {
  const d = data();
  const it = d.items.find((i) => i.uid === uid);
  if (!it) return;
  newItems.delete(uid);
  const cid = d.selectedChar;
  const base = D.EQUIP[it.base];
  const R = D.RARITIES[it.rarity];
  const owner = equippedSlot(uid);
  const st = D.itemStats(it);
  const cost = D.upgradeCost(it);
  const maxLv = D.itemMaxLv(it);
  const maxed = it.level >= maxLv;
  const mats = mergeMaterials(it);
  const lines = Object.entries(st).map(([k, v]) => `<div>${D.formatStat(k, v)}</div>`).join('');
  const buttons = [];
  if (owner) buttons.push({ label: '外す', value: 'unequip' });
  else buttons.push({ label: '装備する', value: 'equip', cls: 'teal' });
  buttons.push({ label: maxed ? '強化MAX' : '強化', value: 'up', cls: 'gold' });
  if ((it.plus || 0) < D.MERGE_MAX) buttons.push({ label: `合成${mats.length ? `（${mats.length}）` : ''}`, value: 'merge', cls: mats.length ? 'red' : '' });
  if (!owner) buttons.push({ label: `売却 +${D.salvageValue(it)}G`, value: 'sell', cls: 'dark' });
  buttons.push({ label: '閉じる', value: null });
  const v = await modal({
    title: `${base.name}`,
    body: `<div class="item-detail">${itemTile(it, { act: 'none', noOwner: true })}
      <div class="stats" style="flex:1">
        <div style="color:${R.dark}"><b>${R.name}</b> ／ ${D.SLOT_TYPE_NAMES[base.type]}</div>
        <div class="muted">LV ${it.level} / ${maxLv}${it.plus ? `　<span class="plus-t">限界突破${'★'.repeat(it.plus)}</span>` : ''}</div>
        ${lines}
        ${owner ? '<div class="muted">装備中（全キャラ共通）</div>' : ''}
      </div></div>`,
    buttons,
    onMount: (ov) => {
      hydrate(ov);
      const upBtn = [...ov.querySelectorAll('.mbtns .btn')].find((b) => b.textContent.startsWith('強化'));
      if (upBtn && (maxed || d.gold < cost)) upBtn.disabled = true;
      const mgBtn = [...ov.querySelectorAll('.mbtns .btn')].find((b) => b.textContent.startsWith('合成'));
      if (mgBtn && !mats.length) mgBtn.disabled = true;
    },
  });
  if (v === 'equip') equipItem(uid, slotId);
  else if (v === 'unequip') {
    for (const k of Object.keys(d.equip)) if (d.equip[k] === uid) d.equip[k] = null;
    commit();
  } else if (v === 'merge') {
    await mergeModal(uid);
    itemModal(uid, slotId);
  } else if (v === 'up') {
    if (!maxed) {
      const costAt = (lv) => D.upgradeCost({ ...it, level: lv });
      const to = await bulkUpgradeModal({ title: base.name, cur: it.level, max: maxLv, costAt, statsAt: (lv) => D.itemStats({ ...it, level: lv }) });
      if (to) applyUpgrade(it, it.level, to, costAt);
    }
    itemModal(uid, slotId);
  } else if (v === 'sell') {
    if (await confirmBox('売却', `${base.name} を ${D.salvageValue(it)} ゴールドで売却しますか？`, '売却する', 'red')) {
      d.gold += D.salvageValue(it);
      d.items = d.items.filter((i) => i.uid !== uid);
      commit();
    }
  }
}

// ===== 合成（限界突破） =====
/** 合成に使える装備（同じ種類・同じレア度・装備していない・自分以外）。レベルの低い順 */
function mergeMaterials(it) {
  return data().items.filter((x) => x.uid !== it.uid && x.base === it.base && x.rarity === it.rarity && !equippedSlot(x.uid))
    .sort((a, b) => (a.plus || 0) - (b.plus || 0) || a.level - b.level);
}
/** 素材に使った装備の強化コインの半分を返す */
function mergeRefund(m) {
  let c = 0;
  for (let l = 1; l < m.level; l++) c += D.upgradeCost({ ...m, level: l });
  return Math.floor(c / 2);
}
async function mergeModal(uid) {
  const d = data();
  const it = d.items.find((i) => i.uid === uid);
  const mats = mergeMaterials(it);
  if (!mats.length) { toast('同じ装備（同じレア度）がありません'); return; }
  let pick = mats[0].uid;
  const base = D.EQUIP[it.base];
  const after = { ...it, plus: (it.plus || 0) + 1 };
  const body = () => {
    const m = mats.find((x) => x.uid === pick);
    const refund = mergeRefund(m);
    return `<div class="mg">
      <p class="muted" style="margin-top:0">同じ装備を1つ使って<b>限界突破</b>します。レベル上限が +${D.MERGE_LV} 上がり、もっと強化できるようになります（最大★${D.MERGE_MAX}）。</p>
      <div class="mg-row">
        <div class="mg-col">${itemTile(it, { act: 'none', noOwner: true })}<div class="mg-l">Lv上限 ${D.itemMaxLv(it)}</div></div>
        <div class="mg-arrow">▶</div>
        <div class="mg-col">${itemTile(after, { act: 'none', noOwner: true })}<div class="mg-l up">Lv上限 ${D.itemMaxLv(after)}</div></div>
      </div>
      <div class="mg-sub">素材にする装備をえらぶ</div>
      <div class="inv mg-mats">${mats.map((x) => `<div class="mg-mat ${x.uid === pick ? 'sel' : ''}" data-mat="${x.uid}">${itemTile(x, { act: 'none', noOwner: true })}</div>`).join('')}</div>
      ${refund ? `<p class="muted">素材の強化に使ったコインの半分（${refund.toLocaleString()}コイン）が戻ります。</p>` : ''}
    </div>`;
  };
  const v = await modal({
    title: `${base.name}を合成`,
    body: body(),
    buttons: [{ label: 'やめる', value: null }, { label: '合成する', value: true, cls: 'red' }],
    onMount: (ov) => {
      hydrate(ov);
      const wire = () => ov.querySelectorAll('[data-mat]').forEach((el) => el.addEventListener('click', (e) => {
        e.stopPropagation();
        pick = +el.dataset.mat;
        ov.querySelector('.mbody').innerHTML = body();
        hydrate(ov); wire();
      }));
      wire();
    },
  });
  if (!v) return;
  const m = d.items.find((x) => x.uid === pick);
  if (!m || equippedSlot(m.uid) || (it.plus || 0) >= D.MERGE_MAX) return;
  const refund = mergeRefund(m);
  d.items = d.items.filter((x) => x.uid !== m.uid);
  it.plus = (it.plus || 0) + 1;
  M.track('merge');
  d.stats.merges = (d.stats.merges || 0) + 1;
  d.gold += refund;
  sfx('rare');
  commit();
  toast(`限界突破！ ${base.name} ★${it.plus}（Lv上限 ${D.itemMaxLv(it)}）`);
}

function equipItem(uid, slotId) {
  const d = data();
  const cid = d.selectedChar;
  const it = d.items.find((i) => i.uid === uid);
  const type = D.EQUIP[it.base].type;
  const owner = equippedSlot(uid);
  if (owner) d.equip[owner] = null;
  let slot = slotId && D.SLOTS.find((s) => s.id === slotId && s.type === type) ? slotId : null;
  if (!slot) {
    const cands = D.SLOTS.filter((s) => s.type === type);
    slot = (cands.find((s) => d.equip[s.id] == null) || cands[0]).id;
  }
  d.equip[slot] = uid;
  void cid;
  sfx('equip');
  commit();
}

/** スロットを押した：その部位の装備一覧から選ぶ */
async function slotModal(slotId) {
  const d = data();
  const slot = D.SLOTS.find((s) => s.id === slotId);
  const cur = d.equip[slotId];
  const list = d.items.filter((it) => D.EQUIP[it.base].type === slot.type)
    .sort((a, b) => D.RARITY_ORDER.indexOf(b.rarity) - D.RARITY_ORDER.indexOf(a.rarity) || b.level - a.level);
  if (!list.length) { toast(`${slot.name}の装備を持っていません`); return; }
  modal({
    title: `${slot.name}を選ぶ`,
    body: `<div class="inv">${list.map((it) => itemTile(it, { act: 'pick', slot: slotId })).join('')}</div>`,
    buttons: cur ? [{ label: '外す', value: 'off' }, { label: '閉じる', value: null }] : [{ label: '閉じる', value: null }],
    onMount: (ov, close) => {
      hydrate(ov);
      ov.querySelectorAll('[data-act="pick"]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
        itemModal(+b.dataset.uid, slotId);
      }));
    },
  }).then((v) => {
    if (v === 'off') { d.equip[slotId] = null; commit(); }
  });
}

function autoEquip() {
  const d = data();
  const cid = d.selectedChar;
  const score = (it) => {
    const s = D.itemStats(it);
    return (s.atk || 0) * 12 + (s.hp || 0) + (s.def || 0) * 8 + (s.crit || 0) * 300 + (s.cd || 0) * 400 + (s.spd || 0) * 200 + (s.exp || 0) * 150;
  };
  const used = new Set();
  void cid;
  for (const s of D.SLOTS) {
    const best = d.items.filter((it) => D.EQUIP[it.base].type === s.type && !used.has(it.uid)).sort((a, b) => score(b) - score(a))[0];
    d.equip[s.id] = best ? best.uid : null;
    if (best) used.add(best.uid);
  }
  sfx('levelup');
  commit();
  toast('いちばん強い装備を付けました');
}

function addItem(baseId, rarity) {
  const d = data();
  const it = { uid: d.nextUid++, base: baseId, rarity, level: 1 };
  d.items.push(it);
  newItems.add(it.uid);
  return it;
}

// ----- ガチャ -----
function gachaHTML() {
  const d = data();
  const g = D.GACHAS[gachaType];
  const t = gachaType === 'char' ? d.ticketsChar : d.ticketsEquip;
  const tName = gachaType === 'char' ? 'キャラガチャチケット' : '装備ガチャチケット';
  const tCol = M.TICKET_COLOR[gachaType];
  const ratesBtn = '<button class="rates-btn" data-act="gacha-rates" aria-label="排出率を見る"><i>%</i>排出率</button>';
  let banner;
  if (gachaType === 'char') {
    // キャラガチャ：左右にスワイプして切り替えるカルーセル（左端がメインのピックアップ1、右端が通常ガチャ）
    const idx = Math.max(0, D.CHAR_BANNERS.findIndex((b) => b.id === charBanner));
    const slides = D.CHAR_BANNERS.map((b, i) => {
      const feat = b.feature.length ? b.feature.map((id) => D.CHARACTERS[id]) : ['zero', 'noir', 'sera'].map((id) => D.CHARACTERS[id]);
      return `<div class="gcar-slide ${i === idx ? 'on' : ''}" data-bid="${b.id}" data-i="${i}">
        <div class="gbanner char th-${b.theme}">
          <span class="gb-tag ol">${b.feature.length ? 'PICK UP!' : 'STANDARD'}</span>
          <div class="gb-chars">${feat.map((c) => `<img class="px" data-char="${c.id}" data-anim alt="${c.name}">`).join('')}</div>
          <div class="gb-title ol">${b.name}</div>
          <div class="gb-names ol">${b.feature.length ? `★5 ${feat.map((c) => c.name).join('・')} 確率アップ！` : b.title}</div>
          ${ratesBtn}
        </div>
      </div>`;
    }).join('');
    banner = `<div class="gcar" id="gcar">
      <div class="gcar-track" id="gcar-track">${slides}</div>
      <button class="gcar-arrow l" data-act="gcar-move" data-d="-1" aria-label="前のガチャ">◀</button>
      <button class="gcar-arrow r" data-act="gcar-move" data-d="1" aria-label="次のガチャ">▶</button>
      <div class="gcar-dots">${D.CHAR_BANNERS.map((b, i) => `<button class="gcar-dot ${i === idx ? 'on' : ''}" data-act="gcar-go" data-i="${i}" aria-label="${b.name}"></button>`).join('')}</div>
    </div>`;
  } else {
    banner = `<div class="gbanner equip">
      <div class="gb-items">${['sword', 'armor', 'ring', 'helmet', 'staff'].map((ic, i) => `<img class="px" data-icon="${ic}" data-color="${['#ffcc33', '#c45cff', '#4aa8ff', '#9aa3b8', '#ffd23a'][i]}" alt="">`).join('')}</div>
      <div class="gb-title ol">装備ガチャ</div>
      ${ratesBtn}
    </div>`;
  }
  return `
  <div class="subtabs">
    <button class="btn ${gachaType === 'char' ? 'active' : ''}" data-act="gacha-type" data-t="char">キャラガチャ</button>
    <button class="btn ${gachaType === 'equip' ? 'active' : ''}" data-act="gacha-type" data-t="equip">装備ガチャ</button>
  </div>
  ${banner}
  <div class="panel">
    ${gachaType === 'char' ? `<div class="gsel-name" id="gsel-name">${(D.CHAR_BANNERS.find((b) => b.id === charBanner) || D.CHAR_BANNERS[0]).name}</div>` : ''}
    <div class="muted" style="text-align:center;margin-bottom:6px">${g.desc}</div>
    <div class="gpay"><img class="px" data-icon="ticket" data-color="${tCol}" alt=""><span>${tName}で引く</span><span class="spacer"></span><span class="own">所持 ${t}枚</span></div>
    <div class="btn-grid">
      <button class="btn teal" data-act="gacha" data-n="1" data-by="ticket" ${t < 1 ? 'disabled' : ''}>1回<small>チケット1枚</small></button>
      <button class="btn red" data-act="gacha" data-n="10" data-by="ticket" ${t < 10 ? 'disabled' : ''}>10連<small>チケット10枚</small></button>
    </div>
    <div class="gpay"><img class="px" data-icon="coin" data-color="#ffcf3a" alt=""><span>コインで引く</span><span class="spacer"></span><span class="own">所持 ${d.gold.toLocaleString()}</span></div>
    <div class="btn-grid">
      <button class="btn teal" data-act="gacha" data-n="1" data-by="gold" ${d.gold < g.coin1 ? 'disabled' : ''}>1回<small>${g.coin1.toLocaleString()}コイン</small></button>
      <button class="btn red" data-act="gacha" data-n="10" data-by="gold" ${d.gold < g.coin10 ? 'disabled' : ''}>10連<small>${g.coin10.toLocaleString()}コイン</small></button>
    </div>
    <p class="muted" style="text-align:center;margin:8px 0 0">10連は${gachaType === 'char' ? '★4以上' : 'R以上'}が1つ確定</p>
  </div>`;
}

/** キャラガチャのカルーセル：表示中のガチャを切り替える */
function gcarGo(i, smooth = true) {
  const track = $('#gcar-track');
  if (!track) return;
  i = Math.max(0, Math.min(D.CHAR_BANNERS.length - 1, i));
  const sl = track.querySelectorAll('.gcar-slide')[i];
  if (!sl) return;
  // スライドの中心をトラックの中心へ（画面上の位置で計算するので、端のガチャもずれない）
  const tr = track.getBoundingClientRect(), r = sl.getBoundingClientRect();
  track.scrollTo({ left: track.scrollLeft + (r.left + r.width / 2) - (tr.left + tr.width / 2), behavior: smooth ? 'smooth' : 'auto' });
  gcarSet(i);
}
function gcarSet(i) {
  const b = D.CHAR_BANNERS[i];
  if (!b) return;
  if (charBanner !== b.id) sfx('reel');
  charBanner = b.id;
  document.querySelectorAll('.gcar-slide').forEach((el, k) => el.classList.toggle('on', k === i));
  document.querySelectorAll('.gcar-dot').forEach((el, k) => el.classList.toggle('on', k === i));
  const nm = $('#gsel-name');
  if (nm) { nm.textContent = b.name; nm.classList.remove('pop'); void nm.offsetWidth; nm.classList.add('pop'); }
  const l = $('.gcar-arrow.l'), r = $('.gcar-arrow.r');
  if (l) l.disabled = i === 0;
  if (r) r.disabled = i === D.CHAR_BANNERS.length - 1;
}
/** 画面を描いたあと：今のガチャの位置へ（アニメなし）＋スワイプで切り替わるように */
function setupCarousel() {
  const track = $('#gcar-track');
  if (!track) return;
  const idx = Math.max(0, D.CHAR_BANNERS.findIndex((b) => b.id === charBanner));
  requestAnimationFrame(() => gcarGo(idx, false));
  let t = 0;
  track.addEventListener('scroll', () => {
    clearTimeout(t);
    // 真ん中にいちばん近いスライドを「選択中」に
    const tr = track.getBoundingClientRect(), mid = tr.left + tr.width / 2;
    let best = 0, bd = 1e9;
    [...track.querySelectorAll('.gcar-slide')].forEach((sl, k) => { const r = sl.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - mid); if (d < bd) { bd = d; best = k; } });
    t = setTimeout(() => gcarSet(best), 60);
  }, { passive: true });
}

async function doGacha(n, by) {
  const type = gachaType;
  if (!M.payGacha(type, n, by)) { sfx('error'); toast(by === 'ticket' ? 'チケットが足りません' : 'コインが足りません'); return; }
  const STAR_R = { 3: 'R', 4: 'SR', 5: 'SSR' };
  if (type === 'char') {
    const res = M.pullChars(n, charBanner);
    // 演出：宝箱 → 卵が1つずつ割れる
    await playGacha(res.map((r) => {
      const c = D.CHARACTERS[r.id];
      return { rarity: STAR_R[r.star], name: `${'★'.repeat(r.star)} ${c.name}`, img: toURL(charSprite(c, 'idle'), 6, `c:${c.id}`), sub: r.isNew ? 'NEW!' : r.awaken ? `覚醒 +${r.awaken}` : `覚醒MAX → ダイヤ +${r.diamond}` };
    }));
    const best = Math.max(...res.map((r) => r.star));
    await modal({
      title: best >= 5 ? '★5 獲得！' : '獲得キャラ',
      sound: 'panel',
      body: `<div class="gacha-result chars">${res.map((r, i) => {
        const c = D.CHARACTERS[r.id];
        return `<div class="gres" style="animation-delay:${i * 0.05}s"><div class="ctile res s${r.star}" style="--cbg:${c.bg}">
          <img data-portrait="${r.id}" alt="${c.name}">
          <span class="rs ol">${'★'.repeat(r.star)}</span>
          <span class="rn ol">${r.isNew ? '<b class="rnew">NEW</b>' : r.awaken ? `覚醒+${r.awaken}` : `<span class="rdia"><img class="px" data-icon="diamond" data-color="#5ad8ff" alt="">+${r.diamond}</span>`}</span>
        </div><div class="gname r-${STAR_R[r.star]}">${c.name}</div></div>`;
      }).join('')}</div>${res.some((r) => r.diamond) ? `<p class="dia-note"><img class="px" data-icon="diamond" data-color="#5ad8ff" alt="">覚醒+5（MAX）のキャラが出たので <b>ダイヤ ×${res.reduce((a, r) => a + r.diamond, 0)}</b> に変わりました</p>` : ''}${res.some((r) => r.isNew) ? presetNote(res.filter((r) => r.isNew).length) : ''}`,
      buttons: [{ label: 'OK', value: true, cls: 'teal' }],
      onMount: hydrate,
    });
  } else {
    const got = M.pullEquips(n, addItem);
    await playGacha(got.map((it) => {
      const b = D.EQUIP[it.base];
      return { rarity: it.rarity, name: b.name, img: toURL(icon(b.icon, b.color), 8, `i8:${b.icon}${b.color}`), sub: D.SLOT_TYPE_NAMES[b.type] };
    }));
    const best = Math.max(...got.map((g) => D.RARITY_ORDER.indexOf(g.rarity)));
    await modal({
      title: best >= 3 ? '★ SSR 獲得！ ★' : best >= 2 ? 'SR 獲得！' : '獲得アイテム',
      sound: 'panel',
      body: `<div class="gacha-result">${got.map((it, i) => `<div class="gres" style="animation-delay:${i * 0.05}s">${itemTile(it, { act: 'none', noOwner: true })}<div class="gname r-${it.rarity}">${D.EQUIP[it.base].name}</div></div>`).join('')}</div>`,
      buttons: [{ label: 'OK', value: true, cls: 'teal' }],
      onMount: hydrate,
    });
  }
  render();
}

// ----- シークレットコード・ユーザーID -----
async function copyPlayerId() {
  const id = data().playerId;
  try { await navigator.clipboard.writeText(id); toast('ユーザーIDをコピーしました'); }
  catch { toast('ユーザーID：' + id); }
  sfx('click');
}
function secretCodeModal() {
  sfx('click');
  let busy = false;
  modal({
    title: 'シークレットコード',
    sound: 'panel2',
    body: `<div class="code-box">
      <img class="px code-ic" data-icon="gift" data-color="#ff6a8a" alt="">
      <p class="muted">コードを入力して「受け取る」を押してください。<br>大文字・小文字はどちらでも大丈夫です。</p>
      <input id="code-in" class="code-in" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="例：DOTRUSH2026" inputmode="latin">
      <div class="code-msg" id="code-msg" role="status"></div>
    </div>`,
    buttons: [{ label: '閉じる', value: null }, { label: '受け取る', value: 'go', cls: 'gold', keep: true }],
    onMount: (ov, close) => {
      hydrate(ov);
      const inp = ov.querySelector('#code-in'), msg = ov.querySelector('#code-msg');
      const okBtn = ov.querySelector('.mbtns [data-i="1"]');
      const submit = async (e) => {
        e?.stopPropagation(); e?.preventDefault();
        if (busy) return;
        busy = true; okBtn.disabled = true; okBtn.textContent = '確認中…';
        msg.className = 'code-msg'; msg.textContent = '';
        const r = await M.redeemCode(inp.value);
        busy = false; okBtn.disabled = false; okBtn.textContent = '受け取る';
        if (!r.ok) {
          sfx('error'); msg.className = 'code-msg ng'; msg.textContent = r.msg;
          inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
          return;
        }
        close();
        sfx('coin');
        await modal({
          cls: 'rankup',
          sound: 'panel',
          body: `<div class="ru-burst"></div>
            <div class="ru-title ol">GET!</div>
            <p class="code-got-t">${esc(r.title)}</p>
            <div class="ru-rewards">${Object.entries(r.reward).map(([k, v]) => { const [ic, col] = M.REWARD_ICON[k] || ['star', '#ffd23a']; return `<div class="reward ${k === 'diamond' ? 'dia' : ''}"><img class="px" data-icon="${ic}" data-color="${col}" alt="">×${v.toLocaleString()}</div>`; }).join('')}</div>`,
          buttons: [{ label: 'OK', value: true, cls: 'teal' }],
          onMount: hydrate,
        });
        render();
      };
      // 「受け取る」は押しても閉じない（結果をこの画面に出す）
      okBtn.addEventListener('click', submit, true);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(e); });
      inp.addEventListener('input', () => { const v = inp.value.toUpperCase(); if (v !== inp.value) inp.value = v; });
      setTimeout(() => inp.focus(), 60);
    },
  });
}

/** ガチャの排出率（各ガチャ画面の小さいボタンから） */
function gachaRatesModal() {
  sfx('click');
  const g = D.GACHAS[gachaType];
  let body;
  let title = `${g.name}の排出率`;
  if (gachaType === 'char') {
    const b = D.CHAR_BANNERS.find((x) => x.id === charBanner) || D.CHAR_BANNERS[0];
    title = `${b.name}の排出率`;
    const pct = (v) => `${(+v.toFixed(3)).toString()}%`;
    const rows = D.bannerRates(b.id).map((sec) => `<div class="rt-sec"><div class="rt-h"><b>${'★'.repeat(sec.star)}</b><span>${sec.rate}%</span></div>
        <div class="rt-list">${sec.list.map((x) => `<div class="rt-i ${x.pickup ? 'pu' : ''}"><img class="px" data-portrait="${x.c.id}" alt=""><span>${x.c.name}${x.pickup ? '<i class="rt-lim pu">UP</i>' : ''}</span><b>${pct(x.rate)}</b></div>`).join('')}</div></div>`).join('');
    body = `<p class="muted">${b.feature.length ? `★5が出たとき、${D.PICKUP_SHARE * 100}%の確率でピックアップの★5（${b.feature.map((id) => D.CHARACTERS[id].name).join('・')}）になります。ピックアップのキャラはこのガチャでしか出ません。` : '通常ガチャで出るキャラと確率です。'}</p>${rows}
      <p class="muted rt-note">・10連の10体目は、それまでに★4以上が出ていなければ★4以上が確定します<br>・持っているキャラが出ると覚醒（+5まで）。覚醒+5のあとはダイヤに変わります<br>・ダイヤで仲間になるキャラ・ランク報酬のキャラはガチャには出ません</p>`;
  } else {
    const types = Object.entries(D.SLOT_TYPE_NAMES).map(([t, nm]) => [nm, Object.values(D.EQUIP).filter((e) => e.type === t).length]).filter(([, n]) => n);
    const rows = D.RARITY_ORDER.map((k) => `<div class="rt-h"><b style="color:${D.RARITIES[k].color}">${k}</b><span>${D.RARITIES[k].rate}%</span></div>`).join('');
    body = `<p class="muted">装備ガチャで出るレア度の確率です。</p><div class="rt-sec">${rows}</div>
      <div class="rt-sec"><div class="rt-h"><b>装備の種類</b><span>${Object.keys(D.EQUIP).length}種類</span></div>
      <p class="muted" style="margin:4px 0 0">${types.map(([nm, n]) => `${nm} ${n}種`).join('・')}。どの装備も同じ確率で出ます</p></div>
      <p class="muted rt-note">・10連の10体目は、それまでにR以上が出ていなければR以上が確定します</p>`;
  }
  modal({ title, sound: 'panel2', body: `<div class="rates-box">${body}</div>`, buttons: [{ label: '閉じる', value: null }], onMount: hydrate });
}

// ----- プロフィール -----
let profTab = 'icon';
function profileModal() {
  sfx('click');
  const d = data();
  const need = PF.rankNeed(d.rank.lv);
  const next = PF.rankReward(d.rank.lv + 1);
  const nextTxt = [next.gold ? `コイン×${next.gold.toLocaleString()}` : '', next.cticket ? `キャラガチャチケット×${next.cticket}` : '', next.eticket ? `装備ガチャチケット×${next.eticket}` : '', next.diamond ? `ダイヤ×${next.diamond}` : '', ...next.icons.map((i) => `アイコン「${i.name}」`), ...next.frames.map((f) => `フレーム「${f.name}」`), ...next.chars.map((id) => `キャラ「${D.CHARACTERS[id].name}」`)].filter(Boolean).join('、');
  const grid = profTab === 'icon'
    ? PF.allIcons().map((ic) => {
      const ok = PF.isUnlocked(ic);
      return `<button class="pick ${d.profile.icon === ic.id ? 'sel' : ''} ${ok ? '' : 'lock'}" data-icon-id="${ic.id}" ${ok ? '' : 'disabled'}>
        ${avatarHTML(ic.id, 'basic', 52)}<span class="pn">${ok ? ic.name : `Rank${ic.rank}`}</span></button>`;
    }).join('')
    : PF.FRAMES.map((f) => {
      const ok = PF.isUnlocked(f);
      return `<button class="pick ${d.profile.frame === f.id ? 'sel' : ''} ${ok ? '' : 'lock'}" data-frame-id="${f.id}" ${ok ? '' : 'disabled'}>
        ${avatarHTML(d.profile.icon, f.id, 52)}<span class="pn">${ok ? f.name : `Rank${f.rank}`}</span></button>`;
    }).join('');
  modal({
    title: 'プロフィール',
    cls: 'wide',
    body: `<div class="prof-head">
        ${avatarHTML(d.profile.icon, d.profile.frame, 84)}
        <div class="prof-info">
          <div class="prof-name">${esc(d.profile.name)}</div>
          <button class="prof-id" data-copy-id>ID：${esc(d.playerId)}<i>コピー</i></button>
          <div class="prof-rank">Rank <b>${d.rank.lv}</b></div>
          <div class="mbar"><div style="width:${(d.rank.exp / need) * 100}%"></div><span>${d.rank.exp} / ${need}</span></div>
          <div class="muted">次のランク報酬：${nextTxt}</div>
        </div>
      </div>
      <div class="rr-title">ランク報酬<small>横にスクロールできます</small></div>
      <div class="rr-strip">${rankRewardCards(d.rank.lv)}</div>
      <div class="name-edit"><input id="pf-name" maxlength="12" value="${esc(d.profile.name)}" placeholder="ユーザー名（12文字まで）" autocomplete="off"><button class="btn small teal" id="pf-save">名前を変更</button></div>
      <div class="mtabs" style="margin-top:10px">
        <button class="btn small ${profTab === 'icon' ? 'active' : ''}" data-ptab="icon">アイコン</button>
        <button class="btn small ${profTab === 'frame' ? 'active' : ''}" data-ptab="frame">アイコンフレーム</button>
      </div>
      <div class="pick-grid reveal">${grid}</div>`,
    buttons: [{ label: '閉じる', value: null }],
    onMount: (ov, close) => {
      hydrate(ov);
      // ランク報酬：次にもらえる報酬が見える位置までスクロール。マウスのホイールでも横に動く
      const strip = ov.querySelector('.rr-strip');
      const nx = strip.querySelector('.rr-card.next');
      if (nx) strip.scrollLeft = Math.max(0, nx.offsetLeft - strip.offsetLeft - 64);
      strip.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
      const reopen = () => { close(); profileModal(); };
      ov.querySelector('[data-copy-id]').addEventListener('click', (e) => { e.stopPropagation(); copyPlayerId(); });
      ov.querySelector('#pf-save').addEventListener('click', (e) => {
        e.stopPropagation();
        if (PF.setName(ov.querySelector('#pf-name').value)) { sfx('equip'); toast('ユーザー名を変更しました'); reopen(); }
        else toast('名前を入力してください');
      });
      ov.querySelectorAll('[data-ptab]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); profTab = b.dataset.ptab; reopen(); }));
      ov.querySelectorAll('[data-icon-id]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (PF.setIcon(b.dataset.iconId)) { sfx('equip'); reopen(); } }));
      ov.querySelectorAll('[data-frame-id]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (PF.setFrame(b.dataset.frameId)) { sfx('equip'); reopen(); } }));
    },
  });
}

/** ランク報酬のカード（受け取り済み・次・この先） */
function rankRewardCards(cur) {
  const max = Math.min(PF.RANK_MAX, Math.max(30, cur + 20));
  const cards = [];
  // 先のランクのキャラ報酬は、遠くても目標として見せる
  const charRanks = Object.values(D.CHARACTERS).map((c) => c.unlock?.rank).filter((r) => r && r > max);
  const levels = [...Array.from({ length: max - 1 }, (_, i) => i + 2), ...new Set(charRanks)].sort((a, b) => a - b);
  for (const lv of levels) {
    const r = PF.rankReward(lv);
    const st = lv <= cur ? 'got' : lv === cur + 1 ? 'next' : '';
    const items = [
      `<span class="rr-i"><img class="px" data-icon="coin" data-color="#ffcf3a" alt="">${r.gold.toLocaleString()}</span>`,
      r.cticket ? `<span class="rr-i"><img class="px" data-icon="ticket" data-color="${M.TICKET_COLOR.char}" alt="">×${r.cticket}</span>` : '',
      r.eticket ? `<span class="rr-i"><img class="px" data-icon="ticket" data-color="${M.TICKET_COLOR.equip}" alt="">×${r.eticket}</span>` : '',
      r.diamond ? `<span class="rr-i dia"><img class="px" data-icon="diamond" data-color="#5ad8ff" alt="">×${r.diamond}</span>` : '',
      ...r.icons.map((i) => `<span class="rr-i sp">${avatarHTML(i.id, 'basic', 22)}<small>アイコン</small></span>`),
      ...r.frames.map((f) => `<span class="rr-i sp">${avatarHTML(data().profile.icon, f.id, 22)}<small>フレーム</small></span>`),
      ...r.chars.map((id) => `<span class="rr-i sp rr-char"><img class="px" data-portrait="${id}" alt=""><small>${D.CHARACTERS[id].name}</small></span>`),
    ].join('');
    cards.push(`<div class="rr-card ${st} ${r.chars.length ? 'has-char' : ''}"><div class="rr-lv">Rank ${lv}</div><div class="rr-items">${items}</div>
      <div class="rr-st">${st === 'got' ? '受け取り済み' : st === 'next' ? 'NEXT' : `あと${lv - cur}ランク`}</div></div>`);
  }
  return cards.join('');
}

/** ランクアップ演出（報酬一覧） */
async function rankUpModal(ups) {
  for (const u of ups) {
    const d = data();
    await modal({
      cls: 'rankup',
      sound: 'panel',
      body: `<div class="ru-burst"></div>
        <div class="ru-title ol">RANK UP!</div>
        <div class="ru-lv"><span>${u.lv - 1}</span><b>→</b><span class="ol">${u.lv}</span></div>
        <div class="ru-rewards">
          <div class="reward"><img class="px" data-icon="coin" data-color="#ffcf3a" alt="">×${u.gold.toLocaleString()}</div>
          ${u.cticket ? `<div class="reward"><img class="px" data-icon="ticket" data-color="${M.TICKET_COLOR.char}" alt="">×${u.cticket}</div>` : ''}
          ${u.eticket ? `<div class="reward"><img class="px" data-icon="ticket" data-color="${M.TICKET_COLOR.equip}" alt="">×${u.eticket}</div>` : ''}
          ${u.diamond ? `<div class="reward dia"><img class="px" data-icon="diamond" data-color="#5ad8ff" alt="">×${u.diamond}</div>` : ''}
          ${u.icons.map((i) => `<div class="reward new">${avatarHTML(i.id, 'basic', 40)}<span>アイコン<br>${i.name}</span></div>`).join('')}
          ${u.frames.map((f) => `<div class="reward new">${avatarHTML(d.profile.icon, f.id, 40)}<span>フレーム<br>${f.name}</span></div>`).join('')}
          ${u.chars.map((id) => `<div class="reward new char"><img class="px" data-portrait="${id}" alt="" style="width:40px;height:40px"><span>NEWキャラ<br>${D.CHARACTERS[id].name}</span></div>`).join('')}
        </div>
        ${u.icons.length || u.frames.length ? '<p class="muted" style="text-align:center">プロフィールから設定できます</p>' : ''}`,
      buttons: [{ label: 'OK', value: true, cls: 'teal' }],
      onMount: hydrate,
    });
  }
  render();
}

// ----- プレゼント・ミッション・ログボ -----
function rewardHTML(reward) {
  return Object.entries(reward).map(([k, v]) => {
    const [ic, col] = M.REWARD_ICON[k] || ['star', '#ffd23a'];
    return `<span class="rw"><img class="px" data-icon="${ic}" data-color="${col}" alt="">×${v.toLocaleString()}</span>`;
  }).join('');
}

function presentModal() {
  sfx('click');
  const d = data();
  const rows = d.presents.map((p) => `<div class="prow">
      <img class="px pic" data-icon="${p.from === 'login' ? 'calendar' : p.from === 'gift' ? 'gift' : p.from === 'mission' ? 'scroll' : 'star'}" data-color="${p.from === 'login' ? '#7ac8ff' : p.from === 'mission' ? '#e8d8a8' : '#ff6a8a'}" alt="">
      <div class="pinfo"><div>${esc(p.title)}</div><div class="prw">${rewardHTML(p.reward)}</div><div class="pdate">${formatDate(p.at)}</div></div>
      <button class="btn small teal" data-claim="${p.id}">受け取る</button>
    </div>`).join('');
  modal({
    title: 'プレゼントボックス',
    body: d.presents.length ? `<div class="plist reveal">${rows}</div>` : '<p class="muted" style="text-align:center">プレゼントはありません</p>',
    buttons: d.presents.length ? [{ label: '閉じる', value: null }, { label: '一括受け取り', value: 'all', cls: 'red' }] : [{ label: '閉じる', value: null }],
    onMount: (ov, close) => {
      hydrate(ov);
      ov.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = M.claimPresent(b.dataset.claim);
        if (p) { sfx('coin'); toast(`${M.rewardText(p.reward)} を受け取りました`); }
        close(); presentModal();
      }));
    },
  }).then((v) => {
    if (v === 'all') {
      const r = M.claimAllPresents();
      sfx('coin');
      toast(`${r.n}件・${M.rewardText(r.total)} を受け取りました`);
      render();
    } else render();
  });
}

let missionTab = 'daily';
function missionModal() {
  sfx('click');
  const list = M.missionList(missionTab);
  const tabs = { daily: 'デイリー', weekly: 'ウィークリー', perm: '常時' };
  const counts = Object.fromEntries(Object.keys(tabs).map((k) => [k, M.missionList(k).filter((x) => x.done && !x.claimed).length]));
  const rows = list.map((m) => `<div class="mrow ${m.claimed ? 'claimed' : ''}">
      <div class="minfo">
        <div class="mname">${m.name}</div>
        <div class="mbar"><div style="width:${(m.p / m.goal) * 100}%"></div><span>${m.unit === 'min' ? `${Math.floor(m.p / 60)}分 / ${m.goal / 60}分` : `${m.p.toLocaleString()} / ${m.goal.toLocaleString()}`}</span></div>
        <div class="prw">${rewardHTML(m.reward)}</div>
      </div>
      ${m.claimed ? '<span class="mdone">受取済</span>' : `<button class="btn small ${m.done ? 'red' : ''}" data-mclaim="${m.id}" ${m.done ? '' : 'disabled'}>${m.done ? '受け取る' : '未達成'}</button>`}
    </div>`).join('');
  modal({
    title: 'ミッション',
    body: `<div class="mtabs">${Object.entries(tabs).map(([k, v]) => `<button class="btn small ${k === missionTab ? 'active' : ''}" data-mtab="${k}">${v}${counts[k] ? `<i class="hbadge">${counts[k]}</i>` : ''}</button>`).join('')}</div>
      <div class="muted" style="text-align:right;margin:4px 0">${missionTab === 'perm' ? '一度だけ受け取れる実績ミッション' : `更新まで あと${M.untilReset(missionTab)}<br><small>受け取り忘れは、更新のあとプレゼントボックスに届きます</small>`}</div>
      <div class="mlist reveal">${rows || '<p class="muted" style="text-align:center">すべて達成しました！</p>'}</div>`,
    buttons: [{ label: '閉じる', value: null }, { label: '一括受け取り', value: 'all', cls: 'red' }],
    onMount: (ov, close) => {
      hydrate(ov);
      const allBtn = [...ov.querySelectorAll('.mbtns .btn')].pop();
      if (!counts[missionTab]) allBtn.disabled = true;
      ov.querySelectorAll('[data-mtab]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); missionTab = b.dataset.mtab; close(); missionModal(); }));
      ov.querySelectorAll('[data-mclaim]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = M.claimMission(missionTab, b.dataset.mclaim);
        if (m) { sfx('coin'); toast(`${M.rewardText(m.reward)} を受け取りました`); }
        close(); missionModal();
      }));
    },
  }).then((v) => {
    if (v === 'all') {
      const r = M.claimAllMissions(missionTab);
      if (r.n) { sfx('coin'); toast(`${r.n}件・${M.rewardText(r.total)} を受け取りました`); }
      missionModal();
    } else render();
  });
}

/** ログインボーナスのカレンダー。justIdx が数値なら今日受け取った演出つき */
function loginModal(justIdx) {
  const d = data();
  const got = ((d.login.count - 1) % M.LOGIN_CYCLE.length + M.LOGIN_CYCLE.length) % M.LOGIN_CYCLE.length; // 今日の位置
  const cells = M.LOGIN_CYCLE.map((r, i) => `<div class="lcell ${i <= got && d.login.count ? 'got' : ''} ${i === justIdx ? 'today' : ''}">
      <div class="lday">${i + 1}日目</div>
      <div class="prw">${rewardHTML(r)}</div>
      ${i <= got && d.login.count ? '<div class="lstamp ol">済</div>' : ''}
    </div>`).join('');
  return modal({
    title: 'ログインボーナス',
    sound: 'panel',
    body: `<div class="lgrid">${cells}</div>
      <p style="text-align:center;margin:10px 0 0">${justIdx !== null && justIdx !== undefined ? `<b>${justIdx + 1}日目のボーナス</b>をプレゼントボックスに送りました！` : '毎日0時に更新されます'}</p>
      <p class="muted" style="text-align:center;margin:2px 0 0">累計ログイン ${d.login.total}日</p>`,
    buttons: justIdx !== null && justIdx !== undefined ? [{ label: 'あとで', value: null }, { label: 'プレゼントを受け取る', value: 'open', cls: 'red' }] : [{ label: '閉じる', value: null }],
    onMount: hydrate,
  }).then((v) => { if (v === 'open') presentModal(); });
}

// ----- 設定 -----
function settingsHTML() {
  const d = data();
  let account;
  if (!cloud.enabled) account = '<p class="muted">クラウドセーブは準備中です。端末内セーブとファイルでのバックアップは使えます。</p>';
  else if (!cloud.ready) account = `<p class="muted">${cloud.error || 'クラウドに接続中…'}</p>`;
  else if (!cloud.user) {
    account = `<p class="muted">Googleでログインすると、数分ごとに自動でクラウドにバックアップされ、別の端末でも続きから遊べます。</p>
      <button class="btn teal block" data-act="login">Googleでログイン</button>`;
  } else {
    const statusText = { idle: '待機中', syncing: '同期中…', ok: 'バックアップ済み', error: 'エラー：' + esc(cloud.error), offline: 'オフライン' }[cloud.status];
    account = `<div class="account">
        ${cloud.user.photo ? `<img src="${esc(cloud.user.photo)}" alt="" referrerpolicy="no-referrer">` : ''}
        <div><div>${esc(cloud.user.name)}</div><div class="muted">${statusText}${cloud.lastSync ? '（' + formatDate(cloud.lastSync) + '）' : ''}</div></div>
      </div>
      <div class="btn-grid">
        <button class="btn small teal" data-act="backup-now">今すぐバックアップ</button>
        <button class="btn small" data-act="cloud-restore">クラウドから復元</button>
      </div>
      <p class="muted">自動バックアップ：10分ごと（ほかにアプリを閉じた時・ステージ終了時にも保存）</p>
      <button class="btn small dark" data-act="logout">ログアウト</button>`;
  }
  const s = summary(store.save);
  const notifyNote = isIOS() && !isStandalone() ? 'iPhone/iPadは「ホーム画面に追加」したアプリから開くと通知を受け取れます'
    : !cloud.enabled ? 'クラウド機能の準備ができると使えます' : 'アップデートやイベントのお知らせを端末に通知します';
  return `
  <div class="panel"><h3>アカウント・クラウドセーブ</h3>${account}</div>
  <div class="panel">
    <h3>端末バックアップ（ファイル）</h3>
    <p class="muted">セーブデータをファイルに保存して、機種変更や万一のときに読み込めます。</p>
    <div class="btn-grid">
      <button class="btn small teal" data-act="export">ファイルに書き出す</button>
      <button class="btn small" data-act="import">読み込む</button>
      <button class="btn small" data-act="export-text">テキストで表示</button>
      <button class="btn small" data-act="undo-prev" ${hasPrevBackup() ? '' : 'disabled'}>1つ前に戻す</button>
    </div>
    <p class="muted" style="margin-bottom:0">プレイ時間 ${formatPlayTime(s.playTime)} ／ 最終保存 ${formatDate(s.updatedAt)}</p>
  </div>
  <div class="panel">
    <h3>通知・サウンド</h3>
    <div class="set-row"><div class="lbl">更新のお知らせ通知<small>${notifyNote}</small></div><button class="toggle ${d.settings.notify ? 'on' : ''}" data-act="toggle-notify" aria-label="通知"></button></div>
    ${volHTML()}
    <p class="muted" style="margin:2px 0 0">バーを0にすると消音になります</p>
    <div class="set-row"><div class="lbl">オフライン用の保存<small>BGM・効果音を端末に保存／削除</small></div><button class="btn small" data-act="offline">管理する</button></div>
  </div>
  <div class="panel code-panel">
    <h3>シークレットコード</h3>
    <p class="muted">お知らせやイベントで配られたコードを入力すると、アイテムがもらえます。</p>
    <button class="btn gold block code-open" data-act="secret-code"><img class="px" data-icon="gift" data-color="#ff6a8a" alt="">コードを入力する</button>
    <div class="pid-row"><span class="pid-l">ユーザーID</span><b class="pid">${esc(d.playerId)}</b><button class="btn small" data-act="copy-id">コピー</button></div>
    <p class="muted" style="margin:4px 0 0">お問い合わせのときはこのIDを伝えてください。運営からのプレゼントもこのIDに届きます。</p>
  </div>
  <div class="panel">
    <h3>アプリ</h3>
    <div class="set-row"><div class="lbl">バージョン v${APP_VERSION}${pendingUpdate ? '<small style="color:#ff9ab0">新しいバージョンがあります</small>' : ''}</div>
      <button class="btn small ${pendingUpdate ? 'red' : ''}" data-act="check-update">${pendingUpdate ? '更新する' : '更新を確認'}</button></div>
    <div class="set-row"><div class="lbl">更新履歴</div><button class="btn small" data-act="news">見る</button></div>
    ${!isStandalone() ? '<div class="set-row"><div class="lbl">ホーム画面に追加<small>アプリのように全画面で遊べます</small></div><button class="btn small" data-act="install">追加</button></div>' : ''}
  </div>
  <div class="panel">
    <h3>データとプライバシー</h3>
    <div class="muted" style="line-height:1.8">
      ・クラウドに保存するのは<b>ゲームの進み具合だけ</b>です（メールアドレスやGoogleの名前・写真は保存しません）<br>
      ・あなたのセーブはあなた本人しか読み書きできません<br>
      ・通知をオンにした場合だけ、通知を届けるための番号を保存します（オフにすると削除）<br>
      ・このゲームがパスワードや個人情報を聞くことはありません。ログインはGoogleの画面でだけ行います
    </div>
  </div>
  <div class="panel">
    <h3>クレジット</h3>
    <div class="muted" style="line-height:1.9">音楽：魔王魂 ／ なぐもりずの音楽室 ／ MusMus ／ マツヤマ マキ ／ Tak_mfk<br>効果音：効果音ラボ ／ OtoLogic ／ Springin</div>
  </div>
  <div class="panel"><h3>データ</h3><button class="btn small dark" data-act="reset">セーブデータを削除して最初から</button></div>
  <p class="muted" style="text-align:center">v${APP_VERSION}</p>`;
}

// ===================== 操作 =====================
function bindGlobal() {
  // 最初のタッチで音を有効化（iPhoneは操作しないと音が出ない）
  // iPhoneは「指を離したとき」が音を出してよい合図なので、touchend でも音の準備をする
  const unlock = () => initAudio();
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('touchend', unlock, { passive: true });
  document.addEventListener('click', unlock, { passive: true, capture: true });
  // 音量バー
  document.addEventListener('input', (e) => {
    const r = e.target.closest('input[data-vol]');
    if (!r) return;
    const v = +r.value, k = r.dataset.vol;
    setVolume({ [k]: v });
    const lbl = r.parentElement.querySelector('.vv');
    if (lbl) lbl.textContent = v;
    if (k === 'se') sfx('coin');
  });
  document.addEventListener('change', (e) => {
    const r = e.target.closest('input[data-vol]');
    if (r) { data().settings[r.dataset.vol === 'bgm' ? 'bgmVol' : 'seVol'] = +r.value; commit(); }
  });
  // ボタン音：どの画面でも、押せるボタンを押したら鳴らす
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, [role="button"]');
    if (b && !b.disabled) sfx('click');
  }, true);
  document.addEventListener('click', (e) => {
    initAudio();
    const t = e.target.closest('[data-tab]');
    if (t && !inBattle) {
      sfx('click');
      tab = t.dataset.tab;
      render();
      $('#tab-content').scrollTop = 0;
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a && !a.disabled && !a.closest('.modal')) onAction(a.dataset.act, a);
  });

  const map = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  window.addEventListener('keydown', (e) => {
    if (!inBattle || !game) return;
    if (map[e.key]) { game.keys.add(map[e.key]); e.preventDefault(); hideHint(); }
    if (e.key === 'Escape' || e.key === 'p') openPause();
  });
  window.addEventListener('keyup', (e) => { if (game && map[e.key]) game.keys.delete(map[e.key]); });
  window.addEventListener('blur', () => game && game.keys.clear());

  const bt = $('#battle');
  const joy = $('#joy'), knob = $('#joy-knob');
  let pid = null, ox = 0, oy = 0;
  bt.addEventListener('pointerdown', (e) => {
    if (!game || e.target.closest('button') || e.target.closest('#levelup')) return;
    initAudio();
    pid = e.pointerId; [ox, oy] = toApp(e.clientX, e.clientY);
    joy.style.left = ox + 'px'; joy.style.top = oy + 'px';
    joy.classList.remove('hidden');
    knob.style.transform = '';
    game.joy.active = true; game.joy.dx = 0; game.joy.dy = 0;
    hideHint();
  });
  bt.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || !game) return;
    const [px, py] = toApp(e.clientX, e.clientY);
    let dx = px - ox, dy = py - oy;
    const l = Math.hypot(dx, dy), R = 40;
    if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    game.joy.dx = dx / R; game.joy.dy = dy / R;
  });
  const up = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    joy.classList.add('hidden');
    if (game) game.joy.active = false;
  };
  bt.addEventListener('pointerup', up);
  bt.addEventListener('pointercancel', up);
  $('#hud-pause').addEventListener('click', () => openPause());
  window.addEventListener('resize', () => game && game.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && inBattle && game && !game.paused) openPause();
  });
}

async function onAction(act, el) {
  const d = data();
  switch (act) {
    case 'start': if (!isLocked(d.selectedStage)) { sfx('start'); startBattle(); } break;
    case 'stage-prev': case 'stage-next': {
      const w = D.stageInfo(d.selectedStage).w + (act === 'stage-next' ? 1 : -1);
      if (w < 1 || w > D.BIOMES.length) break;
      d.selectedStage = worldEntry(d, w);
      stageSlide = act === 'stage-next' ? 'r' : 'l';
      if (lvDrawerOpen) lvDrawerAnim = 'world';
      sfx('click'); commit(); stageSlide = '';
      break;
    }
    case 'toggle-levels': toggleLevelDrawer(el); break;
    case 'pick-level': {
      const s = +el.dataset.n;
      if (!D.stageOpen(d, s)) {
        sfx('error');
        el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
        toast(unlockHint(s));
        break;
      }
      if (s === d.selectedStage) break;
      d.selectedStage = s; lvDrawerAnim = 'pick'; sfx('click'); commit();
      break;
    }
    case 'stage-list': stageListModal(); break;
    case 'secret-code': secretCodeModal(); break;
    case 'copy-id': copyPlayerId(); break;
    case 'gacha-rates': gachaRatesModal(); break;
    case 'party-tab': partyTab = el.dataset.t; sfx('click'); render(); break;
    case 'inv-filter': invFilter = el.dataset.f; sfx('click'); render(); break;
    case 'view-char': viewChar = el.dataset.id; sfx('click'); render(); break;
    case 'select-char': d.selectedChar = el.dataset.id; sfx('coin'); commit(); toast(`${D.CHARACTERS[el.dataset.id].name}で出撃します`); break;
    case 'ability': {
      const c = D.CHARACTERS[el.dataset.id];
      const W = D.SKILLS[c.weapon];
      if (el.dataset.k === 'w') modal({ title: W.name, body: `<p>固有武器：${W.desc}</p><p class="muted">ステージ開始時から持っていて、レベルアップで強化できます。</p>` });
      else modal({ title: c.trait.name, body: `<p>固有能力：${c.trait.desc}</p><p class="muted">このキャラで出撃すると常に効果があります。</p>` });
      break;
    }
    case 'char-up': {
      const id = el.dataset.id;
      const cs = d.chars[id];
      if (cs.level >= D.CHAR_MAX_LV) break;
      const statsAt = (lv) => { const keep = cs.level; cs.level = lv; const st = D.charStats(d, id); cs.level = keep; return { atk: st.atk, hp: st.hp }; };
      bulkUpgradeModal({ title: D.CHARACTERS[id].name, cur: cs.level, max: D.CHAR_MAX_LV, costAt: D.charUpgradeCost, statsAt })
        .then((to) => { if (to) applyUpgrade(cs, cs.level, to, D.charUpgradeCost); });
      break;
    }
    case 'goto-gacha': gachaType = 'char'; if (el.dataset.bid) charBanner = el.dataset.bid; tab = 'gacha'; sfx('click'); render(); break;
    case 'buy-char': buyCharModal(el.dataset.id); break;
    case 'gacha-type': gachaType = el.dataset.t; sfx('click'); render(); break;
    case 'gcar-move': gcarGo(D.CHAR_BANNERS.findIndex((b) => b.id === charBanner) + +el.dataset.d); break;
    case 'gcar-go': gcarGo(+el.dataset.i); break;
    case 'present': presentModal(); break;
    case 'profile': profileModal(); break;
    case 'missions': missionModal(); break;
    case 'login-bonus': loginModal(null); break;
    case 'item': sfx('click'); itemModal(+el.dataset.uid); break;
    case 'slot': {
      sfx('click');
      const uid = d.equip[el.dataset.slot];
      if (uid != null && d.items.find((i) => i.uid === uid)) itemModal(uid, el.dataset.slot);
      else slotModal(el.dataset.slot);
      break;
    }
    case 'auto-equip': autoEquip(); break;
    case 'presets': sfx('click'); presetModal(); break;
    case 'sell-n': {
      const list = d.items.filter((it) => it.rarity === 'N' && !equippedSlot(it.uid));
      if (!list.length) { toast('売却できるN装備がありません'); break; }
      const total = list.reduce((a, it) => a + D.salvageValue(it), 0);
      if (await confirmBox('まとめて売却', `装備していないN装備 ${list.length}個を ${total} ゴールドで売却しますか？`, '売却する', 'red')) {
        const ids = new Set(list.map((i) => i.uid));
        d.items = d.items.filter((i) => !ids.has(i.uid));
        d.gold += total;
        sfx('coin'); commit();
      }
      break;
    }
    case 'gacha': doGacha(+el.dataset.n, el.dataset.by); break;
    case 'news': showChangelog(); break;
    case 'enemy-book': sfx('click'); enemyBook(); break;
    case 'install': installApp(); break;
    case 'login':
      try { await signIn(); } catch (e) { toast('ログインできませんでした：' + (e.code || e.message)); }
      break;
    case 'logout':
      if (await confirmBox('ログアウト', 'ログアウトしても端末内のセーブは残ります。', 'ログアウト', 'red')) { await signOut(); toast('ログアウトしました'); }
      break;
    case 'backup-now': {
      const ok = await upload(true);
      toast(ok ? 'クラウドにバックアップしました' : cloud.status === 'ok' ? 'ほかの端末のデータと同期しました' : 'バックアップに失敗しました' + (cloud.error ? '：' + cloud.error : ''));
      break;
    }
    case 'cloud-restore': {
      const remote = await restoreFromCloud().catch(() => null);
      if (!remote) { toast('クラウドにセーブがありません'); break; }
      if (await confirmCompare('クラウドから復元', remote, '今の端末のデータはクラウドのデータで上書きされます。')) { replaceSave(remote, true); toast('クラウドから復元しました'); }
      break;
    }
    case 'export': { const r = exportFile(); toast('書き出しました：' + r.name); break; }
    case 'export-text':
      await modal({
        title: 'セーブデータ（テキスト）',
        body: `<p class="muted">全部コピーしてメモ帳などに保存できます。読み込むときは「読み込む」で貼り付けてください。</p><textarea readonly>${esc(JSON.stringify(store.save))}</textarea>`,
        buttons: [{ label: 'コピー', cls: 'teal', keep: true, onClick: async (ov) => {
          const ta = ov.querySelector('textarea');
          try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand('copy'); }
          toast('コピーしました');
        } }, { label: '閉じる', value: null }],
      });
      break;
    case 'import': importFlow(); break;
    case 'undo-prev':
      if (await confirmBox('1つ前に戻す', '直前の読み込み・復元・削除の前の状態に戻します。', '戻す') && restorePrev()) toast('元に戻しました');
      break;
    case 'toggle-enemy-help': d.settings.enemyHelp = !d.settings.enemyHelp; sfx('click'); commit(); toast(d.settings.enemyHelp ? '初めての敵の説明：オン' : '初めての敵の説明：オフ（図鑑からいつでも見られます）'); break;
    case 'toggle-notify':
      if (d.settings.notify) { await disablePush(d.playerId).catch(() => {}); d.settings.notify = false; commit(); toast('通知をオフにしました'); }
      else {
        try { await enablePush(pwa.reg, d.playerId); d.settings.notify = true; d.settings.notifyAsked = true; commit(); toast('通知をオンにしました'); } catch (e) { toast(e.message); }
      }
      break;
    case 'offline': sfx('click'); offlineModal(); break;
    case 'check-update':
      if (pendingUpdate) { showUpdatePopup(); break; }
      if (pwa.reg) {
        toast('確認中…');
        await pwa.reg.update().catch(() => {});
        setTimeout(() => { if (!pendingUpdate) toast(`最新版です（v${APP_VERSION}）`); }, 2500);
      } else toast(`v${APP_VERSION}`);
      break;
    case 'reset':
      if (await confirmBox('データ削除', 'すべてのデータを削除して最初からはじめますか？<br><span class="muted">（直前の状態は「1つ前に戻す」で復旧できます）</span>', '削除する', 'red')
        && await confirmBox('最終確認', '本当に削除しますか？', '削除する', 'red')) {
        resetAll(); tab = 'home'; render(); toast('データを削除しました');
      }
      break;
  }
}

// ===================== バックアップ関連のダイアログ =====================
function compareHTML(remote, leftTitle = '今の端末', rightTitle = '読み込むデータ') {
  const a = summary(store.save), b = summary(remote);
  const col = (s, t) => `<div><h4>${t}</h4>クリア：STAGE ${s.stage}<br>キャラLv合計：${s.charLv}<br>ゴールド：${s.gold.toLocaleString()}<br>装備：${s.items}個<br>プレイ：${formatPlayTime(s.playTime)}<br><span class="muted">${formatDate(s.updatedAt)}</span></div>`;
  return `<div class="compare">${col(a, leftTitle)}${col(b, rightTitle)}</div>`;
}
function confirmCompare(title, remote, note) {
  return confirmBox(title, `${compareHTML(remote)}<p class="muted">${note}</p>`, '上書きする', 'red');
}
async function askConflict(local, remote) {
  return modal({
    title: 'どちらのデータを使いますか？',
    body: `<p class="muted" style="margin-top:0">この端末とクラウドで別々に進んだデータがあります。</p>${compareHTML(remote, 'この端末', 'クラウド')}<p class="muted">選ばなかったほうは「1つ前に戻す」で1回だけ戻せます。</p>`,
    dismiss: false,
    buttons: [{ label: 'この端末', value: 'local', cls: 'teal' }, { label: 'クラウド', value: 'remote', cls: 'red' }],
  });
}
function importFlow() {
  modal({
    title: 'セーブデータを読み込む',
    body: `<button class="btn teal block" id="imp-file">ファイルを選ぶ</button>
      <input type="file" accept=".json,application/json,text/plain" id="imp-input" class="hidden">
      <p class="muted">または、テキストを貼り付け：</p><textarea id="imp-text" placeholder='{"schemaVersion":2,...}'></textarea>`,
    buttons: [{ label: 'キャンセル', value: null }, { label: '貼り付けで読み込む', cls: 'red', keep: true, onClick: (ov) => tryImport(ov.querySelector('#imp-text').value, ov) }],
    onMount: (ov) => {
      const input = ov.querySelector('#imp-input');
      ov.querySelector('#imp-file').onclick = () => input.click();
      input.onchange = async () => { const f = input.files[0]; if (f) tryImport(await f.text(), ov); };
    },
  });
}
async function tryImport(text, ov) {
  const r = parseImportText(text.trim());
  if (!r.ok) { toast(r.error); return; }
  ov.remove();
  const note = (r.tampered ? '<span style="color:#c4103c">※ファイルが手動で編集された可能性があります。</span><br>' : '') + '今のデータは上書きされます（1つ前に戻すことはできます）。';
  if (await confirmCompare('このデータを読み込みますか？', r.save, note)) { replaceSave(r.save, false); toast('読み込みました'); autoBackup(true); }
}
async function installApp() {
  if (pwa.installPrompt) { pwa.installPrompt.prompt(); await pwa.installPrompt.userChoice.catch(() => {}); pwa.installPrompt = null; return; }
  const body = isIOS()
    ? 'Safariの下にある<b>共有ボタン</b>（□に↑）→<b>「ホーム画面に追加」</b>を選んでください。<br><br>ホーム画面から開くと全画面で遊べて、通知も受け取れるようになります。'
    : 'ブラウザのメニュー（︙）から<b>「アプリをインストール」</b>または<b>「ホーム画面に追加」</b>を選んでください。';
  modal({ title: 'ホーム画面に追加', body });
}

// ===================== 更新・お知らせ =====================
function logHTML(entries) {
  if (!entries.length) return '<p class="muted">更新履歴はまだありません。</p>';
  return entries.map((e) => `<div class="log-entry">
    <div><span class="ver">${e.version ? 'v' + esc(e.version) : 'お知らせ'}</span><span class="date">${esc(e.date || '')}</span></div>
    ${e.title ? `<div>${esc(e.title)}</div>` : ''}
    ${e.items?.length ? `<ul>${e.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
  </div>`).join('');
}
async function showChangelog() {
  sfx('click');
  const entries = await fetchChangelog();
  if (entries[0]) { data().seenNews = entries[0].id; commit(); }
  // 一覧（主な更新・バージョン・日付）→ 押すとその場で詳細が開く
  const rows = entries.map((e, i) => `<div class="log-item">
      <button class="log-row" data-log="${i}" aria-expanded="false">
        <span class="log-ver">${e.version ? 'v' + esc(e.version) : 'お知らせ'}</span>
        <span class="log-title">${esc(e.title || '更新')}</span>
        <span class="log-date">${esc(e.date || '')}</span>
        <i class="log-chev">›</i>
      </button>
      <div class="log-detail" hidden>${e.items?.length ? `<ul>${e.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">詳しい内容はありません</p>'}</div>
    </div>`).join('');
  modal({
    title: 'お知らせ・更新履歴',
    sound: 'panel',
    body: entries.length ? `<div class="log-list reveal">${rows}</div>` : '<p class="muted">更新履歴はまだありません。</p>',
    buttons: [{ label: '閉じる', value: null }],
    onMount: (ov) => {
      ov.querySelectorAll('[data-log]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = b.getAttribute('aria-expanded') === 'true';
        b.setAttribute('aria-expanded', String(!open));
        b.nextElementSibling.hidden = open;
        sfx('click');
      }));
    },
  });
}
function showNewsIfUnread() {
  const d = data();
  const latest = pwa.changelog[0];
  if (!latest || latest.id === d.seenNews) return;
  if (d.stats.runs === 0 && !d.seenNews) { d.seenNews = latest.id; commit(); return; }
  if (pendingUpdate || inBattle) return;
  d.seenNews = latest.id;
  commit();
  modal({ title: 'お知らせ', sound: 'panel', body: logHTML([latest]), buttons: [{ label: '履歴を全部見る', value: 'all' }, { label: 'OK', value: null, cls: 'teal' }] })
    .then((v) => { if (v === 'all') showChangelog(); });
}
function onUpdateReady(info) {
  pendingUpdate = info;
  if (!inBattle && !titleOpen) { render(); showUpdatePopup(); }
}
async function showUpdatePopup() {
  if (!pendingUpdate) return;
  const v = await modal({
    title: 'アップデートがあります',
    sound: 'panel',
    body: `<p style="margin-top:0">新しいバージョンが配信されました。セーブデータはそのまま引き継がれます。</p>${logHTML(pendingUpdate.entries.slice(0, 3))}`,
    buttons: [{ label: 'あとで', value: false }, { label: '今すぐ更新', value: true, cls: 'red' }],
  });
  if (v) { toast('更新しています…'); await autoBackup(true).catch(() => {}); applyUpdate(); }
}

// ===================== ロード画面（キャラが走る） =====================
let loadAnim = null;
function showLoading(text = 'Now Loading...') {
  const el = $('#loading');
  el.classList.remove('hidden');
  $('#load-text').textContent = text;
  $('#load-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  const cv = $('#load-cv');
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const ids = Object.keys(D.CHARACTERS);
  let cid = 'neo';
  try { cid = store.save ? data().selectedChar : ids[Math.floor(Math.random() * ids.length)]; } catch {}
  const def = D.CHARACTERS[cid];
  const dust = [];
  let t0 = performance.now();
  cancelAnimationFrame(loadAnim);
  const tick = (now) => {
    const t = (now - t0) / 1000;
    g.clearRect(0, 0, cv.width, cv.height);
    // 地面
    g.fillStyle = '#5a4428'; g.fillRect(0, 33, 64, 1);
    for (let i = 0; i < 6; i++) { const x = Math.floor((i * 14 - t * 40) % 84 + 84) % 84 - 10; g.fillStyle = '#4a3820'; g.fillRect(x, 35, 4, 1); }
    const f = Math.floor(t * 9) % 2 ? 'walk1' : 'walk2';
    const s = charSprite(def, f);
    const bob = Math.floor(t * 9) % 2 ? -1 : 0;
    if (Math.random() < 0.3) dust.push({ x: 26, y: 32, vx: -20 - Math.random() * 20, life: 0.5 });
    for (const d of dust) { d.x += d.vx / 60; d.life -= 1 / 60; }
    for (const d of dust) if (d.life > 0) { g.fillStyle = `rgba(230,210,170,${d.life * 1.5})`; g.fillRect(Math.round(d.x), Math.round(d.y - (0.5 - d.life) * 6), 2, 2); }
    while (dust.length && dust[0].life <= 0) dust.shift();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(25, 33, 14, 2);
    g.drawImage(s, 32 - Math.round(s.width / 2), 34 - s.height + bob);
    const dots = '.'.repeat(1 + (Math.floor(t * 3) % 3));
    $('#load-text').textContent = text.replace(/\.+$/, '') + dots;
    loadAnim = requestAnimationFrame(tick);
  };
  loadAnim = requestAnimationFrame(tick);
}
function hideLoading() {
  cancelAnimationFrame(loadAnim);
  $('#loading').classList.add('hidden');
}

// ===================== 戦闘 =====================
const fmtTime = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const hud = {
  cache: {},
  els: null,
  set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } },
  update(v) {
    if (!this.els) this.els = { exp: $('#hud-exp'), lv: $('#hud-lv'), time: $('#hud-time'), gold: $('#hud-gold'), score: $('#hud-score'), room: $('#hud-room'), roomFill: $('#hud-room-fill'), boss: $('#hud-boss') };
    const e = this.els;
    this.set('exp', Math.floor((v.exp / v.need) * 100), (x) => { e.exp.style.width = x + '%'; });
    this.set('lv', v.level, (x) => { e.lv.textContent = x; });
    this.set('time', fmtTime(v.time), (x) => { e.time.textContent = x; });
    this.set('gold', v.gold, (x) => { e.gold.textContent = x.toLocaleString(); });
    this.set('score', v.score, (x) => { e.score.textContent = x.toLocaleString(); });
    this.set('room', v.room === v.rooms ? 'BOSS ROOM' : `ROOM ${v.room}/${v.rooms}${v.gateOpen ? ' ゲート開放！' : ''}`, (x) => { e.room.textContent = x; });
    this.set('rf', Math.round(v.progress * 100) + (v.gateOpen ? 'o' : ''), () => {
      e.roomFill.style.width = v.progress * 100 + '%';
      e.roomFill.parentElement.classList.toggle('open', v.gateOpen);
    });
    this.set('bossName', v.bossName || '', (x) => { e.boss.querySelector('span').textContent = x || 'BOSS'; });
    this.set('boss', v.boss === null ? -1 : Math.ceil(v.boss * 100), (x) => {
      e.boss.classList.toggle('hidden', x < 0);
      if (x >= 0) e.boss.querySelector('.fill').style.width = x + '%';
    });
  },
  banner(text) {
    const b = $('#hud-banner');
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  },
};
function hideHint() { $('#hud-hint').classList.add('hidden'); }

async function startBattle() {
  const d = data();
  const cid = d.selectedChar;
  const info = D.stageInfo(d.selectedStage);
  closeAllModals();
  showLoading(`${info.name} ${info.biome.name}へ…`);
  stopBgm();
  await new Promise((r) => setTimeout(r, 50));
  $('#menu').classList.add('hidden');
  $('#battle').classList.remove('hidden');
  $('#hud-hint').classList.remove('hidden');
  $('#levelup').classList.add('hidden');
  hud.cache = {};
  inBattle = true;
  game = new Game($('#game'), {
    stage: info, char: D.CHARACTERS[cid], stats: D.charStats(d, cid),
    hud, onLevelUp: showLevelUp, onEnd: endBattle,
    // 初めて出会った敵の説明（モブは行動パターンごと、ボスは1体ごとに1回だけ）
    needHelp: (kind, key) => data().settings.enemyHelp && !seen()[kind === 'boss' ? 'hb' : 'p'].includes(key),
    onSeen: (kind, id) => { const list = seen()[kind === 'boss' ? 'b' : 'm']; if (!list.includes(id)) { list.push(id); commit(); } },
    onHelp: (h, done) => {
      const s = seen();
      if (h.kind === 'boss') s.hb.push(h.id); else s.p.push(h.pattern);
      commit();
      enemyHelpModal(h).then(done);
    },
  });
  hydrate($('#battle'));
  await new Promise((r) => setTimeout(r, 700));
  hideLoading();
  game.start();
  playBgm(bgmForBiome(info.biome.id), info.biome.bgm || 'battle_grass');
  hud.banner(`ROOM 1 / ${D.ROOMS_PER_STAGE}`);
}

/** スロット式スキル選択 */
function showLevelUp(choices, done) {
  const g = game;
  const wrap = $('#levelup');
  const cards = $('#lv-cards');
  const pool = Game.reelPool();
  const iconURL = (name, color) => toURL(icon(name, color), 5, `i:${name}${color}`);
  cards.innerHTML = choices.map((c, i) => {
    const strip = [];
    for (let k = 0; k < 10 + i * 4; k++) { const p = pool[Math.floor(Math.random() * pool.length)]; strip.push(iconURL(p.icon, p.color)); }
    strip.push(iconURL(c.icon, c.color));
    const badge = c.kind === 's' ? '<span class="lv-badge sp">SPECIAL</span>'
      : c.lv === 1 ? '<span class="lv-badge new">NEW</span>' : `<span class="lv-badge">Lv${c.lv}${c.lv >= c.max ? ' MAX' : ''}</span>`;
    return `<button class="lv-card pre" data-pick="${i}">
      <div class="reel-frame ${c.kind}"><div class="reel"><div class="strip">${strip.map((u) => `<img src="${u}" alt="">`).join('')}</div></div></div>
      <div class="lv-text spin"><div class="lv-name ol">？？？</div><div class="sep"></div><div class="lv-desc">スロット回転中…</div></div>
      ${badge}
    </button>`;
  }).join('');
  $('#lv-build').innerHTML = [
    ...g.actives.map((a) => `<span><img class="px" src="${iconURL(D.SKILLS[a.id].icon, D.SKILLS[a.id].color)}" alt="">${a.lv}</span>`),
    ...Object.entries(g.passives).map(([id, lv]) => `<span><img class="px" src="${iconURL(D.SKILLS[id].icon, D.SKILLS[id].color)}" alt="">${lv}</span>`),
  ].join('');
  // レベルアップの音のあと、少し間をおいてスキル選択画面を出す（音が重ならないように）
  const SHOW_DELAY = 380;
  wrap.classList.remove('hidden');
  wrap.classList.add('lv-wait');
  setTimeout(() => { wrap.classList.remove('lv-wait'); sfx('skillShow'); }, SHOW_DELAY);
  [...cards.children].forEach((card, i) => setTimeout(() => card.classList.remove('pre'), SHOW_DELAY + 40 + i * 70));
  let stopped = 0, finished = false;
  const timers = [];
  const reveal = (i) => {
    const card = cards.children[i];
    if (!card || card.classList.contains('ready')) return;
    const strip = card.querySelector('.strip');
    const n = strip.children.length;
    strip.style.transition = 'none';
    strip.style.transform = `translateY(-${(n - 1) / n * 100}%)`;
    const c = choices[i];
    const tx = card.querySelector('.lv-text');
    tx.classList.remove('spin');
    tx.querySelector('.lv-name').textContent = c.name;
    tx.querySelector('.lv-desc').textContent = c.desc;
    card.classList.add('ready');
    sfx(c.kind === 's' ? 'rare' : 'reelStop');
    stopped++;
  };
  // 回転させる（ブラウザの描画後に開始）
  let tickN = 0, ticker = 0;
  timers.push(setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    if (finished) return;
    [...cards.children].forEach((card, i) => {
      const strip = card.querySelector('.strip');
      const n = strip.children.length;
      const dur = 0.6 + i * 0.35;
      strip.style.transition = `transform ${dur}s cubic-bezier(.15,.7,.25,1)`;
      strip.style.transform = `translateY(-${(n - 1) / n * 100}%)`;
      timers.push(setTimeout(() => reveal(i), dur * 1000));
    });
    ticker = setInterval(() => { if (stopped >= 3 || tickN++ > 20) clearInterval(ticker); else sfx('reel'); }, 70);
  })), SHOW_DELAY));
  const onClick = (e) => {
    const card = e.target.closest('.lv-card');
    if (!card || finished) return;
    if (stopped < 3) { for (let i = 0; i < 3; i++) reveal(i); timers.forEach(clearTimeout); return; }
    finished = true;
    clearInterval(ticker);
    cards.removeEventListener('click', onClick);
    sfx('click');
    wrap.classList.add('hidden');
    done(choices[+card.dataset.pick]);
  };
  cards.addEventListener('click', onClick);
}

/** 音量バー（設定画面とポーズ画面で共通） */
function volHTML() {
  const st = data().settings;
  return `<div class="vol-row"><span class="vl">BGM</span><input type="range" min="0" max="100" step="5" value="${st.bgmVol}" data-vol="bgm" aria-label="BGMの音量"><span class="vv">${st.bgmVol}</span></div>
    <div class="vol-row"><span class="vl">効果音</span><input type="range" min="0" max="100" step="5" value="${st.seVol}" data-vol="se" aria-label="効果音の音量"><span class="vv">${st.seVol}</span></div>`;
}

async function openPause() {
  if (!game || game.paused || game.ended) return;
  game.pause();
  game.keys.clear();
  let v;
  for (;;) {
    v = await pauseModal();
    if (v !== 'help') break;
    await enemyBook({ biome: game.stage.biome.id });
    if (!game) return;
  }
  if (!game) return;
  if (v === 'quit' && await confirmBox('ゲーム終了', '途中で終了すると報酬が少なくなります。', '終了する', 'red')) { game.finish(false); return; }
  game.resume();
}
function pauseModal() {
  return modal({
    title: 'ポーズ',
    dismiss: false,
    body: `<p style="text-align:center;margin:0">ROOM ${game.room + 1}/${D.ROOMS_PER_STAGE} ／ 経過 ${fmtTime(game.t)} ／ 撃破 ${game.kills}</p>
      <div class="pause-vol">${volHTML()}</div>
      <button class="btn block gold pause-help" data-act-help>この場所の敵のヘルプ</button>`,
    buttons: [{ label: 'ゲーム終了', value: 'quit', cls: 'dark' }, { label: '再開', value: 'resume', cls: 'teal' }],
    onMount: (ov, close) => ov.querySelector('[data-act-help]').addEventListener('click', () => close('help')),
  });
}

// ===================== 敵のヘルプ・てき図鑑 =====================
const seen = () => data().seen;
function weakHTML(el) {
  const E = EN.ELEMENTS[el];
  if (!E) return '';
  return `<div class="eh-weak"><b>弱点</b><span class="elchip" style="--c:${E.color}">${E.name}</span><span class="eh-wl">${EN.weaponsOf(el).join('・')}</span><small>弱点の武器で攻撃するとダメージ${EN.WEAK_MUL}倍（オレンジの数字）</small></div>`;
}
function mobHelpHTML(id) {
  const M = EN.MOBS[id];
  const P = EN.PATTERNS[M.pattern];
  const A = M.atk ? EN.MOB_ATTACKS[M.atk] : null;
  const same = Object.entries(EN.MOBS).filter(([k, x]) => x.pattern === M.pattern && (x.atk || null) === (M.atk || null) && k !== id && seen().m.includes(k));
  return `<div class="eh">
    <div class="eh-head"><img class="eh-img" src="${enemyURL(M)}" alt=""><div><div class="eh-name">${M.name}</div><span class="eh-type">${P.name}</span><div class="eh-flavor">${M.flavor || ''}</div></div></div>
    <img class="eh-diagram" src="${diagramURL(M.pattern, M)}" alt="攻撃のしかたの図">
    <div class="eh-sec"><b>攻撃パターン</b><p>${P.attack}</p></div>
    <div class="eh-sec"><b>よけ方・倒し方</b><p>${P.dodge}</p></div>
    ${A ? `<div class="eh-atk"><img src="${diagramURL(M.atk, M)}" alt=""><div><b>特殊攻撃：${A.name}</b><p>${A.desc}</p><p class="dodge">よけ方：${A.dodge}</p></div></div>` : ''}
    ${weakHTML(M.weak)}
    ${same.length ? `<div class="eh-same"><b>同じタイプの敵</b><div>${same.map(([, x]) => `<span><img src="${enemyURL(x)}" alt="">${x.name}</span>`).join('')}</div></div>` : ''}
  </div>`;
}
function bossHelpHTML(id) {
  const B = EN.BOSSES[id];
  const minion = B.minion ? EN.MOBS[B.minion] : null;
  const atks = [...new Set(B.attacks)];
  return `<div class="eh">
    <div class="eh-head boss"><img class="eh-img" src="${enemyURL(B, true)}" alt=""><div><div class="eh-name">${B.name}</div><span class="eh-type boss">BOSS</span></div></div>
    <div class="eh-sec"><b>攻略のコツ</b><p>${B.tips}</p></div>
    ${weakHTML(B.weak)}
    <div class="eh-sec"><b>使ってくる技</b></div>
    <div class="eh-atks">${atks.map((k) => {
      const A = EN.BOSS_ATTACKS[k];
      return `<div class="eh-atk"><img src="${diagramURL(k, { ...B, minion }, true)}" alt=""><div><b>${A.name}</b><p>${A.desc}</p><p class="dodge">よけ方：${A.dodge}</p></div></div>`;
    }).join('')}</div>
    <p class="muted" style="margin-bottom:0">体力が半分を切ると怒って、技を出すのが速くなります。</p>
  </div>`;
}
function enemyHelpModal(h, opt = {}) {
  const isBoss = h.kind === 'boss';
  return modal({
    cls: 'ehelp',
    title: opt.title || (isBoss ? 'ボス出現！' : '新しい敵が現れた！'),
    sound: 'panel',
    dismiss: !!opt.dismiss,
    body: isBoss ? bossHelpHTML(h.id) : mobHelpHTML(h.id),
    buttons: [{ label: opt.ok || (inBattle ? 'たたかう！' : 'OK'), value: true, cls: 'red' }],
  });
}
/** てき図鑑（ホーム・一時停止から）。biome を渡すとそのステージを先頭に、全部見られる状態で出す */
async function enemyBook(opt = {}) {
  const s = seen();
  const order = D.BIOMES.map((b, i) => ({ b, i }));
  if (opt.biome) order.sort((x, y) => (y.b.id === opt.biome) - (x.b.id === opt.biome));
  // クリア済みのステージ・いま戦っているステージの敵は全部見られる
  const cleared = (b) => D.worldCleared(data(), D.BIOMES.indexOf(b) + 1) >= 1;
  const known = (kind, id, b) => b.id === opt.biome || cleared(b) || (kind === 'boss' ? s.b : s.m).includes(id);
  const tile = (kind, id, def, b) => {
    const k = known(kind, id, b);
    return `<button class="eb-tile ${kind === 'boss' ? 'boss' : ''} ${k ? '' : 'unk'}" data-eb="${kind}:${id}:${b.id}">
      <img src="${enemyURL(def, kind === 'boss', !k)}" alt=""><span>${k ? def.name : '？？？'}</span></button>`;
  };
  let total = 0, got = 0;
  const html = order.map(({ b, i }) => {
    const mobs = [...b.mobs, b.elite];
    total += mobs.length + 1;
    got += mobs.filter((id) => known('mob', id, b)).length + (known('boss', b.boss, b) ? 1 : 0);
    return `<div class="eb-sec"><div class="eb-h">STAGE ${i + 1}　${b.name}${b.id === opt.biome ? '<span class="eb-now">いまここ</span>' : ''}</div>
      <div class="eb-grid">${mobs.map((id) => tile('mob', id, EN.MOBS[id], b)).join('')}${tile('boss', b.boss, EN.BOSSES[b.boss], b)}</div></div>`;
  }).join('');
  const v = await modal({
    cls: 'ebook',
    title: 'てき図鑑',
    sound: 'panel2',
    body: `<p class="muted" style="margin-top:0">敵をタップすると、攻撃パターン・よけ方・弱点が見られます。クリアしたステージの敵は全部見られます。（${got} / ${total}）</p>${html}`,
    buttons: [{ label: '閉じる', value: null }],
    onMount: (ov, close) => ov.querySelectorAll('[data-eb]').forEach((el) => el.addEventListener('click', () => close(el.dataset.eb))),
  });
  if (!v) return;
  const [kind, id, bid] = v.split(':');
  const b = D.BIOMES.find((x) => x.id === bid);
  sfx('click');
  if (!b || !known(kind, id, b)) toast('まだ出会っていない敵です');
  else await enemyHelpModal({ kind, id }, { title: kind === 'boss' ? 'ボスの情報' : '敵の情報', ok: 'もどる', dismiss: true });
  return enemyBook(opt);
}

async function endBattle(res) {
  const d = data();
  const n = d.selectedStage;
  const info = D.stageInfo(n);
  const rw = D.clearReward(info.n);
  let gold, ticket = 0, item = null, first = false;
  if (res.cleared) {
    first = !D.stageCleared(d, n);
    gold = rw.gold + res.gold + res.kills * 8;
    ticket = first ? rw.firstTicket : 0;
    M.track('boss');
    d.stats.bossKills = (d.stats.bossKills || 0) + 1;
    let rar = D.rollRarity(Math.floor(info.D / 2));
    if (first && rar === 'N') rar = 'R';
    item = addItem(D.randomEquipBase(), rar);
    if (first) {
      d.prog[info.w - 1] = Math.max(d.prog[info.w - 1] || 0, info.L);
      d.maxStage = D.clearedCount(d);
      setTimeout(warmPlayable, 3000);
    }
    d.stats.clears++;
  } else {
    gold = Math.round(res.gold + res.kills * 5 + (res.room - 1) / D.ROOMS_PER_STAGE * rw.gold * 0.6);
  }
  d.gold += gold;
  d.ticketsChar += ticket;
  M.track('play');
  M.track('kill', res.kills);
  d.stats.runs++;
  d.stats.kills += res.kills;
  // ミッション用の記録
  M.track('elite', res.elites || 0);
  M.track('skill', res.skills || 0);
  M.track('super', res.supers || 0);
  M.track('coinEarn', gold);
  M.track('battleSec', Math.round(res.time));
  if (res.cleared) M.track('clear');
  if (res.level >= 10) M.track('lv10');
  if (res.level >= 20) M.track('lv20');
  const ST = d.stats;
  ST.elites = (ST.elites || 0) + (res.elites || 0);
  ST.supers = (ST.supers || 0) + (res.supers || 0);
  ST.skills = (ST.skills || 0) + (res.skills || 0);
  ST.weakHits = (ST.weakHits || 0) + (res.weakHits || 0);
  ST.coinEarned = (ST.coinEarned || 0) + gold;
  ST.playSec = (ST.playSec || 0) + Math.round(res.time);
  ST.bestKills = Math.max(ST.bestKills || 0, res.kills);
  ST.bestLv = Math.max(ST.bestLv || 0, res.level);
  const unlocked = [];
  for (const [id, c] of Object.entries(D.CHARACTERS)) {
    if (c.unlock && c.unlock.stage && !d.chars[id].unlocked && D.worldCleared(d, c.unlock.stage) >= 1) { d.chars[id].unlocked = true; unlocked.push(c.name); }
  }
  // 次のステージ（1-10 のあとは 2-1）
  const nextN = n < D.STAGE_COUNT && D.stageOpen(d, n + 1) ? n + 1 : null;
  if (first && nextN) d.selectedStage = nextN;
  const newWorld = first && info.L === D.LEVELS_PER_WORLD && n < D.STAGE_COUNT;
  const rankExp = PF.battleRankExp(res, info.n);
  const ups = PF.gainRankExp(rankExp);
  commit();
  autoBackup(true);
  playBgm(res.cleared ? 'clear' : 'gameover');
  const v = await modal({
    dismiss: false,
    sound: 'panel',
    body: `<div class="result-title ol ${res.cleared ? 'win' : 'lose'}">${res.cleared ? 'STAGE CLEAR!' : 'GAME OVER'}</div>
      <div class="result-grid">
        <b>ステージ</b><span>${info.name} ${info.sub}</span>
        <b>到達</b><span>${res.cleared ? 'ボス撃破！' : `ROOM ${res.room} / ${D.ROOMS_PER_STAGE}`}</span>
        <b>時間</b><span>${fmtTime(res.time)}</span>
        <b>撃破数</b><span>${res.kills}</span>
        <b>到達Lv</b><span>${res.level}</span>
        <b>ランク経験値</b><span>+${rankExp}</span>
      </div>
      <div class="rewards">
        <div class="reward"><img class="px" data-icon="coin" data-color="#ffcf3a" alt="">${gold.toLocaleString()}</div>
        ${ticket ? `<div class="reward"><img class="px" data-icon="ticket" data-color="${M.TICKET_COLOR.char}" alt="">×${ticket}（初回クリア）</div>` : ''}
      </div>
      ${item ? `<div style="display:flex;gap:10px;align-items:center;justify-content:center;margin-top:10px"><div style="width:64px">${itemTile(item, { act: 'none', noOwner: true })}</div><div>${D.EQUIP[item.base].name}<br><span class="muted">を手に入れた！</span></div></div>` : ''}
      ${unlocked.length ? `<p style="text-align:center;color:#c4103c">${unlocked.join('、')} が仲間になった！</p>${presetNote(unlocked.length)}` : ''}
      ${newWorld ? `<p class="new-world">ワールド${info.w + 1}「${D.BIOMES[info.w].name}」が開放されました！</p>` : ''}`,
    buttons: res.cleared && nextN
      ? [{ label: 'ホームへ', value: 'home' }, { label: '次のステージへ', value: 'next', cls: 'red' }]
      : res.cleared ? [{ label: 'ホームへ', value: 'home' }]
      : [{ label: 'ホームへ', value: 'home' }, { label: 'もう一度', value: 'retry', cls: 'red' }],
    onMount: hydrate,
  });
  leaveBattle();
  if (ups.length) await rankUpModal(ups);
  if (v === 'next' && nextN) { sfx('start'); data().selectedStage = nextN; commit(); startBattle(); }
  else if (v === 'retry') { sfx('start'); startBattle(); }
  else if (pendingUpdate) showUpdatePopup();
}

function leaveBattle() {
  if (game) game.stop();
  game = null;
  inBattle = false;
  $('#battle').classList.add('hidden');
  $('#menu').classList.remove('hidden');
  $('#joy').classList.add('hidden');
  $('#levelup').classList.add('hidden');
  render(); // メニューのBGMに切り替わる
}

// 動作確認用（ブラウザのコンソールから __nds.game で戦闘中の状態を見られる）
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  window.__nds = { get game() { return game; }, store, audio: () => import('./audio.js').then((m) => m.audioState()) };
}

boot();
