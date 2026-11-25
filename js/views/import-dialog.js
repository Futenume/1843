/*
 * 綴り — テキストの取り込み（画面）
 * .txt / .md を選ぶか貼り付けると、見出しで話に分けた結果を見ながら取り込める。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, btn, clear, toast } = UI;
  const IT = NS.ImportText;
  const Store = NS.Store;

  const MAX_BYTES = 20 * 1024 * 1024;

  /** opts: { mode: 'append'|'new' }（既定は、作品を開いていれば足す） */
  function open(opts) {
    opts = opts || {};
    const canAppend = !!NS.App.project && opts.mode !== 'new';
    let raw = '';
    let fileName = '';
    let result = null;

    const fileIn = h('input', { type: 'file', accept: '.txt,.md,.text,.markdown,text/plain,text/markdown', hidden: true });
    const fileInfo = h('span', { class: 'small muted' }, '.txt・.md に対応（文字コードは UTF-8・Shift_JIS・UTF-16 を自動で判定）');
    const paste = h('textarea', { class: 'input import-paste', rows: 5, placeholder: 'または、ここに原稿を貼り付けます', 'aria-label': '原稿を貼り付け' });
    const split = h('select', { class: 'input', 'aria-label': '話の分け方' },
      [['auto', '見出しで分ける（第一話・# 題・プロローグ など）'], ['blank', '空行が3つ以上続く所で分ける'], ['none', '分けない（1つの話にする）']]
        .map(([v, l]) => h('option', { value: v }, l)));
    const dest = canAppend ? h('select', { class: 'input', 'aria-label': '取り込み先' },
      h('option', { value: 'append' }, `今の作品「${NS.App.project.title}」の最後に足す`),
      h('option', { value: 'new' }, '新しい作品にする')) : null;
    const listEl = h('ol', { class: 'import-list' });
    const summary = h('div', { class: 'small import-summary' });

    const readFile = (file) => {
      if (!file) return;
      if (file.size > MAX_BYTES) { toast('ファイルが大きすぎます（20MBまで）', 'error'); return; }
      const fr = new FileReader();
      fr.onload = () => {
        const d = IT.decodeBytes(fr.result);
        raw = d.text;
        fileName = file.name.replace(/\.[^.]+$/, '');
        paste.value = '';
        fileInfo.textContent = `${file.name}（${d.encoding}・${UI.fmtNum(Array.from(raw).length)}文字）`;
        update();
      };
      fr.onerror = () => toast('ファイルを読めませんでした', 'error');
      fr.readAsArrayBuffer(file);
    };
    fileIn.addEventListener('change', () => readFile(fileIn.files && fileIn.files[0]));
    paste.addEventListener('input', () => { raw = paste.value; fileName = ''; fileInfo.textContent = '貼り付けた原稿'; update(); });
    split.addEventListener('change', () => update());

    function update() {
      clear(listEl);
      clear(summary);
      if (!raw.trim()) { result = null; summary.appendChild(h('span', { class: 'muted' }, '原稿を選ぶと、ここに話の分かれ方が出ます。')); return; }
      result = IT.parse(raw, split.value);
      const chs = result.chapters;
      let total = 0;
      chs.forEach((c) => {
        const n = NS.Text.stats(c.body).charsNoSpace;
        total += n;
        listEl.appendChild(h('li', null, h('span', { class: 'import-title' }, c.title), h('span', { class: 'muted' }, UI.fmtNum(n) + '字')));
      });
      [h('strong', null, `${chs.length}話・${UI.fmtNum(total)}字`),
        result.title ? h('span', null, `作品名：${result.title}`) : null,
        result.ruby ? h('span', { class: 'muted' }, `pixiv のルビ ${result.ruby}か所を変換`) : null,
        result.emphasis ? h('span', { class: 'muted' }, `傍点 ${result.emphasis}か所を変換`) : null].forEach((el) => { if (el) summary.appendChild(el); });
    }
    update();

    const drop = h('div', { class: 'import-drop' },
      fileIn,
      h('div', { class: 'row wrap' }, btn('ファイルを選ぶ', { icon: 'upload', onClick: () => fileIn.click() }), fileInfo),
      paste);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files && e.dataTransfer.files[0]); });

    UI.modal({
      title: 'テキストを取り込む',
      wide: true,
      body: h('div', { class: 'stack import-dialog' },
        h('p', { class: 'small muted' }, 'ほかのアプリや投稿サイトで書いた原稿を取り込みます。「第一話」「# 題」「プロローグ」のような見出しの行で話に分け、pixiv のルビ（[[rb:漢字 > かんじ]]）や青空文庫の傍点も綴りの書き方に直します。'),
        drop,
        h('div', { class: 'grid-2' }, UI.field('話の分け方', split), dest ? UI.field('取り込み先', dest) : h('span')),
        summary,
        listEl),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: '取り込む', primary: true, onClick: async () => {
          if (!result || !result.chapters.some((c) => c.body.trim())) { toast('取り込む原稿がありません', 'error'); return false; }
          const chs = result.chapters.map((c) => Store.newChapter(c.title, c.body));
          if (dest && dest.value === 'append') {
            const p = NS.App.project;
            // 何も書いていない最初の話は、取り込んだ話で置き換える
            if (p.chapters.length === 1 && !p.chapters[0].body.trim()) p.chapters = [];
            p.chapters.push(...chs);
            NS.App.touch();
            await NS.App.saveNow();
            NS.App.navigate('write', { id: chs[0].id });
            toast(`${chs.length}話を取り込みました`);
            return undefined;
          }
          const p2 = Store.newProject(result.title || fileName || '取り込んだ作品');
          p2.chapters = chs;
          await Store.saveProject(p2);
          await NS.App.openProject(p2.id, 'write');
          toast(`「${p2.title}」として${chs.length}話を取り込みました`);
          return undefined;
        } },
      ],
    });
  }

  NS.ImportDialog = { open };
})(window.Tsuzuri = window.Tsuzuri || {});
