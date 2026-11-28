// AI機能の結合テスト（任意）。SDK を模擬モジュールに差し替え、APIキーなしで送信内容と画面の動きを確認する。
//   python3 -m http.server 8765 &   （リポジトリ直下で）
//   node tests/e2e-ai-mock.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, '..', 'screenshots') + '/';
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/index.html';
const FAKE = `
class APIError extends Error {}
class AuthenticationError extends APIError {}
class APIUserAbortError extends APIError {}
class PermissionDeniedError extends APIError {}
class NotFoundError extends APIError {}
class RateLimitError extends APIError {}
class BadRequestError extends APIError {}
class InternalServerError extends APIError {}
class APIConnectionError extends APIError {}
export default class Anthropic {
  constructor(opts) { this.opts = opts; window.__aiCalls = window.__aiCalls || []; const self = this;
    this.beta = { messages: { stream(params, ro) { window.__aiCalls.push({ params, opts: self.opts });
      const isCons = params.system.includes('整合性');
      const isAsk = !params.output_config.format;
      const isCreature = params.system.includes('幻想生物');
      const payload = isCreature ? JSON.stringify({ preset: 'wyvern', neck: 0.7, tail: 0.8, legs: 0.4, bulk: 0.3, head: 0.6, wing: 0.9, horns: 'ram', wings: 'bat', ridge: 'spikes', tailTip: 'spade', color: '#8a2f2a', belly: '#d9c27a', length: '20m' }) : isAsk ? '展開には無理がありません。ラスト案：1. ……' : JSON.stringify(isCons
        ? { summary: 'セレナの髪色に食い違いがあります。', items: [{ quote: 'セレナの金色の髪', problem: '髪色が設定と違います', setting: '銀色のロングヘア', suggestion: 'セレナの銀色の髪', severity: 'warning' }] }
        : { summary: 'テンポのよい導入です。', items: [{ quote: '違和感を感じたのは', suggestion: '違和感を覚えたのは', reason: '「違和感」と「感じる」が重複', category: '表現', severity: 'warning' }, { quote: '存在しない引用', suggestion: '', reason: 'テスト', category: 'その他', severity: 'info' }] });
      const handlers = {};
      return { on(ev, fn) { handlers[ev] = fn; return this; },
        async finalMessage() { if (handlers.text) handlers.text(payload.slice(0, 10), payload); return { stop_reason: 'end_turn', content: [{ type: 'text', text: payload }] }; } };
    } } };
  }
}
Object.assign(Anthropic, { APIError, AuthenticationError, APIUserAbortError, PermissionDeniedError, NotFoundError, RateLimitError, BadRequestError, InternalServerError, APIConnectionError });
export { Anthropic };
`;
function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✓ ' + m); }
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/cdn\.jsdelivr\.net\/npm\/@anthropic-ai\/sdk@1\.7\.0\/\+esm|\/js\/vendor\/anthropic-sdk\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE }));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('tsuzuri.apiKey', 'sk-ant-test'));
  await page.getByRole('button', { name: 'サンプル作品を開く' }).click();
  await page.waitForTimeout(800);
  await page.locator('.panel-tabs .tab[data-tab="ai"]').click();
  await page.getByRole('button', { name: 'AIで添削' }).click();
  await page.waitForSelector('.ai-summary');
  const calls = await page.evaluate(() => window.__aiCalls);
  const p = calls[0].params;
  assert(p.model === 'claude-opus-5-5', 'モデルは claude-opus-5-5');
  assert(p.output_config.format.type === 'json_schema' && p.output_config.effort === 'medium', '構造化出力と effort を指定');
  assert(p.fallbacks === 'default' && p.betas[0] === 'server-side-fallback-2026-07-01', 'サーバー側フォールバックを指定');
  assert(calls[0].opts.dangerouslyAllowBrowser === true && calls[0].opts.apiKey === 'sk-ant-test', 'ブラウザ用の設定でキーを渡す');
  assert(p.messages[0].content.includes('<manuscript>') && p.messages[0].content.includes('王都ルーネの朝'), '本文を送る');
  assert(await page.locator('.ai-card').count() === 2, 'AIの指摘がカードで表示される');
  assert(await page.locator('.editor-backdrop .mk-ai').count() >= 1, 'AIの指摘が本文にハイライトされる');
  assert((await page.locator('.ai-card').nth(1).textContent()).includes('本文中に見つかりません'), '見つからない引用はその旨を表示');
  await page.screenshot({ path: OUT + 'ai-proof.png' });
  await page.getByRole('button', { name: '修正案を適用' }).click();
  await page.waitForTimeout(500);
  assert((await page.locator('.editor-input').inputValue()).includes('違和感を覚えたのは'), '修正案を本文に適用できる');
  await page.getByRole('button', { name: 'AIで設定チェック' }).click();
  await page.waitForTimeout(500);
  const c2 = (await page.evaluate(() => window.__aiCalls))[1].params;
  assert(c2.messages[0].content.includes('<settings>') && c2.messages[0].content.includes('銀色のロングヘア'), '設定チェックでは設定資料も送る');
  assert((await page.locator('.ai-results').textContent()).includes('髪色が設定と違います'), '設定チェックの結果を表示');
  await page.locator('.ai-panel textarea').fill('ラストのアイデアを出して');
  await page.getByRole('button', { name: '相談する' }).click();
  await page.waitForTimeout(500);
  assert((await page.locator('.ai-answer').textContent()).includes('ラスト案'), 'AIに相談の回答を表示');
  await page.screenshot({ path: OUT + 'ai-cons.png' });
  await page.route(/wik(ipedia|tionary)\.org/, (r) => r.abort());
  await page.locator('.panel-tabs .tab[data-tab="dict"]').click();
  await page.locator('.dict-search input').fill('黄昏');
  await page.locator('.dict-search button').click();
  await page.getByRole('button', { name: /の意味・例文・言い換えを聞く/ }).click();
  await page.waitForTimeout(500);
  const c3 = (await page.evaluate(() => window.__aiCalls)).slice(-1)[0].params;
  assert(c3.system.includes('国語辞典') && c3.messages[0].content.includes('黄昏') && c3.output_config.effort === 'low', '辞書から語の意味をAIに聞ける');
  assert((await page.locator('.dict-ai .ai-answer').textContent()).length > 5, '辞書にAIの回答を表示');
  // 生物：説明から図の形を決める
  await page.evaluate(() => Tsuzuri.App.navigate('lore'));
  await page.locator('.lore-tab', { hasText: '生物' }).click();
  await page.getByRole('button', { name: '追加' }).click();
  await page.locator('.entry-name-input').fill('紅の翼竜');
  await page.locator('.field', { hasText: '姿の特徴' }).locator('textarea').fill('赤い鱗、巻いた角。翼が前脚になっている');
  await page.getByRole('button', { name: '説明から形を決める（AI）' }).click();
  await page.waitForTimeout(600);
  const c4 = (await page.evaluate(() => window.__aiCalls)).slice(-1)[0].params;
  assert(c4.system.includes('幻想生物') && c4.messages[0].content.includes('赤い鱗') && c4.output_config.format.schema.properties.preset.enum.includes('wyvern'), '生物の説明を送り、形のひな形から選ばせる');
  const fig = await page.evaluate(() => { const e = Tsuzuri.App.project.entries.find((x) => x.name === '紅の翼竜'); return { figure: e.figure, length: e.fields.length }; });
  assert(fig.figure.preset === 'wyvern' && fig.figure.horns === 'ram' && fig.figure.color === '#8a2f2a' && fig.length === '20m', 'AIの答えで図の形・色・全長が決まる');
  assert((await page.locator('.cf-stage').textContent()).includes('全長 20m'), '決まった形と大きさで図を描き直す');
  assert(errs.length === 0, 'エラーなし ' + errs.join('/'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
