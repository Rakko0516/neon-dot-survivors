// プロフィール（名前・アイコン・アイコンフレーム）とランク
import { store, commit } from './save.js';
import { CHARACTERS } from './data.js';
import { grant } from './meta.js';

const data = () => store.save.data;

// ===== アイコンフレーム（見た目は css の .fr-<id>） =====
export const FRAMES = [
  { id: 'basic', name: 'ベーシック', rank: 1 },
  { id: 'wood', name: '木の額縁', rank: 1 },
  { id: 'teal', name: 'ターコイズ', rank: 3 },
  { id: 'silver', name: 'シルバー', rank: 5 },
  { id: 'sakura', name: 'さくら', rank: 7 },
  { id: 'ice', name: 'アイス', rank: 9 },
  { id: 'gold', name: 'ゴールド', rank: 11 },
  { id: 'heart', name: 'ハート', rank: 13 },
  { id: 'cyber', name: 'サイバー', rank: 15 },
  { id: 'flame', name: 'フレイム', rank: 18 },
  { id: 'royal', name: 'ロイヤル', rank: 22 },
  { id: 'star', name: 'スター', rank: 26 },
  { id: 'rainbow', name: 'レインボー', rank: 30 },
];

// ===== アイコン：全キャラ（最初から使える）＋ランク報酬の特別アイコン =====
export const SPECIAL_ICONS = [
  { id: 'enemy:slime', name: 'スライム', type: 'slime', pal: { A: '#6ad85a' }, bg: '#7cc35a', rank: 2 },
  { id: 'enemy:mushroom', name: 'キノコ', type: 'mushroom', pal: { A: '#ff5a4a', C: '#ffe9c8' }, bg: '#94cf62', rank: 4 },
  { id: 'enemy:bat', name: 'コウモリ', type: 'bat', pal: { A: '#5a3a8a', e: '#ff3b5c' }, bg: '#4a4262', rank: 6 },
  { id: 'enemy:ghost', name: 'おばけ', type: 'ghost', pal: { A: '#f4faff' }, bg: '#9fd8f6', rank: 8 },
  { id: 'enemy:drone', name: 'ドローン', type: 'drone', pal: { A: '#a9b3cc', e: '#36f2ff' }, bg: '#2e3350', rank: 10 },
  { id: 'enemy:pslime', name: 'むらさきスライム', type: 'slime', pal: { A: '#b07aff' }, bg: '#efa36a', rank: 12 },
  { id: 'enemy:golem', name: 'ゴーレム', type: 'golem', pal: { A: '#d8a868', B: '#a87a48', C: '#4ee0c0', e: '#4ee0c0' }, bg: '#ee8a5a', rank: 16 },
  { id: 'enemy:king', name: 'ボスキング', type: 'golem', pal: { A: '#4a4060', B: '#2a2438', C: '#c4103c', e: '#ff3b5c' }, bg: '#6a2a5a', crown: true, rank: 20 },
  { id: 'enemy:magma', name: 'マグマゴーレム', type: 'golem', pal: { A: '#5a4040', B: '#3a2828', C: '#ff7a2a', e: '#ffd23a' }, bg: '#4e3430', crown: true, rank: 25 },
];

export function allIcons() {
  const chars = Object.values(CHARACTERS).map((c) => ({ id: 'char:' + c.id, name: c.name, char: c.id, bg: c.bg, rank: 1 }));
  return [...chars, ...SPECIAL_ICONS];
}
export function iconDef(id) {
  return allIcons().find((i) => i.id === id) || allIcons()[0];
}
export function frameDef(id) {
  return FRAMES.find((f) => f.id === id) || FRAMES[0];
}
export const isUnlocked = (def) => data().rank.lv >= (def.rank || 1);

// ===== ランク =====
export const rankNeed = (lv) => 80 + lv * 40;
export const RANK_MAX = 99;

/** ランク lv に上がったときの報酬 */
export function rankReward(lv) {
  const r = { gold: 300 * lv };
  if (lv % 2 === 0) r.eticket = 1;
  if (lv % 5 === 0) r.cticket = 2;
  const icons = SPECIAL_ICONS.filter((i) => i.rank === lv);
  const frames = FRAMES.filter((f) => f.rank === lv);
  return { ...r, icons, frames };
}

/** ランク経験値を足す。上がったランクの一覧（報酬つき）を返す */
export function gainRankExp(n) {
  const d = data();
  const ups = [];
  d.rank.exp += Math.max(0, Math.round(n));
  while (d.rank.lv < RANK_MAX && d.rank.exp >= rankNeed(d.rank.lv)) {
    d.rank.exp -= rankNeed(d.rank.lv);
    d.rank.lv++;
    const rw = rankReward(d.rank.lv);
    grant({ gold: rw.gold, cticket: rw.cticket || 0, eticket: rw.eticket || 0 });
    ups.push({ lv: d.rank.lv, ...rw });
  }
  commit();
  return ups;
}

/** 1回のプレイで得るランク経験値 */
export function battleRankExp(res, stageN) {
  return Math.round(res.kills * 0.6 + (res.room - 1) * 12 + (res.cleared ? 50 + stageN * 8 : 0));
}

export function setName(name) {
  const clean = String(name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  if (!clean) return false;
  data().profile.name = clean;
  commit();
  return true;
}
export function setIcon(id) {
  if (!isUnlocked(iconDef(id))) return false;
  data().profile.icon = id;
  commit();
  return true;
}
export function setFrame(id) {
  if (!isUnlocked(frameDef(id))) return false;
  data().profile.frame = id;
  commit();
  return true;
}
