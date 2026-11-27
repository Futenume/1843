/*
 * 綴り — Word（.docx）の書き出し
 * 新人賞の応募書式（A4・縦書き・40字×34行 など）に合わせた文書を作る。
 * ルビ（Word のルビ）・傍点（圏点）・縦中横（!? や2桁の数字）、扉（題と名前）、話ごとの改ページ。
 * ZIP は EPUB と同じ自前のもの（無圧縮）を使う。ブラウザでも Node でも動く純粋関数のみ。
 */
(function (NS) {
  'use strict';

  const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
  const esc = (s) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ルビ・傍点の書き方（本文と同じ）
  const KANJI = '一-鿿㐀-䶿豈-﫿々〆〇ヶ';
  const RE_TOKEN = new RegExp('《《([^《》\\n]{0,200})》》|[|｜]([^|｜《》\\n]{1,20})《([^《》\\n]{1,30})》|([' + KANJI + ']{1,20})《([^《》\\n]{1,30})》', 'g');

  /** 1行を、ふつうの文字・ルビ・傍点のかたまりに分ける */
  function tokens(line) {
    const out = [];
    let last = 0;
    RE_TOKEN.lastIndex = 0;
    let m;
    while ((m = RE_TOKEN.exec(line))) {
      if (m.index > last) out.push({ t: 'text', s: line.slice(last, m.index) });
      if (m[1] != null) out.push({ t: 'em', s: m[1] });
      else if (m[2] != null) out.push({ t: 'ruby', s: m[2], r: m[3] });
      else out.push({ t: 'ruby', s: m[4], r: m[5] });
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push({ t: 'text', s: line.slice(last) });
    return out;
  }

  /** 縦書きのとき、2桁の半角数字と !? などを縦中横のかたまりに分ける */
  function tcySplit(s, vertical) {
    if (!vertical) return [{ s, tcy: false }];
    const out = [];
    const re = /(^|[^0-9A-Za-z])([0-9]{2})(?![0-9A-Za-z])|[!！][?？]|[?？][!！]|!!|！！|\?\?|？？/g;
    let last = 0;
    let m;
    while ((m = re.exec(s))) {
      let start = m.index;
      let body = m[0];
      if (m[2] != null) { start += m[1].length; body = m[2]; }
      if (start > last) out.push({ s: s.slice(last, start), tcy: false });
      out.push({ s: body.replace(/！/g, '!').replace(/？/g, '?'), tcy: true });
      last = start + body.length;
      re.lastIndex = last;
    }
    if (last < s.length) out.push({ s: s.slice(last), tcy: false });
    return out;
  }

  function run(text, rPr) {
    if (!text) return '';
    return '<w:r>' + (rPr ? '<w:rPr>' + rPr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>';
  }

  /** 本文1行を、Word の段落の中身（w:r の並び）にする */
  function lineRuns(line, o) {
    const out = [];
    let tcyId = o.tcyId || 1;
    const plain = (s, extra) => tcySplit(s, o.vertical).forEach((seg) => {
      const rp = (extra || '') + (seg.tcy ? `<w:eastAsianLayout w:id="${tcyId++}" w:vert="1" w:vertCompress="1"/>` : '');
      out.push(run(seg.s, rp));
    });
    tokens(clean(line)).forEach((tk) => {
      if (tk.t === 'text') plain(tk.s);
      else if (tk.t === 'em') plain(tk.s, `<w:em w:val="${o.vertical ? 'comma' : 'dot'}"/>`);
      else if (o.ruby === 'paren') plain(tk.s + '（' + tk.r + '）');
      else if (o.ruby === 'none') plain(tk.s);
      else {
        const hps = Math.max(8, Math.round(o.sizeHalf / 2));
        out.push('<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="distributeSpace"/><w:hps w:val="' + hps + '"/><w:hpsRaise w:val="' + Math.round(o.sizeHalf * 0.9) + '"/><w:hpsBaseText w:val="' + o.sizeHalf + '"/><w:lid w:val="ja-JP"/></w:rubyPr>' +
          '<w:rt><w:r><w:rPr><w:sz w:val="' + hps + '"/><w:szCs w:val="' + hps + '"/></w:rPr><w:t xml:space="preserve">' + esc(tk.r) + '</w:t></w:r></w:rt>' +
          '<w:rubyBase><w:r><w:t xml:space="preserve">' + esc(tk.s) + '</w:t></w:r></w:rubyBase></w:ruby></w:r>');
      }
    });
    o.tcyId = tcyId;
    return out.join('');
  }

  const PAGE = { A4: [11906, 16838], B5: [10318, 14570] }; // 縦向きの幅・高さ（twip）

  /**
   * 用紙と字数・行数から、余白と文字の間隔を決める。
   * 縦書きは用紙を横向きにし、1行は上から下へ（用紙の高さ方向）、行は右から左へ並ぶ。
   */
  function layout(o) {
    const [pw0, ph0] = PAGE[o.paper] || PAGE.A4;
    const land = o.vertical ? o.landscape !== false : !!o.landscape;
    const pw = land ? ph0 : pw0;
    const ph = land ? pw0 : ph0;
    // 1行の長さの方向（縦書き＝用紙の高さ、横書き＝用紙の幅）
    const lineLenMax = (o.vertical ? ph : pw) - 2 * 1134; // 余白は最低20mm
    const stackMax = (o.vertical ? pw : ph) - 2 * 1134;
    // 文字の大きさ：基本10.5pt。字数が多くて入らなければ小さく（最小8pt）
    let pt = o.size || 10.5;
    const fit = lineLenMax / o.chars / 20; // 1字に使える大きさ（pt）
    if (fit < pt) pt = Math.max(8, Math.floor(fit * 2) / 2);
    const pitch = Math.min(fit, pt * 1.5); // 1字の送り（pt）
    const lineLen = Math.round(pitch * 20 * o.chars);
    const linePitch = Math.max(Math.round(pt * 20 * 1.15), Math.min(Math.round(stackMax / o.lines), Math.round(pt * 20 * 2.6)));
    const stack = linePitch * o.lines;
    const mLine = Math.max(567, Math.round(((o.vertical ? ph : pw) - lineLen) / 2));
    const mStack = Math.max(567, Math.round(((o.vertical ? pw : ph) - stack) / 2));
    return {
      pw, ph, land, pt, sizeHalf: Math.round(pt * 2), linePitch,
      charSpace: Math.round((pitch - pt) * 4096),
      top: o.vertical ? mLine : mStack, bottom: o.vertical ? mLine : mStack,
      left: o.vertical ? mStack : mLine, right: o.vertical ? mStack : mLine,
    };
  }

  function sectPr(L, o) {
    return '<w:sectPr>' +
      (o.pageNumbers ? '<w:footerReference w:type="default" r:id="rIdFooter"/>' : '') +
      `<w:pgSz w:w="${L.pw}" w:h="${L.ph}"${L.land ? ' w:orient="landscape"' : ''}/>` +
      `<w:pgMar w:top="${L.top}" w:right="${L.right}" w:bottom="${L.bottom}" w:left="${L.left}" w:header="567" w:footer="567" w:gutter="0"/>` +
      (o.vertical ? '<w:textDirection w:val="tbRl"/>' : '') +
      `<w:docGrid w:type="linesAndChars" w:linePitch="${L.linePitch}" w:charSpace="${L.charSpace}"/>` +
      '</w:sectPr>';
  }

  function stylesXml(L, fontName) {
    const f = esc(fontName);
    const font = `<w:rFonts w:ascii="${f}" w:eastAsia="${f}" w:hAnsi="${f}" w:cs="${f}"/>`;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' + font + `<w:kern w:val="2"/><w:sz w:val="${L.sizeHalf}"/><w:szCs w:val="${L.sizeHalf}"/><w:lang w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
      '<w:pPrDefault><w:pPr><w:widowControl w:val="0"/><w:snapToGrid w:val="1"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/><w:basedOn w:val="a"/><w:next w:val="a"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="a"/><w:next w:val="a"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="' + Math.round(L.sizeHalf * 1.6) + '"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="a"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>' +
      '</w:styles>';
  }

  /**
   * 作品を Word 文書にする。
   * opts: { title, author, chapters（既定は全話）, vertical（既定 true）, paper（'A4'|'B5'）, chars（1行の字数）, lines（1枚の行数）,
   *         ruby（'word'＝Word のルビ｜'paren'＝（）書き｜'none'＝外す）, font（'mincho'｜'gothic'）, titlePage（扉を付ける）, chapterBreak（話ごとに改ページ）, pageNumbers, date }
   * 戻り値：{ data: Uint8Array, files: [名前…], layout }
   */
  function build(project, opts) {
    opts = opts || {};
    const o = {
      vertical: opts.vertical !== false,
      paper: opts.paper === 'B5' ? 'B5' : 'A4',
      chars: Math.max(10, Math.min(60, +opts.chars || 40)),
      lines: Math.max(5, Math.min(60, +opts.lines || 34)),
      ruby: ['word', 'paren', 'none'].includes(opts.ruby) ? opts.ruby : 'word',
      titlePage: opts.titlePage !== false,
      chapterBreak: opts.chapterBreak !== false,
      pageNumbers: opts.pageNumbers !== false,
      landscape: opts.landscape,
    };
    const L = layout(o);
    o.sizeHalf = L.sizeHalf;
    const title = clean(opts.title || project.title || '無題');
    const author = clean(opts.author != null ? opts.author : (project.author || ''));
    const chapters = (opts.chapters || project.chapters || []).filter((c) => c);
    const date = opts.date || new Date();
    const body = [];
    const para = (inner, pPr) => '<w:p>' + (pPr ? '<w:pPr>' + pPr + '</w:pPr>' : '') + inner + '</w:p>';
    const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    if (o.titlePage) {
      body.push(para('', ''), para('', ''));
      body.push(para(lineRuns(title, o), '<w:pStyle w:val="Title"/>'));
      body.push(para('', ''));
      if (author) body.push(para(run(author), '<w:jc w:val="' + (o.vertical ? 'right' : 'center') + '"/>'));
      if (chapters.length) body.push(pageBreak);
    }
    chapters.forEach((c, i) => {
      if (i > 0) body.push(o.chapterBreak ? pageBreak : para('', ''));
      if (c.title) body.push(para(lineRuns(c.title, o), '<w:pStyle w:val="1"/>'), para('', ''));
      String(c.body || '').replace(/\r\n?/g, '\n').split('\n').forEach((ln) => {
        body.push(para(ln.trim() ? lineRuns(ln, o) : ''));
      });
    });
    const NSW = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ' + NSW + '><w:body>' + body.join('') + sectPr(L, o) + '</w:body></w:document>';
    const footer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ' + NSW + '><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>' +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
    const settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:defaultTabStop w:val="840"/><w:characterSpacingControl w:val="compressPunctuation"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    const iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
        (o.pageNumbers ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '') +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
      { name: 'docProps/core.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + esc(title) + '</dc:title>' + (author ? '<dc:creator>' + esc(author) + '</dc:creator>' : '') + '<dc:language>ja-JP</dc:language>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified></cp:coreProperties>' },
      { name: 'docProps/app.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>綴り</Application></Properties>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
        (o.pageNumbers ? '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : '') +
        '</Relationships>' },
      { name: 'word/document.xml', data: doc },
      { name: 'word/styles.xml', data: stylesXml(L, opts.fontName || (opts.font === 'gothic' ? 'ＭＳ ゴシック' : 'ＭＳ 明朝')) },
      { name: 'word/settings.xml', data: settings },
    ];
    if (o.pageNumbers) files.push({ name: 'word/footer1.xml', data: footer });
    return { data: NS.Epub.zip(files, date), files: files.map((f) => f.name), layout: L };
  }

  /** 何枚になるかの目安（行の頭の禁則などは考えない）。題・扉・話ごとの改ページは数える */
  function estimatePages(chapters, opts) {
    const chars = Math.max(10, +opts.chars || 40);
    const lines = Math.max(5, +opts.lines || 34);
    const strip = (t) => String(t || '').replace(/《《([^《》\n]*)》》/g, '$1').replace(/[|｜]([^|｜《》\n]{1,20})《[^《》\n]{1,30}》/g, '$1').replace(new RegExp('([' + KANJI + ']{1,20})《[^《》\n]{1,30}》', 'g'), '$1');
    let pages = opts.titlePage !== false ? 1 : 0;
    let used = 0;
    chapters.forEach((c, i) => {
      if (i > 0 && opts.chapterBreak !== false && used > 0) { pages += Math.ceil(used / lines); used = 0; } else if (i > 0) used += 1;
      if (c.title) used += 2;
      strip(c.body).replace(/\r\n?/g, '\n').split('\n').forEach((ln) => { used += Math.max(1, Math.ceil(ln.length / chars)); });
    });
    return pages + Math.ceil(used / lines);
  }

  NS.Docx = { build, tokens, layout, estimatePages };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
