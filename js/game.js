// 戦闘エンジン（5部屋を進む縦スクロール・サバイバー）
import { charSprite, enemySprite, icon, PICKUP, light } from './art.js';
import { StageMap, TILE, CORRIDOR, GATE_COLS } from './stage.js';
import { SKILLS, WEAPON_MAX, MAX_ACTIVES, MAX_PASSIVES, ROOMS_PER_STAGE, expNeed } from './data.js';
import { T } from './art.js';
import { sfx, playBgm } from './audio.js';
import { MOBS, BOSSES, WEAPON_EL, WEAK_MUL } from './enemies.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const ENEMY_BASE = {
  slime: { hp: 9, spd: 24, dmg: 6, r: 6, fly: false, exp: 1 },
  mushroom: { hp: 13, spd: 21, dmg: 7, r: 6, fly: false, exp: 1 },
  bat: { hp: 6, spd: 40, dmg: 5, r: 5, fly: true, exp: 1 },
  ghost: { hp: 11, spd: 30, dmg: 7, r: 6, fly: true, exp: 2 },
  drone: { hp: 8, spd: 37, dmg: 6, r: 6, fly: true, exp: 1 },
  golem: { hp: 10, spd: 17, dmg: 12, r: 10, fly: false, exp: 30 },
  crab: { hp: 12, spd: 26, dmg: 7, r: 6, fly: false, exp: 1 },
  eye: { hp: 9, spd: 26, dmg: 6, r: 6, fly: true, exp: 1 },
  skull: { hp: 11, spd: 27, dmg: 7, r: 6, fly: false, exp: 1 },
  wisp: { hp: 7, spd: 30, dmg: 6, r: 5, fly: true, exp: 1 },
};

// ===== 3x5 ドット数字 =====
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};
function drawNumber(g, n, x, y, color) {
  const s = String(n);
  const w = s.length * 4 - 1;
  const cx = Math.round(x - w / 2), cy = Math.round(y);
  g.fillStyle = '#2a1626';
  let px = cx;
  for (const ch of s) {
    const d = DIGITS[ch];
    for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (d[r][q] === '1') g.fillRect(px + q - 1, cy + r - 1, 3, 3);
    px += 4;
  }
  g.fillStyle = color;
  px = cx;
  for (const ch of s) {
    const d = DIGITS[ch];
    for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (d[r][q] === '1') g.fillRect(px + q, cy + r, 1, 1);
    px += 4;
  }
}

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opt { stage, char, stats, hud, onLevelUp(choices, done), onEnd(result) }
   */
  constructor(canvas, opt) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.opt = opt;
    this.stage = opt.stage;
    this.biome = opt.stage.biome;
    this.char = opt.char;
    this.base = opt.stats;
    this.hud = opt.hud;
    this.map = new StageMap(this.stage);
    this.running = false;
    this.paused = false;
    this.keys = new Set();
    this.joy = { active: false, dx: 0, dy: 0 };
    this._loop = this._loop.bind(this);
    this.resize();
    this.reset();
  }

  reset() {
    const b = this.base;
    const sp = this.map.startPos();
    this.t = 0;
    this.kills = 0;
    this.gold = 0;
    this.level = 1;
    this.exp = 0;
    this.need = expNeed(1);
    this.pendingLv = 0;
    this.player = { x: sp.x, y: sp.y, hp: b.hp, maxHp: b.hp, iframe: 0, face: 1, mx: 0, my: -1, moving: false, anim: 0, hazardT: 0 };
    this.enemies = [];
    this.spawns = [];
    this.bullets = [];
    this.ebullets = [];
    this.gems = [];
    this.pickups = [];
    this.fx = [];
    this.nums = [];
    this.room = 0;
    this.roomKills = 0;
    this.roomSpawned = 0;
    this.roomT = 0;
    this.roomActive = true;
    this.boss = null;
    this.ended = false;
    this.shake = 0;
    this.superT = 0;
    this.flash = 0;
    this.actives = [{ id: this.char.weapon, lv: 1, t: 0 }];
    this.passives = {};
    this.orbitAngle = 0;
    this.spawnAcc = 0;
    this.eliteDone = false;
    this.helpQueue = [];
    this.helpAsked = new Set();
    this.curSrc = null; // いまダメージを与えている武器（弱点の判定用）
    this.recalc();
    this.camY = this.player.y - this.vh * 0.6;
  }

  quota(k) {
    return 14 + k * 5 + Math.min(10, Math.floor(this.stage.n / 2) * 2);
  }

  recalc() {
    const b = this.base;
    const lv = (id) => this.passives[id] || 0;
    const oldMax = this.player.maxHp;
    this.rs = {
      atk: b.atk * (1 + 0.12 * lv('atkUp')),
      cdMul: 1 / (1 + b.cd + 0.09 * lv('cdUp')),
      spd: b.moveSpeed * (1 + 0.08 * lv('spdUp')),
      crit: Math.min(0.9, b.crit + 0.06 * lv('crit')),
      area: 1 + (b.area || 0) + 0.12 * lv('area'),
      multi: lv('multi'),
      exp: 1 + b.exp + 0.12 * lv('expUp'),
      def: b.def,
      armor: Math.min(0.7, b.armor + 0.08 * lv('armor')),
      regen: lv('regen') + (b.regen || 0),
      slow: b.slow,
      lifesteal: b.lifesteal,
    };
    const maxHp = Math.round(b.hp * (1 + 0.15 * lv('hpUp')));
    this.player.maxHp = maxHp;
    if (maxHp > oldMax) this.player.hp += maxHp - oldMax;
    this.player.hp = Math.min(this.player.hp, maxHp);
  }

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const box = this.cv.parentElement;
    const cw = (box && box.clientWidth) || window.innerWidth, ch = (box && box.clientHeight) || window.innerHeight;
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    this.cv.width = W;
    this.cv.height = H;
    // 通路（9マス+α）が横幅に収まる最大の整数倍
    this.S = Math.max(1, Math.floor(Math.min(W / 176, H / 250)));
    this.vw = W / this.S;
    this.vh = H / this.S;
    this.g.imageSmoothingEnabled = false;
  }

  start() { this.running = true; this.last = performance.now(); requestAnimationFrame(this._loop); }
  stop() { this.running = false; }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.last = performance.now(); }

  _loop(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (!this.paused) this.update(dt);
    this.render();
    requestAnimationFrame(this._loop);
  }

  // ===================== 更新 =====================
  update(dt) {
    this.t += dt;
    this.roomT += dt;
    const P = this.player, M = this.map;

    let dx = 0, dy = 0;
    if (this.keys.has('left')) dx -= 1;
    if (this.keys.has('right')) dx += 1;
    if (this.keys.has('up')) dy -= 1;
    if (this.keys.has('down')) dy += 1;
    if (this.joy.active) { dx = this.joy.dx; dy = this.joy.dy; }
    const len = Math.hypot(dx, dy);
    P.moving = len > 0.1;
    const under = M.tileAt(P.x, P.y);
    let spd = this.rs.spd;
    if (under === TILE.POOL) spd *= 0.6;
    if (P.moving) {
      const m = Math.min(1, len);
      dx /= len; dy /= len;
      M.move(P, dx * spd * m * dt, dy * spd * m * dt, 4, 3);
      P.mx = dx; P.my = dy;
      if (Math.abs(dx) > 0.2) P.face = dx > 0 ? 1 : -1;
      P.anim += dt * 8;
    }
    if (P.iframe > 0) P.iframe -= dt;
    if (this.superT > 0) this.superT -= dt;
    if (this.flash > 0) this.flash -= dt;

    // 足元の危険地帯
    P.hazardT -= dt;
    if (P.hazardT <= 0) {
      if (under === TILE.SPIKE) { this.hurtPlayer(P.maxHp * 0.07, true); P.hazardT = 0.6; sfx('spike'); }
      else if (under === TILE.POOL && this.biome.pool.effect === 'hurt') { this.hurtPlayer(P.maxHp * 0.04, true); P.hazardT = 0.5; }
    }
    if (this.rs.regen) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.004 * this.rs.regen * dt);

    this.updateRoom(dt);
    this.buildGrid();
    this.updateEnemies(dt);
    this.updateWeapons(dt);
    this.updateBullets(dt);
    this.updateEBullets(dt);
    this.updateGems(dt);
    this.updateFx(dt);
    if (this.shake > 0) this.shake -= dt;

    // カメラ（縦スクロール）
    const target = P.y - this.vh * 0.58;
    this.camY += (target - this.camY) * Math.min(1, dt * 6);
    this.camY = Math.max(0, Math.min(M.h - this.vh, this.camY));

    if (this.clearing) {
      this.clearT += dt;
      const left = this.gems.length + this.pickups.filter((p) => p.kind === 'coin').length;
      if (!this.ended && ((left === 0 && this.clearT > 1.2) || this.clearT > 6)) this.finish(true);
    } else {
      if (P.hp <= 0 && !this.ended) this.finish(false);
      // クリアが決まった後はスキル選択を出さない
      if (this.pendingLv > 0 && !this.ended) this.triggerLevelUp();
      // 初めて出会った敵の説明（スキル選択の後）
      if (!this.paused && this.helpQueue.length && !this.ended && this.opt.onHelp) {
        const h = this.helpQueue.shift();
        this.pause();
        this.opt.onHelp(h, () => this.resume());
      }
    }
    this.updateHud();
  }

  // ===== 部屋の進行 =====
  updateRoom(dt) {
    const M = this.map, P = this.player;
    const isBoss = this.room === ROOMS_PER_STAGE - 1;
    // 次の部屋に入ったか
    if (this.room < ROOMS_PER_STAGE - 1 && M.gateOpen[this.room]) {
      const wallY = M.roomTop(this.room) * T;
      if (P.y < wallY - 5) {
        M.gateOpen[this.room] = false; // 後ろのゲートを閉じる
        this.room++;
        this.roomKills = 0; this.roomSpawned = 0; this.roomT = 0; this.roomActive = true;
        this.banner(this.room === ROOMS_PER_STAGE - 1 ? 'BOSS ROOM' : `ROOM ${this.room + 1} / ${ROOMS_PER_STAGE}`);
        if (this.room === ROOMS_PER_STAGE - 1) playBgm('boss');
        sfx('gate');
        // 前の部屋の敵は消える
        for (const e of this.enemies) if (!e.boss) { e.dead = true; this.puff(e.x, e.y); }
      }
    }
    if (!this.roomActive || this.clearing) return;
    const k = this.room;
    if (isBoss) {
      if (!this.boss && this.roomT > 1.2) this.spawnBoss();
      if (this.boss && this.roomT > 3) {
        this.spawnAcc = (this.spawnAcc || 0) + dt * (0.9 + this.stage.n * 0.05);
        while (this.spawnAcc >= 1) { this.spawnAcc -= 1; if (this.enemies.length < 40) this.queueSpawn(); }
      }
      return;
    }
    const q = this.quota(k);
    // エリートは3部屋目の開始時
    if (k === 2 && !this.eliteDone && this.roomT > 2) {
      this.eliteDone = true;
      this.queueSpawn('elite');
      this.banner('エリート出現！');
    }
    const rate = 1.3 + k * 0.35 + this.roomT / 18;
    this.spawnAcc = (this.spawnAcc || 0) + dt * rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.roomSpawned < q + 6 && this.enemies.length + this.spawns.length < 55) this.queueSpawn();
    }
    if (this.roomKills >= q) {
      this.roomActive = false;
      M.gateOpen[k] = true;
      this.banner('ゲートが開いた！ ↑');
      sfx('gate');
    }
  }

  queueSpawn(forceType) {
    const pos = this.map.randomFloor(this.room, this.player, 64);
    let id;
    if (forceType === 'elite') id = this.biome.elite;
    else {
      const list = this.biome.mobs;
      const roll = Math.random();
      const idx = this.room === 0 ? (roll < 0.75 ? 0 : 1) : roll < 0.45 ? 0 : roll < 0.75 ? 1 : 2;
      id = list[Math.min(idx, list.length - 1)];
    }
    this.spawns.push({ x: pos.x, y: pos.y, id, t: 0.7, elite: forceType === 'elite' });
    this.roomSpawned++;
  }

  addEnemy(s) {
    const def = MOBS[s.id] || MOBS.g_slime;
    const B = ENEMY_BASE[def.sprite];
    const growth = 1 + this.room * 0.12 + this.roomT / 90;
    const e = {
      x: s.x, y: s.y, id: s.id, type: def.sprite, pal: def.pal, pattern: def.pattern, weak: def.weak,
      hp: B.hp * def.hp * this.stage.hpMul * growth, maxHp: 0,
      spd: B.spd * def.spd * rand(0.9, 1.1), dmg: B.dmg * this.stage.dmgMul, r: B.r, fly: B.fly || def.pattern === 'phase', exp: B.exp,
      size: 1, flash: 0, hits: {}, kvx: 0, kvy: 0, slowT: 0, bob: Math.random() * 6,
      st: 0, pt: rand(1.2, 2.8), side2: Math.random() < 0.5 ? -1 : 1, ph: Math.random() * 6,
    };
    if (s.elite) { e.hp *= 3.2; e.elite = true; }
    if (s.mini) { e.mini = true; e.size = 0.62; e.hp *= 0.3; e.spd *= 1.35; e.r = Math.max(3, Math.round(e.r * 0.6)); }
    e.maxHp = e.hp;
    this.enemies.push(e);
    this.noticeEnemy(e);
    return e;
  }

  /** 初めて見る敵なら説明を出す（モブは行動パターンごと、ボスは1体ごと） */
  noticeEnemy(e) {
    const o = this.opt;
    if (o.onSeen) o.onSeen(e.boss ? 'boss' : 'mob', e.id);
    const key = e.boss ? 'boss:' + e.id : 'pattern:' + e.pattern;
    if (this.helpAsked.has(key)) return;
    this.helpAsked.add(key);
    if (o.needHelp && o.needHelp(e.boss ? 'boss' : 'pattern', e.boss ? e.id : e.pattern)) {
      this.helpQueue.push(e.boss ? { kind: 'boss', id: e.id } : { kind: 'mob', id: e.id, pattern: e.pattern });
    }
  }

  spawnBoss() {
    const M = this.map;
    const top = M.roomTop(this.room);
    const id = this.biome.boss;
    const def = BOSSES[id];
    const b = {
      x: M.w / 2, y: (top + 5) * T, id, type: def.sprite, pal: def.pal, weak: def.weak,
      hp: 0, maxHp: 0, spd: def.spd, dmg: 14 * this.stage.dmgMul, r: Math.max(14, Math.round(6.5 * def.size)), fly: !!def.fly, exp: 0,
      size: def.size, boss: true, flash: 0, hits: {}, kvx: 0, kvy: 0, slowT: 0, bob: 0, z: 0,
      attacks: def.attacks, ai: { i: 0, t: 2.2, act: null, enraged: false }, def,
    };
    b.hp = b.maxHp = 520 * this.stage.hpMul * def.hp;
    this.enemies.push(b);
    this.boss = b;
    this.puff(b.x, b.y, 30);
    this.shake = 0.4;
    sfx('boss');
    this.noticeEnemy(b);
  }

  puff(x, y, n = 8) {
    for (let i = 0; i < n; i++) this.fx.push({ kind: 'dust', x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-30, 30), vy: rand(-40, 5), life: rand(0.3, 0.6), max: 0.6 });
  }

  // ===== 空間グリッド =====
  buildGrid() {
    const G = new Map();
    for (const e of this.enemies) {
      const k = ((e.x >> 5) * 73856093) ^ ((e.y >> 5) * 19349663);
      let arr = G.get(k);
      if (!arr) G.set(k, (arr = []));
      arr.push(e);
    }
    this.grid = G;
  }
  query(x, y, r, out = []) {
    out.length = 0;
    const x0 = (x - r) >> 5, x1 = (x + r) >> 5, y0 = (y - r) >> 5, y1 = (y + r) >> 5;
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const arr = this.grid.get((gx * 73856093) ^ (gy * 19349663));
      if (arr) for (const e of arr) out.push(e);
    }
    return out;
  }

  updateEnemies(dt) {
    const P = this.player, M = this.map;
    for (const s of this.spawns) {
      s.t -= dt;
      if (s.t <= 0) { this.addEnemy(s); this.puff(s.x, s.y, 6); }
    }
    this.spawns = this.spawns.filter((s) => s.t > 0);
    const tmp = [];
    const slowAll = 1 - this.rs.slow;
    for (const e of this.enemies) {
      if (e.dead) continue;
      let dx = P.x - e.x, dy = P.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      // 行動パターンごとの動き（tx,ty＝進む向き / mul＝速さの倍率）
      const mv = e.boss ? this.updateBoss(e, dt, dx, dy, d) : this.updatePattern(e, dt, dx, dy, d);
      if (e.dead) continue;
      let tx = mv.tx, ty = mv.ty;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      let sx = 0, sy = 0, c = 0;
      this.query(e.x, e.y, 12, tmp);
      for (const o of tmp) {
        if (o === e || c > 4) continue;
        const ox = e.x - o.x, oy = e.y - o.y;
        const od = ox * ox + oy * oy;
        const rr = (e.r + o.r) * 0.85;
        if (od < rr * rr && od > 0.001) { const f = (rr - Math.sqrt(od)) / rr; sx += ox * f; sy += oy * f; c++; }
      }
      if (e.slowT > 0) e.slowT -= dt;
      const sp = e.spd * mv.mul * slowAll * (e.slowT > 0 ? 0.55 : 1);
      const mvx = (tx * sp + sx * 5 + e.kvx) * dt, mvy = (ty * sp + sy * 5 + e.kvy) * dt;
      const hw = Math.min(6, e.r * 0.7), hh = Math.min(4, e.r * 0.5);
      const res = M.move(e, mvx, mvy, hw, hh, e.fly || e.z > 4);
      // 岩に引っかかったら横に回り込む（突進中は止まる）
      if (e.st === 2 && (res.blockedX || res.blockedY)) e.pt = Math.min(e.pt, 0.05);
      else {
        if (res.blockedX && !res.blockedY) M.move(e, 0, Math.sign(ty || 1) * sp * dt, hw, hh, e.fly);
        if (res.blockedY && !res.blockedX) {
          if (!e.side) e.side = Math.random() < 0.5 ? -1 : 1;
          M.move(e, e.side * sp * dt, 0, hw, hh, e.fly);
        } else e.side = 0;
      }
      e.kvx *= 0.85; e.kvy *= 0.85;
      if (e.flash > 0) e.flash -= dt;
      e.bob += dt * 8;
      // 体当たり（消えている間・ジャンプ中は当たらない）
      if (d < e.r + 5 && !e.hidden && !(e.z > 4)) this.hurtPlayer(e.dmg);
    }
  }

  /** モブの行動パターン */
  updatePattern(e, dt, dx, dy, d) {
    let tx = dx, ty = dy, mul = 1;
    e.tele = false;
    switch (e.pattern) {
      case 'dash': {
        // 止まって構える →「！」→ まっすぐ突進 → 少し休む
        e.pt -= dt;
        if (e.st === 1) { mul = 0; e.tele = true; if (e.pt <= 0) { e.st = 2; e.pt = 0.5; } }
        else if (e.st === 2) { tx = e.ax; ty = e.ay; mul = 4.2; if (e.pt <= 0) { e.st = 3; e.pt = 0.7; } }
        else if (e.st === 3) { mul = 0; if (e.pt <= 0) { e.st = 0; e.pt = rand(2, 3.2); } }
        else if (e.pt <= 0 && d < 140) {
          e.st = 1; e.pt = 0.65; e.ax = dx; e.ay = dy;
          this.fx.push({ kind: 'warnLine', x: e.x, y: e.y, ax: dx, ay: dy, len: 90, life: 0.65, max: 0.65 });
        } else if (e.pt <= 0) e.pt = 0.4;
        break;
      }
      case 'shooter': {
        // 距離をとって弾を撃つ
        if (d < 70) { tx = -dx; ty = -dy; mul = 0.9; }
        else if (d < 110) { tx = -dy * e.side2; ty = dx * e.side2; mul = 0.55; }
        e.pt -= dt;
        e.tele = e.pt < 0.35 && d < 180;
        if (e.pt <= 0) {
          if (d < 180) {
            const sp = 72;
            this.ebullets.push({ x: e.x, y: e.y - 6, vx: dx * sp, vy: dy * sp, life: 3.2, dmg: e.dmg * 0.8, color: e.pal.C || e.pal.e });
            e.pt = rand(2.3, 3.1);
          } else e.pt = 0.5;
        }
        break;
      }
      case 'swoop': {
        // ジグザグに飛ぶ
        const w = Math.sin(this.t * 4.5 + e.ph) * 0.95;
        tx = dx - dy * w; ty = dy + dx * w;
        mul = 1.05;
        break;
      }
      case 'phase': {
        // 3秒見える → 1.4秒消える
        e.pt -= dt;
        if (e.pt <= 0) { e.hidden = !e.hidden; e.pt = e.hidden ? 1.4 : rand(2.6, 3.4); }
        e.fading = !e.hidden && e.pt < 0.4;
        mul = e.hidden ? 1.25 : 1;
        break;
      }
      case 'bomber': {
        // 近づいたら止まって点滅 → 爆発
        if (e.st === 1) {
          mul = 0; e.tele = true;
          e.pt -= dt;
          if (e.pt <= 0) {
            const R = 32;
            this.fx.push({ kind: 'boom', x: e.x, y: e.y, R, life: 0.3, max: 0.3, color: e.pal.A });
            if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < R + 4) this.hurtPlayer(e.dmg * 2);
            sfx('boom');
            this.shake = 0.2;
            e.exploded = true;
            this.kill(e);
          }
        } else if (d < 26) {
          e.st = 1; e.pt = 0.9;
          this.fx.push({ kind: 'warn', x: e.x, y: e.y, R: 32, life: 0.9, max: 0.9 });
        }
        break;
      }
      case 'tank': {
        // 近づくと地面をたたく（赤い円 → 衝撃波）
        e.pt -= dt;
        if (e.st === 1) {
          mul = 0; e.tele = true;
          if (e.pt <= 0) {
            const R = 46;
            this.fx.push({ kind: 'boom', x: e.x, y: e.y, R, life: 0.35, max: 0.35, color: '#c8b8a0' });
            if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < R + 4) this.hurtPlayer(e.dmg * 1.2);
            sfx('boom');
            this.shake = 0.25;
            e.st = 2; e.pt = 0.9;
          }
        } else if (e.st === 2) { mul = 0; if (e.pt <= 0) { e.st = 0; e.pt = rand(3.5, 5); } }
        else if (e.pt <= 0 && d < 64) {
          e.st = 1; e.pt = 0.9;
          this.fx.push({ kind: 'warn', x: e.x, y: e.y, R: 46, life: 0.9, max: 0.9 });
        } else if (e.pt <= 0) e.pt = 0.5;
        break;
      }
      default: break; // chase / split：まっすぐ近づく
    }
    return { tx, ty, mul };
  }

  // ===================== ボス =====================
  updateBoss(e, dt, dx, dy, d) {
    const A = e.ai;
    const enr = e.hp < e.maxHp * 0.5;
    if (enr && !A.enraged) { A.enraged = true; this.banner(`${e.def.name}が怒った！`); e.spd *= 1.15; }
    e.tele = false;
    if (!A.act) {
      A.t -= dt * (enr ? 1.45 : 1);
      if (A.t <= 0) this.bossStart(e, e.attacks[A.i++ % e.attacks.length], dx, dy);
      return { tx: dx, ty: dy, mul: d < 46 ? 0.25 : 1 };
    }
    const act = A.act;
    act.t += dt;
    let tx = dx, ty = dy, mul = 0;
    const P = this.player;
    const shoot = (a, sp, k = 1) => this.ebullets.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 5, dmg: 9 * this.stage.dmgMul * k, boss: true });
    const aim = Math.atan2(P.y - (e.y - 8), P.x - e.x);
    let done = false;
    switch (act.kind) {
      case 'ring': {
        e.tele = act.t < 0.5;
        if (act.t >= 0.5 && !act.fired) {
          act.fired = true;
          const n = enr ? 16 : 12, off = rand(0, TAU);
          for (let i = 0; i < n; i++) shoot(off + (i / n) * TAU, 54);
          sfx('shootBoss');
        }
        done = act.t > 1;
        break;
      }
      case 'fan': {
        e.tele = act.t < 0.5;
        if (act.t >= 0.5 && !act.fired) {
          act.fired = true;
          const n = enr ? 7 : 5, spread = 1.0;
          for (let i = 0; i < n; i++) shoot(aim - spread / 2 + (spread * i) / (n - 1), 78);
          sfx('shootBoss');
        }
        done = act.t > 0.9;
        break;
      }
      case 'burst': {
        mul = 0.3;
        const k = Math.floor((act.t - 0.3) / 0.24);
        if (act.t > 0.3 && k >= (act.n || 0) && (act.n || 0) < 5) { act.n = (act.n || 0) + 1; shoot(aim, 88); if (enr) { shoot(aim - 0.18, 88); shoot(aim + 0.18, 88); } sfx('shoot2'); }
        done = act.t > 1.7;
        break;
      }
      case 'spiral': {
        act.acc = (act.acc || 0) + dt;
        const arms = enr ? 3 : 2;
        while (act.acc > 0.085) {
          act.acc -= 0.085;
          act.ang = (act.ang ?? rand(0, TAU)) + 0.33;
          for (let i = 0; i < arms; i++) shoot(act.ang + (i / arms) * TAU, 52, 0.85);
        }
        if (Math.floor(act.t * 4) !== act.snd) { act.snd = Math.floor(act.t * 4); sfx('shoot2'); }
        done = act.t > 2.4;
        break;
      }
      case 'charge': {
        if (act.t < 0.8) { e.tele = true; }
        else if (act.t < 1.35) { tx = act.ax; ty = act.ay; mul = 9; e.st = 2; if (!act.snd) { act.snd = true; sfx('slash'); } }
        else { e.st = 0; }
        done = act.t > 2.0;
        break;
      }
      case 'slam': {
        // 跳ぶ → 狙った場所へ移動 → 着地で衝撃と弾
        const up = 0.3, fall = 1.2;
        if (act.t < up) e.z = (act.t / up) * 60;
        else if (act.t < fall) {
          e.z = 60;
          const k = Math.min(1, dt * 4);
          e.x += (act.x - e.x) * k; e.y += (act.y - e.y) * k;
        } else if (!act.landed) {
          act.landed = true; e.z = 0;
          e.x = act.x; e.y = act.y;
          const R = 38;
          this.fx.push({ kind: 'boom', x: e.x, y: e.y, R, life: 0.35, max: 0.35, color: e.pal.A });
          if (Math.hypot(P.x - e.x, P.y - e.y) < R + 4) this.hurtPlayer(e.dmg * 1.5);
          const n = enr ? 12 : 8;
          for (let i = 0; i < n; i++) shoot((i / n) * TAU, 50);
          this.shake = 0.5;
          sfx('boom');
        }
        done = act.t > 1.9;
        break;
      }
      case 'rain': {
        mul = 0.5;
        done = act.t > 1.5;
        break;
      }
      case 'summon': {
        e.tele = act.t < 0.5;
        if (act.t >= 0.5 && !act.fired) {
          act.fired = true;
          const n = enr ? 4 : 3;
          for (let i = 0; i < n && this.enemies.length + this.spawns.length < 45; i++) {
            const a = (i / n) * TAU;
            const x = e.x + Math.cos(a) * 30, y = e.y + Math.sin(a) * 22;
            const id = e.def.minion || this.biome.mobs[Math.floor(Math.random() * this.biome.mobs.length)];
            if (!this.map.solidAt(x, y)) this.spawns.push({ x, y, id, t: 0.5 });
          }
          sfx('gate');
        }
        done = act.t > 1;
        break;
      }
      default: done = true;
    }
    if (done) { A.act = null; e.z = 0; e.st = 0; A.t = rand(1.5, 2.3); }
    return { tx, ty, mul };
  }

  /** ボスの技を始める（予告を出す） */
  bossStart(e, kind, dx, dy) {
    const P = this.player;
    const act = { kind, t: 0 };
    if (kind === 'charge') {
      act.ax = dx; act.ay = dy;
      this.fx.push({ kind: 'warnLine', x: e.x, y: e.y, ax: dx, ay: dy, len: 240, w: e.r * 1.4, life: 0.8, max: 0.8 });
    }
    if (kind === 'slam') {
      act.x = P.x; act.y = P.y;
      // 歩けない場所には降りない
      if (this.map.solidAt(act.x, act.y)) { act.x = e.x; act.y = e.y; }
      this.fx.push({ kind: 'warn', x: act.x, y: act.y, R: 38, life: 1.2, max: 1.2 });
      sfx('super');
    }
    if (kind === 'rain') {
      const n = e.ai.enraged ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const x = i === 0 ? P.x : P.x + rand(-80, 80), y = i === 0 ? P.y : P.y + rand(-70, 70);
        this.fx.push({ kind: 'warn', x, y, R: 17, life: 1.1 + i * 0.06, max: 1.1 + i * 0.06, hit: { dmg: e.dmg * 0.9, color: e.def.rain || '#ffb03a' } });
      }
    }
    e.ai.act = act;
  }

  hurtPlayer(dmg, hazard = false) {
    const P = this.player;
    if (this.ended || this.clearing || this.superT > 0) return;
    if (!hazard && P.iframe > 0) return;
    const real = Math.max(1, dmg * (1 - this.rs.armor) * (100 / (100 + this.rs.def * 4)));
    P.hp -= real;
    if (!hazard) P.iframe = 0.5;
    this.shake = 0.15;
    this.nums.push({ x: P.x, y: P.y - 18, v: Math.round(real), life: 0.7, color: '#ff5a6a' });
    sfx('hurt');
    if (navigator.vibrate) try { navigator.vibrate(25); } catch {}
  }

  damage(e, base, opt = {}) {
    if (e.dead || e.hidden) return; // 姿を消している間は当たらない
    const crit = Math.random() < this.rs.crit;
    // 弱点の属性なら大ダメージ
    const weak = !!(this.curSrc && e.weak && WEAPON_EL[this.curSrc] === e.weak);
    const dmg = Math.max(1, Math.round(base * (crit ? 2 : 1) * (weak ? WEAK_MUL : 1) * rand(0.9, 1.1)));
    e.hp -= dmg;
    e.flash = 0.08;
    if (opt.slow) e.slowT = 1.5;
    if (opt.kx !== undefined && !e.boss) {
      const kb = e.elite ? 15 : 55;
      e.kvx += opt.kx * kb; e.kvy += opt.ky * kb;
    }
    if (this.nums.length < 70) this.nums.push({ x: e.x + rand(-3, 3), y: e.y - 10, v: dmg, life: 0.6, color: weak ? '#ff9a3c' : crit ? '#ffd23a' : '#ffffff' });
    if (e.hp <= 0) this.kill(e);
    else sfx('hit');
  }

  kill(e) {
    e.dead = true;
    this.kills++;
    if (!e.boss) this.roomKills++;
    sfx('kill');
    if (this.rs.lifesteal) this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.rs.lifesteal + this.player.maxHp * 0.004);
    for (let i = 0; i < (e.boss ? 40 : 6); i++) {
      this.fx.push({ kind: 'spark', x: e.x, y: e.y, vx: rand(-70, 70), vy: rand(-70, 70), life: rand(0.2, 0.5), color: e.boss ? '#ffd23a' : light(e.pal.A || '#ffffff', 0.4) });
    }
    if (e.boss) {
      this.shake = 0.7;
      for (let i = 0; i < 20; i++) this.dropGem(e.x + rand(-24, 24), e.y + rand(-24, 24), 20);
      for (let i = 0; i < 6; i++) this.pickups.push({ kind: 'coin', x: e.x + rand(-28, 28), y: e.y + rand(-28, 28), v: 15 + this.stage.n * 3 });
      this.gold += 100;
      // ステージクリアが決まったら：残りの敵と弾を消し、落ちている経験値とコインを集めきってから終わる
      this.clearing = true;
      this.clearT = 0;
      for (const o of this.enemies) if (!o.dead) { o.dead = true; this.puff(o.x, o.y); }
      this.spawns = [];
      this.ebullets = [];
      this.fx = this.fx.filter((f) => f.kind !== 'warn' && f.kind !== 'warnLine');
      this.banner('STAGE CLEAR!');
      return;
    }
    if (e.elite) {
      this.dropGem(e.x, e.y, 40);
      this.pickups.push({ kind: 'heart', x: e.x + 10, y: e.y });
      this.pickups.push({ kind: 'coin', x: e.x - 10, y: e.y, v: 40 + this.stage.n * 10 });
      this.gold += 30;
      return;
    }
    this.dropGem(e.x, e.y, e.exp);
    // 分裂型：小さな2体に分かれる
    if (e.pattern === 'split' && !e.mini && !this.clearing) {
      for (const k of [-1, 1]) this.addEnemy({ x: e.x + k * 7, y: e.y, id: e.id, mini: true });
    }
    const r = Math.random();
    if (r < 0.14) this.pickups.push({ kind: 'coin', x: e.x, y: e.y, v: 5 + this.stage.n * 2 });
    else if (r < 0.15) this.pickups.push({ kind: 'heart', x: e.x, y: e.y });
  }

  dropGem(x, y, v) {
    if (this.gems.length > 300) { this.gems[Math.floor(Math.random() * this.gems.length)].v += v; return; }
    this.gems.push({ x, y, v, pull: false });
  }

  // ===================== 武器 =====================
  nearest(maxD = 9999) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2(e, this.player);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  randomEnemyNear(r = 130) {
    const P = this.player;
    const list = this.enemies.filter((e) => !e.dead && dist2(e, P) < r * r);
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }
  cd(base, lv, step = 0.07) {
    return base * (1 - step * (lv - 1)) * this.rs.cdMul * (this.superT > 0 ? 0.35 : 1);
  }

  updateWeapons(dt) {
    const P = this.player, rs = this.rs;
    this.orbitAngle += dt * 3.2;
    for (const w of this.actives) {
      const lv = w.lv;
      this.curSrc = w.id;
      if (w.id === 'foxfire') {
        const n = 2 + Math.floor(lv / 2) + rs.multi;
        const R = 30 * rs.area;
        const dmg = rs.atk * 0.75 * (1 + 0.18 * (lv - 1));
        w.orbs = [];
        for (let i = 0; i < n; i++) {
          const a = this.orbitAngle + (i / n) * TAU;
          const ox = P.x + Math.cos(a) * R, oy = P.y - 6 + Math.sin(a) * R;
          w.orbs.push({ x: ox, y: oy });
          for (const e of this.query(ox, oy, 10)) {
            if (e.dead || (e.x - ox) ** 2 + (e.y - oy) ** 2 > (e.r + 5) ** 2) continue;
            if ((e.hits.fox || 0) > this.t) continue;
            e.hits.fox = this.t + 0.4;
            this.damage(e, dmg, { kx: Math.cos(a), ky: Math.sin(a) });
            sfx('fire');
          }
        }
        continue;
      }
      if (w.id === 'field') {
        w.R = 28 * rs.area * (1 + 0.12 * lv);
        w.t -= dt;
        if (w.t <= 0) {
          w.t = 0.5;
          const dmg = rs.atk * 0.35 * (1 + 0.28 * (lv - 1));
          for (const e of this.query(P.x, P.y, w.R)) if (!e.dead && dist2(e, P) < (w.R + e.r) ** 2) this.damage(e, dmg);
        }
        continue;
      }
      if (w.id === 'drone') {
        w.dx = P.x + Math.cos(this.orbitAngle * 0.5) * 18;
        w.dy = P.y - 16 + Math.sin(this.orbitAngle * 0.5) * 5;
      }
      w.t -= dt;
      if (w.t > 0) continue;
      // 撃った弾や置いた爆弾に「どの武器か」を付けておく（弱点の判定用）
      const nb = this.bullets.length, nf = this.fx.length;
      this.fire(w);
      for (let i = nb; i < this.bullets.length; i++) this.bullets[i].src ||= w.id;
      for (let i = nf; i < this.fx.length; i++) this.fx[i].src ||= w.id;
    }
    this.curSrc = null;
  }

  fire(w) {
    const P = this.player, rs = this.rs, lv = w.lv;
    const sy = P.y - 8; // 弾の発射位置（胸のあたり）
    switch (w.id) {
      case 'plasma': {
        w.t = this.cd(0.62, lv);
        const tg = this.nearest(150);
        if (!tg) { w.t = 0.1; return; }
        const n = 1 + Math.floor(lv / 2) + rs.multi;
        const base = Math.atan2(tg.y - sy, tg.x - P.x);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.13;
          this.bullets.push({ kind: 'plasma', x: P.x, y: sy, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 1, dmg: rs.atk * (1 + 0.15 * (lv - 1)), pierce: lv >= 5 ? 1 : 0, r: 3 });
        }
        sfx('shoot');
        break;
      }
      case 'note': {
        w.t = this.cd(0.9, lv, 0.06);
        const tg = this.nearest(150);
        const base = tg ? Math.atan2(tg.y - sy, tg.x - P.x) : Math.atan2(P.my, P.mx);
        const n = 2 + Math.floor(lv / 2) + rs.multi;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.22;
          this.bullets.push({ kind: 'heart', x: P.x, y: sy, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, life: 1.2, dmg: rs.atk * 0.8 * (1 + 0.16 * (lv - 1)), pierce: 2 + Math.floor(lv / 3), r: 4, hit: new Set() });
        }
        sfx('shoot2');
        break;
      }
      case 'ice': {
        w.t = this.cd(0.8, lv, 0.06);
        const tg = this.nearest(150);
        const base = tg ? Math.atan2(tg.y - sy, tg.x - P.x) : Math.atan2(P.my, P.mx);
        const n = 3 + Math.floor((lv - 1) / 2) + rs.multi;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.16;
          this.bullets.push({ kind: 'ice', x: P.x, y: sy, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, life: 0.9, dmg: rs.atk * 0.7 * (1 + 0.16 * (lv - 1)), pierce: Math.floor(lv / 3), r: 3, slow: true, hit: new Set() });
        }
        sfx('ice');
        break;
      }
      case 'arrow': {
        w.t = this.cd(0.7, lv, 0.06);
        let ax = P.mx, ay = P.my;
        if (!P.moving) { const tg = this.nearest(160); if (tg) { const d = Math.hypot(tg.x - P.x, tg.y - sy) || 1; ax = (tg.x - P.x) / d; ay = (tg.y - sy) / d; } }
        const n = 1 + Math.floor(lv / 2) + rs.multi;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 7;
          this.bullets.push({ kind: 'arrow', x: P.x - ay * off, y: sy + ax * off, vx: ax * 260, vy: ay * 260, life: 0.9, dmg: rs.atk * 1.1 * (1 + 0.16 * (lv - 1)), pierce: 3 + lv, r: 3, hit: new Set() });
        }
        sfx('arrow');
        break;
      }
      case 'axe': {
        w.t = this.cd(1.4, lv, 0.06);
        const n = 1 + Math.floor(lv / 2) + rs.multi;
        const tg = this.nearest(150);
        const base = tg ? Math.atan2(tg.y - sy, tg.x - P.x) : Math.atan2(P.my, P.mx);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.5;
          this.bullets.push({ kind: 'axe', x: P.x, y: sy, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: 2, dmg: rs.atk * 1.4 * (1 + 0.18 * (lv - 1)), pierce: 999, r: 6 * rs.area, back: false, t: 0, hit: new Map() });
        }
        sfx('slash');
        break;
      }
      case 'blade': {
        w.t = this.cd(1.0, lv, 0.06);
        const R = 36 * rs.area * (1 + 0.08 * lv);
        const dmg = rs.atk * 1.7 * (1 + 0.2 * (lv - 1));
        const fa = Math.atan2(P.my, P.mx);
        const dirs = [fa];
        if (lv >= 4 || rs.multi > 0) dirs.push(fa + Math.PI);
        if (rs.multi > 1) dirs.push(fa + Math.PI / 2, fa - Math.PI / 2);
        for (const a of dirs) {
          this.fx.push({ kind: 'slash', x: P.x, y: sy, a, R, life: 0.18, max: 0.18, color: '#ff5c7a' });
          for (const e of this.query(P.x, sy, R + 10)) {
            if (e.dead) continue;
            const ex = e.x - P.x, ey = e.y - sy, d = Math.hypot(ex, ey);
            if (d > R + e.r) continue;
            const da = Math.abs(((Math.atan2(ey, ex) - a + Math.PI * 3) % TAU) - Math.PI);
            if (da < 1.1 || d < 10) this.damage(e, dmg, { kx: ex / (d || 1), ky: ey / (d || 1) });
          }
        }
        sfx('slash');
        break;
      }
      case 'scythe': {
        w.t = this.cd(1.5, lv, 0.06);
        const R = 34 * rs.area * (1 + 0.1 * lv);
        const dmg = rs.atk * 1.3 * (1 + 0.2 * (lv - 1));
        this.fx.push({ kind: 'spin', x: P.x, y: sy, R, life: 0.3, max: 0.3 });
        for (const e of this.query(P.x, sy, R + 10)) {
          if (e.dead) continue;
          const ex = e.x - P.x, ey = e.y - sy, d = Math.hypot(ex, ey);
          if (d < R + e.r) this.damage(e, dmg, { kx: ex / (d || 1), ky: ey / (d || 1) });
        }
        sfx('slash');
        break;
      }
      case 'holy': {
        w.t = this.cd(1.6, lv, 0.06);
        const n = 1 + Math.floor(lv / 2) + rs.multi;
        const R = 18 * rs.area * (1 + 0.08 * lv);
        for (let i = 0; i < n; i++) {
          const tg = this.randomEnemyNear(140);
          const x = tg ? tg.x : P.x + rand(-50, 50), y = tg ? tg.y : P.y + rand(-50, 50);
          this.fx.push({ kind: 'holy', x, y, R, life: 0.5, max: 0.5, dmg: rs.atk * 2.2 * (1 + 0.2 * (lv - 1)) });
        }
        break;
      }
      case 'talisman': {
        w.t = this.cd(0.85, lv, 0.06);
        const n = 1 + Math.floor((lv + 1) / 2) + rs.multi;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5;
          this.bullets.push({ kind: 'talisman', x: P.x, y: sy, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 2.2, dmg: rs.atk * 0.95 * (1 + 0.16 * (lv - 1)), pierce: 1 + Math.floor(lv / 3), r: 3, hit: new Set() });
        }
        sfx('shoot2');
        break;
      }
      case 'thunder': {
        w.t = this.cd(1.3, lv, 0.06);
        const n = 1 + Math.floor(lv / 2) + rs.multi;
        const R = 16 * rs.area * (1 + 0.08 * lv);
        const dmg = rs.atk * 1.6 * (1 + 0.18 * (lv - 1));
        for (let i = 0; i < n; i++) {
          const tg = this.randomEnemyNear(140);
          if (!tg) break;
          this.fx.push({ kind: 'bolt', x1: tg.x + rand(-6, 6), y1: tg.y - 90, x2: tg.x, y2: tg.y, life: 0.18 });
          this.fx.push({ kind: 'boom', x: tg.x, y: tg.y, R: R * 0.8, life: 0.2, max: 0.2, color: '#ffe14d' });
          for (const e of this.query(tg.x, tg.y, R + 8)) {
            if (!e.dead && Math.hypot(e.x - tg.x, e.y - tg.y) < R + e.r) this.damage(e, dmg);
          }
        }
        sfx('zap');
        break;
      }
      case 'yarn': {
        w.t = this.cd(1.2, lv, 0.06);
        const n = 1 + Math.floor(lv / 2) + rs.multi;
        const tg = this.nearest(150);
        const base = tg ? Math.atan2(tg.y - sy, tg.x - P.x) : rand(0, TAU);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.6;
          this.bullets.push({ kind: 'yarn', x: P.x, y: sy, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 2.6, dmg: rs.atk * 0.85 * (1 + 0.16 * (lv - 1)), pierce: 999, r: 4 * rs.area, bounces: 3 + lv, hit: new Map() });
        }
        sfx('shoot2');
        break;
      }
      case 'drone': {
        w.t = this.cd(1.0, lv, 0.08);
        const tg = this.nearest(150);
        if (!tg) { w.t = 0.2; return; }
        const n = 1 + Math.floor(lv / 3) + Math.floor(rs.multi / 2);
        for (let i = 0; i < n; i++) {
          setTimeout(() => {
            if (tg.dead || !w.dx) return;
            const a = Math.atan2(tg.y - w.dy, tg.x - w.dx);
            this.bullets.push({ kind: 'plasma', x: w.dx, y: w.dy, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 1, dmg: rs.atk * 0.65 * (1 + 0.15 * (lv - 1)), pierce: 0, r: 2 });
          }, i * 90);
        }
        break;
      }
      case 'missile': {
        w.t = this.cd(1.7, lv, 0.06);
        const n = 1 + Math.floor(lv / 2) + rs.multi;
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          this.bullets.push({ kind: 'missile', x: P.x, y: sy, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 2.5, dmg: rs.atk * 1.3 * (1 + 0.18 * (lv - 1)), pierce: 0, r: 3, boom: 18 * rs.area });
        }
        sfx('missile');
        break;
      }
      case 'chain': {
        w.t = this.cd(1.4, lv, 0.06);
        let cur = this.randomEnemyNear();
        if (!cur) { w.t = 0.3; return; }
        const dmg = rs.atk * 1.0 * (1 + 0.16 * (lv - 1));
        const hit = new Set();
        let px = P.x, py = P.y - 40;
        const jumps = 2 + lv + rs.multi;
        for (let i = 0; i <= jumps && cur; i++) {
          hit.add(cur);
          this.fx.push({ kind: 'bolt', x1: px, y1: py, x2: cur.x, y2: cur.y, life: 0.15 });
          this.damage(cur, dmg);
          px = cur.x; py = cur.y;
          let next = null, nd = 55 * 55;
          for (const e of this.query(px, py, 55)) {
            if (e.dead || hit.has(e)) continue;
            const d = (e.x - px) ** 2 + (e.y - py) ** 2;
            if (d < nd) { nd = d; next = e; }
          }
          cur = next;
        }
        sfx('zap');
        break;
      }
      case 'bomb': {
        w.t = this.cd(2.0, lv, 0.06);
        const n = 1 + Math.floor(lv / 3) + rs.multi;
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), d = rand(15, 60);
          this.fx.push({ kind: 'bomb', x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d, life: 0.8, R: 26 * rs.area * (1 + 0.1 * lv), dmg: rs.atk * 2.1 * (1 + 0.2 * (lv - 1)) });
        }
        break;
      }
    }
  }

  explode(x, y, R, dmg) {
    this.fx.push({ kind: 'boom', x, y, R, life: 0.25, max: 0.25 });
    for (const e of this.query(x, y, R + 8)) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < R + e.r) this.damage(e, dmg, { kx: (e.x - x) / (d || 1), ky: (e.y - y) / (d || 1) });
    }
    sfx('boom');
  }

  updateBullets(dt) {
    const tmp = [];
    const P = this.player;
    for (const b of this.bullets) {
      if (b.kind === 'missile') {
        if (!b.target || b.target.dead) b.target = this.nearest(200);
        if (b.target) {
          const a = Math.atan2(b.target.y - b.y, b.target.x - b.x);
          const sp = Math.min(190, Math.hypot(b.vx, b.vy) + dt * 250);
          b.vx += (Math.cos(a) * sp - b.vx) * Math.min(1, dt * 6);
          b.vy += (Math.sin(a) * sp - b.vy) * Math.min(1, dt * 6);
        }
        if (Math.random() < 0.5) this.fx.push({ kind: 'spark', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.2, color: '#ff9a3c' });
      }
      if (b.kind === 'axe') {
        b.t += dt;
        if (b.t > 0.4) {
          const tx = P.x - b.x, ty = P.y - 8 - b.y, d = Math.hypot(tx, ty) || 1;
          b.vx += (tx / d * 230 - b.vx) * Math.min(1, dt * 5);
          b.vy += (ty / d * 230 - b.vy) * Math.min(1, dt * 5);
          if (d < 8 && b.t > 0.6) b.dead = true;
        } else { b.vx *= 0.97; b.vy *= 0.97; }
      }
      if (b.kind === 'talisman') {
        if (!b.target || b.target.dead) b.target = this.nearest(180);
        if (b.target) {
          const a = Math.atan2(b.target.y - b.y, b.target.x - b.x);
          const sp = Math.min(200, Math.hypot(b.vx, b.vy) + dt * 200);
          b.vx += (Math.cos(a) * sp - b.vx) * Math.min(1, dt * 5);
          b.vy += (Math.sin(a) * sp - b.vy) * Math.min(1, dt * 5);
        }
      }
      if (b.kind === 'yarn') {
        // 壁で跳ね返る
        const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
        if (this.map.solidAt(nx, b.y, true)) { b.vx = -b.vx; b.bounces--; }
        if (this.map.solidAt(b.x, ny, true)) { b.vy = -b.vy; b.bounces--; }
        if (b.bounces < 0) b.life = 0;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      this.curSrc = b.src || null;
      for (const e of this.query(b.x, b.y, 14, tmp)) {
        if (e.dead) continue;
        if (b.hit) {
          if (b.hit instanceof Map) { if ((b.hit.get(e) || 0) > this.t) continue; }
          else if (b.hit.has(e)) continue;
        }
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > (e.r + b.r) ** 2) continue;
        if (b.kind === 'missile') { this.explode(b.x, b.y, b.boom, b.dmg); b.dead = true; break; }
        const l = Math.hypot(b.vx, b.vy) || 1;
        this.damage(e, b.dmg, { kx: b.vx / l, ky: b.vy / l, slow: b.slow });
        if (b.hit instanceof Map) b.hit.set(e, this.t + 0.35);
        else if (b.hit) b.hit.add(e);
        if (b.pierce-- <= 0) { b.dead = true; break; }
      }
    }
    this.curSrc = null;
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  updateEBullets(dt) {
    const P = this.player;
    for (const b of this.ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if ((b.x - P.x) ** 2 + (b.y - (P.y - 6)) ** 2 < 36) { this.hurtPlayer(b.dmg); b.life = 0; }
      if (this.map.solidAt(b.x, b.y, true)) b.life = 0;
    }
    this.ebullets = this.ebullets.filter((b) => b.life > 0);
  }

  updateGems(dt) {
    const P = this.player;
    // 経験値は落ちてすぐ自動でプレイヤーに集まる（磁石スキルは廃止）
    for (const gm of this.gems) {
      gm.age = (gm.age || 0) + dt;
      if (gm.age > 0.25) {
        const d = Math.sqrt(dist2(gm, P)) || 1;
        gm.sp = (gm.sp || 40) + dt * (this.clearing ? 900 : 420);
        const step = Math.min(d, gm.sp * dt); // 速くなっても通り過ぎない
        gm.x += ((P.x - gm.x) / d) * step;
        gm.y += ((P.y - gm.y) / d) * step;
        if (d < 7) { gm.dead = true; this.gainExp(gm.v); }
      }
    }
    this.gems = this.gems.filter((g) => !g.dead);
    for (const p of this.pickups) {
      // コインも経験値と同じように自動でプレイヤーに集まる（回復ハートは近づいて取る）
      if (p.kind === 'coin') {
        p.age = (p.age || 0) + dt;
        if (p.age > 0.35) {
          const d = Math.sqrt(dist2(p, P)) || 1;
          p.sp = (p.sp || 40) + dt * (this.clearing ? 900 : 380);
          const step = Math.min(d, p.sp * dt);
          p.x += ((P.x - p.x) / d) * step;
          p.y += ((P.y - p.y) / d) * step;
        }
      }
      if (dist2(p, P) < 120) {
        p.dead = true;
        if (p.kind === 'heart') { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.3); sfx('heal'); }
        else if (p.kind === 'coin') { this.gold += p.v || 10; sfx('coin'); }
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  gainExp(v) {
    this.exp += v * this.rs.exp;
    sfx('gem');
    while (this.exp >= this.need) {
      this.exp -= this.need;
      this.level++;
      this.need = expNeed(this.level);
      this.pendingLv++;
    }
  }

  // ===================== レベルアップ（3択） =====================
  makeChoices() {
    const pool = [];
    const owned = new Set(this.actives.map((a) => a.id));
    for (const a of this.actives) if (a.lv < WEAPON_MAX) pool.push({ id: a.id, lv: a.lv + 1 });
    if (this.actives.length < MAX_ACTIVES) {
      for (const [id, s] of Object.entries(SKILLS)) if (s.kind === 'w' && !s.sig && !owned.has(id)) pool.push({ id, lv: 1 });
    }
    const pCount = Object.keys(this.passives).length;
    for (const [id, s] of Object.entries(SKILLS)) {
      if (s.kind !== 'p') continue;
      const cur = this.passives[id] || 0;
      if (cur >= s.max || (!cur && pCount >= MAX_PASSIVES)) continue;
      pool.push({ id, lv: cur + 1 });
    }
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const out = pool.slice(0, 3);
    // たまに特殊スキル（虹枠）が混ざる
    const specials = ['super', 'heal', 'nuke'];
    if (Math.random() < 0.18 || out.length < 3) {
      const sp = specials[Math.floor(Math.random() * specials.length)];
      if (out.length >= 3) out[Math.floor(Math.random() * 3)] = { id: sp, lv: 0 };
      else out.push({ id: sp, lv: 0 });
    }
    while (out.length < 3) out.push({ id: specials[out.length % specials.length], lv: 0 });
    return out.map((c) => {
      const s = SKILLS[c.id];
      return { ...c, kind: s.kind, name: s.name, icon: s.icon, color: s.color, desc: s.desc, max: s.kind === 'w' ? WEAPON_MAX : s.max };
    });
  }

  /** スロットの絵柄用（全スキル） */
  static reelPool() {
    return Object.entries(SKILLS).filter(([, s]) => !s.sig).map(([id, s]) => ({ id, ...s }));
  }

  triggerLevelUp() {
    this.pendingLv--;
    this.pause();
    sfx('levelup');
    const choices = this.makeChoices();
    this.opt.onLevelUp(choices, (c) => { this.applyChoice(c); this.resume(); });
  }

  applyChoice(c) {
    const P = this.player;
    if (c.kind === 'w') {
      const a = this.actives.find((x) => x.id === c.id);
      if (a) a.lv++; else this.actives.push({ id: c.id, lv: 1, t: 0 });
    } else if (c.kind === 'p') {
      this.passives[c.id] = (this.passives[c.id] || 0) + 1;
      this.recalc();
    } else if (c.id === 'super') { this.superT = 10; this.banner('スーパーモードっ！'); sfx('super'); }
    else if (c.id === 'heal') { P.hp = P.maxHp; sfx('heal'); }
    else if (c.id === 'nuke') {
      this.flash = 0.4; this.shake = 0.5;
      for (const e of this.enemies.slice()) if (Math.abs(e.y - P.y) < this.vh * 0.6) this.damage(e, this.rs.atk * 25);
      sfx('boom');
    }
  }

  updateFx(dt) {
    for (const f of this.fx) {
      f.life -= dt;
      if (f.kind === 'spark' || f.kind === 'dust') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9; }
      this.curSrc = f.src || null;
      if (f.kind === 'bomb' && f.life <= 0 && !f.done) { f.done = true; this.explode(f.x, f.y, f.R, f.dmg); }
      if (f.kind === 'holy' && f.life <= 0.15 && !f.done) {
        f.done = true;
        for (const e of this.query(f.x, f.y, f.R + 8)) if (!e.dead && Math.hypot(e.x - f.x, e.y - f.y) < f.R + e.r) this.damage(e, f.dmg);
        sfx('heal');
      }
      // 落下攻撃：赤い円が消えた瞬間に落ちてくる
      if (f.kind === 'warn' && f.hit && f.life <= 0 && !f.done) {
        f.done = true;
        this.fx.push({ kind: 'boom', x: f.x, y: f.y, R: f.R + 2, life: 0.3, max: 0.3, color: f.hit.color });
        if (Math.hypot(this.player.x - f.x, this.player.y - f.y) < f.R + 3) this.hurtPlayer(f.hit.dmg);
        sfx('boom');
      }
    }
    this.curSrc = null;
    this.fx = this.fx.filter((f) => f.life > 0);
    for (const n of this.nums) { n.life -= dt; n.y -= dt * 20; }
    this.nums = this.nums.filter((n) => n.life > 0);
  }

  banner(text) { this.hud.banner(text); }

  finish(cleared) {
    if (this.ended) return;
    this.ended = true;
    this.pause();
    sfx(cleared ? 'clear' : 'over');
    setTimeout(() => {
      this.stop();
      this.opt.onEnd({ cleared, time: this.t, kills: this.kills, level: this.level, gold: this.gold, room: this.room + 1 });
    }, cleared ? 300 : 1000);
  }

  updateHud() {
    const P = this.player;
    const isBoss = this.room === ROOMS_PER_STAGE - 1;
    const q = this.quota(this.room);
    this.hud.update({
      hp: Math.max(0, P.hp), maxHp: P.maxHp, exp: this.exp, need: this.need, level: this.level,
      time: this.t, kills: this.kills, gold: this.gold, score: this.kills * 100 + this.gold * 10,
      room: this.room + 1, rooms: ROOMS_PER_STAGE,
      progress: isBoss ? (this.boss ? 1 - Math.max(0, this.boss.hp) / this.boss.maxHp : 0) : Math.min(1, this.roomKills / q),
      gateOpen: !this.roomActive && !isBoss,
      boss: this.boss && !this.boss.dead ? this.boss.hp / this.boss.maxHp : null,
      bossName: this.boss ? this.boss.def.name : '',
      superT: this.superT,
    });
  }

  // ===================== 描画 =====================
  render() {
    const g = this.g, P = this.player, M = this.map, S = this.S;
    let camX = Math.round(M.w / 2 - this.vw / 2);
    let camY = Math.round(this.camY);
    if (this.shake > 0) { camX += Math.round(rand(-2, 2)); camY += Math.round(rand(-2, 2)); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1a1220';
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(S, 0, 0, S, -camX * S, -camY * S);
    g.imageSmoothingEnabled = false;

    // 背景（描き込み済みマップ）
    const sx = Math.max(0, camX), sy = Math.max(0, camY);
    const sw = Math.min(M.w - sx, this.vw + 2), sh = Math.min(M.h - sy, this.vh + 2);
    if (sw > 0 && sh > 0) g.drawImage(M.canvas, sx, sy, sw, sh, sx, sy, sw, sh);
    const viewTop = camY - 20, viewBot = camY + this.vh + 20;
    const vis = (y) => y > viewTop && y < viewBot;

    // 水場のきらめき
    const tq = Math.floor(this.t * 3);
    g.fillStyle = '#ffffff';
    const r0 = Math.floor(camY / T), r1 = Math.ceil((camY + this.vh) / T);
    for (let row = Math.max(0, r0); row <= Math.min(M.rows - 1, r1); row++) for (let col = CORRIDOR[0]; col <= CORRIDOR[1]; col++) {
      if (M.get(col, row) !== TILE.POOL) continue;
      const h = ((col * 928371 + row * 1237 + tq * 31) >>> 0) % 97;
      if (h < 30) g.fillRect(col * T + 3 + (h % 9), row * T + 4 + (h % 7), 2, 1);
    }

    // ゲート（鉄格子）
    for (let k = 0; k < ROOMS_PER_STAGE - 1; k++) {
      const row = M.roomTop(k);
      const y = row * T;
      if (!vis(y)) continue;
      const open = M.gateOpen[k];
      const x0 = GATE_COLS[0] * T, w = GATE_COLS.length * T;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0, y, w, T);
      const lift = open ? 12 : 0;
      for (let i = 0; i < 9; i++) {
        const bx = x0 + 3 + i * 5;
        g.fillStyle = '#3a3240'; g.fillRect(bx, y - 2, 3, T + 2 - lift);
        g.fillStyle = '#9a90a8'; g.fillRect(bx, y - 2, 1, T + 2 - lift);
      }
      g.fillStyle = '#4a4050'; g.fillRect(x0, y - 3, w, 3);
      g.fillStyle = '#ffd23a'; g.fillRect(x0 + w / 2 - 2, y - 3, 4, 2);
      if (open && k === this.room) {
        const ay = y + T + 4 + Math.round(Math.sin(this.t * 6) * 3);
        g.fillStyle = '#ffd23a';
        for (let i = 0; i < 5; i++) g.fillRect(x0 + w / 2 - i, ay + i, i * 2 + 1, 1);
        g.fillRect(x0 + w / 2 - 1, ay + 5, 3, 4);
      }
    }

    // 出現予告
    for (const s of this.spawns) {
      const k = 1 - s.t / 0.7;
      g.globalAlpha = 0.5 + Math.sin(this.t * 30) * 0.2;
      g.strokeStyle = '#ff3b5c'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(s.x, s.y + 2, 8 * k + 2, (8 * k + 2) * 0.5, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }
    // 爆弾予告
    for (const f of this.fx) {
      if (f.kind !== 'bomb') continue;
      g.strokeStyle = '#ff3b5c'; g.globalAlpha = 0.4 + Math.sin(f.life * 40) * 0.3;
      g.beginPath(); g.arc(f.x, f.y, f.R * (1 - f.life / 0.8) + 2, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      const bi = icon('bomb', '#5a5a7a');
      g.drawImage(bi, Math.round(f.x - bi.width / 2), Math.round(f.y - bi.height / 2));
    }
    // フィールド
    for (const w of this.actives) {
      if (w.id === 'field' && w.R) {
        g.globalAlpha = 0.14 + Math.sin(this.t * 6) * 0.04;
        g.fillStyle = '#5aa8ff';
        g.beginPath(); g.arc(P.x, P.y - 4, w.R, 0, TAU); g.fill();
        g.globalAlpha = 0.7; g.strokeStyle = '#9ad0ff'; g.stroke();
        g.globalAlpha = 1;
      }
    }

    // ジェム・アイテム
    for (const gm of this.gems) {
      if (!vis(gm.y)) continue;
      const col = gm.v >= 20 ? '#ff6bd8' : gm.v >= 5 ? '#4dff8a' : '#4ad8ff';
      const s = PICKUP.gem(col);
      g.drawImage(s, Math.round(gm.x - s.width / 2), Math.round(gm.y - s.height / 2 + Math.sin(this.t * 4 + gm.x) * 1));
    }
    for (const p of this.pickups) {
      const s = PICKUP[p.kind]();
      g.drawImage(s, Math.round(p.x - s.width / 2), Math.round(p.y - s.height / 2 + Math.sin(this.t * 5) * 1.5));
    }

    // 攻撃の予告（赤い円・赤い線）は足元に描く
    for (const f of this.fx) {
      if (f.kind === 'warn') {
        const k = 1 - f.life / f.max;
        const blink = Math.floor(this.t * (k > 0.6 ? 16 : 8)) % 2;
        g.globalAlpha = 0.18 + k * 0.22;
        g.fillStyle = '#ff2a4a';
        g.beginPath(); g.ellipse(f.x, f.y, f.R, f.R * 0.62, 0, 0, TAU); g.fill();
        g.globalAlpha = blink ? 0.95 : 0.6;
        g.strokeStyle = '#ff4f6d'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(f.x, f.y, f.R, f.R * 0.62, 0, 0, TAU); g.stroke();
        // だんだん縮む内側の円＝あとどれくらいで来るか
        g.beginPath(); g.ellipse(f.x, f.y, f.R * (1 - k), f.R * 0.62 * (1 - k), 0, 0, TAU); g.stroke();
        g.globalAlpha = 1;
      } else if (f.kind === 'warnLine') {
        const k = 1 - f.life / f.max;
        const w = f.w || 8;
        g.save();
        g.translate(f.x, f.y); g.rotate(Math.atan2(f.ay, f.ax));
        g.globalAlpha = 0.16 + k * 0.25;
        g.fillStyle = '#ff2a4a'; g.fillRect(0, -w / 2, f.len, w);
        g.globalAlpha = Math.floor(this.t * 12) % 2 ? 0.9 : 0.5;
        g.fillStyle = '#ff4f6d'; g.fillRect(0, -w / 2, f.len, 1); g.fillRect(0, w / 2 - 1, f.len, 1);
        g.restore();
        g.globalAlpha = 1;
      }
    }

    // キャラと敵（y順）
    const list = this.enemies.filter((e) => vis(e.y));
    list.push(P);
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e === P) { this.drawPlayer(g); continue; }
      // 攻撃の構え中は赤く点滅
      const teleBlink = e.tele && Math.floor(this.t * 14) % 2;
      const s = enemySprite(e.type, e.pal, { flash: e.flash > 0 || teleBlink, crown: e.boss });
      const w = Math.round(s.width * e.size), h = Math.round(s.height * e.size);
      const hop = (e.fly ? Math.round(Math.sin(e.bob) * 2) - 6 : -Math.abs(Math.round(Math.sin(e.bob) * 1.5))) - Math.round(e.z || 0);
      g.fillStyle = 'rgba(30,10,30,0.3)';
      g.beginPath(); g.ellipse(Math.round(e.x), Math.round(e.y + 2), w * 0.36, 2.5 * e.size, 0, 0, TAU); g.fill();
      const flip = P.x < e.x ? -1 : 1;
      // すり抜け型：消えている間は薄く、消える直前はちらつく
      if (e.hidden) g.globalAlpha = 0.22;
      else if (e.fading) g.globalAlpha = Math.floor(this.t * 16) % 2 ? 0.5 : 1;
      g.save();
      g.translate(Math.round(e.x), Math.round(e.y - h + 3 + hop));
      if (flip < 0 && !['bat', 'drone', 'eye', 'wisp', 'skull'].includes(e.type)) { g.scale(-1, 1); g.drawImage(s, -Math.round(w / 2), 0, w, h); }
      else g.drawImage(s, -Math.round(w / 2), 0, w, h);
      g.restore();
      g.globalAlpha = 1;
      // 「！」マーク（攻撃の合図）
      if (e.tele) {
        const tx = Math.round(e.x), ty = Math.round(e.y - h + hop - 4);
        g.fillStyle = '#1e1226'; g.fillRect(tx - 2, ty - 9, 5, 11);
        g.fillStyle = '#ffd23a'; g.fillRect(tx - 1, ty - 8, 3, 6); g.fillRect(tx - 1, ty - 1, 3, 2);
      }
      if (e.slowT > 0) { g.fillStyle = 'rgba(160,230,255,0.5)'; g.fillRect(Math.round(e.x - w / 2), Math.round(e.y - h + 3 + hop), w, h); }
      // HPバー（参考画面のように足元に）
      if (e.hp < e.maxHp || e.elite) {
        const bw = Math.max(12, Math.round(w * 0.8));
        g.fillStyle = '#1e1226'; g.fillRect(Math.round(e.x - bw / 2) - 1, Math.round(e.y + 4), bw + 2, 4);
        g.fillStyle = '#3a2a3a'; g.fillRect(Math.round(e.x - bw / 2), Math.round(e.y + 5), bw, 2);
        g.fillStyle = e.elite || e.boss ? '#ff4f6d' : '#5aee6a';
        g.fillRect(Math.round(e.x - bw / 2), Math.round(e.y + 5), Math.max(1, Math.round(bw * e.hp / e.maxHp)), 2);
      }
    }

    // 周回系
    for (const w of this.actives) {
      if (w.id === 'foxfire' && w.orbs) {
        for (const o of w.orbs) {
          const fl = Math.floor(this.t * 12) % 2;
          g.fillStyle = 'rgba(255,140,40,0.35)'; g.fillRect(Math.round(o.x) - 4, Math.round(o.y) - 4, 8, 8);
          g.fillStyle = '#ff7a2a'; g.fillRect(Math.round(o.x) - 2, Math.round(o.y) - 3 - fl, 5, 6 + fl);
          g.fillStyle = '#ffd23a'; g.fillRect(Math.round(o.x) - 1, Math.round(o.y) - 1, 3, 3);
        }
      }
      if (w.id === 'drone' && w.dx !== undefined) {
        const s = icon('drone', '#a9b3cc');
        g.drawImage(s, Math.round(w.dx - s.width / 2), Math.round(w.dy - s.height / 2));
      }
    }

    // 弾
    for (const b of this.bullets) {
      const x = Math.round(b.x), y = Math.round(b.y);
      switch (b.kind) {
        case 'heart': g.drawImage(PICKUP.heart(), x - 4, y - 3); break;
        case 'missile': g.fillStyle = '#ffd23a'; g.fillRect(x - 2, y - 2, 4, 4); g.fillStyle = '#fff'; g.fillRect(x - 1, y - 1, 2, 2); break;
        case 'ice':
          g.fillStyle = '#5ab8e8'; g.fillRect(x - 2, y - 1, 5, 3); g.fillRect(x - 1, y - 2, 3, 5);
          g.fillStyle = '#e8fbff'; g.fillRect(x, y - 1, 1, 2); break;
        case 'arrow': {
          const l = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / l, uy = b.vy / l;
          g.fillStyle = '#8a5a34';
          for (let i = 0; i < 7; i++) g.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1);
          g.fillStyle = '#e8e8f0'; g.fillRect(x - 1, y - 1, 2, 2);
          g.fillStyle = '#7ad85a'; g.fillRect(Math.round(x - ux * 7) - 1, Math.round(y - uy * 7) - 1, 2, 2);
          break;
        }
        case 'talisman':
          g.fillStyle = '#fff4d8'; g.fillRect(x - 2, y - 3, 4, 6);
          g.fillStyle = '#e03040'; g.fillRect(x - 1, y - 2, 2, 1); g.fillRect(x - 1, y, 2, 1);
          break;
        case 'yarn':
          g.fillStyle = '#c84a98'; g.fillRect(x - 3, y - 3, 6, 6);
          g.fillStyle = '#ff8ad0'; g.fillRect(x - 2, y - 2, 4, 4);
          g.fillStyle = '#ffd0ec'; g.fillRect(x - 1, y - 2, 1, 4); g.fillRect(x - 2, y, 4, 1);
          break;
        case 'axe': {
          const s = icon('axe', '#c8ccd8');
          g.save(); g.translate(x, y); g.rotate(this.t * 18); g.drawImage(s, -Math.round(s.width / 2), -Math.round(s.height / 2)); g.restore();
          break;
        }
        default:
          g.fillStyle = 'rgba(54,242,255,0.45)'; g.fillRect(x - b.r, y - b.r, b.r * 2, b.r * 2);
          g.fillStyle = '#36f2ff'; g.fillRect(x - 2, y - 2, 4, 4);
          g.fillStyle = '#ffffff'; g.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    for (const b of this.ebullets) {
      const x = Math.round(b.x), y = Math.round(b.y);
      g.fillStyle = '#7a1030'; g.fillRect(x - 3, y - 3, 6, 6);
      g.fillStyle = b.color || '#ff4f6d'; g.fillRect(x - 2, y - 2, 4, 4);
      g.fillStyle = '#ffd0d8'; g.fillRect(x - 1, y - 1, 2, 2);
    }

    // エフェクト
    for (const f of this.fx) {
      if (f.kind === 'spark') { g.fillStyle = f.color; g.fillRect(Math.round(f.x), Math.round(f.y), 2, 2); }
      else if (f.kind === 'dust') {
        g.globalAlpha = Math.max(0, f.life / f.max);
        g.fillStyle = '#f4ead8'; g.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 3);
        g.globalAlpha = 1;
      } else if (f.kind === 'slash' || f.kind === 'spin') {
        const k = 1 - f.life / f.max;
        g.globalAlpha = 1 - k;
        g.lineWidth = 3;
        g.strokeStyle = f.kind === 'spin' ? '#c4103c' : f.color;
        g.beginPath();
        if (f.kind === 'spin') g.arc(f.x, f.y, f.R * (0.7 + k * 0.3), k * TAU, k * TAU + Math.PI * 1.6);
        else g.arc(f.x, f.y, f.R * (0.6 + k * 0.4), f.a - 1.1, f.a + 1.1);
        g.stroke();
        g.lineWidth = 1; g.strokeStyle = '#ffffff';
        g.beginPath();
        if (f.kind === 'spin') g.arc(f.x, f.y, f.R * (0.7 + k * 0.3), k * TAU + 0.2, k * TAU + Math.PI * 1.4);
        else g.arc(f.x, f.y, f.R * (0.6 + k * 0.4), f.a - 0.9, f.a + 0.9);
        g.stroke();
        g.globalAlpha = 1;
      } else if (f.kind === 'holy') {
        const k = 1 - f.life / f.max;
        if (k < 0.7) {
          g.globalAlpha = 0.5 + Math.sin(this.t * 40) * 0.3;
          g.strokeStyle = '#ffe14d'; g.lineWidth = 1;
          g.beginPath(); g.ellipse(f.x, f.y, f.R * k / 0.7, f.R * k / 0.7 * 0.5, 0, 0, TAU); g.stroke();
          g.globalAlpha = 1;
        } else {
          g.globalAlpha = 0.85;
          g.fillStyle = '#fff6b0'; g.fillRect(Math.round(f.x - 5), Math.round(f.y - 80), 10, 80);
          g.fillStyle = '#ffffff'; g.fillRect(Math.round(f.x - 2), Math.round(f.y - 80), 4, 80);
          g.fillStyle = 'rgba(255,230,120,0.5)'; g.beginPath(); g.ellipse(f.x, f.y, f.R, f.R * 0.5, 0, 0, TAU); g.fill();
          g.globalAlpha = 1;
        }
      } else if (f.kind === 'boom') {
        const k = 1 - f.life / f.max;
        g.globalAlpha = 1 - k;
        g.fillStyle = f.color || '#ff8a3a'; g.beginPath(); g.arc(f.x, f.y, f.R * (0.4 + k * 0.6), 0, TAU); g.fill();
        g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(f.x, f.y, f.R * 0.45 * (1 - k), 0, TAU); g.fill();
        g.globalAlpha = 1;
      } else if (f.kind === 'bolt') {
        g.strokeStyle = '#f4ff7a'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(f.x1, f.y1);
        for (let i = 1; i < 5; i++) { const k = i / 5; g.lineTo(f.x1 + (f.x2 - f.x1) * k + rand(-3, 3), f.y1 + (f.y2 - f.y1) * k + rand(-3, 3)); }
        g.lineTo(f.x2, f.y2); g.stroke();
      }
    }
    for (const n of this.nums) drawNumber(g, n.v, n.x, n.y, n.color);

    // 画面全体の効果
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flash > 0) { g.fillStyle = `rgba(255,240,200,${this.flash})`; g.fillRect(0, 0, this.cv.width, this.cv.height); }
    if (P.iframe > 0.35 && this.superT <= 0) { g.fillStyle = 'rgba(255,40,80,0.15)'; g.fillRect(0, 0, this.cv.width, this.cv.height); }
  }

  drawPlayer(g) {
    const P = this.player;
    const frame = P.moving ? (Math.floor(P.anim) % 2 ? 'walk1' : 'walk2') : 'idle';
    const s = charSprite(this.char, frame);
    const bob = P.moving ? (Math.floor(P.anim) % 2 ? -1 : 0) : Math.round(Math.sin(this.t * 3) * 0.5);
    const x = Math.round(P.x), y = Math.round(P.y);
    // 影
    g.fillStyle = 'rgba(30,10,30,0.35)';
    g.beginPath(); g.ellipse(x, y + 1, 7, 2.5, 0, 0, TAU); g.fill();
    // スーパーモードのオーラ
    if (this.superT > 0) {
      const fl = Math.floor(this.t * 14);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + fl * 0.3;
        const r = 9 + ((fl + i) % 3) * 2;
        g.fillStyle = i % 2 ? '#ffd23a' : '#ff8a2a';
        g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 11 + Math.sin(a) * r * 1.2 - ((fl + i) % 4)), 2, 3);
      }
    }
    const blink = P.iframe > 0 && Math.floor(P.iframe * 20) % 2 && this.superT <= 0;
    if (!blink) {
      g.save();
      g.translate(x, y - s.height + 2 + bob);
      if (P.face < 0) { g.scale(-1, 1); g.drawImage(s, -Math.round(s.width / 2), 0); }
      else g.drawImage(s, -Math.round(s.width / 2), 0);
      g.restore();
    }
    // 足元のHPバー（参考画面のように）
    const bw = 18;
    g.fillStyle = '#1e1226'; g.fillRect(x - bw / 2 - 1, y + 4, bw + 2, 4);
    g.fillStyle = '#3a2a3a'; g.fillRect(x - bw / 2, y + 5, bw, 2);
    g.fillStyle = P.hp / P.maxHp > 0.3 ? '#5aee6a' : '#ff4f6d';
    g.fillRect(x - bw / 2, y + 5, Math.max(0, Math.round(bw * P.hp / P.maxHp)), 2);
  }
}
