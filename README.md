# ネオンドット・サバイバーズ

ドット絵のサバイバー討伐ゲーム（ブラウザ完結・PWA）。6種類のステージを5部屋ずつ進み、5部屋目でボスと戦う。
サーバー代0円で運営できる構成：GitHub Pages（配信）＋ Firebase Spark（ログイン・クラウドセーブ）＋ GitHub Actions（プッシュ通知送信）。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` / `css/style.css` | 画面 |
| `js/main.js` | 画面・育成・戦闘の流れ（タブ、モーダル、報酬計算） |
| `js/game.js` | 戦闘エンジン（5部屋の進行、敵出現、武器、レベルアップ3択、ボス） |
| `js/stage.js` | ステージのマップ生成（部屋レイアウト・岩・トゲ・水場・ゲート）と当たり判定、背景の描き込み |
| `js/data.js` | **キャラ8人・スキル・全身8枠の装備・6バイオームの定義**（追加はここ） |
| `js/art.js` | ドット絵エンジン（平坦な色のマスクに自動で輪郭・陰影を付ける。キャラはパーツ合成） |
| `dev/art-preview.html` | 全ドット絵素材の一覧（見た目の確認用。ゲームからはリンクしていない） |
| `js/audio.js` | 効果音・BGM（WebAudioで合成） |
| `js/save.js` | 端末内オートセーブ、JSON書き出し/読み込み、**マイグレーション** |
| `js/cloud.js` | Firebaseログイン、自動クラウドバックアップ、競合時の選択、通知トークン登録 |
| `js/pwa.js` | Service Worker登録、更新検知、更新履歴の取得 |
| `js/config.js` | **Firebase設定・VAPIDキー・GitHubリポジトリ名**（ここだけ書き換える） |
| `js/version.js` | アプリのバージョンとセーブ形式のバージョン |
| `sw.js` | オフライン対応、更新配信、プッシュ通知の表示 |
| `changelog.json` | ゲーム内の更新履歴・お知らせ |
| `editor.html` | 更新履歴エディタ（ゲームからはリンクしていない管理用ページ） |
| `tools/bump-version.mjs` | バージョンを上げて更新履歴に追記 |
| `tools/send-push.mjs` + `.github/workflows/notify.yml` | 更新履歴に通知ありの項目が増えたら全員へプッシュ通知 |

## アップデートの出し方

```bash
node tools/bump-version.mjs 0.2.0 "タイトル" "変更点1" "変更点2" --notify
git add -A && git commit -m "v0.2.0" && git push
```

- `js/version.js` と `sw.js` の VERSION が変わる → 開いているプレイヤーに「アップデートがあります」ポップアップ
- `changelog.json` に追記 → ゲーム内の更新履歴に表示
- `--notify` を付けると GitHub Actions がプッシュ通知を送信（Secret設定済みの場合）
- 新しいJSファイルなどを追加したら `sw.js` の `ASSETS` にも追加する（スクリプトが存在チェックする）

お知らせだけ出したい場合は `editor.html` で書いて `changelog.json` を差し替える（バージョンは上げなくてよい）。

## セーブ形式を変えるとき

1. `js/version.js` の `SCHEMA_VERSION` を +1
2. `js/save.js` の `MIGRATIONS` に変換処理を追加（例：`2: (d) => { d.stamina = 30; return d; }`）
3. 古い変換処理は消さない（何年前のセーブでも順番に変換されて読み込める）

新しい項目を `defaultData()` に足すだけなら、読み込み時に自動で補完されるのでマイグレーション不要。

## 初期設定（1回だけ）

1. GitHubにリポジトリを作り、このフォルダの中身を置く
2. Settings → Pages → Source「Deploy from a branch」→ `main` / `(root)`
3. Firebaseプロジェクト作成 → Webアプリ登録 → Authentication（Google）有効化 → Firestore作成
4. Firestoreのルール：
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /saves/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
5. Authentication → 設定 → 承認済みドメイン に `ユーザー名.github.io` を追加
6. `js/config.js` に `FIREBASE_CONFIG`・`VAPID_KEY`・`GITHUB_REPO` を記入
7. （プッシュ通知の自動送信を使う場合）Firebase → プロジェクトの設定 → サービスアカウント → 新しい秘密鍵を生成 → JSONの中身を GitHub の Settings → Secrets and variables → Actions に `FIREBASE_SERVICE_ACCOUNT` という名前で登録

## クラウドセーブの仕組み

- Firestore の `saves/{uid}` に1人1ドキュメント（セーブ全体をJSON文字列で保存）
- 自動バックアップ：3分ごと（変更があるときだけ）・アプリを閉じた時・ステージ終了時・更新前
- ログイン時に端末とクラウドを比較し、片方だけ進んでいれば自動で採用、両方進んでいればプレイヤーに選ばせる
- 上書き前の状態は端末に1つ保存され、「1つ前の状態に戻す」で復旧できる

## 動作確認

ローカルで `python3 -m http.server 8765` を実行し `http://localhost:8765/` を開く。
ブラウザのコンソールで `__nds.game`（戦闘中の状態）、`__nds.store.save`（セーブ）を確認できる。

## 追加のしかた（よく使うもの）

- **新キャラ**：`js/data.js` の `CHARACTERS` に1件追加。`look` で髪型（short/spiky/bob/twin/long/pony）・色・アクセサリー（visor/foxEars/catEars/horns/antenna/starClip/witchHat/headband/cap/wings）を組み合わせると見た目が自動で作られる
- **新スキル**：`SKILLS` に追加し、武器なら `js/game.js` の `fire()` に動きを書く
- **新装備**：`EQUIP` に追加（type は weapon/head/body/arms/feet/neck/ring）
- **新ステージ**：`BIOMES` に追加（床の色・岩の色・水場の種類・出てくる敵の色）
- **部屋の形**：`js/stage.js` の `LAYOUTS` に9列×20行の文字列を追加（. 床 / R 岩 / ^ トゲ / ~ 水場）

## 音（BGM・効果音）

- 音源の対応表：`audio/sources.json`（どの場面でどの曲・効果音を使うか、入手先URL）
- 追加・差し替えの手順：
  1. 元ファイル（mp3 / ogg / m4a / wav）を `audio/raw/` に置く（ダウンロードしたファイル名のままでOK）
  2. `node tools/pack-audio.mjs` を実行 → `audio/bgm/*.bin`・`audio/se/*.bin` が作られる
  3. `.bin` だけをコミットする（`audio/raw/` は `.gitignore` 済みで公開されない）
- OpenTracks（旧DOVA-SYNDROME）の規約「音源ファイルをそのまま取り出せる状態での利用は禁止」に合わせて、公開するのは変換済みファイルだけにしている
- 音源が無い場面は無音になるだけでエラーにはならない
- クレジット（設定画面に表示）：音楽：魔王魂（表記必須）／OpenTracks（任意）／効果音：効果音ラボ（任意）

## ガチャ・ミッション・ログインボーナス・プレゼント（js/meta.js）

- **通貨**：コイン（gold）とガチャチケット（tickets）。v0.3.0でクリスタルは廃止（100個→チケット1枚、端数×10コインに自動両替）
- **ガチャ**：`js/data.js` の `GACHAS`（値段・★ごとの確率）。キャラガチャは同じキャラが出ると「覚醒」（最大5、HP/ATK +8%ずつ）
- **ガチャ限定キャラ**：`CHARACTERS` に `gacha: true` と `unlock: { gacha: true }` を付ける
- **ミッション**：`js/meta.js` の `MISSIONS`（daily は毎日0時、weekly は毎週月曜0時に更新、perm は一度だけ）
  - 数える出来事：play / kill / boss / gacha / upgrade / login（`M.track('kill', 10)` のように呼ぶ）
- **ログインボーナス**：`LOGIN_CYCLE`（7日周期）。毎日0時以降の最初の起動で、報酬がプレゼントボックスに届く
- **運営からのプレゼント**：`gifts.json` に1件追加してpushするだけで、まだ受け取っていない全員のプレゼントボックスに届く
  ```json
  { "id": "sorry-2026-11-01", "title": "お詫び", "reward": { "ticket": 5 }, "from": "2026-11-01", "until": "2026-11-30" }
  ```
  id は毎回ちがう文字にする（同じidは二度届かない）

## プロフィール・ランク（js/profile.js）

- ヘッダー左上のアイコンを押すと、ユーザー名・アイコン・アイコンフレームを変更できる
- アイコン：全キャラ（最初から使える）＋ランク報酬の特別アイコン（`SPECIAL_ICONS`）
- フレーム：`FRAMES`（見た目は css の `.fr-<id>`）。`rank` で解放ランクを指定
- ランク経験値はステージを遊ぶたびに入る（`battleRankExp`）。ランクアップ報酬は `rankReward()`（コイン・チケット・アイコン・フレーム）
