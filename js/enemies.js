// 敵のデータ（名前・行動パターン・弱点・攻略法）
// - モブ（MOBS）は行動パターン（PATTERNS）ごとに動き方が決まる。ヘルプはパターンごとに最初の1回だけ出る
// - ボス（BOSSES）はステージごとに1体。使う技（BOSS_ATTACKS）の組み合わせで個性を出す
// - 弱点（weak）の属性で攻撃すると1.6倍のダメージ
import { SKILLS } from './data.js';

// ===== 属性 =====
export const ELEMENTS = {
  fire: { name: '炎', color: '#ff7a2a' },
  ice: { name: '氷', color: '#5ac8ff' },
  thunder: { name: '雷', color: '#ffd23a' },
  holy: { name: '光', color: '#ffe98a' },
  slash: { name: '斬撃', color: '#ff5c7a' },
  shot: { name: '射撃', color: '#7ad85a' },
};
/** 武器 → 属性 */
export const WEAPON_EL = {
  foxfire: 'fire', bomb: 'fire', missile: 'fire',
  ice: 'ice',
  thunder: 'thunder', chain: 'thunder', plasma: 'thunder',
  holy: 'holy', talisman: 'holy', note: 'holy', field: 'holy',
  blade: 'slash', scythe: 'slash', axe: 'slash',
  arrow: 'shot', yarn: 'shot', drone: 'shot',
};
export const WEAK_MUL = 1.6;
/** その属性の武器名の一覧（ヘルプ用） */
export function weaponsOf(el) {
  return Object.entries(WEAPON_EL).filter(([, e]) => e === el).map(([id]) => SKILLS[id]?.name).filter(Boolean);
}

// ===== モブの行動パターン =====
export const PATTERNS = {
  chase: {
    name: '体当たり型',
    attack: 'まっすぐ近づいてきて、体当たりでダメージを与えてくる。',
    dodge: '動きはゆっくり。止まらずに歩き回れば当たりにくい。囲まれる前に数を減らそう。',
  },
  dash: {
    name: '突進型',
    attack: '少し立ち止まって「！」マークが出たあと、その方向へ一気に突進してくる。',
    dodge: '「！」が出たら横へ動く。突進はまっすぐにしか進まないので、横によければ当たらない。突進のあとは少し止まるのでチャンス。',
  },
  shooter: {
    name: '射撃型',
    attack: '少し離れた場所から、こちらをねらって弾を撃ってくる。近づくと離れていく。',
    dodge: '弾は撃った瞬間のこちらの位置へ飛ぶので、撃たれたら横に動けば当たらない。逃げる敵には追いかける武器（お札・ホーミング弾）や貫通する武器が便利。',
  },
  swoop: {
    name: '飛行型',
    attack: '空を飛び、ジグザグに動きながら素早く近づいてくる。岩も飛び越える。',
    dodge: '動きが速いので逃げるより迎え撃つ方が安全。自分の周りを攻撃する武器（狐火・バリア・ブラッドサイス）が当てやすい。',
  },
  phase: {
    name: 'すり抜け型',
    attack: '岩をすり抜けて近づき、ときどき姿を消す。消えている間は攻撃が当たらず、こちらもダメージを受けない。',
    dodge: '体が薄くなったら距離をとる。また見えるようになった瞬間がねらい目。',
  },
  split: {
    name: '分裂型',
    attack: '倒すと小さな2体に分かれる。小さい方は体力が少ないが速い。',
    dodge: '倒す時は周りに余裕を持って。範囲攻撃（雷・爆弾・光の柱）でまとめて倒すと楽。',
  },
  bomber: {
    name: '自爆型',
    attack: '近くまで来ると止まって点滅し、まわりを巻き込んで爆発する。',
    dodge: '点滅しはじめたら赤い円の外へ逃げる。離れた所から先に倒すのが一番安全。',
  },
  tank: {
    name: '重戦車型（エリート）',
    attack: 'とても硬く、攻撃しても押し返されない。近づくと地面をたたいて周りに衝撃波を出す。',
    dodge: '足元に赤い円が出たら円の外へ。たたいた後は少しの間止まるので、そのすきに攻撃。',
  },
};

// ===== モブ =====
// sprite: 見た目の種類  pal: 色  hp/spd: 基本値への倍率
const m = (name, sprite, pal, pattern, weak, opt = {}) => ({ name, sprite, pal, pattern, weak, hp: 1, spd: 1, ...opt });
export const MOBS = {
  // 草原
  g_slime: m('スライム', 'slime', { A: '#6ad85a' }, 'chase', 'fire', { flavor: '草原のどこにでもいるぷよぷよ。' }),
  g_mush: m('キノコン', 'mushroom', { A: '#ff5a4a', C: '#ffe9c8' }, 'dash', 'fire', { flavor: '怒ると頭から突っ込んでくる。' }),
  g_bat: m('コウモリン', 'bat', { A: '#8a5a3a', e: '#ffe14d' }, 'swoop', 'shot', { flavor: '明るい場所でも元気に飛び回る。' }),
  g_golem: m('もりのゴーレム', 'golem', { A: '#7a9a5a', B: '#4a6a3a', C: '#9ad86a', e: '#ffe14d' }, 'tank', 'thunder', { flavor: 'こけむした石の巨人。' }),
  // 砂漠
  d_slime: m('サンドスライム', 'slime', { A: '#e8b86a' }, 'split', 'ice', { flavor: '砂をたっぷり吸って2つに割れる。' }),
  d_mush: m('トゲキノコ', 'mushroom', { A: '#3fae5a', C: '#ffd8a0' }, 'shooter', 'fire', { flavor: 'サボテンのようなトゲを飛ばす。' }),
  d_bat: m('スナコウモリ', 'bat', { A: '#c86a3a', e: '#ffffff' }, 'swoop', 'ice', { flavor: '砂嵐にまぎれて飛んでくる。' }),
  d_golem: m('サンドゴーレム', 'golem', { A: '#d8a868', B: '#a87a48', C: '#4ee0c0', e: '#4ee0c0' }, 'tank', 'ice', { flavor: '砂岩でできた番人。' }),
  // 雪国
  s_slime: m('ユキスライム', 'slime', { A: '#8ad8ff' }, 'chase', 'fire', { flavor: 'ひんやり冷たいスライム。' }),
  s_ghost: m('ゆきおばけ', 'ghost', { A: '#f4faff' }, 'phase', 'fire', { flavor: '吹雪の中にすっと消える。' }),
  s_bat: m('こおりコウモリ', 'bat', { A: '#5a7ac8', e: '#9fe6ff' }, 'swoop', 'fire', { flavor: '羽が凍っていても速い。' }),
  s_golem: m('アイスゴーレム', 'golem', { A: '#a8d0f0', B: '#6a9ac8', C: '#e8f8ff', e: '#3fd6ff' }, 'tank', 'fire', { flavor: '氷のかたまりの巨人。' }),
  // サイバーシティ
  c_drone: m('パトロールドローン', 'drone', { A: '#a9b3cc', e: '#36f2ff' }, 'shooter', 'thunder', { flavor: '街を見張る警備ロボ。' }),
  c_ghost: m('ネオンゴースト', 'ghost', { A: '#ff5fd0' }, 'phase', 'holy', { flavor: 'ネットの中から出てきたおばけ。' }),
  c_slime: m('バグスライム', 'slime', { A: '#4dff8a' }, 'bomber', 'thunder', { flavor: 'プログラムのバグ。さわると爆発する。' }),
  c_golem: m('メカゴーレム', 'golem', { A: '#8a92b0', B: '#4a5070', C: '#36f2ff', e: '#ff3b5c' }, 'tank', 'thunder', { flavor: '重装甲の警備ロボ。' }),
  // 火山
  v_slime: m('マグマスライム', 'slime', { A: '#ff7a3a' }, 'split', 'ice', { flavor: '熱すぎて体が割れる。' }),
  v_bat: m('ひのこコウモリ', 'bat', { A: '#c4303a', e: '#ffd23a' }, 'swoop', 'ice', { flavor: '火の粉をまいて飛ぶ。' }),
  v_wisp: m('おにび', 'wisp', { A: '#ff8a2a', C: '#ffe14d' }, 'bomber', 'ice', { flavor: '燃えつきる前に爆発する炎。' }),
  v_golem: m('ようがんゴーレム', 'golem', { A: '#5a4040', B: '#3a2828', C: '#ff7a2a', e: '#ffd23a' }, 'tank', 'ice', { flavor: '溶岩が冷えてできた巨人。' }),
  // 魔王城
  k_ghost: m('さまよう騎士の霊', 'ghost', { A: '#c8b8ff' }, 'phase', 'holy', { flavor: '城を守り続ける亡霊。' }),
  k_bat: m('あくまコウモリ', 'bat', { A: '#5a3a8a', e: '#ff3b5c' }, 'swoop', 'holy', { flavor: '魔王の使い魔。' }),
  k_skull: m('ガイコツ兵', 'skull', { A: '#e8e0d0', e: '#ff3b5c' }, 'dash', 'holy', { flavor: '剣を構えて突っ込んでくる。' }),
  k_golem: m('やみのゴーレム', 'golem', { A: '#4a4060', B: '#2a2438', C: '#c4103c', e: '#ff3b5c' }, 'tank', 'holy', { flavor: '魔力で動く黒い巨人。' }),
  // 森
  f_slime: m('コケスライム', 'slime', { A: '#4a9a3a' }, 'chase', 'fire', { flavor: '体にコケが生えている。' }),
  f_mush: m('ドクキノコ', 'mushroom', { A: '#a04ad8', C: '#f0e0ff' }, 'shooter', 'fire', { flavor: '毒の胞子を飛ばす。' }),
  f_bee: m('キラービー', 'bat', { A: '#ffc82a', e: '#1e1226' }, 'swoop', 'fire', { flavor: '森でいちばん速いハチ。' }),
  f_golem: m('ウッドゴーレム', 'golem', { A: '#8a6a3a', B: '#5a4020', C: '#7ad85a', e: '#ffe14d' }, 'tank', 'fire', { flavor: '大木が動き出した姿。' }),
  // 海辺
  b_crab: m('ハサミガニ', 'crab', { A: '#ff6a4a', e: '#1e1226' }, 'dash', 'thunder', { flavor: '横歩きから急に突進する。' }),
  b_jelly: m('ふわクラゲ', 'ghost', { A: '#8ad0ff' }, 'phase', 'thunder', { flavor: '波の中にすけて消える。' }),
  b_slime: m('うみスライム', 'slime', { A: '#3a9cff' }, 'split', 'thunder', { flavor: '海水でふくらんでいる。' }),
  b_golem: m('サンゴゴーレム', 'golem', { A: '#ff8aa0', B: '#c8506a', C: '#fff0c8', e: '#3a9cff' }, 'tank', 'thunder', { flavor: 'サンゴ礁の守り神。' }),
  // 洞窟
  u_eye: m('めだまん', 'eye', { A: '#f4f0f8', C: '#c4103c', e: '#3a2040' }, 'shooter', 'slash', { flavor: '暗やみからじっと見ている。' }),
  u_bat: m('クリスタルコウモリ', 'bat', { A: '#4ad8e8', e: '#ffffff' }, 'swoop', 'slash', { flavor: '羽が水晶でできている。' }),
  u_rock: m('ばくだんいわ', 'slime', { A: '#8a8a94' }, 'bomber', 'shot', { flavor: '近づくと爆発する岩。' }),
  u_golem: m('クリスタルゴーレム', 'golem', { A: '#7ae0f0', B: '#3a9ab8', C: '#e0ffff', e: '#ff5fd0' }, 'tank', 'slash', { flavor: '水晶の体はとても硬い。' }),
  // 墓地
  h_skull: m('さまようガイコツ', 'skull', { A: '#d8d0c0', e: '#7affb0' }, 'dash', 'holy', { flavor: '夜になると歩き出す。' }),
  h_wisp: m('ひとだま', 'wisp', { A: '#5ab8ff', C: '#e0f6ff' }, 'bomber', 'holy', { flavor: 'ふわふわ近づいてはじける。' }),
  h_ghost: m('ボロおばけ', 'ghost', { A: '#a8b0a0' }, 'phase', 'holy', { flavor: '墓石の間をすり抜ける。' }),
  h_golem: m('ボーンゴーレム', 'golem', { A: '#d8d0c0', B: '#9a9080', C: '#7affb0', e: '#7affb0' }, 'tank', 'holy', { flavor: '骨を組み上げた巨人。' }),
  // 天空
  y_slime: m('くもスライム', 'slime', { A: '#ffffff' }, 'chase', 'thunder', { flavor: '雲が固まってできた。' }),
  y_eye: m('カミナリめだま', 'eye', { A: '#fff6b0', C: '#3a9cff', e: '#1e1226' }, 'shooter', 'shot', { flavor: '雷の弾を撃ってくる。' }),
  y_bat: m('てんくうコウモリ', 'bat', { A: '#7ab8ff', e: '#ffffff' }, 'swoop', 'shot', { flavor: '空の上を自由に飛ぶ。' }),
  y_golem: m('くものゴーレム', 'golem', { A: '#e8f0ff', B: '#a8b8e0', C: '#ffd23a', e: '#3a9cff' }, 'tank', 'thunder', { flavor: '雷雲をまとった巨人。' }),
  // 宇宙
  z_ufo: m('ミニUFO', 'drone', { A: '#c8d0e0', e: '#7dff5a' }, 'shooter', 'thunder', { flavor: '光線銃を持った宇宙船。' }),
  z_eye: m('うちゅうめだま', 'eye', { A: '#c8a8ff', C: '#7dff5a', e: '#1e1226' }, 'phase', 'holy', { flavor: 'ワープしながら近づく。' }),
  z_slime: m('スペーススライム', 'slime', { A: '#b07aff' }, 'split', 'thunder', { flavor: '宇宙から落ちてきたスライム。' }),
  z_golem: m('ロボゴーレム', 'golem', { A: '#6a7090', B: '#3a4060', C: '#7dff5a', e: '#7dff5a' }, 'tank', 'thunder', { flavor: '宇宙ステーションの作業ロボ。' }),
};

// ===== ボスの技 =====
export const BOSS_ATTACKS = {
  ring: { name: '全方位弾', desc: 'まわり全体に弾をばらまく。', dodge: '弾と弾のすき間に入る。ボスから離れているほどすき間が広くてよけやすい。' },
  fan: { name: '扇状弾', desc: 'こちらをねらって、扇の形に弾を撃つ。', dodge: '撃つ直前に横へ大きく動く。弾の扇の外側へ出れば当たらない。' },
  spiral: { name: 'うずまき弾', desc: '回転しながら弾を出し続ける。', dodge: '弾が回る向きと同じ方向に、ボスのまわりを回るように動く。' },
  burst: { name: '連射', desc: 'こちらをねらって弾を5連続で撃つ。', dodge: '撃っている間、立ち止まらずに円をかくように動き続ける。' },
  charge: { name: '突進', desc: '赤い線が出たあと、その方向へ一気に突っ込んでくる。', dodge: '赤い線が出たら、線の横へ逃げる。突進のあとは少し止まるので攻撃のチャンス。' },
  slam: { name: 'ジャンプ攻撃', desc: '高くジャンプして、こちらの足元に落ちてくる。着地すると衝撃で弾が飛ぶ。', dodge: '足元に赤い円が出たらすぐ円の外へ。着地のあとに飛ぶ弾にも注意。' },
  rain: { name: '落下攻撃', desc: 'あちこちに赤い円が出て、少しあとに上から物が落ちてくる。', dodge: '赤い円の外へ。円が出ていない場所を探して移動する。' },
  summon: { name: '手下を呼ぶ', desc: '仲間のモンスターを呼び出す。', dodge: '手下は早めに倒す。範囲攻撃でまとめて倒すと楽。' },
};

// ===== ボス =====
// size: 大きさ  hp: 体力の倍率  spd: 移動速度  attacks: 使う技（順番に使う）  rain: 落下攻撃で落ちてくる物の色
const b = (name, sprite, pal, weak, attacks, opt = {}) => ({ name, sprite, pal, weak, attacks, size: 2.4, hp: 1, spd: 18, ...opt });
export const BOSSES = {
  kingslime: b('キングスライム', 'slime', { A: '#6ad85a' }, 'fire', ['slam', 'summon', 'ring'],
    { size: 2.6, hp: 0.9, minion: 'g_slime', tips: 'ジャンプの赤い円が出たらすぐ外へ。手下のスライムを片付けながら、着地のすきを攻撃しよう。' }),
  pharaoh: b('ファラオゴーレム', 'golem', { A: '#e8c070', B: '#a87a48', C: '#4ee0c0', e: '#4ee0c0' }, 'ice', ['charge', 'fan', 'rain'],
    { size: 2, rain: '#e8b86a', tips: '突進の赤い線を見たら横へ。砂の落下攻撃は円の外へ逃げれば大丈夫。' }),
  blizzard: b('ブリザードゴースト', 'ghost', { A: '#e8f6ff' }, 'fire', ['spiral', 'burst', 'ring'],
    { size: 2.6, fly: true, tips: 'うずまき弾はボスのまわりを回るように動くとよけやすい。炎の武器で一気に攻めよう。' }),
  motherdrone: b('マザードローン', 'drone', { A: '#c8ccd8', e: '#ff3b5c' }, 'thunder', ['burst', 'summon', 'spiral'],
    { size: 2.6, fly: true, minion: 'c_drone', tips: '呼び出されるドローンの弾に注意。雷の武器がよく効く。' }),
  magmagolem: b('マグマゴーレム', 'golem', { A: '#5a4040', B: '#3a2828', C: '#ff7a2a', e: '#ffd23a' }, 'ice', ['rain', 'ring', 'slam'],
    { size: 2, rain: '#ff6a1a', tips: '溶岩の落下とジャンプ攻撃が続く。赤い円をよく見て、氷の武器で動きを遅くしよう。' }),
  darklord: b('魔王ダークロード', 'golem', { A: '#4a4060', B: '#2a2438', C: '#c4103c', e: '#ff3b5c' }, 'holy', ['spiral', 'charge', 'summon', 'rain'],
    { size: 2.2, hp: 1.15, minion: 'k_skull', rain: '#a05ae8', tips: 'すべての技を使ってくる強敵。光の武器が弱点。体力が半分を切ると技が速くなる。' }),
  bigmush: b('ビッグマッシュ', 'mushroom', { A: '#a04ad8', C: '#f0e0ff' }, 'fire', ['rain', 'summon', 'fan'],
    { size: 2.8, minion: 'f_mush', rain: '#c47aff', tips: '毒の胞子が上から降ってくる。円の外を歩き回りながら炎で攻めよう。' }),
  kingcrab: b('キングクラブ', 'crab', { A: '#ff4a3a', e: '#1e1226' }, 'thunder', ['charge', 'burst', 'charge', 'ring'],
    { size: 2.8, spd: 22, tips: '何度も突進してくる。赤い線の横へよけて、止まったすきに雷で攻撃。' }),
  crystalking: b('クリスタルキング', 'golem', { A: '#7ae0f0', B: '#3a9ab8', C: '#e0ffff', e: '#ff5fd0' }, 'slash', ['ring', 'rain', 'spiral'],
    { size: 2, rain: '#7ae0f0', tips: '弾の量が多い。離れて戦い、斬撃の武器で近づいた時に大ダメージを。' }),
  skullking: b('スカルキング', 'skull', { A: '#e8e0d0', e: '#7affb0' }, 'holy', ['summon', 'spiral', 'slam'],
    { size: 2.8, minion: 'h_skull', tips: 'ガイコツ兵を次々呼ぶ。手下を光の武器でまとめて倒そう。' }),
  stormbat: b('ストームバット', 'bat', { A: '#3a5ac8', e: '#ffd23a' }, 'shot', ['charge', 'fan', 'rain', 'burst'],
    { size: 2.6, fly: true, spd: 26, rain: '#ffd23a', tips: '雷が落ちてくる。空を飛ぶので岩の後ろに隠れても無駄。射撃の武器で撃ち落とそう。' }),
  galaxyeye: b('ギャラクシーアイ', 'eye', { A: '#c8a8ff', C: '#7dff5a', e: '#1e1226' }, 'holy', ['spiral', 'burst', 'ring', 'summon'],
    { size: 2.8, fly: true, hp: 1.25, minion: 'z_ufo', tips: '最強クラスのボス。弾の量が多いので、こまめに動いて光の武器で攻撃しよう。' }),
};

/** 図鑑・ヘルプ用：1つの敵の情報 */
export function enemyInfo(kind, id) {
  if (kind === 'boss') {
    const B = BOSSES[id];
    return B && { kind, id, name: B.name, sprite: B.sprite, pal: B.pal, weak: B.weak, boss: true, def: B };
  }
  const M = MOBS[id];
  return M && { kind, id, name: M.name, sprite: M.sprite, pal: M.pal, weak: M.weak, pattern: M.pattern, def: M };
}
