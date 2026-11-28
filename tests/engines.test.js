// 添削・設定チェックエンジンのテスト（npm test または node --test tests/engines.test.js）
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

// ───── 地図 ─────
require('../js/mapengine.js');
const { MapEngine } = globalThis.Tsuzuri;

test('旧形式の地図（地点・自動記号）を新形式に変換', () => {
  const H = MapEngine.generate(40, 26, { preset: 'island', seed: 7 });
  const old = {
    id: 'm1', name: '旧地図', gw: 40, gh: 26, cell: 6, seed: 7, height: MapEngine.encodeHeights(H),
    lines: [], areas: [], labels: [],
    markers: [{ id: 'mk1', x: 100, y: 60, type: 'capital', name: '王都', entryId: 'e1', note: '' }],
    style: { palette: 'parchment', glyphs: true, compass: true, title: true, grid: false },
  };
  MapEngine.migrate(old);
  assert.ok(Array.isArray(old.stamps));
  assert.equal(old.markers, undefined);
  const cap = old.stamps.find((s) => s.a === 'sym-capital');
  assert.ok(cap && cap.name === '王都' && cap.entryId === 'e1');
  assert.ok(old.stamps.some((s) => s.a === 'compass'));
  assert.equal(old.style.title, 'plain');
  assert.equal(old.style.grid, 'none');
  assert.ok(old.layers && old.layers.stamps);
});

test('新しい地図は山や森の素材を自動で置き、陸と海の区別を保存できる', () => {
  const m = MapEngine.newMap('t', { preset: 'continent', size: 's', seed: 99 });
  assert.ok(m.stamps.length > 50);
  assert.ok(m.stamps.some((s) => s.a.startsWith('mountain')));
  const H = MapEngine.decodeHeights(m.height, m.gw * m.gh);
  const again = MapEngine.decodeHeights(MapEngine.encodeHeights(H), m.gw * m.gh);
  for (let i = 0; i < H.length; i++) assert.equal(Math.sign(again[i]) || 1, Math.sign(H[i]) || 1);
});

// ───── 特殊な読み（ルビ） ─────
require('../js/readings.js');
const { Readings } = globalThis.Tsuzuri;

test('アイデア帳・設定資料から読み方を集める', () => {
  const project = {
    ideas: [
      { id: 'i1', kind: '読み方', word: '足', reading: 'アルファ', body: '' },
      { id: 'i2', kind: 'アイデア', body: '魔眼《イビルアイ》は代償が重い' },
      { id: 'i3', kind: '読み方', body: '刹那＝せつな\n終焉（エンド）' },
    ],
    entries: [{ id: 'e1', name: '星晶石', reading: 'せいしょうせき' }, { id: 'e2', name: '斎藤 蓮', reading: 'さいとう れん' }],
  };
  const list = Readings.collect(project);
  const has = (b, r) => list.some((x) => x.base === b && x.reading === r);
  assert.ok(has('足', 'アルファ'));
  assert.ok(has('魔眼', 'イビルアイ'));
  assert.ok(has('刹那', 'せつな'));
  assert.ok(has('終焉', 'エンド'));
  assert.ok(has('星晶石', 'せいしょうせき'));
  assert.ok(has('蓮', 'れん'));
});

test('登録した特殊な読みのルビは添削しない', () => {
  const text = '　彼は|足《アルファ》を構えた。魔眼《イビルアイ》が光る。';
  const before = rules(text);
  assert.ok(before.some((i) => i.ruleId === 'ruby' && i.text.includes('アルファ') && i.action && i.action.type === 'register-reading'), '未登録なら特殊な読みとして提案');
  const readings = Readings.index([{ base: '足', reading: 'アルファ' }, { base: '魔眼', reading: 'いびるあい' }]);
  const after = rules(text, { readings });
  assert.ok(!after.some((i) => i.ruleId === 'ruby'), '登録済み（ひらがな・カタカナの違いも同一視）なら指摘しない');
});

test('登録と違う読み・空のルビ・ルビの揺れ', () => {
  const readings = Readings.index([{ base: '足', reading: 'アルファ' }]);
  const r1 = rules('|足《アルフア》が動く。', { readings });
  const w = r1.find((i) => i.ruleId === 'ruby');
  assert.ok(w && w.severity === 'warning' && w.suggestion === 'アルファ');
  assert.equal(Proofread.applyFixes('|足《アルフア》が動く。', [w]), '|足《アルファ》が動く。');
  assert.ok(rules('|空《》').some((i) => i.ruleId === 'ruby' && i.severity === 'error'));
  const corpus = ['刹那《せつな》と刹那《せつな》', '刹那《いっしゅん》'];
  const r2 = rules(corpus[1], { corpus });
  assert.ok(r2.some((i) => i.ruleId === 'ruby' && i.suggestion === 'せつな'));
});

require('../js/dictdata.js');
const { DictData } = globalThis.Tsuzuri;

test('創作辞典：語・読み（カタカナも可）・言い換えで引ける', () => {
  const byWord = DictData.search('茜色');
  assert.ok(byWord.some((g) => g.items.some((it) => it.w === '茜色' && /^#[0-9a-f]{6}$/i.test(it.c))));
  const byReading = DictData.search('アカネ');
  assert.ok(byReading.some((g) => g.items.some((it) => it.w === '茜色')), 'カタカナの読みでも引ける');
  const syn = DictData.search('見る');
  assert.ok(syn.some((g) => g.cat.id === 'thesaurus' && g.items.some((it) => it.s && it.s.length > 3)), '言い換えの候補が出る');
  assert.deepEqual(DictData.search('  '), []);
  assert.equal(DictData.kata2hira('アルファ'), 'あるふぁ');
});

test('世界観NGワード：台詞は常に、地の文は語り手しだい', () => {
  const ng = [{ word: 'メートル', reason: '単位は歩', suggestion: '歩' }];
  const firstText = '　僕は剣を握った。百メートル先に敵がいる。僕の足は震えていた。\n「十メートル下がれ」と師匠が叫んだ。';
  const thirdText = '　リオは剣を握った。百メートル先に敵がいる。彼の足は震えていた。\n「十メートル下がれ」と師匠が叫んだ。';
  const ngIssues = (t, narrator, scope) => Consistency.check(t, { rules: { ng: ng.map((r) => Object.assign({}, r, { scope })) }, narrator }).issues.filter((i) => i.ruleId === 'ng-word');
  // 自動判定：一人称 → 地の文も警告
  const a = ngIssues(firstText, 'auto');
  assert.equal(a.length, 2);
  assert.ok(a.every((i) => i.severity === 'warning'));
  // 神視点 → 台詞だけ
  const o = ngIssues(thirdText, 'omniscient');
  assert.equal(o.length, 1);
  assert.ok(o[0].inDialogue && o[0].text === 'メートル');
  // 三人称（自動判定でも）→ 地の文は参考（info）
  const t = ngIssues(thirdText, 'auto');
  assert.deepEqual(t.map((i) => i.severity).sort(), ['info', 'warning']);
  // 語ごとの対象：台詞だけ／台詞も地の文も
  assert.equal(ngIssues(firstText, 'first', 'dialogue').length, 1);
  assert.ok(ngIssues(thirdText, 'omniscient', 'all').every((i) => i.severity === 'warning'));
  assert.equal(ngIssues(thirdText, 'omniscient', 'all').length, 2);
});

test('語り手の自動判定（地の文の一人称）', () => {
  assert.equal(Consistency.detectNarrator('　俺はため息をついた。俺たちの村は小さい。').kind, 'first');
  assert.equal(Consistency.detectNarrator('　彼女は私立高校に通っている。公私ともに忙しい。「私は平気」と彼女は笑った。').kind, 'third');
  const r = Consistency.detectNarrator('　わたしは窓を開けた。わたしの部屋は二階にある。');
  assert.equal(r.kind, 'first');
  assert.equal(r.pronoun, 'わたし');
});

require('../js/publish.js');
const { Publish } = globalThis.Tsuzuri;

test('投稿サイト用の書き出し：ルビと傍点の変換', () => {
  const src = '　|星晶石《せいしょうせき》と魔法《まほう》と《《傍点》》。\n「笑顔（えがお）だ」';
  assert.equal(Publish.convert(src, 'kakuyomu').text, '　|星晶石《せいしょうせき》と|魔法《まほう》と《《傍点》》。\n「笑顔（えがお）だ」');
  const n = Publish.convert(src, 'narou');
  assert.equal(n.text, '　|星晶石《せいしょうせき》と|魔法《まほう》と|傍《・》|点《・》。\n「笑顔|（えがお）だ」');
  assert.equal(n.stats.parenGuard, 1, '「漢字（かな）」が勝手にルビにならないよう | を入れる');
  assert.equal(Publish.convert(src, 'pixiv').text, '　[[rb:星晶石 > せいしょうせき]]と[[rb:魔法 > まほう]]と[[rb:傍 > ・]][[rb:点 > ・]]。\n「笑顔（えがお）だ」');
  assert.equal(Publish.convert(src, 'paren').text, '　星晶石（せいしょうせき）と魔法（まほう）と傍点。\n「笑顔（えがお）だ」');
  assert.equal(Publish.convert(src, 'plain').text, '　星晶石と魔法と傍点。\n「笑顔（えがお）だ」');
});

test('投稿サイト用の書き出し：字下げ・空行・記号・複数話', () => {
  const src = '地の文。\n「台詞!?」\n\n\n　続き。';
  assert.equal(Publish.convert(src, 'plain', { indent: 'add', fullwidthMarks: true }).text, '　地の文。\n「台詞！？」\n\n\n　続き。');
  assert.equal(Publish.convert(src, 'plain', { indent: 'remove', blankLines: true }).text, '地の文。\n\n「台詞!?」\n\n続き。');
  const long = Publish.convert('|超長い名前の古代魔法陣《とてもながいなまえのこだいまほうじん》', 'narou');
  assert.equal(long.stats.longRuby.length, 1, 'なろうの文字数制限を超えるルビを知らせる');
  const chs = [{ title: '第一話', body: '本文1' }, { title: '第二話', body: '本文2' }];
  assert.equal(Publish.convertChapters(chs, 'pixiv', { includeTitle: true }).text, '[chapter:第一話]\n本文1\n[newpage]\n[chapter:第二話]\n本文2');
  assert.equal(Publish.visibleLength('[[rb:魔法 > まほう]]と[chapter:x]', 'pixiv'), 3);
});

test('同じ語の近い繰り返し（地の文だけ・名前と数の語は除く）', () => {
  const t = '　魔法陣が光り、魔法陣から炎が出た。\n「魔法陣だ、魔法陣！」\n　一人、また一人と倒れた。\n　アルベインは走った。アルベインは止まらない。';
  const hits = rules(t, { names: ['リオ・アルベイン'] }).filter((i) => i.ruleId === 'word-repeat');
  assert.deepEqual(hits.map((i) => i.text), ['魔法陣']);
  assert.equal(t.slice(hits[0].start, hits[0].end), '魔法陣');
  assert.ok(hits[0].start > t.indexOf('魔法陣'), '2回目の方を指摘する');
  // 離れていれば指摘しない
  const far = '　魔法陣が光った。' + '彼は長い長い通路を歩き続けた。'.repeat(3) + '魔法陣は消えていた。';
  assert.equal(rules(far).filter((i) => i.ruleId === 'word-repeat' && i.text === '魔法陣').length, 0);
});

test('話者推定：間に別の主語があれば名前から推定しない', () => {
  const entries = [{ id: 't', type: 'character', name: '太郎', aliases: [], fields: { firstPerson: '俺' }, relations: [], appear: {}, custom: [] }];
  const sp = (text) => Consistency.check(text, { entries, rules: { ng: [] } }).speakers.map((s) => s.name);
  assert.deepEqual(sp('　太郎が言いかけたとき、彼女が「ねえ」と言った。'), []);
  assert.deepEqual(sp('「わかった」と彼女が言うと、太郎は頷いた。'), []);
  assert.deepEqual(sp('　太郎は彼女の手を取った。「行こう」'), ['太郎']);
  assert.deepEqual(sp('「行くぞ」と太郎は言った。'), ['太郎']);
  // 誤った推定で一人称の食い違いを出さない
  const issues = Consistency.check('　太郎が言いかけたとき、彼女が「私も行く」と言った。', { entries, rules: { ng: [] } }).issues;
  assert.ok(!issues.some((i) => i.ruleId === 'first-person'));
});

test('同じ語の繰り返し：言い直し（〜というには）は除く', () => {
  const t = '　彼女は友人だ。いや、友人というには近すぎる。';
  assert.equal(rules(t).filter((i) => i.ruleId === 'word-repeat').length, 0);
});

test('話者推定：台詞だけの行（次の行・前の行から）', () => {
  const entries = [
    { id: 'k', type: 'character', name: 'カイル', aliases: [], fields: { firstPerson: '俺' }, relations: [], appear: {}, custom: [] },
    { id: 'e', type: 'character', name: 'エリス', aliases: [], fields: { firstPerson: 'あたし' }, relations: [], appear: {}, custom: [] },
  ];
  const check = (t) => Consistency.check(t, { entries, rules: { ng: [] } });
  // 次の行に「カイルは〜言った」
  let r = check('「僕が行く」\n　カイルは呆れたように言った。');
  assert.deepEqual(r.speakers.map((s) => s.method), ['next']);
  assert.ok(r.issues.some((i) => i.ruleId === 'first-person' && i.severity === 'warning'));
  // 前の行の主語（確度が低いので参考扱い）
  r = check('　カイルは振り返った。剣を抜く。\n「僕が行く」');
  assert.deepEqual(r.speakers.map((s) => s.name + '/' + s.method), ['カイル/context']);
  assert.ok(r.issues.some((i) => i.ruleId === 'first-person' && i.severity === 'info'));
  // 前の行で最後に主語になった人物を採る。名前でない主語（彼女が…）が後にあれば推定しない
  assert.deepEqual(check('　カイルは振り返った。エリスが手を振る。\n「僕が行く」').speakers.map((s) => s.name), ['エリス']);
  assert.equal(check('　カイルは振り返った。彼女が手を振る。\n「僕が行く」').speakers.length, 0);
  assert.equal(check('　カイルは振り返り、エリスが手を振るのを見た。\n「僕が行く」').speakers.length, 0);
  // 次の行が発話の動詞でなければ推定しない
  assert.equal(check('「いただきます！」\n　エリスは目を輝かせてスプーンを手に取った。').speakers.length, 0);
});

test('同じ語の繰り返し：名前の一部（黒霧の森 → 黒霧）も除く', () => {
  const t = '　黒霧の森は静かだった。黒霧の森の奥で、何かが動いた。';
  assert.equal(rules(t, { names: ['黒霧の森'] }).filter((i) => i.ruleId === 'word-repeat').length, 0);
  assert.equal(rules(t).filter((i) => i.ruleId === 'word-repeat').length, 1);
});

test('世界地図：いくつもの大陸・極地は海（氷は描画）・経緯線と地球規模の縮尺', () => {
  for (const seed of [11, 42, 7]) {
    const m = MapEngine.newMap('世界', { preset: 'world', seed });
    assert.equal(m.gw, 420);
    assert.equal(m.gh, 210);
    assert.equal(m.style.grid, 'latlon');
    assert.ok(m.style.ice);
    assert.ok(m.style.kmPerCell > 50, '一周およそ4万kmの縮尺');
    const H = MapEngine.decodeHeights(m.height, m.gw * m.gh);
    // 陸のかたまりの数（小さすぎる島は数えない）
    const seen = new Uint8Array(H.length);
    let big = 0;
    for (let i = 0; i < H.length; i++) {
      if (H[i] <= 0 || seen[i]) continue;
      let n = 0;
      const st = [i];
      seen[i] = 1;
      while (st.length) {
        const k = st.pop();
        n++;
        const x = k % m.gw;
        const y = (k / m.gw) | 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.gw || ny >= m.gh) return;
          const j = ny * m.gw + nx;
          if (!seen[j] && H[j] > 0) { seen[j] = 1; st.push(j); }
        });
      }
      if (n > 600) big++;
    }
    assert.ok(big >= 3, `大陸が3つ以上（seed ${seed}：${big}）`);
    // 最上段・最下段と左右の端は海
    for (let x = 0; x < m.gw; x++) { assert.ok(H[x] <= 0); assert.ok(H[(m.gh - 1) * m.gw + x] <= 0); }
    for (let y = 0; y < m.gh; y++) { assert.ok(H[y * m.gw] <= 0); assert.ok(H[y * m.gw + m.gw - 1] <= 0); }
  }
});

test('町と道の自動配置：道は水の上を通らない／世界地図の仮の名前', () => {
  for (const preset of ['continent', 'island', 'coast']) {
    const m = MapEngine.newMap('国', { preset, seed: 42, towns: true });
    const H = MapEngine.decodeHeights(m.height, m.gw * m.gh);
    const towns = m.stamps.filter((s) => ['castle', 'town', 'village', 'port'].includes(s.a));
    assert.ok(towns.length >= 5, preset + '：町や村が置かれる');
    assert.equal(towns.filter((s) => s.a === 'castle').length, 1, '王都はひとつ');
    assert.ok(towns.every((s) => s.name), '仮の名前が付く');
    assert.equal(new Set(towns.map((s) => s.name)).size, towns.length, '名前は重ならない');
    const roads = m.lines.filter((l) => l.kind === 'road' || l.kind === 'highway');
    assert.ok(roads.length >= 3, '道でつながる');
    roads.forEach((r) => r.points.forEach(([x, y]) => {
      assert.ok(MapEngine.sampleH(H, m.gw, m.gh, m.cell, x, y) > 0, '道は陸の上');
    }));
  }
  const w = MapEngine.newMap('世界', { preset: 'world', seed: 7, names: true });
  assert.ok(w.labels.filter((l) => /大陸$/.test(l.text)).length >= 3);
  assert.ok(w.labels.some((l) => /(海|洋)$/.test(l.text)));
});

test('国に分ける：国の数・陸だけの塗り・国境・国名・作り直しの印', () => {
  for (const [preset, size, seed] of [['world', 'w', 3], ['continent', 'm', 11], ['archipelago', 'm', 5]]) {
    const m = MapEngine.newMap('t', { preset, size, seed, stamps: false });
    const n = m.gw * m.gh;
    const H = MapEngine.decodeHeights(m.height, n);
    const B = MapEngine.decodeBiomes(m.biome, n);
    const r = MapEngine.autoCountries(m, H, B, seed, { count: 5, capitals: true });
    assert.equal(r.count, 5, preset + '：指定した数の国');
    const groups = new Set(r.areas.map((a) => a.group));
    assert.equal(groups.size, 5, preset + '：どの国にも塗りがある');
    assert.ok(r.areas.every((a) => a.land && a.gen === 'country' && /^#[0-9a-f]{6}$/i.test(a.color) && a.points.length >= 3));
    assert.equal(r.labels.length, 5);
    assert.ok(r.labels.every((l) => /(王国|公国|帝国|共和国|連邦|首長国|皇国|連合|神聖国)$/.test(l.text) && l.x > 0 && l.x < m.gw * m.cell));
    // 国名の文字（塗りと結びつく）
    r.areas.forEach((a) => assert.ok(r.labels.some((l) => l.id === a.nameLabel)));
    if (preset !== 'archipelago') assert.ok(r.borders.length >= (preset === 'world' ? 1 : 2) && r.borders.every((b) => b.kind === 'border' && b.points.length >= 2));
    // 国境は陸の上だけ
    r.borders.forEach((b) => b.points.forEach(([x, y]) => {
      const gx = Math.min(m.gw - 1, Math.floor(x / m.cell));
      const gy = Math.min(m.gh - 1, Math.floor(y / m.cell));
      let land = false;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) { const k = (gy + dy) * m.gw + gx + dx; if (k >= 0 && H[k] > 0) land = true; }
      assert.ok(land, '国境の点が陸に接する');
    }));
  }
  // 紋章の旗：国ごとに1つ、国の色を深くした色で、地図の中に
  {
    const m = MapEngine.newMap('t', { preset: 'continent', size: 'm', seed: 21, stamps: false });
    const n = m.gw * m.gh;
    const r = MapEngine.autoCountries(m, MapEngine.decodeHeights(m.height, n), MapEngine.decodeBiomes(m.biome, n), 21, { count: 4, heraldry: true });
    const ban = r.stamps.filter((s) => s.a === 'banner');
    assert.equal(ban.length, 4, '国ごとに紋章の旗');
    assert.ok(ban.every((s) => /^#[0-9a-f]{6}$/.test(s.tint) && s.gen === 'country' && s.x > 0 && s.x < m.gw * m.cell && s.v >= 0 && s.v < 12));
    const none = MapEngine.autoCountries(m, MapEngine.decodeHeights(m.height, n), MapEngine.decodeBiomes(m.biome, n), 21, { count: 4 });
    assert.ok(!none.stamps.some((s) => s.a === 'banner'), '選ばなければ旗は置かない');
  }
  // 世界地図は最初から国に分けられる（大陸名は外し、海の名前は残す）
  const w = MapEngine.newMap('世界', { preset: 'world', seed: 9, names: true, countries: true });
  assert.ok(w.areas.length >= 6);
  assert.ok(!w.labels.some((l) => /大陸$/.test(l.text)));
  assert.ok(w.labels.some((l) => /(海|洋)$/.test(l.text)));
  assert.ok(w.stamps.some((s) => s.a === 'sym-capital' && s.name));
});

test('版を比べる：両方の本文を復元でき、足した・消した文字数が合う', () => {
  require('../js/diff.js');
  const { Diff } = globalThis.Tsuzuri;
  const back = (segs, side) => segs.filter((s) => s.type === 'eq' || s.type === side).map((s) => s.text).join('');
  const a = '　リオは走った。\n「待って」\n三行目。\n';
  const b = '　リオは急いで走った。\n「待ってよ」\n三行目。\n新しい段落。';
  const r = Diff.diffText(a, b);
  assert.equal(back(r.segs, 'del'), a);
  assert.equal(back(r.segs, 'ins'), b);
  assert.equal(r.added, 10);
  assert.equal(r.removed, 0);
  assert.equal(r.blocks, 3);
  // 書き換えた段落は1文字ずつ比べる（段落まるごとの入れ替えにしない）
  assert.ok(r.segs.some((s) => s.type === 'ins' && s.text === '急いで'));
  // ランダムな本文でも、必ず元に戻せる
  const al = 'あいう\nえ';
  for (let t = 0; t < 200; t++) {
    const g = () => Array.from({ length: (t * 7) % 37 }, (_, i) => al[(i * 13 + t * 5) % al.length]).join('');
    const x = g();
    const y = g().split('').reverse().join('');
    const rr = Diff.diffText(x, y);
    assert.equal(back(rr.segs, 'del'), x);
    assert.equal(back(rr.segs, 'ins'), y);
  }
  assert.equal(Diff.diffText('同じ', '同じ').blocks, 0);
});

test('テキストの取り込み：見出しで話に分ける・作品名・ルビと傍点の変換・文字コード', () => {
  require('../js/importtext.js');
  const { ImportText: I } = globalThis.Tsuzuri;
  const r = I.parse('星の物語\n\n第一話　旅立ち\n　朝。\n\n第二話：森\n[[rb:魔物 > まもの]]がいる。\n[newpage]\n続き\n\nエピローグ\n　おわり。', 'auto');
  assert.equal(r.title, '星の物語');
  assert.deepEqual(r.chapters.map((c) => c.title), ['第一話　旅立ち', '第二話：森', '第3話', 'エピローグ']);
  assert.equal(r.chapters[1].body, '|魔物《まもの》がいる。');
  assert.equal(r.ruby, 1);
  assert.deepEqual(I.parse('# 一章\n本文1\n## 二章\n本文2').chapters.map((c) => c.title), ['一章', '二章']);
  // 青空文庫の傍点と注記
  assert.equal(I.parse('彼は静かに［＃「静かに」に傍点］言った［＃ここで字下げ終わり］。').chapters[0].body, '彼は《《静かに》》言った。');
  // 本文中の長い行は見出しにしない／分けない設定
  assert.equal(I.parse('第一話を読んだ彼女は、その日のうちに続きを書き始めて、気がつけば夜が明けていたのだった。').chapters.length, 1);
  assert.equal(I.parse('第一話\n本文', 'none').chapters.length, 1);
  assert.equal(I.parse('一\n\n\n\n二', 'blank').chapters.length, 2);
  // Shift_JIS と UTF-8 の判定
  const sj = new Uint8Array([0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4, 0x8a, 0xbf, 0x8e, 0x9a]);
  assert.deepEqual(I.decodeBytes(sj), { text: 'あいう漢字', encoding: 'Shift_JIS' });
  assert.equal(I.decodeBytes(new TextEncoder().encode('あいう')).encoding, 'UTF-8');
  assert.equal(I.decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0xe3, 0x81, 0x82])).text, 'あ');
});

test('EPUB：ZIP の形（mimetype が先頭・無圧縮）、目次、縦書き、ルビ、XML として正しい', () => {
  require('../js/epub.js');
  const { Epub } = globalThis.Tsuzuri;
  const p = { id: 'p1', title: '星の物語 & <A>', author: '作者', chapters: [{ title: '第一話', body: '　|魔物《まもの》が来た。\n\n「本当に!?」\u0001' }, { title: '第二話', body: '二話。' }] };
  const r = Epub.build(p, { vertical: true, date: new Date('2026-01-02T03:04:05Z') });
  const u8 = r.data;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint16(8, true), 0, '無圧縮');
  assert.equal(new TextDecoder().decode(u8.slice(30, 38)), 'mimetype');
  assert.equal(new TextDecoder().decode(u8.slice(38, 58)), 'application/epub+zip');
  assert.deepEqual(r.files.slice(0, 2), ['mimetype', 'META-INF/container.xml']);
  const text = new TextDecoder().decode(u8);
  assert.ok(text.includes('page-progression-direction="rtl"'));
  assert.ok(text.includes('<ruby>魔物<rt>まもの</rt></ruby>'));
  assert.ok(text.includes('<span class="tcy">!?</span>'));
  assert.ok(text.includes('星の物語 &amp; &lt;A&gt;'));
  assert.ok(text.includes('「本当に<span class="tcy">!?</span>」</p>'), 'XML に使えない文字は除く');
  assert.ok(text.includes('<dcterms:modified') === false && text.includes('2026-01-02T03:04:05Z'));
  // 同じ作品なら同じ識別子
  assert.equal(Epub.uuidFrom('p1'), Epub.uuidFrom('p1'));
  // どんな ID でも正しい UUID の形（以前は「-」が混じることがあった）
  for (let i = 0; i < 500; i++) assert.match(Epub.uuidFrom('p' + i.toString(36) + 'x' + i * 7919), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(Epub.uuidFrom('p1'), Epub.uuidFrom('p2'));
  // CRC32 の既知の値
  assert.equal(Epub.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('Word（.docx）：応募書式の用紙・字数・行数、縦書き、ルビ・傍点・縦中横、XML として正しい', () => {
  require('../js/epub.js');
  require('../js/docx.js');
  const { Docx } = globalThis.Tsuzuri;
  const p = { id: 'p1', title: '星の物語 & <A>', author: '作者', chapters: [{ title: '第一話', body: '　|魔物《まもの》が来た。《《本当に》》12時!?\u0001\n\n　次の段落。' }, { title: '第二話', body: '二話。' }] };
  const r = Docx.build(p, { date: new Date('2026-01-02T03:04:05Z') });
  assert.deepEqual(r.files.slice(0, 1), ['[Content_Types].xml']);
  assert.ok(r.files.includes('word/document.xml') && r.files.includes('word/styles.xml') && r.files.includes('word/footer1.xml'));
  const text = new TextDecoder().decode(r.data);
  const docStart = text.indexOf('<w:document');
  const doc = text.slice(docStart, text.indexOf('</w:document>') + 13);
  // XML の開き・閉じタグがつり合っている
  const stack = [];
  doc.replace(/<(\/?)([a-zA-Z:]+)[^>]*?(\/?)>/g, (m, close, name, self) => {
    if (self) return m;
    if (close) assert.equal(stack.pop(), name, '閉じタグ ' + name);
    else stack.push(name);
    return m;
  });
  assert.equal(stack.length, 0);
  assert.ok(doc.includes('<w:textDirection w:val="tbRl"/>'), '縦書き');
  assert.ok(doc.includes('w:orient="landscape"'), 'A4横');
  assert.ok(/<w:docGrid w:type="linesAndChars" w:linePitch="\d+" w:charSpace="-?\d+"\/>/.test(doc));
  assert.ok(doc.includes('<w:rubyBase><w:r><w:t xml:space="preserve">魔物</w:t></w:r></w:rubyBase>') && doc.includes('>まもの</w:t>'), 'ルビ');
  assert.ok(doc.includes('<w:em w:val="comma"/>'), '傍点');
  assert.ok(/w:vert="1"[^>]*\/><\/w:rPr><w:t xml:space="preserve">12</.test(doc) && /w:vert="1"[^>]*\/><\/w:rPr><w:t xml:space="preserve">!\?</.test(doc), '縦中横');
  assert.ok(doc.includes('星の物語 &amp; &lt;A&gt;') && !doc.includes('\u0001'));
  assert.ok(doc.includes('<w:br w:type="page"/>'), '扉のあとと話ごとの改ページ');
  // 1行の字数・1枚の行数が用紙に収まる（40字×34行）
  const L = r.layout;
  assert.ok(L.land && L.pw === 16838 && L.ph === 11906);
  assert.ok(Math.abs((L.ph - L.top - L.bottom) - (L.pt + L.charSpace / 4096) * 20 * 40) < 30, '40字が1行に収まる');
  assert.ok(Math.abs((L.pw - L.left - L.right) - L.linePitch * 34) < 30, '34行が1枚に収まる');
  // 横書き・（）書きのルビ
  const h = new TextDecoder().decode(Docx.build(p, { vertical: false, ruby: 'paren', chars: 40, lines: 30 }).data);
  assert.ok(!h.includes('tbRl') && h.includes('魔物（まもの）') && !h.includes('<w:ruby>') && h.includes('<w:em w:val="dot"/>'));
  // 枚数の目安
  assert.equal(Docx.estimatePages([{ title: 'a', body: 'あ'.repeat(85) }], { chars: 40, lines: 34 }), 2);
});

test('原稿用紙の割り付け：題・名前の位置、ぶら下げ、開き括弧の送り、半角数字', () => {
  require('../js/publish.js');
  require('../js/genko.js');
  const { Genko } = globalThis.Tsuzuri;
  const r = Genko.layout([{ title: '第一話', body: '　あいうえおかきくけこさしすせそたちつて。次。\n「数は12345!?」' }], { chars: 20, lines: 20, title: '星の物語', author: '山田' });
  const ln = r.pages[0];
  const txt = (l) => l.cells.map((c) => c.t || '_').join('');
  assert.equal(txt(ln[0]), '___星の物語', '題は4マス目から');
  assert.equal(ln[1].cells.length, 19, '名前は最後の1マスを空ける');
  assert.equal(txt(ln[1]).slice(-2), '山田');
  assert.equal(txt(ln[3]), '__第一話');
  assert.equal(ln[5].cells.length, 20);
  assert.equal(ln[5].hang && ln[5].hang.t, '。', '行の頭の句点は前の行にぶら下げる');
  assert.equal(txt(ln[6]), '次。');
  const nums = ln[7].cells.filter((c) => c.tcy).map((c) => c.t);
  assert.deepEqual(nums, ['12', '34', '!?']);
  // 開き括弧は行の最後のマスに置かない
  const r2 = Genko.layout([{ title: '', body: 'あ'.repeat(19) + '「い」' }], { chars: 20, lines: 20, chapterTitles: false });
  assert.equal(r2.pages[0][0].cells.length, 19);
  assert.equal(r2.pages[0][1].cells[0].t, '「');
  // ページ数
  const r3 = Genko.layout([{ title: '', body: Array.from({ length: 50 }, () => 'あ'.repeat(20)).join('\n') }], { chars: 20, lines: 20, chapterTitles: false });
  assert.equal(r3.pages.length, 3);
});

test('名前を考える：種類ごとの形・読み・重なりなし・すでにある名前は出さない', () => {
  require('../js/names.js');
  const { Names } = globalThis.Tsuzuri;
  Object.keys(Names.STYLES).forEach((st) => {
    const list = Names.generate(st, { seed: 3, count: 20 });
    assert.equal(list.length, 20, st);
    assert.equal(new Set(list.map((n) => n.name)).size, 20, st + '：同じ名前を出さない');
  });
  const jp = Names.generate('jp', { seed: 5, count: 30, gender: 'f' });
  assert.ok(jp.every((n) => /^[ぁ-ん]+ [ぁ-ん]+$/.test(n.reading) && n.name === n.family + n.given && n.note === '女性'));
  assert.ok(Names.generate('jpOld', { seed: 2, count: 60 }).every((n) => !/^.+お/.test(n.name) || !n.family), '「お菊」に姓を付けない');
  assert.ok(Names.generate('west', { seed: 1, count: 10 }).every((n) => /^[ァ-ヶー]+・/.test(n.name)));
  assert.ok(Names.generate('placeJp', { seed: 1, count: 10 }).every((n) => /^[ぁ-ん]+$/.test(n.reading)));
  // 同じシードなら同じ結果、すでにある名前は避ける
  assert.deepEqual(Names.generate('elf', { seed: 9, count: 5 }), Names.generate('elf', { seed: 9, count: 5 }));
  const first = Names.generate('jp', { seed: 4, count: 1 })[0].name;
  assert.ok(!Names.generate('jp', { seed: 4, count: 10, avoid: [first] }).some((n) => n.name === first));
});

test('時間がかかりすぎない：とても長い漢字の並び・閉じない記号・細工したテキストの取り込み', () => {
  const { Text, Publish, ImportText } = globalThis.Tsuzuri;
  require('../js/readings.js');
  const t0 = Date.now();
  Publish.convert('漢'.repeat(100000), 'narou', {});
  Text.rubyToHtml('漢'.repeat(100000), { vertical: true });
  Text.rubyToHtml('《《'.repeat(50000), {});
  ImportText.normalizeMarkup('あ'.repeat(100000) + '［＃');
  ImportText.normalizeMarkup('［＃'.repeat(50000));
  ImportText.normalizeMarkup('[[rb:'.repeat(40000));
  assert.ok(Date.now() - t0 < 3000, '合わせて3秒以内（' + (Date.now() - t0) + 'ms）');
  // ふつうのルビ・傍点はこれまでどおり
  assert.equal(Text.rubyToHtml('東京《とうきょう》と《《強調》》'), '<ruby>東京<rt>とうきょう</rt></ruby>と<em class="boten">強調</em>');
});

test('世界観ルール：単位・お金・暦・時計・文明・外来語を、この世界の言い方に換算して指摘する', () => {
  require('../js/worldrules.js');
  const { WorldRules: W } = globalThis.Tsuzuri;
  assert.equal(W.parseNum('二百五十'), 250);
  assert.equal(W.parseNum('一万二千'), 12000);
  assert.equal(W.parseNum('２５０'), 250);
  assert.equal(W.kanji(12030), '一万二千三十');
  const rules = {
    units: { list: [{ kind: 'length', name: '歩', amount: 0.75 }, { kind: 'length', name: '里', amount: 4000 }, { kind: 'weight', name: '斤', amount: 600 }] },
    currency: { units: [{ name: '金貨', value: 10000 }, { name: '銀貨', value: 100 }, { name: '銅貨', value: 1 }], yen: 100 },
    calendar: { era: '王国暦', weekdays: ['光の日', '風の日', '火の日', '水の日', '木の日', '金の日', '土の日'], months: Array.from({ length: 12 }, (_, i) => (i + 1) + 'の月'), noClock: true },
    tech: { cats: ['electric', 'clock', 'firearm'], loanwords: true },
  };
  const t = '「百メートル先だ」五キロ歩いた。十キロの荷物。三千メートル。千円。関東一円。円形。白金貨。月曜日。西暦。三月。三ヶ月。三時。一時は。十分だ。十分後。電話。砂時計。時計。拳銃。ドア。ドアノブ。リオ。センチメンタル。インチキ。';
  const got = {};
  W.scan(t, rules, { names: ['リオ'] }).forEach((f) => { got[t.slice(f.start, f.end)] = f.suggestion; });
  assert.equal(got['百メートル'], '約百三十歩');
  assert.equal(got['五キロ'], '一里あまり');
  assert.equal(got['十キロ'], '約十七斤', '「十キロの荷物」は重さ');
  assert.equal(got['三千メートル'], '一里足らず');
  assert.equal(got['千円'], '銅貨十枚');
  assert.ok('白金貨' in got && got['月曜日'] === '光の日' && got['西暦'] === '王国暦' && got['三月'] === '3の月');
  assert.ok('三時' in got && '十分' in got && got['電話'] === '使い' && '時計' in got && '拳銃' in got && got['ドア'] === '戸');
  // 拾ってはいけないもの
  ['関東一円', '一円', '円形', '三ヶ月', 'ヶ月', '一時', '砂時計', 'ドアノブ', 'リオ', 'センチ', 'インチ'].forEach((w) => assert.ok(!(w in got), w + ' は指摘しない'));
  assert.equal(Object.keys(got).filter((k) => k === '十分').length, 1, '「十分だ」は時間ではない');
  // 決めていない種類は指摘しない
  assert.equal(W.scan('百メートルと千円', { units: { list: [{ kind: 'weight', name: '斤', amount: 600 }] } }).length, 0);
  assert.equal(W.active({}), false);
});

test('世界観ルール：設定矛盾チェックに組み込み（台詞は常に・地の文は語り手しだい・NGワードと重ならない）', () => {
  const { Consistency } = globalThis.Tsuzuri;
  const rules = { ng: [{ word: 'メートル', suggestion: '歩' }], units: { list: [{ kind: 'length', name: '歩', amount: 0.75 }] }, tech: { cats: ['electric'] } };
  const text = '「百メートル先だ」\n　彼は電話を取った。二十メートル先に。';
  const omni = Consistency.check(text, { entries: [], rules, narrator: 'omniscient' }).issues;
  const first = Consistency.check(text, { entries: [], rules, narrator: 'first' }).issues;
  const w = (list) => list.filter((i) => i.ruleId === 'world').map((i) => i.text);
  const ng = (list) => list.filter((i) => i.ruleId === 'ng-word').map((i) => i.text);
  // NGワード「メートル」があるので、単位の指摘はそこと重ならない（電話だけ）
  assert.deepEqual(w(omni), ['電話'], '神視点：地の文の単位は指摘しないが、この世界にない物（電話）は指摘する');
  assert.deepEqual(ng(omni), ['メートル']);
  assert.deepEqual(ng(first), ['メートル', 'メートル']);
  // NGワードがなければ、単位の指摘が換算つきで出る
  const res = Consistency.check(text, { entries: [], rules: { units: rules.units }, narrator: 'first' }).issues.filter((i) => i.ruleId === 'world');
  assert.deepEqual(res.map((i) => [i.text, i.suggestion]), [['百メートル', '約百三十歩'], ['二十メートル', '約二十七歩']]);
  assert.ok(res.every((i) => i.fixable));
});

test('世界観ルール：試行錯誤で見つけた誤検出を起こさない', () => {
  const { WorldRules: W } = globalThis.Tsuzuri;
  const rules = {
    units: { list: [{ kind: 'length', name: '歩', amount: 0.75 }, { kind: 'length', name: '里', amount: 4000 }, { kind: 'weight', name: '斤', amount: 600 }] },
    currency: { units: [{ name: '金貨', value: 10000 }, { name: '銀貨', value: 100 }, { name: '銅貨', value: 1 }], yen: 100 },
    calendar: { months: Array.from({ length: 12 }, (_, i) => (i + 1) + 'の月'), noClock: true },
    tech: { cats: ['firearm', 'electric', 'vehicle', 'record', 'paper'], loanwords: true },
  };
  const found = (t) => W.scan(t, rules).map((f) => [t.slice(f.start, f.end), f.suggestion]);
  // 期間の「一月ほど」「三月後」は月の名前ではない／「十分です」「十分でいい」は時間ではない
  assert.deepEqual(found('一月ほど旅をした。三月後に会おう。十分です。十分でいいよ。五分五分だ。三分の一。'), []);
  assert.deepEqual(found('一月一日'), [['一月', '1の月']]);
  // 「一ミリも」→「少しも」、とても大きさの違う「数十キロ」や1枚に満たない「十円」は言い換えを出さない
  assert.deepEqual(found('一ミリも動かない'), [['一ミリ', '少し']]);
  assert.deepEqual(found('数十キロの道'), [['数十キロ', null]]);
  assert.deepEqual(found('十円玉'), [['十円', null]]);
  // 全角の数字はそのまま全角で
  assert.deepEqual(found('１万円'), [['１万円', '銀貨１枚']]);
  // 熟語の一部の「銃」は置き換えない（「銃眼」→「弩眼」にしない）
  assert.deepEqual(found('銃眼から'), [['銃', null]]);
  // 和風（外来語を控える）では、言い換えも和風に
  assert.deepEqual(found('電話と列車と写真と紙幣'), [['電話', '使い'], ['列車', '駕籠'], ['写真', '絵姿'], ['紙幣', '小判']]);
  assert.deepEqual(found('障子を開けるとテーブルがあった。ドアノブ。ゴロゴロ。'), [['テーブル', '卓']]);
});

test('造語のお金：組み合わせを考える・設定にないお金や書き間違い・読みの登録・表記ゆれ', () => {
  const { WorldRules: W, Consistency } = globalThis.Tsuzuri;
  require('../js/readings.js');
  const { Readings } = globalThis.Tsuzuri;
  // 漢字の造語は「〜貨」で読みつき、高い順・名前は重ならない
  const sets = W.coinSets('kanji', 5, 6);
  assert.equal(sets.length, 6);
  sets.forEach((st) => {
    assert.equal(st.coins.length, 3);
    assert.ok(st.coins.every((c) => /貨$/.test(c.name) && /^[ぁ-ん]+か$/.test(c.reading)));
    assert.ok(st.coins[0].value > st.coins[1].value && st.coins[1].value > st.coins[2].value && st.coins[2].value === 1);
    assert.equal(new Set(st.coins.map((c) => c.name)).size, 3);
  });
  const kana = W.coinSets('kana', 9, 6);
  assert.ok(kana.every((st) => st.coins.every((c) => /^[ァ-ヴー]{3,5}$/.test(c.name) && !/(.)\1/.test(c.name))));
  // 造語のお金で、設定にないお金・似た名前を見つける（ふつうの「通貨」「小銭」は拾わない）
  const rules = { currency: { units: [{ name: '黒聖貨', value: 10000, reading: 'こくせいか' }, { name: '白銀貨', value: 100 }, { name: '赤銅貨', value: 1 }] } };
  const t = '黒聖貨を三枚。黒星貨を一枚。大黒聖貨。金貨。通貨の価値。雑貨屋。小銭。';
  const got = W.scan(t, rules).map((f) => [t.slice(f.start, f.end), f.suggestion]);
  assert.deepEqual(got, [['黒星貨', '黒聖貨'], ['大黒聖貨', null], ['金貨', null]]);
  // 読みは「読み方」の登録として使われる（ルビの指摘を出さない）
  const reg = Readings.collect({ ideas: [], entries: [], rules });
  assert.ok(reg.some((r) => r.base === '黒聖貨' && r.reading === 'こくせいか' && r.source === 'world'));
  // カタカナの造語のお金も、名前の表記ゆれとして見つける
  const res = Consistency.check('ルークスを払った。', { entries: [], rules: { currency: { units: [{ name: 'ルクス', value: 1 }] } } });
  assert.ok(res.issues.some((i) => i.ruleId === 'name-variant' && i.text === 'ルークス' && i.suggestion === 'ルクス'));
});

test('範囲を詳しい地図にする：拡大・縮尺・引き継ぎ・切り抜き', () => {
  const E = globalThis.Tsuzuri.MapEngine;
  const src = E.newMap('世界', { preset: 'world', size: 'w', seed: 9, countries: true, names: true });
  const n = src.gw * src.gh;
  const Hs = E.decodeHeights(src.height, n);
  const Bs = E.decodeBiomes(src.biome, n);
  const ar = src.areas[0];
  let x0 = 1e9; let y0 = 1e9; let x1 = -1e9; let y1 = -1e9;
  ar.points.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const rect = { x0: x0 - 20, y0: y0 - 20, x1: x1 + 20, y1: y1 + 20 };
  const { map: m, zoom } = E.regionMap(src, Hs, Bs, rect, { seed: 5 });
  assert.ok(zoom > 1.5, '拡大している');
  assert.ok(Math.max(m.gw, m.gh) === 300 && Math.min(m.gw, m.gh) >= 80);
  assert.ok(Math.abs(m.style.kmPerCell - src.style.kmPerCell / zoom) < 0.01, '縮尺も拡大に合わせる');
  assert.equal(m.style.grid === 'latlon', false);
  assert.ok(m.region && m.region.from === src.id);
  // 引き継ぎ：国の塗り（切り抜き）・国境・国名・首都（絵の素材に）
  assert.ok(m.areas.some((a) => a.name === ar.name && a.points.every(([x, y]) => x >= -0.5 && y >= -0.5 && x <= m.gw * m.cell + 0.5 && y <= m.gh * m.cell + 0.5)));
  assert.ok(m.labels.some((l) => l.text === ar.name));
  assert.ok(m.stamps.some((s) => s.a === 'castle' && s.name), '世界地図の★は城の絵に');
  assert.ok(m.lines.some((l) => l.kind === 'border'));
  // 文字は地図の外にはみ出さない
  m.labels.forEach((l) => assert.ok(l.x > 0 && l.x < m.gw * m.cell && l.y > 0 && l.y < m.gh * m.cell));
  // 地形：陸の高さを強めて、山や川が出る
  const H = E.decodeHeights(m.height, m.gw * m.gh);
  let land = 0;
  H.forEach((v) => { if (v > 0) land++; });
  assert.ok(land > H.length * 0.2);
  assert.ok(m.stamps.some((s) => /^mountain|^hill/.test(s.a)));
  // 多角形の切り抜き
  const sq = E.clipPolygon([[0, 0], [10, 0], [10, 10], [0, 10]], 5, -5, 20, 20);
  assert.equal(sq.length, 4);
  assert.ok(sq.every(([x]) => x >= 5));
  // 小さすぎる範囲は作らない
  assert.throws(() => E.regionMap(src, Hs, Bs, { x0: 0, y0: 0, x1: 10, y1: 10 }));
});

test('生物の図：大きさの読み取り（数・漢数字・この世界の単位・たとえ）', () => {
  require('../js/worldrules.js');
  require('../js/creature.js');
  const C = globalThis.Tsuzuri.Creature;
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, b), `${a} ≈ ${b}`);
  near(C.parseSize('40m'), 40);
  near(C.parseSize('約四十メートル'), 40);
  near(C.parseSize('３０ｍ'), 30);
  near(C.parseSize('30〜40m'), 35);
  near(C.parseSize('2km'), 2000);
  near(C.parseSize('80センチ'), 0.8);
  near(C.parseSize('五十歩', [{ kind: 'length', name: '歩', amount: 0.75 }]), 37.5);
  near(C.parseSize('旅客機ほど'), 40);
  near(C.parseSize('飛行機くらい'), 40);
  near(C.parseSize('バス2台分'), 24);
  near(C.parseSize('人の5倍'), 8.5);
  assert.equal(C.parseSize(''), null);
  assert.equal(C.parseSize('とても大きい'), null);
  near(C.parseWeight('80t'), 80000);
  near(C.parseWeight('三百キロ'), 300);
  assert.equal(C.fmtLen(37.5), '38m');
  assert.equal(C.fmtLen(2.25), '2.3m');
  assert.equal(C.fmtLen(0.45), '45cm');
  assert.equal(C.fmtWeight(440000), '440t');
  assert.equal(C.fmtWeight(64), '64kg');
  // 名前から形を推し量る
  assert.equal(C.guessPreset('黒竜'), 'dragon');
  assert.equal(C.guessPreset('飛竜ワイバーン'), 'wyvern');
  assert.equal(C.guessPreset('ティラノ型の恐竜'), 'raptor');
  assert.equal(C.guessPreset('海神リヴァイアサン'), 'whale');
  assert.equal(C.guessPreset('霧狼'), 'wolf');
  assert.equal(C.guessPreset('赤鬼'), 'giant');
  assert.equal(C.guessPreset('ふしぎな何か'), null);
});

test('生物の図：全部の形を描ける・大きさと体重の目安・SVG として正しい・名前は文字として扱う', () => {
  require('../js/worldrules.js');
  require('../js/creature.js');
  const C = globalThis.Tsuzuri.Creature;
  // どの形・表し方でも描けて、数値に NaN が混ざらない
  Object.keys(C.PRESETS).forEach((id) => {
    ['figure', 'skeleton', 'xray'].forEach((view) => {
      const svg = C.render({ name: id, fields: {}, figure: { preset: id } }, { view });
      assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), id);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), `${id} ${view} に不正な数がない`);
    });
    const ms = C.measure({ preset: id }, {});
    assert.ok(Math.abs(ms.length / C.PRESETS[id].size - 1) < 1e-6, `${id}：大きさが未入力なら目安の大きさ`);
    assert.ok(ms.weight > 0 && Number.isFinite(ms.weight));
  });
  // 指定した全長に合わせる（飛行機ほどの竜）
  const ms = C.measure({ preset: 'dragon' }, { length: '旅客機ほど' });
  assert.ok(Math.abs(ms.length - 40) < 1e-6);
  assert.equal(ms.basis, 'length');
  assert.ok(ms.weight > 100000 && ms.weight < 2e6, '40m の竜は百トン〜千トンほど');
  assert.ok(ms.wingspan > 30, '翼を広げた幅も出る');
  assert.ok(/難しい/.test(C.flightNote(ms)), '重すぎて飛べない目安');
  // 高さだけ・翼の幅だけでも合わせられる
  assert.ok(Math.abs(C.measure({ preset: 'giant' }, { height: '8m' }).height - 8) < 1e-6);
  assert.ok(Math.abs(C.measure({ preset: 'wyvern' }, { wingspan: '20m' }).wingspan - 20) < 1e-6);
  // 実在の動物くらいの体重になる（目安の範囲）
  const kg = (preset, len) => C.measure({ preset }, { length: len }).weight;
  assert.ok(kg('wolf', '1.8m') > 30 && kg('wolf', '1.8m') < 120);
  assert.ok(kg('horse', '2.6m') > 300 && kg('horse', '2.6m') < 900);
  assert.ok(kg('giant', '1.7m') > 50 && kg('giant', '1.7m') < 110, '人の大きさの巨人は人の体重くらい');
  assert.ok(kg('whale', '25m') > 60000 && kg('whale', '25m') < 300000);
  // 旅客機と比べる（自動）
  const svg = C.render({ name: '<b>竜</b>&"', fields: { length: '40m' }, figure: { preset: 'dragon' } });
  assert.ok(svg.includes('旅客機'), '40m なら旅客機と比べる');
  assert.ok(svg.includes('&lt;b&gt;竜&lt;/b&gt;&amp;&quot;') && !svg.includes('<b>'), '名前はエスケープする');
  // 色は #rrggbb 以外を受け付けない
  const evil = C.render({ name: 'x', fields: {}, figure: { preset: 'dragon', color: 'red" onload="alert(1)', belly: 'url(javascript:1)' } });
  assert.ok(!/onload|javascript/.test(evil));
  // 図を何枚並べても、色の定義（id）がぶつからない
  const a = C.render({ name: 'a', figure: { preset: 'wolf' } });
  const b = C.render({ name: 'b', figure: { preset: 'wolf' } });
  const ids = (s) => [...s.matchAll(/id="([^"]+)"/g)].map((x) => x[1]);
  assert.equal(ids(a).filter((x) => ids(b).includes(x)).length, 0);
  // 形の設定は 0〜1 にまとめ、知らない形はひな形に戻す
  const r = C.resolve({ preset: 'nope', neck: 5, horns: 'zzz' });
  assert.equal(r.preset, 'dragon');
  assert.equal(r.neck, 1);
  assert.equal(r.horns, C.PRESETS.dragon.horns);
});
