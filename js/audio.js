// BGM・効果音の再生（音源は audio/sources.json の対応表どおり、変換済み .bin を読み込む）
// - 効果音：WebAudio のバッファで再生（同時にたくさん鳴らせる）
// - BGM：これも WebAudio のバッファで再生（iPhoneで鳴らないことがある audio要素は使わない。ループの継ぎ目も無音にならない）
// - 音源ファイルがまだ無いものは鳴らないだけで、エラーにはならない

const DEBUG = ['localhost', '127.0.0.1'].includes(location.hostname);
const KEY = new TextEncoder().encode('NDS-audio-pack-2026');
const MAGIC = 'NDSA';

let ctx = null, master = null, bgmGain = null, seGain = null;
const vol = { bgm: 0.7, se: 0.8 };
let sources = null;
const seBuf = new Map();      // name -> AudioBuffer | null（null=読み込み失敗）
const seLoading = new Map();
const lastPlay = {};
const bgmBuf = new Map();     // name -> { buffer, loop } | null（最近使った数曲だけ残す）
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

/** 起動時に呼ぶ：音の読み込みだけ先に済ませておく（スマホは操作するまで鳴らせないので、鳴らすのは initAudio 後） */
export function preloadAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.connect(master);
    seGain = ctx.createGain(); seGain.connect(master);
    applyVolume();
    loadSources().then((s) => { for (const name of Object.keys(s.se || {})) loadSe(name); });
  } catch { ctx = null; }
}

/** 最初のタップで呼ぶ（スマホは操作しないと音を出せない） */
export function initAudio() {
  if (!ctx) preloadAudio();
  if (!ctx) return;
  unlocked = true;
  if (ctx.state !== 'running') ctx.resume().then(() => { if (wantBgm && (!bgmCur || bgmCur.name !== wantBgm)) playBgm(wantBgm); }).catch(() => {});
  // まだ鳴っていないBGMがあれば、音が使えるようになった時点で流す
  if (wantBgm && (!bgmCur || bgmCur.name !== wantBgm)) playBgm(wantBgm);
}

// 画面を閉じたり別アプリに切り替えたら音を止め、戻ったら再開（電池の節約と、裏で鳴り続けないように）
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {});
  else if (unlocked) ctx.resume().catch(() => {});
});
let unlocked = false;

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
const GAP = { hit: 70, kill: 60, gem: 45, shoot: 80, shoot2: 110, reel: 60, slash: 90, boom: 120, zap: 110, coin: 220, click: 40, hurt: 200, fire: 450, ice: 150, arrow: 90, missile: 150, heal: 250, spike: 300 };
// よく鳴る音は小さめに（音源の大きさはそろえてあるので、ここは鳴る回数に合わせた調整）
const SE_VOL = { gem: 0.35, hit: 0.35, kill: 0.5, shoot: 0.45, reel: 0.45, shoot2: 0.5, fire: 0.35, coin: 0.55, slash: 0.7, ice: 0.6, arrow: 0.6, missile: 0.6, click: 0.8 };

export function sfx(name) {
  if (!ctx || vol.se === 0 || ctx.state !== 'running') return;
  const now = performance.now();
  if (lastPlay[name] && now - lastPlay[name] < (GAP[name] ?? 60)) return;
  const buf = seBuf.get(name);
  if (!buf) { if (!seBuf.has(name)) loadSe(name); return; }
  lastPlay[name] = now;
  if (DEBUG) (window.__sfxLog ||= []).push(name);
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
  return { ctx: ctx?.state, bgm: bgmName, playing: !!(bgmCur && !bgmCur.ended), seLoaded: [...seBuf].filter(([, v]) => v).map(([k]) => k), vol: { ...vol } };
}

async function getBgm(name) {
  if (bgmBuf.has(name)) { const v = bgmBuf.get(name); bgmBuf.delete(name); bgmBuf.set(name, v); return v; }
  const s = (await loadSources()).bgm?.[name];
  if (!s) return null;
  let item = null;
  try {
    const bytes = await fetchDecoded(`./audio/bgm/${name}.bin`);
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    item = { buffer, loop: !!s.loop };
  } catch { item = null; }
  bgmBuf.set(name, item);
  // メモリ節約：使った順に新しい4曲だけ残す
  while (bgmBuf.size > 4) bgmBuf.delete(bgmBuf.keys().next().value);
  return item;
}

function fadeTo(gainNode, to, sec) {
  const g = gainNode.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(to, t + sec);
}

/**
 * 場面のBGMに切り替える
 * @param {string} name sources.json の bgm のキー（例 home, battle_grass, boss）
 * @param {string} [fallback] そのBGMが無いときに代わりに流すもの
 */
export async function playBgm(name, fallback) {
  wantBgm = name;
  if (!ctx) return;
  if (bgmCur && bgmCur.name === name && !bgmCur.ended) return;
  let item = await getBgm(name);
  let playName = name;
  if (!item && fallback) { item = await getBgm(fallback); playName = fallback; }
  if (wantBgm !== name) return; // 読み込み中に別の場面へ移った
  // まだ音が使えない（一度も画面を触っていない）ときは、使えるようになってから流す
  if (ctx.state !== 'running') return;
  if (bgmCur && bgmCur.name === name && !bgmCur.ended) return;
  const prev = bgmCur;
  if (prev) {
    fadeTo(prev.gain, 0, 0.4);
    try { prev.src.stop(ctx.currentTime + 0.45); } catch {}
  }
  bgmName = name;
  bgmCur = null;
  if (!item) return;
  const src = ctx.createBufferSource();
  src.buffer = item.buffer;
  src.loop = item.loop;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(g).connect(bgmGain);
  const cur = { name, playName, src, gain: g, ended: false };
  src.onended = () => { cur.ended = true; };
  src.start();
  fadeTo(g, 1, 0.5);
  bgmCur = cur;
}

export function stopBgm() {
  wantBgm = null;
  if (bgmCur && ctx) {
    const cur = bgmCur;
    fadeTo(cur.gain, 0, 0.3);
    try { cur.src.stop(ctx.currentTime + 0.35); } catch {}
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
