// ヘルプ用の「攻撃のしかた」の図（ドット絵の小さな図を描いて画像にする）
import { enemySprite, charSprite, toURL } from './art.js';
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
function bullet(g, x, y, col = '#ff4f6d') {
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
  const key = kind + en.sprite + JSON.stringify(en.pal) + big;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = cv();
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
      player(g, 60, 26); okMark(g, 66, 6);
      break;
    case 'summon': {
      E(56, 46);
      const mob = enemySprite(en.minion?.sprite || en.sprite, en.minion?.pal || en.pal);
      for (const [x, y] of [[24, 30], [88, 30], [56, 68]]) sprite(g, mob, x, y, Math.min(1, 14 / mob.height));
      break;
    }
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
