#!/usr/bin/env node
// GitHub Actions から実行：changelog.json に通知ありの項目が追加されたら、通知オンの全プレイヤーへ送信
// 必要なもの：GitHubのSecret「FIREBASE_SERVICE_ACCOUNT」（Firebaseのサービスアカウント鍵JSONの中身）
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) {
  console.log('FIREBASE_SERVICE_ACCOUNT が未設定のため通知はスキップします');
  process.exit(0);
}

const current = JSON.parse(readFileSync('changelog.json', 'utf8')).entries || [];
const latest = current[0];
if (!latest) { console.log('更新履歴が空です'); process.exit(0); }

let prevId = null;
try {
  const prev = JSON.parse(execSync('git show HEAD~1:changelog.json', { encoding: 'utf8' }));
  prevId = prev.entries?.[0]?.id ?? null;
} catch { /* 初回コミットなど */ }

const force = process.env.FORCE === 'true';
if (!force && (latest.id === prevId || !latest.notify)) {
  console.log('新しい通知対象の項目はありません');
  process.exit(0);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const { getMessaging } = await import('firebase-admin/messaging');

initializeApp({ credential: cert(JSON.parse(sa)) });
const db = getFirestore();
const snap = await db.collection('saves').where('fcmToken', '!=', null).select('fcmToken').get();
const docs = snap.docs.filter((d) => d.get('fcmToken'));
console.log(`送信対象: ${docs.length} 人`);

const title = latest.version ? `アップデート v${latest.version}` : 'お知らせ';
const body = latest.title || (latest.items || []).join(' / ') || '新しいお知らせがあります';
let ok = 0, removed = 0;

for (let i = 0; i < docs.length; i += 500) {
  const chunk = docs.slice(i, i + 500);
  const res = await getMessaging().sendEachForMulticast({
    tokens: chunk.map((d) => d.get('fcmToken')),
    data: { title, body: body.slice(0, 180), url: './', tag: 'news' },
    webpush: { headers: { Urgency: 'normal', TTL: String(60 * 60 * 24 * 3) } },
  });
  ok += res.successCount;
  // 無効になったトークンは削除（アンインストール・通知拒否など）
  const batch = db.batch();
  res.responses.forEach((r, j) => {
    const code = r.error?.code || '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-argument') || code.includes('invalid-registration-token')) {
      batch.update(chunk[j].ref, { fcmToken: FieldValue.delete() });
      removed++;
    }
  });
  await batch.commit();
}
console.log(`送信成功: ${ok} / 無効トークン削除: ${removed}`);
