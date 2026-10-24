#!/usr/bin/env node
// バージョンを上げて更新履歴に追記するスクリプト
// 使い方:
//   node tools/bump-version.mjs 0.2.0 "タイトル" "項目1" "項目2" ... [--notify]
// やること:
//   - js/version.js と sw.js の VERSION を書き換え（→ プレイヤーに更新ポップアップが出る）
//   - changelog.json の先頭に項目を追加
//   - sw.js の ASSETS に載っているファイルが全部あるかチェック
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const notify = args.includes('--notify');
const rest = args.filter((a) => a !== '--notify');
const [version, title = '', ...items] = rest;

if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('使い方: node tools/bump-version.mjs 0.2.0 "タイトル" "項目1" "項目2" [--notify]');
  process.exit(1);
}

const p = (f) => join(root, f);

let v = readFileSync(p('js/version.js'), 'utf8');
v = v.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${version}'`);
writeFileSync(p('js/version.js'), v);

let sw = readFileSync(p('sw.js'), 'utf8');
sw = sw.replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`);
// オフライン用に保存するファイルの一覧を、フォルダの中身から自動で作り直す
// （js・css・画像・アイコンを増やしても、ここで自動的にオフライン対応になる。音は audio/sources.json から自動）
const list = (dir, re) => (existsSync(p(dir)) ? readdirSync(p(dir)).filter((f) => re.test(f)).sort().map((f) => `./${dir}/${f}`) : []);
const assetList = [
  './', './index.html', './manifest.webmanifest', './changelog.json',
  ...list('css', /\.css$/),
  ...list('js', /\.js$/).filter((f) => !f.endsWith('/editor.js')),
  ...list('icons', /\.(png|svg|webp)$/),
  ...list('img', /\.(png|jpg|jpeg|webp|svg|gif)$/),
  ...list('fonts', /\.(ttf|otf|woff2?)$/),
];
sw = sw.replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = [\n${assetList.map((a) => `  '${a}',`).join('\n')}\n];`);
writeFileSync(p('sw.js'), sw);

const log = JSON.parse(readFileSync(p('changelog.json'), 'utf8'));
const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
log.entries.unshift({ id: `${date}-${version}`, version, date, title, items, notify });
writeFileSync(p('changelog.json'), JSON.stringify(log, null, 2) + '\n');

// キャッシュ対象ファイルの存在チェック
const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
const missing = assets.filter((a) => !existsSync(p(a)));
if (missing.length) {
  console.error('⚠ sw.js の ASSETS に存在しないファイルがあります:', missing);
  process.exit(1);
}
console.log(`v${version} に更新しました（通知: ${notify ? 'あり' : 'なし'}）`);
