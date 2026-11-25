/*
 * 綴り — テキストの取り込み
 * .txt / .md の原稿を、見出し（第一話・# 題・プロローグ など）で話に分ける。
 * 文字コード（UTF-8 / Shift_JIS / UTF-16）の判定、pixiv・青空文庫のルビや傍点の書き方の変換も行う。
 * ブラウザでも Node でも動く純粋関数のみ。
 */
(function (NS) {
  'use strict';

  const NUM = '一二三四五六七八九十百千〇零壱弐参0-9０-９';
  const SEP = '[ 　:：・\\-－―〜~]';
  // 1行まるごとの見出し
  const RE_HEAD = new RegExp(
    '^(?:' +
      '#{1,3}[ 　]*(.+?)' + // Markdown の見出し
      '|(第[' + NUM + ']+[話章節部幕回巻](?:' + SEP + '.*)?)' + // 第一話　題
      '|((?:プロローグ|エピローグ|序章|終章|序幕|終幕|幕間|間章|最終話|最終章|番外編|外伝|あとがき|まえがき)(?:' + SEP + '.*)?)' +
      '|\\[chapter:([^\\]]*)\\]' + // pixiv
    ')[ 　]*$');
  const BREAK = '\f'; // 改ページ（話の区切り）の印

  /** バイト列を文字列に。BOM → UTF-8（厳密）→ Shift_JIS → EUC-JP の順に試す */
  function decodeBytes(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dec = (enc, fatal) => new TextDecoder(enc, fatal ? { fatal: true } : undefined).decode(u8);
    if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return { text: dec('utf-8').replace(/^\ufeff/, ''), encoding: 'UTF-8' };
    if (u8[0] === 0xff && u8[1] === 0xfe) return { text: dec('utf-16le').replace(/^\ufeff/, ''), encoding: 'UTF-16' };
    if (u8[0] === 0xfe && u8[1] === 0xff) return { text: dec('utf-16be').replace(/^\ufeff/, ''), encoding: 'UTF-16' };
    try { return { text: dec('utf-8', true), encoding: 'UTF-8' }; } catch (e) { /* UTF-8 ではない */ }
    const cands = [];
    ['shift_jis', 'euc-jp'].forEach((enc) => {
      try {
        const t = dec(enc);
        const bad = (t.match(/�/g) || []).length;
        const jp = (t.match(/[ぁ-んァ-ヶ一-龠]/g) || []).length;
        cands.push({ text: t, encoding: enc === 'shift_jis' ? 'Shift_JIS' : 'EUC-JP', score: jp - bad * 20 });
      } catch (e) { /* その文字コードに対応していない */ }
    });
    cands.sort((a, b) => b.score - a.score);
    if (cands.length) return { text: cands[0].text, encoding: cands[0].encoding };
    return { text: dec('utf-8'), encoding: 'UTF-8' };
  }

  /** ほかの書き方（pixiv・青空文庫）を、綴りの書き方（|漢字《かんじ》・《《傍点》》）にそろえる */
  function normalizeMarkup(text) {
    let s = String(text || '').replace(/\r\n?/g, '\n').replace(/\ufeff/g, '');
    let ruby = 0;
    let emphasis = 0;
    // pixiv：[[rb:漢字 > かんじ]]、[newpage]
    // 長さに上限をつける（閉じない [[rb: がたくさんあるファイルでも時間がかからないように）
    s = s.replace(/\[\[rb:[ 　]{0,3}([^>\]\n]{1,40}?)[ 　]{0,3}>[ 　]{0,3}([^\]\n]{1,40}?)[ 　]{0,3}\]\]/g, (all, base, rd) => { ruby++; return '|' + base + '《' + rd + '》'; });
    s = s.replace(/^[ 　]*\[newpage\][ 　]*$/gm, BREAK);
    // 青空文庫：X［＃「X」に傍点］ → 《《X》》、改ページ → 話の区切り、そのほかの注記は外す
    // 注記で区切り、直前の文字が「」の中と同じなら傍点にする（前から1度なめるだけ）
    if (s.indexOf('［＃') >= 0) {
      const parts = s.split(/(［＃「[^」\n]{1,60}」に(?:白ゴマ|丸|白丸|黒三角|白三角|二重丸|蛇の目|ばつ)?傍点］)/);
      let acc = '';
      parts.forEach((part, i) => {
        if (i % 2 === 0) { acc += part; return; }
        const target = part.slice(3, part.indexOf('」'));
        if (acc.endsWith(target)) { emphasis++; acc = acc.slice(0, acc.length - target.length) + '《《' + target + '》》'; }
      });
      s = acc;
    }
    s = s.replace(/^[ 　]*［＃改(?:ページ|丁|頁|段|見開き)］[ 　]*$/gm, BREAK);
    s = s.replace(/［＃[^］\n]{0,80}］/g, '');
    // 全角の縦棒「｜」のルビはそのまま使える（綴りも｜と|の両方に対応）
    return { text: s, ruby, emphasis };
  }

  function trimBlank(lines) {
    let a = 0;
    let b = lines.length;
    while (a < b && !lines[a].trim()) a++;
    while (b > a && !lines[b - 1].trim()) b--;
    return lines.slice(a, b);
  }

  /**
   * 話に分ける。mode: 'auto'（見出しで分ける）| 'blank'（空行3つ以上で分ける）| 'none'（分けない）
   * 戻り値：[{ title, body }]
   */
  function splitChapters(text, mode) {
    mode = mode || 'auto';
    const lines = String(text || '').split('\n');
    const out = [];
    let cur = { title: '', lines: [] };
    const flush = () => {
      const body = trimBlank(cur.lines).join('\n');
      if (body.trim() || cur.title) out.push({ title: cur.title, body });
      cur = { title: '', lines: [] };
    };
    let blanks = 0;
    lines.forEach((line) => {
      if (line === BREAK || line.trim() === BREAK) { if (mode !== 'none') flush(); return; }
      const t = line.trim();
      if (mode === 'auto' && t && Array.from(t).length <= 40) {
        const m = RE_HEAD.exec(t);
        if (m) {
          const title = (m[1] || m[2] || m[3] || m[4] || '').trim();
          // 見出しだけの話（中身のない題）が続くときは、前の題を本文の先頭に残さない
          flush();
          cur.title = title;
          blanks = 0;
          return;
        }
      }
      if (mode === 'blank') {
        if (!t) { blanks++; cur.lines.push(line); return; }
        if (blanks >= 3 && cur.lines.some((l) => l.trim())) flush();
        blanks = 0;
      }
      cur.lines.push(line);
    });
    flush();
    // 最初の見出しの前に短い行だけがあれば、それは作品の題（話にしない）
    let docTitle = '';
    if (out.length > 1 && !out[0].title && out.slice(1).some((c) => c.title)) {
      const ls = out[0].body.split('\n').filter((l) => l.trim());
      if (ls.length <= 3 && Array.from(out[0].body.replace(/\s/g, '')).length <= 60) { docTitle = ls[0].trim(); out.shift(); } else out[0].title = '冒頭';
    }
    // 題のない話には仮の題を付ける
    out.forEach((c, i) => { if (!c.title) c.title = out.length === 1 ? '本文' : `第${i + 1}話`; });
    const list = out.length ? out : [{ title: '本文', body: '' }];
    list.docTitle = docTitle;
    return list;
  }

  /** 取り込みの全体：文字列 → { chapters, ruby, emphasis } */
  function parse(text, mode) {
    const n = normalizeMarkup(text);
    const chapters = splitChapters(n.text, mode);
    return { chapters, title: chapters.docTitle || '', ruby: n.ruby, emphasis: n.emphasis };
  }

  NS.ImportText = { decodeBytes, normalizeMarkup, splitChapters, parse, RE_HEAD };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
