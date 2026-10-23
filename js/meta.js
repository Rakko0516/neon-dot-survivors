// 遊びの外側の仕組み：ガチャ・ミッション・ログインボーナス・プレゼントボックス
// 毎日0時（端末の時刻）でデイリーとログインボーナスが更新、毎週月曜0時でウィークリーが更新されます。
import { store, commit, cleanReward } from './save.js';
import { CHARACTERS, GACHAS, AWAKEN_MAX, EQUIP, rollRarity, randomEquipBase } from './data.js';

const data = () => store.save.data;

// ===================== 日付 =====================
const pad = (n) => String(n).padStart(2, '0');
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function weekKey(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); // 月曜日
  return dayKey(m);
}
/** 次の0時まで / 次の月曜0時までの残り時間（表示用） */
export function untilReset(kind) {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (kind === 'weekly') next.setDate(next.getDate() + ((8 - next.getDay()) % 7));
  const ms = next - now;
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}日${h % 24}時間` : h ? `${h}時間${m}分` : `${m}分`;
}

// ===================== 報酬 =====================
// cticket＝キャラガチャチケット（ピンク） / eticket＝装備ガチャチケット（青）
export const REWARD_NAMES = { gold: 'コイン', cticket: 'キャラガチャチケット', eticket: '装備ガチャチケット' };
export const TICKET_COLOR = { char: '#ff7a9a', equip: '#4aa8ff' };
export const REWARD_ICON = { gold: ['coin', '#ffcf3a'], cticket: ['ticket', TICKET_COLOR.char], eticket: ['ticket', TICKET_COLOR.equip] };

/** { gold: 500, cticket: 1, eticket: 1 } を受け取る */
export function grant(reward) {
  const d = data();
  if (reward.gold) d.gold += reward.gold;
  if (reward.cticket) d.ticketsChar += reward.cticket;
  if (reward.eticket) d.ticketsEquip += reward.eticket;
}
export function rewardText(reward) {
  return Object.entries(reward).map(([k, v]) => `${REWARD_NAMES[k] || k} ×${v.toLocaleString()}`).join('、');
}

// ===================== プレゼントボックス =====================
export function addPresent(title, reward, from = 'system') {
  const d = data();
  reward = cleanReward(reward);
  if (!Object.keys(reward).length) return;
  d.presents.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, reward, from, at: Date.now() });
  if (d.presents.length > 100) d.presents.length = 100;
}
export function claimPresent(id) {
  const d = data();
  const i = d.presents.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const [p] = d.presents.splice(i, 1);
  grant(p.reward);
  commit();
  return p;
}
export function claimAllPresents() {
  const d = data();
  const total = {};
  for (const p of d.presents) for (const [k, v] of Object.entries(p.reward)) total[k] = (total[k] || 0) + v;
  const n = d.presents.length;
  d.presents = [];
  grant(total);
  commit();
  return { n, total };
}

/** 運営からのプレゼント（gifts.json）。まだ受け取っていないものをプレゼントボックスへ */
export async function syncGifts() {
  let list = [];
  try {
    const res = await fetch('./gifts.json?t=' + Date.now(), { cache: 'no-store' });
    list = (await res.json()).gifts || [];
  } catch { return 0; }
  const d = data();
  const today = dayKey();
  let added = 0;
  for (const g of list) {
    if (!g.id || d.receivedGifts.includes(g.id)) continue;
    if (g.until && g.until < today) continue;
    if (g.from && g.from > today) continue;
    addPresent(g.title, g.reward, 'gift');
    d.receivedGifts.push(g.id);
    added++;
  }
  if (added) commit();
  return added;
}

// ===================== ログインボーナス（7日周期） =====================
export const LOGIN_CYCLE = [
  { gold: 500 },
  { eticket: 1 },
  { gold: 1000 },
  { cticket: 1 },
  { gold: 2000 },
  { eticket: 2 },
  { cticket: 3, eticket: 2 },
];

/** 今日まだ受け取っていなければ受け取ってプレゼントボックスへ。受け取った日の番号(0-6)を返す */
export function checkLoginBonus() {
  const d = data();
  const today = dayKey();
  if (d.login.lastDay === today) return null;
  d.login.lastDay = today;
  const idx = d.login.count % LOGIN_CYCLE.length;
  d.login.count++;
  d.login.total++;
  addPresent(`ログインボーナス ${idx + 1}日目`, LOGIN_CYCLE[idx], 'login');
  track('login');
  commit();
  return idx;
}

// ===================== ミッション =====================
// ev：数える出来事  goal：目標  reward：報酬
export const MISSIONS = {
  daily: [
    { id: 'd_login', name: 'ログインする', ev: 'login', goal: 1, reward: { gold: 300 } },
    { id: 'd_play', name: 'ステージを2回プレイする', ev: 'play', goal: 2, reward: { gold: 500 } },
    { id: 'd_kill', name: '敵を150体倒す', ev: 'kill', goal: 150, reward: { gold: 500 } },
    { id: 'd_gacha', name: 'ガチャを1回引く', ev: 'gacha', goal: 1, reward: { gold: 300 } },
    { id: 'd_up', name: '装備かキャラを1回強化する', ev: 'upgrade', goal: 1, reward: { gold: 300 } },
    { id: 'd_all', name: 'デイリーミッションを5つ達成', ev: '_dailyAll', goal: 5, reward: { cticket: 1 } },
  ],
  weekly: [
    { id: 'w_login', name: '5日ログインする', ev: 'login', goal: 5, reward: { cticket: 2 } },
    { id: 'w_play', name: 'ステージを15回プレイする', ev: 'play', goal: 15, reward: { eticket: 3 } },
    { id: 'w_boss', name: 'ボスを5体倒す', ev: 'boss', goal: 5, reward: { cticket: 2 } },
    { id: 'w_kill', name: '敵を2000体倒す', ev: 'kill', goal: 2000, reward: { gold: 5000 } },
    { id: 'w_gacha', name: 'ガチャを10回引く', ev: 'gacha', goal: 10, reward: { gold: 3000 } },
    { id: 'w_up', name: '強化を10回する', ev: 'upgrade', goal: 10, reward: { gold: 3000 } },
  ],
  // 常時（一度だけ）：stat は累計の値
  perm: [
    { id: 'p_google', name: 'Google連携をしよう', stat: 'google', goal: 1, reward: { cticket: 3, eticket: 3, gold: 3000 } },
    ...[1, 2, 3, 5, 8, 10, 15, 20, 25, 30].map((n) => ({ id: `p_stage${n}`, name: `STAGE ${n} をクリア`, stat: 'maxStage', goal: n, reward: n >= 10 ? { cticket: 3, eticket: 3 } : n >= 3 ? { cticket: 1, eticket: 1, gold: 1000 } : { gold: 1000 } })),
    ...[300, 1000, 3000, 10000, 30000].map((n, i) => ({ id: `p_kill${n}`, name: `敵を累計 ${n.toLocaleString()} 体倒す`, stat: 'kills', goal: n, reward: i >= 2 ? { eticket: 3 } : { gold: 2000 } })),
    ...[4, 6, 8, 10, 12].map((n) => ({ id: `p_chars${n}`, name: `キャラを ${n} 人そろえる`, stat: 'chars', goal: n, reward: { cticket: 2 } })),
    ...[10, 50, 100, 300].map((n) => ({ id: `p_gacha${n}`, name: `ガチャを累計 ${n} 回引く`, stat: 'gachaTotal', goal: n, reward: n >= 100 ? { cticket: 3, eticket: 3 } : { cticket: 1, eticket: 1 } })),
    ...[3, 10, 30].map((n) => ({ id: `p_login${n}`, name: `累計 ${n} 日ログイン`, stat: 'loginTotal', goal: n, reward: n >= 30 ? { cticket: 3, eticket: 3 } : { cticket: 1, eticket: 1 } })),
  ],
};

function resetIfNeeded() {
  const m = data().missions;
  const dk = dayKey(), wk = weekKey();
  if (m.day !== dk) { m.day = dk; m.d = {}; m.dc = []; }
  if (m.week !== wk) { m.week = wk; m.w = {}; m.wc = []; }
}

/** 出来事を数える（play / kill / boss / gacha / upgrade / login） */
export function track(ev, n = 1) {
  const d = data();
  resetIfNeeded();
  const m = d.missions;
  m.d[ev] = (m.d[ev] || 0) + n;
  m.w[ev] = (m.w[ev] || 0) + n;
}

function statValue(stat) {
  const d = data();
  if (stat === 'maxStage') return d.maxStage;
  if (stat === 'kills') return d.stats.kills;
  if (stat === 'chars') return Object.values(d.chars).filter((c) => c.unlocked).length;
  if (stat === 'gachaTotal') return d.stats.gachaTotal || 0;
  if (stat === 'loginTotal') return d.login.total;
  if (stat === 'google') return d.stats.googleLinked ? 1 : 0;
  return 0;
}

/** 画面表示用：各ミッションの進み具合 */
export function missionList(kind) {
  resetIfNeeded();
  const d = data();
  const m = d.missions;
  const claimed = kind === 'daily' ? m.dc : kind === 'weekly' ? m.wc : m.perm;
  const counts = kind === 'daily' ? m.d : m.w;
  const list = MISSIONS[kind].map((def) => {
    let p;
    if (kind === 'perm') p = statValue(def.stat);
    else if (def.ev === '_dailyAll') p = MISSIONS.daily.filter((x) => x.ev !== '_dailyAll' && (m.d[x.ev] || 0) >= x.goal).length;
    else p = counts[def.ev] || 0;
    const done = p >= def.goal;
    return { ...def, p: Math.min(p, def.goal), done, claimed: claimed.includes(def.id) };
  });
  if (kind === 'perm') {
    // 常時は受け取り済みを後ろへ、同じ種類は次の目標だけ見せる
    const seen = new Set();
    return list.filter((x) => {
      if (x.claimed) return false;
      if (seen.has(x.stat)) return false;
      seen.add(x.stat);
      return true;
    });
  }
  return list;
}

export function claimMission(kind, id) {
  const m = data().missions;
  const item = missionList(kind).find((x) => x.id === id);
  if (!item || !item.done || item.claimed) return null;
  (kind === 'daily' ? m.dc : kind === 'weekly' ? m.wc : m.perm).push(id);
  grant(item.reward);
  commit();
  return item;
}

export function claimAllMissions(kind) {
  const total = {};
  let n = 0;
  for (let guard = 0; guard < 20; guard++) {
    const ready = missionList(kind).filter((x) => x.done && !x.claimed);
    if (!ready.length) break;
    for (const x of ready) {
      const r = claimMission(kind, x.id);
      if (r) { n++; for (const [k, v] of Object.entries(r.reward)) total[k] = (total[k] || 0) + v; }
    }
  }
  return { n, total };
}

export function claimableCount() {
  return ['daily', 'weekly', 'perm'].reduce((a, k) => a + missionList(k).filter((x) => x.done && !x.claimed).length, 0);
}

// ===================== ガチャ =====================
/** 支払い。成功すれば true */
export function payGacha(type, count, by) {
  const d = data();
  const g = GACHAS[type];
  if (by === 'ticket') {
    const key = type === 'char' ? 'ticketsChar' : 'ticketsEquip';
    if (d[key] < count) return false;
    d[key] -= count;
  } else {
    const cost = count === 10 ? g.coin10 : g.coin1 * count;
    if (d.gold < cost) return false;
    d.gold -= cost;
  }
  d.stats.gachaTotal = (d.stats.gachaTotal || 0) + count;
  track('gacha', count);
  return true;
}

function pickStar(rates) {
  let r = Math.random() * 100;
  for (const s of [5, 4, 3]) { r -= rates[s]; if (r <= 0) return s; }
  return 3;
}

/** キャラガチャ：結果 [{ id, star, isNew, awaken, coins }] */
export function pullChars(count) {
  const d = data();
  const g = GACHAS.char;
  const out = [];
  for (let i = 0; i < count; i++) {
    let star = pickStar(g.rates);
    if (count === 10 && i === 9 && out.every((o) => o.star < 4) && star < 4) star = 4; // 10連は★4以上1体確定
    const pool = Object.values(CHARACTERS).filter((c) => c.stars === star);
    const c = pool[Math.floor(Math.random() * pool.length)];
    const cs = d.chars[c.id];
    const r = { id: c.id, star, isNew: false, awaken: 0, coins: 0 };
    if (!cs.unlocked) { cs.unlocked = true; r.isNew = true; }
    else if ((cs.awaken || 0) < AWAKEN_MAX) { cs.awaken = (cs.awaken || 0) + 1; r.awaken = cs.awaken; }
    else { const coins = star === 5 ? 5000 : star === 4 ? 1500 : 500; d.gold += coins; r.coins = coins; }
    out.push(r);
  }
  commit();
  return out;
}

/** 装備ガチャ：結果は追加したアイテム */
export function pullEquips(count, addItem) {
  const got = [];
  for (let i = 0; i < count; i++) {
    let r = rollRarity(0);
    if (count === 10 && i === 9 && got.every((g) => g.rarity === 'N') && r === 'N') r = 'R';
    got.push(addItem(randomEquipBase(), r));
  }
  commit();
  return got;
}
void EQUIP;
