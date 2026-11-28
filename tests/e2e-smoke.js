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
  await page.locator('.lore-tab', { hasText: '出番表' }).click();
  assert(await page.locator('.cast-table tbody tr').count() === 4 && (await page.locator('.cast-warn').textContent()).includes('ガルド：第2話で死亡'), '出番表：人物ごとの登場と、死亡後の登場を表示');
  // 生物：大きさの設定（この世界の単位・たとえ）から図を描く
  await page.locator('.lore-tab', { hasText: '生物' }).click();
  await page.locator('.entry-item', { hasText: '星喰らいの黒竜' }).click();
  await page.waitForTimeout(300);
  assert(await page.locator('.cf-stage svg').count() === 1 && (await page.locator('.cf-stage').textContent()).includes('全長 38m'), '生物：「五十歩」（1歩＝0.75m）から全長38mの図を描く');
  await page.locator('.field', { hasText: '全長' }).locator('input').fill('旅客機ほど');
  await page.waitForTimeout(400);
  assert((await page.locator('.cf-stage').textContent()).includes('旅客機') && (await page.locator('.cf-stage').textContent()).includes('全長 40m'), '生物：「旅客機ほど」で全長40m、旅客機と並べて比べる');
  await page.locator('.cf-row .chip', { hasText: '骨格' }).click();
  await page.waitForTimeout(200);
  assert((await page.locator('.cf-stage').textContent()).includes('骨格'), '生物：骨格の図に切り替えられる');
  await page.screenshot({ path: path.join(OUT, 'creature.png') });
  const [dlc] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '画像で保存（PNG）' }).click()]);
  const pngHead = fs.readFileSync(await dlc.path()).slice(0, 4);
  assert(pngHead[0] === 0x89 && pngHead[1] === 0x50, '生物：図を PNG で保存できる');
  // 設定資料集（印刷用）：生物の図・人物・世界観ルール・年表が入る
  const book = await page.evaluate(() => {
    const root = Tsuzuri.Lore.bookRoot(Tsuzuri.App.project, { character: true, place: true, term: true, org: true, creature: true, rules: true, timeline: true, figures: true });
    return { sections: root.querySelectorAll('.book-section').length, entries: root.querySelectorAll('.book-entry').length, svgs: root.querySelectorAll('.book-figure svg').length, text: root.textContent.slice(0, 20000) };
  });
  assert(book.sections === 7 && book.entries === (await page.evaluate(() => Tsuzuri.App.project.entries.length)) && book.svgs === 2 && book.text.includes('通貨・物価'), `設定資料集：7章・全項目・生物の図2枚（${JSON.stringify({ s: book.sections, e: book.entries, f: book.svgs })}）`);
  await page.locator('.lore-tab', { hasText: '世界観' }).click();
  assert(await page.locator('.ng-card').count() === 1, '世界観ルール：NGワードが1語ずつ表示される');
  assert((await page.locator('.ng-card').nth(0).locator('input').nth(1).getAttribute('placeholder')) === '言い換え', '世界観ルール：空欄に紛らわしい見本を出さない');
  assert(await page.locator('.rules-nav .chip').count() >= 8, '世界観ルール：項目へ移るボタンがある');
  assert((await page.locator('#rules-currency .rule-summary').textContent()).includes('金貨1枚 ＝ 銀貨100枚'), '世界観ルール：通貨の換算が表示される');
  await page.getByRole('button', { name: '全話を調べる' }).last().click();
  await page.waitForTimeout(400);
  assert((await page.locator('.scan-out').textContent()).includes('約百三十歩'), '世界観ルール：全話を調べると「百メートル→約百三十歩」が見つかる');

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
  // 紋章：図柄と色を選べる
  await page.locator('.map-tool[data-tool="stamp"]').click();
  await page.locator('.chip', { hasText: '紋章・旗' }).click();
  await page.locator('.asset-btn', { hasText: '紋章（盾）' }).click();
  await page.mouse.click(cx - 120, cy - 110);
  await page.locator('.map-tool[data-tool="select"]').click();
  await page.mouse.click(cx - 120, cy - 118);
  await page.locator('.herald-opt[aria-label="王冠"]').click();
  await page.locator('.herald-colors .swatch').nth(1).click();
  const sh = await page.evaluate(() => Tsuzuri.App.project.maps[0].stamps.find((s) => s.a === 'shield'));
  assert(sh && sh.v === 8 && /^#[0-9a-f]{6}$/i.test(sh.tint || ''), '紋章の図柄と色を選べる（' + JSON.stringify(sh && { v: sh.v, tint: sh.tint }) + '）');
  // 設定資料の生物を、その姿のまま地図に置ける
  assert(await page.evaluate(() => Tsuzuri.App.project.maps[0].stamps.filter((s) => /^creature:/.test(s.a)).length) === 2, 'サンプルの地図に霧狼と黒竜が置いてある');
  await page.locator('.map-tool[data-tool="stamp"]').click();
  await page.locator('.chip', { hasText: '生物（設定資料）' }).click();
  await page.locator('.asset-btn', { hasText: '霧狼' }).click();
  await page.mouse.click(cx + 150, cy + 90);
  await page.locator('.map-tool[data-tool="select"]').click();
  // 姿の描いてある所を押す（脚のあいだなど透明な所はすり抜ける）
  for (const dy of [6, 10, 14, 18, 24]) {
    await page.mouse.click(cx + 150, cy + 90 - dy);
    if ((await page.locator('.map-inspector').textContent()).includes('設定資料を開く')) break;
  }
  assert((await page.locator('.map-inspector').textContent()).includes('設定資料を開く') && (await page.locator('.map-inspector').textContent()).includes('三歩ほど'), '生物の素材を置き、選ぶとその生物の設定が出る');
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
  await page.locator('.modal').getByLabel('大きさ', { exact: true }).selectOption('1');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '書き出す' }).click()]);
  assert(/\.png$/.test(download.suggestedFilename()), 'PNG を書き出せる（' + download.suggestedFilename() + '）');
  // JPEG（白い下地）でも書き出せる
  await page.getByRole('button', { name: '書き出し', exact: true }).click();
  await page.locator('.modal').getByLabel('大きさ', { exact: true }).selectOption('1');
  await page.locator('.modal').getByLabel('形式').selectOption('jpeg');
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '書き出す' }).click()]);
  assert(/\.jpe?g$/.test(dl2.suggestedFilename()), 'JPEG を書き出せる（' + dl2.suggestedFilename() + '）');
  await page.screenshot({ path: path.join(OUT, 'map-edited.png') });

  // 自動で作った国の地図：川・山脈・森の名前と、地名をまとめて設定資料に登録
  const genId = await page.evaluate(() => {
    const m = Tsuzuri.MapEngine.newMap('自動の地図', { preset: 'continent', size: 'm', seed: 2, land: 0.45, towns: true, names: true, countries: true });
    Tsuzuri.App.project.maps.push(m);
    return m.id;
  });
  await page.evaluate((id) => Tsuzuri.App.navigate('map', { id }), genId);
  await page.waitForTimeout(1500);
  const e0 = await page.evaluate(() => Tsuzuri.App.project.entries.length);
  await page.getByRole('button', { name: '地名をまとめて設定資料に登録' }).click();
  await page.locator('.modal').getByRole('button', { name: '登録する' }).click();
  await page.waitForTimeout(300);
  const reg = await page.evaluate((n0) => {
    const p = Tsuzuri.App.project;
    const added = p.entries.slice(n0);
    return { n: added.length, river: added.some((e) => e.fields.kind === '川'), range: added.some((e) => e.fields.kind === '山脈'), parented: added.filter((e) => e.fields.kind === '町' && e.fields.parent).length };
  }, e0);
  assert(reg.n >= 20 && reg.river && reg.range && reg.parented > 0, `地名をまとめて設定資料に登録（${JSON.stringify(reg)}）`);
  await page.evaluate(() => Tsuzuri.App.navigate('map', { id: Tsuzuri.App.project.maps[0].id }));
  await page.waitForTimeout(500);

  // Word（.docx）：応募書式で書き出せる
  await page.locator('button[title="書き出し・バックアップ"]').click();
  await page.getByText('Word（.docx）で書き出す（応募書式）').click();
  assert((await page.locator('.modal').textContent()).includes('およそ'), 'Word の書き出し：枚数の目安を表示');
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('.modal').getByRole('button', { name: '書き出す' }).click()]);
  const dpath = path.join(require('os').tmpdir(), 'tsuzuri-e2e-export.docx');
  await dl3.saveAs(dpath);
  const head = fs.readFileSync(dpath).subarray(0, 4);
  fs.unlinkSync(dpath);
  assert(/\.docx$/.test(dl3.suggestedFilename()) && head[0] === 0x50 && head[1] === 0x4b, 'Word（.docx）を書き出せる（' + dl3.suggestedFilename() + '）');

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
