// ステージ（5部屋を縦に積んだマップ）の生成・当たり判定・背景の描き込み
import { T, floorTile, rockTile, spikeTile, wallDeco, rng, mix, light, dark } from './art.js';
import { ROOMS_PER_STAGE } from './data.js';

export const COLS = 15;          // マップ全体の列数
export const CORRIDOR = [3, 11]; // 歩ける列（両端含む）
export const ROOM_ROWS = 20;     // 1部屋の高さ（壁の行を除く）
const BLOCK = ROOM_ROWS + 1;     // 壁1行 + 部屋
const START_ROWS = 3;            // 一番下のスタート地点
export const GATE_COLS = [6, 7, 8];

// 部屋のレイアウト（9列×20行）  . 床  R 岩  ^ トゲ  ~ 水場
const LAYOUTS = [
  [
    '.........', '.........', '..R...R..', '.........', '.........',
    '....~....', '...~~~...', '....~....', '.........', '.R.....R.',
    '.........', '.........', '...^^^...', '.........', '.........',
    '..R...R..', '.........', '.........', '.........', '.........',
  ],
  [
    '.........', '...RRR...', '..RRRRR..', '..RRRRR..', '..^^.^^..',
    '....~....', '....~....', '....~....', '..^^.^^..', '..RRRRR..',
    '..RRRRR..', '...RRR...', '.........', '.........', '~.......~',
    '~~.....~~', '.........', '.........', '.........', '.........',
  ],
  [
    '.........', '.R.....R.', '.R..^..R.', '.R.....R.', '.........',
    '.........', '...RRR...', '.........', '.~~...~~.', '.~~...~~.',
    '.........', '...RRR...', '.........', '.........', 'R^.....^R',
    '.........', '....R....', '.........', '.........', '.........',
  ],
  [
    '.........', '.~~...~~.', '.~~~.~~~.', '..~~.~~..', '.........',
    '....R....', '...R.R...', '....R....', '.........', '^.......^',
    '^...~...^', '^.......^', '.........', '..R...R..', '..R...R..',
    '.........', '.........', '.........', '.........', '.........',
  ],
  [
    '.........', '.........', '.^^...^^.', '.^^...^^.', '.........',
    '...RRR...', '...R.R...', '.........', '.~.....~.', '.~..^..~.',
    '.~.....~.', '.........', '...RRR...', '.........', '..^...^..',
    '.........', 'R.......R', '.........', '.........', '.........',
  ],
  [
    '.........', 'RR.....RR', 'R.......R', '.........', '...~~~...',
    '..~~~~~..', '...~~~...', '.........', 'R..R.R..R', '.........',
    '.........', '.^.....^.', '.^.....^.', '.........', '...R.R...',
    '.........', '.........', '.........', '.........', '.........',
  ],
];
const BOSS_LAYOUT = [
  '.........', '.........', 'R.......R', '.........', '.........',
  '.........', '..~...~..', '.........', '.........', '.........',
  '.........', '.........', '.........', '..^...^..', '.........',
  '.........', 'R.......R', '.........', '.........', '.........',
];

// タイルの種類
export const TILE = { FLOOR: 0, ROCK: 1, SPIKE: 2, POOL: 3, WALL: 4, GATE: 5, OUT: 6 };

export class StageMap {
  constructor(stage) {
    this.stage = stage;
    this.biome = stage.biome;
    this.rows = ROOMS_PER_STAGE * BLOCK + START_ROWS;
    this.w = COLS * T;
    this.h = this.rows * T;
    this.tiles = new Uint8Array(COLS * this.rows);
    this.gateOpen = new Array(ROOMS_PER_STAGE).fill(false); // gateOpen[k] = 部屋kの上のゲート
    const r = rng(stage.n * 977 + 13);
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < COLS; col++) {
        let t = TILE.FLOOR;
        if (col < CORRIDOR[0] || col > CORRIDOR[1]) t = TILE.OUT;
        this.set(col, row, t);
      }
    }
    for (let k = 0; k < ROOMS_PER_STAGE; k++) {
      const top = this.roomTop(k);
      // 壁の行
      for (let col = CORRIDOR[0]; col <= CORRIDOR[1]; col++) {
        this.set(col, top, GATE_COLS.includes(col) ? TILE.GATE : TILE.WALL);
      }
      if (k === ROOMS_PER_STAGE - 1) for (const col of GATE_COLS) this.set(col, top, TILE.WALL);
      const layout = k === ROOMS_PER_STAGE - 1 ? BOSS_LAYOUT : LAYOUTS[Math.floor(r() * LAYOUTS.length)];
      const flip = r() < 0.5;
      for (let y = 0; y < ROOM_ROWS; y++) {
        const line = layout[y];
        for (let x = 0; x < 9; x++) {
          const ch = line[flip ? 8 - x : x];
          const t = ch === 'R' ? TILE.ROCK : ch === '^' ? TILE.SPIKE : ch === '~' ? TILE.POOL : TILE.FLOOR;
          this.set(CORRIDOR[0] + x, top + 1 + y, t);
        }
      }
    }
    this.render();
  }

  idx(col, row) { return row * COLS + col; }
  set(col, row, t) { this.tiles[this.idx(col, row)] = t; }
  get(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= this.rows) return TILE.OUT;
    return this.tiles[this.idx(col, row)];
  }
  /** 部屋kの壁の行（上端） */
  roomTop(k) { return (ROOMS_PER_STAGE - 1 - k) * BLOCK; }
  roomBottom(k) { return this.roomTop(k) + ROOM_ROWS; } // 部屋の最下行
  /** ピクセル座標 → 部屋番号 */
  roomAt(y) {
    const row = Math.floor(y / T);
    for (let k = 0; k < ROOMS_PER_STAGE; k++) if (row > this.roomTop(k) && row <= this.roomTop(k) + ROOM_ROWS) return k;
    return row > this.roomTop(0) ? 0 : ROOMS_PER_STAGE - 1;
  }
  startPos() { return { x: this.w / 2, y: (this.rows - 2) * T }; }

  /** 通れない？ */
  solidAt(px, py, flying = false) {
    const col = Math.floor(px / T), row = Math.floor(py / T);
    const t = this.get(col, row);
    if (t === TILE.OUT || t === TILE.WALL) return true;
    if (t === TILE.GATE) {
      const k = this.gateRoom(row);
      return !this.gateOpen[k];
    }
    if (t === TILE.ROCK) return !flying;
    return false;
  }
  gateRoom(row) {
    for (let k = 0; k < ROOMS_PER_STAGE; k++) if (this.roomTop(k) === row) return k;
    return -1;
  }
  tileAt(px, py) { return this.get(Math.floor(px / T), Math.floor(py / T)); }

  /** 箱（足元）が壁にぶつかるか */
  boxBlocked(x, y, hw, hh, flying) {
    return this.solidAt(x - hw, y - hh, flying) || this.solidAt(x + hw, y - hh, flying)
      || this.solidAt(x - hw, y + hh, flying) || this.solidAt(x + hw, y + hh, flying);
  }

  /** 軸ごとに動かして壁で止める */
  move(e, dx, dy, hw = 4, hh = 3, flying = false) {
    let blockedX = false, blockedY = false;
    if (dx) {
      if (!this.boxBlocked(e.x + dx, e.y, hw, hh, flying)) e.x += dx;
      else blockedX = true;
    }
    if (dy) {
      if (!this.boxBlocked(e.x, e.y + dy, hw, hh, flying)) e.y += dy;
      else blockedY = true;
    }
    return { blockedX, blockedY };
  }

  /** 部屋の中のランダムな床（出現位置用） */
  randomFloor(k, avoid, minDist = 60) {
    const top = this.roomTop(k) + 1;
    for (let i = 0; i < 40; i++) {
      const col = CORRIDOR[0] + Math.floor(Math.random() * 9);
      const row = top + Math.floor(Math.random() * (ROOM_ROWS - 1));
      if (this.get(col, row) !== TILE.FLOOR) continue;
      const x = col * T + T / 2, y = row * T + T / 2;
      if (avoid && Math.hypot(avoid.x - x, avoid.y - y) < minDist) continue;
      return { x, y };
    }
    return { x: this.w / 2, y: (top + 2) * T };
  }

  // ===== 背景を1枚の画像に描き込む =====
  render() {
    const B = this.biome;
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    const r = rng(this.stage.n * 131 + 7);

    // 床（大きなまだら模様：低周波ノイズで「別の色の地面」の島を作る）
    const GN = 3; // ノイズの格子間隔（タイル数）
    const gw = Math.ceil(COLS / GN) + 2, gh = Math.ceil(this.rows / GN) + 2;
    const grid = new Float32Array(gw * gh).map(() => r());
    const noiseAt = (x, y) => {
      const fx = x / GN, fy = y / GN;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const v = (a, b) => grid[Math.min(gh - 1, b) * gw + Math.min(gw - 1, a)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
    };
    const tilesA = [], tilesB = [];
    for (let i = 0; i < 8; i++) { tilesA.push(floorTile(B, i * 31 + 5)); tilesB.push(floorTile(B, i * 17 + 9, true)); }
    // まずは通常の床
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < COLS; col++) g.drawImage(tilesA[Math.floor(r() * 8)], col * T, row * T);
    // まだらの島をピクセル単位で重ねる
    const alt = document.createElement('canvas'); alt.width = this.w; alt.height = this.h;
    const ag = alt.getContext('2d');
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < COLS; col++) ag.drawImage(tilesB[Math.floor(r() * 8)], col * T, row * T);
    const base = g.getImageData(0, 0, this.w, this.h);
    const ad = ag.getImageData(0, 0, this.w, this.h).data;
    const bd = base.data;
    const edge = hex(mix(B.floorAlt[0], '#3a2a20', 0.25));
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const n = noiseAt(x / 16, y / 16);
      const i = (y * this.w + x) * 4;
      if (n > 0.6) { bd[i] = ad[i]; bd[i + 1] = ad[i + 1]; bd[i + 2] = ad[i + 2]; }
      else if (n > 0.585) { bd[i] = edge[0]; bd[i + 1] = edge[1]; bd[i + 2] = edge[2]; }
    }
    g.putImageData(base, 0, 0);

    // 外側（壁の外）
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < COLS; col++) {
      if (this.get(col, row) !== TILE.OUT) continue;
      g.fillStyle = B.side;
      g.globalAlpha = 0.55;
      g.fillRect(col * T, row * T, T, T);
      g.globalAlpha = 1;
    }
    // 通路の縁取り
    g.fillStyle = dark(B.side, 0.4);
    g.fillRect(CORRIDOR[0] * T - 2, 0, 2, this.h);
    g.fillRect((CORRIDOR[1] + 1) * T, 0, 2, this.h);

    // 水場（角を丸め、縁と波模様を自動で描く）
    const P = B.pool;
    const hi = light(P.color, 0.35), mid = light(P.color, 0.15), deep = dark(P.color, 0.12);
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < COLS; col++) {
      if (this.get(col, row) !== TILE.POOL) continue;
      const n = (dc, dr) => this.get(col + dc, row + dr) === TILE.POOL;
      const up = n(0, -1), dn = n(0, 1), lf = n(-1, 0), rt = n(1, 0);
      for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
        const wx = col * T + px, wy = row * T + py;
        // 外側の角を丸める
        const cTL = !up && !lf && px + py < 3, cTR = !up && !rt && (T - 1 - px) + py < 3;
        const cBL = !dn && !lf && px + (T - 1 - py) < 3, cBR = !dn && !rt && (T - 1 - px) + (T - 1 - py) < 3;
        if (cTL || cTR || cBL || cBR) continue;
        const dTop = up ? 99 : py, dBot = dn ? 99 : T - 1 - py, dL = lf ? 99 : px, dR = rt ? 99 : T - 1 - px;
        const dEdge = Math.min(dTop, dBot, dL, dR);
        let c;
        if (dEdge === 0) c = P.rim;
        else if (dEdge === 1) c = dTop === 1 ? deep : mid;
        else {
          const wave = (wy + Math.round(Math.sin(wx * 0.45 + wy * 0.1) * 1.5)) % 7;
          c = wave === 0 ? hi : (wy % 11 < 2 && (wx + wy) % 5 === 0 ? mid : P.color);
          if (P.kind === 'lava' && (wx * 7 + wy * 13) % 37 === 0) c = '#ffe14d';
        }
        g.fillStyle = c;
        g.fillRect(wx, wy, 1, 1);
      }
    }
    // トゲ
    const sp = spikeTile(B);
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < COLS; col++)
      if (this.get(col, row) === TILE.SPIKE) g.drawImage(sp, col * T, row * T);

    // 外周の飾り（サボテン・木など）
    for (let row = -1; row < this.rows; row += 2) {
      for (const side of [0, 1]) {
        if (r() < 0.25) continue;
        const d = wallDeco(B, Math.floor(r() * 1000));
        const colBase = side === 0 ? 0 : CORRIDOR[1] + 1;
        const x = colBase * T + Math.floor(r() * (3 * T - d.width));
        const y = row * T + Math.floor(r() * 8);
        g.drawImage(d, x, y);
      }
    }

    // 部屋の間の壁
    const rk = [rockTile(B, 3), rockTile(B, 4), rockTile(B, 5)];
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < COLS; col++) {
      const t = this.get(col, row);
      if (t === TILE.WALL) {
        g.drawImage(rk[(col + row) % 3], col * T, row * T - 4);
      } else if (t === TILE.ROCK) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(col * T + 1, row * T + T - 2, T - 2, 4);
        g.drawImage(rk[(col * 7 + row) % 3], col * T, row * T - 4);
      }
    }
    this.canvas = cv;
  }
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
