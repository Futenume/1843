/*
 * 綴り — 電子書籍（EPUB 3）の書き出し
 * 縦書き（右から左へめくる）・横書き、ルビ・傍点・縦中横、目次、扉。
 * ZIP（無圧縮）も自前で作る。ブラウザでも Node でも動く純粋関数のみ。
 */
(function (NS) {
  'use strict';

  // ───── ZIP（無圧縮） ─────
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const enc = (s) => new TextEncoder().encode(s);

  /** files: [{ name, data: string|Uint8Array }] → Uint8Array（ZIP） */
  function zip(files, date) {
    const d = date || new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const chunks = [];
    const central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc(f.name);
      const data = typeof f.data === 'string' ? enc(f.data) : f.data;
      const crc = crc32(data);
      const flags = f.name === 'mimetype' ? 0 : 0x0800; // 名前は UTF-8
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 10, true);
      lh.setUint16(6, flags, true);
      lh.setUint16(8, 0, true); // 無圧縮
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 10, true);
      ch.setUint16(8, flags, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((a, c) => a + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    const all = chunks.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
    let p = 0;
    all.forEach((c) => { out.set(c, p); p += c.length; });
    return out;
  }

  // ───── EPUB ─────
  // XML に使えない制御文字を除き、& < > " をエスケープ
  const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
  const esc = (s) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function uuidFrom(str) {
    // 作品ごとに変わらない識別子（同じ作品を書き出し直しても、同じ本として扱われる）
    let h1 = 0x811c9dc5;
    let h2 = 0x1b873593;
    const hex = [];
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < str.length; i++) {
        h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 + str.charCodeAt(i) + round, 2246822519) >>> 0;
      }
      // >>> 0 で符号なしに（マイナスの値だと「-」が入って UUID の形にならない）
      hex.push(((h1 ^ h2 ^ Math.imul(round, 0x9e3779b9)) >>> 0).toString(16).padStart(8, '0'));
    }
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
  }

  function xhtml(title, body, vertical, bodyClass) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja" class="' + (vertical ? 'vrtl' : 'hltr') + '">\n' +
      '<head>\n<meta charset="UTF-8"/>\n<title>' + esc(title) + '</title>\n<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n' +
      '<body' + (bodyClass ? ' class="' + bodyClass + '"' : '') + '>\n' + body + '\n</body>\n</html>\n';
  }

  /** 本文1行を XHTML に（ルビ・傍点・縦中横）。表示用の変換（rubyToHtml）は XHTML としても正しい形を返す */
  function lineHtml(line, vertical) {
    const T = NS.Text;
    return T.rubyToHtml(clean(line), { vertical });
  }

  function css(vertical) {
    return [
      '@charset "UTF-8";',
      'html.vrtl { -epub-writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl; writing-mode: vertical-rl; }',
      'html.hltr { -epub-writing-mode: horizontal-tb; -webkit-writing-mode: horizontal-tb; writing-mode: horizontal-tb; }',
      'body { margin: 0; padding: 0; font-family: serif; line-height: 1.85; text-align: justify; word-break: normal; line-break: strict; }',
      'p { margin: 0; padding: 0; }',
      'p.blank { min-height: 1em; }',
      'h1, h2 { font-weight: bold; line-height: 1.4; }',
      vertical ? 'h2 { font-size: 1.25em; margin: 0 0 0 2em; padding-top: 2em; }' : 'h2 { font-size: 1.25em; margin: 2em 0 1.5em; }',
      'ruby rt { font-size: 0.5em; }',
      '.tcy { -epub-text-combine: horizontal; -webkit-text-combine: horizontal; text-combine-upright: all; }',
      'em.boten { font-style: normal; -epub-text-emphasis-style: filled sesame; -webkit-text-emphasis-style: filled sesame; text-emphasis-style: filled sesame; }',
      '.titlepage { text-align: center; }',
      vertical ? '.titlepage h1 { font-size: 1.8em; margin: 0 2em 0 0; padding-top: 3em; letter-spacing: 0.15em; }' : '.titlepage h1 { font-size: 1.8em; margin: 30% 0 1em; letter-spacing: 0.1em; }',
      '.titlepage .author { font-size: 1.1em; margin-top: 2em; }',
      'nav ol { list-style: none; padding: 0; margin: 0; }',
      vertical ? 'nav h1 { font-size: 1.3em; margin: 0 0 0 1.5em; }' : 'nav h1 { font-size: 1.3em; margin: 0 0 1em; }',
    ].join('\n') + '\n';
  }

  /**
   * 作品を EPUB にする。
   * opts: { vertical（既定 true）, author, title, chapters（既定は全話）, date }
   * 戻り値：{ data: Uint8Array, files: [名前…] }
   */
  function build(project, opts) {
    opts = opts || {};
    const vertical = opts.vertical !== false;
    const title = clean(opts.title || project.title || '無題');
    const author = clean(opts.author != null ? opts.author : (project.author || ''));
    const chapters = (opts.chapters || project.chapters || []).filter((c) => c);
    const date = opts.date || new Date();
    const modified = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const uid = 'urn:uuid:' + uuidFrom(String(project.id || title));

    const files = [{ name: 'mimetype', data: 'application/epub+zip' }];
    files.push({ name: 'META-INF/container.xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles>\n<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n</rootfiles>\n</container>\n' });
    files.push({ name: 'OEBPS/style.css', data: css(vertical) });
    files.push({ name: 'OEBPS/title.xhtml', data: xhtml(title, '<section class="titlepage" epub:type="titlepage">\n<h1>' + esc(title) + '</h1>\n' + (author ? '<p class="author">' + esc(author) + '</p>\n' : '') + '</section>', vertical) });
    const items = [];
    chapters.forEach((c, i) => {
      const id = 'c' + String(i + 1).padStart(3, '0');
      const paras = String(c.body || '').replace(/\r\n?/g, '\n').split('\n')
        .map((ln) => (ln.trim() ? '<p>' + lineHtml(ln, vertical) + '</p>' : '<p class="blank"><br/></p>')).join('\n');
      files.push({ name: 'OEBPS/' + id + '.xhtml', data: xhtml(c.title || ('第' + (i + 1) + '話'), '<section epub:type="chapter">\n<h2>' + esc(c.title || '') + '</h2>\n' + paras + '\n</section>', vertical) });
      items.push({ id, title: c.title || ('第' + (i + 1) + '話') });
    });
    const toc = '<nav epub:type="toc" id="toc">\n<h1>目次</h1>\n<ol>\n' + items.map((it) => '<li><a href="' + it.id + '.xhtml">' + esc(it.title) + '</a></li>').join('\n') + '\n</ol>\n</nav>';
    files.push({ name: 'OEBPS/nav.xhtml', data: xhtml('目次', toc, vertical) });
    const opf = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="ja">\n' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
      '<dc:identifier id="uid">' + uid + '</dc:identifier>\n' +
      '<dc:title>' + esc(title) + '</dc:title>\n' +
      (author ? '<dc:creator>' + esc(author) + '</dc:creator>\n' : '') +
      '<dc:language>ja</dc:language>\n' +
      '<meta property="dcterms:modified">' + modified + '</meta>\n' +
      '</metadata>\n<manifest>\n' +
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n' +
      '<item id="style" href="style.css" media-type="text/css"/>\n' +
      '<item id="titlepage" href="title.xhtml" media-type="application/xhtml+xml"/>\n' +
      items.map((it) => '<item id="' + it.id + '" href="' + it.id + '.xhtml" media-type="application/xhtml+xml"/>').join('\n') + '\n' +
      '</manifest>\n<spine page-progression-direction="' + (vertical ? 'rtl' : 'ltr') + '">\n' +
      '<itemref idref="titlepage"/>\n<itemref idref="nav"/>\n' +
      items.map((it) => '<itemref idref="' + it.id + '"/>').join('\n') + '\n' +
      '</spine>\n</package>\n';
    files.push({ name: 'OEBPS/content.opf', data: opf });
    return { data: zip(files, date), files: files.map((f) => f.name) };
  }

  NS.Epub = { crc32, zip, build, uuidFrom };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
