// ===== ここだけ書き換えればクラウド機能が有効になります =====

// Firebaseコンソール →「プロジェクトの設定」→「マイアプリ」に表示される firebaseConfig を貼り付け
// 未設定（null）のままでも、端末内セーブとJSONバックアップでゲームは遊べます。
// （apiKey はブラウザに公開される前提の値です。データはFirestoreのセキュリティルールで守ります）
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAWcB8THU8xQw_BjUjZOFI34CGYWAKfRiI',
  authDomain: 'neondot.firebaseapp.com',
  projectId: 'neondot',
  storageBucket: 'neondot.firebasestorage.app',
  messagingSenderId: '850588975884',
  appId: '1:850588975884:web:df1a72f852e7c953a3bf29',
};

// Cloud Messaging の「ウェブプッシュ証明書」の鍵ペア（プッシュ通知用）
export const VAPID_KEY = 'BFxqucbuPJE8bReaBzdNJ3hpZx2-ywvfp05O-pBKwpP1DeG7B2v2XbnlXILU28SR3vPWhTxUVA-GeZCRWLhB9Ho';

// GitHubリポジトリ（更新履歴エディタの「GitHubで開く」ボタン用）
export const GITHUB_REPO = 'Rakko0516/neon-dot-survivors';
export const GITHUB_BRANCH = 'main';

// ゲームの公開URL（引っ越し機能で使う）
// MOVED_TO にURLを入れると、それ以外の住所で開いた人に「引っ越しました」と案内し、
// セーブデータごと新しいURLへ移動できるボタンを出します。空なら何もしません。
export const MOVED_TO = 'https://dot-rush.pages.dev/';

// Firebase SDK の読み込み元
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
