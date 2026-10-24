// プロフィール（名前・アイコン・アイコンフレーム）とランク
import { store, commit } from './save.js';
import { CHARACTERS, RANK_MAX as RMAX } from './data.js';
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
  // ランク100から（新しいランク報酬）
  { id: 'platinum', name: 'プラチナ', rank: 100 },
  { id: 'emerald', name: 'エメラルド', rank: 120 },
  { id: 'galaxy', name: 'ギャラクシー', rank: 150 },
  { id: 'ocean', name: 'オーシャン', rank: 175 },
  { id: 'neon', name: 'ネオン', rank: 200 },
  { id: 'crystal', name: 'クリスタル', rank: 225 },
  { id: 'diamond', name: 'ダイヤモンド', rank: 250 },
  { id: 'legend', name: 'レジェンド', rank: 300 },
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
  // ランク100から：各ワールドのボス
  { id: 'boss:kingslime', name: 'キングスライム', type: 'slime', pal: { A: '#6ad85a' }, bg: '#94cf62', crown: true, rank: 110 },
  { id: 'boss:pharaoh', name: 'ファラオゴーレム', type: 'golem', pal: { A: '#e8c070', B: '#a87a48', C: '#4ee0c0', e: '#4ee0c0' }, bg: '#e8a85a', crown: true, rank: 130 },
  { id: 'boss:blizzard', name: 'ブリザードゴースト', type: 'ghost', pal: { A: '#e8f6ff' }, bg: '#6ab8e8', crown: true, rank: 140 },
  { id: 'boss:motherdrone', name: 'マザードローン', type: 'drone', pal: { A: '#c8ccd8', e: '#ff3b5c' }, bg: '#2e3350', crown: true, rank: 160 },
  { id: 'boss:bigmush', name: 'ビッグマッシュ', type: 'mushroom', pal: { A: '#a04ad8', C: '#f0e0ff' }, bg: '#5a8a4a', crown: true, rank: 185 },
  { id: 'boss:kingcrab', name: 'キングクラブ', type: 'crab', pal: { A: '#ff4a3a', e: '#1e1226' }, bg: '#f0d890', crown: true, rank: 210 },
  { id: 'boss:crystalking', name: 'クリスタルキング', type: 'golem', pal: { A: '#7ae0f0', B: '#3a9ab8', C: '#e0ffff', e: '#ff5fd0' }, bg: '#3a3a6a', crown: true, rank: 235 },
  { id: 'boss:skullking', name: 'スカルキング', type: 'skull', pal: { A: '#e8e0d0', e: '#7affb0' }, bg: '#4a3a5a', crown: true, rank: 260 },
  { id: 'boss:stormbat', name: 'ストームバット', type: 'bat', pal: { A: '#3a5ac8', e: '#ffd23a' }, bg: '#9ad0f8', crown: true, rank: 275 },
  { id: 'boss:galaxyeye', name: 'ギャラクシーアイ', type: 'eye', pal: { A: '#c8a8ff', C: '#7dff5a', e: '#1e1226' }, bg: '#1a1440', crown: true, rank: 290 },
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
// 必要経験値：以前（80 + lv×40）より約25%少なく。ランク100からは少しずつ増える
export const rankNeed = (lv) => 60 + lv * 30 + Math.max(0, lv - 99) * 12;
export const RANK_MAX = RMAX;

/** ランク lv に上がったときの報酬（ランク99までは以前と同じ。100からは新しい報酬で、ダイヤも入る） */
export function rankReward(lv) {
  let r;
  if (lv < 100) {
    r = { gold: 300 * lv };
    if (lv % 2 === 0) r.eticket = 1;
    if (lv % 5 === 0) r.cticket = 2;
  } else {
    r = { gold: 30000 + (lv - 100) * 200, diamond: 3 };
    if (lv % 2 === 0) r.eticket = 2;
    if (lv % 5 === 0) { r.cticket = 3; r.diamond = 10; }
    if (lv % 10 === 0) { r.cticket = 5; r.eticket = 5; r.diamond = 20; }
    if (lv % 50 === 0) { r.cticket = 10; r.eticket = 10; r.diamond = 50; }
  }
  const icons = SPECIAL_ICONS.filter((i) => i.rank === lv);
  const frames = FRAMES.filter((f) => f.rank === lv);
  const chars = Object.values(CHARACTERS).filter((c) => c.unlock?.rank === lv).map((c) => c.id);
  return { ...r, icons, frames, chars };
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
    grant({ gold: rw.gold, cticket: rw.cticket || 0, eticket: rw.eticket || 0, diamond: rw.diamond || 0 });
    for (const id of rw.chars) if (d.chars[id]) d.chars[id].unlocked = true; // ランク報酬のキャラ
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
