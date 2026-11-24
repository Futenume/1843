/*
 * 綴り — プレビュー（読者目線での表示）
 * 縦書き：本のようにページをめくる（広い画面では見開き）。横書き：Web小説風。
 * 目次、文字サイズ、書体、配色、印刷（PDF 保存）に対応。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;
  const T = NS.Text;

  const PREF = Object.assign({ mode: 'tate', size: 18, font: 'serif', theme: 'paper', blank: false }, UI.lsGet('tsuzuri.previewPref', {}));
  const savePref = () => UI.lsSet('tsuzuri.previewPref', PREF);
  const THEMES = { paper: '生成り', white: '白', dark: '黒' };

  let V = null;

  function P() { return NS.App.project; }

  function chapterHtml(c, opts) {
    const vertical = opts.vertical;
    const blank = opts.blank;
    const lines = (c.body || '').split('\n');
    const paras = lines.map((line) => (line.trim() ? '<p>' + T.rubyToHtml(line, { vertical }) + '</p>' : '<p class="pv-blank">　</p>'));
    const body = blank && !vertical ? paras.join('<p class="pv-blank">　</p>') : paras.join('');
    return '<h1 class="pv-title">' + T.escapeHtml(c.title || '') + '</h1>' + body;
  }

  /** プレビューを開く */
  function open(opts) {
    opts = opts || {};
    const p = P();
    if (!p) return;
    if (V) close();
    if (NS.Views.write && NS.Views.write.chapter && NS.Views.write.chapter()) {
      const cur = NS.Views.write.chapter();
      const text = NS.Views.write.getText();
      if (cur && text !== cur.body) { cur.body = text; NS.App.touch(); }
    }
    let idx = p.chapters.findIndex((c) => c.id === opts.chapterId);
    if (idx < 0) idx = 0;
    V = { idx, page: 0, pages: 1, spread: false };
    V.root = h('div', { class: 'pv-overlay pv-theme-' + PREF.theme, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'プレビュー', tabindex: -1 });
    document.body.appendChild(V.root);
    V.onKey = onKey;
    V.onResize = UI.debounce(() => { if (V) layout(true); }, 120);
    document.addEventListener('keydown', V.onKey, true);
    window.addEventListener('resize', V.onResize);
    build();
    V.root.focus();
  }

  function close() {
    if (!V) return;
    document.removeEventListener('keydown', V.onKey, true);
    window.removeEventListener('resize', V.onResize);
    V.root.remove();
    V = null;
  }

  function build() {
    const p = P();
    const c = p.chapters[V.idx];
    clear(V.root);
    V.root.className = 'pv-overlay pv-theme-' + PREF.theme + ' pv-mode-' + PREF.mode;
    V.root.style.setProperty('--pv-size', PREF.size + 'px');
    V.root.style.setProperty('--pv-font', PREF.font === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)');
    const toc = btn('目次', { icon: 'list', small: true, ghost: true });
    toc.addEventListener('click', () => UI.menu(toc, p.chapters.map((ch, i) => ({
      label: `${i + 1}. ${ch.title || '無題'}`, icon: i === V.idx ? 'check' : null, onClick: () => goChapter(i, 0),
    }))));
    const seg = (key, options) => h('div', { class: 'pv-seg' }, options.map(([v, l]) => h('button', {
      type: 'button', class: 'pv-seg-btn' + (PREF[key] === v ? ' active' : ''),
      onclick: () => { PREF[key] = v; savePref(); build(); },
    }, l)));
    const bar = h('div', { class: 'pv-bar' },
      btn('', { icon: 'x', ghost: true, title: '閉じる（Esc）', onClick: close }),
      h('div', { class: 'pv-heading' }, h('span', { class: 'pv-work' }, p.title), h('span', { class: 'pv-chapter' }, c.title || '')),
      h('div', { class: 'pv-tools' },
        toc,
        seg('mode', [['tate', '縦書き'], ['yoko', '横書き']]),
        h('div', { class: 'pv-seg' },
          h('button', { type: 'button', class: 'pv-seg-btn', title: '文字を小さく', 'aria-label': '文字を小さく', onclick: () => { PREF.size = Math.max(12, PREF.size - 1); savePref(); build(); } }, 'A−'),
          h('button', { type: 'button', class: 'pv-seg-btn', title: '文字を大きく', 'aria-label': '文字を大きく', onclick: () => { PREF.size = Math.min(32, PREF.size + 1); savePref(); build(); } }, 'A＋')),
        seg('font', [['serif', '明朝'], ['sans', 'ゴシック']]),
        seg('theme', Object.keys(THEMES).map((k) => [k, THEMES[k]])),
        PREF.mode === 'yoko' ? h('label', { class: 'check small pv-check' }, h('input', { type: 'checkbox', checked: PREF.blank, onchange: (e) => { PREF.blank = e.target.checked; savePref(); build(); } }), '段落の間を空ける') : null,
        btn('印刷・PDF', { icon: 'printer', small: true, ghost: true, onClick: printWork })));
    V.main = h('div', { class: 'pv-main' });
    V.foot = h('div', { class: 'pv-foot' });
    V.root.append(bar, V.main, V.foot);
    if (PREF.mode === 'tate') buildTate(c);
    else buildYoko(c);
  }

  // ───── 縦書き（ページ送り） ─────
  function buildTate(c) {
    V.book = h('div', { class: 'pv-book' });
    V.main.appendChild(V.book);
    V.main.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const r = V.main.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x < 0.4) step(1);
      else if (x > 0.6) step(-1);
    });
    let sx = null;
    V.main.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    V.main.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) > 40) step(dx > 0 ? 1 : -1);
    });
    V.html = chapterHtml(c, { vertical: true });
    layout(false);
  }

  /** ページの大きさを決めて組む */
  function layout(keep) {
    if (!V || PREF.mode !== 'tate') return;
    const size = PREF.size;
    const lh = size * 2;
    const r = V.main.getBoundingClientRect();
    const availH = Math.max(200, r.height - 70);
    const availW = Math.max(200, r.width - 40);
    const pageH = Math.min(availH, size * 42 + 40);
    const linesFor = (w) => Math.max(5, Math.min(20, Math.floor((w - 56) / lh)));
    V.spread = availW >= 2 * (12 * lh + 56) + 24;
    const lines = V.spread ? linesFor((availW - 24) / 2) : linesFor(availW);
    const contentW = lines * lh;
    const firstChar = keep && V.pages > 1 ? V.page / V.pages : 0;
    clear(V.book);
    V.book.classList.toggle('spread', V.spread);
    V.pageEls = [];
    const count = V.spread ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const content = h('div', { class: 'pv-content', html: V.html, style: { width: contentW + 'px', height: (pageH - 64) + 'px', lineHeight: lh + 'px', '--pv-lh': lh + 'px' } });
      const page = h('div', { class: 'pv-page', style: { height: pageH + 'px' } },
        h('div', { class: 'pv-running' }, P().chapters[V.idx].title || ''),
        content,
        h('div', { class: 'pv-nombre' }));
      V.pageEls.push({ page, content });
    }
    // 見開きは右ページが先
    V.pageEls.slice().reverse().forEach((x) => V.book.appendChild(x.page));
    const c0 = V.pageEls[0].content;
    V.pageW = contentW;
    V.pages = Math.max(1, Math.ceil(c0.scrollWidth / contentW - 0.02));
    // 最後のページも1ページ分ずらして表示できるよう、末尾に余白を足す
    V.pageEls.forEach((x) => x.content.appendChild(h('div', { class: 'pv-pad', style: { width: contentW * (V.spread ? 2 : 1) + 'px' } })));
    if (keep) V.page = Math.min(V.pages - 1, Math.floor(firstChar * V.pages));
    if (V.page < 0) V.page = Math.max(0, V.pages - (V.spread ? 2 - (V.pages % 2 ? 1 : 0) : 1));
    if (V.page >= V.pages) V.page = V.pages - 1;
    if (V.spread) V.page -= V.page % 2;
    showPage();
  }

  function showPage() {
    V.pageEls.forEach((x, i) => {
      const n = V.page + i;
      x.content.scrollLeft = -n * V.pageW;
      // 古いブラウザ（scrollLeft が正の値）にも対応
      if (Math.abs(x.content.scrollLeft + n * V.pageW) > 2) x.content.scrollLeft = x.content.scrollWidth - x.content.clientWidth - n * V.pageW;
      x.page.classList.toggle('pv-empty', n >= V.pages);
      x.page.querySelector('.pv-nombre').textContent = n < V.pages ? String(n + 1) : '';
    });
    clear(V.foot);
    const p = P();
    V.foot.append(
      btn('', { icon: 'left', ghost: true, title: '次のページ（←）', onClick: () => step(1) }),
      h('span', { class: 'small' }, `${V.page + 1}${V.spread && V.page + 1 < V.pages ? '–' + (V.page + 2) : ''} / ${V.pages} ページ　（第${V.idx + 1}話／全${p.chapters.length}話）`),
      btn('', { icon: 'right', ghost: true, title: '前のページ（→）', onClick: () => step(-1) }));
  }

  function step(d) {
    const by = V.spread ? 2 : 1;
    const next = V.page + d * by;
    const p = P();
    if (next >= V.pages) {
      if (V.idx < p.chapters.length - 1) goChapter(V.idx + 1, 0);
      else toast('最後のページです');
      return;
    }
    if (next < 0) {
      if (V.idx > 0) goChapter(V.idx - 1, -1);
      return;
    }
    V.page = next;
    showPage();
  }

  function goChapter(i, page) {
    V.idx = i;
    V.page = page;
    build();
  }

  // ───── 横書き（Web小説風） ─────
  function buildYoko(c) {
    const p = P();
    const article = h('article', { class: 'pv-article', html: chapterHtml(c, { vertical: false, blank: PREF.blank }) });
    const nav = h('div', { class: 'pv-chapter-nav' },
      V.idx > 0 ? btn('前の話', { icon: 'left', onClick: () => goChapter(V.idx - 1, 0) }) : h('span'),
      h('span', { class: 'muted small' }, `${T.stats(c.body).charsNoSpace.toLocaleString('ja-JP')}字`),
      V.idx < p.chapters.length - 1 ? btn('次の話', { icon: 'right', onClick: () => goChapter(V.idx + 1, 0) }) : h('span'));
    const scroll = h('div', { class: 'pv-scroll' }, article, nav);
    V.main.appendChild(scroll);
    V.scroll = scroll;
    clear(V.foot);
    V.foot.appendChild(h('span', { class: 'small' }, `第${V.idx + 1}話／全${p.chapters.length}話`));
  }

  function onKey(e) {
    if (!V) return;
    if (document.querySelector('.popmenu') && e.key === 'Escape') return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (PREF.mode === 'tate') {
      if (['ArrowLeft', 'PageDown', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); step(1); }
      else if (['ArrowRight', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); step(-1); }
    }
  }

  // ───── 印刷 ─────
  function printWork() {
    const p = P();
    if (p.chapters.length < 2) { doPrint([p.chapters[V.idx]]); return; }
    UI.modal({
      title: '印刷・PDF保存',
      body: h('p', null, '印刷する範囲を選んでください。印刷画面で「PDFに保存」を選ぶとPDFになります。'),
      actions: [
        { label: '表示中の話', onClick: () => { setTimeout(() => doPrint([p.chapters[V.idx]]), 80); } },
        { label: '全話', primary: true, onClick: () => { setTimeout(() => doPrint(p.chapters), 80); } },
      ],
    });
  }

  function doPrint(chapters) {
    const p = P();
    const vertical = PREF.mode === 'tate';
    const root = h('div', { class: 'pv-print ' + (vertical ? 'pv-print-tate' : 'pv-print-yoko') });
    root.style.setProperty('--pv-size', PREF.size + 'px');
    root.style.setProperty('--pv-font', PREF.font === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)');
    root.appendChild(h('section', { class: 'pv-print-cover' }, h('h1', null, p.title), p.author ? h('p', null, p.author) : null));
    chapters.forEach((c) => root.appendChild(h('section', { class: 'pv-print-chapter', html: chapterHtml(c, { vertical, blank: PREF.blank && !vertical }) })));
    document.body.appendChild(root);
    document.body.classList.add('printing');
    const done = () => {
      document.body.classList.remove('printing');
      root.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('printing')) done(); }, 1000); }, 50);
  }

  NS.Preview = { open, close, isOpen: () => !!V };
})(window.Tsuzuri = window.Tsuzuri || {});
