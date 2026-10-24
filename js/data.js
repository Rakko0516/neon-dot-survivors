// ゲームデータ定義（キャラ・スキル・装備・ステージ）
// 新キャラ・新スキル・新装備・新ステージはここに追加するだけで画面に反映されます。

// ===== キャラクター =====
// look: 見た目パーツ（art.js で合成）
// weapon: 固有武器（ステージ開始時に持っている）
// trait: 固有能力（常に効果がある）
export const CHARACTERS = {
  neo: {
    name: 'ネオ', stars: 4, role: 'サイバー捜査官', hp: 100, atk: 10, spd: 62, crit: 0.05,
    weapon: 'plasma', trait: { name: 'ロックオン', desc: '会心率 +10%', crit: 0.1 },
    look: { hairStyle: 'spiky', hair: '#2b3170', eye: '#3fd6ff', top: '#262a40', collar: '#36f2ff', sleeve: '#262a40', belt: '#3a3f5c', bottom: '#2d3150', legs: '#2d3150', shoes: '#15161f', pants: true, acc: ['visor'], acc1: '#36f2ff' },
    unlock: null, bg: '#2a6a8a',
  },
  lulu: {
    name: 'ルル', stars: 4, role: 'バーチャルアイドル', hp: 90, atk: 9, spd: 66, crit: 0.05,
    weapon: 'note', trait: { name: 'ファンサービス', desc: '獲得経験値 +15%', exp: 0.15 },
    look: { hairStyle: 'twin', hair: '#ff8acb', eye: '#4a9dff', top: '#ffffff', collar: '#ff5fa8', sleeve: '#ffd1ea', belt: '#ff5fa8', bottom: '#ff9ccf', legs: '#ffffff', shoes: '#ff5fa8', acc: ['starClip'], acc1: '#ffe14d' },
    unlock: null, bg: '#c85a9a',
  },
  garud: {
    name: 'ガルド', stars: 3, role: '見習い騎士', hp: 140, atk: 11, spd: 56, crit: 0.04,
    weapon: 'axe', trait: { name: '鉄壁', desc: '最大HP +25%', hpPct: 0.25 },
    look: { hairStyle: 'short', hair: '#8a5a34', eye: '#3a6acc', top: '#b9c3d6', collar: '#e0b84a', sleeve: '#8e98b0', belt: '#6a4a2a', bottom: '#4a5a8a', legs: '#8e98b0', shoes: '#5a3a24', pants: true, acc: ['headband'], acc1: '#c4303a' },
    unlock: null, bg: '#7a6a4a',
  },
  zero: {
    name: 'ゼロ', stars: 5, role: '戦闘用アンドロイド', hp: 120, atk: 13, spd: 58, crit: 0.08,
    weapon: 'blade', trait: { name: '装甲フレーム', desc: '受けるダメージ -15%', armor: 0.15 },
    look: { hairStyle: 'bob', hair: '#e6ebf5', eye: '#ff3b5c', top: '#eef1f8', collar: '#ff3b5c', sleeve: '#9aa3bd', belt: '#3a3f5c', bottom: '#c9cfe0', legs: '#6b7390', shoes: '#ff3b5c', acc: ['antenna'], acc1: '#ff3b5c' },
    unlock: { stage: 2 }, bg: '#5a5a7a',
  },
  kon: {
    name: 'コン', stars: 4, role: 'きつね配信者', hp: 95, atk: 9, spd: 64, crit: 0.05,
    weapon: 'foxfire', trait: { name: '狐火の加護', desc: '攻撃範囲 +15%', area: 0.15 },
    look: { hairStyle: 'long', hair: '#ff9a3c', eye: '#3be38a', top: '#ffffff', collar: '#8a4dff', sleeve: '#ffffff', belt: '#ff4f6d', bottom: '#8a4dff', legs: '#ffffff', shoes: '#5a2bc0', acc: ['foxEars'], acc1: '#ffe8b0' },
    unlock: { stage: 3 }, bg: '#c8783a',
  },
  mint: {
    name: 'ミント', stars: 4, role: '雪の魔女', hp: 90, atk: 11, spd: 60, crit: 0.05,
    weapon: 'ice', trait: { name: '凍える風', desc: '敵の移動速度 -12%', slow: 0.12 },
    look: { hairStyle: 'long', hair: '#7fe0c8', eye: '#6a5cff', top: '#3a5fc8', collar: '#ffffff', sleeve: '#3a5fc8', belt: '#ffd23a', bottom: '#2d3f9a', legs: '#22264a', shoes: '#5a3a2a', acc: ['witchHat'], acc1: '#3a3fa8', acc2: '#ffd23a' },
    unlock: { stage: 4 }, bg: '#4a7ac8',
  },
  noir: {
    name: 'ノワ', stars: 5, role: '吸血鬼のお嬢様', hp: 105, atk: 12, spd: 62, crit: 0.07,
    weapon: 'scythe', trait: { name: '吸血', desc: '敵を倒すとHP回復', lifesteal: 1 },
    look: { hairStyle: 'long', hair: '#2e2440', eye: '#ff3b5c', skin: '#f6e6ea', top: '#2a2238', collar: '#c4103c', sleeve: '#2a2238', belt: '#c4103c', bottom: '#3a1e52', legs: '#1a1424', shoes: '#c4103c', acc: ['horns', 'wings'], acc1: '#7a1838', acc2: '#3a1e52' },
    unlock: { stage: 6 }, bg: '#6a2a5a',
  },
  sora: {
    name: 'ソラ', stars: 3, role: '森の狩人', hp: 95, atk: 10, spd: 70, crit: 0.06,
    weapon: 'arrow', trait: { name: '俊足', desc: '移動速度 +15%', spdPct: 0.15 },
    look: { hairStyle: 'pony', hair: '#4ab84a', eye: '#c88a3a', top: '#3f8a3a', collar: '#e8d8a0', sleeve: '#3f8a3a', belt: '#8a5a34', bottom: '#6a4a2a', legs: '#e8d8a0', shoes: '#6a4a2a', pants: true, acc: ['cap'], acc1: '#2f6a2a', acc2: '#ffd23a', acc1b: '' },
    unlock: { stage: 5 }, bg: '#4a8a4a',
  },
};
// ===== ガチャ限定キャラ（gacha: true） =====
Object.assign(CHARACTERS, {
  sera: {
    name: 'セラ', stars: 5, role: '光の天使', hp: 115, atk: 13, spd: 62, crit: 0.06, gacha: true,
    weapon: 'holy', trait: { name: '祝福', desc: '毎秒HPが自然回復する', regen: 2 },
    look: { hairStyle: 'long', hair: '#ffe39a', eye: '#4ac8ff', top: '#ffffff', collar: '#ffd23a', sleeve: '#ffffff', belt: '#ffd23a', bottom: '#e8f0ff', legs: '#ffffff', shoes: '#e0b030', acc: ['halo', 'wings'], acc1: '#ffe14d', acc2: '#ffffff' },
    unlock: { gacha: true }, bg: '#c8a84a',
  },
  kagura: {
    name: 'カグラ', stars: 5, role: '神楽の巫女', hp: 105, atk: 14, spd: 63, crit: 0.07, gacha: true,
    weapon: 'talisman', trait: { name: '神楽舞', desc: '攻撃速度 +12%', cd: 0.12 },
    look: { hairStyle: 'long', hair: '#22202e', eye: '#c4103c', top: '#ffffff', collar: '#e03040', sleeve: '#ffffff', belt: '#e03040', bottom: '#d8203a', legs: '#ffffff', shoes: '#5a3a24', acc: ['bigRibbon'], acc1: '#e03040' },
    unlock: { gacha: true }, bg: '#b04050',
  },
  volt: {
    name: 'ヴォルト', stars: 5, role: '雷の騎士', hp: 125, atk: 14, spd: 64, crit: 0.06, gacha: true,
    weapon: 'thunder', trait: { name: '雷速', desc: '会心率 +8%・移動速度 +8%', crit: 0.08, spdPct: 0.08 },
    look: { hairStyle: 'spiky', hair: '#ffd23a', eye: '#3a6acc', top: '#3a4a8a', collar: '#ffd23a', sleeve: '#2a3060', belt: '#ffd23a', bottom: '#2a3060', legs: '#2a3060', shoes: '#ffd23a', pants: true, acc: ['headband'], acc1: '#36f2ff' },
    unlock: { gacha: true }, bg: '#3a4a8a',
  },
  mimi: {
    name: 'ミミ', stars: 4, role: 'ねこハッカー', hp: 95, atk: 11, spd: 66, crit: 0.06, gacha: true,
    weapon: 'yarn', trait: { name: 'ハッキング', desc: '敵の移動速度 -8%・経験値 +5%', slow: 0.08, exp: 0.05 },
    look: { hairStyle: 'bob', hair: '#b8a0ff', eye: '#ffd23a', top: '#2e2e40', collar: '#ff6ab8', sleeve: '#2e2e40', belt: '#ff6ab8', bottom: '#3a3a5a', legs: '#2e2e40', shoes: '#ff6ab8', pants: true, acc: ['catEars', 'headphones'], acc1: '#ff9ad0', acc2: '#36f2ff' },
    unlock: { gacha: true }, bg: '#6a5aa8',
  },
});
for (const [id, c] of Object.entries(CHARACTERS)) c.id = id;
export const AWAKEN_MAX = 5; // 覚醒（ガチャで同じキャラが出たとき）の上限。それより後に被ったらダイヤ
/** 覚醒+5のキャラがまた出たときにもらえるダイヤ（★の数で変わる） */
export const DUPE_DIAMONDS = { 3: 30, 4: 60, 5: 120 };
/** 持っていないキャラをダイヤで仲間にする値段（★の数で変わる） */
export const CHAR_PRICE = { 3: 200, 4: 400, 5: 700 };
/** ランクの上限 */
export const RANK_MAX = 300;

// ===== スキル（ステージ中のレベルアップで選ぶ） =====
// kind: w=武器 / p=強化 / s=特殊（その場で発動、重複可）
export const SKILLS = {
  // 固有武器
  plasma: { kind: 'w', sig: 'neo', name: 'プラズマガン', icon: 'orb', color: '#36f2ff', desc: '近くの敵を自動で撃ち抜く' },
  note: { kind: 'w', sig: 'lulu', name: 'ハートビーム', icon: 'note', color: '#ff7ac8', desc: '貫通するハート弾を扇状に放つ' },
  axe: { kind: 'w', sig: 'garud', name: 'ブーメランアックス', icon: 'axe', color: '#c8ccd8', desc: '斧を投げて手元に戻す。何体でも貫通' },
  blade: { kind: 'w', sig: 'zero', name: 'レーザーブレード', icon: 'sword', color: '#ff5c7a', desc: '前方を大きく斬り払う' },
  foxfire: { kind: 'w', sig: 'kon', name: '狐火', icon: 'fire', color: '#ff9a3c', desc: '周囲を回る炎が敵を焼く' },
  ice: { kind: 'w', sig: 'mint', name: 'アイスシャード', icon: 'snow', color: '#9fe6ff', desc: '氷のつぶてで敵を遅くする' },
  scythe: { kind: 'w', sig: 'noir', name: 'ブラッドサイス', icon: 'scythe', color: '#c4103c', desc: '周囲をまとめて刈り取る' },
  arrow: { kind: 'w', sig: 'sora', name: '疾風の矢', icon: 'arrow', color: '#7ad85a', desc: '進む方向へ貫通する矢を放つ' },
  holy: { kind: 'w', sig: 'sera', name: 'ホーリーピラー', icon: 'star', color: '#ffe14d', desc: '敵の足元に光の柱を落とす' },
  talisman: { kind: 'w', sig: 'kagura', name: '追尾のお札', icon: 'scroll', color: '#fff4d8', desc: '敵を追いかけるお札を放つ' },
  thunder: { kind: 'w', sig: 'volt', name: 'サンダーフォール', icon: 'bolt', color: '#ffd23a', desc: '空から雷を落とし周りを巻き込む' },
  yarn: { kind: 'w', sig: 'mimi', name: '毛糸ボール', icon: 'orb', color: '#ff8ad0', desc: '壁で跳ね返る毛糸玉を投げる' },
  // 共通武器
  drone: { kind: 'w', name: 'サポートドローン', icon: 'drone', color: '#a9b3cc', desc: 'ドローンが一緒に戦う' },
  missile: { kind: 'w', name: 'ホーミング弾', icon: 'rocket', color: '#ffd23a', desc: '敵を追いかけて爆発する' },
  chain: { kind: 'w', name: '電撃チェーン', icon: 'bolt', color: '#e8ff4a', desc: '雷が敵から敵へ連鎖する' },
  bomb: { kind: 'w', name: 'ばくだん設置', icon: 'bomb', color: '#5a5a7a', desc: '近くに時限爆弾を置く' },
  field: { kind: 'w', name: 'バリアフィールド', icon: 'shield', color: '#5aa8ff', desc: '周りの敵に継続ダメージ' },
  // 強化
  atkUp: { kind: 'p', name: '攻撃力アップ', icon: 'sword', color: '#ff5c5c', max: 5, desc: '攻撃力を上昇させる（+12%）' },
  cdUp: { kind: 'p', name: '攻撃速度アップ', icon: 'clock', color: '#ffd23a', max: 5, desc: '攻撃の間隔が短くなる（+9%）' },
  spdUp: { kind: 'p', name: '移動速度アップ', icon: 'boot', color: '#4dd88a', max: 5, desc: '移動が速くなる（+8%）' },
  hpUp: { kind: 'p', name: '最大HPアップ', icon: 'heart', color: '#ff4f6d', max: 5, desc: '最大HPが上がり回復する（+15%）' },
  crit: { kind: 'p', name: '会心率アップ', icon: 'star', color: '#ffb03a', max: 5, desc: '会心の一撃が出やすくなる（+6%）' },
  multi: { kind: 'p', name: 'マルチショット', icon: 'multi', color: '#d65cff', max: 3, desc: '弾の数・設置数が増える（+1）' },
  area: { kind: 'p', name: '攻撃範囲アップ', icon: 'area', color: '#5aa8ff', max: 5, desc: '攻撃の範囲が広がる（+12%）' },
  regen: { kind: 'p', name: '自然回復', icon: 'plus', color: '#6ae86a', max: 5, desc: '毎秒HPが少しずつ回復する' },
  armor: { kind: 'p', name: '防御力アップ', icon: 'shield', color: '#9aa3bd', max: 5, desc: '受けるダメージが減る（-8%）' },
  expUp: { kind: 'p', name: '学習ブースト', icon: 'book', color: '#4ac8ff', max: 5, desc: '獲得経験値が増える（+12%）' },
  // 特殊（虹枠・たまに出る）
  super: { kind: 's', name: 'スーパーモードっ！', icon: 'star', color: '#ffd23a', desc: '10秒間無敵になり、攻撃速度が爆速になる' },
  heal: { kind: 's', name: '全回復', icon: 'heart', color: '#ff7a9a', desc: 'HPを全回復する' },
  nuke: { kind: 's', name: 'メテオストライク', icon: 'skull', color: '#ff6a1a', desc: '画面内の敵に大ダメージ' },
};
export const WEAPON_MAX = 5;
export const MAX_ACTIVES = 4;
export const MAX_PASSIVES = 5;

// ===== 装備 =====
export const RARITIES = {
  N: { name: 'N', mult: 1, color: '#9aa3b8', dark: '#4a5068', rate: 58, maxLv: 10 },
  R: { name: 'R', mult: 1.6, color: '#4aa8ff', dark: '#1d4f98', rate: 30, maxLv: 20 },
  SR: { name: 'SR', mult: 2.5, color: '#c45cff', dark: '#5a2098', rate: 10, maxLv: 30 },
  SSR: { name: 'SSR', mult: 4, color: '#ffcc33', dark: '#a06a10', rate: 2, maxLv: 40 },
};
export const RARITY_ORDER = ['N', 'R', 'SR', 'SSR'];

// 全身8枠
export const SLOTS = [
  { id: 'weapon', name: '武器', type: 'weapon', side: 'L' },
  { id: 'head', name: '頭', type: 'head', side: 'L' },
  { id: 'body', name: '体', type: 'body', side: 'L' },
  { id: 'arms', name: '腕', type: 'arms', side: 'L' },
  { id: 'feet', name: '足', type: 'feet', side: 'R' },
  { id: 'neck', name: '首飾り', type: 'neck', side: 'R' },
  { id: 'ring1', name: '指輪1', type: 'ring', side: 'R' },
  { id: 'ring2', name: '指輪2', type: 'ring', side: 'R' },
];
export const SLOT_TYPE_NAMES = { weapon: '武器', head: '頭', body: '体', arms: '腕', feet: '足', neck: '首飾り', ring: '指輪' };

// main は装備レベルで伸びる、sub はレア度でのみ伸びる
export const EQUIP = {
  w_sword: { type: 'weapon', name: '鋼の剣', icon: 'sword', color: '#d8dce8', main: { atk: 5 }, sub: { crit: 0.02 } },
  w_staff: { type: 'weapon', name: '星の杖', icon: 'staff', color: '#ffd23a', main: { atk: 4 }, sub: { cd: 0.04 } },
  w_gun: { type: 'weapon', name: 'プラズマ銃', icon: 'gun', color: '#6ad8ff', main: { atk: 6 }, sub: {} },
  w_bow: { type: 'weapon', name: '疾風の弓', icon: 'bow', color: '#c88a4a', main: { atk: 4 }, sub: { spd: 0.04 } },
  h_helm: { type: 'head', name: '鉄のかぶと', icon: 'helmet', color: '#b9c3d6', main: { hp: 18 }, sub: { def: 2 } },
  h_hat: { type: 'head', name: '魔法使いの帽子', icon: 'hat', color: '#7a5ad8', main: { hp: 12 }, sub: { exp: 0.04 } },
  b_armor: { type: 'body', name: 'プレートアーマー', icon: 'armor', color: '#b9c3d6', main: { hp: 30 }, sub: { def: 3 } },
  b_robe: { type: 'body', name: '星くずのローブ', icon: 'robe', color: '#5a7ad8', main: { hp: 22 }, sub: { cd: 0.03 } },
  a_glove: { type: 'arms', name: 'ガントレット', icon: 'glove', color: '#c8a46a', main: { atk: 3 }, sub: { def: 1 } },
  f_boots: { type: 'feet', name: '疾風ブーツ', icon: 'boot', color: '#8a5a34', main: { hp: 12 }, sub: { spd: 0.05 } },
  n_pendant: { type: 'neck', name: '太陽のペンダント', icon: 'pendant', color: '#ff8a3a', main: { crit: 0.02 }, sub: { atk: 2 } },
  r_ruby: { type: 'ring', name: 'ルビーの指輪', icon: 'ring', color: '#ff3b5c', main: { atk: 3 }, sub: {} },
  r_sapphire: { type: 'ring', name: 'サファイアの指輪', icon: 'ring', color: '#3f7cff', main: { hp: 16 }, sub: {} },
  r_emerald: { type: 'ring', name: 'エメラルドの指輪', icon: 'ring', color: '#3fd87a', main: { exp: 0.04 }, sub: { crit: 0.01 } },
};

export const STAT_NAMES = { hp: 'HP', atk: 'ATK', def: '防御', spd: '移動速度', crit: '会心率', cd: '攻撃速度', exp: '経験値', magnet: '吸引範囲' };
export const PERCENT_STATS = new Set(['spd', 'crit', 'cd', 'exp', 'magnet']);
export function formatStat(key, v) {
  if (PERCENT_STATS.has(key)) return `${STAT_NAMES[key]} +${(v * 100).toFixed(1).replace(/\.0$/, '')}%`;
  return `${STAT_NAMES[key]} +${Math.round(v)}`;
}

export function itemStats(item) {
  const base = EQUIP[item.base];
  const r = RARITIES[item.rarity];
  const out = {};
  for (const [k, v] of Object.entries(base.main)) out[k] = (out[k] || 0) + v * r.mult * (1 + 0.12 * (item.level - 1));
  for (const [k, v] of Object.entries(base.sub)) out[k] = (out[k] || 0) + v * r.mult;
  return out;
}
// 合成（限界突破）：同じ装備（同じ種類・同じレア度）を1つ使うと、レベル上限が +5（最大 ★5）
export const MERGE_MAX = 5;
export const MERGE_LV = 5;
export const itemMaxLv = (item) => RARITIES[item.rarity].maxLv + (item.plus || 0) * MERGE_LV;
export const upgradeCost = (item) => Math.round(40 * item.level * RARITIES[item.rarity].mult);
export const salvageValue = (item) => Math.round(30 * RARITIES[item.rarity].mult * (1 + (item.level - 1) * 0.5));
export const charUpgradeCost = (lv) => Math.round(80 * lv + 10 * lv * lv);
export const CHAR_MAX_LV = 80;

/** 出撃時ステータス（キャラLv + 装備 + 固有能力） */
export function charStats(data, charId) {
  const c = CHARACTERS[charId];
  const cs = data.chars[charId];
  const lvMul = (1 + 0.08 * (cs.level - 1)) * (1 + 0.08 * (cs.awaken || 0));
  const t = c.trait;
  const st = { hp: c.hp * lvMul, atk: c.atk * lvMul, def: 0, spd: t.spdPct || 0, crit: c.crit + (t.crit || 0), cd: t.cd || 0, exp: t.exp || 0, magnet: 0, area: t.area || 0, armor: t.armor || 0, slow: t.slow || 0, lifesteal: t.lifesteal || 0, regen: t.regen || 0 };
  // 装備は全キャラ共通（キャラを変えても装備はそのまま）
  const eq = data.equip || {};
  for (const slot of SLOTS) {
    const uid = eq[slot.id];
    if (uid == null) continue;
    const item = data.items.find((i) => i.uid === uid);
    if (!item) continue;
    for (const [k, v] of Object.entries(itemStats(item))) st[k] += v;
  }
  st.hp = Math.round(st.hp * (1 + (t.hpPct || 0)));
  st.atk = Math.round(st.atk);
  st.moveSpeed = c.spd * (1 + st.spd);
  return st;
}
export function power(st) {
  return Math.round(st.hp + st.atk * 12 + st.def * 8 + st.crit * 300 + st.cd * 400 + st.spd * 200);
}

// ===== ステージ（バイオーム） =====
// floor/floorAlt: [地面, 濃い粒, 明るい粒]  pool: 水たまりの種類
// mobs: 出てくるモブ（enemies.js の MOBS）  elite: 3部屋目のエリート  boss: ボス（BOSSES）
// bgm: 戦闘BGM（audio/sources.json の battle_<id>）が無いときに代わりに流す曲
// deco / decoPal / leaf / crack: 見た目の追加設定（無ければ style のもの）
// 並び順＝ステージ番号の順（STAGE 1 が草原、STAGE 12 が魔王城。13からは★付きで2周目）
export const BIOMES = [
  {
    id: 'grass', name: '草原', style: 'grass',
    floor: ['#7cc35a', '#6ab04c', '#8fd46a'], floorAlt: ['#94cf62', '#82bf55', '#a8de78'],
    rock: '#9a9aa4', spike: '#d8dce8', side: '#4f9a3f', patch: '#5aa84a',
    pool: { kind: 'water', color: '#4ab4ec', rim: '#2a78b8', effect: 'slow' },
    mobs: ['g_slime', 'g_mush', 'g_bat'], elite: 'g_golem', boss: 'kingslime',
  },
  {
    id: 'forest', name: '森', style: 'grass', leaf: ['#2a6a2a', '#357a30'], bgm: 'battle_grass',
    floor: ['#4a8a3a', '#3e7a32', '#5a9a48'], floorAlt: ['#56963f', '#4a8638', '#66a852'],
    rock: '#7a7a6a', spike: '#c8c8b8', side: '#2e5a24', patch: '#3a6a2e',
    pool: { kind: 'water', color: '#5a8a3a', rim: '#3a5a24', effect: 'slow' },
    mobs: ['f_slime', 'f_mush', 'f_bee'], elite: 'f_golem', boss: 'bigmush',
  },
  {
    id: 'desert', name: '砂漠', style: 'desert',
    floor: ['#efa36a', '#e8955a', '#f6b47c'], floorAlt: ['#ee8a5a', '#e47a4c', '#f49a6a'],
    rock: '#9a8a80', spike: '#e0dce0', side: '#e0703a', patch: '#e66a48',
    pool: { kind: 'oasis', color: '#4ee0c0', rim: '#2aa08a', effect: 'slow' },
    mobs: ['d_slime', 'd_mush', 'd_bat'], elite: 'd_golem', boss: 'pharaoh',
  },
  {
    id: 'beach', name: '海辺', style: 'desert', deco: 'palm', bgm: 'battle_desert',
    floor: ['#f4dca0', '#e8cc8a', '#fff0c0'], floorAlt: ['#f0d494', '#e4c480', '#fae6b0'],
    rock: '#a09a90', spike: '#e8e4e0', side: '#3aa8e0', patch: '#4ab8ec',
    pool: { kind: 'water', color: '#4ab4ec', rim: '#2a78b8', effect: 'slow' },
    mobs: ['b_crab', 'b_jelly', 'b_slime'], elite: 'b_golem', boss: 'kingcrab',
  },
  {
    id: 'snow', name: '雪国', style: 'snow',
    floor: ['#e6f0fa', '#d4e2f2', '#ffffff'], floorAlt: ['#d2e4f6', '#c0d6ee', '#e6f0fa'],
    rock: '#8aa0c0', spike: '#c8e8ff', side: '#c0d6ee', patch: '#c8dcf0',
    pool: { kind: 'ice', color: '#9fd8f6', rim: '#5a9ad0', effect: 'slow' },
    mobs: ['s_slime', 's_ghost', 's_bat'], elite: 's_golem', boss: 'blizzard',
  },
  {
    id: 'cave', name: '水晶の洞窟', style: 'volcano', deco: 'crystal', crack: ['#7ae0f0', '#c47aff'], bgm: 'battle_volcano',
    floor: ['#3a3448', '#2e2a3c', '#4a4458'], floorAlt: ['#403a50', '#342e44', '#504a60'],
    rock: '#5a5470', spike: '#c8c0e0', side: '#1e1a28', patch: '#2a2438',
    pool: { kind: 'water', color: '#3a7ac8', rim: '#1e4a8a', effect: 'slow' },
    mobs: ['u_eye', 'u_bat', 'u_rock'], elite: 'u_golem', boss: 'crystalking',
  },
  {
    id: 'cyber', name: 'サイバーシティ', style: 'cyber',
    floor: ['#2e3350', '#3a405e', '#36f2ff'], floorAlt: ['#342c4e', '#40365c', '#ff5fd0'],
    rock: '#5a6080', spike: '#c8ccd8', side: '#1a1c2e', patch: '#2a2a48',
    pool: { kind: 'acid', color: '#7dff5a', rim: '#3aa02a', effect: 'hurt' },
    mobs: ['c_drone', 'c_ghost', 'c_slime'], elite: 'c_golem', boss: 'motherdrone',
  },
  {
    id: 'volcano', name: '火山', style: 'volcano',
    floor: ['#4e3430', '#3e2624', '#5e403a'], floorAlt: ['#5a3a30', '#4a2c26', '#6a483e'],
    rock: '#5a4a4a', spike: '#c8b8b0', side: '#2a1a18', patch: '#3a2420',
    pool: { kind: 'lava', color: '#ff6a1a', rim: '#c8300a', effect: 'hurt' },
    mobs: ['v_slime', 'v_bat', 'v_wisp'], elite: 'v_golem', boss: 'magmagolem',
  },
  {
    id: 'grave', name: '墓地', style: 'grass', deco: 'tomb', leaf: ['#3a4a30', '#46563a'], bgm: 'battle_castle',
    floor: ['#5a6a4a', '#4e5e40', '#6a7a58'], floorAlt: ['#56664a', '#4a5a3e', '#667656'],
    rock: '#7a7a80', spike: '#c8c8d0', side: '#2a3020', patch: '#3a4430',
    pool: { kind: 'poison', color: '#7a5ab8', rim: '#4a2a7a', effect: 'hurt' },
    mobs: ['h_skull', 'h_wisp', 'h_ghost'], elite: 'h_golem', boss: 'skullking',
  },
  {
    id: 'sky', name: '天空', style: 'snow', deco: 'cloud', bgm: 'battle_snow',
    floor: ['#e8f2ff', '#d4e4fa', '#ffffff'], floorAlt: ['#dceaff', '#c8dcf6', '#f0f6ff'],
    rock: '#b8c4e0', spike: '#ffe98a', side: '#7ab8ff', patch: '#8ac4ff',
    pool: { kind: 'poison', color: '#8a8ab8', rim: '#5a5a8a', effect: 'hurt' },
    mobs: ['y_slime', 'y_eye', 'y_bat'], elite: 'y_golem', boss: 'stormbat',
  },
  {
    id: 'space', name: '宇宙ステーション', style: 'cyber', bgm: 'battle_cyber',
    floor: ['#1e1a38', '#2a2448', '#c47aff'], floorAlt: ['#241e40', '#302852', '#7dff5a'],
    rock: '#4a4870', spike: '#c8c8e0', side: '#0a0818', patch: '#141028',
    pool: { kind: 'acid', color: '#c47aff', rim: '#6a2aa0', effect: 'hurt' },
    mobs: ['z_ufo', 'z_eye', 'z_slime'], elite: 'z_golem', boss: 'galaxyeye',
  },
  {
    id: 'castle', name: '魔王城', style: 'castle',
    floor: ['#4a4262', '#564e72', '#7a5ad8'], floorAlt: ['#423a58', '#4e4668', '#c4103c'],
    rock: '#6a6080', spike: '#c8c0d8', side: '#2a2438', patch: '#3a3250',
    pool: { kind: 'poison', color: '#a05ae8', rim: '#5a2aa0', effect: 'hurt' },
    mobs: ['k_ghost', 'k_bat', 'k_skull'], elite: 'k_golem', boss: 'darklord',
  },
];

export const ROOMS_PER_STAGE = 5;

// ===== ステージ：12ワールド × 10ステージ（1-1 〜 12-10） =====
// ステージは通し番号 s（1〜120）で扱う。s = (ワールド-1)×10 + 番号
export const LEVELS_PER_WORLD = 10;
export const STAGE_COUNT = 12 * LEVELS_PER_WORLD;
// 〇-1 〜 〇-10 の地形の種類（stage.js の STRUCTURES と同じ順番）
export const STRUCT_NAMES = ['広場', '岩の迷路', 'トゲの道', '水路', '柱の間', '一本道', 'ジグザグ', '中央の島', '混合', '決戦'];
export const stageNo = (w, L) => (w - 1) * LEVELS_PER_WORLD + L;
export function stageInfo(s) {
  s = Math.max(1, Math.min(STAGE_COUNT, Math.round(s) || 1));
  const w = Math.ceil(s / LEVELS_PER_WORLD), L = (s - 1) % LEVELS_PER_WORLD + 1;
  const biome = BIOMES[w - 1];
  // 難しさ：ワールドが進むと大きく、同じワールドの中では少しずつ上がる（〇-1 は以前の「STAGE 〇」と同じ強さ）
  const D = w + (L - 1) * 0.15;
  return {
    id: s, w, L, n: Math.round(D), D, biome, loop: 0,
    name: `STAGE ${w}-${L}`,
    sub: `${biome.name}・${STRUCT_NAMES[L - 1]}`,
    hpMul: 1 + (D - 1) * 0.6 + Math.max(0, D - 8) * 0.35,
    dmgMul: 1 + (D - 1) * 0.2,
    recommended: Math.round(260 + (D - 1) * 150 + (D - 1) * (D - 1) * 14),
  };
}
/** 進み具合：prog[ワールド-1] ＝ そのワールドで何番までクリアしたか（0〜10） */
const progOf = (d) => d.prog || [];
export const worldCleared = (d, w) => progOf(d)[w - 1] || 0;
/** ワールドが遊べるか：1は最初から。前のワールドの10をクリアすると開放（以前のデータで 〇-1 をクリア済みのワールドも開放） */
export const worldOpen = (d, w) => w === 1 || worldCleared(d, w - 1) >= LEVELS_PER_WORLD || worldCleared(d, w) >= 1;
export function stageOpen(d, s) {
  const { w, L } = stageInfo(s);
  return worldOpen(d, w) && L <= worldCleared(d, w) + 1;
}
export const stageCleared = (d, s) => { const { w, L } = stageInfo(s); return L <= worldCleared(d, w); };
/** クリアしたステージの数 */
export const clearedCount = (d) => progOf(d).reduce((a, n) => a + (n || 0), 0);
/** まだクリアしていない遊べるステージのうち、いちばん先のもの */
export function nextStage(d) {
  let best = 1;
  for (let s = 1; s <= STAGE_COUNT; s++) if (stageOpen(d, s)) best = s;
  return best;
}

export function expNeed(lv) {
  return Math.floor(5 + lv * 4 + lv * lv * 0.55);
}
export function clearReward(n) {
  return { gold: Math.round(400 + n * 150), firstTicket: 1 };
}
export function rollRarity(bonus = 0) {
  const rates = { N: 58 - bonus * 2, R: 30, SR: 10 + bonus * 1.4, SSR: 2 + bonus * 0.6 };
  let total = 0;
  for (const v of Object.values(rates)) total += Math.max(0, v);
  let r = Math.random() * total;
  for (const k of RARITY_ORDER) {
    r -= Math.max(0, rates[k]);
    if (r <= 0) return k;
  }
  return 'N';
}
export function randomEquipBase() {
  const keys = Object.keys(EQUIP);
  return keys[Math.floor(Math.random() * keys.length)];
}
// ===== ガチャ =====
// cost：コインで引くときの値段（1回 / 10連）。チケットは1回=1枚、10連=10枚
export const GACHAS = {
  char: {
    name: 'キャラガチャ', coin1: 1500, coin10: 13500,
    rates: { 5: 3, 4: 22, 3: 75 }, // ★ごとの確率（%）
    desc: 'ガチャ限定の★5キャラが登場！ 同じキャラが出ると覚醒（ステータスアップ）',
  },
  equip: {
    name: '装備ガチャ', coin1: 500, coin10: 4500,
    desc: '武器・防具・アクセサリーが手に入る',
  },
};
