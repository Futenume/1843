// セキュリティの確認（任意）。Playwright が必要です。
//   python3 -m http.server 8765 &   （リポジトリ直下で） と  node tools/build.mjs のあとに
//   node tests/e2e-security.js
// ・CSP（コンテンツ セキュリティ ポリシー）の違反が出ないこと（通常版・1ファイル版）
// ・ネット辞書の返答に危ない URL や HTML が混じっても、使わない・実行しないこと
// ・細工したバックアップを読み込んでも、HTML が実行されず、__proto__ などで仕組みを書き換えられないこと
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/index.html';
const DIST = 'file://' + path.join(__dirname, '..', 'dist', 'tsuzuri.html');
function ok(c, m) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) process.exitCode = 1; }
const FAKE = fs.readFileSync(path.join(__dirname, 'e2e-ai-mock.js'), 'utf8').match(/const FAKE = `([\s\S]*?)`;/)[1];
const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const evil = JSON.parse(JSON.stringify({ app: 'tsuzuri', version: 1, project: {
  id: 'p"><svg onload=alert(1)>', title: X + '作品', chapters: [{ id: 'c1', title: X, body: '本文 ' + X + ' |漢字《' + X + '》', snapshots: 'x', ignored: 5 }, 42, null],
  entries: [{ id: 'e1', type: 'character', name: X, aliases: [X, 3], color: 'red;background:url(https://evil.example/leak)', fields: { role: X, age: 17 }, relations: [{ targetId: 'e1', calls: X }], custom: [{ k: X, v: X }] }, 'bad'],
  ideas: [{ id: 'i1', body: X, kind: '読み方', word: X, reading: X, tags: [X], color: 'url(javascript:alert(1))' }],
  rules: { ng: [{ word: X, reason: X, suggestion: X, scope: 'evil' }, 'x'], style: 'nope', world: X, narrator: '<b>' },
  timeline: [{ when: X, title: X, desc: X }],
  plot: { columns: [{ id: 'col1', title: X }], cards: [{ id: 'k1', columnId: 'col1', title: X, body: X, color: 'expression(alert(1))' }] },
  maps: 'not-an-array', goal: { daily: 'abc', total: -5 }, log: [1, 2],
} }));
// __proto__ は JSON の文字列として直接入れる
const text = JSON.stringify(evil).replace('"app":"tsuzuri"', '"app":"tsuzuri","__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}}').replace('"title":', '"__proto__":{"isAdmin":true},"title":');
const evilPath = path.join(os.tmpdir(), 'tsuzuri-evil-' + process.pid + '.tsuzuri.json');
fs.writeFileSync(evilPath, text);

(async () => {
  console.log('CSP とネット辞書');
  const browser = await chromium.launch();
  for (const url of [BASE, DIST]) {
    console.log(url.startsWith('file') ? '1ファイル版' : '通常版');
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, serviceWorkers: 'block' });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sourceFile || '') + ':' + e.lineNumber)); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route(/cdn\.jsdelivr\.net\/npm\/@anthropic-ai\/sdk@1\.7\.0\/\+esm|\/js\/vendor\/anthropic-sdk\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE }));
    await page.route(/ja\.wikipedia\.org\/w\/api\.php/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ query: { search: [{ title: '黄昏' }] } }) }));
    await page.route(/ja\.wikipedia\.org\/api\/rest_v1/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ title: '黄昏', extract: 'テスト', content_urls: { desktop: { page: 'javascript:alert(1)' } }, thumbnail: { source: 'https://evil.example/x.png' } }) }));
    await page.route(/ja\.wiktionary\.org/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ parse: { title: '黄昏', text: { '*': '<div class="mw-parser-output"><h2>日本語</h2><ol><li>夕方<img src=x onerror="window.__xss=1"></li></ol></div>' } } }) }));
    await page.goto(url);
    await page.evaluate(() => localStorage.setItem('tsuzuri.apiKey', 'sk-ant-test'));
    await page.getByRole('button', { name: 'サンプル作品を開く' }).click();
    await page.waitForTimeout(700);
    for (const r of ['lore', 'ideas', 'plot', 'map', 'write']) { await page.evaluate((x) => Tsuzuri.App.navigate(x), r); await page.waitForTimeout(r === 'map' ? 1500 : 300); }
    await page.evaluate(() => Tsuzuri.Preview.open({})); await page.waitForTimeout(300); await page.keyboard.press('Escape');
    // 辞書（悪意あるネットの返答）
    await page.locator('.panel-tabs .tab[data-tab="dict"]').click();
    await page.locator('.dict-search input').fill('黄昏');
    await page.locator('.dict-search button').click();
    await page.waitForTimeout(800);
    const links = await page.$$eval('.dict-net a', (as) => as.map((a) => a.getAttribute('href')));
    ok(links.every((h) => /^https:\/\/ja\.(wikipedia|wiktionary)\.org\//.test(h || '')), 'ネット辞書のリンクは https の決まった場所だけ（javascript: を付けない）');
    ok(await page.locator('.dict-net img').count() === 0, '決まった場所以外の画像は読み込まない');
    ok(!(await page.evaluate(() => window.__xss)), 'ウィクショナリーの HTML 内のスクリプトは動かない');
    // AI
    await page.locator('.panel-tabs .tab[data-tab="ai"]').click();
    await page.getByRole('button', { name: 'AIで添削' }).click();
    await page.waitForTimeout(800);
    ok(await page.locator('.ai-card').count() >= 1, 'CSP の下でも AI（SDK の読み込み）が動く');
    const v = await page.evaluate(() => window.__csp);
    ok(v.length === 0, 'CSP の違反なし ' + v.slice(0, 5).join(' | '));
    ok(errs.length === 0, 'エラーなし ' + errs.join(' | '));
    await page.close();
  }

  console.log('細工したバックアップの読み込み');
  {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, serviceWorkers: 'block' });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { errs.push('dialog ' + d.message()); d.dismiss(); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|wik(ipedia|tionary)\.org/, (r) => r.abort());
  await page.goto(BASE);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'バックアップから読み込む' }).first().click()]);
  await chooser.setFiles(evilPath);
  await page.waitForTimeout(1200);
  for (const r of ['write', 'lore', 'ideas', 'plot', 'map']) { await page.evaluate((x) => Tsuzuri.App.navigate(x), r); await page.waitForTimeout(400); }
  await page.evaluate(() => Tsuzuri.App.navigate('lore'));
  await page.locator('.lore-tab', { hasText: '相関図' }).click().catch(() => {});
  await page.waitForTimeout(400);
  await page.locator('.lore-tab', { hasText: '世界観' }).click().catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => Tsuzuri.App.navigate('write'));
  await page.waitForTimeout(300);
  await page.evaluate(() => Tsuzuri.Preview.open({}));
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.evaluate(() => Tsuzuri.App.navigate('home'));
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ xss: window.__xss || 0, polluted: ({}).polluted || ({}).polluted2 || ({}).isAdmin || null, title: Tsuzuri.App.project && Tsuzuri.App.project.title, id: Tsuzuri.App.project && Tsuzuri.App.project.id, color: Tsuzuri.App.project && Tsuzuri.App.project.entries[0].color }));
  console.log('  ', JSON.stringify(r));
  ok(r.xss === 0, '作品データの中の HTML は実行されない');
  ok(!r.polluted, '__proto__ などでオブジェクトの仕組みを書き換えられない');
  ok(/^[A-Za-z0-9_-]+$/.test(r.id || ''), '不正な ID は作り直す');
  ok(r.color === '', '色の欄の CSS インジェクションは捨てる');
  ok(errs.length === 0, '読み込み・表示でエラーなし ' + errs.join(' | '));
  }
  console.log('公開しているサイトとしての守り');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, serviceWorkers: 'block' });
    const errs = [];
    const external = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('request', (r) => { const u = r.url(); if (r.resourceType() === 'script' && !u.startsWith(BASE.replace(/index\.html$/, '')) && !u.startsWith('blob:')) external.push(u); });
    await page.route(/fonts\.(googleapis|gstatic)\.com|wik(ipedia|tionary)\.org/, (r) => r.abort());
    // 本物の AI ライブラリ（同梱した版）で、API の返事だけを用意して相談を通す
    let apiCalls = 0;
    await page.route(/api\.anthropic\.com\/v1\/messages/, (r) => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      apiCalls++;
      const ev = (t, d) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`;
      const body = ev('message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }) +
        ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
        ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '同梱したライブラリで届いた回答です。' } }) +
        ev('content_block_stop', { type: 'content_block_stop', index: 0 }) +
        ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 12 } }) +
        ev('message_stop', { type: 'message_stop' });
      return r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/event-stream' }, cors), body });
    });
    const csp = [];
    await page.exposeFunction('__csp2', (v) => csp.push(v));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__csp2(e.violatedDirective + ' ' + e.blockedURI)));
    await page.goto(BASE);
    const policy = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
    ok(/script-src 'self';/.test(policy) && !/jsdelivr/.test(policy), '公開版はアプリ自身のスクリプトだけを許可する（外部のサイトのスクリプトは読み込めない）');
    await page.evaluate(() => localStorage.setItem('tsuzuri.apiKey', 'sk-ant-test'));
    await page.getByRole('button', { name: 'サンプル作品を開く' }).click();
    await page.waitForTimeout(600);
    await page.locator('.panel-tabs .tab[data-tab="ai"]').click();
    await page.locator('.ai-panel textarea').fill('テスト');
    await page.getByRole('button', { name: '相談する' }).click();
    await page.waitForSelector('.ai-answer', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    const answer = await page.locator('.ai-answer').textContent().catch(() => '');
    ok(apiCalls === 1 && answer.includes('同梱したライブラリで届いた回答です'), 'AI はアプリに同梱した公式ライブラリで動く（' + apiCalls + '回）');
    ok(external.length === 0, '外部のサイトからスクリプトを読み込まない ' + external.join(' '));
    ok(csp.length === 0, 'CSP の違反なし ' + csp.join(' | '));
    ok(errs.length === 0, 'エラーなし ' + errs.join(' | '));
    // ほかのサイトに埋め込まれたとき（テスト用のブラウザでは、ローカルのサーバーを別のサイトから埋め込めるよう Chrome の制限を外す）
    const b2 = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks'] });
    const fp = await b2.newPage({ serviceWorkers: 'block' });
    await fp.route('http://localhost:9/frame.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><iframe id="f" src="${BASE}" style="width:800px;height:600px"></iframe>` }));
    await fp.goto('http://localhost:9/frame.html');
    await fp.waitForTimeout(2000);
    const fr = fp.mainFrame().childFrames()[0];
    const framed = fr ? await fr.evaluate(() => ({ warn: !!document.querySelector('.framed-warning'), app: !!document.getElementById('app') })).catch(() => null) : null;
    await b2.close();
    ok(framed && framed.warn && !framed.app, 'ほかのサイトの中（iframe）では作品を開かず、注意を出す');
    await page.close();
  }

  console.log('細工したテキストの取り込み');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, serviceWorkers: 'block' });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('dialog', (d) => { errs.push('dialog ' + d.message()); d.dismiss(); });
    await page.route(/fonts\.(googleapis|gstatic)\.com|wik(ipedia|tionary)\.org/, (r) => r.abort());
    await page.goto(BASE);
    const txtPath = path.join(require('os').tmpdir(), 'tsuzuri-evil.txt');
    fs.writeFileSync(txtPath, X + '\n\n# ' + X + '題\n' + X + '本文《《' + X + '》》[[rb:' + X + ' > よみ]]\n第二話 <script>window.__xss=9</script>\n' + '漢'.repeat(60000) + '《ルビ》\n' + '［＃'.repeat(30000));
    await page.getByRole('button', { name: 'テキストを取り込む' }).click();
    await page.locator('.modal input[type=file]').setInputFiles(txtPath);
    await page.waitForTimeout(800);
    const t0 = Date.now();
    await page.locator('.modal').getByRole('button', { name: '取り込む' }).click();
    await page.waitForTimeout(1500);
    ok(Date.now() - t0 < 8000, '細工した長い行があっても固まらない（' + (Date.now() - t0) + 'ms）');
    await page.evaluate(() => Tsuzuri.Preview.open({}));
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.evaluate(() => Tsuzuri.Manuscript.open());
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const c = Tsuzuri.App.project.chapters[0]; c.snapshots.unshift({ at: Date.now(), body: '古い', label: '<img src=x onerror="window.__xss=7">', chars: 2 }); });
    await page.locator('button[title="版の保存と履歴"]').click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: '今と比べる' }).first().click();
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ xss: window.__xss || 0, chapters: Tsuzuri.App.project.chapters.length, imgs: document.querySelectorAll('#app img[src="x"], .modal img[src="x"], .pv-overlay img').length }));
    console.log('  ', JSON.stringify(r));
    ok(r.xss === 0 && r.imgs === 0, '取り込んだ原稿の HTML・スクリプトは、一覧・プレビュー・原稿用紙・版の比較で実行されない');
    ok(r.chapters >= 2, '見出しで話に分けて取り込める');
    // EPUB の中身もエスケープされている
    const epub = await page.evaluate(() => new TextDecoder().decode(Tsuzuri.Epub.build(Tsuzuri.App.project, {}).data));
    ok(!/<img src=x|<script>/.test(epub), 'EPUB の中の HTML はエスケープされる');
    ok(errs.length === 0, 'エラーなし ' + errs.join(' | '));
    try { fs.unlinkSync(txtPath); } catch (e) { /* 何もしない */ }
    await page.close();
  }

  await browser.close();
  try { fs.unlinkSync(evilPath); } catch (e) { /* 何もしない */ }
  console.log(process.exitCode ? '失敗あり' : 'すべて成功');
})();
