// セーブデータ管理（端末内オートセーブ / JSONバックアップ / マイグレーション）
import { APP_VERSION, SCHEMA_VERSION } from './version.js';
import { CHARACTERS, SLOTS, EQUIP } from './data.js';

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
    chars[id] = { unlocked: !c.unlock, level: 1, awaken: 0, equip: emptyEquip() };
  }
  Object.assign(chars.neo.equip, { weapon: 1, body: 2, feet: 3 }); // 初期装備
  return {
    gold: 1500,
    tickets: 5,
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
    settings: { bgmVol: 60, seVol: 80, notify: false },
    stats: { runs: 0, kills: 0, clears: 0, gachaTotal: 0, bossKills: 0 },
    login: { lastDay: '', count: 0, total: 0 },
    missions: { day: '', week: '', d: {}, w: {}, dc: [], wc: [], perm: [] },
    presents: [],
    receivedGifts: [],
    profile: { name: 'プレイヤー', icon: 'char:neo', frame: 'basic' },
    rank: { lv: 1, exp: 0 },
    seenNews: '',
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
  for (const c of Object.values(d.chars)) c.equip = { ...emptyEquip(), ...c.equip };
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
  return save;
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

export function parseImportText(text) {
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
    tickets: d.tickets || 0,
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
