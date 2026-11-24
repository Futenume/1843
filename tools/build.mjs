// index.html と css/js をひとつの HTML（dist/tsuzuri.html）にまとめる。依存パッケージなし。
//   node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'tsuzuri.html');
writeFileSync(out, html);
console.log(`dist/tsuzuri.html を作成しました（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB）`);
