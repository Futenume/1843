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

  NS.PublishDialog = { open, openEpub };
})(window.Tsuzuri = window.Tsuzuri || {});
