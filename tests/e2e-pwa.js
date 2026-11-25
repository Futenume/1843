// アプリ（PWA）として入れられるか・オフラインで使えるかの確認（任意）。Playwright が必要です。
//   node tools/build.mjs のあとで python3 -m http.server 8765 &   （リポジトリ直下で）
//   node tests/e2e-pwa.js
const { chromium } = require('playwright');
function ok(c, m) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) process.exitCode = 1; }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8765/index.html');
  await page.waitForTimeout(500);
  const man = await page.evaluate(async () => { const r = await fetch('manifest.webmanifest'); return r.ok ? r.json() : null; });
  ok(man && man.display === 'standalone' && man.icons.length === 3, 'manifest を読める');
  const icons = await page.evaluate(async (list) => Promise.all(list.map(async (i) => (await fetch(i.src)).status)), man.icons);
  ok(icons.every((s) => s === 200), 'アイコンがある');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); await page.waitForTimeout(1500); }
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'サービスワーカーが動いている');
  const cdp = await ctx.newCDPSession(page);
  const inst = await cdp.send('Page.getInstallabilityErrors').catch((e) => ({ err: e.message }));
  ok(inst.installabilityErrors && inst.installabilityErrors.length === 0, 'アプリとして入れられる条件を満たす ' + JSON.stringify(inst.installabilityErrors || inst));
  // 作品を作ってからオフラインで開き直す
  await page.getByRole('button', { name: 'サンプル作品を開く' }).click();
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForTimeout(2000);
  ok(await page.locator('.editor-input').count() === 1, 'オフラインでも開ける（作品も残っている）');
  ok((await page.locator('.editor-input').inputValue()).includes('王都'), 'オフラインでも本文を読める');
  await page.locator('.nav-item[data-route="map"]').click();
  await page.waitForTimeout(2000);
  ok(await page.locator('canvas.map-canvas').count() === 1, 'オフラインでも地図を開ける');
  await ctx.setOffline(false);
  const v = await page.evaluate(() => window.__csp);
  ok(v.length === 0, 'CSP の違反なし ' + v.join(' | '));
  ok(errs.length === 0, 'エラーなし ' + errs.join(' | '));
  await browser.close();
})();
