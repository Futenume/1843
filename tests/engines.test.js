// 添削・設定チェックエンジンのテスト（node --test tests/）
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/textstats.js');
require('../js/proofread.js');
require('../js/consistency.js');
const { Text, Proofread, Consistency } = globalThis.Tsuzuri;

const rules = (text, opts) => Proofread.proofread(text, opts);
const has = (issues, ruleId, text) => issues.some((i) => i.ruleId === ruleId && (text == null || i.text === text));

test('文・会話文の分割', () => {
  const a = Text.analyze('　彼は「行こう」と言った。「うん」「わかった」\n　空は青い！？　本当に。');
  assert.equal(a.dialogues.length, 3);
  assert.deepEqual(a.sentences.map((s) => s.kind), ['narration', 'dialogue', 'dialogue', 'narration', 'narration']);
  assert.equal(a.sentences[0].text, '彼は「行こう」と言った。');
});

test('ルビ記法は位置を保ったまま無視し、統計からも除く', () => {
  const t = '|漢字《かんじ》と魔法《まほう》と《《傍点》》';
  assert.equal(Text.maskRuby(t).length, t.length);
  assert.equal(Text.stripRuby(t), '漢字と魔法と傍点');
  assert.match(Text.rubyToHtml(t), /<ruby>漢字<rt>かんじ<\/rt><\/ruby>/);
  assert.match(Text.rubyToHtml(t), /<em class="boten">傍点<\/em>/);
  assert.equal(Text.stats(t).charsNoSpace, 8);
});

test('文字数・原稿用紙換算', () => {
  const s = Text.stats('あ'.repeat(25) + '\n' + 'い'.repeat(10));
  assert.equal(s.chars, 35);
  assert.equal(s.gridLines, 3);
  assert.equal(s.pages, 1);
});

test('漢数字の変換', () => {
  assert.equal(Text.parseJaNumber('十七'), 17);
  assert.equal(Text.parseJaNumber('１７'), 17);
  assert.equal(Text.parseJaNumber('二〇二六'), 2026);
  assert.equal(Text.parseJaNumber('百二十'), 120);
  assert.equal(Text.toKanjiNumber(17), '十七');
  assert.equal(Text.toKanjiNumber(2026), '二千二十六');
});

test('ら抜き言葉', () => {
  const r = rules('今日は来れない。映画が見れる。食べれば分かる。泥まみれた。');
  assert.ok(has(r, 'ranuki', '来れ'));
  assert.ok(has(r, 'ranuki', '見れ'));
  assert.ok(!r.some((i) => i.ruleId === 'ranuki' && i.text.indexOf('食べ') >= 0), '食べれば は正しい');
  assert.ok(!r.some((i) => i.ruleId === 'ranuki' && i.text === 'みれ'), 'まみれる は対象外');
  assert.equal(r.find((i) => i.text === '来れ').suggestion, '来られ');
});

test('い抜き言葉は地の文だけ', () => {
  const r = rules('　彼は待ってた。\n「待ってたよ」\n　嬉しくてたまらない。なんでたまに来るの。');
  const inuki = r.filter((i) => i.ruleId === 'inuki');
  assert.equal(inuki.length, 1);
  assert.equal(inuki[0].suggestion, 'ていた');
});

test('重言・慣用句・誤字', () => {
  const r = rules('頭痛が痛い。的を得た意見。完壁だ。絶対絶命。違和感を感じる。日に日に強くなる。');
  assert.ok(has(r, 'redundant', '頭痛が痛'));
  assert.ok(has(r, 'misuse', '的を得'));
  assert.ok(has(r, 'typo', '完壁'));
  assert.ok(has(r, 'typo', '絶対絶命'));
  assert.ok(has(r, 'redundant', '違和感を感じ'));
  assert.ok(!r.some((i) => i.text === '日に日に'), '日に日に は正しい');
});

test('記号の作法', () => {
  const r = rules('「そうだね。」\n…と思った。――いや、―違う。・・・\n「本当!?嘘」');
  assert.ok(has(r, 'bracket-period', '。'));
  assert.ok(has(r, 'ellipsis', '…'));
  assert.ok(has(r, 'ellipsis', '・・・'));
  assert.ok(has(r, 'dash', '―'));
  assert.ok(!r.some((i) => i.ruleId === 'dash' && i.text === '――'));
  assert.ok(has(r, 'halfwidth', '!?'));
  assert.ok(has(r, 'exclamation-space'));
});

test('括弧の対応', () => {
  const r = rules('「こんにちは』\n「閉じてない\nこれは」余分');
  assert.equal(r.filter((i) => i.ruleId === 'brackets').length >= 3, true);
});

test('段落の字下げは作品の書き方に合わせる', () => {
  const indented = rules('　一段落目。\n　二段落目。\n三段落目。');
  assert.equal(indented.filter((i) => i.ruleId === 'indent').length, 1);
  const flat = rules('一段落目。\n二段落目。\n三段落目。');
  assert.equal(flat.filter((i) => i.ruleId === 'indent').length, 0);
});

test('長文・読点・文末の連続', () => {
  const long = 'あ'.repeat(120) + '。';
  assert.ok(has(rules(long), 'sentence-length'));
  assert.ok(has(rules('あ、い、う、え、お、か。'), 'commas'));
  const r = rules('　彼は歩いた。空を見た。風が吹いた。');
  assert.equal(r.filter((i) => i.ruleId === 'ending-repeat').length, 1);
});

test('表記ゆれは作品全体の多数派に寄せる', () => {
  const corpus = ['それができる。これもできる。', '彼にも出来る。'];
  const r = rules(corpus[1], { corpus });
  const h = r.find((i) => i.ruleId === 'hyouki');
  assert.ok(h);
  assert.equal(h.suggestion, 'でき');
});

test('表記統一ルールと一括修正', () => {
  const text = '「わかった。」とサーバは言った';
  const r = rules(text, { styleRules: [{ from: 'サーバ', to: 'サーバー' }] });
  assert.ok(has(r, 'style-rule', 'サーバ'));
  const fixed = Proofread.applyFixes(text, r.filter((i) => i.fixable));
  assert.equal(fixed, '「わかった」とサーバーは言った');
});

test('ルビを含む箇所は壊さない', () => {
  const r = rules('|魔法《まほう》を使う。');
  const fixed = Proofread.applyFixes('|魔法《まほう》を使う。', r.filter((i) => i.fixable));
  assert.equal(fixed, '|魔法《まほう》を使う。');
});

test('無視リスト', () => {
  const r = rules('映画が見れる。', { ignore: new Set(['ranuki|見れ']) });
  assert.ok(!has(r, 'ranuki'));
});

// ───── 設定矛盾チェック ─────
const entries = [
  { id: 'a', type: 'character', name: '斎藤 蓮', aliases: ['レン'], fields: { firstPerson: '俺', hair: '黒', eyes: '琥珀色', age: '17' },
    relations: [{ targetId: 'b', calls: 'ミリアさん' }], appear: {} },
  { id: 'b', type: 'character', name: 'ミリア・ヴァイス', aliases: ['ミリア'], fields: { firstPerson: '私', hair: '銀', eyes: '青', age: '16' },
    relations: [{ targetId: 'a', calls: '蓮くん' }], appear: { until: 3, reason: '死亡' } },
  { id: 'c', type: 'place', name: 'アルセイド王国', aliases: ['アルセイド'], fields: {} },
];
const text = [
  '　斉藤は窓の外を見た。',
  '「僕は行かないよ」と蓮は言った。',
  '　ミリアは振り返った。「蓮さん、待って！」',
  '　ミリア・バイスの金色の髪が揺れた。',
  '　十八歳の蓮は、ミリアの青い瞳を見つめた。',
  '　アルセイト王国の騎士団長グラハムが現れた。グラハムは剣を抜いた。',
  '蓮「ミリアさん、俺が守る」',
  '「ミリア、下がれ！」と蓮が叫んだ。スマホが鳴った。',
].join('\n');
const res = Consistency.check(text, { entries, chapterNo: 5, rules: { ng: [{ word: 'スマホ', reason: '存在しない', suggestion: '伝令' }] } });
const cIssue = (rule, t) => res.issues.find((i) => i.ruleId === rule && (t == null || i.text === t));

test('話者推定（後置・前置・台本形式）', () => {
  const methods = res.speakers.map((s) => s.method).sort();
  assert.deepEqual(methods, ['after', 'after', 'before', 'prefix']);
});

test('名前の表記ゆれ（異体字・カタカナ・誤字候補）', () => {
  assert.equal(cIssue('name-variant', '斉藤').suggestion, '斎藤');
  assert.equal(cIssue('name-variant', 'ミリア・バイス').suggestion, 'ミリア・ヴァイス');
  assert.equal(cIssue('name-variant', 'アルセイト').severity, 'info');
});

test('一人称・呼び方・外見・年齢・退場後の発言・NGワード', () => {
  assert.ok(cIssue('first-person', '僕'));
  assert.ok(!res.issues.some((i) => i.ruleId === 'first-person' && i.text === '俺'));
  assert.ok(cIssue('calls', '蓮さん'));
  assert.ok(cIssue('calls', 'ミリア'));
  assert.ok(!res.issues.some((i) => i.ruleId === 'calls' && i.text === 'ミリアさん'));
  assert.ok(cIssue('appearance', '金色の髪'));
  assert.ok(!res.issues.some((i) => i.ruleId === 'appearance' && i.text.indexOf('青') >= 0));
  assert.ok(cIssue('age', '十八歳'));
  assert.ok(cIssue('timeline'));
  assert.equal(cIssue('ng-word', 'スマホ').suggestion, '伝令');
});

test('未登録の固有名詞候補', () => {
  assert.ok(res.candidates.some((c) => c.word === 'グラハム'));
});

test('色の慣用句は外見チェックしない', () => {
  const r = Consistency.check('　蓮は白い目で見られた。蓮は泣いて赤い目をしていた。', { entries });
  assert.equal(r.issues.filter((i) => i.ruleId === 'appearance').length, 0);
});

test('登場回数の集計', () => {
  const counts = Consistency.countMentionsByEntry(['蓮とミリア。蓮。', 'アルセイド王国'], entries);
  assert.equal(counts[0].a, 2);
  assert.equal(counts[0].b, 1);
  assert.equal(counts[1].c, 1);
});
