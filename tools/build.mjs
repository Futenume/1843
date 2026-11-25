// index.html と css/js をひとつの HTML（dist/tsuzuri.html）にまとめる。依存パッケージなし。
//   node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'index.html'), 'utf8');

// ───── サービスワーカー（sw.js）：index.html が読み込むファイルを保存する一覧と、版（中身のハッシュ）を作る ─────
{
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)">/g)].map((m) => m[1]);
  const icons = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
  const files = ['index.html', 'manifest.webmanifest', ...styles, ...scripts, ...icons];
  const h = createHash('sha256');
  files.forEach((f) => h.update(readFileSync(join(root, f))));
  const version = h.digest('hex').slice(0, 12);
  const list = ['./', ...files.map((f) => './' + f)];
  const sw = readFileSync(join(root, 'tools', 'sw.template.js'), 'utf8')
    .replace('__VERSION__', version)
    .replace('__FILES__', JSON.stringify(list, null, 2));
  writeFileSync(join(root, 'sw.js'), sw);
  console.log(`sw.js を作成しました（版 ${version}、${list.length} ファイル）`);
}

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
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '');

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'tsuzuri.html');
writeFileSync(out, html);
console.log(`dist/tsuzuri.html を作成しました（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB）`);
