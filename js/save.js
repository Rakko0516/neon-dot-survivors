// セーブデータ管理（端末内オートセーブ / JSONバックアップ / マイグレーション）
import { APP_VERSION, SCHEMA_VERSION } from './version.js';
import { CHARACTERS, SLOTS, EQUIP, RARITIES } from './data.js';

export function emptyEquip() {
  const e = {};
  for (const s of SLOTS) e[s.id] = null;
  return e;
}

const KEY = 'nds_save';
const PREV_KEY = 'nds_save_prev'; // 上書き前の安全用コピー
const SALT = 'neon-dot-survivors';

const listeners = new Set();
export const store = { save: null };

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(store.save); }

export function defaultData() {
  const chars = {};
  for (const [id, c] of Object.entries(CHARACTERS)) {
    chars[id] = { unlocked: !c.unlock, level: 1, awaken: 0 };
  }
  return {
    // 装備は全キャラ共通（キャラを変えたときはキャラだけ入れ替わる）
    equip: { ...emptyEquip(), weapon: 1, body: 2, feet: 3 }, // 初期装備
    gold: 1500,
    ticketsChar: 5,   // キャラガチャチケット
    ticketsEquip: 5,  // 装備ガチャチケット
    maxStage: 0,
    selectedStage: 1,
    selectedChar: 'neo',
    chars,
    items: [
      { uid: 1, base: 'w_sword', rarity: 'N', level: 1 },
      { uid: 2, base: 'b_armor', rarity: 'N', level: 1 },
      { uid: 3, base: 'f_boots', rarity: 'N', level: 1 },
      { uid: 4, base: 'r_ruby', rarity: 'R', level: 1 },
    ],
    nextUid: 5,
    // offlineAuto：遊べるステージの曲を自動で端末に保存する / offlineSkip：自分で削除したもの（自動保存しない）
    settings: { bgmVol: 60, seVol: 80, notify: false, offlineAuto: true, offlineSkip: [], enemyHelp: true },
    stats: { runs: 0, kills: 0, clears: 0, gachaTotal: 0, bossKills: 0, googleLinked: 0 },
    // streak：いま何日連続でログインしているか / best：いちばん長く続いた連続日数
    login: { lastDay: '', count: 0, total: 0, streak: 0, best: 0 },
    missions: { day: '', week: '', d: {}, w: {}, dc: [], wc: [], perm: [] },
    presents: [],
    receivedGifts: [],
    profile: { name: 'プレイヤー', icon: 'char:neo', frame: 'basic' },
    rank: { lv: 1, exp: 0 },
    seenNews: '',
    // 出会った敵（m=モブ / b=ボス）と、説明を見たもの（p=行動パターン / hb=ボス）
    seen: { m: [], b: [], p: [], hb: [] },
    // 装備とキャラの組み合わせのプリセット（仲間のキャラの数だけ使える）{ name, char, equip }
    presets: [],
  };
}

// ===== セーブ形式の変換 =====
// 例: SCHEMA_VERSION を 2 に上げたら { 2: (d) => { d.newField = 0; return d; } } を追加
const MIGRATIONS = {
  // v1 → v2：装備3枠（武器・アーマー・アクセ）→ 全身8枠、装備の種類を新しいものに置き換え
  2: (d) => {
    const baseMap = {
      w_blade: 'w_sword', w_mic: 'w_staff', w_rail: 'w_gun',
      a_coat: 'b_armor', a_idol: 'b_robe', a_mech: 'b_armor',
      c_head: 'n_pendant', c_ring: 'r_ruby', c_charm: 'r_emerald',
    };
    for (const it of d.items || []) if (baseMap[it.base]) it.base = baseMap[it.base];
    for (const c of Object.values(d.chars || {})) {
      const old = c.equip || {};
      c.equip = emptyEquip();
      c.equip.weapon = old.weapon ?? null;
      c.equip.body = old.armor ?? null;
      // アクセサリーは種類（首飾り／指輪）に合う枠へ
      const acc = (d.items || []).find((i) => i.uid === old.acc);
      if (acc) c.equip[EQUIP[acc.base]?.type === 'neck' ? 'neck' : 'ring1'] = acc.uid;
    }
    return d;
  },
  // v2 → v3：クリスタルを廃止し、ガチャチケット（100個→1枚）とコイン（端数×10）に両替
  3: (d) => {
    const cr = d.crystal || 0;
    d.tickets = (d.tickets || 0) + Math.floor(cr / 100);
    d.gold = (d.gold || 0) + (cr % 100) * 10;
    delete d.crystal;
    delete d.lastLoginDay;
    return d;
  },
  // v3 → v4：ランクを「クリアしたステージ数」から「ランク経験値」方式へ（今のランクは引き継ぐ）
  4: (d) => {
    d.rank = { lv: Math.max(1, (d.maxStage || 0) + 1), exp: 0 };
    return d;
  },
  // v5 → v6：装備をキャラごとから全キャラ共通に（いま出撃しているキャラの装備を共通の装備にする）
  6: (d) => {
    const cur = d.chars?.[d.selectedChar]?.equip || {};
    d.equip = { ...emptyEquip(), ...cur };
    for (const c of Object.values(d.chars || {})) delete c.equip;
    return d;
  },
  // v4 → v5：ガチャチケットを「キャラガチャチケット」と「装備ガチャチケット」の2種類に分ける。
  // 今までのチケットは回収（未受け取りのプレゼントのチケットも）。代わりに gifts.json で各50枚を配布
  5: (d) => {
    delete d.tickets;
    d.ticketsChar = 0;
    d.ticketsEquip = 0;
    d.presents = (d.presents || []).map((p) => {
      const r = { ...(p.reward || {}) };
      delete r.ticket;
      return { ...p, reward: r };
    }).filter((p) => Object.keys(p.reward).length);
    return d;
  },
};

function migrate(save) {
  let v = save.schemaVersion || 1;
  while (v < SCHEMA_VERSION) {
    v++;
    const fn = MIGRATIONS[v];
    if (fn) save.data = fn(save.data);
    save.schemaVersion = v;
  }
  // 新キャラ追加などで足りない項目を補完
  const def = defaultData();
  const d = save.data;
  for (const k of Object.keys(def)) if (d[k] === undefined) d[k] = def[k];
  for (const id of Object.keys(def.chars)) if (!d.chars[id]) d.chars[id] = def.chars[id];
  d.equip = { ...emptyEquip(), ...d.equip };
  d.items = d.items.filter((i) => EQUIP[i.base]);
  d.settings = { ...def.settings, ...d.settings };
  // 旧形式（オン/オフ）→ 音量
  if (typeof d.settings.bgm === 'boolean') { if (!d.settings.bgm) d.settings.bgmVol = 0; delete d.settings.bgm; }
  if (typeof d.settings.se === 'boolean') { if (!d.settings.se) d.settings.seVol = 0; delete d.settings.se; }
  d.stats = { ...def.stats, ...d.stats };
  d.login = { ...def.login, ...d.login };
  d.missions = { ...def.missions, ...d.missions };
  d.profile = { ...def.profile, ...d.profile };
  d.rank = { ...def.rank, ...d.rank };
  for (const c of Object.values(d.chars)) if (c.awaken === undefined) c.awaken = 0;
  sanitize(d);
  return save;
}

// ===== データの無害化 =====
// ファイル読み込み・クラウド・引っ越しリンクなど「外から来たデータ」に
// 画面を乗っ取る文字列（HTMLやスクリプト）や異常な値が入っていても、ここで取り除く
const num = (v, min, max, def = 0) => (Number.isFinite(+v) ? Math.min(max, Math.max(min, Math.floor(+v))) : def);
const safeText = (v, max) => String(v ?? '').replace(/[<>"'`&\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, max);
const safeId = (v, max = 40) => String(v ?? '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, max);
/** 報酬はコイン・キャラガチャチケット・装備ガチャチケットだけ */
export function cleanReward(r) {
  const out = {};
  if (r?.gold) out.gold = num(r.gold, 0, 1e9);
  if (r?.cticket) out.cticket = num(r.cticket, 0, 1e5);
  if (r?.eticket) out.eticket = num(r.eticket, 0, 1e5);
  return out;
}
function sanitize(d) {
  d.gold = num(d.gold, 0, 1e12);
  d.ticketsChar = num(d.ticketsChar, 0, 1e7);
  d.ticketsEquip = num(d.ticketsEquip, 0, 1e7);
  delete d.tickets;
  d.maxStage = num(d.maxStage, 0, 9999);
  d.selectedStage = num(d.selectedStage, 1, 9999, 1);
  d.nextUid = num(d.nextUid, 1, 1e9, 1);
  if (!CHARACTERS[d.selectedChar]) d.selectedChar = 'neo';
  // キャラ：知らないキャラは捨てる
  for (const id of Object.keys(d.chars)) {
    if (!CHARACTERS[id]) { delete d.chars[id]; continue; }
    const c = d.chars[id];
    c.unlocked = !!c.unlocked;
    c.level = num(c.level, 1, 999, 1);
    c.awaken = num(c.awaken, 0, 99);
    delete c.equip;
  }
  // 装備：知らない種類・レア度は捨てる、個数の上限
  d.items = (Array.isArray(d.items) ? d.items : [])
    .filter((i) => i && EQUIP[i.base] && RARITIES[i.rarity] && Number.isFinite(i.uid))
    .slice(0, 3000)
    .map((i) => ({ uid: num(i.uid, 1, 1e9), base: i.base, rarity: i.rarity, level: num(i.level, 1, 999, 1), plus: num(i.plus, 0, 5) }));
  // 共通の装備：持っている装備だけ・同じ装備を2か所に付けない
  {
    const have = new Set(d.items.map((i) => i.uid));
    const used = new Set();
    const eq = emptyEquip();
    for (const k of Object.keys(eq)) {
      const u = d.equip?.[k];
      if (Number.isFinite(u) && have.has(u) && !used.has(u)) { eq[k] = u; used.add(u); }
    }
    d.equip = eq;
  }
  // プロフィール
  d.profile = d.profile || {};
  d.profile.name = safeText(d.profile.name, 12) || 'プレイヤー';
  d.profile.icon = safeId(d.profile.icon) || 'char:neo';
  d.profile.frame = safeId(d.profile.frame) || 'basic';
  d.rank = { lv: num(d.rank?.lv, 1, 99, 1), exp: num(d.rank?.exp, 0, 1e9) };
  // プレゼント：題名は文字だけ、報酬はコインとチケットだけ
  d.presents = (Array.isArray(d.presents) ? d.presents : []).slice(0, 100).map((p) => ({
    id: safeId(p?.id, 40) || Math.random().toString(36).slice(2),
    title: safeText(p?.title, 40) || 'プレゼント',
    reward: cleanReward(p?.reward),
    from: ['login', 'gift', 'system'].includes(p?.from) ? p.from : 'system',
    at: num(p?.at, 0, 4e12),
  }));
  d.receivedGifts = (Array.isArray(d.receivedGifts) ? d.receivedGifts : []).map((x) => safeId(x, 60)).slice(-500);
  d.seenNews = safeText(d.seenNews, 80);
  d.login = {
    lastDay: /^\d{4}-\d{2}-\d{2}$/.test(d.login?.lastDay || '') ? d.login.lastDay : '',
    count: num(d.login?.count, 0, 1e6), total: num(d.login?.total, 0, 1e6),
    streak: num(d.login?.streak, 0, 1e6), best: num(d.login?.best, 0, 1e6),
  };
  // 連続記録が無い古いデータ：ログインしたことがあれば「1日目」から数える
  if (d.login.total > 0 && !d.login.streak) d.login.streak = 1;
  if (d.login.best < d.login.streak) d.login.best = d.login.streak;
  const ids = (a) => (Array.isArray(a) ? a : []).map((x) => safeId(x, 30)).filter(Boolean).slice(0, 300);
  d.seen = { m: ids(d.seen?.m), b: ids(d.seen?.b), p: ids(d.seen?.p), hb: ids(d.seen?.hb) };
  // プリセット：知らないキャラは捨て、装備は部位ごとの番号だけ残す（なくなった装備は呼び出し時に外れる）
  d.presets = (Array.isArray(d.presets) ? d.presets : []).slice(0, 20).map((p) => (p && CHARACTERS[p.char] ? {
    name: safeText(p.name, 12),
    char: p.char,
    equip: Object.fromEntries(Object.keys(emptyEquip()).map((k) => [k, Number.isFinite(p.equip?.[k]) ? num(p.equip[k], 1, 1e9) : null])),
  } : null));
  d.settings = {
    bgmVol: num(d.settings?.bgmVol, 0, 100, 60), seVol: num(d.settings?.seVol, 0, 100, 80), notify: !!d.settings?.notify,
    offlineAuto: d.settings?.offlineAuto !== false,
    enemyHelp: d.settings?.enemyHelp !== false,
    offlineSkip: (Array.isArray(d.settings?.offlineSkip) ? d.settings.offlineSkip : []).map((x) => safeId(x, 30)).filter(Boolean).slice(0, 40),
  };
  for (const k of Object.keys(d.stats)) d.stats[k] = num(d.stats[k], 0, 1e12);
  return d;
}

// FNV-1a ハッシュ（改ざん検知の目安。完全な対策ではありません）
export function checksum(data) {
  const s = JSON.stringify(data) + SALT;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function wrap(data, playTime = 0) {
  return {
    schemaVersion: SCHEMA_VERSION,
    gameVersion: APP_VERSION,
    updatedAt: Date.now(),
    playTime,
    data,
    checksum: checksum(data),
  };
}

/** 外部から来たセーブ（JSON/クラウド）を検証して取り込める形にする */
export function validate(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'セーブデータの形式ではありません' };
  if (!obj.data || typeof obj.data !== 'object') return { ok: false, error: 'data が見つかりません' };
  if ((obj.schemaVersion || 1) > SCHEMA_VERSION) {
    return { ok: false, error: 'このセーブは新しいバージョンのゲームで作られています。ページを更新してください。' };
  }
  const tampered = obj.checksum && obj.checksum !== checksum(obj.data);
  try {
    const save = migrate(JSON.parse(JSON.stringify(obj)));
    if (!Array.isArray(save.data.items) || typeof save.data.chars !== 'object') throw new Error('壊れたデータ');
    return { ok: true, save, tampered };
  } catch (e) {
    return { ok: false, error: 'データが壊れています（' + e.message + '）' };
  }
}

export function load() {
  let save = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const r = validate(JSON.parse(raw));
      if (r.ok) save = r.save;
    }
  } catch {}
  if (!save) {
    // 本体が壊れていたら予備から復旧
    try {
      const raw = localStorage.getItem(PREV_KEY);
      if (raw) {
        const r = validate(JSON.parse(raw));
        if (r.ok) save = r.save;
      }
    } catch {}
  }
  if (!save) save = wrap(defaultData());
  store.save = save;
  persist(false);
  return save;
}

function persist(touch = true) {
  const s = store.save;
  if (touch) s.updatedAt = Date.now();
  s.gameVersion = APP_VERSION;
  s.checksum = checksum(s.data);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('save failed', e);
  }
}

/** データを書き換えたら呼ぶ（オートセーブ） */
export function commit() {
  persist(true);
  emit();
}

export function addPlayTime(sec) {
  store.save.playTime = (store.save.playTime || 0) + sec;
  persist(false);
}

/** 今のセーブを予備に退避（上書き前に呼ぶ） */
export function backupCurrent() {
  try { localStorage.setItem(PREV_KEY, JSON.stringify(store.save)); } catch {}
}

/** セーブ丸ごと置き換え（JSON読み込み・クラウド復元） */
export function replaceSave(save, keepTimestamp = true) {
  backupCurrent();
  store.save = save;
  persist(!keepTimestamp);
  emit();
}

export function hasPrevBackup() {
  return !!localStorage.getItem(PREV_KEY);
}
export function restorePrev() {
  const raw = localStorage.getItem(PREV_KEY);
  if (!raw) return false;
  const r = validate(JSON.parse(raw));
  if (!r.ok) return false;
  const cur = store.save;
  store.save = r.save;
  persist(false);
  try { localStorage.setItem(PREV_KEY, JSON.stringify(cur)); } catch {}
  emit();
  return true;
}

export function resetAll() {
  backupCurrent();
  store.save = wrap(defaultData());
  persist(true);
  emit();
}

// ===== JSON 書き出し / 読み込み =====
export function exportFile() {
  persist(false);
  const text = JSON.stringify(store.save, null, 2);
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const name = `neondot_save_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return { name, text };
}

/** 引っ越し用：セーブを圧縮してURLに入れられる文字列にする（URLの#以降はサーバーに送られない） */
export async function packForMove() {
  persist(false);
  const bytes = new TextEncoder().encode(JSON.stringify(store.save));
  let out = bytes;
  if ('CompressionStream' in window) {
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    out = new Uint8Array(await new Response(cs).arrayBuffer());
  }
  let bin = '';
  for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
  return ('CompressionStream' in window ? 'z' : 'j') + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function unpackMove(str) {
  const kind = str[0];
  const b64 = str.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (kind === 'z') {
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  return parseImportText(new TextDecoder().decode(bytes));
}

export function parseImportText(text) {
  if (typeof text !== 'string' || text.length > 2_000_000) return { ok: false, error: 'ファイルが大きすぎます' };
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'JSONとして読み込めませんでした' }; }
  return validate(obj);
}

/** 画面表示用の要約 */
export function summary(save) {
  const d = save.data;
  const charLv = Object.values(d.chars).reduce((a, c) => a + (c.unlocked ? c.level : 0), 0);
  return {
    stage: d.maxStage,
    gold: d.gold || 0,
    ticketsChar: d.ticketsChar || 0,
    ticketsEquip: d.ticketsEquip || 0,
    items: d.items.length,
    charLv,
    playTime: save.playTime || 0,
    updatedAt: save.updatedAt,
    gameVersion: save.gameVersion,
  };
}

export function formatPlayTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}時間${m}分` : `${m}分`;
}
export function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
