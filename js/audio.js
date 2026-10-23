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
let unlocked = false;
const raw = new Map();        // 'se:name' / 'bgm:name' -> Promise<Uint8Array>（ダウンロード済みの中身）
const seBuf = new Map();      // name -> AudioBuffer
const seBusy = new Set();
const seTries = {};
const seWant = {};            // 読み込み中に鳴らそうとした時刻（読み込めたらすぐ鳴らす）
const lastPlay = {};
const bgmBuf = new Map();     // name -> { buffer, loop }（最近使った数曲だけ残す）
const bgmBusy = new Map();    // name -> Promise
const bgmTries = {};
let bgmName = null, bgmCur = null, wantBgm = null, wantFb = null;
const liveBgm = new Set(); // 実際に鳴っているBGM（重なり確認用）

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
/** ファイルの中身を取ってくる（失敗したら次回また取り直す） */
function getRaw(kind, name) {
  const k = kind + ':' + name;
  if (!raw.has(k)) {
    raw.set(k, loadSources()
      // ?v=中身の指紋：音を差し替えたら必ず新しいファイルを読む（オフライン用の保存もこの名前で）
      .then((s) => fetchDecoded(`./audio/${kind}/${name}.bin?v=${s[kind]?.[name]?.v || '0'}`))
      .catch((e) => { raw.delete(k); throw e; }));
  }
  return raw.get(k);
}

// ===== 音データの変換（iPhoneは同時にたくさん変換すると失敗することがあるので、1つずつ順番に） =====
const queue = [];
let decoding = false;
function decode(bytes, urgent) {
  return new Promise((resolve, reject) => {
    const job = { bytes, resolve, reject };
    if (urgent) queue.unshift(job); else queue.push(job);
    pump();
  });
}
async function pump() {
  if (decoding || !ctx) return;
  const job = queue.shift();
  if (!job) return;
  decoding = true;
  try {
    // 変換に渡したデータは使えなくなるので、コピーを渡す（失敗しても取り直せるように）
    const ab = job.bytes.slice().buffer;
    job.resolve(await new Promise((res, rej) => {
      try { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); } catch (e) { rej(e); }
    }));
  } catch (e) { job.reject(e); }
  decoding = false;
  pump();
}

// iPhone（iOS 17〜）：音の種類を「環境音」にする。
// 他のアプリで再生中の音楽を止めずに一緒に鳴る（ゲームの音はマナーモードのときは鳴らなくなる）
function setAmbient() {
  try { if (navigator.audioSession && navigator.audioSession.type !== 'ambient') navigator.audioSession.type = 'ambient'; } catch {}
}

/** 起動時に呼ぶ：ファイルのダウンロードだけ先に済ませる（音を鳴らす準備は最初のタップで行う） */
export function preloadAudio() {
  loadSources().then((s) => {
    for (const name of Object.keys(s.se || {})) getRaw('se', name).catch(() => {});
    if (s.bgm?.home) getRaw('bgm', 'home').catch(() => {});
  });
}

function createCtx() {
  setAmbient();
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.connect(master);
    seGain = ctx.createGain(); seGain.connect(master);
    applyVolume();
    ctx.onstatechange = () => { if (ctx.state === 'running') ensureBgm(); };
  } catch { ctx = null; return; }
  // 流したいBGMを先に、効果音はその後ろで順番に準備
  if (wantBgm) getBgm(wantBgm).catch(() => {});
  loadSources().then((s) => { for (const name of Object.keys(s.se || {})) loadSe(name); });
}

/** タップのたびに呼ぶ（スマホは画面を触らないと音を出せない。止まっていたら再開する） */
export function initAudio() {
  if (!ctx) createCtx();
  if (!ctx) return;
  unlocked = true;
  if (ctx.state !== 'running') {
    setAmbient();
    ctx.resume().then(ensureBgm).catch(() => {});
    // iPhone：タップ中に無音を1回鳴らすと確実に音が出せるようになる
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination); s.start(0);
    } catch {}
  }
  ensureBgm();
}

/** 流れているべきBGMが鳴っていなければ流す */
function ensureBgm() {
  if (!wantBgm || !ctx || ctx.state !== 'running') return;
  // クリア・ゲームオーバーのような1回だけの曲は、終わった後にタップしても流し直さない
  if (bgmCur && bgmCur.name === wantBgm && (!bgmCur.ended || !bgmCur.loop)) return;
  playBgm(wantBgm, wantFb);
}

// 画面を閉じたり別アプリに切り替えたら音を止め、戻ったら再開（電池の節約と、裏で鳴り続けないように）
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {});
  else if (unlocked) { setAmbient(); ctx.resume().then(ensureBgm).catch(() => {}); }
});

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

function loadSe(name, urgent) {
  if (!ctx || seBuf.has(name) || seBusy.has(name) || (seTries[name] || 0) >= 3) return;
  seBusy.add(name);
  getRaw('se', name)
    .then((bytes) => decode(bytes, urgent))
    .then((buf) => {
      seBuf.set(name, buf);
      // 読み込み待ちの間に押された音は、すぐなら鳴らす
      if (seWant[name] && performance.now() - seWant[name] < 1000) { delete seWant[name]; sfx(name); }
    })
    .catch(() => { seTries[name] = (seTries[name] || 0) + 1; })
    .finally(() => seBusy.delete(name));
}

// 同じ音が短時間に重なりすぎないための間隔（ミリ秒）
const GAP = { hit: 70, kill: 60, gem: 45, shoot: 80, shoot2: 110, reel: 60, slash: 90, boom: 120, zap: 110, coin: 220, click: 40, hurt: 200, fire: 450, ice: 150, arrow: 90, missile: 150, heal: 250, spike: 300 };
// よく鳴る音は小さめに（音源の大きさはそろえてあるので、ここは鳴る回数に合わせた調整）
const SE_VOL = { gem: 0.35, hit: 0.35, kill: 0.5, shoot: 0.45, reel: 0.45, shoot2: 0.5, fire: 0.35, coin: 0.55, slash: 0.7, ice: 0.6, arrow: 0.6, missile: 0.6, click: 0.8 };

export function sfx(name) {
  if (!ctx || vol.se === 0) return;
  if (ctx.state !== 'running') { if (unlocked) ctx.resume().catch(() => {}); return; }
  const now = performance.now();
  if (lastPlay[name] && now - lastPlay[name] < (GAP[name] ?? 60)) return;
  const buf = seBuf.get(name);
  if (!buf) { seWant[name] = now; loadSe(name, true); return; }
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
  return { ctx: ctx?.state, bgm: bgmName, playing: !!(bgmCur && !bgmCur.ended), seLoaded: [...seBuf.keys()], bgmLoaded: [...bgmBuf.keys()], live: [...liveBgm].map((c) => c.name), vol: { ...vol } };
}

async function getBgm(name) {
  if (bgmBuf.has(name)) { const v = bgmBuf.get(name); bgmBuf.delete(name); bgmBuf.set(name, v); return v; }
  if (bgmBusy.has(name)) return bgmBusy.get(name);
  const s = (await loadSources()).bgm?.[name];
  if (!s || !ctx || (bgmTries[name] || 0) >= 3) return null;
  const p = (async () => {
    try {
      const buffer = await decode(await getRaw('bgm', name), true);
      const item = { buffer, loop: !!s.loop };
      bgmBuf.set(name, item);
      raw.delete('bgm:' + name); // 変換後は元データ不要（メモリ節約）
      // メモリ節約：使った順に新しい3曲だけ残す
      while (bgmBuf.size > 3) bgmBuf.delete(bgmBuf.keys().next().value);
      return item;
    } catch {
      bgmTries[name] = (bgmTries[name] || 0) + 1; // 失敗しても、次に呼ばれたときにやり直す
      return null;
    } finally { bgmBusy.delete(name); }
  })();
  bgmBusy.set(name, p);
  return p;
}

function fadeTo(gainNode, to, sec) {
  const g = gainNode.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(to, t + sec);
}

/** 鳴っているBGMをフェードアウトして止め、少し後にスピーカーからも切り離す（iPhoneで止まりきらず重なるのを防ぐ） */
function fadeOut(c, sec) {
  if (c.fading) return;
  c.fading = true;
  try { fadeTo(c.gain, 0, sec); } catch {}
  try { c.src.stop(ctx.currentTime + sec + 0.05); } catch {}
  setTimeout(() => {
    try { c.src.disconnect(); } catch {}
    try { c.gain.disconnect(); } catch {}
    c.ended = true;
    liveBgm.delete(c);
  }, (sec + 0.2) * 1000);
}
/** 鳴っているBGMを全部止める（except だけ残す） */
function silenceAll(sec, except) {
  for (const c of [...liveBgm]) if (c !== except) fadeOut(c, sec);
}

/**
 * 場面のBGMに切り替える
 * @param {string} name sources.json の bgm のキー（例 home, battle_grass, boss）
 * @param {string} [fallback] そのBGMが無いときに代わりに流すもの
 */
export async function playBgm(name, fallback) {
  wantBgm = name; wantFb = fallback || null;
  if (!ctx) { loadSources().then((src) => { if (src.bgm?.[name]) getRaw('bgm', name).catch(() => {}); }); return; }
  if (bgmCur && bgmCur.name === name && !bgmCur.ended) return;
  let item = await getBgm(name);
  let playName = name;
  if (!item && fallback) { item = await getBgm(fallback); playName = fallback; }
  if (wantBgm !== name) return; // 読み込み中に別の場面へ移った
  if (bgmCur && bgmCur.name === name && !bgmCur.ended) return;
  // 前の場面の曲は、新しい曲を流せるかどうかに関係なく必ず止める
  silenceAll(0.4);
  bgmCur = null;
  // まだ音が使えない（一度も画面を触っていない・一時的に止まっている）ときは、使えるようになってから流す
  if (ctx.state !== 'running') return;
  bgmName = name;
  bgmCur = null;
  if (!item) return;
  const src = ctx.createBufferSource();
  src.buffer = item.buffer;
  src.loop = item.loop;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(g).connect(bgmGain);
  const cur = { name, playName, src, gain: g, ended: false, loop: item.loop };
  liveBgm.add(cur);
  src.onended = () => { cur.ended = true; liveBgm.delete(cur); };
  src.start();
  fadeTo(g, 1, 0.5);
  bgmCur = cur;
}

export function stopBgm() {
  wantBgm = null; wantFb = null;
  if (ctx) silenceAll(0.3);
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
