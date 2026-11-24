/*
 * 綴り — 添削エンジン（ルールベース）
 * 誤字・慣用句の誤用・重言・ら抜き/い抜き・記号の作法・読みやすさ・表記ゆれ などを検出する。
 * すべてブラウザ内で完結し、外部に本文を送らない。
 */
(function (NS) {
  'use strict';
  const T = NS.Text;
  const FILLER = T.FILLER;

  const RULES = [
    { id: 'typo', name: '誤字・誤変換', category: '誤字', severity: 'error', default: true, fix: true,
      desc: '「完壁」「絶対絶命」などのよくある誤字、「、、」「をを」のような重複を検出します。' },
    { id: 'misuse', name: '慣用句の誤用', category: '語法', severity: 'warning', default: true, fix: true,
      desc: '「的を得る」「汚名挽回」など、誤用とされやすい慣用表現を検出します。' },
    { id: 'redundant', name: '重複表現（重言）', category: '語法', severity: 'warning', default: true, fix: true,
      desc: '「頭痛が痛い」「違和感を感じる」など、意味が重なる表現を検出します。' },
    { id: 'ranuki', name: 'ら抜き言葉', category: '語法', severity: 'warning', default: true, fix: true,
      desc: '「見れる」「来れる」などを検出します。台詞で意図的に使う場合は無視してください。' },
    { id: 'inuki', name: 'い抜き言葉（地の文）', category: '語法', severity: 'info', default: true, fix: true,
      desc: '地の文の「してる」「見てた」などを検出します（会話文は対象外）。' },
    { id: 'brackets', name: '括弧の対応', category: '記号', severity: 'error', default: true,
      desc: '閉じ忘れ・開き忘れ・種類の食い違った括弧を検出します。' },
    { id: 'bracket-period', name: '閉じ括弧前の句点', category: '記号', severity: 'warning', default: true, fix: true,
      desc: '「〜。」のように閉じ括弧の直前にある句点を検出します（小説では省くのが一般的）。' },
    { id: 'ellipsis', name: '三点リーダーの作法', category: '記号', severity: 'warning', default: true, fix: true,
      desc: '「…」の単独使用や「・・・」「...」を「……」に揃えます。' },
    { id: 'dash', name: 'ダッシュの作法', category: '記号', severity: 'warning', default: true, fix: true,
      desc: '「―」の単独使用や欧文ダッシュを「――」に揃えます。' },
    { id: 'exclamation-space', name: '！？の後の全角スペース', category: '記号', severity: 'info', default: true, fix: true,
      desc: '文中の「！」「？」の後に全角スペースを入れる作法をチェックします。' },
    { id: 'halfwidth', name: '半角文字の混在', category: '記号', severity: 'warning', default: true, fix: true,
      desc: '半角カナ、和文中の半角「!?」や半角スペースを検出します。' },
    { id: 'indent', name: '段落の字下げ', category: '体裁', severity: 'info', default: true, fix: true,
      desc: '段落頭の全角スペースの有無を、作品全体の書き方に合わせてチェックします。' },
    { id: 'sentence-length', name: '長すぎる文', category: '読みやすさ', severity: 'info', default: true,
      desc: '設定した文字数を超える一文を検出します。' },
    { id: 'commas', name: '読点の多い文', category: '読みやすさ', severity: 'info', default: true,
      desc: '一文の中の読点（、）が多すぎる箇所を検出します。' },
    { id: 'ending-repeat', name: '同じ文末の連続', category: '読みやすさ', severity: 'info', default: true,
      desc: '「〜た。〜た。〜た。」のように同じ文末が続く箇所を検出します。' },
    { id: 'conj-repeat', name: '接続詞の連続', category: '読みやすさ', severity: 'info', default: true,
      desc: '近い位置で同じ接続詞（しかし、そして…）が繰り返される箇所を検出します。' },
    { id: 'no-chain', name: '「の」の連続', category: '読みやすさ', severity: 'info', default: true,
      desc: '「私の父の友人の家」のように「の」が続く箇所を検出します。' },
    { id: 'hyouki', name: '表記ゆれ', category: '表記', severity: 'info', default: true, fix: true,
      desc: '「出来る／できる」「子供／子ども」など、作品内で表記が揺れている語を検出します。' },
    { id: 'style-rule', name: '表記統一ルール', category: '表記', severity: 'warning', default: true, fix: true,
      desc: '設定資料の「表記統一ルール」に登録した置き換えをチェックします。' },
    { id: 'ruby', name: 'ルビの確認', category: '表記', severity: 'info', default: true, fix: true,
      desc: '空のルビ、普段と違う読み（当て字）、同じ語のルビの揺れを確認します。アイデア帳に「読み方」として登録した読み（例：足《アルファ》）は指摘しません。' },
    { id: 'numbers', name: '算用数字（縦書き向け）', category: '表記', severity: 'info', default: false, fix: true,
      desc: '縦書き原稿向けに、算用数字を漢数字にする提案をします。' },
  ];
  const RULE_MAP = {};
  RULES.forEach((r) => { RULE_MAP[r.id] = r; });

  // [正規表現, 置換（$1 可、null なら提案なし）, メッセージ]
  const TYPO_DICT = [
    ['完壁', '完璧', '「璧（たま）」です'],
    ['絶対絶命', '絶体絶命', ''],
    ['危機一発', '危機一髪', ''],
    ['五里夢中', '五里霧中', ''],
    ['意味深重', '意味深長', ''],
    ['異句同音', '異口同音', ''],
    ['短刀直入', '単刀直入', ''],
    ['自我自賛', '自画自賛', ''],
    ['無我無中', '無我夢中', ''],
    ['責任転化', '責任転嫁', ''],
    ['興味深々', '興味津々', ''],
    ['一同に会', '一堂に会', ''],
    ['厚顔無知', '厚顔無恥', ''],
    ['温古知新', '温故知新', ''],
    ['有頂点', '有頂天', ''],
    ['既製事実', '既成事実', ''],
    ['専問', '専門', ''],
    ['講議', '講義', ''],
    ['感違い', '勘違い', ''],
    ['異和感', '違和感', ''],
    ['除々に', '徐々に', ''],
    ['晴天の霹靂', '青天の霹靂', ''],
    ['ご多聞に漏れず', 'ご多分に漏れず', ''],
    ['極め付け', '極め付き', ''],
    ['新規巻き直し', '新規蒔き直し', ''],
    ['、{2,}', '、', '読点が重なっています'],
    ['。{2,}(?![」』])', '。', '句点が重なっています'],
    ['(?<![ァ-ヴー])をを', 'を', '助詞が重なっています'],
    ['(?<![ァ-ヴー])がが(?!が)', 'が', '助詞が重なっています'],
    ['(?!日に日に|度に度に)([一-龠々]{1,4}[はがをにでと])\\1', '$1', '同じ語が重なっています'],
  ];

  const MISUSE_DICT = [
    ['汚名挽回', '汚名返上', '「汚名返上」または「名誉挽回」が本来の形です'],
    ['的を得', '的を射', ''],
    ['足元をすくわれ', '足をすくわれ', ''],
    ['足もとをすくわれ', '足をすくわれ', ''],
    ['押しも押されぬ', '押しも押されもせぬ', ''],
    ['取り付く暇', '取り付く島', ''],
    ['取りつく暇', '取りつく島', ''],
    ['二の舞を踏', '二の舞を演じ', '「二の舞を演じる」「二の足を踏む」が本来の形です'],
    ['怒り心頭に達', '怒り心頭に発', ''],
    ['舌の先の乾かぬ', '舌の根の乾かぬ', ''],
    ['愛想を振りま', '愛嬌を振りま', ''],
    ['寸暇を惜しまず', '寸暇を惜しんで', ''],
    ['明るみになっ', '明るみに出', '「明るみに出る」「明らかになる」が本来の形です'],
    ['存亡の危機', '存亡の機', ''],
    ['頭をかしげ', '首をかしげ', ''],
    ['雪辱を晴ら', '雪辱を果た', '「雪辱を果たす」「屈辱を晴らす」が本来の形です'],
    ['照準を当て', '照準を合わせ', ''],
    ['熱にうなされ', '熱に浮かされ', ''],
    ['上や下への大騒ぎ', '上を下への大騒ぎ', ''],
    ['濡れ手に粟', '濡れ手で粟', ''],
    ['口先三寸', '舌先三寸', ''],
    ['眉をしかめ', '眉をひそめ', '「眉をひそめる」「顔をしかめる」が本来の形です'],
    ['間が持てな', '間が持たな', ''],
    ['腹が煮えくり返', 'はらわたが煮えくり返', ''],
    ['物議を醸し出', '物議を醸', ''],
    ['笑顔がこぼれ', '笑みがこぼれ', ''],
    ['火蓋を切って落と', '火蓋を切', '「火蓋を切る」「幕を切って落とす」が本来の形です'],
    ['火蓋が切って落とされ', '火蓋が切られ', '「火蓋が切られる」「幕が切って落とされる」が本来の形です'],
    ['采配を振るっ', null, '「采配を振る」が本来の形とされます'],
    ['声を荒げ', '声を荒らげ', '「荒らげる（あららげる）」が本来の形です'],
    ['公算が強い', '公算が大きい', ''],
    ['論戦を張', '論陣を張', ''],
  ];

  const REDUNDANT_DICT = [
    ['頭痛が痛', '頭が痛', ''],
    ['馬から落馬', '落馬', ''],
    ['違和感を感じ', '違和感を覚え', ''],
    ['(?:一番|いちばん)最初', '最初', ''],
    ['(?:一番|いちばん)最後', '最後', ''],
    ['(?:後で|あとで)後悔', '後悔', ''],
    ['返事を返', '返事をす', ''],
    ['被害を(?:被|こうむ)', '被害を受け', ''],
    ['炎天下の下', '炎天下', ''],
    ['まず最初に', 'まず', ''],
    ['過半数を超え', '過半数を占め', ''],
    ['犯罪を犯', '罪を犯', ''],
    ['今の現状', '現状', ''],
    ['元旦の朝', '元旦', '「元旦」は元日の朝のことです'],
    ['必ず必要', '必要', ''],
    ['余分な贅肉', '贅肉', ''],
    ['製造メーカー', 'メーカー', ''],
    ['最後の切り札', '切り札', ''],
    ['古来から', '古来', ''],
    ['従来から', '従来', ''],
    ['挙式を挙げ', '式を挙げ', ''],
    ['思いがけないハプニング', 'ハプニング', ''],
    ['(?:あらかじめ|予め)予(約|定)', '予$1', ''],
    ['食事を食べ', '食事をと', ''],
    ['一応念のため', '念のため', ''],
    ['尽力を尽く', '尽力し', ''],
    ['学校に登校', '登校', ''],
    ['家に帰宅', '帰宅', ''],
    ['車に乗車', '乗車', ''],
    ['席に着席', '着席', ''],
    ['後ろ(?:に|へ)後退', '後退', ''],
    ['前(?:に|へ)前進', '前進', ''],
    ['まだ未(定|熟|完|知|解決)', '未$1', ''],
    ['すべてを網羅', '網羅', ''],
    ['過信しすぎ', '過信し', ''],
    ['約[0-9０-９一二三四五六七八九十百千万]+[^\\s、。」]{0,3}?(?:ほど|程|くらい|ぐらい)', null, '「約」と「ほど／くらい」が重なっています'],
    ['もう一度再', null, '「もう一度」と「再」が重なっています'],
    ['新年明けまして', '明けまして', ''],
    ['お体(?:を)?ご自愛', 'ご自愛', '「ご自愛」に体をいたわる意味が含まれます'],
  ];

  function compileDict(dict) {
    return dict.map(([src, rep, msg]) => ({ re: new RegExp(src, 'g'), rep, msg }));
  }
  const TYPO = compileDict(TYPO_DICT);
  const MISUSE = compileDict(MISUSE_DICT);
  const REDUNDANT = compileDict(REDUNDANT_DICT);

  // ら抜き言葉：一段動詞・カ変の語幹
  const RANUKI_STEMS = [
    '見', '来', '着', '寝', '出',
    '食べ', '起き', '考え', '決め', '覚え', '信じ', '感じ', '投げ', '逃げ', '止め', '辞め', '借り', '生き',
    '降り', '落ち', '浴び', '答え', '教え', '変え', '調べ', '比べ', '集め', '始め', '受け', '続け', '助け',
    '避け', '開け', '付け', '着替え', '耐え', '超え', '越え', '燃え', '見せ', '任せ', '乗せ', '伸び', '用い',
    '認め', '求め', '眺め', '勤め', '努め', '諦め', '確かめ', '閉じ', '演じ', '応じ', '過ぎ', '見つけ',
    '片付け', '出かけ', '出掛け',
  ];
  const RE_RANUKI = new RegExp(
    '(' + RANUKI_STEMS.slice().sort((a, b) => b.length - a.length).join('|') + ')れ(?=(?:る|ない|なく|なかっ|ます|ません|まし|た|て|そう|ず))',
    'g'
  );
  // ひらがな表記（誤検出を避けるため活用形を絞る）
  const RE_RANUKI_KANA = /(こ|(?<![まするさ])み|たべ|おき)れ(?=(?:る|ない|なく|なかっ|ます|ません|まし))/g;

  const RE_INUKI = /((?:[しっいきちびみりえけげせぜてべめれじ]|見|着|寝|出|来|居)(て)|[んい](で))(る|た(?!ま)|ます|ません|まし|ない|なかっ|なく)/g;

  // 表記ゆれグループ（先頭が推奨表記。同数のときは先頭に寄せる）
  const HYOUKI_GROUPS = [
    ['できる', [['でき', '(?<![ぁ-んァ-ヶ一-龠])でき(?=[るたなまずれ])|(?<=[がはもをに])でき(?=[るたなまずれ])'], ['出来', '出来(?=[るたなまずれ])']]],
    ['こと', [['こと', '(?<=[ぁ-ん])こと(?=[がをはにもだでな。、])'], ['事', '(?<=[ぁ-ん])事(?=[がをはにもだでな。、])']]],
    ['とき', [['とき', '(?<=[のたるい])とき(?=[、にはのも])'], ['時', '(?<=[のたるい])時(?=[、にはのも])']]],
    ['ため', [['ため', '(?<=[のるたい])ため(?=[にのだ、])'], ['為', '(?<=[のるたい])為(?=[にのだ、])']]],
    ['ように', [['よう', '(?<=[のるたいな])よう(?=[にな])'], ['様', '(?<=[のるたいな])様(?=[にな])']]],
    ['すべて', [['すべて', 'すべて'], ['全て', '全て']]],
    ['ほとんど', [['ほとんど', 'ほとんど'], ['殆ど', '殆ど']]],
    ['たくさん', [['たくさん', 'たくさん'], ['沢山', '沢山']]],
    ['いっしょ', [['一緒', '一緒'], ['いっしょ', 'いっしょ']]],
    ['きれい', [['きれい', 'きれい'], ['綺麗', '綺麗'], ['奇麗', '奇麗']]],
    ['わかる', [['わか', 'わか(?=[るりらっ])'], ['分か', '分か(?=[るりらっ])'], ['解', '解(?=[るりらっ])'], ['判', '判(?=[るりらっ])']]],
    ['ください', [['くださ', 'くださ(?=[いる])'], ['下さ', '下さ(?=[いる])']]],
    ['いただく', [['いただ', 'いただ(?=[くきけかい])'], ['頂', '頂(?=[くきけかい])']]],
    ['〜ている', [['い', '(?<=[てで])い(?=[るたなまれ])'], ['居', '(?<=[てで])居(?=[るたなまれ])']]],
    ['〜てみる', [['み', '(?<=て)み(?=[るたよまな])'], ['見', '(?<=て)見(?=[るたよまな])']]],
    ['〜ていく', [['い', '(?<=て)い(?=[くかきけこっ])'], ['行', '(?<=て)行(?=[くかきけこっ])']]],
    ['〜てくる', [['くる', '(?<=て)くる'], ['来る', '(?<=て)来る']]],
    ['〜てしまう', [['しま', '(?<=[てで])しま(?=[うっいわえお])'], ['仕舞', '(?<=[てで])仕舞(?=[うっいわえお])']]],
    ['〜ておく', [['お', '(?<=[てで])お(?=[くきかけこい])'], ['置', '(?<=[てで])置(?=[くきかけこい])']]],
    ['〜てほしい', [['ほし', '(?<=[てで])ほし(?=[いくかけ])'], ['欲し', '(?<=[てで])欲し(?=[いくかけ])']]],
    ['子ども', [['子ども', '子ども'], ['子供', '子供']]],
    ['なぜ', [['なぜ', 'なぜ'], ['何故', '何故']]],
    ['どこ', [['どこ', 'どこ'], ['何処', '何処']]],
    ['だれ', [['誰', '誰'], ['だれ', '(?<!な)だれ(?![るた])']]],
    ['ひとり', [['一人', '一人(?![称前っ])'], ['ひとり', 'ひとり(?!でに)']]],
    ['ふたり', [['二人', '二人'], ['ふたり', 'ふたり']]],
    ['ひとつ', [['一つ', '一つ'], ['ひとつ', 'ひとつ']]],
    ['気づく', [['気づ', '気づ'], ['気付', '気付']]],
    ['いったん', [['いったん', 'いったん'], ['一旦', '一旦']]],
    ['さまざま', [['さまざま', 'さまざま'], ['様々', '様々']]],
    ['いろいろ', [['いろいろ', 'いろいろ'], ['色々', '色々']]],
    ['おとなしい', [['おとなし', 'おとなし'], ['大人し', '大人し']]],
    ['すばらしい', [['素晴らし', '素晴らし'], ['すばらし', 'すばらし']]],
    ['ころ', [['頃', '(?<=[のた])頃'], ['ころ', '(?<=[のた])ころ']]],
    ['はず', [['はず', '(?<=[るたいの])はず'], ['筈', '(?<=[るたいの])筈']]],
    ['うなずく', [['頷', '頷'], ['うなず', 'うなず']]],
    ['つぶやく', [['呟', '呟'], ['つぶや', 'つぶや']]],
    ['ほほえむ', [['微笑', '微笑(?=[まみむめん])'], ['ほほえ', 'ほほえ(?=[まみむめん])']]],
    ['ため息', [['ため息', 'ため息'], ['溜息', '溜息'], ['溜め息', '溜め息']]],
    ['まぶしい', [['眩し', '眩し'], ['まぶし', 'まぶし']]],
    ['さらに', [['さらに', 'さらに'], ['更に', '更に']]],
    ['すでに', [['すでに', 'すでに'], ['既に', '既に']]],
    ['振り返る', [['振り返', '振り返'], ['振りかえ', '振りかえ'], ['ふりかえ', 'ふりかえ'], ['振返', '振返']]],
    ['ありがとう', [['ありがとう', 'ありがとう'], ['有難う', '有難う'], ['有り難う', '有り難う']]],
    ['眼鏡', [['眼鏡', '眼鏡'], ['メガネ', 'メガネ'], ['めがね', 'めがね']]],
    ['かもしれない', [['かもしれ', 'かもしれ'], ['かも知れ', 'かも知れ']]],
    ['ちょうど', [['ちょうど', 'ちょうど'], ['丁度', '丁度']]],
    ['もちろん', [['もちろん', 'もちろん'], ['勿論', '勿論']]],
    ['たとえ', [['たとえ', 'たとえ(?!る|て|た|ら|れ)'], ['例え', '例え(?!る|て|た|ら|れ)']]],
    ['すぐ', [['すぐ', 'すぐ(?![れるさ])'], ['直ぐ', '直ぐ']]],
    ['少し', [['少し', '少し'], ['すこし', 'すこし']]],
    ['本当', [['本当', '本当'], ['ほんとう', 'ほんとう']]],
  ].map(([label, variants]) => ({
    label,
    variants: variants.map(([form, src]) => ({ form, re: new RegExp(src, 'g') })),
  }));

  const CONJUNCTIONS = ['しかし', 'だが', 'そして', 'それから', 'けれど', 'けれども', 'でも', 'ところが', 'また', 'さらに',
    'つまり', 'だから', 'なので', 'ただ', 'すると', 'それでも', 'とはいえ', 'そのため', 'ところで', 'やがて'];

  function eachMatch(re, text, fn) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      fn(m);
    }
  }

  function expand(rep, m) {
    if (rep == null) return null;
    return rep.replace(/\$(\d)/g, (_, n) => m[+n] || '');
  }

  function isJa(c) {
    return !!c && /[぀-ヿ一-鿿㐀-䶿\uFF61-\uFF9F々〆ー。、「」『』…―]/.test(c);
  }

  /**
   * 本文を添削する。
   * @param {string} text
   * @param {object} opts { rules:{id:bool}, maxSentenceLength, maxCommas, endingRepeat,
   *                       styleRules:[{from,to}], corpus:[string] (表記ゆれ集計用の作品全文), ignore:Set }
   */
  function proofread(text, opts) {
    opts = opts || {};
    const enabled = (id) => (opts.rules && Object.prototype.hasOwnProperty.call(opts.rules, id) ? !!opts.rules[id] : RULE_MAP[id].default);
    const a = T.analyze(text || '');
    const m = a.masked;
    const issues = [];

    const add = (ruleId, start, end, message, suggestion, extra) => {
      const r = RULE_MAP[ruleId];
      issues.push(Object.assign({
        ruleId,
        rule: r.name,
        category: r.category,
        severity: r.severity,
        start,
        end,
        text: text.slice(start, end),
        message,
        suggestion: suggestion == null ? null : suggestion,
        fixable: suggestion != null && !!r.fix,
        source: 'proofread',
      }, extra || {}));
    };

    const dict = (ruleId, list, label) => {
      if (!enabled(ruleId)) return;
      list.forEach(({ re, rep, msg }) => {
        eachMatch(re, m, (mm) => {
          const sug = expand(rep, mm);
          const message = sug
            ? `${label}：「${mm[0]}」→「${sug}」${msg ? '。' + msg : ''}`
            : `${label}：「${mm[0]}」${msg ? '。' + msg : ''}`;
          add(ruleId, mm.index, mm.index + mm[0].length, message, sug);
        });
      });
    };
    dict('typo', TYPO, '誤字の可能性');
    dict('misuse', MISUSE, '慣用句の誤用');
    dict('redundant', REDUNDANT, '重複表現');

    if (enabled('ranuki')) {
      [RE_RANUKI, RE_RANUKI_KANA].forEach((re) => {
        eachMatch(re, m, (mm) => {
          const stem = mm[1];
          add('ranuki', mm.index, mm.index + mm[0].length, `ら抜き言葉：「${stem}れ」→「${stem}られ」`, stem + 'られ');
        });
      });
    }

    if (enabled('inuki')) {
      eachMatch(RE_INUKI, m, (mm) => {
        if (a.inDialogue[mm.index]) return;
        const te = mm[2] || mm[3];
        const teIndex = mm.index + mm[1].length - 1;
        const before2 = m.slice(Math.max(0, teIndex - 2), teIndex + 1);
        if (before2 === 'なんで' || before2 === 'ないで') return;
        const end = mm.index + mm[0].length;
        const suffix = mm[4];
        add('inuki', teIndex, end, `い抜き言葉：「${te}${suffix}」→「${te}い${suffix}」（地の文）`, te + 'い' + suffix);
      });
    }

    if (enabled('brackets')) checkBrackets(a, add);

    if (enabled('bracket-period')) {
      eachMatch(/。(?=[」』])/g, m, (mm) => {
        add('bracket-period', mm.index, mm.index + 1, '閉じ括弧の直前の句点は省くのが一般的です', '');
      });
    }

    if (enabled('ellipsis')) {
      eachMatch(/…+/g, m, (mm) => {
        if (mm[0].length % 2 === 1) {
          const sug = '…'.repeat(mm[0].length + 1);
          add('ellipsis', mm.index, mm.index + mm[0].length, `三点リーダーは2つ重ねて「${sug}」とするのが一般的です`, sug);
        }
      });
      eachMatch(/・{2,}|\.{3,}|．{3,}|‥+/g, m, (mm) => {
        add('ellipsis', mm.index, mm.index + mm[0].length, `「${mm[0]}」は三点リーダー「……」にするのが一般的です`, '……');
      });
    }

    if (enabled('dash')) {
      eachMatch(/[―─]+/g, m, (mm) => {
        if (mm[0].length === 1) {
          add('dash', mm.index, mm.index + 1, 'ダッシュは2つ重ねて「――」とするのが一般的です', mm[0] + mm[0]);
        }
      });
      eachMatch(/[—–]+/g, m, (mm) => {
        add('dash', mm.index, mm.index + mm[0].length, '欧文ダッシュは和文用の「――」に揃えるのが一般的です', '――');
      });
    }

    if (enabled('exclamation-space')) {
      eachMatch(/[！？!?]+/g, m, (mm) => {
        const next = m[mm.index + mm[0].length];
        if (next === undefined || next === '\n') return;
        if (/[\s　」』）)】〉》〕］”…―─]/.test(next)) return;
        add('exclamation-space', mm.index, mm.index + mm[0].length,
          '文中の「！」「？」の後には全角スペースを入れるのが一般的です', mm[0].replace(/!/g, '！').replace(/\?/g, '？') + '　');
      });
    }

    if (enabled('halfwidth')) {
      eachMatch(/[｡-ﾟ]+/g, m, (mm) => {
        add('halfwidth', mm.index, mm.index + mm[0].length, '半角カナが使われています', mm[0].normalize('NFKC'), { severity: 'error' });
      });
      eachMatch(/[!?]+/g, m, (mm) => {
        const prev = m[mm.index - 1];
        if (!isJa(prev)) return;
        const sug = mm[0].replace(/!/g, '！').replace(/\?/g, '？');
        add('halfwidth', mm.index, mm.index + mm[0].length, '和文中の半角「!?」は全角にするのが一般的です', sug);
      });
      eachMatch(/ +/g, m, (mm) => {
        const prev = m[mm.index - 1];
        const next = m[mm.index + mm[0].length];
        if (!isJa(prev) || !isJa(next)) return;
        add('halfwidth', mm.index, mm.index + mm[0].length, '和文中に半角スペースがあります', '　', { severity: 'info' });
      });
    }

    if (enabled('indent')) checkIndent(a, add);

    const maxLen = opts.maxSentenceLength || 100;
    const maxCommas = opts.maxCommas || 4;
    const readable = [];
    a.sentences.forEach((s) => {
      if (s.kind === 'narration') readable.push(s);
    });
    a.dialogues.forEach((d) => {
      T.innerSentences(m, d).forEach((s) => readable.push(s));
    });
    if (enabled('sentence-length')) {
      readable.forEach((s) => {
        const len = T.visibleLength(s.text);
        if (len > maxLen) {
          add('sentence-length', s.start, s.end, `一文が${len}文字あります（目安：${maxLen}文字以内）。分けると読みやすくなります`, null);
        }
      });
    }
    if (enabled('commas')) {
      readable.forEach((s) => {
        const n = (s.text.match(/[、，]/g) || []).length;
        if (n > maxCommas) {
          add('commas', s.start, s.end, `一文に読点が${n}個あります（目安：${maxCommas}個以内）`, null);
        }
      });
    }

    if (enabled('ending-repeat')) checkEndingRepeat(a, add, opts.endingRepeat || 3);
    if (enabled('conj-repeat')) checkConjunctions(a, add);
    if (enabled('no-chain')) {
      a.sentences.forEach((s) => {
        const pos = [];
        for (let i = s.start; i < s.end - 1; i++) {
          if (m[i] === 'の' && /[一-鿿々ァ-ヶ]/.test(m[i + 1]) && !/[こそあどもか]/.test(m[i - 1] || '')) pos.push(i);
        }
        for (let k = 0; k + 2 < pos.length; k++) {
          if (pos[k + 2] - pos[k] <= 16 && !/[、，]/.test(m.slice(pos[k], pos[k + 2]))) {
            let last = k + 2;
            while (last + 1 < pos.length && pos[last + 1] - pos[last] <= 8 && !/[、，]/.test(m.slice(pos[last], pos[last + 1]))) last++;
            const start = Math.max(s.start, pos[k] - 4);
            const end = Math.min(s.end, pos[last] + 3);
            add('no-chain', start, end, `「の」が${last - k + 1}回続いています。言い換えると読みやすくなります`, null);
            k = last;
          }
        }
      });
    }

    if (enabled('hyouki')) checkHyouki(m, add, opts.corpus);

    if (enabled('style-rule') && Array.isArray(opts.styleRules)) {
      opts.styleRules.forEach((r) => {
        if (!r || !r.from || r.from === r.to) return;
        const re = new RegExp(T.escapeRegExp(r.from), 'g');
        eachMatch(re, m, (mm) => {
          add('style-rule', mm.index, mm.index + mm[0].length,
            r.to ? `表記統一ルール：「${r.from}」→「${r.to}」` : `表記統一ルール：「${r.from}」は使わない設定です`,
            r.to != null ? r.to : null);
        });
      });
    }

    if (enabled('ruby')) checkRuby(text, add, opts);

    if (enabled('numbers')) {
      eachMatch(/[0-9０-９]+/g, m, (mm) => {
        const prev = m[mm.index - 1] || '';
        const next = m[mm.index + mm[0].length] || '';
        if (/[A-Za-z.．,:：]/.test(prev) || /[A-Za-z.．:：%]/.test(next)) return;
        const n = T.parseJaNumber(mm[0]);
        add('numbers', mm.index, mm.index + mm[0].length, '縦書きでは漢数字が一般的です', T.toKanjiNumber(n));
      });
    }

    return finalize(issues, opts.ignore, m);
  }

  function checkBrackets(a, add) {
    const m = a.masked;
    a.paragraphs.forEach((p) => {
      const stack = [];
      for (let i = p.start; i < p.end; i++) {
        const c = m[i];
        if (T.PAIRS[c]) {
          stack.push({ c, i });
        } else {
          let isCloser = false;
          for (const k in T.PAIRS) { if (T.PAIRS[k] === c) { isCloser = true; break; } }
          if (!isCloser) continue;
          if (stack.length && T.PAIRS[stack[stack.length - 1].c] === c) {
            stack.pop();
          } else {
            // 一つ下の階層と対応していれば、間の開き括弧が閉じられていない
            let found = -1;
            for (let k = stack.length - 1; k >= 0; k--) {
              if (T.PAIRS[stack[k].c] === c) { found = k; break; }
            }
            if (found >= 0) {
              for (let k = stack.length - 1; k > found; k--) {
                add('brackets', stack[k].i, stack[k].i + 1, `「${stack[k].c}」が閉じられていません`, null);
              }
              stack.length = found;
            } else {
              add('brackets', i, i + 1, `対応する開き括弧のない「${c}」があります`, null);
            }
          }
        }
      }
      stack.forEach((s) => {
        add('brackets', s.i, s.i + 1, `「${s.c}」が段落内で閉じられていません`, null);
      });
    });
  }

  function checkIndent(a, add) {
    const m = a.masked;
    const narr = [];
    const dlg = [];
    a.paragraphs.forEach((p) => {
      const t = p.text;
      if (!t.trim()) return;
      const first = t[0];
      const firstVisible = t.replace(/^[\s　]+/, '')[0] || '';
      if (/[◇◆■□○●＊*※☆★〜~＝=－\-#]/.test(firstVisible) && t.trim().length <= 12) return; // 場面転換記号
      if (firstVisible === '「' || firstVisible === '『' || firstVisible === '（' || firstVisible === '(') {
        dlg.push({ p, indented: first === '　' || first === ' ' });
      } else {
        narr.push({ p, indented: first === '　', half: first === ' ' });
      }
    });
    if (narr.length >= 2) {
      const ratio = narr.filter((x) => x.indented || x.half).length / narr.length;
      if (ratio >= 0.3) {
        narr.forEach((x) => {
          if (x.half) {
            let e = x.p.start;
            while (m[e] === ' ') e++;
            add('indent', x.p.start, e, '段落頭は半角ではなく全角スペースで字下げするのが一般的です', '　');
          } else if (!x.indented) {
            add('indent', x.p.start, x.p.start + 1, '段落の先頭が字下げされていません', '　' + a.text[x.p.start]);
          }
        });
      }
    }
    if (dlg.length >= 2) {
      const ratio = dlg.filter((x) => x.indented).length / dlg.length;
      if (ratio < 0.5) {
        dlg.forEach((x) => {
          if (x.indented) {
            let e = x.p.start;
            while (m[e] === '　' || m[e] === ' ') e++;
            add('indent', x.p.start, e, '会話文の鉤括弧の前は字下げしないのが一般的です', '');
          }
        });
      }
    }
  }

  function endingKey(sentText) {
    const t = sentText.replace(/[。！？!?\s　]+$/g, '');
    const last = t[t.length - 1];
    return last || '';
  }

  function checkEndingRepeat(a, add, threshold) {
    let run = [];
    let key = null;
    const flush = () => {
      if (run.length >= threshold) {
        for (let i = threshold - 1; i < run.length; i++) {
          const s = run[i];
          const k = endingKey(s.text);
          const endPos = s.end - 1;
          add('ending-repeat', Math.max(s.start, endPos - 2), s.end,
            `「〜${k}。」で終わる文が${i + 1}回続いています。文末に変化をつけると単調さが和らぎます`, null);
        }
      }
      run = [];
      key = null;
    };
    a.sentences.forEach((s) => {
      if (s.kind !== 'narration' || !/。$/.test(s.text)) { flush(); return; }
      const k = endingKey(s.text);
      if (k === key) run.push(s);
      else { flush(); run = [s]; key = k; }
    });
    flush();
  }

  function checkConjunctions(a, add) {
    const starts = [];
    const sorted = CONJUNCTIONS.slice().sort((x, y) => y.length - x.length);
    a.sentences.forEach((s, idx) => {
      if (s.kind !== 'narration') return;
      const lead = s.text.replace(/^[\s　]+/, '');
      const offset = s.text.length - lead.length;
      for (const c of sorted) {
        if (lead.startsWith(c) && /[、，\s　]/.test(lead[c.length] || '')) {
          starts.push({ c, idx, pos: s.start + offset });
          break;
        }
      }
    });
    for (let i = 1; i < starts.length; i++) {
      for (let j = i - 1; j >= 0; j--) {
        if (starts[i].idx - starts[j].idx > 3) break;
        if (starts[j].c === starts[i].c) {
          add('conj-repeat', starts[i].pos, starts[i].pos + starts[i].c.length,
            `接続詞「${starts[i].c}」が近い位置で繰り返されています`, null);
          break;
        }
      }
    }
  }

  function countVariants(group, texts) {
    return group.variants.map((v) => {
      let n = 0;
      texts.forEach((t) => {
        v.re.lastIndex = 0;
        const mm = t.match(v.re);
        if (mm) n += mm.length;
      });
      return n;
    });
  }

  function checkHyouki(m, add, corpus) {
    const texts = Array.isArray(corpus) && corpus.length ? corpus.map((t) => T.maskRuby(t || '')) : [m];
    HYOUKI_GROUPS.forEach((g) => {
      const counts = countVariants(g, texts);
      const used = counts.filter((n) => n > 0).length;
      if (used < 2) return;
      let best = 0;
      counts.forEach((n, i) => { if (n > counts[best]) best = i; });
      const summary = g.variants.map((v, i) => `「${v.form}」${counts[i]}回`).filter((_, i) => counts[i] > 0).join('・');
      g.variants.forEach((v, i) => {
        if (i === best) return;
        eachMatch(v.re, m, (mm) => {
          add('hyouki', mm.index, mm.index + mm[0].length,
            `表記ゆれ（${g.label}）：${summary}。多い方の「${g.variants[best].form}」に揃えますか？`,
            g.variants[best].form);
        });
      });
    });
  }

  /** ルビ：空のルビ・登録と違う読み・揺れ・当て字（登録済みの読みは指摘しない） */
  function checkRuby(text, add, opts) {
    const R = NS.Readings;
    if (!R) return;
    const reg = opts.readings instanceof Map ? opts.readings : R.index(opts.readings || []);
    const corpusR = new Map();
    (Array.isArray(opts.corpus) && opts.corpus.length ? opts.corpus : [text]).forEach((t) => {
      R.findRubies(t || '').forEach((r) => {
        if (!r.reading.trim()) return;
        const n = R.normReading(r.reading);
        if (!corpusR.has(r.base)) corpusR.set(r.base, new Map());
        const mm = corpusR.get(r.base);
        const v = mm.get(n) || { count: 0, reading: r.reading };
        v.count++;
        mm.set(n, v);
      });
    });
    R.findRubies(text).forEach((r) => {
      if (!r.reading.trim()) {
        add('ruby', r.start, r.end, `「${r.base}」のルビが空です`, null, { severity: 'error' });
        return;
      }
      const n = R.normReading(r.reading);
      const entry = reg.get(r.base);
      if (entry) {
        if (entry.readings.has(n)) return; // 登録済みの読み → 指摘しない
        if (R.looksSpecial(r.base, r.reading) || entry.items.some((it) => R.looksSpecial(it.base, it.reading))) {
          const want = entry.items[0].reading;
          add('ruby', r.readingStart, r.readingEnd, `「${r.base}」は「${want}」と読む設定です（本文：「${r.reading}」）`, want, { severity: 'warning' });
        }
        return;
      }
      const variants = corpusR.get(r.base);
      if (variants && variants.size > 1) {
        let best = null;
        variants.forEach((v, k) => { if (!best || v.count > best.count) best = { k, count: v.count, reading: v.reading }; });
        if (best.k !== n) {
          const list = Array.from(variants.values()).map((v) => `「${v.reading}」${v.count}回`).join('・');
          add('ruby', r.readingStart, r.readingEnd,
            `ルビの揺れ：「${r.base}」に${list}。意図した使い分けなら、アイデア帳に読み方を登録すると指摘しなくなります`,
            best.reading, { action: { type: 'register-reading', base: r.base, reading: r.reading } });
          return;
        }
      }
      if (R.looksSpecial(r.base, r.reading)) {
        add('ruby', r.start, r.end,
          `特殊な読み：「${r.base}」を「${r.reading}」と読ませています。意図した読みなら、アイデア帳に「読み方」として登録すると、この指摘は出なくなります`,
          null, { action: { type: 'register-reading', base: r.base, reading: r.reading } });
      }
    });
  }

  function issueKey(it) {
    return it.ruleId + '|' + it.text;
  }

  function finalize(issues, ignore, masked) {
    const seen = new Set();
    const out = [];
    issues.sort((x, y) => x.start - y.start || y.end - x.end);
    issues.forEach((it) => {
      const k = it.ruleId + ':' + it.start + ':' + it.end;
      if (seen.has(k)) return;
      seen.add(k);
      it.key = issueKey(it);
      if (ignore && ignore.has && ignore.has(it.key)) return;
      if (it.ruleId !== 'ruby' && masked && masked.slice(it.start, it.end).indexOf(FILLER) >= 0 && it.suggestion != null) {
        it.suggestion = null;
        it.fixable = false;
      }
      out.push(it);
    });
    return out;
  }

  /** 修正を一括適用する（後ろから順に） */
  function applyFixes(text, issues) {
    const list = issues.filter((it) => it.suggestion != null).sort((x, y) => y.start - x.start);
    let out = text;
    let lastStart = Infinity;
    list.forEach((it) => {
      if (it.end > lastStart) return; // 重なる修正は飛ばす
      if (out.slice(it.start, it.end) !== it.text) return;
      out = out.slice(0, it.start) + it.suggestion + out.slice(it.end);
      lastStart = it.start;
    });
    return out;
  }

  NS.Proofread = { RULES, RULE_MAP, proofread, applyFixes, issueKey, HYOUKI_GROUPS };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
