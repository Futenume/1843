/*
 * 綴り — 投稿サイト用の書き出し（画面）
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, btn, clear, toast } = UI;
  const PB = NS.Publish;

  const PREF = Object.assign({ format: 'narou', indent: 'keep', blankLines: false, fullwidthMarks: true, includeTitle: false }, UI.lsGet('tsuzuri.publishPref', {}));
  const savePref = () => UI.lsSet('tsuzuri.publishPref', PREF);

  async function copyText(text, ta) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // クリップボード API が使えない環境（file:// など）では選択してコピー
      try {
        ta.focus();
        ta.select();
        return document.execCommand('copy');
      } catch (e2) { return false; }
    }
  }

  /** 投稿サイト用に書き出す窓を開く。opts: { chapterId } */
  function open(opts) {
    opts = opts || {};
    const p = NS.App.project;
    if (!p) return;
    if (NS.Views.write && NS.Views.write.chapter && NS.Views.write.chapter()) {
      const cur = NS.Views.write.chapter();
      const text = NS.Views.write.getText();
      if (cur && text !== cur.body) { cur.body = text; NS.App.touch(); }
    }
    let target = opts.chapterId && p.chapters.some((c) => c.id === opts.chapterId) ? opts.chapterId : (p.chapters[0] && p.chapters[0].id);

    const body = h('div', { class: 'publish' });
    const out = h('textarea', { class: 'input publish-out', readonly: true, rows: 14, 'aria-label': '書き出した本文', spellcheck: false });
    const info = h('div', { class: 'publish-info small' });
    const fmtBox = h('div', { class: 'chips' });
    const note = h('p', { class: 'small muted' });

    const chapterSel = h('select', { class: 'input', 'aria-label': '書き出す話', onchange: (e) => { target = e.target.value; update(); } },
      p.chapters.map((c, i) => h('option', { value: c.id, selected: c.id === target }, `${i + 1}. ${c.title || '無題'}`)),
      h('option', { value: '*' }, '全話'));
    const indentSel = h('select', { class: 'input', 'aria-label': '段落頭の字下げ', onchange: (e) => { PREF.indent = e.target.value; savePref(); update(); } },
      [['keep', '字下げはそのまま'], ['add', '地の文に字下げを付ける'], ['remove', '字下げを外す']].map(([v, l]) => h('option', { value: v, selected: PREF.indent === v }, l)));
    const check = (key, label) => h('label', { class: 'check small' },
      h('input', { type: 'checkbox', checked: !!PREF[key], onchange: (e) => { PREF[key] = e.target.checked; savePref(); update(); } }), label);

    function renderFormats() {
      clear(fmtBox);
      Object.keys(PB.FORMATS).forEach((k) => fmtBox.appendChild(h('button', {
        type: 'button', class: 'chip' + (PREF.format === k ? ' active' : ''), 'aria-pressed': PREF.format === k ? 'true' : 'false',
        onclick: () => { PREF.format = k; savePref(); renderFormats(); update(); },
      }, PB.FORMATS[k].label)));
      note.textContent = PB.FORMATS[PREF.format].note;
    }

    function chaptersFor() {
      return target === '*' ? p.chapters : p.chapters.filter((c) => c.id === target);
    }

    function update() {
      const res = PB.convertChapters(chaptersFor(), PREF.format, PREF);
      out.value = res.text;
      clear(info);
      const st = res.stats;
      info.appendChild(h('span', null, `${PB.visibleLength(res.text, PREF.format).toLocaleString('ja-JP')}字（記号・空白を除く）`));
      if (st.emphasis && (PREF.format === 'narou' || PREF.format === 'pixiv')) info.appendChild(h('span', { class: 'muted' }, `傍点 ${st.emphasis}か所をルビの「・」に変換`));
      if (st.parenGuard) info.appendChild(h('span', { class: 'muted' }, `「漢字（かな）」${st.parenGuard}か所がルビにならないよう「|」を追加`));
      if (st.longRuby.length) {
        info.appendChild(h('span', { class: 'warn' }, `なろうでは10文字を超えるルビは表示されません：${st.longRuby.slice(0, 3).join('、')}${st.longRuby.length > 3 ? ' ほか' : ''}`));
      }
    }

    body.append(
      h('div', { class: 'small muted' }, '書き出し先'),
      fmtBox,
      note,
      h('div', { class: 'publish-opts' },
        UI.field('書き出す話', chapterSel),
        UI.field('段落頭', indentSel)),
      h('div', { class: 'row wrap' },
        check('includeTitle', '話の題を入れる'),
        check('blankLines', '段落の間に空行を入れる（Web向け）'),
        check('fullwidthMarks', '半角の ! ? を全角に')),
      out,
      info);
    renderFormats();
    update();

    UI.modal({
      title: '投稿サイト用に書き出す',
      body,
      wide: true,
      actions: [
        { label: '.txt で保存', ghost: true, onClick: () => {
          const name = target === '*' ? p.title : p.title + '_' + ((p.chapters.find((c) => c.id === target) || {}).title || '');
          UI.download(UI.safeFilename(name + '_' + PB.FORMATS[PREF.format].label) + '.txt', out.value);
          return false;
        } },
        { label: 'コピー', primary: true, onClick: async () => {
          const ok = await copyText(out.value, out);
          toast(ok ? 'コピーしました。投稿サイトの本文欄に貼り付けてください' : 'コピーできませんでした。本文を選んでコピーしてください', ok ? undefined : 'error');
          return false;
        } },
      ],
    });
  }

  /** 電子書籍（EPUB）で書き出す */
  function openEpub(opts) {
    opts = opts || {};
    const p = NS.App.project;
    if (!p) return;
    if (NS.Views.write && NS.Views.write.chapter && NS.Views.write.chapter()) {
      const cur = NS.Views.write.chapter();
      const text = NS.Views.write.getText();
      if (cur && text !== cur.body) { cur.body = text; NS.App.touch(); }
    }
    const EP = Object.assign({ vertical: true }, UI.lsGet('tsuzuri.epubPref', {}));
    const title = h('input', { class: 'input', type: 'text', value: p.title, 'aria-label': '本の題' });
    const author = h('input', { class: 'input', type: 'text', value: p.author || '', placeholder: '例：筆名', 'aria-label': '著者名' });
    const dir = h('select', { class: 'input', 'aria-label': '組み方' },
      h('option', { value: 'v', selected: EP.vertical }, '縦書き（右から左へめくる）'),
      h('option', { value: 'h', selected: !EP.vertical }, '横書き（左から右へめくる）'));
    const range = h('select', { class: 'input', 'aria-label': '書き出す範囲' },
      h('option', { value: '*' }, `全話（${p.chapters.length}話）`),
      p.chapters.map((c, i) => h('option', { value: c.id }, `${i + 1}. ${c.title || '無題'}だけ`)));
    UI.modal({
      title: '電子書籍（EPUB）で書き出す',
      body: h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, 'Kindle・Apple Books・楽天Kobo・BOOTH などで読める EPUB 3 の本にします。ルビ・傍点・縦中横（!? や2桁の数字）、目次と扉が付きます。'),
        h('div', { class: 'grid-2' }, UI.field('本の題', title), UI.field('著者名', author)),
        h('div', { class: 'grid-2' }, UI.field('組み方', dir), UI.field('書き出す範囲', range)),
        h('p', { class: 'small muted' }, 'Kindle で出版するときは、この EPUB を Kindle ダイレクト・パブリッシングにそのまま登録できます（表紙の画像は登録の画面で別に付けます）。')),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: '書き出す', primary: true, onClick: () => {
          EP.vertical = dir.value === 'v';
          UI.lsSet('tsuzuri.epubPref', EP);
          if (!p.author && author.value.trim()) { p.author = author.value.trim(); NS.App.touch(); }
          const chapters = range.value === '*' ? p.chapters : p.chapters.filter((c) => c.id === range.value);
          const r = NS.Epub.build(p, { vertical: EP.vertical, title: title.value.trim() || p.title, author: author.value.trim(), chapters });
          UI.download(UI.safeFilename(title.value.trim() || p.title) + '.epub', new Blob([r.data], { type: 'application/epub+zip' }));
          toast('EPUB を書き出しました');
        } },
      ],
    });
  }

  /** Word（.docx）で書き出す：新人賞などの応募書式に合わせた文書 */
  const DOCX_PRESETS = [
    { id: 'a4v40x34', label: 'A4横・縦書き 40字×34行（よくある応募書式）', vertical: true, chars: 40, lines: 34 },
    { id: 'a4v40x30', label: 'A4横・縦書き 40字×30行', vertical: true, chars: 40, lines: 30 },
    { id: 'a4v42x34', label: 'A4横・縦書き 42字×34行', vertical: true, chars: 42, lines: 34 },
    { id: 'a4v20x20', label: 'A4横・縦書き 20字×20行（原稿用紙の字数）', vertical: true, chars: 20, lines: 20 },
    { id: 'a4h40x30', label: 'A4縦・横書き 40字×30行', vertical: false, chars: 40, lines: 30 },
    { id: 'custom', label: '字数と行数を指定' },
  ];
  function openDocx(opts) {
    opts = opts || {};
    const p = NS.App.project;
    if (!p) return;
    if (NS.Views.write && NS.Views.write.chapter && NS.Views.write.chapter()) {
      const cur = NS.Views.write.chapter();
      const text = NS.Views.write.getText();
      if (cur && text !== cur.body) { cur.body = text; NS.App.touch(); }
    }
    const DP = Object.assign({ preset: 'a4v40x34', vertical: true, chars: 40, lines: 34, ruby: 'word', font: 'mincho', titlePage: true, chapterBreak: true, pageNumbers: true }, UI.lsGet('tsuzuri.docxPref', {}));
    const title = h('input', { class: 'input', type: 'text', value: p.title, 'aria-label': '題' });
    const author = h('input', { class: 'input', type: 'text', value: p.author || '', placeholder: '例：筆名', 'aria-label': '名前' });
    const preset = h('select', { class: 'input', 'aria-label': '書式' }, DOCX_PRESETS.map((x) => h('option', { value: x.id, selected: DP.preset === x.id }, x.label)));
    const dir = h('select', { class: 'input', 'aria-label': '組み方' }, h('option', { value: 'v', selected: DP.vertical }, '縦書き（A4横）'), h('option', { value: 'h', selected: !DP.vertical }, '横書き（A4縦）'));
    const chars = h('input', { class: 'input', type: 'number', min: 10, max: 60, value: DP.chars, 'aria-label': '1行の字数' });
    const lines = h('input', { class: 'input', type: 'number', min: 5, max: 60, value: DP.lines, 'aria-label': '1枚の行数' });
    const custom = h('div', { class: 'grid-3' }, UI.field('組み方', dir), UI.field('1行の字数', chars), UI.field('1枚の行数', lines));
    const ruby = h('select', { class: 'input', 'aria-label': 'ルビ' },
      [['word', 'Word のルビにする'], ['paren', '（）で書く'], ['none', '外す（漢字だけ）']].map(([v, l]) => h('option', { value: v, selected: DP.ruby === v }, l)));
    const font = h('select', { class: 'input', 'aria-label': '書体' },
      [['mincho', '明朝'], ['gothic', 'ゴシック']].map(([v, l]) => h('option', { value: v, selected: DP.font === v }, l)));
    const range = h('select', { class: 'input', 'aria-label': '書き出す範囲' },
      h('option', { value: '*' }, `全話（${p.chapters.length}話）`),
      p.chapters.map((c) => h('option', { value: c.id, selected: opts.only && opts.chapterId === c.id }, `${p.chapters.indexOf(c) + 1}. ${c.title || '無題'}だけ`)));
    const chk = (v, label) => { const i = h('input', { type: 'checkbox', checked: !!v }); return { i, el: h('label', { class: 'check' }, i, label) }; };
    const tp = chk(DP.titlePage, '1枚目に題と名前（扉）');
    const cb = chk(DP.chapterBreak, '話ごとに新しいページから');
    const pn = chk(DP.pageNumbers, 'ページ番号を付ける');
    const info = h('p', { class: 'small muted' });
    const cur = () => {
      const ps = DOCX_PRESETS.find((x) => x.id === preset.value) || DOCX_PRESETS[0];
      return ps.id === 'custom' ? { vertical: dir.value === 'v', chars: +chars.value || 40, lines: +lines.value || 34 } : ps;
    };
    const upd = () => {
      custom.hidden = preset.value !== 'custom';
      const c = cur();
      const chs = range.value === '*' ? p.chapters : p.chapters.filter((x) => x.id === range.value);
      const pages = NS.Docx.estimatePages(chs, { chars: c.chars, lines: c.lines, titlePage: tp.i.checked, chapterBreak: cb.i.checked });
      info.textContent = `${c.vertical ? '縦書き' : '横書き'}・1行${c.chars}字・1枚${c.lines}行（${c.chars * c.lines}字）。およそ${pages}枚になります（扉・改ページを含む目安）。`;
    };
    [preset, dir, chars, lines, range, tp.i, cb.i].forEach((el) => el.addEventListener('change', upd));
    [chars, lines].forEach((el) => el.addEventListener('input', upd));
    upd();
    UI.modal({
      title: 'Word（.docx）で書き出す',
      body: h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, '新人賞などの応募でよく指定される書式（A4・縦書き・40字×34行 など）に合わせた Word の文書にします。ルビ・傍点・縦中横（!? や2桁の数字）も Word の書き方で入ります。Word・Pages・Googleドキュメント・LibreOffice で開けます。'),
        h('div', { class: 'grid-2' }, UI.field('題', title), UI.field('名前', author)),
        UI.field('書式', preset), custom,
        h('div', { class: 'grid-3' }, UI.field('ルビ', ruby), UI.field('書体', font), UI.field('書き出す範囲', range)),
        h('div', { class: 'stack-sm' }, tp.el, cb.el, pn.el),
        info,
        h('p', { class: 'small muted' }, '応募先の決まり（字数・行数・書体・扉の書き方など）は、募集要項で必ず確かめてください。')),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: '書き出す', primary: true, onClick: () => {
          const c = cur();
          Object.assign(DP, { preset: preset.value, vertical: c.vertical, chars: c.chars, lines: c.lines, ruby: ruby.value, font: font.value, titlePage: tp.i.checked, chapterBreak: cb.i.checked, pageNumbers: pn.i.checked });
          UI.lsSet('tsuzuri.docxPref', DP);
          if (!p.author && author.value.trim()) { p.author = author.value.trim(); NS.App.touch(); }
          const chapters = range.value === '*' ? p.chapters : p.chapters.filter((x) => x.id === range.value);
          const r = NS.Docx.build(p, { title: title.value.trim() || p.title, author: author.value.trim(), chapters, vertical: c.vertical, chars: c.chars, lines: c.lines, ruby: DP.ruby, font: DP.font, titlePage: DP.titlePage, chapterBreak: DP.chapterBreak, pageNumbers: DP.pageNumbers });
          UI.download(UI.safeFilename(title.value.trim() || p.title) + '.docx', new Blob([r.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
          toast('Word の文書を書き出しました');
        } },
      ],
    });
  }

  NS.PublishDialog = { open, openEpub, openDocx };
})(window.Tsuzuri = window.Tsuzuri || {});
