// 効果音とBGM（WebAudioでその場で合成するので音声ファイル不要）
let ctx = null;
let master = null;
const settings = { se: true, bgm: true };
const lastPlay = {};

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

export function setAudio(opt) {
  Object.assign(settings, opt);
  if (!settings.bgm) stopBgm();
}

function tone(freq, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.2) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(g).connect(master);
  s.start();
}

const SFX = {
  shoot: [60, () => tone(880, 0.05, 'square', 0.04, -400)],
  shoot2: [80, () => tone(1200, 0.06, 'triangle', 0.06, 300)],
  slash: [80, () => { noise(0.08, 0.1); tone(300, 0.08, 'sawtooth', 0.05, 400); }],
  missile: [100, () => tone(200, 0.15, 'sawtooth', 0.04, 300)],
  zap: [100, () => { tone(1500, 0.08, 'square', 0.05, -1200); noise(0.05, 0.06); }],
  boom: [70, () => { noise(0.2, 0.18); tone(120, 0.2, 'square', 0.08, -80); }],
  hit: [40, () => tone(220, 0.03, 'square', 0.03)],
  kill: [45, () => tone(520, 0.05, 'square', 0.04, -300)],
  gem: [35, () => tone(1320, 0.04, 'triangle', 0.04, 200)],
  coin: [60, () => { tone(988, 0.06, 'square', 0.06); tone(1318, 0.12, 'square', 0.06, 0, 0.06); }],
  heal: [100, () => [523, 659, 784].forEach((f, i) => tone(f, 0.1, 'triangle', 0.08, 0, i * 0.06))],
  magnet: [100, () => tone(300, 0.3, 'sine', 0.1, 900)],
  hurt: [120, () => { tone(160, 0.15, 'sawtooth', 0.12, -60); }],
  levelup: [200, () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.07, 0, i * 0.07))],
  boss: [500, () => [110, 104, 98].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 0, i * 0.3))],
  shootBoss: [200, () => tone(180, 0.2, 'square', 0.06, -100)],
  clear: [500, () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, 'square', 0.08, 0, i * 0.1))],
  over: [500, () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, 0, i * 0.18))],
  click: [40, () => tone(660, 0.04, 'square', 0.05)],
  reel: [50, () => tone(900 + Math.random() * 300, 0.025, 'square', 0.035)],
  reelStop: [60, () => { tone(520, 0.06, 'square', 0.07); tone(1040, 0.1, 'triangle', 0.06, 0, 0.04); }],
  gate: [400, () => { [392, 523, 659].forEach((f, i) => tone(f, 0.15, 'triangle', 0.08, 0, i * 0.08)); noise(0.15, 0.05); }],
  gacha: [300, () => [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.1, 'triangle', 0.08, 0, i * 0.05))],
  rare: [300, () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'square', 0.08, 0, i * 0.08))],
};

export function sfx(name) {
  if (!ctx || !settings.se) return;
  const d = SFX[name];
  if (!d) return;
  const now = performance.now();
  if (lastPlay[name] && now - lastPlay[name] < d[0]) return;
  lastPlay[name] = now;
  d[1]();
}

// ===== BGM: シンプルなチップチューン =====
let bgmTimer = null;
let step = 0;
let nextTime = 0;
const TEMPO = 132;
const PATTERNS = {
  battle: {
    chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],
    bass: [45, 41, 43, 40],
  },
  home: {
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    bass: [48, 45, 41, 43],
  },
};
let current = 'home';
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function playBgm(name) {
  current = name;
  if (!ctx || !settings.bgm) return;
  if (bgmTimer) return;
  step = 0;
  nextTime = ctx.currentTime + 0.1;
  bgmTimer = setInterval(schedule, 50);
}
export function stopBgm() {
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
}
function schedule() {
  if (!ctx) return;
  const spb = 60 / TEMPO / 2; // 8分音符
  while (nextTime < ctx.currentTime + 0.2) {
    const p = PATTERNS[current];
    const bar = Math.floor(step / 8) % 4;
    const chord = p.chords[bar];
    const s = step % 8;
    const dt = nextTime - ctx.currentTime;
    if (s % 2 === 0) tone(mtof(p.bass[bar]), spb * 1.6, 'triangle', 0.09, 0, dt);
    const arp = chord[s % 3] + (s >= 4 ? 12 : 0);
    tone(mtof(arp + 12), spb * 0.8, 'square', current === 'battle' ? 0.025 : 0.018, 0, dt);
    if (current === 'battle' && s % 4 === 2) {
      // ハイハット風
      const len = 0.03;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = 0.04;
      src.buffer = buf;
      src.connect(g).connect(master);
      src.start(ctx.currentTime + dt);
    }
    nextTime += spb;
    step++;
  }
}
