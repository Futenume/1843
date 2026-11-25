/*
 * 綴り — アプリ本体（起動・画面切り替え・保存・設定・書き出し）
 */
(function (NS) {
  'use strict';
  const { h, icon, btn, toast, modal, clear, UI } = Object.assign({ UI: NS.UI }, NS.UI);
  const Store = NS.Store;
  NS.Views = NS.Views || {};

  const DEFAULT_SETTINGS = {
    theme: 'auto',
    font: 'serif',
    fontSize: 17,
    lineHeight: 1.9,
    rules: {},
    consistency: {},
    maxSentenceLength: 100,
    maxCommas: 4,
    endingRepeat: 3,
    aiModel: 'claude-opus-5-5',
    aiEffort: 'medium',
  };

  const ROUTES = [
    { id: 'home', label: '作品', icon: 'home' },
    { id: 'write', label: '執筆', icon: 'pen' },
    { id: 'lore', label: '設定資料', icon: 'users' },
    { id: 'ideas', label: 'アイデア', icon: 'bulb' },
    { id: 'plot', label: 'プロット', icon: 'columns' },
    { id: 'map', label: '地図', icon: 'map' },
  ];

  const App = {
    project: null,
    settings: Object.assign({}, DEFAULT_SETTINGS, UI.lsGet('tsuzuri.settings', {})),
    route: null,
    params: {},
    current: null,
    saveState: 'saved',
  };

  // ───── 設定 ─────
  App.saveSettings = function () {
    UI.lsSet('tsuzuri.settings', App.settings);
    App.applySettings();
  };
  App.applySettings = function () {
    const root = document.documentElement;
    if (App.settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', App.settings.theme);
    root.style.setProperty('--editor-font', App.settings.font === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)');
    root.style.setProperty('--editor-size', App.settings.fontSize + 'px');
    root.style.setProperty('--editor-lh', String(App.settings.lineHeight));
  };

  // ───── 保存 ─────
  // 同じ作品を別のタブでも開いているとき、黙って上書きし合わないよう知らせ合う
  const TAB_ID = Math.random().toString(36).slice(2);
  let editVersion = 0;
  const doSave = async () => {
    if (!App.project) return;
    if (App.conflict) { App.setSaveState('conflict'); return; }
    const version = editVersion;
    App.setSaveState('saving');
    try {
      updateLog(App.project);
      await Store.saveProject(App.project);
      UI.lsSet('tsuzuri.current', App.project.id);
      UI.lsSet('tsuzuri.saved', { id: App.project.id, tab: TAB_ID, at: App.project.updatedAt });
      // 保存中に書き足された分があれば、まだ「編集中」のまま（このあと続けて保存される）
      App.setSaveState(version === editVersion ? 'saved' : 'dirty');
    } catch (e) {
      console.error(e);
      App.setSaveState('error');
      toast('保存できませんでした：' + (e && e.message ? e.message : e), 'error');
    }
  };
  const saveDebounced = UI.debounce(doSave, 700);
  App.touch = function () {
    editVersion++;
    App.setSaveState(App.conflict ? 'conflict' : 'dirty');
    saveDebounced();
  };

  function onOtherTabSaved(info) {
    if (!info || info.tab === TAB_ID || !App.project || info.id !== App.project.id) return;
    if (App.conflict) return;
    App.conflict = true;
    App.setSaveState('conflict');
    showConflict();
  }

  function showConflict() {
    let bar = document.getElementById('conflict-bar');
    if (bar) bar.remove();
    bar = h('div', { id: 'conflict-bar', class: 'conflict-bar', role: 'alert' },
      h('span', null, 'この作品は別のタブ（またはウィンドウ）で更新されました。このタブの自動保存を止めています。'),
      btn('最新の内容を読み込む', { small: true, primary: true, onClick: async () => {
        const id = App.project.id;
        const p = await Store.loadProject(id);
        if (!p) { toast('作品が見つかりません', 'error'); return; }
        // 先に今の画面を閉じる（閉じるときの書き戻しは、保存停止中なので保存されない）
        if (App.current && App.current.unmount) { try { App.current.unmount(); } catch (e) { console.error(e); } }
        App.current = null;
        saveDebounced.cancel();
        App.conflict = false;
        bar.remove();
        {
          App.project = p;
          editVersion++;
          App.setSaveState('saved');
          const r = parseHash();
          render(r.route, r.params);
          toast('最新の内容を読み込みました');
        }
      } }),
      btn('このタブの内容で上書きする', { small: true, ghost: true, onClick: async () => {
        App.conflict = false;
        bar.remove();
        await App.saveNow();
        toast('このタブの内容で保存しました');
      } }));
    document.body.appendChild(bar);
  }
  App.saveNow = async function () {
    saveDebounced.cancel();
    await doSave();
  };
  App.setSaveState = function (s) {
    App.saveState = s;
    const el = document.getElementById('save-state');
    if (!el) return;
    el.dataset.state = s;
    el.textContent = { saved: '保存済み', saving: '保存中…', dirty: '編集中', error: '保存エラー', conflict: '保存を停止中' }[s] || '';
  };

  function updateLog(p) {
    const total = Store.totalChars(p);
    const d = UI.today();
    if (!p.log[d]) {
      const keys = Object.keys(p.log).sort();
      const prev = keys.length ? p.log[keys[keys.length - 1]].last : total;
      p.log[d] = { start: prev, last: total };
    } else {
      p.log[d].last = total;
    }
    const keys = Object.keys(p.log).sort();
    while (keys.length > 120) delete p.log[keys.shift()];
  }

  App.todayWritten = function () {
    const p = App.project;
    if (!p) return 0;
    const d = p.log[UI.today()];
    if (!d) return 0;
    return Math.max(0, d.last - d.start);
  };

  // ───── 作品の切り替え ─────
  App.openProject = async function (id, route) {
    if (App.conflict) {
      if (!(await UI.confirm('別のタブで更新されたため、このタブの変更は保存されていません。このタブの変更を破棄して開きますか？', { danger: true, okLabel: '破棄して開く' }))) return;
      App.conflict = false;
      const bar = document.getElementById('conflict-bar');
      if (bar) bar.remove();
    }
    if (App.project && App.saveState !== 'saved') await App.saveNow();
    const p = await Store.loadProject(id);
    if (!p) { toast('作品が見つかりません', 'error'); return; }
    App.project = p;
    UI.lsSet('tsuzuri.current', p.id);
    renderChrome();
    App.navigate(route || 'write');
  };

  App.createProject = async function (title) {
    const p = Store.newProject(title);
    await Store.saveProject(p);
    await App.openProject(p.id, 'write');
  };

  // ───── ルーティング ─────
  App.navigate = function (route, params) {
    const hash = '#/' + route + (params && params.id ? '/' + encodeURIComponent(params.id) : '');
    if (location.hash !== hash) {
      try { history.pushState(null, '', hash); } catch (e) { /* サンドボックスなどで使えない環境 */ }
    }
    render(route, params || {});
  };

  function parseHash() {
    const m = location.hash.match(/^#\/([a-z]+)(?:\/(.+))?/);
    return m ? { route: m[1], params: m[2] ? { id: decodeURIComponent(m[2]) } : {} } : { route: 'home', params: {} };
  }

  function render(route, params) {
    if (!App.project && route !== 'home') route = 'home';
    if (App.current && App.current.unmount) {
      try { App.current.unmount(); } catch (e) { console.error(e); }
    }
    App.route = route;
    App.params = params;
    const view = document.getElementById('view');
    clear(view);
    view.className = 'view view-' + route;
    document.querySelectorAll('.nav-item').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === route);
      a.toggleAttribute('aria-current', a.dataset.route === route);
    });
    document.querySelectorAll('.nav-item[data-needs-project]').forEach((a) => {
      a.classList.toggle('disabled', !App.project);
    });
    const r = ROUTES.find((x) => x.id === route);
    document.getElementById('view-title').textContent = r ? r.label : '';
    const V = route === 'home' ? Home : NS.Views[route];
    App.current = V || null;
    if (V && V.mount) V.mount(view, params);
  }

  // ───── 画面の枠（サイドバー・上部バー） ─────
  function renderChrome() {
    const nav = document.getElementById('sidebar');
    clear(nav);
    nav.appendChild(h('div', { class: 'brand', title: '綴り — 小説執筆スタジオ' },
      h('span', { class: 'brand-mark' }, '綴'), h('span', { class: 'brand-name' }, '綴り')));
    ROUTES.forEach((r) => {
      nav.appendChild(h('a', {
        href: '#/' + r.id, class: 'nav-item', dataset: { route: r.id, needsProject: r.id === 'home' ? undefined : '1' },
        onclick: (e) => {
          e.preventDefault();
          if (r.id !== 'home' && !App.project) { toast('先に作品を選んでください'); return; }
          App.navigate(r.id);
        },
      }, icon(r.icon, 20), h('span', null, r.label)));
    });
    nav.appendChild(h('div', { class: 'nav-spacer' }));
    nav.appendChild(h('a', {
      href: '#', class: 'nav-item nav-settings', onclick: (e) => { e.preventDefault(); App.openSettings(); },
    }, icon('sliders', 20), h('span', null, '設定')));

    const titleEl = document.getElementById('project-title');
    clear(titleEl);
    if (App.project) {
      titleEl.appendChild(h('button', {
        type: 'button', class: 'project-title-btn', title: '作品名を変更',
        onclick: async () => {
          const v = await UI.prompt('作品名', App.project.title);
          if (v != null && v.trim()) { App.project.title = v.trim(); App.touch(); renderChrome(); }
        },
      }, App.project.title));
    } else {
      titleEl.appendChild(h('span', { class: 'muted' }, '作品を選んでください'));
    }
    const actions = document.getElementById('top-actions');
    clear(actions);
    actions.appendChild(h('span', { id: 'save-state', class: 'save-state', dataset: { state: App.saveState } }, App.project ? '保存済み' : ''));
    actions.appendChild(btn('', { icon: 'dict', ghost: true, title: '辞書で調べる', onClick: () => {
      if (App.route === 'write' && NS.Views.write.openDict) NS.Views.write.openDict();
      else NS.Dict.openModal('');
    } }));
    if (App.project) {
      actions.appendChild(btn('', { icon: 'book2', ghost: true, title: 'プレビュー（読者の見え方で読む）', onClick: () => {
        const c = App.currentChapter();
        NS.Preview.open({ chapterId: App.route === 'write' && c ? c.id : (App.project.lastChapterId || null) });
      } }));
      const exportBtn = btn('', { icon: 'download', ghost: true, title: '書き出し・バックアップ' });
      exportBtn.addEventListener('click', () => UI.menu(exportBtn, [
        { label: '表示中の話をテキストで書き出す', icon: 'file', onClick: () => App.exportChapterTxt() },
        { label: '全話をテキストで書き出す', icon: 'book', onClick: () => App.exportAllTxt() },
        { label: '投稿サイト用に書き出す（なろう・カクヨム・pixiv）', icon: 'upload', onClick: () => NS.PublishDialog.open({ chapterId: (App.currentChapter() || {}).id }) },
        { label: '電子書籍（EPUB）で書き出す', icon: 'book2', onClick: () => NS.PublishDialog.openEpub({ chapterId: (App.currentChapter() || {}).id }) },
        { label: '原稿用紙・応募書式で印刷（PDF）', icon: 'printer', onClick: () => NS.Manuscript.open() },
        { label: '設定資料をMarkdownで書き出す', icon: 'users', onClick: () => App.exportLoreMd() },
        { label: 'プレビュー・印刷（PDF）', icon: 'printer', onClick: () => NS.Preview.open({ chapterId: (App.currentChapter() || {}).id }) },
        null,
        { label: '作品のバックアップ（.json）', icon: 'save', onClick: () => App.exportBackup() },
      ]));
      actions.appendChild(exportBtn);
    }
    App.setSaveState(App.saveState);
  }
  App.renderChrome = renderChrome;

  // ───── 書き出し ─────
  App.currentChapter = function () {
    const p = App.project;
    if (!p) return null;
    const id = App.params && App.params.id;
    return p.chapters.find((c) => c.id === id) || p.chapters.find((c) => c.id === p.lastChapterId) || p.chapters[0];
  };
  App.exportChapterTxt = function () {
    const c = App.currentChapter();
    if (!c) return;
    UI.download(UI.safeFilename(App.project.title + '_' + c.title) + '.txt', c.title + '\n\n' + c.body);
  };
  App.exportAllTxt = function () {
    const p = App.project;
    const parts = [p.title, ''];
    p.chapters.forEach((c) => { parts.push('', c.title, '', c.body, ''); });
    UI.download(UI.safeFilename(p.title) + '.txt', parts.join('\n'));
  };
  App.exportBackup = function () {
    const p = App.project;
    UI.download(UI.safeFilename(p.title) + '_' + UI.today() + '.tsuzuri.json', JSON.stringify({ app: 'tsuzuri', version: 1, project: p }, null, 1), 'application/json');
    App.markBackup([p.id]);
    toast('バックアップを書き出しました');
  };

  // ───── バックアップの記録と、しばらくしていないときのお知らせ ─────
  App.markBackup = function (ids) {
    const rec = UI.lsGet('tsuzuri.backups', {});
    const now = Date.now();
    ids.forEach((id) => { rec[id] = now; });
    UI.lsSet('tsuzuri.backups', rec);
  };
  App.lastBackup = function (id) { return UI.lsGet('tsuzuri.backups', {})[id] || 0; };
  /** 前回のバックアップから書いた量が多い・日数が経っていたら知らせる */
  App.backupDue = function (meta) {
    if (!meta || !meta.updatedAt) return null;
    const last = App.lastBackup(meta.id);
    if (last >= meta.updatedAt) return null;
    const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    if ((meta.chars || 0) < 3000) return null;
    if (days == null) return { days: null };
    return days >= 7 ? { days } : null;
  };
  App.exportLoreMd = function () {
    UI.download(UI.safeFilename(App.project.title) + '_設定資料.md', NS.LoreFormat.toMarkdown(App.project), 'text/markdown;charset=utf-8');
  };

  // ───── 設定画面 ─────
  App.openSettings = function () {
    const s = App.settings;
    const tabs = [
      { id: 'view', label: '表示' },
      { id: 'rules', label: '添削ルール' },
      { id: 'cons', label: '設定チェック' },
      { id: 'ai', label: 'AI' },
      { id: 'data', label: 'データ' },
    ];
    const body = h('div', { class: 'settings' });
    const tabBar = h('div', { class: 'tabs', role: 'tablist' });
    const pane = h('div', { class: 'settings-pane' });
    body.append(tabBar, pane);
    const show = (id) => {
      tabBar.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === id));
      clear(pane);
      pane.appendChild(SETTINGS_PANES[id]());
    };
    tabs.forEach((t) => tabBar.appendChild(h('button', { type: 'button', class: 'tab', role: 'tab', dataset: { tab: t.id }, onclick: () => show(t.id) }, t.label)));

    const changed = () => {
      App.saveSettings();
      if (App.current && App.current.onSettingsChanged) App.current.onSettingsChanged();
    };
    const select = (value, options, onChange) => {
      const sel = h('select', { class: 'input', onchange: (e) => onChange(e.target.value) });
      options.forEach(([v, l]) => sel.appendChild(h('option', { value: v, selected: String(v) === String(value) }, l)));
      return sel;
    };
    const number = (value, min, max, step, onChange) => h('input', {
      class: 'input input-num', type: 'number', min, max, step, value,
      onchange: (e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); },
    });
    const toggleList = (rules, store) => h('div', { class: 'rule-list' }, rules.map((r) => {
      const on = Object.prototype.hasOwnProperty.call(store, r.id) ? store[r.id] : r.default;
      return h('label', { class: 'rule-row' },
        h('input', { type: 'checkbox', checked: on, onchange: (e) => { store[r.id] = e.target.checked; changed(); } }),
        h('span', { class: 'rule-text' }, h('strong', null, r.name), h('span', { class: 'muted small' }, r.desc || '')));
    }));

    const SETTINGS_PANES = {
      view: () => h('div', { class: 'stack' },
        UI.field('テーマ', select(s.theme, [['auto', '端末に合わせる'], ['light', 'ライト'], ['sepia', 'セピア（原稿用紙風）'], ['dark', 'ダーク']], (v) => { s.theme = v; changed(); })),
        UI.field('本文の書体', select(s.font, [['serif', '明朝体'], ['sans', 'ゴシック体']], (v) => { s.font = v; changed(); })),
        UI.field('本文の文字サイズ（px）', number(s.fontSize, 12, 32, 1, (v) => { s.fontSize = v; changed(); })),
        UI.field('行間', number(s.lineHeight, 1.3, 3, 0.1, (v) => { s.lineHeight = v; changed(); }))),
      rules: () => h('div', { class: 'stack' },
        h('div', { class: 'grid-3' },
          UI.field('一文の最大文字数', number(s.maxSentenceLength, 30, 400, 5, (v) => { s.maxSentenceLength = v; changed(); })),
          UI.field('一文の読点の上限', number(s.maxCommas, 1, 20, 1, (v) => { s.maxCommas = v; changed(); })),
          UI.field('同じ文末の連続', number(s.endingRepeat, 2, 10, 1, (v) => { s.endingRepeat = v; changed(); }))),
        toggleList(NS.Proofread.RULES, s.rules)),
      cons: () => h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, '設定資料（人物の一人称・呼び方・髪や瞳の色・年齢・登場範囲、世界観ルール）と本文を照らし合わせます。台詞の話者は「」の前後の文から推定します。'),
        toggleList(NS.Consistency.RULES, s.consistency)),
      ai: () => NS.AIPanel ? NS.AIPanel.settingsPane(changed) : h('p', null, 'AI機能を読み込めませんでした'),
      data: () => {
        const info = h('p', { class: 'muted small' },
          '作品データはこの端末のブラウザ内（' + ({ idb: 'IndexedDB', ls: 'localStorage', mem: 'メモリのみ・再読み込みで消えます' }[Store.mode]) +
          '）に保存されます。ブラウザのデータ消去で消えるため、定期的にバックアップを書き出してください。' +
          (Store.mode === 'idb' ? (Store.persisted ? '（ブラウザに「消さないで」と頼んであります）' : '（このブラウザでは、容量が少なくなると消される場合があります）') : ''));
        const appInfo = App.standalone() ? 'アプリとして開いています。オフラインでも使えます。'
          : App.canInstall() ? 'このブラウザでは、アプリとして入れられます（ホーム画面やデスクトップから開け、オフラインでも使えます）。'
            : App.isIOS() ? 'iPhone・iPad では、Safari の共有ボタン →「ホーム画面に追加」で、アプリのように使えます。'
              : /^https?:$/.test(location.protocol) ? 'Chrome・Edge では、アドレスバーの「インストール」ボタンからアプリとして入れられます。'
                : '1ファイル版（ファイルを直接開いた状態）ではアプリとして入れられません。https のサイト（GitHub Pages など）で公開すると入れられます。';
        return h('div', { class: 'stack' }, info,
          h('div', { class: 'row wrap' },
            btn('すべての作品をバックアップ', { icon: 'save', onClick: App.exportAll }),
            btn('バックアップから読み込む', { icon: 'upload', onClick: App.importBackup })),
          h('h3', { class: 'form-section' }, 'アプリとして使う'),
          h('p', { class: 'muted small' }, appInfo),
          App.canInstall() ? h('div', { class: 'row' }, btn('アプリとして入れる', { icon: 'download', primary: true, onClick: App.install })) : null);
      },
    };
    modal({ title: '設定', body, wide: true });
    show('view');
  };

  App.exportAll = async function () {
    if (App.project) await App.saveNow();
    const list = await Store.listProjects();
    const projects = [];
    for (const m of list) {
      const p = await Store.loadProject(m.id);
      if (p) projects.push(p);
    }
    UI.download('tsuzuri_all_' + UI.today() + '.tsuzuri.json', JSON.stringify({ app: 'tsuzuri', version: 1, projects }, null, 1), 'application/json');
    App.markBackup(projects.map((x) => x.id));
    toast(projects.length + '作品をまとめてバックアップしました');
    if (App.route === 'home') render('home', {});
  };

  App.importBackup = async function () {
    const file = await UI.pickFile('.json,application/json');
    if (!file) return;
    try {
      const data = JSON.parse(await UI.readFileText(file));
      const projects = data.projects || (data.project ? [data.project] : (data.chapters ? [data] : []));
      if (!projects.length) throw new Error('作品データが見つかりません');
      let last = null;
      for (const p of projects) last = await Store.importProject(p);
      toast(projects.length + '件の作品を読み込みました');
      if (App.route === 'home') render('home', {});
      if (projects.length === 1 && last) App.openProject(last.id);
    } catch (e) {
      toast('読み込めませんでした：' + e.message, 'error');
    }
  };

  // ───── 作品一覧（ホーム） ─────
  const Home = {
    async mount(view) {
      const wrap = h('div', { class: 'home' });
      view.appendChild(wrap);
      wrap.appendChild(h('section', { class: 'home-hero' },
        h('h1', null, '綴り', h('small', null, '小説執筆スタジオ')),
        h('p', { class: 'muted' }, '原稿（縦書きでも）・添削・設定資料・設定矛盾チェック・キャラ相関図・アイデア帳（伏線・読み方）・プロット・空想地図（世界地図・国・距離と旅の日数）・プレビュー・辞書・投稿サイト用の書き出し・電子書籍（EPUB）・原稿用紙での印刷を、ひとつの作品ごとにまとめて管理できます。データはこの端末のブラウザ内に保存されます。'),
        h('div', { class: 'row wrap' },
          btn('新しい作品', { icon: 'plus', primary: true, onClick: async () => {
            const t = await UI.prompt('新しい作品', '', { placeholder: '作品名', okLabel: '作成' });
            if (t != null) App.createProject(t.trim() || '無題の作品');
          } }),
          btn('サンプル作品を開く', { icon: 'sparkles', onClick: async () => {
            const p = NS.Sample.create();
            await Store.saveProject(p);
            App.openProject(p.id, 'write');
          } }),
          btn('バックアップから読み込む', { icon: 'upload', ghost: true, onClick: App.importBackup }),
          btn('テキストを取り込む', { icon: 'file', ghost: true, title: 'ほかのアプリで書いた .txt・.md の原稿から作品を作ります', onClick: () => NS.ImportDialog.open({ mode: 'new' }) }),
          App.canInstall() ? btn('アプリとして入れる', { icon: 'download', ghost: true, title: 'ホーム画面やデスクトップから開けるアプリとして入れます（オフラインでも使えます）', onClick: App.install }) : null)));
      const listEl = h('section', { class: 'project-grid' });
      const notice = h('div');
      wrap.appendChild(notice);
      wrap.appendChild(h('h2', { class: 'section-title' }, '作品'));
      wrap.appendChild(listEl);
      const list = await Store.listProjects();
      const due = list.filter((m) => App.backupDue(m));
      if (due.length) {
        const d = App.backupDue(due[0]);
        notice.appendChild(h('div', { class: 'backup-notice' },
          h('span', null, due.length === 1
            ? `「${due[0].title}」は${d.days == null ? 'まだ一度もバックアップしていません' : `最後のバックアップから${d.days}日たっています`}。ブラウザのデータが消えると作品も消えるので、書き出しておきましょう。`
            : `${due.length}つの作品が、しばらくバックアップされていません。ブラウザのデータが消えると作品も消えるので、書き出しておきましょう。`),
          btn('すべての作品をバックアップ', { icon: 'save', small: true, primary: true, onClick: App.exportAll })));
      }
      if (!list.length) {
        listEl.appendChild(h('div', { class: 'empty' }, h('p', null, 'まだ作品がありません。「新しい作品」か「サンプル作品を開く」から始めましょう。')));
      }
      list.forEach((m) => {
        const more = btn('', { icon: 'more', ghost: true, small: true, title: 'その他の操作' });
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          UI.menu(more, [
            { label: '名前を変更', icon: 'pen', onClick: async () => {
              const p = await Store.loadProject(m.id);
              const t = await UI.prompt('作品名', p.title);
              if (t && t.trim()) { p.title = t.trim(); await Store.saveProject(p); if (App.project && App.project.id === p.id) { App.project.title = p.title; renderChrome(); } render('home', {}); }
            } },
            { label: '複製', icon: 'copy', onClick: async () => {
              const p = await Store.loadProject(m.id);
              p.id = UI.uid('p');
              p.title += '（コピー）';
              await Store.saveProject(p);
              render('home', {});
            } },
            { label: 'バックアップを書き出す', icon: 'save', onClick: async () => {
              const p = await Store.loadProject(m.id);
              UI.download(UI.safeFilename(p.title) + '_' + UI.today() + '.tsuzuri.json', JSON.stringify({ app: 'tsuzuri', version: 1, project: p }, null, 1), 'application/json');
              App.markBackup([p.id]);
              render('home', {});
            } },
            null,
            { label: '削除（ごみ箱へ）', icon: 'trash', danger: true, onClick: async () => {
              if (!(await UI.confirm(`「${m.title}」をごみ箱に移します。${Store.TRASH_DAYS}日間は、ホームの「ごみ箱」から元に戻せます。`, { danger: true, okLabel: 'ごみ箱へ' }))) return;
              if (App.project && App.project.id === m.id) {
                if (App.saveState !== 'saved') await App.saveNow();
                App.project = null;
                renderChrome();
              }
              await Store.deleteProject(m.id);
              render('home', {});
              toast(`「${m.title}」をごみ箱に移しました`, null, { label: '元に戻す', onClick: async () => { await Store.restoreProject(m.id); render('home', {}); toast('元に戻しました'); } });
            } },
          ]);
        });
        const card = h('div', {
          class: 'project-card' + (App.project && App.project.id === m.id ? ' current' : ''), tabindex: 0, role: 'button',
          onclick: () => App.openProject(m.id),
          onkeydown: (e) => { if (e.key === 'Enter') App.openProject(m.id); },
        },
        h('div', { class: 'project-card-head' }, h('h3', null, m.title), more),
        h('div', { class: 'project-card-meta' },
          h('span', null, UI.fmtNum(m.chars || 0) + '字'),
          h('span', null, (m.chapters || 0) + '話'),
          h('span', null, '更新 ' + UI.relTime(m.updatedAt))));
        listEl.appendChild(card);
      });
      // ごみ箱（消した作品）
      const trash = await Store.listTrash();
      if (trash.length) {
        wrap.appendChild(h('details', { class: 'home-trash' },
          h('summary', { class: 'small muted' }, `ごみ箱（${trash.length}）— 消した作品は${Store.TRASH_DAYS}日間ここに残ります`),
          h('div', { class: 'trash-list' }, trash.map((t) => {
            const left = Math.max(0, Store.TRASH_DAYS - Math.floor((Date.now() - t.deletedAt) / 86400000));
            return h('div', { class: 'trash-row' },
              h('div', null, h('strong', null, t.title), h('span', { class: 'small muted' }, `${UI.fmtNum(t.chars || 0)}字・${UI.relTime(t.deletedAt)}に削除・あと${left}日で完全に消えます`)),
              btn('戻す', { small: true, onClick: async () => { await Store.restoreProject(t.id); render('home', {}); toast(`「${t.title}」を戻しました`); } }),
              btn('', { icon: 'trash', small: true, ghost: true, title: '完全に削除', onClick: async () => {
                if (!(await UI.confirm(`「${t.title}」を完全に削除します。元に戻せません。`, { danger: true, okLabel: '完全に削除' }))) return;
                await Store.purgeProject(t.id);
                render('home', {});
              } }));
          }))));
      }
    },
  };

  // ───── アプリとして入れる（PWA） ─────
  let installEvent = null;
  App.standalone = () => (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  App.canInstall = () => !!installEvent && !App.standalone();
  App.install = async function () {
    if (!installEvent) return false;
    installEvent.prompt();
    const r = await installEvent.userChoice.catch(() => null);
    installEvent = null;
    if (App.route === 'home') render('home', {});
    return !!(r && r.outcome === 'accepted');
  };
  App.isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installEvent = e;
      if (App.route === 'home') render('home', {});
    });
    window.addEventListener('appinstalled', () => { installEvent = null; toast('アプリとして入れました'); });
    // サービスワーカーは http(s) で開いたときだけ（file:// の1ファイル版では使えない）
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    // 初めて開いたとき（前の版がない）は「新しい版」と知らせない
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'activated' && hadController) toast('新しい版を取り込みました。次に開いたときから反映されます');
        });
      });
    }).catch(() => { /* 使えない環境では何もしない */ });
  }

  // ───── 起動 ─────
  async function start() {
    setupPWA();
    App.applySettings();
    await Store.init();
    window.addEventListener('popstate', () => {
      const r = parseHash();
      render(r.route, r.params);
    });
    window.addEventListener('storage', (e) => {
      if (e.key === 'tsuzuri.saved' && e.newValue) {
        try { onOtherTabSaved(JSON.parse(e.newValue)); } catch (err) { /* 何もしない */ }
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (App.saveState === 'dirty' || App.saveState === 'saving' || App.conflict) {
        saveDebounced.flush();
        e.preventDefault();
        e.returnValue = '';
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && App.saveState === 'dirty') App.saveNow();
    });
    const lastId = UI.lsGet('tsuzuri.current', null);
    if (lastId) {
      const p = await Store.loadProject(lastId);
      if (p) App.project = p;
    }
    renderChrome();
    const r = parseHash();
    render(App.project ? r.route : 'home', r.params);
    if (Store.mode === 'mem') toast('このブラウザでは保存できません。バックアップを書き出してください', 'error');
  }

  NS.App = App;
  NS.ROUTES = ROUTES;
  document.addEventListener('DOMContentLoaded', start);
})(window.Tsuzuri = window.Tsuzuri || {});
