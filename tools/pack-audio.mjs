#!/usr/bin/env node
// 音源の変換ツール
// audio/raw/ に置いた元ファイル（ダウンロードしたまま）を、ゲーム専用の形式（.bin）に変換して
// audio/bgm/<名前>.bin と audio/se/<名前>.bin に出力します。対応表は audio/sources.json。
// ※OpenTracks の規約「音源ファイルをそのまま取り出せる状態での利用は禁止」に対応するため、
//   元の音声ファイルは公開せず、変換したものだけを公開します（audio/raw/ は .gitignore 済み）。
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(root, 'audio', 'raw');
const KEY = Buffer.from('NDS-audio-pack-2026');
const MAGIC = Buffer.from('NDSA');

const sources = JSON.parse(readFileSync(join(root, 'audio', 'sources.json'), 'utf8'));
if (!existsSync(RAW)) mkdirSync(RAW, { recursive: true });
const rawFiles = readdirSync(RAW).filter((f) => !f.startsWith('.'));
const norm = (s) => s.normalize('NFC').toLowerCase();
const stem = (s) => norm(s).replace(/\.(mp3|ogg|m4a|wav)$/, '');

// 拡張子は問わない（mp3 / ogg / m4a / wav のどれでもOK）
function findRaw(pattern) {
  if (!pattern.includes('*')) return rawFiles.find((f) => stem(f) === stem(pattern));
  const parts = norm(pattern).split('*').filter(Boolean);
  return rawFiles.find((f) => parts.every((p) => norm(f).includes(p)));
}

// BGMと効果音で同じ元ファイル名を指定すると、片方がもう片方の音になってしまうので止める
{
  const seen = new Map();
  for (const kind of ['bgm', 'se']) for (const [name, s] of Object.entries(sources[kind])) {
    const k = stem(s.file);
    if (seen.has(k)) { console.error(`元ファイル名が重複しています: ${seen.get(k)} と ${kind}/${name}（${s.file}）`); process.exit(1); }
    seen.set(k, `${kind}/${name}`);
  }
}

let ok = 0;
const missing = [];
for (const kind of ['bgm', 'se']) {
  const outDir = join(root, 'audio', kind);
  mkdirSync(outDir, { recursive: true });
  for (const [name, s] of Object.entries(sources[kind])) {
    const f = findRaw(s.file);
    if (!f) { missing.push(`${kind}/${name}  ←  ${s.file}`); continue; }
    const src = readFileSync(join(RAW, f));
    const out = Buffer.alloc(MAGIC.length + src.length);
    MAGIC.copy(out, 0);
    for (let i = 0; i < src.length; i++) out[MAGIC.length + i] = src[i] ^ KEY[i % KEY.length];
    writeFileSync(join(outDir, `${name}.bin`), out);
    // 中身の指紋（中身が変わったときだけ変わる）。ゲームはこれを付けて読み込むので、差し替えた音が古いキャッシュのまま鳴ることがない
    s.v = createHash('sha256').update(out).digest('hex').slice(0, 10);
    ok++;
  }
}
writeFileSync(join(root, 'audio', 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
console.log(`変換: ${ok} 個`);
if (missing.length) console.log('見つからない元ファイル:\n  ' + missing.join('\n  '));
