// ガチャ演出：宝箱が落ちてくる → レア度の色で開封 → レア度ごとの卵が1つずつ割れて中身が出る
// ・画面タップで早送り、右上の「スキップ」で結果一覧へ
// ・動きは Web Animations API（element.animate）で付ける（iPhoneでも途中で止まらない）
import { sprite, toURL, light, dark } from './art.js';
import { sfx, stopSfx } from './audio.js';

// ===== レア度ごとの色 =====
const RCOL = {
  N: { main: '#b8865a', dark: '#6a4628', trim: '#d8c8a8', glow: '#fff4d8', name: 'N' },
  R: { main: '#4aa8ff', dark: '#1d4f98', trim: '#d8e8ff', glow: '#8ad0ff', name: 'R' },
  SR: { main: '#b05cff', dark: '#4a1a8a', trim: '#ffe27a', glow: '#d8a0ff', name: 'SR' },
  SSR: { main: '#ffcc33', dark: '#a06a10', trim: '#fff6c8', glow: '#ffe27a', name: 'SSR' },
};
const ORDER = ['N', 'R', 'SR', 'SSR'];

// ===== 宝箱（24x14） =====
const CHEST_CLOSED = [
  '...BBBBBBBBBBBBBBBBBB...',
  '..BAAAAYAAAAAAAAYAAAAB..',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BBBBBBYBBBBBBBBYBBBBBB.',
  '.YYYYYYYYYYLLYYYYYYYYYY.',
  '.BAAAAAYAAALLAAAYAAAAAB.',
  '.BAAAAAYAAALLAAAYAAAAAB.',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BBBBBBYBBBBBBBBYBBBBBB.',
  '..YYYYYYYYYYYYYYYYYYYY..',
];
const CHEST_OPEN = [
  '..BBBBBBBBBBBBBBBBBBBB..',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BBBBBBYBBBBBBBBYBBBBBB.',
  '.BIIIIIIIIIIIIIIIIIIIIB.',
  '.BIIIIIIIIIIIIIIIIIIIIB.',
  '.BIIIIIIIIIIIIIIIIIIIIB.',
  '.YYYYYYYYYYYYYYYYYYYYYY.',
  '.BAAAAAYAAALLAAAYAAAAAB.',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BAAAAAYAAAAAAAAYAAAAAB.',
  '.BBBBBBYBBBBBBBBYBBBBBB.',
  '..YYYYYYYYYYYYYYYYYYYY..',
];
function chestURL(r, open) {
  const c = RCOL[r];
  const pal = { A: c.main, B: c.dark, Y: c.trim, L: { c: '#ffe14d', flat: false }, I: { c: c.glow, flat: true } };
  return toURL(sprite(open ? CHEST_OPEN : CHEST_CLOSED, pal, { volume: true }), 8, `chest:${r}:${open ? 1 : 0}`);
}

// ===== 卵（14x17）：レア度ごとに模様が違う =====
const EGG = [
  '.....AAAA.....',
  '....AAAAAA....',
  '...AAwAAAAA...',
  '..AAwAAAAAAA..',
  '..AAAAAAAAAA..',
  '.AAAAAAAAAAAA.',
  '.AAAAAAAAAAAA.',
  'AAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAA',
  '.AAAAAAAAAAAA.',
  '.AAAAAAAAAAAA.',
  '..AAAAAAAAAA..',
  '...AAAAAAAA...',
  '.....AAAA.....',
];
// 模様（同じ大きさ。'.' は塗らない）
const EGG_PATTERN = {
  N: ['', '', '', '', '', '.....B........', '..........B...', '', '...B..........', '.........BB...', '', '....B.........', '', '.........B....', '', '', ''],
  R: ['', '', '', '', '', '', '', 'B.BB.BB.BB.BB.', '.B..B..B..B..B', '', '', '', '', '', '', '', ''],
  SR: ['', '', '', '', '...C..........', '..CCC......C..', '...C........C.', 'BBBBBBBBBBBBBB', '.B.B.B.B.B.B.B', '', '.......C......', '......CCC.....', '.......C......', '', '', '', ''],
  SSR: ['', '', '......C.......', '.....CCC......', '......C.......', '', '..B......B....', 'BBBBBBBBBBBBBB', 'BCBBCBBCBBCBBC', 'BBBBBBBBBBBBBB', '', '...C.....C....', '..CCC...CCC...', '...C.....C....', '', '', ''],
};
const EGG_COL = {
  N: { A: '#f4efe2', B: '#c8b48a' },
  R: { A: '#9ad8ff', B: '#2a78c8' },
  SR: { A: '#d8b0ff', B: '#6a2bb0', C: '#ffe14d' },
  SSR: { A: '#ffe27a', B: '#e09a20', C: '#ff3b5c' },
};
// ヒビ（割れる直前）
const CRACK = ['', '', '', '', '', '', '...k......k...', '..k.k....k.k..', '.k...k..k...k.', 'k.....kk.....k', '', '', '', '', '', '', ''];

function eggRows(r, cracked) {
  return EGG.map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      let ch = row[x];
      if (ch === 'A') {
        const p = (EGG_PATTERN[r][y] || '')[x];
        if (p && p !== '.') ch = p;
        const k = cracked ? (CRACK[y] || '')[x] : null;
        if (k === 'k') ch = 'k';
      }
      out += ch;
    }
    return out;
  });
}
function eggURL(r, part = 'whole') {
  const col = EGG_COL[r];
  const pal = { A: col.A, B: col.B, C: col.C || col.B, w: '#ffffff', k: { c: '#2a1626', flat: true } };
  let rows = eggRows(r, part !== 'whole');
  if (part === 'top') rows = rows.map((row, y) => (y <= 8 ? row : '.'.repeat(row.length)));
  if (part === 'bottom') rows = rows.map((row, y) => (y > 8 ? row : '.'.repeat(row.length)));
  return toURL(sprite(rows, pal, { volume: true }), 8, `egg:${r}:${part}`);
}

// ===== 便利関数 =====
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const anim = (node, frames, opt) => node.animate(frames, { fill: 'forwards', ...opt }).finished.catch(() => {});

/**
 * 演出を再生する
 * @param {{rarity:'N'|'R'|'SR'|'SSR', name:string, img:string, sub?:string}[]} results
 * @returns {Promise<void>}
 */
export function playGacha(results) {
  return new Promise((resolve) => {
    const best = results.reduce((b, r) => (ORDER.indexOf(r.rarity) > ORDER.indexOf(b) ? r.rarity : b), 'N');
    const root = el('div', `gfx gfx-${best}`);
    root.innerHTML = `
      <div class="gfx-rays"></div>
      <div class="gfx-floor"></div>
      <button class="gfx-skip">スキップ ▶▶</button>
      <div class="gfx-count ol"></div>
      <div class="gfx-stage"></div>
      <div class="gfx-hint ol">タップで進む</div>
      <div class="gfx-flash"></div>`;
    document.getElementById('modal-root').appendChild(root);
    const stage = root.querySelector('.gfx-stage');
    const flash = root.querySelector('.gfx-flash');
    const count = root.querySelector('.gfx-count');

    let skipped = false, tapResolve = null;
    const finish = () => {
      if (root.dataset.done) return;
      root.dataset.done = '1';
      stopSfx('gacha', 0.3);
      anim(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).then(() => { root.remove(); resolve(); });
    };
    root.querySelector('.gfx-skip').addEventListener('click', (e) => { e.stopPropagation(); skipped = true; stopSfx('gacha', 0.35); if (tapResolve) tapResolve(); finish(); });
    root.addEventListener('click', () => { if (tapResolve) { const f = tapResolve; tapResolve = null; f(); } });
    // 指定時間待つ（タップで早送り）
    const wait = (ms) => new Promise((res) => {
      const t = setTimeout(() => { tapResolve = null; res(); }, ms);
      tapResolve = () => { clearTimeout(t); res(); };
    });
    const doFlash = (color, ms = 450) => {
      flash.style.background = color;
      return anim(flash, [{ opacity: 0.95 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
    };
    const particles = (color, n = 24, cx = 0, cy = 0) => {
      for (let i = 0; i < n; i++) {
        const p = el('i', 'gfx-p');
        p.style.background = i % 3 === 0 ? '#fff' : color;
        stage.appendChild(p);
        const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 150;
        anim(p, [
          { transform: `translate(${cx}px, ${cy}px) scale(1)`, opacity: 1 },
          { transform: `translate(${cx + Math.cos(a) * d}px, ${cy + Math.sin(a) * d - 40}px) scale(.3)`, opacity: 0 },
        ], { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.2,1)' }).then(() => p.remove());
      }
    };

    (async () => {
      const C = RCOL[best];
      // ---------- 1. 宝箱が落ちてくる ----------
      const chest = el('img', 'gfx-chest px');
      chest.src = chestURL(best, false);
      chest.alt = '';
      stage.appendChild(chest);
      sfx('gacha');
      await anim(chest, [
        { transform: 'translateY(-120vh) rotate(-8deg)' },
        { transform: 'translateY(0) rotate(0)', offset: 0.62 },
        { transform: 'translateY(-26px) rotate(2deg)', offset: 0.8 },
        { transform: 'translateY(0) rotate(0)' },
      ], { duration: 900, easing: 'cubic-bezier(.5,0,.75,0)' });
      if (skipped) return;
      sfx('boom');
      anim(root.querySelector('.gfx-floor'), [{ transform: 'translateX(-50%) scale(.6)', opacity: 0 }, { transform: 'translateX(-50%) scale(1)', opacity: 1 }], { duration: 300 });

      // ---------- 2. ガタガタ揺れて、光がもれる ----------
      chest.style.filter = `drop-shadow(0 0 0 ${C.glow})`;
      const shakes = best === 'SSR' ? 3 : best === 'SR' ? 2 : 1;
      for (let i = 0; i < shakes; i++) {
        sfx('reel');
        await anim(chest, [
          { transform: 'rotate(0)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' },
        ], { duration: 420, easing: 'ease-in-out' });
        chest.style.filter = `drop-shadow(0 0 ${8 + i * 10}px ${C.glow}) brightness(${1 + i * 0.12})`;
        await wait(best === 'SSR' ? 260 : 160);
        if (skipped) return;
      }

      // ---------- 3. 開封 ----------
      chest.src = chestURL(best, true);
      stopSfx('gacha', 0.25); // ドラムロールは開封で止める
      sfx(ORDER.indexOf(best) >= 2 ? 'rare' : 'coin');
      await Promise.all([
        doFlash(best === 'SSR' ? '#fffbe8' : C.glow, 520),
        anim(chest, [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' }),
      ]);
      particles(C.main, best === 'SSR' ? 40 : 22, 0, -20);
      const beam = el('div', 'gfx-beam');
      stage.insertBefore(beam, chest);
      anim(beam, [{ transform: 'translateX(-50%) scaleY(0)', opacity: 0 }, { transform: 'translateX(-50%) scaleY(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
      root.classList.add('opened');
      await wait(650);
      if (skipped) return;
      await anim(chest, [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(60px) scale(.7)', opacity: 0 }], { duration: 320, easing: 'ease-in' });
      chest.remove();

      anim(beam, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).then(() => beam.remove());
      // ---------- 4. 卵を1つずつ割る ----------
      for (let i = 0; i < results.length; i++) {
        if (skipped) return;
        const r = results[i];
        const RC = RCOL[r.rarity];
        count.textContent = `${i + 1} / ${results.length}`;
        root.dataset.r = r.rarity;
        const egg = el('div', `gfx-egg r-${r.rarity}`);
        egg.innerHTML = `<img class="px whole" src="${eggURL(r.rarity)}" alt="">`;
        stage.appendChild(egg);
        const img = egg.querySelector('img');
        // 宝箱から飛び出して真ん中へ
        await anim(egg, [
          { transform: 'translateY(150px) scale(.3)', opacity: 0 },
          { transform: 'translateY(-60px) scale(1.05)', opacity: 1, offset: 0.6 },
          { transform: 'translateY(0) scale(1)' },
        ], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
        // ぷるぷる
        const wobble = (deg, ms) => anim(img, [
          { transform: 'rotate(0)' }, { transform: `rotate(${-deg}deg)` }, { transform: `rotate(${deg}deg)` }, { transform: 'rotate(0)' },
        ], { duration: ms, easing: 'ease-in-out' });
        await wobble(6, 360);
        await wait(r.rarity === 'SSR' ? 300 : 120);
        if (skipped) return;
        // ヒビが入る
        img.src = eggURL(r.rarity, 'cracked');
        sfx('hit');
        await wobble(10, 300);
        if (r.rarity === 'SSR' || r.rarity === 'SR') { await wobble(12, 260); }
        if (skipped) return;
        // 割れる：上半分が飛び、下半分が落ちる
        egg.innerHTML = `<img class="px top" src="${eggURL(r.rarity, 'top')}" alt=""><img class="px bottom" src="${eggURL(r.rarity, 'bottom')}" alt="">`;
        const card = el('div', `gfx-card r-${r.rarity}`, `
          <div class="gfx-card-rays"></div>
          <img class="px gfx-item" src="${r.img}" alt="">
          <div class="gfx-rar ol">${RC.name}</div>
          <div class="gfx-name ol">${r.name}</div>
          ${r.sub ? `<div class="gfx-sub">${r.sub}</div>` : ''}`);
        stage.appendChild(card);
        sfx(r.rarity === 'SSR' ? 'rare' : r.rarity === 'SR' ? 'unlock' : 'coin');
        anim(egg.querySelector('.top'), [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(-40px,-160px) rotate(-40deg)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
        anim(egg.querySelector('.bottom'), [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(80px)', opacity: 0 }], { duration: 480, easing: 'ease-in' });
        if (r.rarity !== 'N') doFlash(RC.glow, 380);
        particles(RC.main, r.rarity === 'SSR' ? 36 : r.rarity === 'SR' ? 22 : 12, 0, 0);
        await anim(card, [
          { transform: 'scale(.2)', opacity: 0 },
          { transform: 'scale(1.12)', opacity: 1, offset: 0.7 },
          { transform: 'scale(1)', opacity: 1 },
        ], { duration: 460, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        await wait(r.rarity === 'SSR' ? 1700 : r.rarity === 'SR' ? 1200 : 750);
        if (skipped) return;
        await anim(card, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.9) translateY(-20px)' }], { duration: 180 });
        card.remove();
        egg.remove();
      }
      finish();
    })();
  });
}
void light; void dark;
