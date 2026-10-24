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
const body = env('BODY').replace(/[<>"'`&\u0000-\u0009\u000b-\u001f]/g, '').slice(0, 180);
const until = env('UNTIL');
// 隠しキャラのID（シークレットコードでだけ仲間になるキャラ）。公開ログでは伏せる
const charId = env('CHAR').toLowerCase();
if (charId && !/^[a-z0-9_]{2,20}$/.test(charId)) fail('キャラIDは英小文字・数字・_ の2〜20文字で入力してください');
if (charId) console.log('::add-mask::' + charId);
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

// 失敗したときは、原因と直し方を実行結果の画面に出す（鍵の中身はログに出さない）
function explain(e) {
  const m = String(e?.message || e || '');
  if (/firebaserules\.googleapis\.com|Firebase Rules API|has not been used|SERVICE_DISABLED/i.test(m)) {
    return 'Firebase Rules API が有効になっていません。https://console.cloud.google.com/apis/library/firebaserules.googleapis.com?project=neondot を開いて「有効にする」を押し、数分待ってからもう一度実行してください。（または firestore.rules の全文を Firebase コンソールのルールに貼り付けて「公開」でも大丈夫です）';
  }
  if (/PERMISSION_DENIED|permission|403|insufficient/i.test(m)) {
    return action === 'ルールを反映'
      ? 'この鍵にはルールを書き換える権限がありません。firestore.rules の全文を Firebase コンソール →「Firestore Database」→「ルール」に貼り付けて「公開」してください（コードの追加やプレゼントはこの鍵で動きます）'
      : 'この鍵に Firestore を書き換える権限がありません。Firebase コンソール →「プロジェクトの設定」→「サービス アカウント」で作った鍵か確認してください';
  }
  if (/NOT_FOUND|database.*does not exist/i.test(m)) return 'Firestore のデータベースが見つかりません。鍵が neondot プロジェクトのものか確認してください';
  if (/invalid_grant|account not found|Invalid JWT|private key/i.test(m)) return '鍵が無効になっています（削除された・古い）。Firebase で新しい秘密鍵を作り直して、GitHub の Secret を更新してください';
  return 'エラー：' + m.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[鍵]').slice(0, 300);
}
process.on('unhandledRejection', (e) => fail(explain(e)));
process.on('uncaughtException', (e) => fail(explain(e)));

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) fail('GitHubのSecret「FIREBASE_SERVICE_ACCOUNT」が設定されていません');
let saJson;
try { saJson = JSON.parse(sa.replace(/^\uFEFF/, '').trim()); } catch { fail('Secret「FIREBASE_SERVICE_ACCOUNT」の中身が読めません。ダウンロードしたJSONファイルを開いて、最初の { から最後の } まで全部をそのまま貼り付け直してください'); }
if (!saJson.private_key || !saJson.client_email) fail('Secret の中身がサービスアカウントの鍵ではないようです（private_key・client_email がありません）。Firebase の「サービス アカウント」→「新しい秘密鍵の生成」で作ったJSONを貼り付けてください');
if (saJson.project_id && saJson.project_id !== 'neondot') fail(`鍵が別のプロジェクト（${saJson.project_id}）のものです。neondot の鍵を作って貼り付けてください`);
const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ credential: cert(saJson) });
const db = getFirestore();

if (action === 'コードを追加') {
  if (!/^[A-Z0-9_-]{4,32}$/.test(code)) fail('コードは英数字と - _ だけで4〜32文字にしてください（大文字・小文字は区別しません）');
  if (!Object.keys(reward).length && !charId) fail('もらえる物（コイン・チケット・ダイヤ・キャラ）を1つ以上入力してください');
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) fail('期限は 2026-12-31 の形で入力してください');
  await db.doc('codes/' + code).set({ title: title || 'シークレットコード', reward, ...(charId ? { char: charId } : {}), until: until || null, active: true, createdAt: FieldValue.serverTimestamp() });
  console.log(`追加しました：${masked(code)}（${rewardText(reward)}${charId ? '・キャラあり' : ''}）`);
  summary(`✅ シークレットコード ${masked(code)} を追加しました\n\n- タイトル：${title || 'シークレットコード'}\n- もらえる物：${rewardText(reward)}\n- キャラ：${charId ? 'あり（IDは伏せ字）' : 'なし'}\n- 期限：${until || 'なし'}\n\n※ キャラ付きのコードは、そのキャラが入った版のゲームでだけ使えます（古い版では「最新版にすると使えるようになります」と表示され、使った扱いにはなりません）。`);
} else if (action === 'コードを止める') {
  if (!code) fail('止めるコードを入力してください');
  const ref = db.doc('codes/' + code);
  if (!(await ref.get()).exists) fail(`コード ${masked(code)} は見つかりません`);
  await ref.delete();
  summary(`✅ シークレットコード ${masked(code)} を止めました（もう使えません）`);
} else if (action === 'コードの一覧') {
  const snap = await db.collection('codes').get();
  const rows = snap.docs.map((d) => `| ${masked(d.id)} | ${d.get('title') || ''} | ${rewardText(d.get('reward') || {})} | ${d.get('char') ? 'あり' : '-'} | ${d.get('until') || 'なし'} |`);
  summary(`### シークレットコード（${snap.size}件）\n公開ログのため、コードとキャラIDは伏せています。全文は Firebase コンソールの Firestore「codes」で確認できます。\n\n| コード | タイトル | もらえる物 | キャラ | 期限 |\n|---|---|---|---|---|\n${rows.join('\n')}`);
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
} else if (action === 'お知らせ通知を送る') {
  // タイトルと本文を決めて、通知をオンにしている人へプッシュ通知を送る（ユーザーIDを入れるとその人だけ）
  if (!title) fail('通知のタイトルを入力してください');
  if (!body) fail('通知の本文を入力してください');
  const { getMessaging } = await import('firebase-admin/messaging');
  const targets = []; // { token, ref, field }
  if (userId) {
    if (!/^DR-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(userId)) fail('ユーザーIDは DR-XXXXX-XXXXX の形で入力してください');
    const doc = await db.doc('pushTokens/' + userId).get();
    if (doc.exists && doc.get('token')) targets.push({ token: doc.get('token'), ref: doc.ref, del: true });
    // Googleログインしている人は、クラウドセーブ側に保存した受け取り先も使う
    for (const s of (await db.collection('saves').where('summary.pid', '==', userId).get()).docs) {
      const t = s.get('fcmToken');
      if (t && !targets.some((x) => x.token === t)) targets.push({ token: t, ref: s.ref, del: false });
    }
    if (!targets.length) fail('このユーザーは通知をオンにしていません（ゲームの設定で「更新のお知らせ通知」をオンにしてもらってください）');
  } else {
    const seen = new Set();
    for (const d of (await db.collection('pushTokens').get()).docs) {
      const t = d.get('token'); if (t && !seen.has(t)) { seen.add(t); targets.push({ token: t, ref: d.ref, del: true }); }
    }
    // 以前の方式（Googleログインした人のセーブに保存した受け取り先）
    for (const d of (await db.collection('saves').where('fcmToken', '!=', null).select('fcmToken').get()).docs) {
      const t = d.get('fcmToken'); if (t && !seen.has(t)) { seen.add(t); targets.push({ token: t, ref: d.ref, del: false }); }
    }
  }
  let ok = 0, removed = 0;
  for (let i = 0; i < targets.length; i += 500) {
    const chunk = targets.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: chunk.map((t) => t.token),
      data: { title, body, url: './', tag: 'info-' + Date.now().toString(36) },
      webpush: { headers: { Urgency: 'high', TTL: String(60 * 60 * 24 * 3) } },
    });
    ok += res.successCount;
    const batch = db.batch();
    res.responses.forEach((r, j) => {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument') || code.includes('invalid-registration-token')) {
        if (chunk[j].del) batch.delete(chunk[j].ref); else batch.update(chunk[j].ref, { fcmToken: FieldValue.delete() });
        removed++;
      }
    });
    await batch.commit();
  }
  summary(`✅ 通知を送りました\n\n- タイトル：${title}\n- 本文：${body}\n- 送信先：${userId ? '指定したユーザー（公開ログのためIDは伏せ字）' : '通知をオンにしている全員'}\n- 届いた数：${ok} / ${targets.length}${removed ? `（使われなくなった受け取り先 ${removed} 件を削除）` : ''}`);
} else if (action === 'ルールを反映') {
  const { getSecurityRules } = await import('firebase-admin/security-rules');
  await getSecurityRules().releaseFirestoreRulesetFromSource(readFileSync('firestore.rules', 'utf8'));
  summary('✅ firestore.rules を Firebase に反映しました');
} else {
  fail('操作を選んでください');
}
