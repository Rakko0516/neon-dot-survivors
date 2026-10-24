// 運営が用意するデータ（シークレットコード・個別プレゼント）を Firestore から読む。
// ・ログインしていなくても読めるよう、SDKを使わず REST で「1件だけ取得（get）」する
// ・Firestore のルールで「一覧（list）」と「書き込み」は禁止。コードやユーザーIDを知らない人は中身を探せない
// ・書き込みは運営だけ（GitHub Actions の「運営ツール」がサービスアカウントで行う）
import { FIREBASE_CONFIG } from './config.js';

const BASE = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

/** Firestore の値（{integerValue:"3"} など）を普通の値に */
function val(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return String(v.stringValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue) || 0;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).slice(0, 200).map(val);
  return null;
}
function fields(f) {
  const o = {};
  for (const [k, v] of Object.entries(f || {})) if (/^[A-Za-z0-9_]{1,40}$/.test(k)) o[k] = val(v);
  return o;
}

/**
 * 1件読む。{ ok:true, data } / { ok:false, reason:'notfound'|'offline'|'denied'|'error' }
 * @param {string} path 例 'codes/ABC123'
 */
export async function getDoc(path) {
  if (!FIREBASE_CONFIG?.projectId) return { ok: false, reason: 'error' };
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  const url = `${BASE()}/${path.split('/').map(encodeURIComponent).join('/')}?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`;
  let res;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    res = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
    clearTimeout(t);
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 404) return { ok: false, reason: 'notfound' };
  if (res.status === 403) return { ok: false, reason: 'denied' };
  if (!res.ok) return { ok: false, reason: 'error' };
  try {
    const j = await res.json();
    return { ok: true, data: fields(j.fields || {}) };
  } catch { return { ok: false, reason: 'error' }; }
}

/** 入力されたコードを決まった形に（大文字・英数字と - _ だけ） */
export const normCode = (s) => String(s || '').normalize('NFKC').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
