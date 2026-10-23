// ドット絵エンジン
// - 平坦な色で描いたマスクに、自動で「輪郭線」「光と影」「立体感」を付けて仕上げる
// - キャラは 髪・顔・服・足・アクセサリーのパーツを合成して作る
// - タイル・障害物・壁の飾りはシード付き乱数で描く（毎回同じ見た目になる）

// ===================== 色ユーティリティ =====================
const rgbCache = new Map();
export function hexToRgb(h) {
  if (rgbCache.has(h)) return rgbCache.get(h);
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16);
  const v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(h, v);
  return v;
}
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
// ハイライトは暖色寄り、影は寒色寄りにすると手描きっぽくなる
export const light = (c, t = 0.25) => mix(c, '#fff4d6', t);
export const dark = (c, t = 0.25) => mix(c, '#2a1840', t);
const OUTLINE = '#1e1226';

// シード付き乱数
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// ===================== マスク → 仕上げ描画 =====================
/**
 * grid[y][x] = null | { c: 色, flat: 陰影なし, layer: 名前, cast: 下に影を落とす }
 */
export function renderGrid(grid, opt = {}) {
  const h = grid.length, w = grid[0].length;
  const o = opt.outline === false ? 0 : 1;
  const [cv, g] = canvas(w + o * 2, h + o * 2);
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? null : grid[y][x]);

  // 立体感用：列ごとに同じレイヤーの連続区間を求める
  const rel = opt.volume ? [] : null;
  if (rel) {
    for (let y = 0; y < h; y++) rel.push(new Float32Array(w));
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        if (!grid[y][x]) { y++; continue; }
        const start = y;
        while (y < h && grid[y][x]) y++;
        const len = y - start;
        for (let k = start; k < y; k++) rel[k][x] = len > 3 ? (k - start) / (len - 1) : 0.5;
      }
    }
  }

  for (let y = -o; y < h + o; y++) {
    for (let x = -o; x < w + o; x++) {
      const cell = at(x, y);
      if (!cell) {
        if (!o) continue;
        let nb = null, under = false;
        const n4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of n4) {
          const n = at(x + dx, y + dy);
          if (n && !n.noOutline) { nb = n; if (dy === -1) under = true; }
        }
        if (nb) {
          g.fillStyle = mix(nb.c, OUTLINE, under ? 0.86 : 0.74);
          g.fillRect(x + o, y + o, 1, 1);
        }
        continue;
      }
      let c = cell.c;
      if (!cell.flat) {
        const up = at(x, y - 1), down = at(x, y + 1), right = at(x + 1, y), left = at(x - 1, y);
        if (up && up.cast && up.layer !== cell.layer) c = dark(c, 0.32);
        else if (!up) c = light(c, 0.3);
        else if (!down) c = dark(c, 0.3);
        else if (!right) c = dark(c, 0.16);
        else if (!left) c = light(c, 0.1);
        else if (rel) {
          const r = rel[y][x];
          if (r > 0.72) c = dark(c, 0.16);
          else if (r < 0.2) c = light(c, 0.1);
        }
        // 色の境目（同じレイヤーで別の色）に軽い影
        if (down && down.c !== cell.c && down.layer === cell.layer && opt.inner) c = dark(c, 0.1);
      }
      g.fillStyle = c;
      g.fillRect(x + o, y + o, 1, 1);
    }
  }
  return cv;
}

function emptyGrid(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill(null));
}

/** 文字のマスクをグリッドに重ねる */
function paint(grid, rows, map, layer, y0 = 0, x0 = 0) {
  rows.forEach((row, ry) => {
    const y = y0 + ry;
    if (y < 0 || y >= grid.length) return;
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === '.' || ch === ' ') continue;
      const x = x0 + rx;
      if (x < 0 || x >= grid[0].length) continue;
      const m = map[ch];
      if (!m) continue;
      grid[y][x] = typeof m === 'string' ? { c: m, layer } : { ...m, layer };
    }
  });
}

export function sprite(rows, pal, opt = {}) {
  const w = Math.max(...rows.map((r) => r.length));
  const grid = emptyGrid(w, rows.length);
  const map = {};
  for (const [k, v] of Object.entries(pal)) map[k] = typeof v === 'string' ? (FLAT.has(k) ? { c: v, flat: true } : v) : v;
  paint(grid, rows, map, 'main');
  return renderGrid(grid, opt);
}
const FLAT = new Set(['e', 'p', 'w', 'm', 'L', 'E', 'b', 'x']);

// ===================== キャラクター =====================
// 20x24 のパーツを合成する。顔5〜12行目、体13〜19行目、足20〜23行目
const FACE = [
  '....ssssssssssss....',
  '....ssssssssssss....',
  '....ssssssssssss....',
  '....ssLLssssLLss....',
  '....ssEwssssEwss....',
  '....sbEessssEebs....',
  '....sssssmmsssss....',
  '.....ssssssssss.....',
];
const BODY = [
  '......TTTTTTTT......',
  '.....ATTTCCTTTA.....',
  '....AATTTTTTTTAA....',
  '....sATTTTTTTTAs....',
  '.....BBBBBBBBBB.....',
  '.....KKKKKKKKKK.....',
  '....KKKKKKKKKKKK....',
];
const BODY_PANTS = [
  '......TTTTTTTT......',
  '.....ATTTCCTTTA.....',
  '....AATTTTTTTTAA....',
  '....sATTTTTTTTAs....',
  '.....BBBBBBBBBB.....',
  '......KKKKKKKK......',
  '......KKKKKKKK......',
];
const LEGS = {
  idle: ['.......gg..gg.......', '.......gg..gg.......', '.......FF..FF.......', '......FFF..FFF......'],
  walk1: ['.......gg..gg.......', '.......FF..gg.......', '......FFF..FF.......', '...........FFF......'],
  walk2: ['.......gg..gg.......', '.......gg..FF.......', '.......FF..FFF......', '......FFF...........'],
};

const HAIR = {
  short: {
    front: [
      '......HHHHHHHH......',
      '.....HHHHHHHHHH.....',
      '....HHHHHHHHHHHH....',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHH.HH.HHHH...',
      '...HHH.H....H.HHH...',
      '...HH..........HH...',
      '...HH..........HH...',
      '...H............H...',
    ],
  },
  spiky: {
    front: [
      '.....H...HH...H.....',
      '....HHH.HHHH.HHH....',
      '....HHHHHHHHHHHH....',
      '...HHHHHHHHHHHHHH...',
      '..HHHHHHHHHHHHHHHH..',
      '...HHHHHHHHHHHHHH...',
      '...HHH.HHHHH.HHHH...',
      '...HH.H.....H.HHH...',
      '...HH..........HH...',
      '...H............H...',
    ],
  },
  bob: {
    front: [
      '......HHHHHHHH......',
      '.....HHHHHHHHHH.....',
      '....HHHHHHHHHHHH....',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHH........HHH...',
      '...HHH........HHH...',
      '...HHH........HHH...',
      '..HHHH........HHHH..',
      '..HHH..........HHH..',
    ],
  },
  twin: {
    front: [
      '......HHHHHHHH......',
      '.....HHHHHHHHHH.....',
      '....HHHHHHHHHHHH....',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHHH.HHH.HHHH...',
      '...HHH.H.....HHHH...',
      '...HH..........HH...',
      '...HH..........HH...',
      '...HH..........HH...',
      '...H............H...',
    ],
    back: [
      '....................',
      '....................',
      '....................',
      '..QQ............QQ..',
      '.HHHH..........HHHH.',
      'HHHHH..........HHHHH',
      'HHHH............HHHH',
      'HHH..............HHH',
      'HHH..............HHH',
      'HHH..............HHH',
      '.HHH............HHH.',
      '.HHH............HHH.',
      '.HH..............HH.',
      '..HH............HH..',
      '..H..............H..',
    ],
  },
  long: {
    front: [
      '......HHHHHHHH......',
      '.....HHHHHHHHHH.....',
      '....HHHHHHHHHHHH....',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHHH.HHH.HHHH...',
      '...HHH.H.....HHHH...',
      '...HH..........HH...',
      '...HH..........HH...',
      '...HH..........HH...',
      '...H............H...',
    ],
    back: [
      '....................',
      '....................',
      '....................',
      '....................',
      '..HH............HH..',
      '..HHH..........HHH..',
      '..HHH..........HHH..',
      '..HHH..........HHH..',
      '..HHH..........HHH..',
      '..HHH..........HHH..',
      '..HHH..........HHH..',
      '..HHH..........HHH..',
      '..HHH..........HHH..',
      '..HHHH........HHHH..',
      '..HHHH........HHHH..',
      '...HHH........HHH...',
      '...HH..........HH...',
    ],
  },
  pony: {
    front: [
      '......HHHHHHHH......',
      '.....HHHHHHHHHH.....',
      '....HHHHHHHHHHHH....',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHHHHHHHHHHHH...',
      '...HHHH.HHHHH.HHH...',
      '...HH.H......H.HH...',
      '...HH..........HH...',
      '...H............H...',
    ],
    back: [
      '................Q...',
      '...............HHH..',
      '...............HHHH.',
      '................HHHH',
      '................HHHH',
      '.................HHH',
      '.................HHH',
      '................HHH.',
      '................HH..',
      '...............HH...',
    ],
  },
};

const ACC = {
  visor: { layer: 'front', y: 8, rows: ['....VVVVVVVVVVVV....', '...VVwVVVVVVVVwVV...'], map: { V: 'acc1', w: '#ffffff' }, flatKeys: ['w'] },
  foxEars: { layer: 'front', y: 0, rows: ['..HH............HH..', '..HYH..........HYH..', '...HH..........HH...'], map: { H: 'hair', Y: 'acc1' } },
  catEars: { layer: 'front', y: 0, rows: ['...H............H...', '..HYH..........HYH..', '..HHH..........HHH..'], map: { H: 'hair', Y: 'acc1' } },
  horns: { layer: 'front', y: 0, rows: ['...R............R...', '...RR..........RR...', '....RR........RR....'], map: { R: 'acc1' } },
  antenna: { layer: 'front', y: 0, rows: ['..R..............R..', '..RR............RR..', '...RR..........RR...'], map: { R: 'acc1' } },
  starClip: { layer: 'front', y: 3, rows: ['....Y...............', '...YYY..............', '....Y...............'], map: { Y: 'acc1' } },
  witchHat: {
    layer: 'front', y: -1,
    rows: [
      '..........PP........',
      '.........PPP........',
      '........PPPP........',
      '.......PPPPPP.......',
      '......qqqqqqqq......',
      '..PPPPPPPPPPPPPPPP..',
      '...PPPPPPPPPPPPPP...',
    ],
    map: { P: 'acc1', q: 'acc2' },
  },
  headband: { layer: 'front', y: 4, rows: ['...BBBBBBBBBBBBBB...'], map: { B: 'acc1' } },
  cap: {
    layer: 'front', y: 1,
    rows: [
      '.....PPPPPPPPPP.....',
      '....PPPPPPPPPPPP....',
      '...PPPPPPqPPPPPPP...',
      '...PPPPPPPPPPPPPP...',
      '..PPPPPPPPPPPPPPPP..',
    ],
    map: { P: 'acc1', q: 'acc2' },
  },
  wings: {
    layer: 'back', y: 11,
    rows: [
      'WW................WW',
      'WWW..............WWW',
      'WWWW............WWWW',
      '.WWW............WWW.',
      '..WW............WW..',
      '...W............W...',
    ],
    map: { W: 'acc2' },
  },
  halo: { layer: 'front', y: 0, rows: ['......YYYYYYYY......', '.....Y........Y.....'], map: { Y: 'acc1' }, flatKeys: ['Y'] },
  bigRibbon: {
    layer: 'front', y: 1,
    rows: ['..RR............RR..', '.RRRR..........RRRR.', '..RR............RR..'],
    map: { R: 'acc1' },
  },
  headphones: { layer: 'front', y: 7, rows: ['..PP............PP..', '..PP............PP..', '..PP............PP..'], map: { P: 'acc2' } },
};

const charCache = new Map();
/**
 * @param {object} def CHARACTERS の look
 * @param {'idle'|'walk1'|'walk2'} frame
 */
export function charSprite(def, frame = 'idle') {
  const key = def.id + frame;
  if (charCache.has(key)) return charCache.get(key);
  const L = def.look;
  const P = {
    s: L.skin || '#ffdcc4', H: L.hair, E: L.eye, e: light(L.eye, 0.45), L: dark(L.eye, 0.75), w: '#ffffff',
    b: '#ff9aa8', m: '#c4405a', T: L.top, C: L.collar, A: L.sleeve || L.top, B: L.belt, K: L.bottom,
    g: L.legs, F: L.shoes, Q: L.acc1 || '#ffffff',
  };
  const flatMap = (keys) => {
    const m = {};
    for (const k of keys) m[k] = FLAT.has(k) ? { c: P[k], flat: true } : P[k];
    return m;
  };
  const grid = emptyGrid(20, 24);
  const hair = HAIR[L.hairStyle];
  const accs = (L.acc || []).map((a) => ACC[a]).filter(Boolean);
  const accMap = (a) => {
    const m = {};
    for (const [k, v] of Object.entries(a.map)) {
      const c = v === 'hair' ? L.hair : v === 'acc1' ? L.acc1 : v === 'acc2' ? L.acc2 : v;
      m[k] = (a.flatKeys || []).includes(k) ? { c, flat: true } : c;
    }
    return m;
  };
  for (const a of accs) if (a.layer === 'back') paint(grid, a.rows, accMap(a), 'acc', a.y);
  if (hair.back) paint(grid, hair.back, { H: P.H, Q: P.Q }, 'hairB', 0);
  paint(grid, LEGS[frame], flatMap(['g', 'F']), 'legs', 20);
  paint(grid, L.pants ? BODY_PANTS : BODY, flatMap(['T', 'C', 'A', 'B', 'K', 's']), 'body', 13);
  paint(grid, FACE, flatMap(['s', 'L', 'E', 'e', 'w', 'b', 'm']), 'face', 5);
  paint(grid, hair.front, { H: { c: P.H, cast: true } }, 'hair', 0);
  for (const a of accs) if (a.layer === 'front') paint(grid, a.rows, accMap(a), 'acc', a.y);
  const cv = renderGrid(grid, { inner: true });
  charCache.set(key, cv);
  return cv;
}

// ===================== 敵 =====================
const ENEMY_ROWS = {
  slime: [
    '......AAAA......',
    '....AAAAAAAA....',
    '...AAAAAAAAAA...',
    '..AAAwAAAAAAAA..',
    '..AAwwAAAAAAAA..',
    '.AAAAAAAAAAAAAA.',
    '.AAAApAAAApAAAA.',
    '.AAAApAAAApAAAA.',
    '.AAAAAAmmAAAAAA.',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    '.AAAAAAAAAAAAAA.',
    '..BBBBBBBBBBBB..',
  ],
  mushroom: [
    '....AAAAAA....',
    '..AAAAAAAAAA..',
    '.AAwwAAAAwwAA.',
    'AAAwwAAAAAwwAA',
    'AAAAAAAAAAAAAA',
    '.BBBBBBBBBBBB.',
    '...CCCCCCCC...',
    '...CpCCCCpC...',
    '...CpCCCCpC...',
    '...CCCmmCCC...',
    '...CCCCCCCC...',
    '....CCCCCC....',
    '...DD....DD...',
  ],
  bat: [
    'A..............A',
    'AA....A..A....AA',
    'AAA...AAAA...AAA',
    'AAAA.AAAAAA.AAAA',
    'AAAAAAeAAeAAAAAA',
    'AAAAAAAAAAAAAAAA',
    '.AAA.AAmmAA.AAA.',
    '.AA...AAAA...AA.',
    '.A.....AA.....A.',
  ],
  ghost: [
    '....AAAAAA....',
    '..AAAAAAAAAA..',
    '.AAAAAAAAAAAA.',
    '.AAAAAAAAAAAA.',
    'AAAppAAAAppAAA',
    'AAAppAAAAppAAA',
    'AAAAAAAAAAAAAA',
    'AAAAAAmmAAAAAA',
    'AAAAAAmmAAAAAA',
    'AAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAA',
    'AAA..AAAA..AAA',
    '.A....AA....A.',
  ],
  drone: [
    'BBB........BBB',
    '.B....BB....B.',
    '..BAAAAAAAAB..',
    '.AAAAAAAAAAAA.',
    'AAAAAAAAAAAAAA',
    'AAApeeeeeepAAA',
    'AAApeeeeeepAAA',
    'AAAAppppppAAAA',
    '.AAAAAAAAAAAA.',
    '..BBAAAAAABB..',
    '...B......B...',
  ],
  golem: [
    '......AAAAAAAAAA......',
    '.....AAAAAAAAAAAA.....',
    '....AAAAAAAAAAAAAA....',
    '....AAAeeAAAAeeAAA....',
    '....AAAAAAAAAAAAAA....',
    '..BBAAAAmmmmmmAAAABB..',
    '.BBBBAAAAAAAAAAAABBBB.',
    'BBBBBBAAAAAAAAAABBBBBB',
    'BBBBBBAACCCCCCAABBBBBB',
    'BBBB.BAACCeeCCAAB.BBBB',
    'BBBB.BAAACCCCAAAB.BBBB',
    '.BB..AAAAAAAAAAAA..BB.',
    '.BB..AAAAAAAAAAAA..BB.',
    '..B..AAAAAAAAAAAA..B..',
    '.....AAAAAAAAAAAA.....',
    '.....AAAAA..AAAAA.....',
    '.....BBBBB..BBBBB.....',
    '....BBBBBB..BBBBBB....',
  ],
  crown: [
    '......Y..YY..Y......',
    '......YYYYYYYY......',
    '......YrYYYYrY......',
  ],
};

const enemyCache = new Map();
export function enemySprite(type, pal, opt = {}) {
  const key = type + JSON.stringify(pal) + (opt.flash ? 'f' : '') + (opt.crown ? 'c' : '');
  if (enemyCache.has(key)) return enemyCache.get(key);
  const rows = ENEMY_ROWS[type];
  const w = rows[0].length;
  const extra = opt.crown ? 3 : 0;
  const grid = emptyGrid(w, rows.length + extra);
  const c = (k, d) => pal[k] || d;
  const map = {
    A: c('A', '#7cd36a'), B: c('B', dark(c('A', '#7cd36a'), 0.35)), C: c('C', '#ffe9c8'), D: c('D', '#6a4a3a'),
    e: { c: c('e', '#fff27a'), flat: true }, p: { c: '#1e1226', flat: true }, w: { c: '#ffffff', flat: true }, m: { c: '#3a1a2a', flat: true },
  };
  if (opt.flash) for (const k of Object.keys(map)) map[k] = { c: '#ffffff', flat: true };
  paint(grid, rows, map, 'main', extra);
  if (opt.crown) {
    const cw = ENEMY_ROWS.crown[0].length;
    paint(grid, ENEMY_ROWS.crown, { Y: '#ffd23a', r: { c: '#ff3b5c', flat: true } }, 'crown', 0, Math.round((w - cw) / 2));
  }
  const cv = renderGrid(grid, { volume: true });
  enemyCache.set(key, cv);
  return cv;
}

// ===================== アイコン（スキル・装備・タブ） =====================
const ICON_ROWS = {
  sword: ['.........AA.', '........AwA.', '.......AwA..', '......AwA...', '.....AwA....', '.BB.AwA.....', '..BBwA......', '..BBB.......', '.BCBBB......', 'BCB..B......', 'BB..........'],
  heart: ['............', '.AAA...AAA..', 'AwwAA.AAAAA.', 'AwAAAAAAAAA.', 'AAAAAAAAAAA.', '.AAAAAAAAA..', '..AAAAAAA...', '...AAAAA....', '....AAA.....', '.....A......'],
  boot: ['...AAAA.....', '...AwAA.....', '...AAAA.....', '...AAAA.....', '...AAAA.....', '...AAAAA....', '..AAAAAAAA..', '..AAAAAAAAA.', '..BBBBBBBBB.'],
  clock: ['...AAAAA....', '..AwwwwwA...', '.AwwwBwwwA..', '.AwwwBwwwA..', '.AwwwBBBwA..', '.AwwwwwwwA..', '..AwwwwwA...', '...AAAAA....'],
  magnet: ['AAA...BBB...', 'AAA...BBB...', 'AwA...BwB...', 'AAA...BBB...', 'AAA...BBB...', 'AAAA.BBBB...', '.AAAABBBB...', '..AAABBB....'],
  star: ['.....A......', '....AAA.....', '....AwA.....', 'AAAAAwAAAAA.', '.AAAAAAAAA..', '..AAAAAAA...', '..AAAAAAA...', '.AAA...AAA..', '.AA.....AA..'],
  shield: ['.AAAAAAAAA..', '.AwwAAAAAA..', '.AwAAABAAA..', '.AAAABBBAA..', '.AAAAABAAA..', '..AAAAAAA...', '...AAAAA....', '....AAA.....'],
  fire: ['.....A......', '....AA......', '....AAA..A..', '...AAAA.AA..', '..AAAAAAAA..', '..AABBAAAA..', '.AABBBBAAA..', '.AABwwBBAA..', '..ABwwBBA...', '...AAAAA....'],
  bolt: ['......AAA...', '.....AAA....', '....AAA.....', '...AAAAAA...', '.....AAA....', '....AAA.....', '...AAA......', '..AA........'],
  bomb: ['........B...', '.......B.C..', '......B.....', '...AAAAA....', '..AwwAAAA...', '.AAwAAAAAA..', '.AAAAAAAAA..', '.AAAAAAAAA..', '..AAAAAAA...', '...AAAAA....'],
  drone: ['BBB.....BBB.', '.B...B...B..', '..AAAAAAA...', '.AAAAAAAAA..', '.AAwwwwwAA..', '.AAAAAAAAA..', '..AAAAAAA...', '...B...B....'],
  rocket: ['.........AA.', '........AwA.', '.......AAAA.', '......AAAA..', '..B..AAAA...', '...BAAAA....', '...AAAA.....', '..CCAB......', '.CC.B.......', 'CC..........'],
  arrow: ['........AAA.', '.........AA.', '........A.A.', '.......A....', '......A.....', '.....A......', '.B..A.......', '..BA........', '.BBB........', 'B...........'],
  note: ['.....AAAAA..', '.....AAAAA..', '.....A...A..', '.....A...A..', '.....A...A..', '..AAAA.AAA..', '.AAAAAAAAA..', '.AAAA.AAAA..', '..AA...AA...'],
  snow: ['.....A......', '...A.A.A....', '....AAA.....', '.AA.AwA.AA..', '...AAAAA....', '.AA.AAA.AA..', '....AAA.....', '...A.A.A....', '.....A......'],
  axe: ['....AAAA....', '...AwAAAA...', '..AwAAAAB...', '..AAAAAB....', '...AAABB....', '......BB....', '.....BB.....', '....BB......', '...BB.......', '..BB........'],
  scythe: ['..AAAAAAA...', '.AwwAAAAAA..', 'AA.....AAB..', '.......BB...', '......BB....', '.....BB.....', '....BB......', '...BB.......', '..BB........'],
  orb: ['...AAAAA....', '..AwwAAAA...', '.AwwAAAAAA..', '.AwAAAAAAA..', '.AAAAAAAAA..', '.AAAAAAABA..', '..AAAAABA...', '...AAAAA....'],
  multi: ['............', '.AA..AA..AA.', 'AwAAAwAAAwAA', 'AAAAAAAAAAAA', '.AA..AA..AA.', '............'],
  area: ['...A...A....', '....A.A.....', '.A..AAA..A..', '..AAAwAAA...', '...AwwwA....', '..AAAwAAA...', '.A..AAA..A..', '....A.A.....', '...A...A....'],
  plus: ['....AAA.....', '....AwA.....', '....AAA.....', '.AAAAAAAAA..', '.AwwAAAAAA..', '.AAAAAAAAA..', '....AAA.....', '....AAA.....', '....AAA.....'],
  book: ['.AAAAAAAAA..', 'AwwwwAwwwwA.', 'AwBBwAwBBwA.', 'AwwwwAwwwwA.', 'AwBBwAwBBwA.', 'AwwwwAwwwwA.', 'AAAAAAAAAAA.', '.CCCCCCCCC..'],
  skull: ['..AAAAAAA...', '.AAAAAAAAA..', 'AAAAAAAAAAA.', 'AApAAAAApAA.', 'AApppAppAAA.', 'AAAAAAAAAAA.', '.AAApApAAA..', '..AAAAAAA...', '..A.A.A.A...'],
  // 装備
  staff: ['........AAA.', '.......AwwA.', '.......AwAA.', '......BAAA..', '.....BB.....', '....BB......', '...BB.......', '..BB........', '.BB.........', 'BB..........'],
  gun: ['............', 'AAAAAAAAAAA.', 'AwwwwwwwwAA.', 'AAAAAAAAAAA.', '...AABAA....', '...AAB......', '...AAA......', '...AAA......'],
  bow: ['..AA........', '...AA..B....', '....A.B.....', '....AB......', '....BA......', '...B.A......', '..B..A......', '....AA......', '..AA........'],
  helmet: ['...AAAAA....', '..AwwAAAA...', '.AwAAAAAAA..', '.AAAAAAAAA..', '.AABBBBBAA..', '.AAB...BAA..', '.AAA...AAA..', '.AA.....AA..'],
  hat: ['......AA....', '.....AAA....', '....AAAA....', '...AAwAAA...', '...BBBBBB...', 'AAAAAAAAAAA.', '.AAAAAAAAA..'],
  armor: ['.AAA...AAA..', 'AAAAAAAAAAA.', 'AwwAABAAAAA.', '.AwAABAAAA..', '.AAAABAAAA..', '.AAAABAAAA..', '.AAAAAAAAA..', '..AAAAAAA...'],
  robe: ['...AAAAA....', '..AAAwAAA...', '.AAAAwAAAA..', '.AAAAwAAAA..', '.AAAAwAAAA..', 'AAAAAwAAAAA.', 'AAAAAAAAAAA.', 'BBBBBBBBBBB.'],
  glove: ['..A.A.A.....', '..AAAAAA....', '..AwAAAA.A..', '..AAAAAAAA..', '..AAAAAAA...', '...AAAAA....', '...BBBBB....', '...BBBBB....'],
  pendant: ['.B.......B..', '..B.....B...', '...B...B....', '....BBB.....', '....AAA.....', '...AwAAA....', '...AAAAA....', '....AAA.....'],
  ring: ['....AAA.....', '...AwAAA....', '....AAA.....', '...BBBBB....', '..BB...BB...', '..B.....B...', '..BB...BB...', '...BBBBB....'],
  // タブ
  castle: ['A.A.....A.A.', 'AAA.....AAA.', 'AAA.A.A.AAA.', 'AAAAAAAAAAA.', 'AAwAAAAAwAA.', 'AAAAABAAAAA.', 'AAAABBBAAAA.', 'AAAABBBAAAA.'],
  altar: ['....AAA.....', '...AwAAA....', '....AAA.....', '.....B......', '..BBBBBBB...', '...CCCCC....', '...CCCCC....', '.BBBBBBBBB..'],
  gear: ['....AA......', '.A.AAAA.A...', '..AAAAAAA...', '.AAA..AAAA..', 'AAA....AAA..', '.AAA..AAAA..', '..AAAAAAA...', '.A.AAAA.A...', '....AA......'],
  coin: ['...AAAA...', '..AwAAAA..', '.AwAAAABA.', '.AwAAAABA.', '.AAAAAABA.', '.AAAABBBA.', '..ABBBBA..', '...AAAA...'],
  gem: ['..AAAA....', '.AwAAAA...', 'AwAAAAAA..', 'AAAAAAAB..', '.AAAAAB...', '..AAAB....', '...AB.....'],
  gift: ['...B..B.....', '....BB......', 'AAAAABAAAAA.', 'AwwAABAAAAA.', 'AAAAABAAAAA.', '.AAAABAAAA..', '.AAAABAAAA..', '.AAAABAAAA..', '.AAAABAAAA..'],
  scroll: ['.BBBBBBBBB..', 'BwwwwwwwwwB.', '.AwBBBBBwA..', '.AwwwwwwwA..', '.AwBBBBwwA..', '.AwwwwwwwA..', '.AwBBBBBwA..', 'BwwwwwwwwwB.', '.BBBBBBBBB..'],
  calendar: ['.B.....B....', 'AAAAAAAAAA..', 'ABBBBBBBBA..', 'AwwwwwwwwA..', 'AwBwBwBwwA..', 'AwwwwwwwwA..', 'AwBwBwCCwA..', 'AwwwwwCCwA..', 'AAAAAAAAAA..'],
  ticket: ['AAAAAAAAAAA.', 'AwwAAAAAAAA.', '.AAAABAAAA..', 'AAAABBBAAAA.', '.AAAABAAAA..', 'AAAAAAAAAAA.'],
  check: ['.........AA.', '........AA..', '.......AA...', 'AA....AA....', '.AA..AA.....', '..AAAA......', '...AA.......'],
  lock: ['...AAA....', '..A...A...', '..A...A...', '.BBBBBBB..', '.BBBwBBB..', '.BBBwBBB..', '.BBBBBBB..'],
};

const iconCache = new Map();
/** @param {string} name @param {string} color メイン色 @param {string} [color2] 柄など */
export function icon(name, color, color2) {
  const key = name + color + color2;
  if (iconCache.has(key)) return iconCache.get(key);
  const rows = ICON_ROWS[name] || ICON_ROWS.star;
  const cv = sprite(rows, { A: color, B: color2 || dark(color, 0.45), C: light(color, 0.4), w: '#ffffff', p: '#1e1226' }, { volume: true });
  iconCache.set(key, cv);
  return cv;
}

const urlCache = new Map();
/** キャンバスを拡大してdataURL化（imgタグ用） */
export function toURL(cv, scale = 4, key) {
  if (key && urlCache.has(key + scale)) return urlCache.get(key + scale);
  const [c, g] = canvas(cv.width * scale, cv.height * scale);
  g.drawImage(cv, 0, 0, c.width, c.height);
  const url = c.toDataURL();
  if (key) urlCache.set(key + scale, url);
  return url;
}

// ===================== 小物（ジェム・コインなど） =====================
export const PICKUP = {
  gem: (col) => sprite(['..AA..', '.AwAA.', 'AwAAAA', 'AAAAAB', '.AAAB.', '..AB..'], { A: col, B: dark(col, 0.4), w: '#ffffff' }),
  coin: () => sprite(['.AAAA.', 'AwAAAA', 'AwAABA', 'AAAABA', 'AABBBA', '.AAAA.'], { A: '#ffcf3a', B: '#d68a12', w: '#fff6c0' }),
  heart: () => sprite(['.AA.AA.', 'AwAAAAA', 'AAAAAAA', '.AAAAA.', '..AAA..', '...A...'], { A: '#ff4f6d', w: '#ffffff' }),
  magnet: () => sprite(['AA..BB', 'AA..BB', 'AA..BB', 'AAABBB', '.AABB.'], { A: '#ff3b5c', B: '#3f8cff' }),
};

// ===================== タイル =====================
export const T = 16; // タイルサイズ

function noisePixels(g, r, base, specks, density = 0.35) {
  g.fillStyle = base;
  g.fillRect(0, 0, T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (r() < density) { g.fillStyle = specks[Math.floor(r() * specks.length)]; g.fillRect(x, y, 1, 1); }
  }
}

/** 床タイル（バイオームごと・バリエーション付き） */
export function floorTile(biome, seed, alt = false) {
  const [c, g] = canvas(T, T);
  const r = rng(seed);
  const F = alt ? biome.floorAlt : biome.floor;
  switch (biome.style) {
    case 'grass': {
      noisePixels(g, r, F[0], [F[1], F[2]], 0.3);
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const x = 1 + Math.floor(r() * 13), y = 2 + Math.floor(r() * 12);
        g.fillStyle = dark(F[0], 0.3); g.fillRect(x, y, 1, 2); g.fillRect(x + 2, y, 1, 2); g.fillRect(x + 1, y + 1, 1, 1);
        g.fillStyle = light(F[0], 0.35); g.fillRect(x, y - 1, 1, 1); g.fillRect(x + 2, y - 1, 1, 1);
      }
      if (r() < 0.12) {
        const x = 3 + Math.floor(r() * 9), y = 3 + Math.floor(r() * 9);
        const pc = r() < 0.5 ? '#ffffff' : '#ffe14d';
        g.fillStyle = pc; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1);
        g.fillStyle = '#ff8a3a'; g.fillRect(x, y, 1, 1);
      }
      break;
    }
    case 'desert': {
      noisePixels(g, r, F[0], [F[1], F[2]], 0.22);
      g.fillStyle = light(F[0], 0.18);
      const y = 3 + Math.floor(r() * 10);
      for (let x = 0; x < T; x++) if (r() < 0.75) g.fillRect(x, y + Math.round(Math.sin(x * 0.7) * 1), 1, 1);
      if (r() < 0.25) { g.fillStyle = dark(F[0], 0.35); g.fillRect(Math.floor(r() * 14), Math.floor(r() * 14), 2, 1); }
      if (r() < 0.12) { // 小さな草
        const x = 2 + Math.floor(r() * 11), yy = 3 + Math.floor(r() * 10);
        g.fillStyle = '#9a8a3a'; g.fillRect(x, yy, 1, 2); g.fillRect(x - 1, yy - 1, 1, 1); g.fillRect(x + 1, yy - 1, 1, 1);
      }
      break;
    }
    case 'snow': {
      noisePixels(g, r, F[0], [F[1], F[2]], 0.2);
      if (r() < 0.4) { g.fillStyle = '#ffffff'; const x = Math.floor(r() * 15), y = Math.floor(r() * 15); g.fillRect(x, y, 1, 1); }
      if (r() < 0.3) { g.fillStyle = dark(F[0], 0.12); const x = Math.floor(r() * 12), y = Math.floor(r() * 14); g.fillRect(x, y, 4, 1); g.fillRect(x + 1, y + 1, 2, 1); }
      break;
    }
    case 'cyber': {
      g.fillStyle = F[0]; g.fillRect(0, 0, T, T);
      g.fillStyle = light(F[0], 0.12); g.fillRect(0, 0, T, 1); g.fillRect(0, 0, 1, T);
      g.fillStyle = dark(F[0], 0.35); g.fillRect(0, T - 1, T, 1); g.fillRect(T - 1, 0, 1, T);
      g.fillStyle = dark(F[0], 0.2);
      for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) g.fillRect(x, y, 1, 1);
      if (r() < 0.08) { g.fillStyle = F[2]; const y = 4 + Math.floor(r() * 8); g.fillRect(3, y, 10, 1); g.globalAlpha = 0.3; g.fillRect(3, y - 1, 10, 3); g.globalAlpha = 1; }
      else if (r() < 0.2) { g.fillStyle = F[1]; g.fillRect(5, 5, 6, 6); g.fillStyle = dark(F[1], 0.3); g.fillRect(6, 6, 4, 4); }
      break;
    }
    case 'volcano': {
      noisePixels(g, r, F[0], [F[1], F[2]], 0.3);
      if (r() < 0.35) {
        let x = Math.floor(r() * 16), y = Math.floor(r() * 16);
        for (let i = 0; i < 9; i++) {
          g.fillStyle = i % 3 === 0 ? '#ffd23a' : '#ff6a1a';
          g.fillRect(x, y, 1, 1);
          x += Math.floor(r() * 3) - 1; y += r() < 0.6 ? 1 : 0;
        }
      }
      break;
    }
    case 'castle': {
      g.fillStyle = dark(F[0], 0.35); g.fillRect(0, 0, T, T);
      const rows = [[0, 0], [8, 4]];
      for (let by = 0; by < 4; by++) {
        const off = by % 2 ? 4 : 0;
        for (let bx = -1; bx < 3; bx++) {
          const x = bx * 8 + off, y = by * 4;
          const col = r() < 0.2 ? F[1] : F[0];
          g.fillStyle = col; g.fillRect(x + 1, y + 1, 7, 3);
          g.fillStyle = light(col, 0.15); g.fillRect(x + 1, y + 1, 7, 1);
        }
      }
      void rows;
      if (r() < 0.15) { g.fillStyle = F[2]; g.fillRect(Math.floor(r() * 14), Math.floor(r() * 14), 2, 2); }
      break;
    }
  }
  return c;
}

/** 岩ブロック（通れない障害物） */
export function rockTile(biome, seed) {
  const [c, g] = canvas(T, T + 4);
  const r = rng(seed);
  const base = biome.rock;
  const top = light(base, 0.12), side = dark(base, 0.35), edge = mix(base, OUTLINE, 0.78);
  // 側面（高さ）
  g.fillStyle = side; g.fillRect(1, 12, 14, 6);
  g.fillStyle = dark(side, 0.2); g.fillRect(1, 17, 14, 1);
  // 上面
  g.fillStyle = top; g.fillRect(1, 1, 14, 12);
  g.fillStyle = light(top, 0.3); g.fillRect(1, 1, 14, 1); g.fillRect(1, 1, 1, 11);
  g.fillStyle = dark(top, 0.12); g.fillRect(14, 2, 1, 11);
  // ヒビ
  g.fillStyle = dark(top, 0.4);
  for (let k = 0; k < 2; k++) {
    let x = 3 + Math.floor(r() * 9), y = 3 + Math.floor(r() * 4);
    for (let i = 0; i < 5; i++) {
      g.fillRect(x, y, 1, 1);
      x += Math.floor(r() * 3) - 1; y += 1;
      if (y > 11) break;
    }
  }
  g.fillStyle = light(top, 0.25);
  g.fillRect(3 + Math.floor(r() * 8), 3 + Math.floor(r() * 6), 2, 1);
  // 輪郭（角を丸める）
  g.fillStyle = edge;
  g.fillRect(2, 0, 12, 1); g.fillRect(2, 18, 12, 1); g.fillRect(0, 2, 1, 15); g.fillRect(15, 2, 1, 15);
  g.fillRect(1, 1, 1, 1); g.fillRect(14, 1, 1, 1); g.fillRect(1, 17, 1, 1); g.fillRect(14, 17, 1, 1);
  g.fillStyle = mix(side, OUTLINE, 0.4); g.fillRect(1, 12, 14, 1);
  if (biome.style === 'snow') { g.fillStyle = '#ffffff'; g.fillRect(2, 1, 12, 2); g.fillRect(3, 3, 3, 1); g.fillRect(9, 3, 4, 1); }
  if (biome.style === 'cyber') { g.fillStyle = '#ffd23a'; for (let x = 2; x < 14; x += 4) { g.fillRect(x, 14, 2, 3); } }
  return c;
}

/** トゲ床 */
export function spikeTile(biome) {
  const [c, g] = canvas(T, T);
  const s = biome.spike || '#d8dce8';
  const cone = ['..a..', '..ab.', '.aab.', '.aabb', 'aaabb', 'ccccc'];
  for (const [ox, oy] of [[0, 1], [5, 1], [10, 1], [2, 8], [7, 8], [12, 8]]) {
    cone.forEach((row, y) => {
      for (let x = 0; x < 5; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        g.fillStyle = ch === 'a' ? light(s, 0.2) : ch === 'b' ? dark(s, 0.35) : 'rgba(0,0,0,0.3)';
        g.fillRect(ox + x, oy + y, 1, 1);
      }
    });
  }
  return c;
}

// ===================== 外周の飾り =====================
export function wallDeco(biome, seed) {
  const r = rng(seed);
  switch (biome.style) {
    case 'desert': {
      // サボテン
      const rows = [
        '....AAA.....',
        '...AAwAA....',
        '...AAwAA....',
        'AA.AAwAA....',
        'AA.AAwAA.AA.',
        'AA.AAwAA.AA.',
        'AAAAAwAA.AA.',
        '.AAAAwAAAAA.',
        '...AAwAAAA..',
        '...AAwAA....',
        '...AAwAA....',
        '...AAwAA....',
        '...AAwAA....',
        '...AAAAA....',
        '..BBBBBBB...',
      ];
      return sprite(rows, { A: '#3fae5a', w: { c: '#7ad87a', flat: false }, B: '#a0603a' }, { volume: true });
    }
    case 'grass': {
      const rows = [
        '.....AAAAAA.....',
        '...AAAAAAAAAA...',
        '..AAAAAAAAAAAA..',
        '.AAAAAAAAAAAAAA.',
        '.AAAAAAAAAAAAAA.',
        'AAAAAAAAAAAAAAAA',
        'AAAAAAAAAAAAAAAA',
        'AAAAAAAAAAAAAAAA',
        '.AAAAAAAAAAAAAA.',
        '.AAAAAAAAAAAAAA.',
        '..AAAAAAAAAAAA..',
        '....AAABBAAA....',
        '.......BB.......',
        '.......BB.......',
        '......BBBB......',
      ];
      const leaf = r() < 0.5 ? '#3f9a3f' : '#4aaa48';
      return sprite(rows, { A: leaf, B: '#7a4a2a' }, { volume: true });
    }
    case 'snow': {
      const rows = [
        '......W.....',
        '.....WWW....',
        '....WAAAW...',
        '...AAAAAAA..',
        '....WWWWW...',
        '...WAAAAAW..',
        '..AAAAAAAAA.',
        '...WWWWWWW..',
        '..WAAAAAAAW.',
        '.AAAAAAAAAAA',
        '.....BB.....',
        '.....BB.....',
      ];
      return sprite(rows, { A: '#2f7a5a', W: '#f4faff', B: '#6a4a3a' }, { volume: true });
    }
    case 'cyber': {
      const h = 18 + Math.floor(r() * 14);
      const [c, g] = canvas(16, h + 2);
      const base = r() < 0.5 ? '#2a2d48' : '#33264a';
      g.fillStyle = mix(base, OUTLINE, 0.6); g.fillRect(0, 2, 16, h);
      g.fillStyle = base; g.fillRect(1, 3, 14, h - 2);
      g.fillStyle = light(base, 0.15); g.fillRect(1, 3, 14, 1);
      for (let y = 5; y < h - 2; y += 3) for (let x = 3; x < 13; x += 3) {
        if (r() < 0.55) { g.fillStyle = r() < 0.5 ? '#36f2ff' : r() < 0.5 ? '#ff5fd0' : '#ffd23a'; g.fillRect(x, y, 2, 1); }
      }
      g.fillStyle = '#ff3b5c'; g.fillRect(7, 0, 1, 3);
      return c;
    }
    case 'volcano': {
      const rows = ['....AAAA....', '..AAAAAAAA..', '.AAAAAAAAAA.', 'AAAAAAAAAAAA', 'AAAABAAAAAAA', 'AAABBBAAAAAA', 'AAAAAAAABAAA', '.AAAAAAABBA.'];
      return sprite(rows, { A: '#4a3634', B: '#ff7a2a' }, { volume: true });
    }
    case 'castle': {
      const rows = ['.....AA.....', '....AwwA....', '.....AA.....', '....BBBB....', '.....CC.....', '.....CC.....', '.....CC.....', '.....CC.....', '....CCCC....'];
      return sprite(rows, { A: '#ffb03a', w: '#fff3a0', B: '#6a6a7a', C: '#4a4a5a' });
    }
  }
  return canvas(1, 1)[0];
}

// ===================== UIフレーム（9スライス用） =====================
/** パネル枠の画像（border-image用dataURL） */
export function frameURL(kind) {
  const S = 12;
  const [c, g] = canvas(S * 2, S * 2);
  const P = {
    panel: ['#1e1226', '#46c9b8', '#256e66', '#4a3528', '#3d2b20'],
    paper: ['#5a3a20', '#e8d8b0', '#c8b084', '#f6ecd2', '#efe2c4'],
    gold: ['#3a2410', '#ffd86a', '#b4802a', '#5a3a26', '#4a2f1e'],
    dark: ['#120a16', '#7a6a8a', '#3a2e48', '#2a2032', '#231a2a'],
  }[kind];
  const [out, rim, rimD, fill, fill2] = P;
  const W = S * 2;
  g.fillStyle = fill2; g.fillRect(3, 3, W - 6, W - 6);
  g.fillStyle = fill; g.fillRect(3, 3, W - 6, W / 2 - 3);
  // 外枠（角を欠けさせる）
  g.fillStyle = out;
  g.fillRect(2, 0, W - 4, 1); g.fillRect(2, W - 1, W - 4, 1); g.fillRect(0, 2, 1, W - 4); g.fillRect(W - 1, 2, 1, W - 4);
  g.fillRect(1, 1, 1, 1); g.fillRect(W - 2, 1, 1, 1); g.fillRect(1, W - 2, 1, 1); g.fillRect(W - 2, W - 2, 1, 1);
  // リム
  g.fillStyle = rim;
  g.fillRect(2, 1, W - 4, 1); g.fillRect(1, 2, 1, W - 4); g.fillRect(2, 2, 1, 1); g.fillRect(W - 3, 2, 1, 1);
  g.fillStyle = rimD;
  g.fillRect(2, W - 2, W - 4, 1); g.fillRect(W - 2, 2, 1, W - 4); g.fillRect(2, W - 3, 1, 1); g.fillRect(W - 3, W - 3, 1, 1);
  g.fillStyle = out;
  g.fillRect(3, 2, W - 6, 1); g.fillRect(2, 3, 1, W - 6); g.fillRect(3, W - 3, W - 6, 1); g.fillRect(W - 3, 3, 1, W - 6);
  return c.toDataURL();
}

/** 上下の飾り帯の模様タイル */
export function bandURL() {
  const [c, g] = canvas(16, 16);
  g.fillStyle = '#b39a60'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#c4ad74';
  // 剣が交差したような模様
  for (let i = 0; i < 6; i++) { g.fillRect(4 + i, 3 + i, 1, 1); g.fillRect(10 - i, 3 + i, 1, 1); }
  g.fillRect(3, 9, 3, 1); g.fillRect(10, 9, 3, 1);
  g.fillStyle = '#9e8650'; g.fillRect(0, 15, 16, 1);
  return c.toDataURL();
}

/** メニュー背景の模様タイル */
export function patternURL(base, dot) {
  const [c, g] = canvas(16, 16);
  g.fillStyle = base; g.fillRect(0, 0, 16, 16);
  g.fillStyle = dot;
  g.fillRect(7, 2, 2, 2); g.fillRect(6, 3, 4, 1);
  g.fillRect(0, 10, 1, 1); g.fillRect(15, 10, 1, 1);
  g.fillRect(3, 12, 1, 1); g.fillRect(12, 6, 1, 1);
  return c.toDataURL();
}
