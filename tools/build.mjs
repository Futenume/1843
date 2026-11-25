// index.html と css/js をひとつの HTML（dist/tsuzuri.html）にまとめる。依存パッケージなし。
//   node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) => {
  const css = readFileSync(join(root, href), 'utf8');
  return `<style>\n${css}\n</style>`;
});

html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) => {
  const js = readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>\n// ${src}\n${js}\n</script>`;
});

// 1ファイル版はスクリプトが埋め込みになるので、CSP は「この中身のスクリプトだけ」を許可する（sha256 のハッシュ）
const hashes = [];
html.replace(/<script>([\s\S]*?)<\/script>/g, (_, js) => { hashes.push(`'sha256-${createHash('sha256').update(js, 'utf8').digest('base64')}'`); return _; });
html = html.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*script-src )'self'/, `$1'self' ${hashes.join(' ')}`);
// サービスワーカーと manifest は1ファイル版では使わない（file:// では動かないため）
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'tsuzuri.html');
writeFileSync(out, html);
console.log(`dist/tsuzuri.html を作成しました（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB）`);
