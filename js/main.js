// エントリーポイント：画面・育成・戦闘の流れをつなぐ
import { charSprite, enemySprite, icon, toURL, frameURL, bandURL, patternURL, floorTile, rockTile, wallDeco, T } from './art.js';
import * as D from './data.js';
import {
  store, load, commit, onChange, exportFile, parseImportText, replaceSave, summary,
  formatPlayTime, formatDate, addPlayTime, hasPrevBackup, restorePrev, resetAll,
} from './save.js';
import {
  cloud, initCloud, onCloud, signIn, signOut, upload, restoreFromCloud, setSyncHandlers,
  enablePush, disablePush, autoBackup,
} from './cloud.js';
import { pwa, initPWA, applyUpdate, fetchChangelog, isStandalone, isIOS } from './pwa.js';
import { APP_VERSION } from './version.js';
import { initAudio, preloadAudio, sfx, setVolume, playBgm, stopBgm, bgmForBiome, TRACK_NAMES } from './audio.js';
import { modal, toast, confirmBox, esc, closeAllModals } from './ui.js';
import { Game } from './game.js';
import * as M from './meta.js';
import * as PF from './profile.js';
import { playGacha } from './gachafx.js';
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
  if (isPhone() && w > h) {
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
addEventListener('resize', fitScreen);
addEventListener('orientationchange', () => setTimeout(fitScreen, 300));
if (window.visualViewport) visualViewport.addEventListener('resize', fitScreen);
const data = () => store.save.data;

let tab = 'home';
let partyTab = 'equip';
let viewChar = null;     // キャラ画面で見ているキャラ
let invFilter = 'all';
let gachaType = 'char';
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
  preloadAudio();
  hydrate(document);
  render();
  bindGlobal();

  onChange(() => { updateWallet(); if (!inBattle) render(); });
  onCloud(() => { updateCloudDot(); if (tab === 'settings' && !inBattle) render(); });
  setSyncHandlers({ onConflict: askConflict, onApplyRemote: (save) => { replaceSave(save, true); toast('クラウドのセーブを読み込みました'); } });
  setInterval(() => { if (document.visibilityState === 'visible') addPlayTime(15); }, 15000);

  initPWA(onUpdateReady);
  initCloud();
  await Promise.all([fetchChangelog().catch(() => {}), tapped]);
  render();
  await afterBoot();
}

// ===================== タイトル画面 =====================
let titleOpen = true;
/** TAP TO START が押されるまで待つ（このタップで音も使えるようになる） */
function waitTitle() {
  const el = $('#title');
  $('#title-ver').textContent = 'v' + APP_VERSION;
  return new Promise((resolve) => {
    let done = false;
    const go = (e) => {
      if (done) return;
      if (e.type === 'keydown' && !['Enter', ' ', 'Space'].includes(e.key)) return;
      done = true;
      e.preventDefault();
      initAudio();
      sfx('unlock');
      el.classList.add('go');
      setTimeout(() => { el.classList.add('out'); titleOpen = false; resolve(); }, 380);
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

/** 起動後：ログインボーナス → 運営プレゼント → お知らせ */
async function afterBoot() {
  if (await handleMove()) return;
  const idx = M.checkLoginBonus();
  await M.syncGifts();
  render();
  if (idx !== null) await loginModal(idx);
  if (pendingUpdate) await showUpdatePopup();
  showNewsIfUnread();
  // 0時をまたいで開きっぱなしでも受け取れるように
  const recheck = async () => {
    if (inBattle || document.querySelector('.overlay')) return;
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
}

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
function countTo(el, to) {
  const from = countState.get(el) ?? to;
  countState.set(el, to);
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toLocaleString(); return; }
  const t0 = performance.now(), dur = 600;
  el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump');
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString();
    if (k < 1 && countState.get(el) === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateWallet() {
  const d = data();
  countTo($('#pill-gold'), d.gold);
  countTo($('#pill-ticket'), d.tickets);
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
  if (!inBattle && !$('#loading:not(.hidden)')) playBgm(menuBgm(), 'home');
  el.scrollTop = keep;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#settings-badge').classList.toggle('hidden', !pendingUpdate);
  updateWallet();
  updateCloudDot();
}

function ownerOf(uid) {
  for (const [id, c] of Object.entries(data().chars)) if (Object.values(c.equip).includes(uid)) return id;
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
  const owner = opt.noOwner ? null : ownerOf(it.uid);
  return `<button class="itile ${it.rarity === 'SSR' ? 'ssr' : ''} ${newItems.has(it.uid) ? 'new' : ''}" style="--rc:${R.color};--rd:${R.dark}" data-act="${opt.act || 'item'}" data-uid="${it.uid}" ${opt.slot ? `data-slot="${opt.slot}"` : ''}>
    <img class="ic px" data-icon="${base.icon}" data-color="${base.color}" alt="">
    <span class="rar ol">${R.name}</span>
    <span class="lv ol">LV:${it.level}</span>
    ${owner ? `<img class="who px" data-portrait="${owner}" alt="">` : ''}
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
const stageViewMax = () => Math.max(30, data().maxStage + 6);
const isLocked = (n) => n > data().maxStage + 1;

function homeHTML() {
  const d = data();
  const cid = d.selectedChar;
  const pw = D.power(D.charStats(d, cid));
  const n = d.selectedStage;
  const info = D.stageInfo(n);
  const locked = isLocked(n);
  const cleared = n <= d.maxStage;
  const rooms = Array.from({ length: D.ROOMS_PER_STAGE }, (_, i) => `<i class="${i === D.ROOMS_PER_STAGE - 1 ? 'boss' : ''}"></i>`).join('<span class="arrow">›</span>');
  return `
  <div class="home-icons">
    ${homeIcon('present', 'gift', '#ff6a8a', 'プレゼント', d.presents.length)}
    ${homeIcon('missions', 'scroll', '#e8d8a8', 'ミッション', M.claimableCount())}
    ${homeIcon('login-bonus', 'calendar', '#7ac8ff', 'ログボ', 0)}
    ${homeIcon('news', 'book', '#ffd23a', 'お知らせ', hasUnreadNews() ? '!' : 0)}
  </div>
  ${tickerHTML()}
  <div class="home-top">
    ${!isStandalone() ? '<button class="chip" data-act="install">ホーム画面に追加</button>' : ''}
    <button class="chip" data-act="stage-list">ステージ一覧</button>
  </div>
  <div class="panel stage-card">
    <div class="stage-ribbon ${locked ? 'locked' : ''}">${locked ? '<img class="px" data-icon="lock" data-color="#ffd23a" alt="">' : ''}<span class="no ol">${info.name}</span><span class="nm ol">${info.sub}</span></div>
    <div class="stage-view">
      <button class="stage-arrow l" data-act="stage-prev" ${n <= 1 ? 'disabled' : ''}>◀</button>
      <canvas id="stage-preview"></canvas>
      ${locked ? `<div class="stage-lock"><img class="px" data-icon="lock" data-color="#ffd23a" alt=""><span class="ol">STAGE ${n - 1} をクリアで解放</span></div>` : ''}
      <button class="stage-arrow r" data-act="stage-next" ${n >= stageViewMax() ? 'disabled' : ''}>▶</button>
    </div>
    <div class="rooms"><span class="muted">部屋</span>${rooms}<span class="muted">BOSS</span></div>
    <div class="stage-meta">
      <span>推奨戦闘力 <span class="${pw >= info.recommended ? 'ok' : 'warn'}">${info.recommended.toLocaleString()}</span></span>
      <span>${D.CHARACTERS[cid].name} 戦闘力 ${pw.toLocaleString()}</span>
    </div>
    ${cleared ? '<div class="muted" style="text-align:center;color:#7aff8a">クリア済み</div>' : ''}
  </div>
  ${locked
    ? `<button class="btn btn-start locked" disabled><img class="px" data-icon="lock" data-color="#8a7a60" alt=""> ロック中</button>`
    : '<button class="btn red btn-start" data-act="start">出撃</button>'}`;
}

function stageListModal() {
  const d = data();
  const max = stageViewMax();
  const cells = [];
  for (let n = 1; n <= max; n++) {
    const info = D.stageInfo(n);
    const st = n <= d.maxStage ? 'clear' : isLocked(n) ? 'lock' : 'open';
    cells.push(`<button class="stile ${st} ${n === d.selectedStage ? 'sel' : ''}" data-n="${n}" style="--bc:${info.biome.floor[0]};--bd:${info.biome.side}">
      <span class="sn ol">${n}</span><span class="sb">${info.biome.name}</span>
      ${st === 'lock' ? '<img class="px lk" data-icon="lock" data-color="#ffd23a" alt="">' : st === 'clear' ? '<span class="ck ol">✓</span>' : ''}
    </button>`);
  }
  modal({
    title: 'ステージ一覧',
    body: `<p class="muted" style="margin-top:0">ステージをクリアすると次が解放されます。ロック中のステージも中身を見られます。</p><div class="stage-grid">${cells.join('')}</div>`,
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
  // 水場と岩
  g.fillStyle = B.pool.color; g.fillRect(5 * T, 2 * T, 2 * T, T);
  g.fillStyle = B.pool.rim; g.fillRect(5 * T, 2 * T, 2 * T, 3);
  const rk = rockTile(B, 9);
  for (const [x, y] of [[9, 1], [10, 1], [9, 2], [3, 5]]) g.drawImage(rk, x * T, y * T - 4);
  // 敵とキャラ
  const en = B.enemies;
  const place = [[4, 3.4, 0], [11, 4.5, 1], [7.6, 1.6, 2], [10.4, 6.6, 0]];
  for (const [x, y, k] of place) {
    const [t, p] = en[k % en.length];
    const s = enemySprite(t, p);
    g.drawImage(s, Math.round(x * T - s.width / 2), Math.round(y * T - s.height / 2));
  }
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
    </div>` + (partyTab === 'equip' ? equipHTML() : charsHTML());
}

function equipHTML() {
  const d = data();
  const cid = d.selectedChar;
  const cs = d.chars[cid];
  const st = D.charStats(d, cid);
  const slotTile = (s) => {
    const it = d.items.find((i) => i.uid === cs.equip[s.id]);
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
      ${s.unlocked ? `<span class="lvl ol">Lv${s.level}</span>${s.awaken ? `<span class="pct ol">+${s.awaken}</span>` : ''}` : `<span class="lockic ol"><img class="px" data-icon="lock" data-color="#ffd23a" alt="">${cc.unlock.gacha ? 'ガチャ' : 'STAGE' + cc.unlock.stage}</span>`}
      ${cc.stars === 5 ? '<span class="star5"></span>' : ''}
      ${cid === d.selectedChar ? '<span class="using ol">出撃</span>' : ''}
    </button>`;
  }).join('');
  let actions;
  if (!cs.unlocked) {
    actions = `<div class="muted" style="text-align:center;margin-bottom:6px">${c.unlock.gacha ? 'キャラガチャで手に入ります（ガチャ限定）' : `STAGE ${c.unlock.stage} をクリアすると仲間になります（キャラガチャでも出ます）`}</div>
      <button class="btn red block" data-act="goto-gacha">キャラガチャへ</button>`;
  } else {
    actions = `<div class="btn-grid">
      <button class="btn red" data-act="char-up" data-id="${id}" ${maxed || d.gold < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `強化 <img class="px" data-icon="coin" data-color="#ffcf3a" alt="">${cost.toLocaleString()}`}</button>
      <button class="btn ${id === d.selectedChar ? '' : 'teal'}" data-act="select-char" data-id="${id}" ${id === d.selectedChar ? 'disabled' : ''}>${id === d.selectedChar ? '出撃中' : '決定'}</button>
    </div>`;
  }
  return `
  <div class="char-show" style="--cbg:${c.bg}">
    <img class="big px" data-char="${id}" alt="${c.name}" ${cs.unlocked ? '' : 'style="filter:brightness(0) opacity(.5)"'}>
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

async function itemModal(uid, slotId) {
  const d = data();
  const it = d.items.find((i) => i.uid === uid);
  if (!it) return;
  newItems.delete(uid);
  const cid = d.selectedChar;
  const base = D.EQUIP[it.base];
  const R = D.RARITIES[it.rarity];
  const owner = ownerOf(uid);
  const st = D.itemStats(it);
  const cost = D.upgradeCost(it);
  const maxed = it.level >= R.maxLv;
  const lines = Object.entries(st).map(([k, v]) => `<div>${D.formatStat(k, v)}</div>`).join('');
  const buttons = [];
  if (owner === cid) buttons.push({ label: '外す', value: 'unequip' });
  else buttons.push({ label: '装備する', value: 'equip', cls: 'teal' });
  buttons.push({ label: maxed ? '強化MAX' : `強化 ${cost.toLocaleString()}G`, value: 'up', cls: 'gold' });
  if (!owner) buttons.push({ label: `売却 +${D.salvageValue(it)}G`, value: 'sell', cls: 'dark' });
  buttons.push({ label: '閉じる', value: null });
  const v = await modal({
    title: `${base.name}`,
    body: `<div class="item-detail">${itemTile(it, { act: 'none', noOwner: true })}
      <div class="stats" style="flex:1">
        <div style="color:${R.dark}"><b>${R.name}</b> ／ ${D.SLOT_TYPE_NAMES[base.type]}</div>
        <div class="muted">LV ${it.level} / ${R.maxLv}</div>
        ${lines}
        ${owner ? `<div class="muted">${D.CHARACTERS[owner].name}が装備中</div>` : ''}
      </div></div>`,
    buttons,
    onMount: (ov) => {
      hydrate(ov);
      const upBtn = [...ov.querySelectorAll('.mbtns .btn')].find((b) => b.textContent.startsWith('強化'));
      if (upBtn && (maxed || d.gold < cost)) upBtn.disabled = true;
    },
  });
  if (v === 'equip') equipItem(uid, slotId);
  else if (v === 'unequip') {
    for (const k of Object.keys(d.chars[cid].equip)) if (d.chars[cid].equip[k] === uid) d.chars[cid].equip[k] = null;
    commit();
  } else if (v === 'up') {
    if (d.gold >= cost && !maxed) { d.gold -= cost; it.level++; M.track('upgrade'); sfx('levelup'); commit(); itemModal(uid, slotId); }
  } else if (v === 'sell') {
    if (await confirmBox('売却', `${base.name} を ${D.salvageValue(it)} ゴールドで売却しますか？`, '売却する', 'red')) {
      d.gold += D.salvageValue(it);
      d.items = d.items.filter((i) => i.uid !== uid);
      commit();
    }
  }
}

function equipItem(uid, slotId) {
  const d = data();
  const cid = d.selectedChar;
  const it = d.items.find((i) => i.uid === uid);
  const type = D.EQUIP[it.base].type;
  const owner = ownerOf(uid);
  if (owner) for (const k of Object.keys(d.chars[owner].equip)) if (d.chars[owner].equip[k] === uid) d.chars[owner].equip[k] = null;
  let slot = slotId && D.SLOTS.find((s) => s.id === slotId && s.type === type) ? slotId : null;
  if (!slot) {
    const cands = D.SLOTS.filter((s) => s.type === type);
    slot = (cands.find((s) => d.chars[cid].equip[s.id] == null) || cands[0]).id;
  }
  d.chars[cid].equip[slot] = uid;
  sfx('equip');
  commit();
}

/** スロットを押した：その部位の装備一覧から選ぶ */
async function slotModal(slotId) {
  const d = data();
  const slot = D.SLOTS.find((s) => s.id === slotId);
  const cur = d.chars[d.selectedChar].equip[slotId];
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
    if (v === 'off') { d.chars[d.selectedChar].equip[slotId] = null; commit(); }
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
  for (const [oid, oc] of Object.entries(d.chars)) if (oid !== cid) for (const u of Object.values(oc.equip)) if (u != null) used.add(u);
  for (const s of D.SLOTS) {
    const best = d.items.filter((it) => D.EQUIP[it.base].type === s.type && !used.has(it.uid)).sort((a, b) => score(b) - score(a))[0];
    d.chars[cid].equip[s.id] = best ? best.uid : null;
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
  const t = d.tickets;
  let banner;
  if (gachaType === 'char') {
    const feat = Object.values(D.CHARACTERS).filter((c) => c.gacha && c.stars === 5);
    banner = `<div class="gbanner char">
      <div class="gb-chars">${feat.map((c) => `<img class="px" data-char="${c.id}" alt="${c.name}">`).join('')}</div>
      <div class="gb-title ol">ガチャ限定 ★5 登場！</div>
      <div class="gb-names ol">${feat.map((c) => c.name).join('・')}</div>
    </div>`;
  } else {
    banner = `<div class="gbanner equip">
      <div class="gb-items">${['sword', 'armor', 'ring', 'helmet', 'staff'].map((ic, i) => `<img class="px" data-icon="${ic}" data-color="${['#ffcc33', '#c45cff', '#4aa8ff', '#9aa3b8', '#ffd23a'][i]}" alt="">`).join('')}</div>
      <div class="gb-title ol">装備ガチャ</div>
    </div>`;
  }
  const rates = gachaType === 'char'
    ? Object.entries(g.rates).sort((a, b) => b[0] - a[0]).map(([s, r]) => `<span>★${s} ${r}%</span>`).join('')
    : D.RARITY_ORDER.map((k) => `<span style="color:${D.RARITIES[k].color}">${k} ${D.RARITIES[k].rate}%</span>`).join('');
  return `
  <div class="subtabs">
    <button class="btn ${gachaType === 'char' ? 'active' : ''}" data-act="gacha-type" data-t="char">キャラガチャ</button>
    <button class="btn ${gachaType === 'equip' ? 'active' : ''}" data-act="gacha-type" data-t="equip">装備ガチャ</button>
  </div>
  ${banner}
  <div class="panel">
    <div class="muted" style="text-align:center;margin-bottom:6px">${g.desc}</div>
    <div class="gpay"><img class="px" data-icon="ticket" data-color="#ff7a9a" alt=""><span>チケットで引く</span><span class="spacer"></span><span class="own">所持 ${t}枚</span></div>
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
    <div class="rates">${rates}</div>
  </div>`;
}

async function doGacha(n, by) {
  const type = gachaType;
  if (!M.payGacha(type, n, by)) { sfx('error'); toast(by === 'ticket' ? 'チケットが足りません' : 'コインが足りません'); return; }
  const STAR_R = { 3: 'R', 4: 'SR', 5: 'SSR' };
  if (type === 'char') {
    const res = M.pullChars(n);
    // 演出：宝箱 → 卵が1つずつ割れる
    await playGacha(res.map((r) => {
      const c = D.CHARACTERS[r.id];
      return { rarity: STAR_R[r.star], name: `${'★'.repeat(r.star)} ${c.name}`, img: toURL(charSprite(c, 'idle'), 6, `c:${c.id}`), sub: r.isNew ? 'NEW!' : r.awaken ? `覚醒 +${r.awaken}` : `+${r.coins.toLocaleString()} コイン` };
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
          <span class="rn ol">${r.isNew ? '<b class="rnew">NEW</b>' : r.awaken ? `覚醒+${r.awaken}` : `+${r.coins}G`}</span>
        </div><div class="gname r-${STAR_R[r.star]}">${c.name}</div></div>`;
      }).join('')}</div>`,
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

// ----- プロフィール -----
let profTab = 'icon';
function profileModal() {
  sfx('click');
  const d = data();
  const need = PF.rankNeed(d.rank.lv);
  const next = PF.rankReward(d.rank.lv + 1);
  const nextTxt = [next.gold ? `コイン×${next.gold.toLocaleString()}` : '', next.ticket ? `チケット×${next.ticket}` : '', ...next.icons.map((i) => `アイコン「${i.name}」`), ...next.frames.map((f) => `フレーム「${f.name}」`)].filter(Boolean).join('、');
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
          <div class="prof-rank">Rank <b>${d.rank.lv}</b></div>
          <div class="mbar"><div style="width:${(d.rank.exp / need) * 100}%"></div><span>${d.rank.exp} / ${need}</span></div>
          <div class="muted">次のランク報酬：${nextTxt}</div>
        </div>
      </div>
      <div class="name-edit"><input id="pf-name" maxlength="12" value="${esc(d.profile.name)}" placeholder="ユーザー名（12文字まで）" autocomplete="off"><button class="btn small teal" id="pf-save">名前を変更</button></div>
      <div class="mtabs" style="margin-top:10px">
        <button class="btn small ${profTab === 'icon' ? 'active' : ''}" data-ptab="icon">アイコン</button>
        <button class="btn small ${profTab === 'frame' ? 'active' : ''}" data-ptab="frame">アイコンフレーム</button>
      </div>
      <div class="pick-grid reveal">${grid}</div>`,
    buttons: [{ label: '閉じる', value: null }],
    onMount: (ov, close) => {
      hydrate(ov);
      const reopen = () => { close(); profileModal(); };
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
          ${u.ticket ? `<div class="reward"><img class="px" data-icon="ticket" data-color="#ff7a9a" alt="">×${u.ticket}</div>` : ''}
          ${u.icons.map((i) => `<div class="reward new">${avatarHTML(i.id, 'basic', 40)}<span>アイコン<br>${i.name}</span></div>`).join('')}
          ${u.frames.map((f) => `<div class="reward new">${avatarHTML(d.profile.icon, f.id, 40)}<span>フレーム<br>${f.name}</span></div>`).join('')}
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
      <img class="px pic" data-icon="${p.from === 'login' ? 'calendar' : p.from === 'gift' ? 'gift' : 'star'}" data-color="${p.from === 'login' ? '#7ac8ff' : '#ff6a8a'}" alt="">
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
        <div class="mbar"><div style="width:${(m.p / m.goal) * 100}%"></div><span>${m.p.toLocaleString()} / ${m.goal.toLocaleString()}</span></div>
        <div class="prw">${rewardHTML(m.reward)}</div>
      </div>
      ${m.claimed ? '<span class="mdone">受取済</span>' : `<button class="btn small ${m.done ? 'red' : ''}" data-mclaim="${m.id}" ${m.done ? '' : 'disabled'}>${m.done ? '受け取る' : '未達成'}</button>`}
    </div>`).join('');
  modal({
    title: 'ミッション',
    body: `<div class="mtabs">${Object.entries(tabs).map(([k, v]) => `<button class="btn small ${k === missionTab ? 'active' : ''}" data-mtab="${k}">${v}${counts[k] ? `<i class="hbadge">${counts[k]}</i>` : ''}</button>`).join('')}</div>
      <div class="muted" style="text-align:right;margin:4px 0">${missionTab === 'perm' ? '一度だけ受け取れる実績ミッション' : `更新まで あと${M.untilReset(missionTab)}`}</div>
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
    : !cloud.enabled ? 'クラウド機能の準備ができると使えます'
    : !cloud.user ? 'Googleログインが必要です' : 'アップデートやお知らせを端末に通知します';
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
    <div class="vol-row"><span class="vl">BGM</span><input type="range" min="0" max="100" step="5" value="${d.settings.bgmVol}" data-vol="bgm" aria-label="BGMの音量"><span class="vv" id="vv-bgm">${d.settings.bgmVol}</span></div>
    <div class="vol-row"><span class="vl">効果音</span><input type="range" min="0" max="100" step="5" value="${d.settings.seVol}" data-vol="se" aria-label="効果音の音量"><span class="vv" id="vv-se">${d.settings.seVol}</span></div>
    <div class="set-row"><div class="lbl">BGMを試聴<small>バーを0にすると消音になります</small></div>
      <select class="sel" data-act="bgm-test">${Object.entries(TRACK_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
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
    <div class="muted" style="line-height:1.9">音楽：魔王魂<br>効果音：効果音ラボ</div>
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
    const lbl = document.getElementById('vv-' + k);
    if (lbl) lbl.textContent = v;
    if (k === 'se') sfx('coin');
  });
  document.addEventListener('change', (e) => {
    const r = e.target.closest('input[data-vol]');
    if (r) { data().settings[r.dataset.vol === 'bgm' ? 'bgmVol' : 'seVol'] = +r.value; commit(); return; }
    const sel = e.target.closest('select[data-act="bgm-test"]');
    if (sel) { initAudio(); playBgm(sel.value); toast(`試聴中：${TRACK_NAMES[sel.value]}`); }
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
    case 'start': if (!isLocked(d.selectedStage)) { sfx('click'); startBattle(); } break;
    case 'stage-prev': d.selectedStage = Math.max(1, d.selectedStage - 1); sfx('click'); commit(); break;
    case 'stage-next': d.selectedStage = Math.min(stageViewMax(), d.selectedStage + 1); sfx('click'); commit(); break;
    case 'stage-list': stageListModal(); break;
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
      const cs = d.chars[el.dataset.id];
      const cost = D.charUpgradeCost(cs.level);
      if (d.gold >= cost && cs.level < D.CHAR_MAX_LV) { d.gold -= cost; cs.level++; M.track('upgrade'); sfx('levelup'); commit(); }
      break;
    }
    case 'goto-gacha': gachaType = 'char'; tab = 'gacha'; sfx('click'); render(); break;
    case 'gacha-type': gachaType = el.dataset.t; sfx('click'); render(); break;
    case 'present': presentModal(); break;
    case 'profile': profileModal(); break;
    case 'missions': missionModal(); break;
    case 'login-bonus': loginModal(null); break;
    case 'item': sfx('click'); itemModal(+el.dataset.uid); break;
    case 'slot': {
      sfx('click');
      const uid = d.chars[d.selectedChar].equip[el.dataset.slot];
      if (uid != null && d.items.find((i) => i.uid === uid)) itemModal(uid, el.dataset.slot);
      else slotModal(el.dataset.slot);
      break;
    }
    case 'auto-equip': autoEquip(); break;
    case 'sell-n': {
      const list = d.items.filter((it) => it.rarity === 'N' && !ownerOf(it.uid));
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
    case 'install': installApp(); break;
    case 'login':
      try { await signIn(); } catch (e) { toast('ログインできませんでした：' + (e.code || e.message)); }
      break;
    case 'logout':
      if (await confirmBox('ログアウト', 'ログアウトしても端末内のセーブは残ります。', 'ログアウト', 'red')) { await signOut(); toast('ログアウトしました'); }
      break;
    case 'backup-now': toast((await upload(true)) ? 'クラウドにバックアップしました' : 'バックアップに失敗しました'); break;
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
    case 'toggle-notify':
      if (d.settings.notify) { await disablePush().catch(() => {}); d.settings.notify = false; commit(); toast('通知をオフにしました'); }
      else {
        try { await enablePush(pwa.reg); d.settings.notify = true; commit(); toast('通知をオンにしました'); } catch (e) { toast(e.message); }
      }
      break;
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
  });
  hydrate($('#battle'));
  await new Promise((r) => setTimeout(r, 700));
  hideLoading();
  game.start();
  playBgm(bgmForBiome(info.biome.id), 'battle_grass');
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
  wrap.classList.remove('hidden');
  [...cards.children].forEach((card, i) => setTimeout(() => card.classList.remove('pre'), 40 + i * 70));
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
  requestAnimationFrame(() => requestAnimationFrame(() => {
    [...cards.children].forEach((card, i) => {
      const strip = card.querySelector('.strip');
      const n = strip.children.length;
      const dur = 0.6 + i * 0.35;
      strip.style.transition = `transform ${dur}s cubic-bezier(.15,.7,.25,1)`;
      strip.style.transform = `translateY(-${(n - 1) / n * 100}%)`;
      timers.push(setTimeout(() => reveal(i), dur * 1000));
    });
  }));
  let tickN = 0;
  const ticker = setInterval(() => { if (stopped >= 3 || tickN++ > 20) clearInterval(ticker); else sfx('reel'); }, 70);
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

async function openPause() {
  if (!game || game.paused || game.ended) return;
  game.pause();
  game.keys.clear();
  const v = await modal({
    title: 'ポーズ',
    dismiss: false,
    body: `<p style="text-align:center;margin:0">ROOM ${game.room + 1}/${D.ROOMS_PER_STAGE} ／ 経過 ${fmtTime(game.t)} ／ 撃破 ${game.kills}</p>`,
    buttons: [{ label: 'ゲーム終了', value: 'quit', cls: 'dark' }, { label: '再開', value: 'resume', cls: 'teal' }],
  });
  if (!game) return;
  if (v === 'quit' && await confirmBox('ゲーム終了', '途中で終了すると報酬が少なくなります。', '終了する', 'red')) { game.finish(false); return; }
  game.resume();
}

async function endBattle(res) {
  const d = data();
  const n = d.selectedStage;
  const info = D.stageInfo(n);
  const rw = D.clearReward(n);
  let gold, ticket = 0, item = null, first = false;
  if (res.cleared) {
    first = n > d.maxStage;
    gold = rw.gold + res.gold + res.kills * 3;
    ticket = first ? rw.firstTicket : 0;
    M.track('boss');
    d.stats.bossKills = (d.stats.bossKills || 0) + 1;
    let rar = D.rollRarity(Math.floor(n / 2));
    if (first && rar === 'N') rar = 'R';
    item = addItem(D.randomEquipBase(), rar);
    if (first) d.maxStage = n;
    d.stats.clears++;
  } else {
    gold = Math.round(res.gold + res.kills * 2 + (res.room - 1) / D.ROOMS_PER_STAGE * rw.gold * 0.6);
  }
  d.gold += gold;
  d.tickets += ticket;
  M.track('play');
  M.track('kill', res.kills);
  d.stats.runs++;
  d.stats.kills += res.kills;
  const unlocked = [];
  for (const [id, c] of Object.entries(D.CHARACTERS)) {
    if (c.unlock && c.unlock.stage && !d.chars[id].unlocked && d.maxStage >= c.unlock.stage) { d.chars[id].unlocked = true; unlocked.push(c.name); }
  }
  if (first) d.selectedStage = n + 1;
  const rankExp = PF.battleRankExp(res, n);
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
        ${ticket ? `<div class="reward"><img class="px" data-icon="ticket" data-color="#ff7a9a" alt="">×${ticket}（初回クリア）</div>` : ''}
      </div>
      ${item ? `<div style="display:flex;gap:10px;align-items:center;justify-content:center;margin-top:10px"><div style="width:64px">${itemTile(item, { act: 'none', noOwner: true })}</div><div>${D.EQUIP[item.base].name}<br><span class="muted">を手に入れた！</span></div></div>` : ''}
      ${unlocked.length ? `<p style="text-align:center;color:#c4103c">${unlocked.join('、')} が仲間になった！</p>` : ''}`,
    buttons: res.cleared
      ? [{ label: 'ホームへ', value: 'home' }, { label: '次のステージへ', value: 'next', cls: 'red' }]
      : [{ label: 'ホームへ', value: 'home' }, { label: 'もう一度', value: 'retry', cls: 'red' }],
    onMount: hydrate,
  });
  leaveBattle();
  if (ups.length) await rankUpModal(ups);
  if (v === 'next') { data().selectedStage = Math.min(data().maxStage + 1, n + 1); commit(); startBattle(); }
  else if (v === 'retry') startBattle();
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
