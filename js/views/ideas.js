/*
 * 綴り — アイデア帳 と プロットボード
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;
  const KINDS = ['アイデア', '台詞', 'シーン', '設定', '伏線', 'タイトル案', '読み方', '資料'];

  function P() { return NS.App.project; }
  function touch() { NS.App.touch(); }

  // ───────────── アイデア帳 ─────────────
  const Ideas = {};
  let IS = null;

  Ideas.mount = function (view) {
    IS = { view, q: '', kind: '', tag: '', pinnedOnly: false };
    build();
  };
  Ideas.unmount = function () { IS = null; };

  function build() {
    clear(IS.view);
    const wrap = h('div', { class: 'ideas' });
    IS.view.appendChild(wrap);

    // すばやくメモ
    const body = h('textarea', { class: 'input quick-input', rows: 3, placeholder: '思いついたことをすぐメモ（Ctrl+Enterで追加）\n例：主人公の剣は、実は亡き師匠の形見だった' });
    const kindSel = h('select', { class: 'input', 'aria-label': '種類' }, KINDS.map((k) => h('option', { value: k }, k)));
    const tags = h('input', { class: 'input', type: 'text', placeholder: 'タグ（、区切り）', 'aria-label': 'タグ' });
    // 種類「読み方」のときは、表記と読みを入れる欄を出す
    const word = h('input', { class: 'input', type: 'text', placeholder: '表記（例：足）', 'aria-label': '表記' });
    const reading = h('input', { class: 'input', type: 'text', placeholder: '読み（例：アルファ）', 'aria-label': '読み' });
    const readingRow = h('div', { class: 'reading-inputs', hidden: true },
      h('span', { class: 'small muted' }, '普段とは違う読み方を登録すると、そのルビは添削で指摘しなくなります。'),
      h('div', { class: 'row' }, word, h('span', { class: 'muted' }, '《'), reading, h('span', { class: 'muted' }, '》')));
    kindSel.addEventListener('change', () => {
      const isReading = kindSel.value === '読み方';
      readingRow.hidden = !isReading;
      body.placeholder = isReading ? 'メモ（任意）：使う場面、由来など' : '思いついたことをすぐメモ（Ctrl+Enterで追加）\n例：主人公の剣は、実は亡き師匠の形見だった';
      if (isReading) word.focus();
    });
    const add = () => {
      const v = body.value.trim();
      const isReading = kindSel.value === '読み方';
      if (isReading && (!word.value.trim() || !reading.value.trim())) { (word.value.trim() ? reading : word).focus(); toast('表記と読みを入れてください'); return; }
      if (!isReading && !v) { body.focus(); return; }
      P().ideas.unshift(Object.assign({
        id: UI.uid('i'), body: v, kind: kindSel.value, tags: splitTags(tags.value), color: '', pinned: false,
        createdAt: Date.now(), updatedAt: Date.now(),
      }, isReading ? { word: word.value.trim().replace(/^[|｜]/, ''), reading: reading.value.trim() } : {}));
      touch();
      body.value = '';
      word.value = '';
      reading.value = '';
      renderFilters();
      renderGrid();
      body.focus();
      toast('メモしました');
    };
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });
    [word, reading].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }));
    wrap.appendChild(h('section', { class: 'quick-add card' },
      readingRow,
      body,
      h('div', { class: 'row wrap' }, kindSel, tags, btn('メモする', { icon: 'plus', primary: true, onClick: add }))));

    IS.filters = h('div', { class: 'idea-filters' });
    IS.grid = h('div', { class: 'idea-grid' });
    wrap.append(IS.filters, IS.grid);
    renderFilters();
    renderGrid();
  }

  function splitTags(s) {
    return String(s || '').split(/[、,，\s#＃]+/).map((t) => t.trim()).filter(Boolean);
  }

  function renderFilters() {
    const p = P();
    clear(IS.filters);
    const search = h('input', {
      class: 'input', type: 'search', placeholder: 'メモを検索', value: IS.q, 'aria-label': 'メモを検索',
      oninput: (e) => { IS.q = e.target.value; renderGrid(); },
    });
    const allTags = {};
    p.ideas.forEach((i) => i.tags.forEach((t) => { allTags[t] = (allTags[t] || 0) + 1; }));
    const chip = (label, active, onClick) => h('button', { type: 'button', class: 'chip' + (active ? ' active' : ''), onclick: onClick }, label);
    IS.filters.append(
      search,
      h('div', { class: 'chips' },
        chip('すべて', !IS.kind && !IS.tag && !IS.pinnedOnly, () => { IS.kind = ''; IS.tag = ''; IS.pinnedOnly = false; renderFilters(); renderGrid(); }),
        chip('ピン留め', IS.pinnedOnly, () => { IS.pinnedOnly = !IS.pinnedOnly; renderFilters(); renderGrid(); }),
        KINDS.filter((k) => p.ideas.some((i) => i.kind === k)).map((k) => chip(k, IS.kind === k, () => { IS.kind = IS.kind === k ? '' : k; renderFilters(); renderGrid(); })),
        Object.keys(allTags).sort().map((t) => chip('#' + t, IS.tag === t, () => { IS.tag = IS.tag === t ? '' : t; renderFilters(); renderGrid(); }))));
  }

  function renderGrid() {
    const p = P();
    clear(IS.grid);
    const q = IS.q.trim();
    const list = p.ideas
      .filter((i) => (!q || (i.body + ' ' + (i.word || '') + ' ' + (i.reading || '')).indexOf(q) >= 0 || i.tags.some((t) => t.indexOf(q) >= 0)) && (!IS.kind || i.kind === IS.kind) && (!IS.tag || i.tags.indexOf(IS.tag) >= 0) && (!IS.pinnedOnly || i.pinned))
      .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    if (!list.length) {
      IS.grid.appendChild(h('div', { class: 'empty' }, p.ideas.length ? '条件に合うメモはありません' : 'まだメモがありません。思いついたことは何でも上の欄に書き留めておきましょう。'));
      return;
    }
    list.forEach((it) => IS.grid.appendChild(ideaCard(it)));
  }

  function ideaCard(it) {
    const p = P();
    const lines = it.body.split('\n');
    const more = btn('', { icon: 'more', ghost: true, small: true, title: 'その他' });
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      UI.menu(more, [
        { label: '編集', icon: 'pen', onClick: () => editIdea(it) },
        { label: it.pinned ? 'ピン留めを外す' : 'ピン留め', icon: 'pin', onClick: () => { it.pinned = !it.pinned; touch(); renderGrid(); } },
        { label: 'プロットボードに送る', icon: 'columns', onClick: () => {
          p.plot.cards.push({ id: UI.uid('c'), columnId: p.plot.columns[0].id, title: lines[0].slice(0, 40), body: lines.slice(1).join('\n'), chapterId: '', color: it.color });
          touch();
          toast('プロットボードの「' + p.plot.columns[0].title + '」に追加しました');
        } },
        { label: '今の話のメモに追記', icon: 'pen', onClick: () => {
          const ch = NS.App.currentChapter();
          if (!ch) return;
          ch.memo = (ch.memo ? ch.memo + '\n' : '') + it.body;
          touch();
          toast(`「${ch.title}」のメモに追記しました`);
        } },
        null,
        { label: '削除', icon: 'trash', danger: true, onClick: async () => {
          if (!(await UI.confirm('このメモを削除します。', { danger: true, okLabel: '削除' }))) return;
          p.ideas.splice(p.ideas.indexOf(it), 1);
          touch();
          renderFilters();
          renderGrid();
        } },
      ]);
    });
    return h('article', {
      class: 'idea-card' + (it.pinned ? ' pinned' : ''), tabindex: 0, style: { borderTopColor: it.color || 'transparent' },
      ondblclick: () => editIdea(it),
      onkeydown: (e) => { if (e.key === 'Enter') editIdea(it); },
    },
    h('div', { class: 'idea-head' },
      h('span', { class: 'kind-badge' }, it.kind || 'アイデア'),
      it.pinned ? icon('pin', 14) : null,
      h('span', { class: 'muted small idea-date' }, UI.relTime(it.updatedAt)),
      more),
    it.word && it.reading
      ? h('div', { class: 'idea-body' }, h('div', { class: 'reading-big', html: NS.Text.rubyToHtml('|' + it.word + '《' + it.reading + '》', { vertical: false }) }), it.body ? h('p', null, it.body) : null)
      : h('div', { class: 'idea-body' }, h('strong', null, lines[0]), lines.length > 1 ? h('p', null, lines.slice(1).join('\n')) : null),
    it.tags.length ? h('div', { class: 'idea-tags' }, it.tags.map((t) => h('span', { class: 'tag' }, '#' + t))) : null);
  }

  function editIdea(it) {
    const body = h('textarea', { class: 'input', rows: 8, value: it.body });
    const word = h('input', { class: 'input', type: 'text', value: it.word || '', placeholder: '表記' });
    const reading = h('input', { class: 'input', type: 'text', value: it.reading || '', placeholder: '読み' });
    const kindSel = h('select', { class: 'input' }, KINDS.map((k) => h('option', { value: k, selected: it.kind === k }, k)));
    const tags = h('input', { class: 'input', type: 'text', value: it.tags.join('、') });
    let color = it.color || '';
    const sw = h('div', { class: 'swatches' }, [''].concat(UI.SWATCHES).map((c) => h('button', {
      type: 'button', class: 'swatch' + (color === c ? ' active' : ''), style: { background: c || 'transparent' }, 'aria-label': c || '色なし',
      onclick: (e) => { color = c; sw.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active')); e.currentTarget.classList.add('active'); },
    })));
    UI.modal({
      title: 'メモを編集', wide: true,
      body: h('div', { class: 'stack' },
        it.kind === '読み方' || it.word ? h('div', { class: 'grid-2' }, UI.field('表記', word), UI.field('読み', reading)) : null,
        body, h('div', { class: 'grid-2' }, UI.field('種類', kindSel), UI.field('タグ', tags)), UI.field('色', sw)),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: '保存', primary: true, onClick: () => {
          it.body = body.value.trim() || (it.word ? '' : it.body);
          if (it.kind === '読み方' || it.word) { it.word = word.value.trim(); it.reading = reading.value.trim(); }
          it.kind = kindSel.value;
          it.tags = splitTags(tags.value);
          it.color = color;
          it.updatedAt = Date.now();
          touch();
          renderFilters();
          renderGrid();
        } },
      ],
    });
  }

  // ───────────── プロットボード ─────────────
  const Plot = {};
  let PS = null;

  Plot.mount = function (view) {
    PS = { view };
    build2();
  };
  Plot.unmount = function () { PS = null; };

  function build2() {
    const p = P();
    clear(PS.view);
    const wrap = h('div', { class: 'plot' });
    wrap.appendChild(h('div', { class: 'plot-head' },
      h('p', { class: 'muted small' }, '場面や出来事をカードにして、起承転結（列）に並べます。カードはドラッグで移動でき、話と結びつけられます。'),
      h('div', { class: 'row' },
        btn('列を追加', { icon: 'plus', small: true, onClick: async () => {
          const t = await UI.prompt('列の名前', '', { placeholder: '例：序章、第二幕' });
          if (!t) return;
          p.plot.columns.push({ id: UI.uid('col'), title: t });
          touch();
          build2();
        } }))));
    const board = h('div', { class: 'plot-board' });
    p.plot.columns.forEach((col, ci) => board.appendChild(column(col, ci)));
    wrap.appendChild(board);
    PS.view.appendChild(wrap);
  }

  function column(col, ci) {
    const p = P();
    const cards = p.plot.cards.filter((c) => c.columnId === col.id);
    const list = h('div', { class: 'plot-cards' });
    cards.forEach((c) => list.appendChild(plotCard(c)));
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      list.classList.add('drop-target');
    });
    list.addEventListener('dragleave', (e) => { if (!list.contains(e.relatedTarget)) list.classList.remove('drop-target'); });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      list.classList.remove('drop-target');
      const id = e.dataTransfer.getData('text/plain');
      const card = p.plot.cards.find((c) => c.id === id);
      if (!card) return;
      // ドロップ位置から挿入先を決める
      const siblings = Array.from(list.querySelectorAll('.plot-card')).filter((el) => el.dataset.id !== id);
      let beforeId = null;
      for (const el of siblings) {
        const r = el.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { beforeId = el.dataset.id; break; }
      }
      p.plot.cards.splice(p.plot.cards.indexOf(card), 1);
      card.columnId = col.id;
      if (beforeId) p.plot.cards.splice(p.plot.cards.findIndex((c) => c.id === beforeId), 0, card);
      else {
        const lastInCol = p.plot.cards.map((c, i) => (c.columnId === col.id ? i : -1)).filter((i) => i >= 0).pop();
        p.plot.cards.splice(lastInCol == null ? p.plot.cards.length : lastInCol + 1, 0, card);
      }
      touch();
      build2();
    });
    const more = btn('', { icon: 'more', ghost: true, small: true, title: '列の操作' });
    more.addEventListener('click', () => UI.menu(more, [
      { label: '名前を変更', icon: 'pen', onClick: async () => { const t = await UI.prompt('列の名前', col.title); if (t) { col.title = t; touch(); build2(); } } },
      { label: '左へ移動', icon: 'left', onClick: () => { if (ci > 0) { p.plot.columns.splice(ci - 1, 0, p.plot.columns.splice(ci, 1)[0]); touch(); build2(); } } },
      { label: '右へ移動', icon: 'right', onClick: () => { if (ci < p.plot.columns.length - 1) { p.plot.columns.splice(ci + 1, 0, p.plot.columns.splice(ci, 1)[0]); touch(); build2(); } } },
      null,
      { label: '列を削除', icon: 'trash', danger: true, onClick: async () => {
        if (p.plot.columns.length <= 1) { toast('最後の列は削除できません'); return; }
        if (!(await UI.confirm(`列「${col.title}」を削除します。カードは隣の列に移ります。`, { danger: true, okLabel: '削除' }))) return;
        const target = p.plot.columns[ci === 0 ? 1 : ci - 1];
        p.plot.cards.forEach((c) => { if (c.columnId === col.id) c.columnId = target.id; });
        p.plot.columns.splice(ci, 1);
        touch();
        build2();
      } },
    ]));
    return h('section', { class: 'plot-col' },
      h('div', { class: 'plot-col-head' }, h('h3', null, col.title), h('span', { class: 'count' }, cards.length), more),
      list,
      btn('カードを追加', { icon: 'plus', ghost: true, small: true, class: 'plot-add', onClick: () => {
        const c = { id: UI.uid('c'), columnId: col.id, title: '', body: '', chapterId: '', color: '' };
        p.plot.cards.push(c);
        touch();
        editCard(c, true);
      } }));
  }

  function plotCard(c) {
    const p = P();
    const chIndex = p.chapters.findIndex((x) => x.id === c.chapterId);
    const el = h('div', {
      class: 'plot-card', draggable: true, tabindex: 0, dataset: { id: c.id }, style: { borderLeftColor: c.color || 'var(--line-strong)' },
      onclick: () => editCard(c),
      onkeydown: (e) => { if (e.key === 'Enter') editCard(c); },
    },
    h('strong', null, c.title || '（無題の場面）'),
    c.body ? h('p', null, c.body) : null,
    chIndex >= 0 ? h('span', { class: 'chapter-chip' }, icon('book', 12), `第${chIndex + 1}話 ${p.chapters[chIndex].title}`) : null);
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
  }

  function editCard(c, isNew) {
    const p = P();
    const title = h('input', { class: 'input', type: 'text', value: c.title, placeholder: '場面・出来事の見出し' });
    const body = h('textarea', { class: 'input', rows: 6, value: c.body, placeholder: '何が起きるか、誰が登場するか、この場面の目的など' });
    const colSel = h('select', { class: 'input' }, p.plot.columns.map((col) => h('option', { value: col.id, selected: col.id === c.columnId }, col.title)));
    const chSel = h('select', { class: 'input' }, h('option', { value: '' }, '（なし）'), p.chapters.map((ch, i) => h('option', { value: ch.id, selected: ch.id === c.chapterId }, `第${i + 1}話 ${ch.title}`)));
    let color = c.color || '';
    const sw = h('div', { class: 'swatches' }, [''].concat(UI.SWATCHES).map((col) => h('button', {
      type: 'button', class: 'swatch' + (color === col ? ' active' : ''), style: { background: col || 'transparent' }, 'aria-label': col || '色なし',
      onclick: (e) => { color = col; sw.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active')); e.currentTarget.classList.add('active'); },
    })));
    let saved = false;
    const save = () => {
      c.title = title.value.trim();
      c.body = body.value;
      c.columnId = colSel.value;
      c.chapterId = chSel.value;
      c.color = color;
      saved = true;
      touch();
      build2();
    };
    UI.modal({
      title: isNew ? 'カードを追加' : 'カードを編集', wide: true,
      onClose: () => { if (isNew && !saved && !c.title && !c.body) { p.plot.cards.splice(p.plot.cards.indexOf(c), 1); build2(); } },
      body: h('div', { class: 'stack' }, title, body,
        h('div', { class: 'grid-2' }, UI.field('列', colSel), UI.field('対応する話', chSel)),
        UI.field('色', sw)),
      actions: [
        { label: '削除', danger: true, ghost: true, onClick: async () => {
          if (!(await UI.confirm('このカードを削除します。', { danger: true, okLabel: '削除' }))) return false;
          p.plot.cards.splice(p.plot.cards.indexOf(c), 1);
          saved = true;
          touch();
          build2();
        } },
        { label: 'この内容で話を作る', onClick: () => {
          save();
          const ch = NS.Store.newChapter(c.title || '新しい話');
          ch.memo = c.body;
          p.chapters.push(ch);
          c.chapterId = ch.id;
          touch();
          toast('話を作成しました');
          NS.App.navigate('write', { id: ch.id });
        } },
        { label: '保存', primary: true, onClick: save },
      ],
    });
    setTimeout(() => title.focus(), 50);
  }

  NS.Views.ideas = Ideas;
  NS.Views.plot = Plot;
})(window.Tsuzuri = window.Tsuzuri || {});
