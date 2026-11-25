/*
 * 綴り — 原稿用紙・応募書式の割り付け
 * 本文を「1行◯字 × ◯行」のマスに割り付ける（原稿用紙の書き方に沿って）。
 *   ・題は4マス目から、名前は行の終わりを1マス空けて、そのあと1行空ける
 *   ・句読点や閉じ括弧が行の頭に来るときは、前の行の下にぶら下げる
 *   ・開き括弧が行の最後のマスに来るときは、次の行へ送る
 *   ・半角の数字・英字は2文字で1マス（縦中横）、!? も1マスに
 * ブラウザでも Node でも動く純粋関数のみ（ルビ・傍点の分解は Publish.tokenize を使う）。
 */
(function (NS) {
  'use strict';

  const HEAD_NG = '、。，．」』）】〕〉》］｝’”';
  const TAIL_NG = '「『（【〔〈《［｛‘“';

  /** 1段落の文字列をマスの並びに */
  function cellsOf(line, opts) {
    const toks = NS.Publish.tokenize(line);
    const out = [];
    const pushText = (s, boten) => {
      const chars = Array.from(s);
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if (/[0-9A-Za-z]/.test(c)) {
          // 半角の英数字は2文字ずつ1マス
          let run = c;
          while (i + 1 < chars.length && /[0-9A-Za-z]/.test(chars[i + 1]) && run.length < 2) run += chars[++i];
          out.push({ t: run, tcy: run.length > 1, boten });
          continue;
        }
        if (c === '!' || c === '?') {
          const n = chars[i + 1];
          if (n === '!' || n === '?') { out.push({ t: c + n, tcy: true, boten }); i++; continue; }
          out.push({ t: c === '!' ? '！' : '？', boten });
          continue;
        }
        if (c === ' ') { out.push({ t: '　' }); continue; }
        if (c === '\t') { out.push({ t: '　' }); continue; }
        out.push(boten ? { t: c, boten: true } : { t: c });
      }
    };
    toks.forEach((t) => {
      if (t.type === 'text') pushText(t.text, false);
      else if (t.type === 'em') pushText(t.text, true);
      else {
        pushText(t.base, false);
        if (opts.ruby === 'paren') pushText('（' + t.reading + '）', false);
      }
    });
    return out;
  }

  /**
   * 割り付け。chapters: [{ title, body }]
   * opts: { chars（1行の字数）, lines（1枚の行数）, title, author, chapterTitles（話の題を入れる）, pageBreak（話ごとに改ページ）, ruby: 'drop'|'paren' }
   * 戻り値：{ pages: [[{ cells: [{t,tcy,boten}], hang }]], used（使ったマス） }
   */
  function layout(chapters, opts) {
    opts = Object.assign({ chars: 20, lines: 20, chapterTitles: true, pageBreak: false, ruby: 'drop' }, opts || {});
    const W = Math.max(5, Math.round(opts.chars));
    const L = Math.max(5, Math.round(opts.lines));
    const lines = [];
    let cur = null;
    let used = 0;
    const newLine = () => { cur = { cells: [], hang: null }; lines.push(cur); return cur; };
    const place = (cell) => {
      if (cur.cells.length >= W) {
        // 行の頭に来てはいけない記号は、前の行の下にぶら下げる
        if (cell.t.length === 1 && HEAD_NG.includes(cell.t) && !cur.hang) { cur.hang = cell; used++; return; }
        newLine();
      }
      // 開き括弧が行の最後のマスに来るなら、次の行へ
      if (cell.t.length === 1 && TAIL_NG.includes(cell.t) && cur.cells.length === W - 1) newLine();
      cur.cells.push(cell);
      used++;
    };
    const writeLine = (cells, indent) => {
      newLine();
      for (let i = 0; i < (indent || 0); i++) cur.cells.push({ t: '' });
      cells.forEach(place);
    };
    const blank = () => newLine();
    const toPageTop = () => { while (lines.length % L !== 0) lines.push({ cells: [], hang: null }); };
    const str = (s) => Array.from(String(s || '')).map((t) => ({ t }));

    // 題と名前
    if (opts.title) {
      writeLine(cellsOf(opts.title, opts), 3);
      if (opts.author) {
        const a = cellsOf(opts.author, opts).slice(0, W - 1);
        const pad = Math.max(0, W - 1 - a.length);
        writeLine(a, pad);
      }
      blank();
    }
    const multi = chapters.length > 1;
    chapters.forEach((c, ci) => {
      if (ci > 0 && opts.pageBreak) toPageTop();
      if (opts.chapterTitles && c.title && (multi || c.title !== '本文')) {
        if (ci > 0 && !opts.pageBreak) blank();
        writeLine(str(c.title), 2);
        blank();
      }
      const paras = String(c.body || '').replace(/\r\n?/g, '\n').split('\n');
      // 話の終わりの空行は詰める
      while (paras.length && !paras[paras.length - 1].trim()) paras.pop();
      paras.forEach((p) => {
        if (!p.trim()) { blank(); return; }
        writeLine(cellsOf(p, opts), 0);
      });
    });
    if (!lines.length) newLine();
    const pages = [];
    for (let i = 0; i < lines.length; i += L) pages.push(lines.slice(i, i + L));
    return { pages, used, chars: W, lines: L };
  }

  NS.Genko = { layout, cellsOf, HEAD_NG, TAIL_NG };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
