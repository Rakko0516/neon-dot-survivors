// クラウドセーブ（Firebase Auth + Firestore）とプッシュ通知トークン登録
// config.js に FIREBASE_CONFIG が無い場合は何もしない（オフラインでも遊べる）
import { FIREBASE_CONFIG, FIREBASE_SDK, VAPID_KEY, APPCHECK_SITE_KEY } from './config.js';
import { store, validate, summary, onChange } from './save.js';

const SYNC_KEY = 'nds_sync'; // { uid, lastSyncedAt }
const AUTO_INTERVAL = 10 * 60 * 1000; // 自動バックアップ間隔（10分）
const MIN_GAP = 45 * 1000; // 連続アップロード防止

export const cloud = {
  enabled: !!FIREBASE_CONFIG,
  ready: false,
  user: null,
  status: 'idle', // idle | syncing | ok | error | offline
  lastSync: 0,
  error: '',
};

let fb = null;
const listeners = new Set();
export function onCloud(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(cloud); }

let conflictHandler = null; // (local, remote) => Promise<'local'|'remote'>
let applyRemote = null; // (save) => void
export function setSyncHandlers({ onConflict, onApplyRemote }) {
  conflictHandler = onConflict;
  applyRemote = onApplyRemote;
}

function getMeta() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; }
}
function setMeta(m) { localStorage.setItem(SYNC_KEY, JSON.stringify(m)); }

export async function initCloud() {
  if (!cloud.enabled) return;
  try {
    const [appM, authM, fsM] = await Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-auth.js`),
      import(`${FIREBASE_SDK}/firebase-firestore.js`),
    ]);
    const app = appM.initializeApp(FIREBASE_CONFIG);
    // App Check：このゲーム（正規のURL）からのアクセスだけをFirebaseが受け付けるようにする
    if (APPCHECK_SITE_KEY) {
      try {
        const acM = await import(`${FIREBASE_SDK}/firebase-app-check.js`);
        acM.initializeAppCheck(app, { provider: new acM.ReCaptchaEnterpriseProvider(APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
      } catch (e) { console.warn('App Check init failed', e); }
    }
    const auth = authM.getAuth(app);
    const db = fsM.getFirestore(app);
    fb = { app, auth, db, authM, fsM };
    cloud.ready = true;
    // リダイレクトログインから戻ってきた場合
    authM.getRedirectResult(auth).catch((e) => console.warn(e));
    authM.onAuthStateChanged(auth, async (user) => {
      cloud.user = user ? { uid: user.uid, name: user.displayName || 'プレイヤー', email: user.email || '', photo: user.photoURL || '' } : null;
      emit();
      if (user) await syncOnLogin();
    });
    setInterval(() => autoBackup(), AUTO_INTERVAL);
    // 装備・ガチャ・設定などを変えたら、少し後に必ずバックアップ（まとめて1回にする）
    onChange(() => scheduleBackup());
    // アプリを閉じる・別アプリに切り替えるときは、直前にバックアップしていても変更があれば必ず送る
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') autoBackup(true);
    });
    window.addEventListener('online', () => autoBackup());
  } catch (e) {
    console.warn('cloud init failed', e);
    cloud.status = 'offline';
    cloud.error = 'クラウドに接続できませんでした（オフライン？）';
    emit();
  }
}

export async function signIn() {
  if (!fb) throw new Error('クラウド機能が未設定です');
  const { authM, auth } = fb;
  const provider = new authM.GoogleAuthProvider();
  try {
    await authM.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await authM.signInWithRedirect(auth, provider);
    } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      throw e;
    }
  }
}

export async function signOut() {
  if (!fb) return;
  await autoBackup(true);
  await fb.authM.signOut(fb.auth);
  setMeta({});
}

function docRef() {
  return fb.fsM.doc(fb.db, 'saves', cloud.user.uid);
}

export async function download() {
  const snap = await fb.fsM.getDoc(docRef());
  if (!snap.exists()) return null;
  const v = snap.data();
  if (!v.save) return null;
  const r = validate(JSON.parse(v.save));
  return r.ok ? r.save : null;
}

export async function upload(force = false) {
  if (!fb || !cloud.user) return false;
  const now = Date.now();
  if (!force && now - cloud.lastSync < MIN_GAP) return false;
  const save = store.save;
  cloud.status = 'syncing';
  emit();
  try {
    // Firestore は undefined を受け付けないので、JSONを通して取り除く
    const clean = (o) => JSON.parse(JSON.stringify(o));
    const body = JSON.stringify(save);
    if (body.length > 590000) throw new Error('セーブデータが大きすぎます');
    await fb.fsM.setDoc(docRef(), {
      save: body,
      updatedAt: save.updatedAt || Date.now(),
      gameVersion: save.gameVersion || '',
      summary: clean(summary(save)),
      serverTime: fb.fsM.serverTimestamp(),
    }, {
      // merge: true だと summary（中の項目）が古いものと混ざって増え続け、ルールの上限を超えてしまう。
      // 送る項目は丸ごと置き換え、それ以外（通知の受け取り先など）はそのまま残す
      mergeFields: ['save', 'updatedAt', 'gameVersion', 'summary', 'serverTime'],
    });
    cloud.lastSync = Date.now();
    cloud.status = 'ok';
    cloud.error = '';
    setMeta({ uid: cloud.user.uid, lastSyncedAt: save.updatedAt });
    emit();
    return true;
  } catch (e) {
    console.warn('backup failed', e);
    cloud.status = 'error';
    cloud.error = /permission/i.test(e?.message || '') ? 'サーバーに保存できませんでした（権限エラー）' : e.message;
    emit();
    return false;
  }
}

let backupTimer = null;
let loginSyncing = false; // ログイン直後の「どちらのデータを使うか」の判断中は送らない
/** 変更から少し待ってバックアップ（連続で変えても1回にまとめる。前回から45秒は空ける） */
function scheduleBackup(delay = 20000) {
  if (!cloud.user) return;
  clearTimeout(backupTimer);
  const wait = Math.max(delay, cloud.lastSync + MIN_GAP - Date.now());
  backupTimer = setTimeout(() => { backupTimer = null; autoBackup(true); }, wait);
}

/** 前回同期以降に変更があればアップロード */
export async function autoBackup(force = false) {
  if (!cloud.user || !navigator.onLine || loginSyncing) return;
  const meta = getMeta();
  if (meta.uid === cloud.user.uid && meta.lastSyncedAt === store.save.updatedAt) return;
  await upload(force);
}

/** ログイン直後：端末とクラウドどちらを使うか判断 */
async function syncOnLogin() {
  loginSyncing = true;
  try { await syncOnLoginInner(); } finally { loginSyncing = false; }
}
async function syncOnLoginInner() {
  cloud.status = 'syncing';
  emit();
  try {
    const remote = await download();
    const local = store.save;
    const meta = getMeta();
    if (!remote) {
      await upload(true);
      return;
    }
    if (remote.updatedAt === local.updatedAt) {
      setMeta({ uid: cloud.user.uid, lastSyncedAt: local.updatedAt });
      cloud.status = 'ok'; cloud.lastSync = Date.now(); emit();
      return;
    }
    const sameAccount = meta.uid === cloud.user.uid;
    const localChanged = !sameAccount || local.updatedAt !== meta.lastSyncedAt;
    const remoteChanged = !sameAccount || remote.updatedAt !== meta.lastSyncedAt;
    let choice;
    if (sameAccount && remoteChanged && !localChanged) choice = 'remote';
    else if (sameAccount && localChanged && !remoteChanged) choice = 'local';
    else choice = conflictHandler ? await conflictHandler(local, remote) : 'local';

    if (choice === 'remote') {
      applyRemote && applyRemote(remote);
      setMeta({ uid: cloud.user.uid, lastSyncedAt: remote.updatedAt });
      cloud.status = 'ok'; cloud.lastSync = Date.now(); emit();
    } else {
      await upload(true);
    }
  } catch (e) {
    cloud.status = 'error';
    cloud.error = e.message;
    emit();
  }
}

export async function restoreFromCloud() {
  const remote = await download();
  if (!remote) return null;
  return remote;
}

// ===== プッシュ通知（FCM） =====
// 通知の受け取り先（トークン）は pushTokens/{ユーザーID} に保存する（Googleログインしていなくても受け取れる）
// ※ iPhone は「タップした直後」でないと許可の確認を出せないので、最初に許可を求めてから準備をする
export function pushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}
async function waitReady(ms = 10000) {
  const t0 = Date.now();
  while (!fb && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 200));
  if (!fb) throw new Error('通信の準備ができませんでした。時間をおいてもう一度どうぞ');
}
/**
 * 通知をオンにする（ボタンを押したときに呼ぶ）
 * @param {ServiceWorkerRegistration} swReg
 * @param {string} playerId ユーザーID
 * @param {boolean} quiet すでに許可済みのとき、確認を出さずにトークンだけ更新する
 */
export async function enablePush(swReg, playerId, quiet = false) {
  if (!pushSupported()) throw new Error('このブラウザはプッシュ通知に対応していません（iPhoneはホーム画面に追加してから開いてください）');
  // ① 許可の確認（ここは await より前に呼ぶ＝タップの直後）
  const perm = Notification.permission === 'granted' ? 'granted' : quiet ? Notification.permission : await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('通知が許可されませんでした（端末の設定から許可できます）');
  if (!cloud.enabled) throw new Error('クラウド機能が未設定です');
  if (!VAPID_KEY) throw new Error('VAPIDキーが未設定です');
  await waitReady();
  const msgM = await import(`${FIREBASE_SDK}/firebase-messaging.js`);
  if (!(await msgM.isSupported())) throw new Error('このブラウザはプッシュ通知に対応していません');
  const messaging = msgM.getMessaging(fb.app);
  const reg = swReg || (await navigator.serviceWorker.ready);
  let token;
  try {
    token = await msgM.getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  } catch (e) {
    console.warn('getToken failed', e);
    throw new Error('通知の登録に失敗しました。アプリを開き直してもう一度お試しください');
  }
  // 受け取り先を保存：① ユーザーIDごとの場所（ログイン不要） ② ログイン中ならクラウドセーブにも（①が使えないときの予備）
  let saved = false;
  try { await fb.fsM.setDoc(fb.fsM.doc(fb.db, 'pushTokens', playerId), { token, updatedAt: fb.fsM.serverTimestamp() }); saved = true; }
  catch (e) { console.warn('pushTokens write failed', e); }
  if (cloud.user) {
    try { await fb.fsM.setDoc(docRef(), { fcmToken: token, fcmUpdated: fb.fsM.serverTimestamp() }, { merge: true }); saved = true; }
    catch (e) { console.warn('save fcmToken failed', e); }
  }
  if (!saved) throw new Error('通知の準備がまだできていません（運営の設定待ち）。少し時間をおいてお試しください');
  return token;
}

export async function disablePush(playerId) {
  if (!fb) return;
  try {
    const msgM = await import(`${FIREBASE_SDK}/firebase-messaging.js`);
    const messaging = msgM.getMessaging(fb.app);
    await msgM.deleteToken(messaging).catch(() => {});
  } catch {}
  if (playerId) await fb.fsM.deleteDoc(fb.fsM.doc(fb.db, 'pushTokens', playerId)).catch(() => {});
  if (cloud.user) await fb.fsM.setDoc(docRef(), { fcmToken: fb.fsM.deleteField() }, { merge: true }).catch(() => {});
}
