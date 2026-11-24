/*
 * 綴り — 投稿サイト用の書き出し
 * ルビ・傍点の記法を、各サイトの書き方に変換する。
 *   なろう：|漢字《かんじ》（傍点は「・」のルビで代用。漢字（かな）の意図しないルビ化を防ぐ）
 *   カクヨム：|漢字《かんじ》・《《傍点》》（そのまま）
 *   pixiv：[[rb:漢字 > かんじ]]・[chapter:題]・[newpage]
 *   （）書き・ルビなし
 * ブラウザでも Node でも動く純粋関数のみ。
 */
(function (NS) {
  'use strict';

  const KANJI = '一-鿿㐀-䶿々〆ヵヶ';
  // 傍点 → |ルビ → 漢字《ルビ》 の順に見る（textstats.js の記法と同じ）
  const RE_TOKEN = new RegExp('《《([^《》\\n]*)》》|[|｜]([^|｜《》\\n]{1,20})《([^《》\\n]{1,30})》|([' + KANJI + ']+)《([^《》\\n]{1,30})》', 'g');

  const FORMATS = {
    narou: { label: '小説家になろう', note: 'ルビは |漢字《かんじ》、傍点はルビの「・」で代用します。「漢字（かな）」が勝手にルビになるのを防ぎます。' },
    kakuyomu: { label: 'カクヨム', note: 'ルビ |漢字《かんじ》 と傍点 《《傍点》》 をそのまま使えます。' },
    pixiv: { label: 'pixiv', note: 'ルビは [[rb:漢字 > かんじ]]、話の題は [chapter:題]、話の区切りは [newpage] にします。傍点はルビの「・」で代用します。' },
    paren: { label: 'ルビを（）書き', note: '漢字（かんじ）の形にします。傍点の記号は外します。メールや、ルビが使えない場所向け。' },
    plain: { label: 'ルビなし', note: 'ルビと傍点の記号を外した本文だけにします。' },
  };

  /** 1行をテキスト・ルビ・傍点に分ける */
  function tokenize(line) {
    const out = [];
    let last = 0;
    RE_TOKEN.lastIndex = 0;
    let m;
    while ((m = RE_TOKEN.exec(line)) !== null) {
      if (m.index > last) out.push({ type: 'text', text: line.slice(last, m.index) });
      if (m[1] != null) out.push({ type: 'em', text: m[1] });
      else if (m[2] != null) out.push({ type: 'ruby', base: m[2], reading: m[3] });
      else out.push({ type: 'ruby', base: m[4], reading: m[5] });
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push({ type: 'text', text: line.slice(last) });
    return out;
  }

  const isBlankChar = (c) => c === ' ' || c === '　' || c === '\t';
  const eachChar = (s, fn) => Array.from(s).map((c) => (isBlankChar(c) ? c : fn(c))).join('');

  // なろうは「漢字（かな）」「漢字(かな)」を自動でルビにするので、意図しない場合は「|」で止める
  const RE_NAROU_PAREN = new RegExp('([' + KANJI + '])([（(])([ぁ-ゖァ-ヺー・]{1,10})([）)])', 'g');

  function renderLine(line, format, st) {
    const toks = tokenize(line);
    return toks.map((t) => {
      if (t.type === 'text') {
        if (format === 'narou') {
          return t.text.replace(RE_NAROU_PAREN, (all, k, open, kana, close) => { st.parenGuard++; return k + '|' + open + kana + close; });
        }
        return t.text;
      }
      if (t.type === 'ruby') {
        if (format === 'narou') {
          if (Array.from(t.base).length > 10 || Array.from(t.reading).length > 10) st.longRuby.push(t.base + '《' + t.reading + '》');
          return '|' + t.base + '《' + t.reading + '》';
        }
        if (format === 'kakuyomu') return '|' + t.base + '《' + t.reading + '》';
        if (format === 'pixiv') return '[[rb:' + t.base + ' > ' + t.reading + ']]';
        if (format === 'paren') return t.base + '（' + t.reading + '）';
        return t.base;
      }
      // 傍点
      st.emphasis++;
      if (format === 'kakuyomu') return '《《' + t.text + '》》';
      if (format === 'narou') return eachChar(t.text, (c) => '|' + c + '《・》');
      if (format === 'pixiv') return eachChar(t.text, (c) => '[[rb:' + c + ' > ・]]');
      return t.text;
    }).join('');
  }

  const OPENERS = '「『（(【〈《〔［“‘';

  function applyLineOptions(line, opts) {
    let s = line;
    if (opts.fullwidthMarks) {
      s = s.replace(/!/g, '！').replace(/\?/g, '？');
    }
    if (opts.indent === 'remove') s = s.replace(/^[ 　\t]+/, '');
    else if (opts.indent === 'add') {
      const body = s.replace(/^[ 　\t]+/, '');
      if (body && OPENERS.indexOf(body[0]) < 0) s = '　' + body;
      else s = body;
    }
    return s;
  }

  /**
   * 本文を変換する。
   * opts: { indent:'keep'|'add'|'remove', blankLines:bool, fullwidthMarks:bool }
   * 戻り値：{ text, stats:{ parenGuard, emphasis, longRuby:[] } }
   */
  function convert(text, format, opts, st) {
    opts = opts || {};
    st = st || { parenGuard: 0, emphasis: 0, longRuby: [] };
    const fmt = FORMATS[format] ? format : 'plain';
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((ln) => applyLineOptions(renderLine(ln, fmt, st), opts));
    let out;
    if (opts.blankLines) {
      // 段落と段落の間に空行（もともとの空行は1つにまとめる）
      out = [];
      lines.forEach((ln) => {
        if (!ln.trim()) { if (out.length && out[out.length - 1] !== '') out.push(''); return; }
        if (out.length && out[out.length - 1] !== '') out.push('');
        out.push(ln);
      });
      while (out.length && out[out.length - 1] === '') out.pop();
      out = out.join('\n');
    } else {
      out = lines.join('\n');
    }
    return { text: out, stats: st };
  }

  /** 複数の話をまとめて変換する */
  function convertChapters(chapters, format, opts) {
    opts = opts || {};
    const st = { parenGuard: 0, emphasis: 0, longRuby: [] };
    const parts = chapters.map((c) => {
      const body = convert(c.body || '', format, opts, st).text;
      if (!opts.includeTitle) return body;
      if (format === 'pixiv') return '[chapter:' + (c.title || '') + ']\n' + body;
      return (c.title || '') + '\n\n' + body;
    });
    const sep = format === 'pixiv' ? '\n[newpage]\n' : '\n\n\n';
    return { text: parts.join(sep), stats: st };
  }

  /** 変換後の文字数（記法を除いた、読者に見える文字数の目安） */
  function visibleLength(text, format) {
    let s = String(text || '');
    if (format === 'pixiv') s = s.replace(/\[\[rb:([^>\]]*?) > [^\]]*\]\]/g, '$1').replace(/\[chapter:[^\]]*\]|\[newpage\]/g, '');
    else if (format === 'narou' || format === 'kakuyomu') s = s.replace(/[|｜]([^|｜《》\n]+)《[^《》\n]*》/g, '$1').replace(/《《([^《》\n]*)》》/g, '$1');
    return Array.from(s.replace(/[\s　]/g, '')).length;
  }

  NS.Publish = { FORMATS, tokenize, convert, convertChapters, visibleLength };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
