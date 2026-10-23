// BGM・効果音の再生（音源は audio/sources.json の対応表どおり、変換済み .bin を読み込む）
// - 効果音：WebAudio のバッファで再生（同時にたくさん鳴らせる）
// - BGM：audio要素 + WebAudio の音量ノード（iPhoneでも音量バーが効くように）
// - 音源ファイルがまだ無いものは鳴らないだけで、エラーにはならない

const KEY = new TextEncoder().encode('NDS-audio-pack-2026');
const MAGIC = 'NDSA';

let ctx = null, master = null, bgmGain = null, seGain = null;
const vol = { bgm: 0.7, se: 0.8 };
let sources = null;
const seBuf = new Map();      // name -> AudioBuffer | null（null=読み込み失敗）
const seLoading = new Map();
const lastPlay = {};
const bgmEls = new Map();     // name -> { el, node }
let bgmName = null, bgmCur = null, wantBgm = null;

async function loadSources() {
  if (sources) return sources;
  try { sources = await (await fetch('./audio/sources.json')).json(); } catch { sources = { bgm: {}, se: {} }; }
  return sources;
}

async function fetchDecoded(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('not found');
  const buf = new Uint8Array(await res.arrayBuffer());
  const head = String.fromCharCode(...buf.slice(0, 4));
  if (head !== MAGIC) throw new Error('bad file');
  const out = new Uint8Array(buf.length - 4);
  for (let i = 0; i < out.length; i++) out[i] = buf[i + 4] ^ KEY[i % KEY.length];
  return out;
}

/** 最初のタップで呼ぶ（スマホは操作しないと音を出せない） */
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.connect(master);
    seGain = ctx.createGain(); seGain.connect(master);
    applyVolume();
    loadSources().then((s) => { for (const name of Object.keys(s.se || {})) loadSe(name); });
    if (wantBgm) playBgm(wantBgm);
  } catch { ctx = null; }
}

// 人の耳に合わせて音量バーの値を2乗する
const curve = (v) => v * v;
function applyVolume() {
  if (!ctx) return;
  bgmGain.gain.setTargetAtTime(curve(vol.bgm) * 0.8, ctx.currentTime, 0.05);
  seGain.gain.setTargetAtTime(curve(vol.se), ctx.currentTime, 0.02);
}

/** 音量を設定（0〜100） */
export function setAudio(opt) {
  if (opt.bgmVol !== undefined) vol.bgm = Math.max(0, Math.min(100, opt.bgmVol)) / 100;
  if (opt.seVol !== undefined) vol.se = Math.max(0, Math.min(100, opt.seVol)) / 100;
  applyVolume();
  if (vol.bgm === 0 && bgmCur) bgmCur.el.pause();
  else if (vol.bgm > 0 && bgmCur && bgmCur.el.paused && bgmCur.loop) bgmCur.el.play().catch(() => {});
}

async function loadSe(name) {
  if (seBuf.has(name) || seLoading.has(name) || !ctx) return;
  const p = (async () => {
    try {
      const bytes = await fetchDecoded(`./audio/se/${name}.bin`);
      seBuf.set(name, await ctx.decodeAudioData(bytes.buffer));
    } catch { seBuf.set(name, null); }
    seLoading.delete(name);
  })();
  seLoading.set(name, p);
}

// 同じ音が短時間に重なりすぎないための間隔（ミリ秒）
const GAP = { hit: 45, kill: 50, gem: 40, shoot: 70, shoot2: 90, reel: 60, slash: 80, boom: 80, zap: 100, coin: 60, click: 40, hurt: 150 };
const SE_VOL = { gem: 0.5, hit: 0.45, kill: 0.6, shoot: 0.5, reel: 0.6, shoot2: 0.55 };

export function sfx(name) {
  if (!ctx || vol.se === 0) return;
  const now = performance.now();
  if (lastPlay[name] && now - lastPlay[name] < (GAP[name] ?? 60)) return;
  const buf = seBuf.get(name);
  if (!buf) { if (!seBuf.has(name)) loadSe(name); return; }
  lastPlay[name] = now;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  let out = seGain;
  if (SE_VOL[name]) { const g = ctx.createGain(); g.gain.value = SE_VOL[name]; g.connect(seGain); out = g; }
  src.connect(out);
  src.start();
}

// 中身から形式を判定（mp3 / ogg / m4a / wav）
function mimeOf(b) {
  const s4 = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (s4 === 'OggS') return 'audio/ogg';
  if (s4 === 'RIFF') return 'audio/wav';
  if (String.fromCharCode(b[4], b[5], b[6], b[7]) === 'ftyp') return 'audio/mp4';
  return 'audio/mpeg';
}

/** 動作確認用 */
export function audioState() {
  return { ctx: ctx?.state, bgm: bgmName, playing: !!(bgmCur && !bgmCur.el.paused), seLoaded: [...seBuf].filter(([, v]) => v).map(([k]) => k), vol: { ...vol } };
}

async function getBgm(name) {
  if (bgmEls.has(name)) return bgmEls.get(name);
  const s = (await loadSources()).bgm?.[name];
  if (!s) return null;
  try {
    const bytes = await fetchDecoded(`./audio/bgm/${name}.bin`);
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeOf(bytes) }));
    const el = new Audio();
    el.src = url;
    el.loop = !!s.loop;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    const node = ctx.createMediaElementSource(el);
    const g = ctx.createGain();
    node.connect(g).connect(bgmGain);
    const item = { el, gain: g, loop: !!s.loop };
    bgmEls.set(name, item);
    return item;
  } catch {
    bgmEls.set(name, null);
    return null;
  }
}

function fade(item, to, sec) {
  const g = item.gain.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(to, ctx.currentTime + sec);
}

/**
 * 場面のBGMに切り替える
 * @param {string} name sources.json の bgm のキー（例 home, battle_grass, boss）
 * @param {string} [fallback] そのBGMが無いときに代わりに流すもの
 */
export async function playBgm(name, fallback) {
  wantBgm = name;
  if (!ctx) return;
  if (bgmName === name && bgmCur && (!bgmCur.el.paused || !bgmCur.loop)) return;
  let item = await getBgm(name);
  if (!item && fallback) { item = await getBgm(fallback); }
  if (wantBgm !== name) return; // 読み込み中に別の場面へ移った
  const prev = bgmCur;
  if (prev && prev !== item) {
    fade(prev, 0, 0.4);
    setTimeout(() => { if (bgmCur !== prev) prev.el.pause(); }, 450);
  }
  bgmName = name;
  bgmCur = item;
  if (!item) return;
  if (prev !== item) item.el.currentTime = 0;
  item.gain.gain.value = 0;
  fade(item, 1, 0.5);
  if (vol.bgm > 0) item.el.play().catch(() => {});
}

export function stopBgm() {
  wantBgm = null;
  if (bgmCur && ctx) {
    const cur = bgmCur;
    fade(cur, 0, 0.3);
    setTimeout(() => cur.el.pause(), 350);
  }
  bgmCur = null;
  bgmName = null;
}

// ===== 画面側から使う補助 =====
/** 音量（0〜100）を設定 */
export function setVolume({ bgm, se } = {}) {
  setAudio({ bgmVol: bgm, seVol: se });
}
/** バイオームごとの戦闘BGM名 */
export const bgmForBiome = (id) => 'battle_' + id;
/** 試聴メニュー用の曲名 */
export const TRACK_NAMES = {
  home: 'ホーム', menu: '装備・キャラ・設定', gacha: 'ガチャ',
  battle_grass: '草原ステージ', battle_desert: '砂漠ステージ', battle_snow: '雪国ステージ',
  battle_cyber: 'サイバーシティ', battle_volcano: '火山ステージ', battle_castle: '魔王城',
  boss: 'ボス戦', clear: 'ステージクリア', gameover: 'ゲームオーバー',
};

/** クレジット表示用 */
export async function audioCredits() {
  const s = await loadSources();
  return s;
}
