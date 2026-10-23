// ヘルプ用の「攻撃のしかた」の図（ドット絵の小さな図を描いて画像にする）
import { enemySprite, charSprite, toURL, drawProj } from './art.js';
import { CHARACTERS } from './data.js';

const W = 112, H = 72;
const TAU = Math.PI * 2;
const cache = new Map();

function cv() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // 地面
  g.fillStyle = '#3e5a3a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#466a40';
  for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) g.fillRect(x, y, 8, 8);
  return [c, g];
}
function sprite(g, s, x, y, scale = 1, alpha = 1) {
  const w = Math.round(s.width * scale), h = Math.round(s.height * scale);
  g.globalAlpha = 0.35; g.fillStyle = '#1e1226';
  g.beginPath(); g.ellipse(x, y + 1, w * 0.36, 2, 0, 0, TAU); g.fill();
  g.globalAlpha = alpha;
  g.drawImage(s, Math.round(x - w / 2), Math.round(y - h + 2), w, h);
  g.globalAlpha = 1;
}
const player = (g, x, y) => sprite(g, charSprite(CHARACTERS.neo, 'idle'), x, y);
let curProj = null; // ボスの図では、そのボスの弾の見た目で描く
function bullet(g, x, y, col = '#ff4f6d') {
  if (curProj) { drawProj(g, curProj, x, y, 0, 0); return; }
  g.fillStyle = '#7a1030'; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
  g.fillStyle = col; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
}
function arrow(g, x1, y1, x2, y2, col = '#ffffff', dash = false) {
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
  g.setLineDash(dash ? [3, 2] : []);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.setLineDash([]);
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(x2 - Math.cos(a - 0.5) * 5, y2 - Math.sin(a - 0.5) * 5);
  g.lineTo(x2 - Math.cos(a + 0.5) * 5, y2 - Math.sin(a + 0.5) * 5);
  g.closePath(); g.fill();
}
function warnCircle(g, x, y, R) {
  g.globalAlpha = 0.35; g.fillStyle = '#ff2a4a';
  g.beginPath(); g.ellipse(x, y, R, R * 0.62, 0, 0, TAU); g.fill();
  g.globalAlpha = 1; g.strokeStyle = '#ff4f6d';
  g.beginPath(); g.ellipse(x, y, R, R * 0.62, 0, 0, TAU); g.stroke();
}
function warnBand(g, x1, y, x2, w = 8) {
  g.globalAlpha = 0.35; g.fillStyle = '#ff2a4a'; g.fillRect(x1, y - w / 2, x2 - x1, w);
  g.globalAlpha = 1; g.fillStyle = '#ff4f6d'; g.fillRect(x1, y - w / 2, x2 - x1, 1); g.fillRect(x1, y + w / 2 - 1, x2 - x1, 1);
}
function sector(g, x, y, a, R, half, fill = 'rgba(255,42,74,0.35)') {
  g.fillStyle = fill; g.beginPath(); g.moveTo(x, y); g.arc(x, y, R, a - half, a + half); g.closePath(); g.fill();
  g.strokeStyle = '#ff4f6d'; g.lineWidth = 1; g.stroke();
}
function puddle(g, x, y, R, poison) {
  if (poison) {
    g.fillStyle = '#5a2a8a'; g.beginPath(); g.ellipse(x, y, R, R * 0.62, 0, 0, TAU); g.fill();
    g.fillStyle = '#a05ae8'; g.beginPath(); g.ellipse(x, y, R - 3, R * 0.62 - 2, 0, 0, TAU); g.fill();
  } else {
    g.globalAlpha = 0.6; g.fillStyle = '#7ab84a';
    for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(x + Math.cos(i) * R * 0.6, y + Math.sin(i) * R * 0.35 - 3, 5, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  }
}
function flames(g, x, y, a, R, half) {
  for (let i = 0; i < 40; i++) {
    const r = (i * 7.3) % R, an = a + Math.sin(i * 12.9) * half * (0.3 + (r / R) * 0.7), k = r / R;
    g.fillStyle = k < 0.35 ? '#fff3a0' : k < 0.7 ? '#ffb03a' : '#ff5a1a';
    const sz = 2 + Math.round(k * 4);
    g.fillRect(Math.round(x + Math.cos(an) * r - sz / 2), Math.round(y + Math.sin(an) * r - sz / 2), sz, sz);
  }
}
function vineWhip(g, x, y, a, R, col = '#4a9a3a') {
  g.strokeStyle = col; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a - 0.4) * R * 0.5, y + Math.sin(a - 0.4) * R * 0.5, x + Math.cos(a) * R, y + Math.sin(a) * R); g.stroke();
}
function bang(g, x, y) {
  g.fillStyle = '#1e1226'; g.fillRect(x - 2, y - 9, 5, 11);
  g.fillStyle = '#ffd23a'; g.fillRect(x - 1, y - 8, 3, 6); g.fillRect(x - 1, y - 1, 3, 2);
}
function okMark(g, x, y) {
  g.fillStyle = '#5aee6a';
  g.fillRect(x, y + 2, 2, 2); g.fillRect(x + 2, y + 4, 2, 2); g.fillRect(x + 4, y + 2, 2, 2); g.fillRect(x + 6, y, 2, 2);
}
function rock(g, x, y) {
  g.fillStyle = '#5a5a64'; g.fillRect(x, y, 14, 14);
  g.fillStyle = '#8a8a94'; g.fillRect(x + 1, y + 1, 12, 9);
}

/**
 * 図を作る
 * @param {string} kind 行動パターン（chase など）かボスの技（ring など）
 * @param {{sprite:string,pal:object}} en 図に描く敵
 * @param {boolean} big ボス用に大きく描く
 */
export function diagramURL(kind, en, big = false) {
  const key = kind + en.sprite + JSON.stringify(en.pal) + big + (en.proj || '');
  if (cache.has(key)) return cache.get(key);
  const [c, g] = cv();
  curProj = big ? en.proj || null : null;
  const es = enemySprite(en.sprite, en.pal, { crown: big });
  const sc = big ? Math.min(1.3, 26 / es.height) : Math.min(1, 16 / es.height);
  const E = (x, y, a = 1) => sprite(g, es, x, y, sc, a);
  switch (kind) {
    case 'chase':
      E(22, 44); arrow(g, 36, 38, 76, 38, '#ffffff', true); player(g, 90, 46);
      break;
    case 'dash':
      E(18, 44); bang(g, 18, 22); warnBand(g, 28, 38, 104); player(g, 82, 26); arrow(g, 82, 44, 82, 30, '#5aee6a');
      break;
    case 'shooter':
      E(16, 44); for (const k of [0.3, 0.5, 0.7]) bullet(g, 16 + 70 * k, 38 - 2 * k); player(g, 92, 30); arrow(g, 92, 44, 92, 32, '#5aee6a');
      g.globalAlpha = 0.5; sprite(g, charSprite(CHARACTERS.neo, 'idle'), 92, 46); g.globalAlpha = 1;
      break;
    case 'swoop': {
      E(16, 30);
      g.strokeStyle = '#ffffff'; g.setLineDash([3, 2]); g.beginPath();
      for (let x = 28; x <= 80; x += 2) { const y = 36 + Math.sin((x - 28) / 6) * 10; if (x === 28) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke(); g.setLineDash([]);
      player(g, 94, 46);
      break;
    }
    case 'phase':
      E(20, 44); rock(g, 46, 30); E(56, 44, 0.35); arrow(g, 66, 38, 80, 38, '#ffffff', true); player(g, 94, 46);
      break;
    case 'split': {
      E(18, 44);
      arrow(g, 34, 38, 52, 38);
      const half = { sprite: en.sprite, pal: en.pal };
      const ms = enemySprite(half.sprite, half.pal);
      sprite(g, ms, 64, 32, sc * 0.6); sprite(g, ms, 70, 52, sc * 0.6);
      player(g, 96, 46);
      break;
    }
    case 'bomber':
      warnCircle(g, 46, 42, 24); E(46, 44); bang(g, 46, 22); player(g, 92, 46); arrow(g, 72, 40, 84, 40, '#5aee6a');
      break;
    case 'tank':
      warnCircle(g, 40, 44, 30); E(40, 46); bang(g, 40, 14); player(g, 94, 48); okMark(g, 88, 12);
      break;
    // ===== ボスの技 =====
    case 'ring':
      E(56, 42);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; bullet(g, 56 + Math.cos(a) * 34, 34 + Math.sin(a) * 24); }
      player(g, 100, 64);
      break;
    case 'fan':
      E(20, 44);
      for (let i = 0; i < 5; i++) { const a = -0.5 + (i / 4); for (const r of [28, 50]) bullet(g, 20 + Math.cos(a) * r, 36 + Math.sin(a) * r * 0.8); }
      player(g, 96, 18); okMark(g, 104, 4);
      break;
    case 'spiral':
      E(56, 44);
      for (let i = 0; i < 26; i++) { const a = i * 0.5, r = 8 + i * 1.3; bullet(g, 56 + Math.cos(a) * r, 34 + Math.sin(a) * r * 0.7); }
      break;
    case 'burst':
      E(18, 44);
      for (let i = 0; i < 5; i++) bullet(g, 34 + i * 11, 36);
      player(g, 96, 30);
      g.strokeStyle = '#5aee6a'; g.beginPath(); g.arc(96, 40, 14, -1.2, 1.4); g.stroke();
      break;
    case 'charge':
      E(20, 44); bang(g, 20, 14); warnBand(g, 32, 38, 108, 14); player(g, 78, 22); arrow(g, 78, 46, 78, 30, '#5aee6a');
      break;
    case 'slam':
      warnCircle(g, 70, 54, 22); arrow(g, 36, 26, 60, 44, '#ffffff', true); E(28, 30); player(g, 104, 56); okMark(g, 98, 40);
      break;
    case 'rain':
      for (const [x, y] of [[24, 24], [56, 50], [86, 22], [30, 58], [92, 56]]) warnCircle(g, x, y, 12);
      if (en.proj) for (const [x, y] of [[24, 14], [86, 12]]) drawProj(g, en.proj, x, y, 0, Math.PI / 2);
      player(g, 60, 26); okMark(g, 66, 6);
      break;
    case 'summon': {
      E(56, 46);
      const mob = enemySprite(en.minion?.sprite || en.sprite, en.minion?.pal || en.pal);
      for (const [x, y] of [[24, 30], [88, 30], [56, 68]]) sprite(g, mob, x, y, Math.min(1, 14 / mob.height));
      break;
    }
    // ===== モブの特殊攻撃 =====
    case 'leaf': case 'snowball': case 'fireball': case 'dark':
      E(18, 44); player(g, 96, 46);
      if (kind === 'dark') { g.strokeStyle = '#c47aff'; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(30, 36); g.quadraticCurveTo(60, 8, 88, 36); g.stroke(); g.setLineDash([]); drawProj(g, 'dark', 60, 18, 0); }
      else for (const k of [0.25, 0.5]) drawProj(g, kind, 18 + 74 * k, 36 + (kind === 'leaf' ? Math.sin(k * 12) * 6 : 0), k, 0);
      if (kind === 'snowball') { g.globalAlpha = 0.7; g.fillStyle = '#9fe6ff'; g.beginPath(); g.ellipse(96, 47, 8, 3, 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
      arrow(g, 96, 30, 96, 14, '#5aee6a');
      break;
    case 'needle':
      E(18, 44); for (const k of [-0.3, 0, 0.3]) for (const r of [26, 46]) drawProj(g, 'needle', 18 + Math.cos(k) * r, 36 + Math.sin(k) * r, 0, k);
      player(g, 96, 18); okMark(g, 104, 4);
      break;
    case 'bubble':
      E(18, 44); for (const k of [-0.45, 0, 0.45]) drawProj(g, 'bubble', 18 + Math.cos(k) * 40, 36 + Math.sin(k) * 40, 0);
      player(g, 96, 46);
      break;
    case 'crystal':
      E(56, 44); for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; drawProj(g, 'crystal', 56 + Math.cos(a) * 26, 36 + Math.sin(a) * 20, 0, a); }
      player(g, 92, 66); okMark(g, 100, 52);
      break;
    case 'bone':
      E(18, 44); drawProj(g, 'bone', 66, 36, 0.3); arrow(g, 30, 34, 86, 34, '#ffffff', true); arrow(g, 86, 40, 32, 40, '#ffd23a', true); player(g, 96, 22);
      break;
    case 'star':
      E(56, 44); for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; drawProj(g, 'star', 56 + Math.cos(a) * 30, 36 + Math.sin(a) * 22, 0); }
      player(g, 100, 66);
      break;
    case 'spore': case 'poison':
      E(18, 44); g.strokeStyle = '#ffffff'; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(26, 30); g.quadraticCurveTo(52, 0, 74, 40); g.stroke(); g.setLineDash([]);
      puddle(g, 78, 48, 16, kind === 'poison'); player(g, 102, 30); arrow(g, 92, 40, 100, 34, '#5aee6a');
      break;
    case 'icicle': case 'bolt':
      warnCircle(g, 64, 50, 14);
      if (kind === 'bolt') { g.strokeStyle = '#ffe14d'; g.lineWidth = 2; g.beginPath(); g.moveTo(66, 2); g.lineTo(60, 20); g.lineTo(68, 26); g.lineTo(62, 46); g.stroke(); }
      else { g.fillStyle = '#9fe6ff'; g.beginPath(); g.moveTo(58, 10); g.lineTo(70, 10); g.lineTo(64, 34); g.closePath(); g.fill(); }
      E(18, 44); player(g, 100, 50); okMark(g, 96, 34);
      break;
    case 'beam':
      E(16, 44);
      if (big) { for (const k of [-0.3, 0, 0.3]) { g.save(); g.translate(16, 36); g.rotate(k); g.fillStyle = 'rgba(255,79,109,0.8)'; g.fillRect(0, -3, 110, 6); g.fillStyle = '#fff'; g.fillRect(0, -1, 110, 2); g.restore(); } player(g, 100, 62); }
      else { g.fillStyle = 'rgba(255,42,74,0.4)'; g.fillRect(28, 34, 84, 3); g.fillStyle = '#ff4f6d'; g.fillRect(28, 34, 84, 1); player(g, 84, 22); arrow(g, 84, 44, 84, 30, '#5aee6a'); }
      break;
    case 'flame':
      E(22, 46); sector(g, 22, 40, 0, big ? 80 : 56, big ? 0.5 : 0.45, 'rgba(255,42,74,0.15)'); flames(g, 22, 40, 0, big ? 80 : 56, big ? 0.5 : 0.45);
      player(g, 60, 16); okMark(g, 66, 2);
      break;
    case 'vine': case 'pinch':
      if (big) {
        E(56, 46);
        for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; sector(g, 56, 40, a, 34, 0.36); vineWhip(g, 56, 40, a, 34); }
        player(g, 92, 70); okMark(g, 100, 54);
      } else {
        sector(g, 30, 40, 0, kind === 'pinch' ? 30 : 44, kind === 'pinch' ? 0.9 : 0.65); E(30, 46);
        vineWhip(g, 30, 40, -0.4, kind === 'pinch' ? 30 : 44, kind === 'pinch' ? '#ff6a4a' : '#4a9a3a');
        player(g, 96, 46); okMark(g, 90, 30);
      }
      break;
    default:
      E(56, 44);
  }
  const url = toURL(c, 3);
  cache.set(key, url);
  return url;
}

/** 敵の絵（図鑑・ヘルプ用） */
export function enemyURL(en, big = false, unknown = false) {
  const s = enemySprite(en.sprite, en.pal, { crown: big });
  const key = 'en:' + en.sprite + JSON.stringify(en.pal) + big + unknown;
  if (cache.has(key)) return cache.get(key);
  let src = s;
  if (unknown) {
    // まだ出会っていない敵はシルエット
    const c = document.createElement('canvas');
    c.width = s.width; c.height = s.height;
    const g = c.getContext('2d');
    g.drawImage(s, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#3a2a40'; g.fillRect(0, 0, c.width, c.height);
    src = c;
  }
  const url = toURL(src, big ? 4 : 4);
  cache.set(key, url);
  return url;
}
