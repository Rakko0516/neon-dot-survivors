#!/usr/bin/env node
// 運営ツール（GitHub Actions の「運営ツール」から実行）
// ・シークレットコードの追加／停止／一覧
// ・ユーザーIDを指定してプレゼント（コイン・チケット・ダイヤ）を送る
// ・firestore.rules を Firebase に反映
// 必要なもの：GitHubのSecret「FIREBASE_SERVICE_ACCOUNT」（プッシュ通知と同じもの）
// ※このリポジトリは公開なので、ログにコードをそのまま出さない（::add-mask:: で伏せ字にする）
import { readFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// 入力は GitHub のイベント情報（GITHUB_EVENT_PATH）から読む（env に入れるとログに表示されてしまう）
let inputs = {};
try { inputs = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH || '', 'utf8')).inputs || {}; } catch {}
const env = (k) => String(inputs[k.toLowerCase()] ?? process.env[k] ?? '').trim();
const fail = (m) => { console.log('::error::' + m); summary(`❌ ${m}`); process.exit(1); };
const summary = (m) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, m + '\n'); };

const action = env('ACTION');
const code = env('CODE').normalize('NFKC').toUpperCase().replace(/\s+/g, '');
if (code) console.log('::add-mask::' + code);
const userId = env('USER_ID').toUpperCase();
if (userId) console.log('::add-mask::' + userId);
const maskedId = (id) => id.slice(0, 5) + '***-***' + id.slice(-2);
const title = env('TITLE').replace(/[<>"'`&\u0000-\u001f]/g, '').slice(0, 40);
const until = env('UNTIL');
const n = (k, max) => {
  const v = env(k);
  if (!v) return 0;
  if (!/^\d+$/.test(v)) fail(`${k} は 0 以上の整数で入力してください`);
  const x = +v;
  if (x > max) fail(`${k} は ${max.toLocaleString()} 以下にしてください`);
  return x;
};
const reward = Object.fromEntries(Object.entries({ gold: n('GOLD', 10000000), cticket: n('CTICKET', 10000), eticket: n('ETICKET', 10000), diamond: n('DIAMOND', 100000) }).filter(([, v]) => v > 0));
const rewardText = (r) => Object.entries(r).map(([k, v]) => `${{ gold: 'コイン', cticket: 'キャラチケ', eticket: '装備チケ', diamond: 'ダイヤ' }[k] || k}×${v}`).join('、') || '（なし）';
const masked = (c) => (c.length <= 4 ? c[0] + '***' : c.slice(0, 2) + '*'.repeat(c.length - 4) + c.slice(-2));

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) fail('GitHubのSecret「FIREBASE_SERVICE_ACCOUNT」が設定されていません');
const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ credential: cert(JSON.parse(sa)) });
const db = getFirestore();

if (action === 'コードを追加') {
  if (!/^[A-Z0-9_-]{4,32}$/.test(code)) fail('コードは英数字と - _ だけで4〜32文字にしてください（大文字・小文字は区別しません）');
  if (!Object.keys(reward).length) fail('もらえる物（コイン・チケット・ダイヤ）を1つ以上入力してください');
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) fail('期限は 2026-12-31 の形で入力してください');
  await db.doc('codes/' + code).set({ title: title || 'シークレットコード', reward, until: until || null, active: true, createdAt: FieldValue.serverTimestamp() });
  console.log(`追加しました：${masked(code)}（${rewardText(reward)}）`);
  summary(`✅ シークレットコード ${masked(code)} を追加しました\n\n- タイトル：${title || 'シークレットコード'}\n- もらえる物：${rewardText(reward)}\n- 期限：${until || 'なし'}`);
} else if (action === 'コードを止める') {
  if (!code) fail('止めるコードを入力してください');
  const ref = db.doc('codes/' + code);
  if (!(await ref.get()).exists) fail(`コード ${masked(code)} は見つかりません`);
  await ref.delete();
  summary(`✅ シークレットコード ${masked(code)} を止めました（もう使えません）`);
} else if (action === 'コードの一覧') {
  const snap = await db.collection('codes').get();
  const rows = snap.docs.map((d) => `| ${masked(d.id)} | ${d.get('title') || ''} | ${rewardText(d.get('reward') || {})} | ${d.get('until') || 'なし'} |`);
  summary(`### シークレットコード（${snap.size}件）\n公開ログのため、コードは伏せ字です。全文は Firebase コンソールの Firestore「codes」で確認できます。\n\n| コード | タイトル | もらえる物 | 期限 |\n|---|---|---|---|\n${rows.join('\n')}`);
  console.log(`${snap.size} 件`);
} else if (action === 'ユーザーにプレゼント') {
  if (!/^DR-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(userId)) fail('ユーザーIDは DR-XXXXX-XXXXX の形で入力してください（ゲームの設定画面に表示されています）');
  if (!Object.keys(reward).length) fail('送る物（コイン・チケット・ダイヤ）を1つ以上入力してください');
  const ref = db.doc('grants/' + userId);
  const item = { id: randomBytes(6).toString('hex'), title: title || '運営からのプレゼント', reward, at: Date.now() };
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const items = (cur.exists ? cur.get('items') || [] : []).concat(item).slice(-50); // 古いものから消す（受け取り済みの判定はゲーム側）
    tx.set(ref, { items, updatedAt: FieldValue.serverTimestamp() });
  });
  summary(`✅ ${maskedId(userId)} にプレゼントを送りました（公開ログのためIDは伏せ字）\n\n- タイトル：${item.title}\n- 送った物：${rewardText(reward)}\n\n相手が次にゲームを開いたとき（開いたままなら5分以内）にプレゼントボックスに届きます。`);
} else if (action === 'ルールを反映') {
  const { getSecurityRules } = await import('firebase-admin/security-rules');
  await getSecurityRules().releaseFirestoreRulesetFromSource(readFileSync('firestore.rules', 'utf8'));
  summary('✅ firestore.rules を Firebase に反映しました');
} else {
  fail('操作を選んでください');
}
