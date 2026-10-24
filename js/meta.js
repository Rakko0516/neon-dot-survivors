// 遊びの外側の仕組み：ガチャ・ミッション・ログインボーナス・プレゼントボックス
// 毎日0時（端末の時刻）でデイリーとログインボーナスが更新、毎週月曜0時でウィークリーが更新されます。
import { store, commit, cleanReward } from './save.js';
import { getDoc, normCode } from './server.js';
import { CHARACTERS, GACHAS, AWAKEN_MAX, DUPE_DIAMONDS, CHAR_PRICE, CHAR_BANNERS, PICKUP_SHARE, stdPool, EQUIP, SLOT_TYPE_NAMES, rollRarity, randomEquipBase } from './data.js';

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
export const REWARD_NAMES = { gold: 'コイン', cticket: 'キャラガチャチケット', eticket: '装備ガチャチケット', diamond: 'ダイヤ' };
export const TICKET_COLOR = { char: '#ff7a9a', equip: '#4aa8ff' };
export const REWARD_ICON = { gold: ['coin', '#ffcf3a'], cticket: ['ticket', TICKET_COLOR.char], eticket: ['ticket', TICKET_COLOR.equip], diamond: ['diamond', '#5ad8ff'] };

/** { gold: 500, cticket: 1, eticket: 1 } を受け取る */
export function grant(reward) {
  const d = data();
  if (reward.gold) d.gold += reward.gold;
  if (reward.cticket) d.ticketsChar += reward.cticket;
  if (reward.eticket) d.ticketsEquip += reward.eticket;
  if (reward.diamond) d.diamonds = (d.diamonds || 0) + reward.diamond;
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

// ===================== シークレットコード =====================
// 運営が Firestore の codes/{コード} に { title, reward, from, until } を置くと、ゲームを更新しなくても使えるようになる
const today = () => dayKey();
let codeFails = [];
/**
 * コードを使う。成功：{ ok:true, title, reward } / 失敗：{ ok:false, msg }
 */
export async function redeemCode(input) {
  const d = data();
  const code = normCode(input);
  if (code.length < 4) return { ok: false, msg: 'コードは4文字以上で入力してください' };
  // 何度もまちがえたら少し待ってもらう（総当たり対策）
  const now = Date.now();
  codeFails = codeFails.filter((t) => now - t < 60000);
  if (codeFails.length >= 5) return { ok: false, msg: '入力が多すぎます。1分ほど待ってからもう一度どうぞ' };
  if (d.usedCodes.includes(code)) return { ok: false, msg: 'このコードはもう使いました' };
  const r = await getDoc('codes/' + code);
  if (!r.ok) {
    if (r.reason === 'notfound') { codeFails.push(now); return { ok: false, msg: 'コードがちがいます' }; }
    if (r.reason === 'offline') return { ok: false, msg: 'インターネットにつながっていません' };
    if (r.reason === 'denied') return { ok: false, msg: 'シークレットコードはまだ準備中です' };
    return { ok: false, msg: '確認できませんでした。時間をおいてもう一度どうぞ' };
  }
  const c = r.data;
  if (c.active === false) return { ok: false, msg: 'このコードは使えません' };
  if (c.from && String(c.from) > today()) return { ok: false, msg: 'このコードはまだ使えません' };
  if (c.until && String(c.until) < today()) return { ok: false, msg: 'このコードは期限が切れています' };
  const reward = cleanReward(c.reward || {});
  if (!Object.keys(reward).length) return { ok: false, msg: 'このコードは使えません' };
  grant(reward);
  d.usedCodes.push(code);
  commit();
  const title = String(c.title || 'シークレットコード').replace(/[<>"'`&\u0000-\u001f]/g, '').slice(0, 40);
  return { ok: true, title, reward };
}

// ===================== 運営からの個別プレゼント（ユーザーID宛て） =====================
// 運営が Firestore の grants/{ユーザーID} に { items:[{ id, title, reward }] } を置くと、その人のプレゼントボックスに届く
let grantsBusy = false;
export async function syncGrants() {
  const d = data();
  if (grantsBusy || !d.playerId) return 0;
  grantsBusy = true;
  try {
    const r = await getDoc('grants/' + d.playerId);
    if (!r.ok) return 0;
    let added = 0;
    for (const g of (Array.isArray(r.data.items) ? r.data.items : []).slice(0, 200)) {
      const id = 'grant:' + String(g?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
      if (id === 'grant:' || d.receivedGifts.includes(id)) continue;
      const title = String(g.title || '運営からのプレゼント').replace(/[<>"'`&\u0000-\u001f]/g, '').slice(0, 40);
      addPresent(title, g.reward || {}, 'gift');
      d.receivedGifts.push(id);
      added++;
    }
    if (added) commit();
    return added;
  } finally { grantsBusy = false; }
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
  // 連続ログイン：前回が「昨日」なら続き、それ以外は1日目から
  const y = new Date(); y.setDate(y.getDate() - 1);
  d.login.streak = d.login.lastDay === dayKey(y) ? (d.login.streak || 0) + 1 : 1;
  d.login.best = Math.max(d.login.best || 0, d.login.streak);
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
    { id: 'd_clear', name: 'ステージを1回クリアする', ev: 'clear', goal: 1, reward: { gold: 800 } },
    { id: 'd_boss', name: 'ボスを1体倒す', ev: 'boss', goal: 1, reward: { gold: 800 } },
    { id: 'd_elite', name: 'エリートを2体倒す', ev: 'elite', goal: 2, reward: { gold: 600 } },
    { id: 'd_coin', name: '戦闘でコインを5,000枚かせぐ', ev: 'coinEarn', goal: 5000, reward: { eticket: 1 } },
    { id: 'd_skill', name: 'スキルを15回選ぶ', ev: 'skill', goal: 15, reward: { gold: 500 } },
    { id: 'd_super', name: 'スーパーモードを1回使う', ev: 'super', goal: 1, reward: { cticket: 1 } },
    { id: 'd_lv10', name: '1回のプレイでLv10になる', ev: 'lv10', goal: 1, reward: { gold: 1000 } },
    { id: 'd_time', name: '合計5分間たたかう', ev: 'battleSec', goal: 300, unit: 'min', reward: { gold: 800 } },
    { id: 'd_all', name: 'デイリーミッションを5つ達成', ev: '_dailyAll', goal: 5, reward: { cticket: 1 } },
    { id: 'd_all10', name: 'デイリーミッションを10個達成', ev: '_dailyAll', goal: 10, reward: { cticket: 2, eticket: 2 } },
  ],
  weekly: [
    { id: 'w_login', name: '5日ログインする', ev: 'login', goal: 5, reward: { cticket: 2 } },
    { id: 'w_play', name: 'ステージを15回プレイする', ev: 'play', goal: 15, reward: { eticket: 3 } },
    { id: 'w_boss', name: 'ボスを5体倒す', ev: 'boss', goal: 5, reward: { cticket: 2 } },
    { id: 'w_kill', name: '敵を2000体倒す', ev: 'kill', goal: 2000, reward: { gold: 5000 } },
    { id: 'w_gacha', name: 'ガチャを10回引く', ev: 'gacha', goal: 10, reward: { gold: 3000 } },
    { id: 'w_up', name: '強化を10回する', ev: 'upgrade', goal: 10, reward: { gold: 3000 } },
    { id: 'w_clear', name: 'ステージを10回クリアする', ev: 'clear', goal: 10, reward: { cticket: 3 } },
    { id: 'w_elite', name: 'エリートを15体倒す', ev: 'elite', goal: 15, reward: { eticket: 3 } },
    { id: 'w_coin', name: '戦闘でコインを60,000枚かせぐ', ev: 'coinEarn', goal: 60000, reward: { gold: 10000 } },
    { id: 'w_skill', name: 'スキルを150回選ぶ', ev: 'skill', goal: 150, reward: { gold: 5000 } },
    { id: 'w_super', name: 'スーパーモードを5回使う', ev: 'super', goal: 5, reward: { cticket: 2, eticket: 2 } },
    { id: 'w_merge', name: '装備を3回合成する', ev: 'merge', goal: 3, reward: { eticket: 3 } },
    { id: 'w_lv20', name: '1回のプレイでLv20になる', ev: 'lv20', goal: 1, reward: { cticket: 2 } },
    { id: 'w_time', name: '合計60分間たたかう', ev: 'battleSec', goal: 3600, unit: 'min', reward: { cticket: 2, gold: 5000 } },
  ],
  // 常時（一度だけ）：stat は累計の値
  perm: [
    { id: 'p_google', name: 'Google連携をしよう', stat: 'google', goal: 1, reward: { cticket: 3, eticket: 3, gold: 3000 } },
    ...[1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 50, 80, 100].map((n) => ({ id: `p_stage${n}`, name: `ステージを ${n} 個クリア`, stat: 'maxStage', goal: n, reward: n >= 50 ? { cticket: 10, eticket: 10, gold: 30000 } : n >= 10 ? { cticket: 3, eticket: 3 } : n >= 3 ? { cticket: 1, eticket: 1, gold: 1000 } : { gold: 1000 } })),
    ...[1, 3, 6, 12].map((n, i) => ({ id: `p_world${n}`, name: n === 12 ? '全ワールドの〇-10までクリアする' : `ワールドを ${n} つ、〇-10までクリアする`, stat: 'worldsDone', goal: n, reward: [{ cticket: 5, eticket: 5 }, { cticket: 10, eticket: 10 }, { cticket: 20, eticket: 20, gold: 50000 }, { cticket: 50, eticket: 50, gold: 200000 }][i] })),
    ...[300, 1000, 3000, 10000, 30000].map((n, i) => ({ id: `p_kill${n}`, name: `敵を累計 ${n.toLocaleString()} 体倒す`, stat: 'kills', goal: n, reward: i >= 2 ? { eticket: 3 } : { gold: 2000 } })),
    ...[4, 6, 8, 10, 12, 15, 18, 22].map((n) => ({ id: `p_chars${n}`, name: `キャラを ${n} 人そろえる`, stat: 'chars', goal: n, reward: { cticket: 2 } })),
    ...[10, 50, 100, 300].map((n) => ({ id: `p_gacha${n}`, name: `ガチャを累計 ${n} 回引く`, stat: 'gachaTotal', goal: n, reward: n >= 100 ? { cticket: 3, eticket: 3 } : { cticket: 1, eticket: 1 } })),
    // 戦いの記録
    ...[5, 20, 50, 100, 300].map((n, i) => ({ id: `p_boss${n}`, name: `ボスを累計 ${n} 体倒す`, stat: 'bossKills', goal: n, reward: [{ gold: 3000 }, { cticket: 3 }, { cticket: 5, eticket: 5 }, { cticket: 10, eticket: 10 }, { cticket: 30, eticket: 30, gold: 50000 }][i] })),
    ...[10, 50, 200, 500].map((n, i) => ({ id: `p_elite${n}`, name: `エリートを累計 ${n} 体倒す`, stat: 'elites', goal: n, reward: [{ gold: 2000 }, { eticket: 3 }, { eticket: 8, gold: 10000 }, { cticket: 10, eticket: 10 }][i] })),
    ...[10, 50, 100, 300].map((n, i) => ({ id: `p_runs${n}`, name: `ステージを累計 ${n} 回プレイする`, stat: 'runs', goal: n, reward: [{ gold: 2000 }, { cticket: 3, eticket: 3 }, { cticket: 5, eticket: 5 }, { cticket: 15, eticket: 15 }][i] })),
    ...[10, 50, 200].map((n, i) => ({ id: `p_clears${n}`, name: `ステージを累計 ${n} 回クリアする`, stat: 'clears', goal: n, reward: [{ gold: 3000 }, { cticket: 5 }, { cticket: 15, eticket: 15 }][i] })),
    { id: 'p_all120', name: '全120ステージをクリアする', stat: 'maxStage', goal: 120, reward: { cticket: 100, eticket: 100, gold: 300000 } },
    ...[100, 300, 500].map((n, i) => ({ id: `p_bestkill${n}`, name: `1回のプレイで敵を ${n} 体倒す`, stat: 'bestKills', goal: n, reward: [{ gold: 3000 }, { eticket: 5 }, { cticket: 5, eticket: 5 }][i] })),
    ...[15, 25, 35].map((n, i) => ({ id: `p_bestlv${n}`, name: `1回のプレイでLv${n}になる`, stat: 'bestLv', goal: n, reward: [{ gold: 3000 }, { cticket: 3 }, { cticket: 8, eticket: 8 }][i] })),
    ...[100, 1000, 5000].map((n, i) => ({ id: `p_weak${n}`, name: `弱点の属性で ${n.toLocaleString()} 回攻撃する`, stat: 'weakHits', goal: n, reward: [{ gold: 2000 }, { eticket: 5 }, { cticket: 10, eticket: 10 }][i] })),
    ...[10, 50].map((n, i) => ({ id: `p_super${n}`, name: `スーパーモードを累計 ${n} 回使う`, stat: 'supers', goal: n, reward: [{ cticket: 3 }, { cticket: 10, eticket: 10 }][i] })),
    ...[3600, 18000, 36000].map((n, i) => ({ id: `p_time${n}`, name: `合計 ${n / 3600} 時間たたかう`, stat: 'playSec', goal: n, unit: 'min', reward: [{ cticket: 3, gold: 10000 }, { cticket: 10, eticket: 10 }, { cticket: 20, eticket: 20, gold: 50000 }][i] })),
    // コイン・ランク
    ...[100000, 500000, 1000000, 5000000].map((n, i) => ({ id: `p_coin${n}`, name: `戦闘でコインを累計 ${n.toLocaleString()} 枚かせぐ`, stat: 'coinEarned', goal: n, reward: [{ eticket: 3 }, { cticket: 5, eticket: 5 }, { cticket: 10, eticket: 10 }, { cticket: 30, eticket: 30 }][i] })),
    ...[5, 10, 20, 30, 50].map((n, i) => ({ id: `p_rank${n}`, name: `ランク ${n} になる`, stat: 'rank', goal: n, reward: [{ gold: 5000 }, { cticket: 5 }, { cticket: 10, eticket: 10 }, { cticket: 20, eticket: 20 }, { cticket: 50, eticket: 50, gold: 100000 }][i] })),
    ...[75, 100, 150, 200, 250, 300].map((n, i) => ({ id: `p_rank${n}`, name: `ランク ${n} になる`, stat: 'rank', goal: n, reward: [{ cticket: 30, eticket: 30, diamond: 30 }, { cticket: 50, eticket: 50, diamond: 50 }, { cticket: 60, eticket: 60, diamond: 60 }, { cticket: 80, eticket: 80, diamond: 80 }, { cticket: 100, eticket: 100, diamond: 100 }, { cticket: 150, eticket: 150, diamond: 150, gold: 300000 }][i] })),
    ...[1, 3, 5].map((n, i) => ({ id: `p_buychar${n}`, name: n === 1 ? 'ダイヤでキャラを仲間にしよう' : `ダイヤでキャラを ${n} 人仲間にする`, stat: 'charsBought', goal: n, reward: [{ cticket: 5 }, { cticket: 10, eticket: 10 }, { cticket: 20, eticket: 20 }][i] })),
    // 装備・キャラ
    ...[20, 50, 100].map((n, i) => ({ id: `p_items${n}`, name: `装備を ${n} 個持つ`, stat: 'items', goal: n, reward: [{ gold: 3000 }, { eticket: 5 }, { eticket: 10, gold: 20000 }][i] })),
    ...[1, 5, 10].map((n, i) => ({ id: `p_ssr${n}`, name: `SSR装備を ${n} 個持つ`, stat: 'ssr', goal: n, reward: [{ eticket: 3 }, { eticket: 10 }, { eticket: 20, gold: 30000 }][i] })),
    ...[1, 10, 30].map((n, i) => ({ id: `p_merge${n}`, name: `装備を累計 ${n} 回合成する`, stat: 'merges', goal: n, reward: [{ gold: 3000 }, { eticket: 5 }, { eticket: 15 }][i] })),
    ...[1, 3, 5].map((n, i) => ({ id: `p_plus${n}`, name: `装備を ★${n} まで限界突破する`, stat: 'maxPlus', goal: n, reward: [{ gold: 3000 }, { eticket: 5 }, { eticket: 15, gold: 30000 }][i] })),
    ...[1, 3, 5].map((n, i) => ({ id: `p_awaken${n}`, name: `キャラを 覚醒+${n} にする`, stat: 'maxAwaken', goal: n, reward: [{ cticket: 3 }, { cticket: 8 }, { cticket: 20, gold: 30000 }][i] })),
    ...[1, 3].map((n, i) => ({ id: `p_preset${n}`, name: `プリセットを ${n} つ保存する`, stat: 'presets', goal: n, reward: [{ gold: 2000 }, { cticket: 2, eticket: 2 }][i] })),
    // てき図鑑
    ...[10, 30, 60].map((n, i) => ({ id: `p_book${n}`, name: `てき図鑑で ${n} 体の敵に出会う`, stat: 'book', goal: n, reward: [{ gold: 3000 }, { cticket: 5, eticket: 5 }, { cticket: 20, eticket: 20, gold: 50000 }][i] })),
    // 連続ログイン・累計ログイン（豪華報酬）
    { id: 'p_streak7', name: '7日間連続ログインを達成しよう', stat: 'loginBest', goal: 7, reward: { cticket: 100, eticket: 100, gold: 77777 } },
    ...[7, 30, 50, 100, 200, 300].map((n) => ({ id: `p_tlogin${n}`, name: `累計${n}日間ログインを達成しよう`, stat: 'loginTotal', goal: n, reward: { cticket: 100, eticket: 100, gold: 100000 } })),
    // キャラごと：〇〇を Lv〇 まで強化しよう（仲間になっているキャラだけ表示）
    ...Object.values(CHARACTERS).flatMap((c) => [10, 20, 40, 60, 80].map((n, i) => ({
      id: `p_c_${c.id}_${n}`, name: `${c.name}を Lv${n} まで強化しよう`, stat: 'charLv:' + c.id, goal: n,
      reward: [{ gold: 3000 }, { cticket: 1, gold: 3000 }, { cticket: 2 }, { cticket: 3 }, { cticket: 5 }][i],
    }))),
    // 装備の種類ごと：〇〇の装備を Lv〇 まで強化しよう（いちばんレベルの高い装備で判定）
    ...Object.entries(SLOT_TYPE_NAMES).flatMap(([t, nm]) => [5, 10, 20, 30, 40].map((n, i) => ({
      id: `p_e_${t}_${n}`, name: `${nm}の装備を Lv${n} まで強化しよう`, stat: 'equipLv:' + t, goal: n,
      reward: [{ gold: 1500 }, { eticket: 1, gold: 1500 }, { eticket: 2 }, { eticket: 3 }, { eticket: 5 }][i],
    }))),
  ],
};

/** 終わったデイリー／ウィークリーで、達成したのに受け取っていない報酬の合計 */
function forgotten(kind) {
  const m = data().missions;
  const counts = kind === 'daily' ? m.d : m.w, claimed = kind === 'daily' ? m.dc : m.wc;
  const total = {};
  let n = 0;
  for (const def of MISSIONS[kind]) {
    const p = def.ev === '_dailyAll'
      ? MISSIONS.daily.filter((x) => x.ev !== '_dailyAll' && (m.d[x.ev] || 0) >= x.goal).length
      : counts[def.ev] || 0;
    if (p < def.goal || claimed.includes(def.id)) continue;
    n++;
    for (const [k, v] of Object.entries(def.reward)) total[k] = (total[k] || 0) + v;
  }
  return { n, total };
}
const shortDay = (k) => k.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');

/** 日付・週が変わったらリセット。受け取り忘れはプレゼントボックスへ。送った件数を返す */
function resetIfNeeded() {
  const m = data().missions;
  const dk = dayKey(), wk = weekKey();
  let sent = 0;
  if (m.day !== dk) {
    if (m.day) {
      const f = forgotten('daily');
      if (f.n) { addPresent(`受け取り忘れ：デイリーミッション（${shortDay(m.day)}）${f.n}件`, f.total, 'mission'); sent += f.n; }
    }
    m.day = dk; m.d = {}; m.dc = [];
  }
  if (m.week !== wk) {
    if (m.week) {
      const f = forgotten('weekly');
      if (f.n) { addPresent(`受け取り忘れ：ウィークリーミッション（${shortDay(m.week)}〜の週）${f.n}件`, f.total, 'mission'); sent += f.n; }
    }
    m.week = wk; m.w = {}; m.wc = [];
  }
  return sent;
}
/** 起動時・時間経過のチェック用。受け取り忘れを送ったら保存して件数を返す */
export function checkMissionReset() {
  const sent = resetIfNeeded();
  if (sent) commit();
  return sent;
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
  if (stat === 'maxStage') return (d.prog || []).reduce((a, x) => a + (x || 0), 0); // クリアしたステージの数
  if (stat === 'worldsDone') return (d.prog || []).filter((x) => x >= 10).length;
  if (stat === 'kills') return d.stats.kills;
  if (stat === 'chars') return Object.values(d.chars).filter((c) => c.unlocked).length;
  if (stat === 'gachaTotal') return d.stats.gachaTotal || 0;
  if (stat === 'loginTotal') return d.login.total;
  if (stat === 'loginBest') return d.login.best || 0;
  if (stat === 'rank') return d.rank.lv;
  if (stat === 'items') return d.items.length;
  if (stat === 'ssr') return d.items.filter((i) => i.rarity === 'SSR').length;
  if (stat === 'maxPlus') return d.items.reduce((m, i) => Math.max(m, i.plus || 0), 0);
  if (stat === 'maxAwaken') return Object.values(d.chars).reduce((m, c) => Math.max(m, c.awaken || 0), 0);
  if (stat === 'presets') return (d.presets || []).filter(Boolean).length;
  if (stat === 'book') return new Set([...(d.seen?.m || []), ...(d.seen?.b || [])]).size;
  if (d.stats[stat] !== undefined) return d.stats[stat] || 0; // bossKills・elites・runs など
  if (stat === 'google') return d.stats.googleLinked ? 1 : 0;
  if (stat.startsWith('charLv:')) return d.chars[stat.slice(7)]?.level || 0;
  if (stat.startsWith('equipLv:')) {
    const t = stat.slice(8);
    return d.items.reduce((m, it) => (EQUIP[it.base]?.type === t ? Math.max(m, it.level) : m), 0);
  }
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
  // 並び順：受け取れるもの → まだのもの → 受け取り済み（元の順番は保つ）
  const rank = (x) => (x.claimed ? 2 : x.done ? 0 : 1);
  const sorted = (arr) => arr.map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([x]) => x);
  if (kind === 'perm') {
    // 常時は受け取り済みを消し、同じ種類は次の目標だけ見せる。仲間になっていないキャラの分は出さない
    const seen = new Set();
    return sorted(list.filter((x) => {
      if (x.claimed) return false;
      if (x.stat.startsWith('charLv:') && !d.chars[x.stat.slice(7)]?.unlocked) return false;
      if (seen.has(x.stat)) return false;
      seen.add(x.stat);
      return true;
    }));
  }
  return sorted(list);
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

/** 持っていないキャラをダイヤで仲間にする。成功すれば true */
export const charPrice = (id) => CHARACTERS[id]?.unlock?.diamond || CHAR_PRICE[CHARACTERS[id]?.stars] || CHAR_PRICE[5];
/** ダイヤで仲間にできるキャラか（ランク報酬のキャラはできない） */
export const canBuyChar = (id) => !CHARACTERS[id]?.unlock?.rank;
export function buyChar(id) {
  const d = data();
  const cs = d.chars[id];
  if (!cs || cs.unlocked || !canBuyChar(id)) return false;
  const price = charPrice(id);
  if ((d.diamonds || 0) < price) return false;
  d.diamonds -= price;
  cs.unlocked = true;
  d.stats.charsBought = (d.stats.charsBought || 0) + 1;
  commit();
  return true;
}

/** キャラガチャ：結果 [{ id, star, isNew, awaken, diamond }] */
export function pullChars(count, bannerId = 'p1') {
  const d = data();
  const g = GACHAS.char;
  const banner = CHAR_BANNERS.find((b) => b.id === bannerId) || CHAR_BANNERS[0];
  const out = [];
  for (let i = 0; i < count; i++) {
    let star = pickStar(g.rates);
    if (count === 10 && i === 9 && out.every((o) => o.star < 4) && star < 4) star = 4; // 10連は★4以上1体確定
    // ★5：ピックアップのガチャなら半分の確率でピックアップの★5
    const feat = star === 5 ? banner.feature : [];
    const pool = feat.length && Math.random() < PICKUP_SHARE ? feat.map((id) => CHARACTERS[id]) : stdPool(star);
    const c = pool[Math.floor(Math.random() * pool.length)];
    const cs = d.chars[c.id];
    const r = { id: c.id, star, isNew: false, awaken: 0, diamond: 0 };
    if (!cs.unlocked) { cs.unlocked = true; r.isNew = true; }
    else if ((cs.awaken || 0) < AWAKEN_MAX) { cs.awaken = (cs.awaken || 0) + 1; r.awaken = cs.awaken; }
    else { r.diamond = DUPE_DIAMONDS[star] || DUPE_DIAMONDS[3]; d.diamonds = (d.diamonds || 0) + r.diamond; }
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
