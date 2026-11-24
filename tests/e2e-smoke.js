// ブラウザでの動作確認（任意）。Playwright が必要です。
//   python3 -m http.server 8765 &   （リポジトリ直下で）
//   node tests/e2e-smoke.js [出力先ディレクトリ]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/index.html';
const OUT = process.argv[2] || path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error('確認失敗: ' + msg);
  console.log('  ✓ ' + msg);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|fonts/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/wik(ipedia|tionary)\.org/, (r) => r.abort()); // ネット辞書はテストでは使わない
  await page.goto(BASE);

  console.log('作品の作成');
  await page.getByRole('button', { name: 'サンプル作品を開く' }).click();
  await page.waitForSelector('.editor-input');
  await page.waitForTimeout(700);
  const proofCount = await page.locator('.panel-tabs [data-badge="proof"]').textContent();
  assert(+proofCount > 5, `サンプルの第一話で添削の指摘が出る（${proofCount}件）`);

  console.log('入力と添削');
  const ta = page.locator('.editor-input');
  await ta.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n　頭痛が痛いので、今日は来れない。');
  await page.waitForTimeout(800);
  const marks = await page.locator('.editor-backdrop mark').count();
  assert(marks > 5, 'ハイライトが表示される');
  const card = page.locator('.issue-card', { hasText: '頭痛が痛' }).first();
  assert(await card.count() === 1, '重言「頭痛が痛い」を検出');
  await card.getByRole('button', { name: /頭が痛/ }).click();
  await page.waitForTimeout(700);
  const body = await ta.inputValue();
  assert(body.includes('頭が痛いので') && !body.includes('頭痛が痛'), '提案を適用すると本文が直る');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert((await ta.inputValue()).includes('頭痛が痛'), 'Ctrl+Z で適用を取り消せる');

  console.log('設定チェック');
  await page.locator('.panel-tabs .tab[data-tab="cons"]').click();
  const consText = await page.locator('.panel-body').textContent();
  assert(consText.includes('一人称は設定では「僕」'), '一人称の食い違いを検出');
  assert(consText.includes('金色の髪'), '髪色の食い違いを検出');
  assert(consText.includes('メートル'), '世界観NGワードを検出');

  console.log('検索・置換');
  await page.keyboard.press('Control+f');
  await page.locator('.findbar input[type="search"]').fill('リオ');
  await page.waitForTimeout(200);
  const cnt = await page.locator('.find-count').textContent();
  assert(/\d+\/\d+/.test(cnt), `検索結果の件数が出る（${cnt}）`);
  await page.locator('.findbar button[title="閉じる"]').click();

  console.log('プレビュー・辞書・統計');
  await page.locator('.editor-toolbar button[title^="プレビュー"]').click();
  await page.waitForSelector('.pv-overlay .pv-content');
  assert(await page.locator('.pv-content ruby').count() > 0, '縦書きプレビューでルビが表示される');
  assert(/\d+ \/ \d+ ページ/.test(await page.locator('.pv-foot').textContent()), 'ページ数が表示される');
  await page.locator('.pv-seg-btn', { hasText: '横書き' }).click();
  assert(await page.locator('.pv-article p').count() > 3, '横書きプレビューに切り替えられる');
  await page.locator('.pv-seg-btn', { hasText: '縦書き' }).click();
  await page.keyboard.press('Escape');
  assert(await page.locator('.pv-overlay').count() === 0, 'Esc でプレビューを閉じる');
  await page.locator('.panel-tabs .tab[data-tab="dict"]').click();
  await page.locator('.dict-search input').fill('見る');
  await page.locator('.dict-search button').click();
  await page.waitForTimeout(300);
  assert((await page.locator('.panel-body').textContent()).includes('言い換え'), '辞書で言い換えを引ける');
  await page.locator('.dict-search input').fill('セレナ');
  await page.locator('.dict-search button').click();
  await page.waitForTimeout(300);
  assert((await page.locator('.panel-body').textContent()).includes('作品の中'), '辞書で作品内の設定を引ける');
  await page.locator('#top-actions button[title="書き出し・バックアップ"]').click();
  await page.getByText('投稿サイト用に書き出す（なろう・カクヨム・pixiv）').click();
  assert((await page.locator('.publish-out').inputValue()).includes('|星晶石《せいしょうせき》'), '投稿サイト用に書き出せる');
  await page.keyboard.press('Escape');
  await page.locator('.panel-tabs .tab[data-tab="cons"]').click();
  assert(await page.locator('.narrator-box').count() === 1, '設定チェックに語り手（視点）の設定が出る');
  await page.locator('.panel-tabs .tab[data-tab="stats"]').click();
  assert(await page.locator('.stat').count() >= 8, '統計が表示される');

  console.log('版の保存');
  await page.locator('button[title="版の保存と履歴"]').click();
  await page.getByRole('button', { name: '今の版を保存' }).click();
  await page.locator('.modal input').last().fill('テスト版');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert(await page.locator('.snapshot', { hasText: 'テスト版' }).count() === 1, '版を保存できる');
  await page.keyboard.press('Escape');

  console.log('設定資料');
  await page.locator('.nav-item[data-route="lore"]').click();
  await page.getByRole('button', { name: '追加' }).click();
  await page.locator('.entry-name-input').fill('アレン・ウォーカー');
  await page.waitForTimeout(100);
  assert(await page.locator('.entry-item', { hasText: 'アレン・ウォーカー' }).count() === 1, '人物を追加できる');
  await page.locator('.lore-tab', { hasText: '年表' }).click();
  assert(await page.evaluate(() => document.querySelector('.tl-fields').getBoundingClientRect().width) > 200, '年表の入力欄が表示される');

  console.log('アイデア・プロット');
  await page.locator('.nav-item[data-route="ideas"]').click();
  await page.locator('.quick-input').fill('新しいアイデアのテスト');
  await page.getByRole('button', { name: 'メモする' }).click();
  assert(await page.locator('.idea-card', { hasText: '新しいアイデアのテスト' }).count() === 1, 'アイデアをメモできる');
  await page.locator('.nav-item[data-route="plot"]').click();
  assert(await page.locator('.plot-card').count() >= 5, 'プロットカードが表示される');

  console.log('地図');
  await page.locator('.nav-item[data-route="map"]').click();
  await page.waitForSelector('.map-canvas');
  await page.waitForTimeout(500);
  const box = await page.locator('.map-canvas').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const mapCount = () => page.evaluate(() => { const m = Tsuzuri.App.project.maps[0]; return { stamps: m.stamps.length, lines: m.lines.length, labels: m.labels.length }; });
  const m0 = await mapCount();
  await page.locator('.map-tool[data-tool="relief"]').click();
  await page.mouse.move(cx - 80, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy, { steps: 10 });
  await page.mouse.up();
  assert(!(await page.locator('button[title^="元に戻す"]').isDisabled()), '起伏ブラシで描ける（元に戻すが有効）');
  await page.locator('.map-tool[data-tool="stamp"]').click();
  await page.locator('.chip', { hasText: '町・建物' }).click();
  await page.locator('.asset-btn', { hasText: '都市' }).click();
  await page.mouse.click(cx + 40, cy + 70);
  assert((await mapCount()).stamps === m0.stamps + 1, '素材（都市）を置ける');
  await page.locator('.map-tool[data-tool="select"]').click();
  await page.mouse.click(cx + 40, cy + 64);
  await page.locator('.map-inspector input[type="text"]').first().fill('テストの町');
  assert(await page.locator('.map-inspector').textContent().then((t) => t.includes('設定資料とつなぐ')), '素材を選んで名前を付けられる');
  await page.locator('.map-tool[data-tool="scatter"]').click();
  await page.mouse.move(cx - 160, cy + 120);
  await page.mouse.down();
  await page.mouse.move(cx - 60, cy + 140, { steps: 10 });
  await page.mouse.up();
  assert((await mapCount()).stamps > m0.stamps + 3, '散布ブラシで森を描ける');
  await page.locator('.map-tool[data-tool="path"]').click();
  await page.mouse.move(cx - 100, cy - 60);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx - 100 + i * 14, cy - 60 + i * 5);
  await page.mouse.up();
  assert((await mapCount()).lines === m0.lines + 1, 'フリーハンドで川を描ける');
  await page.locator('.map-tool[data-tool="label"]').click();
  await page.mouse.click(cx + 150, cy + 120);
  assert((await page.locator('.map-inspector h3').first().textContent()).includes('文字'), '文字を置ける');
  await page.getByRole('button', { name: '書き出し', exact: true }).click();
  await page.locator('.modal select').selectOption('1');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '書き出す' }).click()]);
  assert(/\.png$/.test(download.suggestedFilename()), 'PNG を書き出せる（' + download.suggestedFilename() + '）');
  await page.screenshot({ path: path.join(OUT, 'map-edited.png') });

  console.log('保存と再読み込み');
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForTimeout(800);
  await page.locator('.nav-item[data-route="map"]').click();
  await page.waitForTimeout(500);
  assert((await page.locator('.marker-list').textContent()).includes('テストの町'), '再読み込み後も地図の変更が残る');
  await page.locator('.nav-item[data-route="write"]').click();
  await page.waitForTimeout(300);
  assert((await page.locator('.editor-input').inputValue()).includes('今日は来れない'), '再読み込み後も本文が残る');

  console.log('スマートフォン表示');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await phone.newPage();
  await mp.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  mp.on('pageerror', (e) => errors.push('mobile: ' + e.message));
  await mp.goto(BASE);
  await mp.getByRole('button', { name: 'サンプル作品を開く' }).click();
  await mp.waitForTimeout(800);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'スマートフォン幅で横スクロールが出ない');
  await mp.screenshot({ path: path.join(OUT, 'mobile-write.png') });
  await mp.locator('.nav-item[data-route="lore"]').click();
  await mp.waitForTimeout(300);
  assert(await mp.locator('.entry-item').count() === 3 && await mp.locator('.lore-detail').isHidden(), 'スマートフォンの設定資料：一覧が全画面で出る');
  await mp.locator('.entry-item').nth(2).click();
  await mp.waitForTimeout(300);
  assert(await mp.locator('.entry-name-input').isVisible() && await mp.locator('.lore-list-pane').isHidden(), 'スマートフォンの設定資料：選ぶと詳細が全画面で開く');
  await mp.goBack();
  await mp.waitForTimeout(300);
  assert(await mp.locator('.entry-item').count() === 3, 'スマートフォンの設定資料：「戻る」で一覧へ');
  await mp.locator('.nav-item[data-route="map"]').click();
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: path.join(OUT, 'mobile-map.png') });
  await phone.close();

  assert(errors.length === 0, 'JavaScript エラーなし' + (errors.length ? '：' + errors.join(' / ') : ''));
  await browser.close();
  console.log('すべて成功');
})().catch((e) => { console.error(e); process.exit(1); });
