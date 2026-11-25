/*
 * 綴り — 原稿用紙・応募書式での印刷（画面）
 * 書式を選ぶと、実際の割り付けを見ながら印刷（PDF 保存）できる。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, btn, clear, toast } = UI;
  const G = NS.Genko;

  const FORMATS = {
    genko: { label: '原稿用紙（20字×20行・マス目つき）', chars: 20, lines: 20, grid: true, hashira: true },
    a4_40x30: { label: 'A4横・40字×30行（応募でよくある書式）', chars: 40, lines: 30, grid: false },
    a4_42x34: { label: 'A4横・42字×34行', chars: 42, lines: 34, grid: false },
    custom: { label: '字数と行数を指定する', chars: 30, lines: 40, grid: false },
  };
  const PREF = Object.assign({ format: 'genko', chars: 30, lines: 40, grid: false, title: true, chapterTitles: true, pageBreak: false, ruby: 'drop', range: '*' }, UI.lsGet('tsuzuri.genkoPref', {}));
  const savePref = () => UI.lsSet('tsuzuri.genkoPref', PREF);

  // A4 横（mm）
  const PAGE = { w: 297, h: 210, mx: 14, top: 12, bottom: 18 };

  function geometry(f) {
    const usableW = PAGE.w - PAGE.mx * 2;
    const usableH = PAGE.h - PAGE.top - PAGE.bottom;
    const cols = f.lines + (f.hashira ? 1 : 0);
    let cell;
    let pitch;
    if (f.grid) {
      cell = Math.min(usableH / f.chars, usableW / (cols * 1.45));
      pitch = cell * 1.45;
    } else {
      cell = Math.min(usableH / f.chars, usableW / (cols * 1.5));
      pitch = Math.min(usableW / cols, cell * 2.1);
    }
    const bodyW = pitch * cols;
    const bodyH = cell * f.chars;
    return { cell, pitch, bodyW, bodyH, right: (PAGE.w - bodyW) / 2, top: PAGE.top + (usableH - bodyH) / 2 };
  }

  function currentFormat() {
    const base = FORMATS[PREF.format] || FORMATS.genko;
    if (PREF.format !== 'custom') return base;
    return Object.assign({}, base, { chars: clampInt(PREF.chars, 10, 60), lines: clampInt(PREF.lines, 5, 60), grid: !!PREF.grid });
  }
  function clampInt(v, a, b) { return Math.max(a, Math.min(b, Math.round(+v || a))); }

  function mm(v) { return v.toFixed(2) + 'mm'; }

  /** 1枚を作る */
  function renderPage(lines, f, g, no, total) {
    const page = h('div', { class: 'genko-page' + (f.grid ? ' genko-grid' : '') });
    const body = h('div', { class: 'genko-body', style: { right: mm(g.right), top: mm(g.top), height: mm(g.bodyH), width: mm(g.bodyW) } });
    const lineStyle = { inlineSize: mm(g.bodyH), blockSize: mm(g.pitch), paddingLeft: mm((g.pitch - g.cell) / 2), paddingRight: mm((g.pitch - g.cell) / 2) };
    if (f.grid) lineStyle.backgroundSize = `100% 100%, 100% ${mm(g.cell)}, 100% 100%`;
    const cellStyle = `inline-size:${mm(g.cell)};block-size:${mm(g.cell)};font-size:${mm(g.cell * 0.86)};line-height:${mm(g.cell)}`;
    for (let i = 0; i < f.lines; i++) {
      if (f.hashira && i === f.lines / 2) body.appendChild(h('div', { class: 'genko-hashira', style: { blockSize: mm(g.pitch) } }));
      const ln = lines[i];
      const el = h('div', { class: 'genko-line', style: lineStyle });
      if (ln) {
        const cells = ln.hang ? ln.cells.concat([Object.assign({ hang: true }, ln.hang)]) : ln.cells;
        let last = cells.length;
        while (last > 0 && !cells[last - 1].t) last--;
        for (let k = 0; k < last; k++) {
          const c = cells[k];
          const s = document.createElement('span');
          s.className = 'gc' + (c.tcy ? ' tcy' : '') + (c.boten ? ' boten' : '') + (c.hang ? ' hang' : '');
          s.setAttribute('style', cellStyle);
          s.textContent = c.t || '　';
          el.appendChild(s);
        }
      }
      body.appendChild(el);
    }
    page.append(body, h('div', { class: 'genko-no' }, total > 1 ? `${no} / ${total}` : ''));
    return page;
  }

  function chaptersFor(p) {
    return PREF.range === '*' ? p.chapters : p.chapters.filter((c) => c.id === PREF.range);
  }

  function compute(p) {
    const f = currentFormat();
    const r = G.layout(chaptersFor(p), {
      chars: f.chars, lines: f.lines, title: PREF.title ? p.title : '', author: PREF.title ? (p.author || '') : '',
      chapterTitles: PREF.chapterTitles, pageBreak: PREF.pageBreak, ruby: PREF.ruby,
    });
    return { f, r, g: geometry(f) };
  }

  function open() {
    const p = NS.App.project;
    if (!p) return;
    if (NS.Views.write && NS.Views.write.chapter && NS.Views.write.chapter()) {
      const cur = NS.Views.write.chapter();
      const text = NS.Views.write.getText();
      if (cur && text !== cur.body) { cur.body = text; NS.App.touch(); }
    }
    if (PREF.range !== '*' && !p.chapters.some((c) => c.id === PREF.range)) PREF.range = '*';
    const fmt = h('select', { class: 'input', 'aria-label': '書式' }, Object.keys(FORMATS).map((k) => h('option', { value: k, selected: PREF.format === k }, FORMATS[k].label)));
    const chars = h('input', { class: 'input input-num', type: 'number', min: 10, max: 60, value: PREF.chars, 'aria-label': '1行の字数' });
    const lines = h('input', { class: 'input input-num', type: 'number', min: 5, max: 60, value: PREF.lines, 'aria-label': '1枚の行数' });
    const grid = h('input', { type: 'checkbox', checked: !!PREF.grid });
    const custom = h('div', { class: 'row wrap small' }, '1行', chars, '字 ×', lines, '行', h('label', { class: 'check' }, grid, 'マス目'));
    const range = h('select', { class: 'input', 'aria-label': '印刷する範囲' }, h('option', { value: '*' }, `全話（${p.chapters.length}話）`),
      p.chapters.map((c, i) => h('option', { value: c.id, selected: PREF.range === c.id }, `${i + 1}. ${c.title || '無題'}だけ`)));
    const ruby = h('select', { class: 'input', 'aria-label': 'ルビ' }, h('option', { value: 'drop', selected: PREF.ruby === 'drop' }, 'ルビは外す（漢字だけ）'), h('option', { value: 'paren', selected: PREF.ruby === 'paren' }, 'ルビは（）で書く'));
    const chk = (key, label) => h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!PREF[key], onchange: (e) => { PREF[key] = e.target.checked; savePref(); update(); } }), label);
    const info = h('div', { class: 'small genko-info' });
    const prevBox = h('div', { class: 'genko-preview' });

    function update() {
      PREF.format = fmt.value;
      PREF.chars = clampInt(chars.value, 10, 60);
      PREF.lines = clampInt(lines.value, 5, 60);
      PREF.grid = grid.checked;
      PREF.range = range.value;
      PREF.ruby = ruby.value;
      savePref();
      custom.hidden = PREF.format !== 'custom';
      const { f, r, g } = compute(p);
      clear(info);
      const n400 = chaptersFor(p).reduce((a, c) => a + NS.Text.stats(c.body).charsNoSpace, 0);
      info.append(h('strong', null, `この書式で ${r.pages.length}枚`), h('span', { class: 'muted' }, `（本文 ${UI.fmtNum(n400)}字・400字詰め換算 ${Math.ceil(n400 / 400)}枚の目安）`));
      clear(prevBox);
      const strip = h('div', { class: 'genko-strip' });
      r.pages.slice(0, 2).forEach((pg, i) => strip.appendChild(h('div', { class: 'genko-thumb' }, renderPage(pg, f, g, i + 1, r.pages.length))));
      prevBox.appendChild(strip);
    }
    [fmt, chars, lines, grid, range, ruby].forEach((el) => el.addEventListener('change', update));

    UI.modal({
      title: '原稿用紙・応募書式で印刷',
      wide: true,
      body: h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, '新人賞などに応募するときの書式で、縦書きに割り付けて印刷します。印刷の画面で「PDFに保存」を選ぶと PDF になります（用紙は A4 横）。'),
        h('div', { class: 'grid-2' }, UI.field('書式', fmt), UI.field('範囲', range)),
        custom,
        h('div', { class: 'grid-2' }, UI.field('ルビ', ruby), h('div', { class: 'stack-sm' }, chk('title', '題と名前を最初に入れる'), chk('chapterTitles', '話の題を入れる'), chk('pageBreak', '話ごとに新しい紙から'))),
        info,
        prevBox,
        h('p', { class: 'small muted' }, '句読点や閉じ括弧が行の頭に来るときは前の行の下にぶら下げ、開き括弧は行の終わりに置かない、半角の数字は2桁で1マス、といった原稿用紙の書き方で割り付けます。応募先の規定（字数・行数・ページ番号など）も確かめてください。')),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: '印刷・PDF', primary: true, onClick: () => { setTimeout(() => doPrint(p), 80); } },
      ],
    });
    update();
  }

  function doPrint(p) {
    const { f, r, g } = compute(p);
    const root = h('div', { class: 'genko-print' });
    r.pages.forEach((pg, i) => root.appendChild(renderPage(pg, f, g, i + 1, r.pages.length)));
    const style = h('style', null, '@media print { @page { size: A4 landscape; margin: 0; } }');
    document.head.appendChild(style);
    document.body.appendChild(root);
    document.body.classList.add('printing', 'printing-genko');
    const done = () => {
      document.body.classList.remove('printing', 'printing-genko');
      root.remove();
      style.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('printing-genko')) done(); }, 1500); }, 60);
    toast(`${r.pages.length}枚を印刷します`);
  }

  NS.Manuscript = { open, FORMATS, geometry };
})(window.Tsuzuri = window.Tsuzuri || {});
