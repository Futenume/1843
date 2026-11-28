/*
 * 綴り — 設定資料（人物・場所・用語・組織・世界観ルール・年表）
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;

  const TYPE_LABEL = { character: '人物', place: '場所', term: '用語', org: '組織', creature: '生物' };
  const TYPE_ICON = { character: 'users', place: 'map', term: 'tag', org: 'flag', creature: 'paw' };
  const TABS = [
    { id: 'character', label: '人物', icon: 'users' },
    { id: 'place', label: '場所', icon: 'map' },
    { id: 'term', label: '用語・アイテム', icon: 'tag' },
    { id: 'org', label: '組織', icon: 'flag' },
    { id: 'creature', label: '生物', icon: 'paw' },
    { id: 'relmap', label: '相関図', icon: 'network' },
    { id: 'rules', label: '世界観ルール', icon: 'shield' },
    { id: 'timeline', label: '年表', icon: 'clock' },
    { id: 'cast', label: '出番表', icon: 'list' },
  ];

  const SCHEMA = {
    character: [
      { section: '基本' },
      { key: 'role', label: '役割', placeholder: '主人公／ヒロイン／師匠 など' },
      { key: 'gender', label: '性別' },
      { key: 'age', label: '年齢', placeholder: '例：17（16〜17 のような幅も可）', hint: '本文の「〇歳」と照合します', check: true },
      { key: 'birthday', label: '誕生日' },
      { key: 'height', label: '身長' },
      { key: 'firstPerson', label: '一人称', placeholder: '俺 ／ 僕 など（複数は／で区切る）', hint: '台詞の一人称と照合します', check: true },
      { key: 'speech', label: '口調・口癖', type: 'textarea', placeholder: '語尾に「〜だぜ」、目上には敬語 など（AIチェックで参照します）' },
      { section: '外見' },
      { key: 'hair', label: '髪', placeholder: '例：黒のショートヘア', hint: '髪色の描写と照合します', check: true },
      { key: 'eyes', label: '瞳', placeholder: '例：琥珀色', hint: '瞳の色の描写と照合します', check: true },
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
    creature: [
      { section: '基本' },
      { key: 'kind', label: '分類', placeholder: '竜／魔獣／幻獣／精霊 など' },
      { key: 'habitat', label: 'すみか', placeholder: '北の山脈、深い森、海の底 など' },
      { key: 'diet', label: '食べもの', placeholder: '肉食／草食／魔力を食べる など' },
      { key: 'lifespan', label: '寿命' },
      { key: 'danger', label: '強さ・危険度', placeholder: '例：騎士団一隊でようやく互角' },
      { key: 'rarity', label: '数・珍しさ', placeholder: '世界に数頭／群れで暮らす など' },
      { section: '大きさ', hint: '図の大きさに使います' },
      { key: 'length', label: '全長', placeholder: '例：40m／旅客機ほど／象の3倍', hint: '巨人などは身長', size: true },
      { key: 'height', label: '高さ', placeholder: '例：12m', size: true },
      { key: 'wingspan', label: '翼を広げた幅', placeholder: '例：60m', size: true },
      { key: 'weight', label: '体重', placeholder: '例：80t', size: true },
      { section: '姿・能力' },
      { key: 'looks', label: '姿の特徴', type: 'textarea', placeholder: '鱗の色、角の形、目の色 など' },
      { key: 'ability', label: '能力・習性', type: 'textarea', placeholder: '火を吐く、群れで狩る、人の言葉を話す など' },
      { key: 'weakness', label: '弱点', type: 'textarea' },
      { key: 'desc', label: '人との関わり・言い伝え', type: 'textarea' },
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
    if (e.type === 'creature' && NS.Creature) {
      const th = h('div', { class: 'cf-thumb', role: 'img', 'aria-label': e.name + 'の姿' });
      try { th.innerHTML = NS.Creature.render(e, { width: 320, height: 190, title: false, dims: false, units: (p.rules.units && p.rules.units.list) || [] }); } catch (err) { /* 図が描けなくても資料は出す */ }
      dl.appendChild(h('dd', { class: 'cf-thumb-row' }, th));
    }
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
      if (e.type === 'creature' && NS.Creature) {
        try {
          const C = NS.Creature;
          const fig = C.figureOf(e);
          const ms = C.measure(fig, e.fields, (p.rules.units && p.rules.units.list) || []);
          lines.push(`  - 体の形: ${C.PRESETS[fig.preset].label}（図から見積もった体重 約${C.fmtWeight(ms.weight)}${ms.wingspan ? '、翼を広げた幅 約' + C.fmtLen(ms.wingspan) : ''}）`);
        } catch (err) { /* 見積もれなくても書き出す */ }
      }
      if (e.appear.from) lines.push(`  - 初登場: 第${e.appear.from}話`);
      if (e.appear.until) lines.push(`  - 第${e.appear.until}話で${e.appear.reason || '退場'}`);
      if (e.notes) lines.push(`  - メモ: ${e.notes.replace(/\n/g, ' ')}`);
      return lines;
    },
    /** 世界観ルール（通貨・単位・暦・文明・設定メモ）を Markdown の行に */
    worldLines(p) {
      const W = NS.WorldRules;
      const r = p.rules;
      const out = [];
      const coins = (r.currency.units || []).filter((u) => u.name && u.value > 0).sort((a, b) => b.value - a.value);
      if (coins.length || r.currency.prices.some((x) => x.item && x.price)) {
        out.push('## 通貨・物価', '');
        if (coins.length) out.push('- ' + coins.map((u, i) => (i === 0 ? `${u.name}1枚` : `${u.name}${Math.round(coins[0].value / u.value * 100) / 100}枚`)).join(' ＝ '));
        coins.filter((u) => u.reading || u.note).forEach((u) => out.push(`- ${u.name}${u.reading ? '（' + u.reading + '）' : ''}${u.note ? '：' + u.note.replace(/\n/g, ' ') : ''}`));
        if (r.currency.yen > 0 && coins.length) out.push(`- ${coins[coins.length - 1].name}1枚 ≒ ${r.currency.yen}円（読者向けの目安）`);
        r.currency.prices.filter((x) => x.item && x.price).forEach((x) => out.push(`- ${x.item}：${x.price}`));
        out.push('');
      }
      const units = (r.units.list || []).filter((u) => u.name && u.amount > 0);
      if (units.length) {
        out.push('## 単位', '');
        units.forEach((u) => out.push(`- ${W.KIND_LABEL[u.kind]}：${W.describeAmount(u)}`));
        out.push('');
      }
      const c = r.calendar;
      if (c.era || c.months.length || c.weekdays.length || c.noWeek || c.noClock || c.timeNote || c.yearNote) {
        out.push('## 暦と時刻', '');
        if (c.era) out.push(`- 年の数え方：${c.era}`);
        if (c.months.length) out.push(`- 月の名前：${c.months.join('、')}`);
        if (c.weekdays.length) out.push(`- 曜日：${c.weekdays.join('、')}`);
        if (c.noWeek) out.push('- 曜日はない');
        if (c.noClock) out.push('- 時計はない');
        if (c.timeNote) out.push(`- 時刻の言い方：${c.timeNote}`);
        if (c.yearNote) out.push(`- ${c.yearNote.replace(/\n/g, ' ')}`);
        out.push('');
      }
      const t = r.tech;
      if (t.cats.length || t.loanwords || t.extra) {
        out.push('## 文明の水準（この世界にないもの）', '');
        if (W.TECH_PRESETS[t.preset]) out.push(`- 時代の目安：${W.TECH_PRESETS[t.preset].label}`);
        W.TECH.filter((x) => t.cats.includes(x.id)).forEach((x) => out.push(`- ${x.label}はない（${x.words.slice(0, 5).map((w) => w[0]).join('・')}など）`));
        if (t.extra) out.push(`- ほかにないもの：${t.extra}`);
        if (t.loanwords) out.push('- カタカナの外来語は控える');
        if (t.allow) out.push(`- この世界にはあるもの：${t.allow}`);
        out.push('');
      }
      BIBLE.forEach(([key, label]) => {
        const v = r.bible[key];
        if (v && v.trim()) out.push(`## ${label}`, '', v.trim(), '');
      });
      return out;
    },
    toMarkdown(p) {
      const out = ['# ' + p.title + '　設定資料', ''];
      if (p.synopsis) out.push('## あらすじ', '', p.synopsis, '');
      ['character', 'place', 'term', 'org', 'creature'].forEach((t) => {
        const list = p.entries.filter((e) => e.type === t);
        if (!list.length) return;
        out.push('## ' + TYPE_LABEL[t], '');
        list.forEach((e) => out.push(...LoreFormat.entryLines(e, p)));
        out.push('');
      });
      if (p.rules.world) out.push('## 世界観', '', p.rules.world, '');
      LoreFormat.worldLines(p).forEach((x) => out.push(x));
      out.push('## 語り手', '', (NS.Consistency.NARRATORS[p.rules.narrator || 'auto'] || ''), '');
      if (p.rules.ng.length) {
        out.push('## 作中で使わない言葉', '');
        p.rules.ng.forEach((r) => out.push(`- ${r.word}${r.reason ? '：' + r.reason : ''}${r.suggestion ? '（→' + r.suggestion + '）' : ''}${r.scope === 'dialogue' ? '［台詞だけ］' : r.scope === 'all' ? '［台詞も地の文も］' : ''}`));
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
  let lastTab = 'character'; // 画面を出入りしても、開いていた分類を覚えておく
  let openedFromList = false; // 狭い画面で一覧から開いたか（戻るボタンで履歴を戻す）
  function P() { return NS.App.project; }
  function touch() { NS.App.touch(); }

  V.mount = function (view, params) {
    const p = P();
    let tab = (S && S.tab) || lastTab || 'character';
    let selected = null;
    if (params.id) {
      const e = p.entries.find((x) => x.id === params.id);
      if (e) { tab = e.type; selected = e.id; }
    } else openedFromList = false;
    S = { view, tab, selected, q: '', mentionCache: null };
    build();
  };
  V.unmount = function () { if (S) lastTab = S.tab; S = null; };

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
        : t.id === 'rules' ? p.rules.ng.length + p.rules.style.length : t.id === 'relmap' || t.id === 'cast' ? 0 : p.timeline.length;
      S.tabsEl.appendChild(h('button', {
        type: 'button', class: 'lore-tab' + (S.tab === t.id ? ' active' : ''),
        onclick: () => {
          S.tab = t.id; lastTab = t.id; S.selected = null; S.q = '';
          // 詳細を開いていた（URL に項目がある）なら、一覧の URL に戻す
          if (NS.App.params && NS.App.params.id) { openedFromList = false; NS.App.navigate('lore'); return; }
          renderTabs(); renderList(); renderDetail(); toTop();
        },
      }, icon(t.icon, 16), h('span', null, t.label), n ? h('span', { class: 'count' }, n) : null));
    });
    // 狭い画面（タブが横に並ぶ）では、選んでいるタブが見えるように
    const act = S.tabsEl.querySelector('.lore-tab.active');
    if (act && S.tabsEl.scrollWidth > S.tabsEl.clientWidth) {
      requestAnimationFrame(() => {
        if (!S) return;
        const l = act.offsetLeft - S.tabsEl.offsetLeft;
        if (l < S.tabsEl.scrollLeft + 8 || l + act.offsetWidth > S.tabsEl.scrollLeft + S.tabsEl.clientWidth - 8) {
          S.tabsEl.scrollLeft = l - (S.tabsEl.clientWidth - act.offsetWidth) / 2;
        }
      });
    }
  }

  function openEntry(e) {
    if (narrow()) {
      // 狭い画面では履歴に積み、端末の「戻る」で一覧に戻れるようにする
      lastTab = S.tab;
      openedFromList = true;
      NS.App.navigate('lore', { id: e.id });
      return;
    }
    S.selected = e.id;
    S.renderItems();
    renderDetail();
  }

  function backToList() {
    lastTab = S.tab;
    if (openedFromList) { openedFromList = false; history.back(); return; }
    S.selected = null;
    NS.App.navigate('lore');
  }

  /** 狭い画面では「一覧」と「詳細」を切り替えて表示する（選んでいるかどうかを枠に印す） */
  function syncLayout() {
    const layout = S.view.querySelector('.lore-layout');
    if (!layout) return;
    layout.classList.toggle('no-list', !TYPE_LABEL[S.tab]);
    layout.classList.toggle('has-selection', !!(TYPE_LABEL[S.tab] && S.selected && P().entries.some((x) => x.id === S.selected)));
  }
  const narrow = () => window.matchMedia('(max-width: 899px)').matches;
  function toTop() { if (narrow()) S.view.scrollTop = 0; }

  function renderList() {
    const p = P();
    clear(S.listPane);
    S.listPane.hidden = !TYPE_LABEL[S.tab];
    syncLayout();
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
        const sub = e.type === 'character' ? [e.fields.role, e.fields.age ? e.fields.age + (/歳|才/.test(e.fields.age) ? '' : '歳') : ''].filter(Boolean).join('・')
          : e.type === 'creature' ? [e.fields.kind, e.fields.length].filter(Boolean).join('・') : (e.fields.kind || '');
        items.appendChild(h('li', {
          class: 'entry-item' + (S.selected === e.id ? ' active' : ''), tabindex: 0,
          onclick: () => openEntry(e),
          onkeydown: (ev) => { if (ev.key === 'Enter') openEntry(e); },
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
        S.q = '';
        touch();
        if (narrow()) {
          openEntry(e);
        } else {
          S.selected = e.id;
          renderTabs();
          renderList();
          renderDetail();
        }
        const nameInput = S && S.detail.querySelector('.entry-name-input');
        if (nameInput) { nameInput.focus(); nameInput.select(); }
      } })),
      h('div', { class: 'row' }, btn('名前を考える', { icon: 'dice', small: true, ghost: true, title: '人物名・地名などの候補を出します', onClick: () => namesDialog(S.tab) })),
      items);
    renderItems();
  }

  /** 名前を考える（候補から、そのまま設定資料に足せる） */
  function namesDialog(tab) {
    const p = P();
    const N = NS.Names;
    const placeTab = tab === 'place';
    const styleKeys = Object.keys(N.STYLES).filter((k) => (placeTab ? !N.STYLES[k].person : true));
    const prefs = UI.lsGet('tsuzuri.namePref', {}) || {};
    let style = styleKeys.includes(prefs[tab]) ? prefs[tab] : (placeTab ? 'placeJp' : 'jp');
    let gender = prefs.gender || 'any';
    const chips = h('div', { class: 'chips' });
    const genderBox = h('div', { class: 'chips' });
    const list = h('div', { class: 'name-list' });
    const renderChips = () => {
      clear(chips);
      styleKeys.forEach((k) => chips.appendChild(h('button', { type: 'button', class: 'chip' + (style === k ? ' active' : ''), 'aria-pressed': style === k ? 'true' : 'false',
        onclick: () => { style = k; prefs[tab] = k; UI.lsSet('tsuzuri.namePref', prefs); renderChips(); roll(); } }, N.STYLES[k].label)));
      clear(genderBox);
      genderBox.hidden = !N.STYLES[style].person;
      [['any', 'どちらも'], ['m', '男性'], ['f', '女性']].forEach(([k, l]) => genderBox.appendChild(h('button', { type: 'button', class: 'chip' + (gender === k ? ' active' : ''),
        onclick: () => { gender = k; prefs.gender = k; UI.lsSet('tsuzuri.namePref', prefs); renderChips(); roll(); } }, l)));
    };
    const roll = () => {
      clear(list);
      const avoid = p.entries.map((e) => e.name);
      N.generate(style, { gender, count: 12, avoid }).forEach((n) => {
        const isPerson = N.STYLES[style].person;
        const type = isPerson ? 'character' : 'place';
        const addBtn = btn(isPerson ? '人物に追加' : '場所に追加', { small: true, icon: 'plus', onClick: () => {
          const e = newEntry(type, n.name);
          e.reading = (n.reading || '').replace(/\s/g, '');
          // 名だけ・姓だけで書いても同じ人物と分かるように
          if (n.given && n.family) e.aliases = [n.given, n.family].filter((a) => a && a !== n.name);
          p.entries.push(e);
          touch();
          addBtn.disabled = true;
          addBtn.textContent = '追加しました';
          if (S && S.tab === type) { renderTabs(); renderList(); }
        } });
        list.appendChild(h('div', { class: 'name-row' },
          h('div', { class: 'name-main' }, h('strong', null, n.name), n.reading ? h('span', { class: 'small muted' }, n.reading) : null),
          h('span', { class: 'small muted name-note' }, n.note || ''),
          btn('', { icon: 'copy', small: true, ghost: true, title: 'コピー', onClick: async () => {
            try { await navigator.clipboard.writeText(n.name); UI.toast('コピーしました'); } catch (err) { UI.toast('コピーできませんでした', 'error'); }
          } }),
          addBtn));
      });
    };
    renderChips();
    roll();
    UI.modal({
      title: '名前を考える', wide: true,
      body: h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, '気に入った名前は、そのまま設定資料に足せます（和名は読みと、名だけ・姓だけの呼び方も一緒に登録します）。'),
        chips, genderBox,
        list),
      actions: [{ label: 'ほかの候補', icon: 'dice', onClick: () => { roll(); return false; } }, { label: '閉じる', primary: true }],
    });
  }

  function renderDetail() {
    clear(S.detail);
    S.refreshFigure = null;
    syncLayout();
    S.detail.classList.toggle('full', S.tab === 'relmap');
    if (S.tab === 'relmap') { NS.RelMap.mount(S.detail); return; }
    if (S.tab === 'rules') { S.detail.appendChild(rulesPane()); return; }
    if (S.tab === 'timeline') { S.detail.appendChild(timelinePane()); return; }
    if (S.tab === 'cast') { S.detail.appendChild(castPane()); return; }
    const p = P();
    const e = p.entries.find((x) => x.id === S.selected && x.type === S.tab);
    if (!e) {
      S.detail.appendChild(h('div', { class: 'empty big' },
        icon(TYPE_ICON[S.tab], 40),
        h('p', null, `一覧から${TYPE_LABEL[S.tab]}を選ぶか、「追加」で新しく登録します。`),
        S.tab === 'character' ? h('p', { class: 'muted small' }, '一人称・呼び方・髪や瞳の色・年齢・登場範囲を入れておくと、本文との食い違いを自動でチェックします。') : null));
      return;
    }
    // 狭い画面では、一覧へ戻るボタンを付ける
    S.detail.appendChild(h('div', { class: 'lore-back-row' }, btn(`${TYPE_LABEL[S.tab]}の一覧へ`, {
      icon: 'left', small: true, ghost: true, class: 'lore-back',
      onClick: backToList,
    })));
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
        touch();
        if (narrow()) { NS.App.navigate('lore', { id: copy.id }); return; }
        S.selected = copy.id;
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
        if (NS.App.params && NS.App.params.id) { lastTab = S.tab; openedFromList = false; NS.App.navigate('lore'); return; }
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
      textInput(e.name, (v) => { e.name = v; changed(e, true); if (S.refreshFigure) S.refreshFigure(); }, { class: 'entry-name-input', placeholder: '名前' }),
      more));
    form.appendChild(h('div', { class: 'grid-2' },
      UI.field('読み', textInput(e.reading, (v) => { e.reading = v; changed(e); }, { placeholder: 'ふりがな' })),
      UI.field('別名・愛称', textInput(e.aliases.join('、'), (v) => { e.aliases = v.split(/[、,，\/／]/).map((s) => s.trim()).filter(Boolean); changed(e); }, { placeholder: '、で区切る' }),
        '本文中の呼び名も登録すると検出精度が上がります')));
    form.appendChild(UI.field('色', colorRow));
    if (e.type === 'creature' && NS.Creature) form.appendChild(creatureFigure(e));

    // 項目
    let grid = h('div', { class: 'grid-2' });
    form.appendChild(grid);
    (SCHEMA[e.type] || []).forEach((f) => {
      if (f.section) {
        form.appendChild(h('h3', { class: 'form-section' }, f.section, f.hint ? h('span', { class: 'check-note' }, f.hint) : null));
        grid = h('div', { class: 'grid-2' });
        form.appendChild(grid);
        return;
      }
      let input;
      if (f.type === 'entry') input = entrySelect(p, f.entryType, e.fields[f.key], (v) => { e.fields[f.key] = v; changed(e); }, e.id);
      else {
        input = textInput(e.fields[f.key], (v) => {
          e.fields[f.key] = v;
          changed(e, f.key === 'role' || f.key === 'kind' || f.key === 'age' || f.key === 'length');
          if (e.type === 'creature' && S.refreshFigure && (f.size || f.key === 'kind' || f.key === 'looks')) S.refreshFigure();
        }, { textarea: f.type === 'textarea', placeholder: f.placeholder });
      }
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
        relBox.appendChild(h('div', { class: 'tl-head rel-row' }, h('span', null, '相手'), h('span', null, '種類'), h('span', null, '呼び方'), h('span', null, '関係・メモ'), h('span')));
        e.relations.forEach((r, i) => {
          const kindSel = h('select', { class: 'input', onchange: (ev) => { r.kind = ev.target.value; changed(e); } },
            NS.RelMap.KINDS.map((k) => h('option', { value: k.id, selected: (r.kind || NS.RelMap.guessKind(r.note)) === k.id }, k.label)));
          relBox.appendChild(h('div', { class: 'rel-row' },
            entrySelect(p, 'character', r.targetId, (v) => { r.targetId = v; changed(e); }, e.id),
            kindSel,
            textInput(r.calls, (v) => { r.calls = v; changed(e); }, { placeholder: '例：蓮くん（複数は／）' }),
            textInput(r.note, (v) => { r.note = v; changed(e); }, { placeholder: '幼なじみ、師弟 など' }),
            btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: () => { e.relations.splice(i, 1); changed(e); renderRel(); } })));
        });
        relBox.appendChild(h('div', { class: 'row wrap' },
          btn('関係を追加', { icon: 'plus', small: true, ghost: true, onClick: () => { e.relations.push({ targetId: '', kind: 'friend', calls: '', note: '' }); changed(e); renderRel(); } }),
          btn('相関図で見る', { icon: 'network', small: true, ghost: true, onClick: () => { S.tab = 'relmap'; S.selected = null; renderTabs(); renderList(); renderDetail(); } })));
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

    // 地図との連携（生物：置いた地図へ）
    if (e.type === 'creature') {
      const links = [];
      p.maps.forEach((m) => (m.stamps || []).forEach((mk) => { if (mk.a === 'creature:' + e.id) links.push({ m, mk }); }));
      form.appendChild(h('h3', { class: 'form-section' }, '地図'));
      form.appendChild(links.length
        ? h('div', { class: 'row wrap' }, links.slice(0, 6).map(({ m, mk }) => btn(`${m.name}で表示`, { icon: 'map', small: true, onClick: () => {
          NS.App.pendingMapFocus = { mapId: m.id, stampId: mk.id };
          NS.App.navigate('map', { id: m.id });
        } })))
        : h('p', { class: 'muted small' }, '地図画面の「素材」に「生物（設定資料）」が出ます。この姿の図のまま、すみかなどに置けます。'));
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
  // 世界の設定メモ（AI の設定チェックでも参照する）
  const BIBLE = [
    ['magic', '魔法・特別な力', '例：誰が使えるか／使うと何を失うか（代償）／できないこと（限界）／呪文や道具は要るか'],
    ['religion', '宗教・信仰', '例：信じられている神や教え／祈りや祭りの習わし／信仰と政治の関係'],
    ['politics', '政治・身分', '例：国の治め方（王政・議会など）／身分の上下とその呼び方／税や兵役'],
    ['races', '種族・民族', '例：人間以外の種族／寿命や体の特徴／種族どうしの仲'],
    ['language', '言葉・文字', '例：話されている言葉の数／読み書きできる人の割合／方言や古い言葉'],
    ['geography', '地理・気候', '例：季節の巡り／暑い所・寒い所／旅の手段と日数（地図の「距離」で測れます）'],
    ['life', '暮らし・食べ物', '例：主食／一日の食事の回数／住まい・服装／娯楽'],
    ['law', '法律・禁忌', '例：重い罪と罰／してはいけないこと（タブー）／誰が裁くか'],
    ['manners', '呼び方・礼儀', '例：目上への呼びかけ（陛下・閣下・殿）／挨拶の仕方／名前の付け方'],
  ];
  const CURRENCY_TEMPLATES = [
    ['金貨・銀貨・銅貨（1：100：10000）', [['金貨', 10000], ['銀貨', 100], ['銅貨', 1]], 100],
    ['金貨・銀貨・銅貨（1：10：100）', [['金貨', 100], ['銀貨', 10], ['銅貨', 1]], 1000],
    ['和風（両・分・朱・文）', [['両', 4000], ['分', 1000], ['朱', 250], ['文', 1]], 25],
  ];
  const UNIT_TEMPLATES = [
    ['ファンタジー風（歩・里・斤・杯）', [['length', '歩', 0.75], ['length', '里', 4000], ['weight', '斤', 600], ['volume', '杯', 0.25]]],
    ['和風（尺・間・町・里・貫・升）', [['length', '尺', 0.303], ['length', '間', 1.818], ['length', '町', 109.1], ['length', '里', 3927], ['weight', '斤', 600], ['weight', '貫', 3750], ['volume', '合', 0.18], ['volume', '升', 1.8]]],
  ];
  const UNIT_SCALES = { length: [['m', 1], ['km', 1000], ['cm', 0.01]], weight: [['g', 1], ['kg', 1000]], volume: [['L', 1], ['mL', 0.001]] };
  const PRICE_ITEMS = ['パン1個', '酒1杯', '宿1泊（食事つき）', '剣1振り', '馬1頭', '職人の日当', '兵士のひと月の給金', '本1冊'];
  const roundShow = (v) => (v >= 100 ? UI.fmtNum(Math.round(v)) : String(Math.round(v * 100) / 100));

  function rulesPane() {
    const p = P();
    const W = NS.WorldRules;
    const box = h('div', { class: 'entry-form rules-pane' });
    box.appendChild(h('h2', { class: 'pane-title' }, '世界観ルール'));
    const nav = h('nav', { class: 'rules-nav', 'aria-label': '世界観ルールの項目' });
    box.appendChild(nav);
    box.appendChild(h('p', { class: 'muted small' }, '決めた所だけで構いません。「本文チェック」の印がある項目は、執筆画面の「設定チェック」で本文と照らし合わせ、この世界の言い方に直す案を出します。'));
    const mini = (label, input) => h('label', { class: 'mini-field' }, h('span', { class: 'mini-label' }, label), input);
    const numInput = (value, onInput, opts) => h('input', Object.assign({ class: 'input input-num', type: 'number', min: 0, step: 'any', value: value || '', oninput: (e) => onInput(+e.target.value || 0) }, opts || {}));
    const confirmRemove = async (filled, what) => !filled || UI.confirm(`この${what}を削除します。`, { danger: true, okLabel: '削除' });
    const section = (id, short, title, checked, note) => {
      const sec = h('section', { class: 'rules-sec', id: 'rules-' + id },
        h('h3', { class: 'form-section' }, title, checked ? h('span', { class: 'check-note' }, '本文チェック') : note ? h('span', { class: 'check-note' }, note) : null));
      nav.appendChild(h('button', { type: 'button', class: 'chip', onclick: () => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, short));
      box.appendChild(sec);
      return sec;
    };

    // 概要と語り手
    const secBase = section('base', '概要', '世界観の説明・語り手', false);
    secBase.appendChild(UI.field('世界観の説明', textInput(p.rules.world, (v) => { p.rules.world = v; touch(); }, {
      textarea: true, rows: 5, placeholder: '例：剣と魔法の世界。火薬や電気は存在しない。魔法は詠唱が必要で、使うと体力を消耗する。…',
    }), 'AIの設定矛盾チェックで参照します'));
    const C = NS.Consistency;
    const narrHelp = h('p', { class: 'muted small' });
    const updateNarrHelp = () => {
      const v = p.rules.narrator || 'auto';
      narrHelp.textContent = {
        auto: '話ごとに本文から判定します。地の文に「僕は」「私の」などがよく出てくれば一人称、そうでなければ三人称とみなします。',
        first: '主人公など作中の人物が語るので、地の文に出てくるNGワードや現実の単位も指摘します。',
        third: '作中の人物に寄り添った三人称なので、地の文のNGワードや現実の単位は「参考」として控えめに指摘します。',
        omniscient: '作品の外にいる語り手なので、地の文のNGワードや現実の単位（読者向けの「メートル」など）は指摘しません。台詞と、この世界にない物（電話など）だけチェックします。',
      }[v];
    };
    const narrSel = h('select', {
      class: 'input', onchange: (e) => { p.rules.narrator = e.target.value; touch(); updateNarrHelp(); },
    }, Object.keys(C.NARRATORS).map((k) => h('option', { value: k, selected: (p.rules.narrator || 'auto') === k }, C.NARRATORS[k])));
    updateNarrHelp();
    secBase.appendChild(UI.field('この作品の語り手（地の文の視点）', narrSel));
    secBase.appendChild(narrHelp);
    secBase.appendChild(h('p', { class: 'muted small' }, '話ごとに語り手が違う場合は、執筆画面の「設定チェック」タブで、その話だけ変えられます。'));
    secBase.appendChild(UI.field('作品のあらすじ', textInput(p.synopsis, (v) => { p.synopsis = v; touch(); }, { textarea: true, rows: 3, placeholder: 'AIチェックの参考になります' })));

    // 通貨
    const cur = p.rules.currency;
    const secCur = section('currency', '通貨', '通貨・物価', true);
    secCur.appendChild(h('p', { class: 'muted small' }, '硬貨や紙幣の名前と、いちばん小さいお金で何枚分かを決めます。本文の「〇円」「ドル」や、決めていない硬貨（「白金貨」など）を指摘します。'));
    const curList = h('div', { class: 'rule-rows' });
    const curSummary = h('p', { class: 'rule-summary' });
    const curConv = h('div', { class: 'converter' });
    const coinList = () => cur.units.filter((u) => u.name && u.value > 0).sort((a, b) => b.value - a.value);
    const updCur = () => {
      const list = coinList();
      curSummary.textContent = list.length >= 2 ? list.map((u, i) => (i === 0 ? `${u.name}1枚` : `${u.name}${roundShow(list[0].value / u.value)}枚`)).join(' ＝ ') : '';
      renderCurConv();
    };
    const renderCur = (focusLast) => {
      clear(curList);
      cur.units.forEach((u, i) => {
        const name = textInput(u.name, (v) => { u.name = v.trim(); touch(); updCur(); }, { placeholder: '例：金貨、黒聖貨' });
        curList.appendChild(h('div', { class: 'cur-row' },
          mini('お金の名前', name),
          mini('読み（造語なら）', textInput(u.reading, (v) => { u.reading = v.trim(); touch(); }, { placeholder: '例：こくせいか' })),
          mini('最小のお金で何枚分', numInput(u.value, (v) => { u.value = v; touch(); updCur(); }, { min: 1, 'aria-label': 'いちばん小さいお金で何枚分' })),
          h('div', { class: 'row-del' }, btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: async () => {
            if (!(await confirmRemove(u.name, 'お金'))) return;
            cur.units.splice(i, 1); touch(); renderCur();
          } })),
          h('div', { class: 'cur-note' }, mini('メモ（素材・見た目・発行元など。なくても可）', textInput(u.note, (v) => { u.note = v; touch(); }, { placeholder: '例：黒い聖銀で作られ、王家の紋章が刻まれた最高額の硬貨' })))));
        if (focusLast && i === cur.units.length - 1) name.focus();
      });
      curList.appendChild(h('div', { class: 'row wrap' },
        btn('お金を追加', { icon: 'plus', small: true, ghost: true, onClick: () => { cur.units.push({ name: '', value: 1, reading: '', note: '' }); touch(); renderCur(true); } }),
        btn('造語のお金を考える', { icon: 'dice', small: true, ghost: true, title: '「黒聖貨」のような、この世界だけのお金の名前と換算をまとめて考えます', onClick: () => coinDialog() }),
        ...CURRENCY_TEMPLATES.map(([label, list, yen]) => btn('ひな形：' + label, { small: true, ghost: true, onClick: async () => {
          if (cur.units.some((u) => u.name) && !(await UI.confirm('今のお金の設定を、ひな形で置き換えます。'))) return;
          cur.units = list.map(([name, value]) => ({ name, value, reading: '', note: '' }));
          if (!cur.yen) cur.yen = yen;
          touch(); renderCur(); renderYen();
        } }))));
      updCur();
    };
    // 造語のお金を考える（高い順に3段、読みと換算つき）
    const coinDialog = () => {
      let style = 'kanji';
      let seed = Math.floor(Math.random() * 1e6);
      const chips = h('div', { class: 'chips' });
      const listEl = h('div', { class: 'coin-sets' });
      let closeFn = null;
      const roll = () => {
        clear(chips);
        [['kanji', '漢字の造語（〜貨・読みつき）'], ['kana', 'カタカナの造語']].forEach(([k, l]) => chips.appendChild(h('button', {
          type: 'button', class: 'chip' + (style === k ? ' active' : ''), onclick: () => { style = k; roll(); } }, l)));
        clear(listEl);
        W.coinSets(style, seed, 6).forEach((set) => {
          const label = set.coins.map((c, i) => (i === 0 ? `${c.name}1枚` : `${c.name}${UI.fmtNum(set.coins[0].value / c.value)}枚`)).join(' ＝ ');
          listEl.appendChild(h('div', { class: 'coin-set' },
            h('div', { class: 'coin-set-main' },
              h('div', { class: 'coin-names' }, set.coins.map((c) => h('span', { class: 'coin-name' }, h('strong', null, c.name), c.reading ? h('span', { class: 'small muted' }, c.reading) : null))),
              h('div', { class: 'small muted' }, label)),
            btn('これにする', { small: true, primary: true, onClick: async () => {
              if (cur.units.some((u) => u.name) && !(await UI.confirm('今のお金の設定を、この組み合わせで置き換えます。'))) return;
              cur.units = set.coins.map((c) => ({ name: c.name, value: c.value, reading: c.reading, note: '' }));
              if (!cur.yen) cur.yen = set.yen;
              touch(); renderCur(); renderYen();
              if (closeFn) closeFn();
              UI.toast('お金を決めました。名前・読み・換算はあとから自由に変えられます');
            } })));
        });
      };
      roll();
      closeFn = UI.modal({
        title: '造語のお金を考える', wide: true,
        body: h('div', { class: 'stack' },
          h('p', { class: 'small muted' }, 'この世界だけのお金の名前を、高い順に3段の組み合わせで考えます。気に入ったものを選ぶと、読みと換算ごと入ります（あとで1つずつ変えられます）。'),
          chips, listEl),
        actions: [{ label: 'ほかの案', onClick: () => { seed = Math.floor(Math.random() * 1e6); roll(); return false; } }, { label: '閉じる', primary: true }],
      });
    };
    const yenBox = h('div');
    const renderYen = () => {
      clear(yenBox);
      const small = coinList().slice(-1)[0];
      yenBox.appendChild(UI.field(`${small ? small.name : 'いちばん小さいお金'}1枚は、およそ何円？（なくても可）`,
        h('div', { class: 'row' }, numInput(cur.yen, (v) => { cur.yen = v; touch(); renderCurConv(); }, { 'aria-label': '円での目安' }), h('span', { class: 'small muted' }, '円')),
        '入れると、本文の「千円」などを、この世界のお金に換算した言い換えにします'));
    };
    // 換算の道具（入力欄は作り直さず、結果だけを書き換える。打っている途中で入力欄が消えないように）
    let convAmount = 1;
    let convCoin = '';
    const curConvSel = h('select', { class: 'input', 'aria-label': 'お金の種類', onchange: (e) => { convCoin = e.target.value; renderCurConv(); } });
    const curConvOut = h('div', { class: 'conv-out small' });
    curConv.append(h('div', { class: 'conv-in' }, h('span', { class: 'small muted' }, '換算'),
      numInput(convAmount, (v) => { convAmount = v; renderCurConv(); }, { 'aria-label': '枚数' }), curConvSel, h('span', { class: 'small muted' }, '枚は')), curConvOut);
    function renderCurConv() {
      const list = coinList();
      curConv.hidden = !list.length;
      if (!list.length) return;
      if (!list.some((u) => u.name === convCoin)) convCoin = list[0].name;
      const names = list.map((u) => u.name).join('\u0000');
      if (curConvSel.dataset.names !== names) {
        clear(curConvSel);
        list.forEach((u) => curConvSel.appendChild(h('option', { value: u.name, selected: u.name === convCoin }, u.name)));
        curConvSel.dataset.names = names;
      }
      const from = list.find((u) => u.name === convCoin);
      const base = convAmount * from.value;
      clear(curConvOut);
      list.filter((u) => u !== from).forEach((u) => curConvOut.appendChild(h('span', null, `${u.name} ${roundShow(base / u.value)}枚`)));
      if (cur.yen > 0) curConvOut.appendChild(h('span', { class: 'muted' }, `およそ ${UI.fmtNum(Math.round(base * cur.yen))}円`));
    }
    renderYen();
    renderCur();
    secCur.append(curList, curSummary, yenBox, curConv);
    // 物価の目安
    const priceBox = h('div', { class: 'rule-rows' });
    const renderPrices = () => {
      clear(priceBox);
      cur.prices.forEach((x, i) => priceBox.appendChild(h('div', { class: 'st-row' },
        textInput(x.item, (v) => { x.item = v; touch(); }, { placeholder: '品物' }),
        h('span', { class: 'st-arrow', 'aria-hidden': 'true' }, '…'),
        textInput(x.price, (v) => { x.price = v; touch(); }, { placeholder: '例：銅貨5枚' }),
        btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: async () => {
          if (!(await confirmRemove(x.item || x.price, '品物'))) return;
          cur.prices.splice(i, 1); touch(); renderPrices();
        } }))));
      priceBox.appendChild(h('div', { class: 'row wrap' },
        btn('品物を追加', { icon: 'plus', small: true, ghost: true, onClick: () => { cur.prices.push({ item: '', price: '' }); touch(); renderPrices(); } }),
        cur.prices.length ? null : btn('よくある品物を並べる', { small: true, ghost: true, onClick: () => { cur.prices = PRICE_ITEMS.map((item) => ({ item, price: '' })); touch(); renderPrices(); } })));
    };
    renderPrices();
    secCur.append(h('div', { class: 'mini-label' }, '物価の目安（値段がぶれないように。AIのチェックでも参照します）'), priceBox);

    // 単位
    const un = p.rules.units;
    const secUnit = section('units', '単位', '長さ・重さ・量の単位', true);
    secUnit.appendChild(h('p', { class: 'muted small' }, 'この世界の単位と、現実でいうとどれくらいかを決めます。本文の「百メートル」は「約百三十歩」、「三千メートル」は「一里足らず」のように換算した言い換えを出します（決めた種類だけをチェックします）。'));
    const unitList = h('div', { class: 'rule-rows' });
    const unitConv = h('div', { class: 'converter' });
    const renderUnits = (focusLast) => {
      clear(unitList);
      un.list.forEach((u, i) => {
        const scales = UNIT_SCALES[u.kind];
        let scale = scales.find(([, f]) => u.amount && u.amount / f >= 1 && u.amount / f < 1000) || scales[0];
        if (u.kind === 'length' && u.amount && u.amount < 1) scale = scales[2];
        const amt = numInput(u.amount ? Math.round(u.amount / scale[1] * 1000) / 1000 : '', (v) => { u.amount = v * scale[1]; touch(); renderUnitConv(); }, { 'aria-label': '現実の量' });
        const name = textInput(u.name, (v) => { u.name = v.trim(); touch(); renderUnitConv(); }, { placeholder: '例：歩' });
        unitList.appendChild(h('div', { class: 'unit-row' },
          mini('種類', h('select', { class: 'input', onchange: (e) => { u.kind = e.target.value; u.amount = 0; touch(); renderUnits(); } },
            Object.keys(W.KIND_LABEL).map((k) => h('option', { value: k, selected: u.kind === k }, W.KIND_LABEL[k])))),
          mini('単位の名前', name),
          mini('現実でいうと', h('div', { class: 'row nowrap' }, amt, h('select', { class: 'input input-unit', 'aria-label': '現実の単位', onchange: (e) => {
            const f = scales.find(([k]) => k === e.target.value);
            const shown = +amt.value || 0;
            scale = f;
            u.amount = shown * f[1];
            touch(); renderUnitConv();
          } }, scales.map(([k]) => h('option', { value: k, selected: k === scale[0] }, k))))),
          h('div', { class: 'row-del' }, btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: async () => {
            if (!(await confirmRemove(u.name, '単位'))) return;
            un.list.splice(i, 1); touch(); renderUnits();
          } }))));
        if (focusLast && i === un.list.length - 1) name.focus();
      });
      unitList.appendChild(h('div', { class: 'row wrap' },
        btn('単位を追加', { icon: 'plus', small: true, ghost: true, onClick: () => { un.list.push({ kind: 'length', name: '', amount: 0 }); touch(); renderUnits(true); } }),
        ...UNIT_TEMPLATES.map(([label, list]) => btn('ひな形：' + label, { small: true, ghost: true, onClick: async () => {
          if (un.list.some((u) => u.name) && !(await UI.confirm('今の単位の設定を、ひな形で置き換えます。'))) return;
          un.list = list.map(([kind, name, amount]) => ({ kind, name, amount }));
          touch(); renderUnits();
        } }))));
      renderUnitConv();
    };
    let ucVal = 100;
    let ucUnit = 'm';
    const REAL_PICK = [['m', 'length', 1], ['km', 'length', 1000], ['cm', 'length', 0.01], ['g', 'weight', 1], ['kg', 'weight', 1000], ['L', 'volume', 1]];
    const unitConvSel = h('select', { class: 'input', 'aria-label': '現実の単位', onchange: (e) => { ucUnit = e.target.value; renderUnitConv(); } });
    const unitConvOut = h('div', { class: 'conv-out small' });
    unitConv.append(h('div', { class: 'conv-in' }, h('span', { class: 'small muted' }, '換算'),
      numInput(ucVal, (v) => { ucVal = v; renderUnitConv(); }, { 'aria-label': '現実の量' }), unitConvSel, h('span', { class: 'small muted' }, 'は')), unitConvOut);
    function renderUnitConv() {
      const good = un.list.filter((u) => u.name && u.amount > 0);
      unitConv.hidden = !good.length;
      if (!good.length) return;
      const kinds = new Set(good.map((u) => u.kind));
      const picks = REAL_PICK.filter(([, k]) => kinds.has(k));
      if (!picks.some(([k]) => k === ucUnit)) ucUnit = picks[0][0];
      const keys = picks.map(([k]) => k).join(',');
      if (unitConvSel.dataset.keys !== keys) {
        clear(unitConvSel);
        picks.forEach(([k]) => unitConvSel.appendChild(h('option', { value: k, selected: k === ucUnit }, k)));
        unitConvSel.dataset.keys = keys;
      }
      const [, kind, f] = picks.find(([k]) => k === ucUnit);
      clear(unitConvOut);
      W.unitTable(ucVal * f, kind, good).forEach((r) => unitConvOut.appendChild(h('span', null, `${roundShow(r.value)} ${r.name}`)));
      const said = ucVal > 0 ? W.convertUnit(ucVal * f, kind, good, true, '') : '';
      if (said) unitConvOut.appendChild(h('span', { class: 'muted' }, '本文では：' + said));
    }
    renderUnits();
    secUnit.append(unitList, unitConv);

    // 暦と時刻
    const cal = p.rules.calendar;
    const secCal = section('calendar', '暦・時刻', '暦と時刻', true);
    secCal.appendChild(h('p', { class: 'muted small' }, '年の数え方・月や曜日の名前・時計のあるなしを決めます。本文の「西暦」「月曜日」「三月」、時計のない世界の「三時」「十分後」を指摘します。'));
    const listCount = h('span', { class: 'small muted' });
    const wdCount = h('span', { class: 'small muted' });
    const splitList = (v) => String(v || '').split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean);
    const showCount = () => {
      listCount.textContent = cal.months.length ? `${cal.months.length}個${cal.months.length === 12 ? '（「一月〜十二月」をこの名前に言い換えます）' : '（12個にすると、本文の「〇月」を言い換えます）'}` : '';
      wdCount.textContent = cal.weekdays.length ? `${cal.weekdays.length}個${cal.weekdays.length === 7 ? '（月曜→1つめ…日曜→7つめに言い換えます）' : ''}` : '';
    };
    secCal.append(
      UI.field('年の数え方', textInput(cal.era, (v) => { cal.era = v.trim(); touch(); }, { placeholder: '例：王国暦' }), '入れると、本文の「西暦」「令和」などを指摘します'),
      UI.field('月の名前（「、」で区切る）', textInput(cal.months.join('、'), (v) => { cal.months = splitList(v); touch(); showCount(); }, { placeholder: '例：霜の月、雪解けの月、芽吹きの月、…（12個）' }), listCount),
      UI.field('曜日の名前（「、」で区切る）', textInput(cal.weekdays.join('、'), (v) => { cal.weekdays = splitList(v); touch(); showCount(); }, { placeholder: '例：光の日、風の日、火の日、水の日、木の日、金の日、土の日' }), wdCount),
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: cal.noWeek, onchange: (e) => { cal.noWeek = e.target.checked; touch(); } }), 'この世界には曜日がない'),
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: cal.noClock, onchange: (e) => { cal.noClock = e.target.checked; touch(); } }), 'この世界には時計がない（「三時」「十分後」「五秒」を指摘）'),
      UI.field('時刻の言い方（なくても可）', textInput(cal.timeNote, (v) => { cal.timeNote = v; touch(); }, { placeholder: '例：一日を十二の鐘で数える（一の鐘＝日の出）' })),
      UI.field('季節・一年のメモ（なくても可）', textInput(cal.yearNote, (v) => { cal.yearNote = v; touch(); }, { textarea: true, rows: 2, placeholder: '例：一年は360日。春分の日が新年。夏至に収穫祭' })));
    showCount();

    // 文明の水準
    const tc = p.rules.tech;
    const secTech = section('tech', '文明', '文明の水準（この世界にないもの）', true);
    secTech.appendChild(h('p', { class: 'muted small' }, 'この世界にないもの（電気・自動車・銃など）を選ぶと、本文に出てきたときに指摘します。物そのものがないので、地の文でも指摘します。'));
    const catBox = h('div', { class: 'tech-grid' });
    const renderCats = () => {
      clear(catBox);
      W.TECH.forEach((c) => catBox.appendChild(h('label', { class: 'tech-item' },
        h('input', { type: 'checkbox', checked: tc.cats.includes(c.id), onchange: (e) => {
          tc.cats = e.target.checked ? tc.cats.concat([c.id]) : tc.cats.filter((x) => x !== c.id);
          tc.preset = 'custom'; presetSel.value = 'custom'; touch();
        } }),
        h('span', null, h('strong', null, c.label + 'がない'), h('span', { class: 'small muted' }, c.words.slice(0, 6).map((w) => w[0]).join('・') + (c.words.length > 6 ? '…' : ''))))));
    };
    const presetSel = h('select', { class: 'input', 'aria-label': '文明の水準', onchange: (e) => {
      const pr = W.TECH_PRESETS[e.target.value];
      tc.preset = e.target.value;
      if (pr) { tc.cats = pr.cats.slice(); tc.loanwords = pr.loan; loanChk.checked = pr.loan; }
      touch(); renderCats();
    } }, Object.keys(W.TECH_PRESETS).map((k) => h('option', { value: k, selected: tc.preset === k }, W.TECH_PRESETS[k].label)), h('option', { value: 'custom', selected: !W.TECH_PRESETS[tc.preset] }, '自分で選ぶ'));
    const loanChk = h('input', { type: 'checkbox', checked: tc.loanwords, onchange: (e) => { tc.loanwords = e.target.checked; touch(); } });
    renderCats();
    secTech.append(
      UI.field('時代の目安', presetSel, '選ぶと、下の「ないもの」がまとめて選ばれます。あとから1つずつ変えられます'),
      catBox,
      h('label', { class: 'check small' }, loanChk, 'カタカナの外来語を控える（和風・時代もの向け。「ドア→戸・扉」「チャンス→好機」など約120語）'),
      UI.field('この世界にはある言葉（指摘しない）', textInput(tc.allow, (v) => { tc.allow = v; touch(); }, { placeholder: '例：時計、ガラス、ランプ（「、」で区切る）' })),
      UI.field('ほかに、この世界にないもの', textInput(tc.extra, (v) => { tc.extra = v; touch(); }, { placeholder: '例：紅茶、煙草、じゃがいも（「、」で区切る）' }), '食べ物や動物など、この世界にないものも足せます'));

    // NGワード・表記統一
    const secNg = section('ng', 'NGワード', '作中で使わない言葉（NGワード）', true);
    secNg.appendChild(h('p', { class: 'muted small' }, '例：中世風の世界なのに「メートル」「スマホ」、和風の世界なのに「ドア」など。言い換えを入れると一発で修正できます。台詞の中は常にチェックし、地の文は「対象」と語り手の設定に従います。'));
    const ngBox = h('div', { class: 'ng-list' });
    const SCOPES = [['auto', '台詞＋語り手しだい'], ['all', '台詞も地の文も'], ['dialogue', '台詞だけ']];
    const renderNg = (focusLast) => {
      clear(ngBox);
      if (!p.rules.ng.length) ngBox.appendChild(h('p', { class: 'muted small' }, 'まだ登録がありません。'));
      p.rules.ng.forEach((r, i) => {
        const word = textInput(r.word, (v) => { r.word = v; touch(); }, { placeholder: '言葉', class: 'ng-word' });
        ngBox.appendChild(h('div', { class: 'ng-card' },
          mini('作中で使わない言葉', word),
          mini('言い換え（なくても可）', textInput(r.suggestion, (v) => { r.suggestion = v; touch(); }, { placeholder: '言い換え' })),
          mini('チェックする範囲', h('select', { class: 'input', onchange: (e) => { r.scope = e.target.value; touch(); } },
            SCOPES.map(([v, l]) => h('option', { value: v, selected: (r.scope || 'auto') === v }, l)))),
          h('div', { class: 'ng-del' }, btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: async () => {
            if (!(await confirmRemove(r.word || r.reason || r.suggestion, 'NGワード'))) return;
            p.rules.ng.splice(i, 1); touch(); renderNg(); renderTabs();
          } })),
          h('div', { class: 'ng-reason' }, mini('理由・メモ（なくても可）', textInput(r.reason, (v) => { r.reason = v; touch(); }, { placeholder: '例：この世界の長さの単位は「歩」' })))));
        if (focusLast && i === p.rules.ng.length - 1) word.focus();
      });
      ngBox.appendChild(btn('NGワードを追加', { icon: 'plus', small: true, ghost: true, onClick: () => { p.rules.ng.push({ word: '', reason: '', suggestion: '', scope: 'auto' }); touch(); renderNg(true); renderTabs(); } }));
    };
    renderNg();
    secNg.appendChild(ngBox);

    const secSt = section('style', '表記統一', '表記統一ルール', false, '添削で検出');
    secSt.appendChild(h('p', { class: 'muted small' }, '作品内で表記を揃えたい語を登録します。例：「出来る→できる」「魔方陣→魔法陣」。'));
    const stBox = h('div', { class: 'table-like' });
    const renderSt = (focusLast) => {
      clear(stBox);
      if (!p.rules.style.length) stBox.appendChild(h('p', { class: 'muted small' }, 'まだ登録がありません。'));
      else stBox.appendChild(h('div', { class: 'tl-head st-row' }, h('span', null, '置き換え前'), h('span'), h('span', null, '置き換え後'), h('span')));
      p.rules.style.forEach((r, i) => {
        const from = textInput(r.from, (v) => { r.from = v; touch(); }, { placeholder: '置き換え前' });
        stBox.appendChild(h('div', { class: 'st-row' },
          from,
          h('span', { class: 'st-arrow', 'aria-hidden': 'true' }, '→'),
          textInput(r.to, (v) => { r.to = v; touch(); }, { placeholder: '置き換え後' }),
          btn('', { icon: 'trash', ghost: true, small: true, title: '削除', onClick: async () => {
            if (!(await confirmRemove(r.from || r.to, '表記統一ルール'))) return;
            p.rules.style.splice(i, 1); touch(); renderSt(); renderTabs();
          } })));
        if (focusLast && i === p.rules.style.length - 1) from.focus();
      });
      stBox.appendChild(btn('ルールを追加', { icon: 'plus', small: true, ghost: true, onClick: () => { p.rules.style.push({ from: '', to: '' }); touch(); renderSt(true); renderTabs(); } }));
    };
    renderSt();
    secSt.appendChild(stBox);


    // 世界の設定メモ
    const bible = p.rules.bible;
    const secBible = section('bible', '設定メモ', '世界の設定メモ', false, 'AIチェックで参照');
    secBible.appendChild(h('p', { class: 'muted small' }, '書きながら迷わないように、世界の決まりをまとめておく場所です。書いた項目は、AIの設定チェックで本文と照らし合わせます。空欄の項目は使いません。'));
    BIBLE.forEach(([key, label, hint]) => {
      const ta = textInput(bible[key], (v) => { bible[key] = v; touch(); }, { textarea: true, rows: 2, placeholder: hint });
      secBible.appendChild(h('details', { class: 'bible-item', open: !!(bible[key] && bible[key].trim()) },
        h('summary', null, label, bible[key] && bible[key].trim() ? h('span', { class: 'small muted' }, '（記入あり）') : null), ta));
    });

    // 全話を調べる
    const secScan = section('scan', '全話を調べる', '全話を調べる', false);
    const scanOut = h('div', { class: 'scan-out' });
    const KIND_NAME = { unit: '単位', money: 'お金', coin: '硬貨', calendar: '暦', clock: '時刻', tech: '文明', loan: '外来語', ng: 'NGワード' };
    const runScan = () => {
      clear(scanOut);
      const hits = [];
      const only = { 'ng-word': true, world: true, 'name-variant': false, 'first-person': false, calls: false, appearance: false, age: false, timeline: false };
      p.chapters.forEach((c, ci) => {
        const res = NS.Consistency.check(c.body, { entries: p.entries, rules: p.rules, chapterNo: ci + 1, narrator: c.narrator || p.rules.narrator || 'auto', enabled: only });
        res.issues.forEach((it) => hits.push({ c, ci, it, kind: it.ruleId === 'ng-word' ? 'ng' : it.worldKind }));
      });
      if (!hits.length) { scanOut.appendChild(h('p', { class: 'small' }, '世界観ルールに合わない所は見つかりませんでした。')); return; }
      const counts = {};
      hits.forEach((x) => { counts[x.kind] = (counts[x.kind] || 0) + 1; });
      scanOut.appendChild(h('p', { class: 'small' }, h('strong', null, `${hits.length}か所`), '　' + Object.keys(counts).map((k) => `${KIND_NAME[k] || k} ${counts[k]}`).join('・')));
      scanOut.appendChild(h('div', { class: 'hit-list' }, hits.slice(0, 150).map((x) => h('button', {
        type: 'button', class: 'hit-row scan-row',
        onclick: () => { NS.App.navigate('write', { id: x.c.id }); setTimeout(() => NS.Views.write.focusRange && NS.Views.write.focusRange(x.it.start, x.it.end), 80); },
      },
      h('span', { class: 'muted small' }, `第${x.ci + 1}話`),
      h('span', null, x.c.body.slice(Math.max(0, x.it.start - 10), x.it.start), h('mark', null, x.it.text), x.c.body.slice(x.it.end, x.it.end + 12),
        x.it.suggestion ? h('span', { class: 'scan-sug' }, ' → ' + x.it.suggestion) : null,
        h('span', { class: 'small muted scan-msg' }, x.it.message))))));
      if (hits.length > 150) scanOut.appendChild(h('p', { class: 'small muted' }, `ほか ${hits.length - 150}か所`));
    };
    secScan.append(h('p', { class: 'muted small' }, 'いまの世界観ルールで全話を調べ、合わない所を一覧にします。設定を変えたら、もう一度押して確かめられます。クリックすると、その場所へ移動します。'),
      btn('全話を調べる', { icon: 'search', small: true, onClick: runScan }), scanOut);
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

  // ───── 生物の図 ─────
  let figTimer = 0;
  function creatureFigure(e) {
    const p = P();
    const C = NS.Creature;
    const units = () => (p.rules.units && p.rules.units.list) || [];
    const fig = () => { if (!e.figure || typeof e.figure !== 'object') e.figure = {}; return e.figure; };
    const box = h('section', { class: 'creature-fig' });
    const stage = h('div', { class: 'cf-stage' });
    const note = h('p', { class: 'small muted cf-note' });
    const tools = h('div', { class: 'cf-tools' });
    const current = () => C.figureOf(e);
    const draw = () => {
      const f = current();
      try {
        // 狭い画面では小さめの図にして、文字が読める大きさを保つ
        const W = narrow() ? 480 : 900;
        stage.innerHTML = C.render({ name: e.name, fields: e.fields, figure: f }, { width: W, height: Math.round(W * 0.6), view: f.view || 'figure', units: units() });
      } catch (err) {
        stage.textContent = '図を描けませんでした';
        return;
      }
      const ms = C.measure(f, e.fields, units());
      const bits = [];
      if (ms.basis === 'default') bits.push(`大きさが未入力なので、${C.PRESETS[f.preset].label}の目安（${C.fmtLen(ms.length)}）で描いています。下の「全長」に「40m」「旅客機ほど」「象の3倍」のように書くと、その大きさになります。`);
      else bits.push(`${{ length: ms.lengthLabel, height: '高さ', wingspan: '翼を広げた幅' }[ms.basis]}の設定（${e.fields[ms.basis]}）から描いています。`);
      bits.push(`体の大きさから見積もった体重：約${C.fmtWeight(ms.weight)}${ms.weightSet ? `（設定は${C.fmtWeight(ms.weightSet)}）` : ''}`);
      const fl = C.flightNote(ms);
      if (fl) bits.push(`飛ぶこと：${fl}`);
      note.textContent = bits.join('　');
    };
    const keepView = (nf) => { ['view', 'compare'].forEach((k) => { if (e.figure && e.figure[k]) nf[k] = e.figure[k]; }); return nf; };
    const set = (k, v, rebuild) => { const f = fig(); if (!f.preset) f.preset = current().preset; f[k] = v; changed(e); draw(); if (rebuild) renderTools(); };
    S.refreshFigure = () => {
      clearTimeout(figTimer);
      figTimer = setTimeout(() => { if (S && S.refreshFigure && stage.isConnected) draw(); }, 150);
    };
    const sel = (label, list, value, onChange) => UI.field(label, h('select', { class: 'input', onchange: (ev) => onChange(ev.target.value) },
      list.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
    const SLIDERS = [['neck', '首の長さ'], ['tail', '尾・体の長さ'], ['legs', '脚の長さ'], ['bulk', '体の太さ'], ['head', '頭の大きさ'], ['wing', '翼の大きさ']];
    const SKIP = { quad: [], biped: [], bird: [], humanoid: ['neck', 'tail'], serpent: ['legs'], fish: ['neck', 'legs'], insect: ['neck', 'tail', 'head'], spider: ['neck', 'tail', 'head'], blob: ['neck', 'tail', 'legs', 'head'] };
    let open = false;
    const renderTools = () => {
      clear(tools);
      const f = current();
      const r = C.resolve(f);
      const plan = C.PRESETS[r.preset].plan;
      const views = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': '表し方' }, C.VIEWS.map(([v, l]) => h('button', {
        type: 'button', class: 'chip' + ((f.view || 'figure') === v ? ' active' : ''), 'aria-pressed': String((f.view || 'figure') === v),
        onclick: () => set('view', v, true),
      }, l)));
      tools.appendChild(h('div', { class: 'cf-row' },
        sel('体の形', Object.keys(C.PRESETS).map((k) => [k, C.PRESETS[k].label]), f.preset, (v) => { e.figure = keepView({ preset: v }); changed(e); draw(); renderTools(); }),
        sel('比べるもの', C.COMPARE_LIST, f.compare || 'auto', (v) => set('compare', v)),
        UI.field('表し方', views)));
      // 細かな形と色
      const more = h('details', { class: 'cf-more', ontoggle: (ev) => { open = ev.target.open; } });
      if (open) more.open = true;
      more.appendChild(h('summary', null, '形や色を細かく変える'));
      const grid = h('div', { class: 'cf-sliders' });
      SLIDERS.forEach(([k, label]) => {
        if ((SKIP[plan] || []).includes(k)) return;
        if (k === 'wing' && r.wings === 'none') return;
        const val = Math.round(r[k === 'head' ? 'headSize' : k] * 100);
        const out = h('span', { class: 'small muted cf-val' }, String(val));
        grid.appendChild(h('label', { class: 'cf-slider' }, h('span', null, label),
          h('input', { type: 'range', min: 0, max: 100, step: 1, value: val,
            oninput: (ev) => { out.textContent = ev.target.value; const fo = fig(); if (!fo.preset) fo.preset = r.preset; fo[k] = +ev.target.value / 100; changed(e); draw(); } }), out));
      });
      more.appendChild(grid);
      const opts = h('div', { class: 'cf-row' });
      if (!['serpent', 'fish', 'spider', 'blob'].includes(plan)) opts.appendChild(sel('角', C.OPTIONS.horns, r.horns, (v) => set('horns', v)));
      if (['quad', 'biped', 'bird', 'humanoid'].includes(plan)) {
        opts.appendChild(sel('翼', C.OPTIONS.wings, r.wings, (v) => set('wings', v, true)));
        if (r.wings !== 'none') opts.appendChild(sel('翼の姿勢', C.OPTIONS.wingPose, r.wingPose, (v) => set('wingPose', v)));
      }
      if (['quad', 'biped', 'serpent', 'fish'].includes(plan)) opts.appendChild(sel('背', C.OPTIONS.ridge, r.ridge, (v) => set('ridge', v)));
      if (['quad', 'biped', 'serpent'].includes(plan)) opts.appendChild(sel('尾の先', C.OPTIONS.tailTip.filter((o) => !/fluke|fin|fan/.test(o[0])), r.tailTip, (v) => set('tailTip', v)));
      if (plan === 'fish') opts.appendChild(sel('尾びれ', C.OPTIONS.tailTip.filter((o) => /fluke|fin/.test(o[0])), r.tailTip, (v) => set('tailTip', v)));
      more.appendChild(opts);
      const swatch = (key, list, cur) => h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': key === 'color' ? '体の色' : '腹・模様の色' },
        list.map((col) => h('button', { type: 'button', class: 'swatch' + (cur === col ? ' active' : ''), style: { background: col }, title: col, 'aria-label': col,
          onclick: () => set(key, col, true) })),
        h('input', { type: 'color', class: 'cf-color', value: cur, title: 'ほかの色', 'aria-label': 'ほかの色', onchange: (ev) => set(key, ev.target.value, true) }));
      more.appendChild(h('div', { class: 'grid-2' }, UI.field('体の色', swatch('color', C.COLORS, r.color)), UI.field('腹・模様の色', swatch('belly', C.BELLIES, r.belly))));
      more.appendChild(h('div', { class: 'row wrap' },
        btn('ひな形に戻す', { small: true, ghost: true, icon: 'undo', onClick: () => { e.figure = keepView({ preset: r.preset }); changed(e); draw(); renderTools(); } })));
      tools.appendChild(more);
      // 保存・AI
      const aiBtn = btn('説明から形を決める（AI）', { small: true, ghost: true, icon: 'sparkles', title: '設定の文章を読んで、体の形・角・翼・色などをAIが選びます', onClick: async () => {
        if (!NS.AI || !NS.AI.getKey()) { toast('AIを使うには、設定でAPIキーを入れてください', 'error'); return; }
        aiBtn.disabled = true;
        const label = aiBtn.textContent;
        aiBtn.textContent = 'AIが考えています…';
        try {
          const res = await NS.AI.creatureShape(p, e);
          const nf = keepView({ preset: C.PRESETS[res.preset] ? res.preset : r.preset });
          ['neck', 'tail', 'legs', 'bulk', 'head', 'wing'].forEach((k) => { if (Number.isFinite(+res[k])) nf[k] = Math.max(0, Math.min(1, +res[k])); });
          ['horns', 'wings', 'ridge', 'tailTip'].forEach((k) => { if (typeof res[k] === 'string' && /^[a-z]{1,16}$/i.test(res[k])) nf[k] = res[k]; });
          ['color', 'belly'].forEach((k) => { if (/^#[0-9a-f]{6}$/i.test(res[k] || '')) nf[k] = res[k]; });
          e.figure = nf;
          let msg = '説明から形を決めました';
          const filled = !e.fields.length && res.length && C.parseSize(res.length, units());
          if (filled) { e.fields.length = res.length; msg += `（全長は「${res.length}」にしました）`; }
          changed(e);
          if (filled) renderDetail();
          else if (stage.isConnected) { draw(); renderTools(); }
          toast(msg);
        } catch (err) {
          toast(err.message || String(err), 'error');
        } finally {
          aiBtn.disabled = false;
          aiBtn.textContent = label;
        }
      } });
      tools.appendChild(h('div', { class: 'row wrap cf-actions' },
        btn('画像で保存（PNG）', { small: true, icon: 'download', onClick: () => saveFigure(e, 'png') }),
        btn('SVGで保存', { small: true, ghost: true, icon: 'download', onClick: () => saveFigure(e, 'svg') }),
        aiBtn));
    };
    box.append(h('h3', { class: 'form-section' }, '姿の図', h('span', { class: 'check-note' }, '体の形と大きさの設定から描きます')), stage, note, tools);
    renderTools();
    draw();
    return box;
  }

  /** 生物の図を PNG・SVG で保存 */
  async function saveFigure(e, kind) {
    const p = P();
    const C = NS.Creature;
    const W = 1800; const H = 1080;
    const svg = C.render(e, { width: W, height: H, view: C.figureOf(e).view, units: (p.rules.units && p.rules.units.list) || [] });
    const name = UI.safeFilename(e.name || '生物');
    if (kind === 'svg') { UI.download(name + '.svg', svg, 'image/svg+xml'); return; }
    try {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('画像を作れませんでした')); img.src = url; });
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      cv.getContext('2d').drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => { if (b) UI.download(name + '.png', b); else toast('画像を作れませんでした', 'error'); }, 'image/png');
    } catch (err) {
      toast(err.message || '画像を作れませんでした', 'error');
    }
  }

  /**
   * 出番表：人物（や場所・用語・組織）が、どの話に何回出てくるかを一覧にする。
   * 退場・死亡したあとに名前が出る話、初登場より前に出る話には印を付ける。
   */
  let castType = 'character';
  let castSort = 'order';
  function castPane() {
    const p = P();
    const box = h('div', { class: 'entry-form cast-pane' });
    box.appendChild(h('h2', { class: 'pane-title' }, '出番表'));
    box.appendChild(h('p', { class: 'muted small' }, 'どの話に、だれが何回出てくるか（名前・別名で数えます）。色が濃いほど多く出ています。マスを押すとその話を開きます。'));
    if (!p.chapters.length) { box.appendChild(h('p', { class: 'muted' }, 'まだ話がありません。')); return box; }
    if (!S.mentionCache) S.mentionCache = NS.Consistency.countMentionsByEntry(p.chapters.map((c) => c.body), p.entries);
    const counts = S.mentionCache;
    const chips = h('div', { class: 'chips' });
    const sortSel = h('select', { class: 'input cast-sort', 'aria-label': '並べ方', onchange: (e) => { castSort = e.target.value; render(); } },
      [['order', '登録した順'], ['total', '多く出ている順'], ['first', '初めて出た順'], ['last', '長く出ていない順']].map(([v, l]) => h('option', { value: v, selected: castSort === v }, l)));
    const wrap = h('div', { class: 'cast-wrap' });
    const notes = h('div', { class: 'cast-notes' });
    const render = () => {
      clear(chips);
      ['character', 'place', 'term', 'org', 'creature'].forEach((t) => {
        const n = p.entries.filter((e) => e.type === t).length;
        chips.appendChild(h('button', { type: 'button', class: 'chip' + (castType === t ? ' active' : ''), 'aria-pressed': String(castType === t),
          onclick: () => { castType = t; render(); } }, TYPE_LABEL[t] + (n ? ' ' + n : '')));
      });
      clear(wrap);
      clear(notes);
      const nCh = p.chapters.length;
      const rows = p.entries.filter((e) => e.type === castType).map((e, idx) => {
        const per = counts.map((c) => c[e.id] || 0);
        const total = per.reduce((a, b) => a + b, 0);
        const first = per.findIndex((n) => n > 0);
        let last = -1;
        per.forEach((n, i) => { if (n > 0) last = i; });
        return { e, idx, per, total, first, last };
      });
      if (!rows.length) { wrap.appendChild(h('p', { class: 'muted' }, `${TYPE_LABEL[castType]}がまだ登録されていません。`)); return; }
      const key = { order: (r) => r.idx, total: (r) => -r.total, first: (r) => (r.first < 0 ? 1e9 : r.first), last: (r) => (r.last < 0 ? -1 : r.last) };
      rows.sort((a, b) => key[castSort](a) - key[castSort](b) || a.idx - b.idx);
      const max = Math.max(1, ...rows.map((r) => Math.max(...r.per)));
      const warn = [];
      const table = h('table', { class: 'cast-table' },
        h('thead', null, h('tr', null,
          h('th', { class: 'cast-name', scope: 'col' }, TYPE_LABEL[castType]),
          p.chapters.map((c, i) => h('th', { scope: 'col', title: `第${i + 1}話 ${c.title || ''}` }, String(i + 1))),
          h('th', { scope: 'col', class: 'cast-total' }, '計'))),
        h('tbody', null, rows.map((r) => {
          const ap = r.e.appear || {};
          const from = +ap.from || 0;
          const until = +ap.until || 0;
          return h('tr', null,
            h('th', { scope: 'row', class: 'cast-name' }, h('button', { type: 'button', class: 'linkish', title: '設定を開く', onclick: () => { S.tab = r.e.type; lastTab = r.e.type; openEntry(r.e); renderTabs(); renderList(); } },
              h('span', { class: 'color-dot', style: { background: r.e.color || 'var(--line-strong)' } }), r.e.name)),
            r.per.map((n, i) => {
              const ch = i + 1;
              const after = until && ch > until && n > 0;
              const before = from && ch < from && n > 0;
              if (after) warn.push(`${r.e.name}：第${until}話で${ap.reason || '退場'}のはずが、第${ch}話に${n}回出てきます`);
              if (before) warn.push(`${r.e.name}：初登場は第${from}話のはずが、第${ch}話に${n}回出てきます`);
              const gone = until && ch > until && !n;
              const k = n ? 0.15 + 0.85 * (n / max) : 0;
              return h('td', {
                class: 'cast-cell' + (after || before ? ' bad' : '') + (gone ? ' gone' : ''),
                style: n && !(after || before) ? { background: `color-mix(in srgb, var(--accent) ${Math.round(k * 70)}%, transparent)` } : null,
                title: `第${ch}話 ${p.chapters[i].title || ''}：${n}回` + (after ? `（第${until}話で${ap.reason || '退場'}）` : before ? `（初登場は第${from}話）` : ''),
                tabindex: n ? 0 : null,
                onclick: n ? () => NS.App.navigate('write', { id: p.chapters[i].id }) : null,
                onkeydown: n ? (ev) => { if (ev.key === 'Enter') NS.App.navigate('write', { id: p.chapters[i].id }); } : null,
              }, n ? String(n) : (gone ? '†' : ''));
            }),
            h('td', { class: 'cast-total' }, String(r.total)));
        })));
      wrap.appendChild(table);
      // 気づいたこと：長く出てこない主要人物、一度も出てこない項目、設定との食い違い
      const tips = [];
      if (castType === 'character' && nCh >= 4) {
        rows.forEach((r) => {
          if (r.total < 3 || r.last < 0) return;
          const until = +(r.e.appear && r.e.appear.until) || 0;
          if (until) return;
          const away = nCh - 1 - r.last;
          if (away >= Math.max(3, Math.ceil(nCh * 0.3))) tips.push(`${r.e.name}：第${r.last + 1}話を最後に、${away}話出てきていません`);
        });
      }
      const never = rows.filter((r) => !r.total).map((r) => r.e.name);
      if (never.length) tips.push(`まだ本文に出てこない${TYPE_LABEL[castType]}：${never.slice(0, 8).join('・')}${never.length > 8 ? ` ほか${never.length - 8}` : ''}`);
      if (warn.length) notes.appendChild(h('div', { class: 'cast-warn' }, h('strong', null, '設定と違う登場'), h('ul', null, warn.slice(0, 12).map((w) => h('li', null, w)))));
      if (tips.length) notes.appendChild(h('div', { class: 'cast-tips' }, h('strong', null, '気づいたこと'), h('ul', null, tips.map((w) => h('li', null, w)))));
    };
    render();
    box.append(h('div', { class: 'row wrap cast-bar' }, chips, sortSel), notes, wrap,
      h('p', { class: 'muted small' }, '†：退場・死亡したあとの話。登場範囲は人物の「初登場」「退場・死亡」で決めます。'));
    return box;
  }

  NS.Lore = { TYPE_LABEL, TYPE_ICON, SCHEMA, newEntry, summaryList };
  NS.LoreFormat = LoreFormat;
  NS.Views.lore = V;
})(window.Tsuzuri = window.Tsuzuri || {});
