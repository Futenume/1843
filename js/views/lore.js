/*
 * 綴り — 設定資料（人物・場所・用語・組織・世界観ルール・年表）
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;

  const TYPE_LABEL = { character: '人物', place: '場所', term: '用語', org: '組織' };
  const TYPE_ICON = { character: 'users', place: 'map', term: 'tag', org: 'flag' };
  const TABS = [
    { id: 'character', label: '人物', icon: 'users' },
    { id: 'place', label: '場所', icon: 'map' },
    { id: 'term', label: '用語・アイテム', icon: 'tag' },
    { id: 'org', label: '組織', icon: 'flag' },
    { id: 'rules', label: '世界観ルール', icon: 'shield' },
    { id: 'timeline', label: '年表', icon: 'clock' },
  ];

  const SCHEMA = {
    character: [
      { section: '基本' },
      { key: 'role', label: '役割', placeholder: '主人公／ヒロイン／師匠 など' },
      { key: 'gender', label: '性別' },
      { key: 'age', label: '年齢', placeholder: '17 または 16〜17', hint: '本文の「〇歳」と照合します', check: true },
      { key: 'birthday', label: '誕生日' },
      { key: 'height', label: '身長' },
      { key: 'firstPerson', label: '一人称', placeholder: '俺 ／ 僕 など（複数は／で区切る）', hint: '台詞の一人称と照合します', check: true },
      { key: 'speech', label: '口調・口癖', type: 'textarea', placeholder: '語尾に「〜だぜ」、目上には敬語 など（AIチェックで参照します）' },
      { section: '外見' },
      { key: 'hair', label: '髪', placeholder: '黒のショートヘア', hint: '髪色の描写と照合します', check: true },
      { key: 'eyes', label: '瞳', placeholder: '琥珀色', hint: '瞳の色の描写と照合します', check: true },
      { key: 'looks', label: '外見の特徴', type: 'textarea', placeholder: '体格、服装、傷跡など' },
      { section: '内面・背景' },
      { key: 'personality', label: '性格', type: 'textarea' },
      { key: 'background', label: '経歴', type: 'textarea' },
      { key: 'goal', label: '目的・動機', type: 'textarea' },
    ],
    place: [
      { key: 'kind', label: '種類', placeholder: '国／都市／村／建物／地形 など' },
      { key: 'parent', label: '所在地・所属', type: 'entry', entryType: 'place' },
      { key: 'climate', label: '気候・地理', type: 'textarea' },
      { key: 'population', label: '人口・規模' },
      { key: 'desc', label: '説明', type: 'textarea' },
    ],
    term: [
      { key: 'kind', label: '分類', placeholder: 'アイテム／魔法／技術／用語 など' },
      { key: 'desc', label: '説明', type: 'textarea' },
      { key: 'rule', label: '制約・ルール', type: 'textarea', placeholder: '使える条件、代償、できないこと など' },
    ],
    org: [
      { key: 'kind', label: '種類', placeholder: '国家／騎士団／ギルド／学校 など' },
      { key: 'base', label: '拠点', type: 'entry', entryType: 'place' },
      { key: 'leader', label: '代表者', type: 'entry', entryType: 'character' },
      { key: 'members', label: '主な構成員', type: 'textarea' },
      { key: 'desc', label: '説明', type: 'textarea' },
    ],
  };

  function newEntry(type, name) {
    return {
      id: UI.uid('e'), type, name: name || ('新しい' + TYPE_LABEL[type]), reading: '', aliases: [], color: '',
      fields: {}, custom: [], relations: [], appear: {}, notes: '', createdAt: Date.now(), updatedAt: Date.now(),
    };
  }

  function entryName(p, id) {
    const e = p.entries.find((x) => x.id === id);
    return e ? e.name : '';
  }

  /** 資料パネル用の要約 */
  function summaryList(e, p) {
    const dl = h('dl', { class: 'kv' });
    const add = (k, v) => { if (v && String(v).trim()) dl.append(h('dt', null, k), h('dd', null, v)); };
    if (e.aliases.length) add('別名', e.aliases.join('、'));
    (SCHEMA[e.type] || []).forEach((f) => {
      if (!f.key) return;
      let v = e.fields[f.key];
      if (f.type === 'entry') v = entryName(p, v);
      add(f.label, v);
    });
    e.custom.forEach((c) => add(c.k, c.v));
    e.relations.forEach((r) => {
      const t = entryName(p, r.targetId);
      if (t) add('→' + t, [r.calls ? `「${r.calls}」と呼ぶ` : '', r.note].filter(Boolean).join('／'));
    });
    if (e.appear.from || e.appear.until) add('登場', `${e.appear.from ? '第' + e.appear.from + '話〜' : ''}${e.appear.until ? '第' + e.appear.until + '話で' + (e.appear.reason || '退場') : ''}`);
    add('メモ', e.notes);
    return dl;
  }

  // ───── 書き出し・AI 用の整形 ─────
  const LoreFormat = {
    entryLines(e, p) {
      const lines = [];
      const head = `${e.name}${e.reading ? '（' + e.reading + '）' : ''}${e.aliases.length ? ' 別名: ' + e.aliases.join('、') : ''}`;
      lines.push('- ' + head);
      (SCHEMA[e.type] || []).forEach((f) => {
        if (!f.key) return;
        let v = e.fields[f.key];
        if (f.type === 'entry') v = entryName(p, v);
        if (v && String(v).trim()) lines.push(`  - ${f.label}: ${String(v).replace(/\n/g, ' ')}`);
      });
      e.custom.forEach((c) => { if (c.k || c.v) lines.push(`  - ${c.k}: ${String(c.v || '').replace(/\n/g, ' ')}`); });
      e.relations.forEach((r) => {
        const t = entryName(p, r.targetId);
        if (t) lines.push(`  - ${t}との関係: ${[r.note, r.calls ? '呼び方「' + r.calls + '」' : ''].filter(Boolean).join('、')}`);
      });
      if (e.appear.from) lines.push(`  - 初登場: 第${e.appear.from}話`);
      if (e.appear.until) lines.push(`  - 第${e.appear.until}話で${e.appear.reason || '退場'}`);
      if (e.notes) lines.push(`  - メモ: ${e.notes.replace(/\n/g, ' ')}`);
      return lines;
    },
    toMarkdown(p) {
      const out = ['# ' + p.title + '　設定資料', ''];
      if (p.synopsis) out.push('## あらすじ', '', p.synopsis, '');
      ['character', 'place', 'term', 'org'].forEach((t) => {
        const list = p.entries.filter((e) => e.type === t);
        if (!list.length) return;
        out.push('## ' + TYPE_LABEL[t], '');
        list.forEach((e) => out.push(...LoreFormat.entryLines(e, p)));
        out.push('');
      });
      if (p.rules.world) out.push('## 世界観', '', p.rules.world, '');
      if (p.rules.ng.length) {
        out.push('## 作中で使わない言葉', '');
        p.rules.ng.forEach((r) => out.push(`- ${r.word}${r.reason ? '：' + r.reason : ''}${r.suggestion ? '（→' + r.suggestion + '）' : ''}`));
        out.push('');
      }
      if (p.rules.style.length) {
        out.push('## 表記統一ルール', '');
        p.rules.style.forEach((r) => out.push(`- ${r.from} → ${r.to}`));
        out.push('');
      }
      if (p.timeline.length) {
        out.push('## 年表', '');
        p.timeline.forEach((t) => out.push(`- ${t.when || ''}　${t.title || ''}${t.desc ? '：' + t.desc.replace(/\n/g, ' ') : ''}`));
        out.push('');
      }
      return out.join('\n');
    },
  };

  // ───── 画面 ─────
  const V = {};
  let S = null;
  function P() { return NS.App.project; }
  function touch() { NS.App.touch(); }

  V.mount = function (view, params) {
    const p = P();
    let tab = (S && S.tab) || 'character';
    let selected = null;
    if (params.id) {
      const e = p.entries.find((x) => x.id === params.id);
      if (e) { tab = e.type; selected = e.id; }
    }
    S = { view, tab, selected, q: '', mentionCache: null };
    build();
  };
  V.unmount = function () { S = null; };

  function build() {
    clear(S.view);
    const layout = h('div', { class: 'lore-layout' });
    S.tabsEl = h('nav', { class: 'lore-tabs', 'aria-label': '設定資料の分類' });
    S.listPane = h('div', { class: 'lore-list-pane' });
    S.detail = h('section', { class: 'lore-detail' });
    layout.append(h('aside', { class: 'lore-side' }, S.tabsEl, S.listPane), S.detail);
    S.view.appendChild(layout);
    renderTabs();
    renderList();
    renderDetail();
  }

  function renderTabs() {
    const p = P();
    clear(S.tabsEl);
    TABS.forEach((t) => {
      const n = TYPE_LABEL[t.id] ? p.entries.filter((e) => e.type === t.id).length
        : t.id === 'rules' ? p.rules.ng.length + p.rules.style.length : p.timeline.length;
      S.tabsEl.appendChild(h('button', {
        type: 'button', class: 'lore-tab' + (S.tab === t.id ? ' active' : ''),
        onclick: () => { S.tab = t.id; S.selected = null; S.q = ''; renderTabs(); renderList(); renderDetail(); },
      }, icon(t.icon, 16), h('span', null, t.label), n ? h('span', { class: 'count' }, n) : null));
    });
  }

  function renderList() {
    const p = P();
    clear(S.listPane);
    S.listPane.hidden = !TYPE_LABEL[S.tab];
    S.view.querySelector('.lore-layout').classList.toggle('no-list', !TYPE_LABEL[S.tab]);
    if (!TYPE_LABEL[S.tab]) return;
    const search = h('input', {
      class: 'input', type: 'search', placeholder: '検索', value: S.q, 'aria-label': TYPE_LABEL[S.tab] + 'を検索',
      oninput: (e) => { S.q = e.target.value; renderItems(); },
    });
    const items = h('ul', { class: 'entry-list' });
    const renderItems = () => {
      clear(items);
      const q = S.q.trim();
      const list = p.entries.filter((e) => e.type === S.tab && (!q || e.name.indexOf(q) >= 0 || (e.reading || '').indexOf(q) >= 0 || e.aliases.some((a) => a.indexOf(q) >= 0)));
      if (!list.length) items.appendChild(h('li', { class: 'muted small empty-li' }, q ? '見つかりません' : 'まだ登録がありません'));
      list.forEach((e) => {
        const sub = e.type === 'character' ? [e.fields.role, e.fields.age ? e.fields.age + (/歳|才/.test(e.fields.age) ? '' : '歳') : ''].filter(Boolean).join('・') : (e.fields.kind || '');
        items.appendChild(h('li', {
          class: 'entry-item' + (S.selected === e.id ? ' active' : ''), tabindex: 0,
          onclick: () => { S.selected = e.id; renderItems(); renderDetail(); },
          onkeydown: (ev) => { if (ev.key === 'Enter') { S.selected = e.id; renderItems(); renderDetail(); } },
        },
        h('span', { class: 'color-dot', style: { background: e.color || 'var(--line-strong)' } }),
        h('span', { class: 'entry-item-text' }, h('span', { class: 'entry-item-name' }, e.name), sub ? h('span', { class: 'muted small' }, sub) : null)));
      });
    };
    S.renderItems = renderItems;
    S.listPane.append(
      h('div', { class: 'row' }, search, btn('追加', { icon: 'plus', small: true, primary: true, onClick: () => {
        const e = newEntry(S.tab);
        p.entries.push(e);
        S.selected = e.id;
        S.q = '';
        touch();
        renderTabs();
        renderList();
        renderDetail();
        const nameInput = S.detail.querySelector('.entry-name-input');
        if (nameInput) { nameInput.focus(); nameInput.select(); }
      } })),
      items);
    renderItems();
  }

  function renderDetail() {
    clear(S.detail);
    if (S.tab === 'rules') { S.detail.appendChild(rulesPane()); return; }
    if (S.tab === 'timeline') { S.detail.appendChild(timelinePane()); return; }
    const p = P();
    const e = p.entries.find((x) => x.id === S.selected && x.type === S.tab);
    if (!e) {
      S.detail.appendChild(h('div', { class: 'empty big' },
        icon(TYPE_ICON[S.tab], 40),
        h('p', null, `左の一覧から${TYPE_LABEL[S.tab]}を選ぶか、「追加」で新しく登録します。`),
        S.tab === 'character' ? h('p', { class: 'muted small' }, '一人称・呼び方・髪や瞳の色・年齢・登場範囲を入れておくと、本文との食い違いを自動でチェックします。') : null));
      return;
    }
    S.detail.appendChild(entryForm(e));
  }

  function changed(e, rerenderList) {
    e.updatedAt = Date.now();
    touch();
    if (rerenderList && S.renderItems) S.renderItems();
  }

  function textInput(value, onInput, opts) {
    opts = opts || {};
    return h(opts.textarea ? 'textarea' : 'input', Object.assign({
      class: 'input' + (opts.class ? ' ' + opts.class : ''), value: value || '', placeholder: opts.placeholder || '',
      oninput: (ev) => onInput(ev.target.value),
    }, opts.textarea ? { rows: opts.rows || 3 } : { type: 'text' }));
  }

  function entrySelect(p, type, value, onChange, excludeId) {
    const sel = h('select', { class: 'input', onchange: (ev) => onChange(ev.target.value) });
    sel.appendChild(h('option', { value: '' }, '（なし）'));
    p.entries.filter((x) => x.type === type && x.id !== excludeId).forEach((x) => sel.appendChild(h('option', { value: x.id, selected: x.id === value }, x.name)));
    return sel;
  }

  function chapterSelect(p, value, onChange) {
    const sel = h('select', { class: 'input', onchange: (ev) => onChange(ev.target.value ? parseInt(ev.target.value, 10) : null) });
    sel.appendChild(h('option', { value: '' }, '（指定なし）'));
    p.chapters.forEach((c, i) => sel.appendChild(h('option', { value: i + 1, selected: +value === i + 1 }, `第${i + 1}話　${c.title}`)));
    return sel;
  }

  function entryForm(e) {
    const p = P();
    const form = h('div', { class: 'entry-form' });
    const more = btn('', { icon: 'more', ghost: true, title: 'その他' });
    more.addEventListener('click', () => UI.menu(more, [
      { label: '複製', icon: 'copy', onClick: () => {
        const copy = JSON.parse(JSON.stringify(e));
        copy.id = UI.uid('e');
        copy.name += '（複製）';
        p.entries.push(copy);
        S.selected = copy.id;
        touch();
        renderTabs(); renderList(); renderDetail();
      } },
      { label: '本文で探す', icon: 'search', onClick: () => searchInChapters(e) },
      null,
      { label: '削除', icon: 'trash', danger: true, onClick: async () => {
        if (!(await UI.confirm(`「${e.name}」を削除します。`, { danger: true, okLabel: '削除' }))) return;
        p.entries.splice(p.entries.indexOf(e), 1);
        p.entries.forEach((x) => { x.relations = x.relations.filter((r) => r.targetId !== e.id); });
        S.selected = null;
        touch();
        renderTabs(); renderList(); renderDetail();
      } },
    ]));

    // 見出し
    const colorRow = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': '色' }, [''].concat(UI.SWATCHES).map((c) => h('button', {
      type: 'button', class: 'swatch' + ((e.color || '') === c ? ' active' : ''), title: c ? '色' : '色なし', 'aria-label': c || '色なし',
      style: { background: c || 'transparent' },
      onclick: (ev) => { e.color = c; changed(e, true); ev.currentTarget.parentNode.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active')); ev.currentTarget.classList.add('active'); },
    })));
    form.appendChild(h('div', { class: 'entry-head' },
      h('span', { class: 'type-badge t-' + e.type }, TYPE_LABEL[e.type]),
      textInput(e.name, (v) => { e.name = v; changed(e, true); }, { class: 'entry-name-input', placeholder: '名前' }),
      more));
    form.appendChild(h('div', { class: 'grid-2' },
      UI.field('読み', textInput(e.reading, (v) => { e.reading = v; changed(e); }, { placeholder: 'ふりがな' })),
      UI.field('別名・愛称', textInput(e.aliases.join('、'), (v) => { e.aliases = v.split(/[、,，\/／]/).map((s) => s.trim()).filter(Boolean); changed(e); }, { placeholder: '、で区切る' }),
        '本文中の呼び名も登録すると検出精度が上がります')));
    form.appendChild(UI.field('色', colorRow));

    // 項目
    let grid = h('div', { class: 'grid-2' });
    form.appendChild(grid);
    (SCHEMA[e.type] || []).forEach((f) => {
      if (f.section) {
        form.appendChild(h('h3', { class: 'form-section' }, f.section));
        grid = h('div', { class: 'grid-2' });
        form.appendChild(grid);
        return;
      }
      let input;
      if (f.type === 'entry') input = entrySelect(p, f.entryType, e.fields[f.key], (v) => { e.fields[f.key] = v; changed(e); }, e.id);
      else input = textInput(e.fields[f.key], (v) => { e.fields[f.key] = v; changed(e, f.key === 'role' || f.key === 'kind' || f.key === 'age'); }, { textarea: f.type === 'textarea', placeholder: f.placeholder });
      const fl = UI.field(f.label, input, f.hint);
      if (f.check) fl.classList.add('field-checked');
      if (f.type === 'textarea') fl.classList.add('span-2');
      grid.appendChild(fl);
    });

    // 人物：関係・呼び方、登場範囲
    if (e.type === 'character') {
      form.appendChild(h('h3', { class: 'form-section' }, '関係・呼び方', h('span', { class: 'check-note' }, '台詞の呼び方と照合')));
      const relBox = h('div', { class: 'table-like' });
      const renderRel = () => {
        clear(relBox);
        relBox.appendChild(h('div', { class: 'tl-head rel-row' }, h('span', null, '相手'), h('span', null, '呼び方'), h('span', null, '関係・メモ'), h('span')));
        e.relations.forEach((r, i) => {
          relBox.appendChild(h('div', { class: 'rel-row' },
            entrySelect(p, 'character', r.targetId, (v) => { r.targetId = v; changed(e); }, e.id),
            textInput(r.calls, (v) => { r.calls = v; changed(e); }, { placeholder: '例：蓮くん（複数は／）' }),
            textInput(r.note, (v) => { r.note = v; changed(e); }, { placeholder: '幼なじみ、師弟 など' }),
            btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: () => { e.relations.splice(i, 1); changed(e); renderRel(); } })));
        });
        relBox.appendChild(btn('関係を追加', { icon: 'plus', small: true, ghost: true, onClick: () => { e.relations.push({ targetId: '', calls: '', note: '' }); changed(e); renderRel(); } }));
      };
      renderRel();
      form.appendChild(relBox);

      form.appendChild(h('h3', { class: 'form-section' }, '登場範囲', h('span', { class: 'check-note' }, '退場後の発言などを検出')));
      form.appendChild(h('div', { class: 'grid-3' },
        UI.field('初登場', chapterSelect(p, e.appear.from, (v) => { e.appear.from = v; changed(e); })),
        UI.field('退場・死亡', chapterSelect(p, e.appear.until, (v) => { e.appear.until = v; changed(e); })),
        UI.field('退場の理由', (() => {
          const sel = h('select', { class: 'input', onchange: (ev) => { e.appear.reason = ev.target.value; changed(e); } });
          ['死亡', '退場', '離脱', '封印', '行方不明'].forEach((r) => sel.appendChild(h('option', { value: r, selected: (e.appear.reason || '死亡') === r }, r)));
          return sel;
        })())));
    }

    // 地図との連携（場所）
    if (e.type === 'place') {
      const links = [];
      p.maps.forEach((m) => (m.stamps || m.markers || []).forEach((mk) => { if (mk.entryId === e.id) links.push({ m, mk }); }));
      form.appendChild(h('h3', { class: 'form-section' }, '地図'));
      form.appendChild(links.length
        ? h('div', { class: 'row wrap' }, links.map(({ m, mk }) => btn(`${m.name}で表示`, { icon: 'map', small: true, onClick: () => {
          NS.App.pendingMapFocus = { mapId: m.id, stampId: mk.id };
          NS.App.navigate('map', { id: m.id });
        } })))
        : h('p', { class: 'muted small' }, '地図画面で城や町などの素材を置き、選択して「設定資料とつなぐ」でこの場所を選ぶと、ここから地図を開けます。'));
    }

    // 自由項目
    form.appendChild(h('h3', { class: 'form-section' }, '自由項目'));
    const customBox = h('div', { class: 'table-like' });
    const renderCustom = () => {
      clear(customBox);
      e.custom.forEach((c, i) => {
        customBox.appendChild(h('div', { class: 'kv-row' },
          textInput(c.k, (v) => { c.k = v; changed(e); }, { placeholder: '項目名' }),
          textInput(c.v, (v) => { c.v = v; changed(e); }, { placeholder: '内容' }),
          btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: () => { e.custom.splice(i, 1); changed(e); renderCustom(); } })));
      });
      customBox.appendChild(btn('項目を追加', { icon: 'plus', small: true, ghost: true, onClick: () => { e.custom.push({ k: '', v: '' }); changed(e); renderCustom(); } }));
    };
    renderCustom();
    form.appendChild(customBox);

    form.appendChild(UI.field('メモ', textInput(e.notes, (v) => { e.notes = v; changed(e); }, { textarea: true, rows: 5, placeholder: '自由に書き留めておけます' })));

    // 登場箇所
    form.appendChild(h('h3', { class: 'form-section' }, '登場回数'));
    form.appendChild(mentionsView(e));
    return form;
  }

  function mentionsView(e) {
    const p = P();
    if (!S.mentionCache) S.mentionCache = NS.Consistency.countMentionsByEntry(p.chapters.map((c) => c.body), p.entries);
    const rows = [];
    let total = 0;
    S.mentionCache.forEach((counts, i) => {
      const n = counts[e.id] || 0;
      total += n;
      if (n) rows.push({ i, n });
    });
    if (!total) return h('p', { class: 'muted small' }, '本文にはまだ登場していません（名前・別名で数えています）。');
    const max = Math.max(...rows.map((r) => r.n));
    return h('div', { class: 'mention-bars' },
      h('p', { class: 'small muted' }, `全${total}回`),
      rows.map((r) => h('button', {
        type: 'button', class: 'mention-row', title: '本文を開く',
        onclick: () => NS.App.navigate('write', { id: p.chapters[r.i].id }),
      }, h('span', { class: 'mention-label' }, `第${r.i + 1}話`),
      h('span', { class: 'mention-bar' }, h('span', { style: { width: (r.n / max) * 100 + '%' } })),
      h('span', { class: 'mention-n' }, r.n))));
  }

  function searchInChapters(e) {
    const p = P();
    const forms = [e.name.replace(/[\s　]/g, '')].concat(e.aliases);
    const hits = [];
    p.chapters.forEach((c, i) => {
      forms.forEach((f) => {
        if (!f) return;
        let k = c.body.indexOf(f);
        while (k >= 0 && hits.length < 200) {
          hits.push({ c, i, k, f });
          k = c.body.indexOf(f, k + f.length);
        }
      });
    });
    hits.sort((a, b) => a.i - b.i || a.k - b.k);
    const list = h('div', { class: 'hit-list' }, hits.length ? hits.map((x) => h('button', {
      type: 'button', class: 'hit-row',
      onclick: () => { closeFn(); NS.App.navigate('write', { id: x.c.id }); setTimeout(() => NS.Views.write.focusRange && NS.Views.write.focusRange(x.k, x.k + x.f.length), 60); },
    }, h('span', { class: 'muted small' }, `第${x.i + 1}話`), h('span', null, x.c.body.slice(Math.max(0, x.k - 12), x.k), h('mark', null, x.f), x.c.body.slice(x.k + x.f.length, x.k + x.f.length + 16)))) : h('p', { class: 'muted' }, '見つかりませんでした'));
    const closeFn = UI.modal({ title: `「${e.name}」の登場箇所`, body: list, wide: true });
  }

  // ───── 世界観ルール ─────
  function rulesPane() {
    const p = P();
    const box = h('div', { class: 'entry-form' });
    box.appendChild(h('h2', { class: 'pane-title' }, '世界観ルール'));
    box.appendChild(UI.field('世界観の説明', textInput(p.rules.world, (v) => { p.rules.world = v; touch(); }, {
      textarea: true, rows: 6, placeholder: '例：剣と魔法の世界。火薬や電気は存在しない。魔法は詠唱が必要で、使うと体力を消耗する。…',
    }), 'AIの設定矛盾チェックで参照します'));

    box.appendChild(h('h3', { class: 'form-section' }, '作中で使わない言葉（NGワード）', h('span', { class: 'check-note' }, '本文から自動検出')));
    box.appendChild(h('p', { class: 'muted small' }, '例：中世風の世界なのに「メートル」「スマホ」、和風の世界なのに「ドア」など。言い換えを入れると一発で修正できます。'));
    const ngBox = h('div', { class: 'table-like' });
    const renderNg = () => {
      clear(ngBox);
      ngBox.appendChild(h('div', { class: 'tl-head ng-row' }, h('span', null, '言葉'), h('span', null, '理由'), h('span', null, '言い換え'), h('span')));
      p.rules.ng.forEach((r, i) => ngBox.appendChild(h('div', { class: 'ng-row' },
        textInput(r.word, (v) => { r.word = v; touch(); }, { placeholder: 'メートル' }),
        textInput(r.reason, (v) => { r.reason = v; touch(); }, { placeholder: 'この世界の単位は「歩」' }),
        textInput(r.suggestion, (v) => { r.suggestion = v; touch(); }, { placeholder: '歩' }),
        btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: () => { p.rules.ng.splice(i, 1); touch(); renderNg(); renderTabs(); } }))));
      ngBox.appendChild(btn('NGワードを追加', { icon: 'plus', small: true, ghost: true, onClick: () => { p.rules.ng.push({ word: '', reason: '', suggestion: '' }); touch(); renderNg(); renderTabs(); } }));
    };
    renderNg();
    box.appendChild(ngBox);

    box.appendChild(h('h3', { class: 'form-section' }, '表記統一ルール', h('span', { class: 'check-note' }, '添削で検出')));
    box.appendChild(h('p', { class: 'muted small' }, '作品内で表記を揃えたい語を登録します。例：「出来る→できる」「魔方陣→魔法陣」。'));
    const stBox = h('div', { class: 'table-like' });
    const renderSt = () => {
      clear(stBox);
      stBox.appendChild(h('div', { class: 'tl-head kv-row' }, h('span', null, '置き換え前'), h('span', null, '置き換え後'), h('span')));
      p.rules.style.forEach((r, i) => stBox.appendChild(h('div', { class: 'kv-row' },
        textInput(r.from, (v) => { r.from = v; touch(); }, { placeholder: '魔方陣' }),
        textInput(r.to, (v) => { r.to = v; touch(); }, { placeholder: '魔法陣' }),
        btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: () => { p.rules.style.splice(i, 1); touch(); renderSt(); renderTabs(); } }))));
      stBox.appendChild(btn('ルールを追加', { icon: 'plus', small: true, ghost: true, onClick: () => { p.rules.style.push({ from: '', to: '' }); touch(); renderSt(); renderTabs(); } }));
    };
    renderSt();
    box.appendChild(stBox);

    box.appendChild(h('h3', { class: 'form-section' }, '作品のあらすじ'));
    box.appendChild(textInput(p.synopsis, (v) => { p.synopsis = v; touch(); }, { textarea: true, rows: 4, placeholder: 'AIチェックの参考になります' }));
    return box;
  }

  // ───── 年表 ─────
  function timelinePane() {
    const p = P();
    const box = h('div', { class: 'entry-form' });
    box.appendChild(h('h2', { class: 'pane-title' }, '年表'));
    box.appendChild(h('p', { class: 'muted small' }, '作中の出来事を時系列で並べます。「時期」は自由な書き方でかまいません（例：王国暦312年 春、第3話の三日後）。'));
    const list = h('div', { class: 'timeline' });
    const render = () => {
      clear(list);
      p.timeline.forEach((t, i) => {
        list.appendChild(h('div', { class: 'tl-item' },
          h('div', { class: 'tl-dot' }),
          h('div', { class: 'tl-fields' },
            h('div', { class: 'tl-row' },
              textInput(t.when, (v) => { t.when = v; touch(); }, { placeholder: '時期', class: 'tl-when' }),
              textInput(t.title, (v) => { t.title = v; touch(); }, { placeholder: '出来事', class: 'tl-title' })),
            textInput(t.desc, (v) => { t.desc = v; touch(); }, { textarea: true, rows: 2, placeholder: '詳細・関係する人物など' })),
          h('div', { class: 'tl-actions' },
            btn('', { icon: 'up', ghost: true, small: true, title: '上へ', onClick: () => { if (i > 0) { p.timeline.splice(i - 1, 0, p.timeline.splice(i, 1)[0]); touch(); render(); } } }),
            btn('', { icon: 'down', ghost: true, small: true, title: '下へ', onClick: () => { if (i < p.timeline.length - 1) { p.timeline.splice(i + 1, 0, p.timeline.splice(i, 1)[0]); touch(); render(); } } }),
            btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: () => { p.timeline.splice(i, 1); touch(); render(); renderTabs(); } }))));
      });
      if (!p.timeline.length) list.appendChild(h('p', { class: 'muted' }, 'まだ出来事がありません。'));
    };
    render();
    box.appendChild(list);
    box.appendChild(btn('出来事を追加', { icon: 'plus', onClick: () => { p.timeline.push({ id: UI.uid('t'), when: '', title: '', desc: '' }); touch(); render(); renderTabs(); } }));
    return box;
  }

  NS.Lore = { TYPE_LABEL, TYPE_ICON, SCHEMA, newEntry, summaryList };
  NS.LoreFormat = LoreFormat;
  NS.Views.lore = V;
})(window.Tsuzuri = window.Tsuzuri || {});
