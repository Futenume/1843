// 画面に「null」「undefined」「NaN」などの表示崩れが出ていないかを、全画面を巡回して確かめる（任意）。
//   python3 -m http.server 8765 &   （リポジトリ直下で）
//   node tests/e2e-sweep.js
const { chromium, devices } = require('playwright');
const BAD = /\bnull\b|\bundefined\b|\bNaN\b|\[object Object\]/;
(async () => {
  const browser = await chromium.launch();
  const found = [];
  for (const [label, opts] of [['desk', { viewport: { width: 1360, height: 860 } }], ['phone', devices['iPhone 13']]]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com|wik(ipedia|tionary)\.org/, (r) => r.abort());
    await page.addInitScript(() => {
      const mock = { speak(u) { setTimeout(() => u.onend && u.onend({}), 3000); }, cancel() {}, pause() {}, resume() {}, getVoices() { return [{ name: 'Kyoko', lang: 'ja-JP' }]; } };
      Object.defineProperty(window, 'speechSynthesis', { value: mock, configurable: true });
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    });
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8765/index.html');
    const scan = async (where) => {
      const t = await page.evaluate(() => document.body.innerText);
      const m = t.split('\n').filter((l) => /\bnull\b|\bundefined\b|\bNaN\b|\[object Object\]/.test(l));
      if (m.length) found.push(`${label}/${where}: ${m.slice(0, 3).join(' ‖ ')}`);
    };
    await scan('home-empty');
    await page.getByRole('button', { name: 'サンプル作品を開く' }).click();
    await page.waitForTimeout(800);
    await scan('write');
    // 指摘をクリック → 問題バー
    if (label === 'desk') {
      for (const tab of ['proof', 'cons', 'ai', 'dict', 'ref', 'stats']) { await page.locator(`.panel-tabs .tab[data-tab="${tab}"]`).click(); await page.waitForTimeout(150); await scan('panel-' + tab); }
      const cards = page.locator('.issue-card');
      await page.locator('.panel-tabs .tab[data-tab="proof"]').click();
      const n = await cards.count();
      for (let i = 0; i < Math.min(n, 12); i++) { await cards.nth(i).click(); await page.waitForTimeout(80); await scan('issuebar-' + i); }
    } else {
      const mk = page.locator('.editor-backdrop mark').first();
      const box = await mk.boundingBox();
      if (box) { await page.mouse.click(box.x + 3, box.y + box.height / 2); await page.waitForTimeout(150); await scan('issuebar-phone'); }
    }
    await page.locator('button[title^="読み上げ"]').click(); await page.waitForTimeout(150); await scan('speak');
    await page.getByRole('button', { name: '止める' }).click();
    await page.evaluate(() => Tsuzuri.Preview.open({})); await page.waitForTimeout(300); await scan('preview');
    await page.keyboard.press('Escape');
    await page.evaluate(() => Tsuzuri.PublishDialog.open({})); await page.waitForTimeout(200); await scan('publish');
    await page.keyboard.press('Escape');
    await page.evaluate(() => Tsuzuri.Dict.openModal('黄昏')); await page.waitForTimeout(400); await scan('dict-modal');
    await page.keyboard.press('Escape');
    // 新しい画面：書き出し・取り込み・原稿用紙・版の比較・名前
    const wide = async (where) => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('.modal')].some((m) => m.scrollWidth > m.clientWidth + 1));
      if (over) found.push(`${label}/${where}: 横にはみ出しています`);
    };
    for (const [name, fn] of [
      ['epub', () => Tsuzuri.PublishDialog.openEpub({})],
      ['docx', () => Tsuzuri.PublishDialog.openDocx({})],
      ['genko', () => Tsuzuri.Manuscript.open()],
      ['import', () => Tsuzuri.ImportDialog.open()],
    ]) {
      await page.evaluate(fn); await page.waitForTimeout(400); await scan(name); await wide(name);
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    }
    // 縦書き・集中モード
    await page.locator('button[title^="縦書きで書く"]').click(); await page.waitForTimeout(300); await scan('vertical'); await wide('vertical');
    await page.locator('button[title^="縦書きで書く"]').click(); await page.waitForTimeout(200);
    await page.locator('button[title^="集中モード（本文"]').click(); await page.waitForTimeout(300); await scan('focus'); await wide('focus');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // 版の保存と比較
    await page.evaluate(() => { const c = Tsuzuri.App.project.chapters[0]; c.snapshots.unshift({ at: Date.now() - 1000, body: c.body.slice(0, 100), label: '古い版', chars: 50 }); });
    await page.locator('button[title="版の保存と履歴"]').click(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: '今と比べる' }).first().click(); await page.waitForTimeout(300); await scan('diff'); await wide('diff');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    for (const r of ['lore', 'ideas', 'plot', 'map']) {
      await page.evaluate((x) => Tsuzuri.App.navigate(x), r); await page.waitForTimeout(r === 'map' ? 1500 : 300); await scan(r);
    }
    // 地図：距離を測る・国に分ける
    await page.evaluate(() => { document.querySelector('.map-tool[data-tool="measure"]').click(); });
    await page.waitForTimeout(200);
    const cv = await page.locator('.map-canvas').boundingBox();
    for (const [fx, fy] of [[0.35, 0.45], [0.55, 0.5], [0.6, 0.6]]) { await page.mouse.click(cv.x + cv.width * fx, cv.y + cv.height * fy); await page.waitForTimeout(100); }
    await page.keyboard.press('Enter'); await page.waitForTimeout(200); await scan('map-measure'); await wide('map-measure');
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '国に分ける'); if (b) b.click(); });
    await page.waitForTimeout(600); await scan('map-countries'); await wide('map-countries');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.evaluate(() => Tsuzuri.App.navigate('lore')); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '名前を考える' }).first().click(); await page.waitForTimeout(300); await scan('names'); await wide('names');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    // 設定資料：各タブと人物
    await page.evaluate(() => Tsuzuri.App.navigate('lore'));
    await page.waitForTimeout(300);
    const tabs = page.locator('.lore-tabs button, .lore-side [role=tab], .lore-side .tab');
    const tn = await tabs.count();
    for (let i = 0; i < tn; i++) { await tabs.nth(i).click().catch(() => {}); await page.waitForTimeout(150); await scan('lore-tab-' + i); }
    // 相関図のノード
    await page.locator('button, a, [role=tab]', { hasText: '相関図' }).first().click();
    await page.waitForTimeout(400);
    const nodes = page.locator('.relmap-node');
    for (let i = 0; i < await nodes.count(); i++) { await nodes.nth(i).click({ force: true }).catch(() => {}); await page.waitForTimeout(100); await scan('relmap-node-' + i); }
    // 地図：素材を選ぶ
    await page.evaluate(() => Tsuzuri.App.navigate('map'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => Tsuzuri.App.navigate('home')); await page.waitForTimeout(300); await scan('home');
    // 設定
    await page.locator('.nav-item', { hasText: '設定' }).last().click().catch(() => {});
    await page.waitForTimeout(300);
    const st = page.locator('.modal .tabs button, .settings .tabs button');
    for (let i = 0; i < await st.count(); i++) { await st.nth(i).click().catch(() => {}); await page.waitForTimeout(120); await scan('settings-' + i); }
    if (errs.length) found.push(label + ' errors: ' + errs.join(' | '));
    await ctx.close();
  }
  console.log(found.length ? found.join('\n') : 'OK: null/undefined/NaN なし');
  if (found.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
