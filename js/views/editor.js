/*
 * 綴り — 執筆画面
 * 話の一覧・本文エディタ（指摘のハイライト付き）・添削/設定チェック/AI/資料/統計パネル・縦書きプレビュー・検索置換・履歴。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;
  const T = NS.Text;
  const SEV_ORDER = { error: 3, warning: 2, info: 1 };
  const SEV_LABEL = { error: '要修正', warning: '注意', info: '提案' };

  const V = {};
  let S = null; // 画面の状態
  // 話を切り替えても保つ表示設定
  const PREF = Object.assign({ panelTab: 'proof', hideChapters: null, hidePanel: null }, UI.lsGet('tsuzuri.editorPref', {}));
  const savePref = () => UI.lsSet('tsuzuri.editorPref', PREF);
  // この画面を開いている間の、話ごとのスクロール位置とカーソル
  const VIEWPOS = new Map();
  // 話ごとの文字数のキャッシュ
  const COUNT = new Map();
  function countOf(c, body) {
    const b = body == null ? c.body : body;
    const hit = COUNT.get(c.id);
    if (hit && hit.body === b) return hit.n;
    const n = T.stats(b).charsNoSpace;
    COUNT.set(c.id, { body: b, n });
    return n;
  }

  function App() { return NS.App; }
  function P() { return NS.App.project; }

  V.mount = function (view, params) {
    const p = P();
    let ch = p.chapters.find((c) => c.id === params.id);
    if (!ch) ch = p.chapters.find((c) => c.id === p.lastChapterId) || p.chapters[0];
    p.lastChapterId = ch.id;
    const narrow = window.innerWidth < 900;
    S = {
      view, ch, issues: [], cons: null, active: -1, panelTab: PREF.panelTab || 'proof',
      filter: 'all', find: { open: false, q: '', r: '', matches: [], cur: -1 }, preview: false,
      lastText: ch.body, openedBody: ch.body, openedAt: Date.now(),
      hideChapters: narrow ? true : (PREF.hideChapters != null ? PREF.hideChapters : false),
      hidePanel: narrow ? true : (PREF.hidePanel != null ? PREF.hidePanel : window.innerWidth < 1200),
      aiIssues: [],
    };
    build();
    runAnalysis();
    const pos = VIEWPOS.get(ch.id);
    if (pos) {
      requestAnimationFrame(() => {
        if (!S || S.ch.id !== ch.id) return;
        S.scroll.scrollTop = pos.scroll;
        try { S.textarea.setSelectionRange(pos.caret, pos.caret); } catch (e) { /* 無視 */ }
      });
    }
  };

  V.unmount = function () {
    if (!S) return;
    stopSpeak(true);
    VIEWPOS.set(S.ch.id, { scroll: S.scroll.scrollTop, caret: S.textarea.selectionStart });
    autoSnapshot();
    if (S.analysisTimer) clearTimeout(S.analysisTimer);
    if (S.onKey) document.removeEventListener('keydown', S.onKey);
    if (S.ro) S.ro.disconnect();
    S = null;
  };

  V.onSettingsChanged = function () {
    if (S) runAnalysis(true);
  };

  V.state = function () { return S; };

  // ───── レイアウト ─────
  function build() {
    const view = S.view;
    clear(view);
    const layout = h('div', { class: 'write-layout' });
    S.layout = layout;
    layout.classList.toggle('hide-chapters', S.hideChapters);
    layout.classList.toggle('hide-panel', S.hidePanel);

    // 話の一覧
    S.chapterList = h('ul', { class: 'chapter-list', role: 'list' });
    const chapters = h('aside', { class: 'chapters', 'aria-label': '話の一覧' },
      h('div', { class: 'pane-head' },
        h('h2', null, '話'),
        btn('', { icon: 'plus', ghost: true, small: true, title: '新しい話を追加', onClick: addChapter }),
        btn('', { icon: 'x', ghost: true, small: true, class: 'only-mobile', title: '閉じる', onClick: () => toggleChapters(true) })),
      S.chapterList,
      S.chapterTotal = h('div', { class: 'pane-foot muted small' }));

    // 本文
    S.titleInput = h('input', {
      class: 'chapter-title-input', type: 'text', value: S.ch.title, 'aria-label': '話のタイトル', placeholder: '話のタイトル',
      oninput: (e) => { S.ch.title = e.target.value; S.ch.updatedAt = Date.now(); App().touch(); renderChapterList(); },
    });
    const toolbar = h('div', { class: 'editor-toolbar' },
      btn('', { icon: 'sidebar', ghost: true, title: '話の一覧を表示/隠す', onClick: () => toggleChapters() }),
      S.titleInput,
      h('div', { class: 'toolbar-group' },
        tbtn('「」', '鉤括弧', () => wrapOrInsert('「', '」')),
        tbtn('『』', '二重鉤括弧', () => wrapOrInsert('『', '』')),
        tbtn('……', '三点リーダー', () => insertText('……')),
        tbtn('――', 'ダッシュ', () => insertText('――')),
        tbtn('ルビ', 'ルビを振る（|漢字《かんじ》）', insertRuby),
        tbtn('傍点', '傍点（《《強調》》）', () => wrapOrInsert('《《', '》》'))),
      h('div', { class: 'toolbar-group' },
        btn('', { icon: 'search', ghost: true, title: '検索・置換（Ctrl+F）', onClick: () => openFind() }),
        btn('', { icon: 'book2', ghost: true, title: 'プレビュー（読者の見え方で表示）', onClick: () => { syncBody(); NS.Preview.open({ chapterId: S.ch.id }); } }),
        btn('', { icon: 'dict', ghost: true, title: '辞書で調べる（選んだ語）', onClick: () => openDict() }),
        btn('', { icon: 'volume', ghost: true, title: '読み上げ（カーソルの位置から。耳で読み返す）', onClick: () => toggleSpeak() }),
        btn('', { icon: 'history', ghost: true, title: '版の保存と履歴', onClick: openHistory }),
        btn('', { icon: 'panel', ghost: true, title: '添削パネルを表示/隠す', onClick: () => togglePanel() })));

    S.findBar = h('div', { class: 'findbar', hidden: true });

    S.backdrop = h('div', { class: 'editor-backdrop', 'aria-hidden': 'true' });
    S.textarea = h('textarea', {
      class: 'editor-input', spellcheck: false, 'aria-label': '本文', placeholder: 'ここに本文を書きます。\n\n段落の頭は全角スペースで字下げ、会話は「」で囲みます。ルビは |漢字《かんじ》 、傍点は《《強調》》と書けます。',
    });
    S.textarea.value = S.ch.body;
    S.sheet = h('div', { class: 'editor-sheet' }, S.backdrop, S.textarea);
    S.scroll = h('div', { class: 'editor-scroll' }, S.sheet);
    S.issueBar = h('div', { class: 'issue-bar', hidden: true });
    S.status = h('div', { class: 'editor-status' });

    S.speakBar = h('div', { class: 'speak-bar', hidden: true, role: 'region', 'aria-label': '読み上げ' });
    const main = h('section', { class: 'editor-main' }, toolbar, S.findBar, S.scroll, S.speakBar, S.issueBar, S.status);

    // パネル
    S.panelTabs = h('div', { class: 'tabs panel-tabs', role: 'tablist' });
    [['proof', '添削'], ['cons', '設定チェック'], ['ai', 'AI'], ['dict', '辞書'], ['ref', '資料'], ['stats', '統計']].forEach(([id, label]) => {
      S.panelTabs.appendChild(h('button', {
        type: 'button', role: 'tab', class: 'tab', dataset: { tab: id },
        onclick: () => { S.panelTab = id; PREF.panelTab = id; savePref(); renderPanel(); },
      }, label, h('span', { class: 'tab-badge', dataset: { badge: id } })));
    });
    S.panelBody = h('div', { class: 'panel-body' });
    const panel = h('aside', { class: 'side-panel', 'aria-label': '添削・チェック' },
      h('div', { class: 'pane-head' }, S.panelTabs,
        btn('', { icon: 'x', ghost: true, small: true, class: 'only-mobile', title: '閉じる', onClick: () => togglePanel(true) })),
      S.panelBody);

    layout.append(chapters, main, panel, h('div', { class: 'drawer-scrim', onclick: () => { toggleChapters(true); togglePanel(true); } }));
    view.appendChild(layout);

    // イベント
    S.textarea.addEventListener('input', onInput);
    S.textarea.addEventListener('scroll', () => { S.backdrop.scrollTop = S.textarea.scrollTop; });
    S.textarea.addEventListener('click', onCaret);
    S.textarea.addEventListener('keyup', (e) => { if (/Arrow|Home|End|Page|Shift/.test(e.key)) onCaret(); });
    S.textarea.addEventListener('select', updateSelHint);
    S.textarea.addEventListener('mouseup', () => setTimeout(updateSelHint, 0));
    S.onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); App().saveNow().then(() => toast('保存しました')); }
      else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(); }
      else if (e.key === 'Escape' && S.find.open && document.activeElement && S.findBar.contains(document.activeElement)) closeFind();
    };
    document.addEventListener('keydown', S.onKey);
    S.ro = new ResizeObserver(() => fitTextarea());
    S.ro.observe(S.sheet);

    renderChapterList();
    renderBackdrop();
    renderStatus();
    renderPanel();
    fitTextarea();
  }

  function tbtn(label, title, fn) {
    return h('button', { type: 'button', class: 'btn btn-ghost btn-text', title, 'aria-label': title, onclick: fn }, label);
  }

  function toggleChapters(forceHide) {
    S.hideChapters = forceHide === true ? true : !S.hideChapters;
    S.layout.classList.toggle('hide-chapters', S.hideChapters);
    if (window.innerWidth < 900) {
      if (!S.hideChapters) { S.hidePanel = true; S.layout.classList.add('hide-panel'); }
    } else { PREF.hideChapters = S.hideChapters; savePref(); }
  }
  function togglePanel(forceHide) {
    S.hidePanel = forceHide === true ? true : !S.hidePanel;
    S.layout.classList.toggle('hide-panel', S.hidePanel);
    if (window.innerWidth < 900) {
      if (!S.hidePanel) { S.hideChapters = true; S.layout.classList.add('hide-chapters'); }
    } else { PREF.hidePanel = S.hidePanel; savePref(); }
  }

  // テキストエリアの高さを本文に合わせる（スクロールは外側の .editor-scroll が担当）
  function fitTextarea() {
    if (!S) return;
    S.textarea.style.height = S.backdrop.offsetHeight + 'px';
    if (S.textarea.scrollHeight > S.textarea.clientHeight + 2) S.textarea.style.height = S.textarea.scrollHeight + 'px';
  }

  // ───── 話の一覧 ─────
  function renderChapterList() {
    const p = P();
    clear(S.chapterList);
    let total = 0;
    p.chapters.forEach((c, i) => {
      const n = countOf(c, c.id === S.ch.id && S.textarea ? S.textarea.value : c.body);
      total += n;
      const more = btn('', { icon: 'more', ghost: true, small: true, title: 'その他の操作' });
      more.addEventListener('click', (e) => { e.stopPropagation(); chapterMenu(more, c, i); });
      const li = h('li', {
        class: 'chapter-item' + (c.id === S.ch.id ? ' active' : ''), draggable: true, tabindex: 0,
        onclick: () => switchChapter(c.id),
        onkeydown: (e) => { if (e.key === 'Enter') switchChapter(c.id); },
        ondblclick: () => renameChapter(c),
      },
      h('span', { class: 'chapter-no' }, String(i + 1)),
      h('span', { class: 'chapter-name' }, c.title || '無題'),
      h('span', { class: 'chapter-count' }, UI.fmtNum(n)),
      more);
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.id); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drop-target'); });
      li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drop-target');
        const id = e.dataTransfer.getData('text/plain');
        const from = p.chapters.findIndex((x) => x.id === id);
        if (from < 0 || from === i) return;
        const [moved] = p.chapters.splice(from, 1);
        p.chapters.splice(i, 0, moved);
        App().touch();
        renderChapterList();
        runAnalysis(true);
      });
      S.chapterList.appendChild(li);
    });
    S.chapterTotal.textContent = `全${p.chapters.length}話・${UI.fmtNum(total)}字`;
  }

  function chapterMenu(anchor, c, i) {
    const p = P();
    UI.menu(anchor, [
      { label: '名前を変更', icon: 'pen', onClick: () => renameChapter(c) },
      { label: '上へ移動', icon: 'up', onClick: () => moveChapter(i, -1) },
      { label: '下へ移動', icon: 'down', onClick: () => moveChapter(i, 1) },
      { label: '複製', icon: 'copy', onClick: () => {
        syncBody();
        const copy = NS.Store.newChapter(c.title + '（複製）', c.body);
        copy.memo = c.memo;
        p.chapters.splice(i + 1, 0, copy);
        App().touch();
        renderChapterList();
      } },
      { label: 'テキストで書き出す', icon: 'download', onClick: () => { syncBody(); UI.download(UI.safeFilename(c.title) + '.txt', c.title + '\n\n' + c.body); } },
      { label: '投稿サイト用に書き出す', icon: 'upload', onClick: () => { syncBody(); NS.PublishDialog.open({ chapterId: c.id }); } },
      null,
      { label: '削除', icon: 'trash', danger: true, onClick: async () => {
        if (p.chapters.length <= 1) { toast('最後の話は削除できません'); return; }
        if (!(await UI.confirm(`「${c.title}」を削除します。元に戻せません。`, { danger: true, okLabel: '削除' }))) return;
        p.chapters.splice(i, 1);
        App().touch();
        if (c.id === S.ch.id) App().navigate('write', { id: p.chapters[Math.max(0, i - 1)].id });
        else renderChapterList();
      } },
    ]);
  }

  function moveChapter(i, d) {
    const p = P();
    const j = i + d;
    if (j < 0 || j >= p.chapters.length) return;
    const [c] = p.chapters.splice(i, 1);
    p.chapters.splice(j, 0, c);
    App().touch();
    renderChapterList();
    runAnalysis(true);
  }

  async function renameChapter(c) {
    const t = await UI.prompt('話のタイトル', c.title);
    if (t == null) return;
    c.title = t;
    if (c.id === S.ch.id) S.titleInput.value = t;
    App().touch();
    renderChapterList();
  }

  function addChapter() {
    const p = P();
    syncBody();
    const c = NS.Store.newChapter('第' + T.toKanjiNumber(p.chapters.length + 1) + '話');
    const idx = p.chapters.findIndex((x) => x.id === S.ch.id);
    p.chapters.splice(idx + 1, 0, c);
    App().touch();
    App().navigate('write', { id: c.id });
  }

  function switchChapter(id) {
    if (S && id === S.ch.id) { if (window.innerWidth < 900) toggleChapters(true); return; }
    syncBody();
    App().navigate('write', { id });
  }

  function syncBody() {
    if (!S) return;
    if (S.ch.body !== S.textarea.value) {
      S.ch.body = S.textarea.value;
      S.ch.updatedAt = Date.now();
      App().touch();
    }
  }

  // ───── 読み上げ（耳で読み返す） ─────
  /** 読み上げ用の文：ルビは読みで、傍点・記号は外す */
  function speakableText(t) {
    return NS.Publish.tokenize(t).map((x) => (x.type === 'ruby' ? x.reading : x.text)).join('')
      .replace(/[―─—]{2,}/g, '、').replace(/[|｜]/g, '').trim();
  }

  function pickVoice() {
    const voices = window.speechSynthesis.getVoices() || [];
    const ja = voices.filter((v) => /^ja/i.test(v.lang));
    if (PREF.speakVoice) {
      const v = ja.find((x) => x.name === PREF.speakVoice);
      if (v) return v;
    }
    return ja.find((v) => v.localService) || ja[0] || null;
  }

  function toggleSpeak() {
    if (S.speak) stopSpeak();
    else startSpeak();
  }

  function startSpeak() {
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
      toast('このブラウザは読み上げに対応していません', 'error');
      return;
    }
    const text = S.textarea.value;
    const from = S.textarea.selectionStart === text.length ? 0 : S.textarea.selectionStart;
    const to = S.textarea.selectionEnd > S.textarea.selectionStart ? S.textarea.selectionEnd : text.length;
    const list = T.analyze(text).sentences.filter((s) => s.end > from && s.start < to);
    if (!list.length) { toast('読み上げる文がありません'); return; }
    window.speechSynthesis.cancel();
    S.speak = { list, i: 0, paused: false, cur: null };
    renderSpeakBar();
    speakNext();
  }

  function speakNext() {
    const sp = S && S.speak;
    if (!sp) return;
    if (sp.i >= sp.list.length) { stopSpeak(); toast('読み上げが終わりました'); return; }
    const s = sp.list[sp.i];
    sp.cur = { start: s.start, end: s.end };
    renderBackdrop();
    renderSpeakBar();
    const mk = S.backdrop.querySelector('.mk-speak');
    if (mk) {
      const r = mk.getBoundingClientRect();
      const box = S.scroll.getBoundingClientRect();
      if (r.top < box.top + 40 || r.bottom > box.bottom - 40) S.scroll.scrollTop += r.top - box.top - box.height / 3;
    }
    const say = speakableText(S.textarea.value.slice(s.start, s.end));
    if (!/[^\s　…・「」『』（）()、。！？!?]/.test(say)) { sp.i++; speakNext(); return; }
    const u = new window.SpeechSynthesisUtterance(say);
    u.lang = 'ja-JP';
    u.rate = PREF.speakRate || 1;
    const v = pickVoice();
    if (v) u.voice = v;
    const token = {};
    sp.token = token;
    u.onend = () => { if (S && S.speak === sp && sp.token === token) { sp.i++; speakNext(); } };
    u.onerror = (e) => {
      if (!S || S.speak !== sp || sp.token !== token) return;
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      stopSpeak();
      toast('読み上げできませんでした' + (e && e.error ? '（' + e.error + '）' : ''), 'error');
    };
    window.speechSynthesis.speak(u);
  }

  function stopSpeak(silent) {
    if (!S || !S.speak) return;
    S.speak = null;
    try { window.speechSynthesis.cancel(); } catch (e) { /* 何もしない */ }
    if (silent) return;
    renderBackdrop();
    renderSpeakBar();
  }

  function renderSpeakBar() {
    const bar = S.speakBar;
    clear(bar);
    const sp = S.speak;
    bar.hidden = !sp;
    if (!sp) return;
    const rate = h('select', {
      class: 'input', 'aria-label': '読み上げの速さ',
      onchange: (e) => { PREF.speakRate = +e.target.value; savePref(); },
    }, [0.8, 1, 1.2, 1.5, 2].map((r) => h('option', { value: r, selected: (PREF.speakRate || 1) === r }, `${r}倍`)));
    const voices = (window.speechSynthesis.getVoices() || []).filter((v) => /^ja/i.test(v.lang));
    const voiceSel = voices.length > 1 ? h('select', {
      class: 'input', 'aria-label': '声',
      onchange: (e) => { PREF.speakVoice = e.target.value; savePref(); },
    }, voices.map((v) => h('option', { value: v.name, selected: (pickVoice() || {}).name === v.name }, v.name))) : null;
    const pauseBtn = btn(sp.paused ? '再開' : '一時停止', {
      icon: sp.paused ? 'play' : 'pause', small: true,
      onClick: () => {
        if (sp.paused) window.speechSynthesis.resume(); else window.speechSynthesis.pause();
        sp.paused = !sp.paused;
        renderSpeakBar();
      },
    });
    bar.append(
      h('span', { class: 'speak-state' }, h('span', { class: 'speak-dot' + (sp.paused ? ' paused' : '') }), `読み上げ中　${Math.min(sp.i + 1, sp.list.length)} / ${sp.list.length}文`),
      pauseBtn,
      btn('止める', { icon: 'stop', small: true, onClick: () => stopSpeak() }),
      h('label', { class: 'small speak-opt' }, '速さ', rate),
      voiceSel ? h('label', { class: 'small speak-opt' }, '声', voiceSel) : null,
      !voices.length ? h('span', { class: 'small muted' }, '日本語の声が見つからないため、端末の標準の声で読みます') : null);
  }

  // ───── 入力とハイライト ─────
  function onInput() {
    if (S.speak) stopSpeak();
    const text = S.textarea.value;
    const diff = T.diffRange(S.lastText, text);
    S.issues = T.shiftRanges(S.issues, diff);
    S.aiIssues = T.shiftRanges(S.aiIssues || [], diff);
    if (S.find.open) computeFind();
    S.lastText = text;
    S.ch.body = text;
    S.ch.updatedAt = Date.now();
    App().touch();
    renderBackdrop();
    fitTextarea();
    scheduleAnalysis();
    renderStatusSoon();
  }

  const renderStatusSoon = UI.debounce(() => { if (S) { renderStatus(); renderChapterList(); } }, 500);

  function scheduleAnalysis() {
    if (S.analysisTimer) clearTimeout(S.analysisTimer);
    S.analysisTimer = setTimeout(() => runAnalysis(), 450);
  }

  function runAnalysis(refreshPanel) {
    if (!S) return;
    const p = P();
    const st = App().settings;
    const text = S.textarea.value;
    const ignore = new Set(S.ch.ignored);
    const corpus = p.chapters.map((c) => (c.id === S.ch.id ? text : c.body));
    let proof = [];
    try {
      proof = NS.Proofread.proofread(text, {
        rules: st.rules, maxSentenceLength: st.maxSentenceLength, maxCommas: st.maxCommas, endingRepeat: st.endingRepeat,
        styleRules: p.rules.style, corpus, ignore,
        readings: NS.Readings ? NS.Readings.index(NS.Readings.collect(p)) : null,
        names: p.entries.reduce((a, e) => a.concat([e.name], e.aliases || []), []),
      });
    } catch (e) { console.error(e); }
    let cons = { issues: [], speakers: [], candidates: [] };
    try {
      cons = NS.Consistency.check(text, {
        entries: p.entries, rules: p.rules, chapterNo: p.chapters.findIndex((c) => c.id === S.ch.id) + 1,
        enabled: st.consistency, ignore, narrator: S.ch.narrator || p.rules.narrator || 'auto',
      });
    } catch (e) { console.error(e); }
    S.cons = cons;
    const ai = (S.aiIssues || []).filter((x) => text.slice(x.start, x.end) === x.text);
    S.aiIssues = ai;
    S.issues = proof.concat(cons.issues, ai).sort((a, b) => a.start - b.start || SEV_ORDER[b.severity] - SEV_ORDER[a.severity]);
    S.issues.forEach((it, i) => { it.idx = i; });
    if (S.active >= S.issues.length) S.active = -1;
    renderBackdrop();
    fitTextarea();
    renderBadges();
    if (refreshPanel !== false && (S.panelTab === 'proof' || S.panelTab === 'cons' || refreshPanel)) renderPanel();
  }

  V.addAiIssues = function (items, chapterId) {
    if (!S || (chapterId && chapterId !== S.ch.id)) return;
    S.aiIssues = (S.aiIssues || []).concat(items);
    runAnalysis();
  };
  V.clearAiIssues = function (chapterId) {
    if (!S || (chapterId && chapterId !== S.ch.id)) return;
    S.aiIssues = [];
    runAnalysis();
  };
  V.getText = function () { return S ? S.textarea.value : ''; };
  V.getSelection = function () {
    if (!S) return null;
    const { selectionStart: a, selectionEnd: b } = S.textarea;
    return a !== b ? { start: a, end: b, text: S.textarea.value.slice(a, b) } : null;
  };
  V.chapter = function () { return S ? S.ch : null; };
  V.focusRange = function (start, end) { focusRange(start, end); };
  V.replaceRange = function (start, end, text) { replaceRange(start, end, text); };

  /** 重なりのある指摘を平坦化してハイライト用の HTML を作る */
  function renderBackdrop() {
    const text = S.textarea.value;
    const marks = [];
    S.issues.forEach((it) => {
      if (it.end > it.start) marks.push({ s: it.start, e: it.end, cls: 'mk sev-' + it.severity + (it.source === 'ai' ? ' mk-ai' : ''), i: it.idx, pri: SEV_ORDER[it.severity] * 10 });
    });
    if (S.find.open) {
      S.find.matches.forEach((m, i) => marks.push({ s: m.start, e: m.end, cls: 'mk-find' + (i === S.find.cur ? ' cur' : ''), i: -1, pri: 100 }));
    }
    if (S.speak && S.speak.cur) marks.push({ s: S.speak.cur.start, e: S.speak.cur.end, cls: 'mk-speak', i: -1, pri: 200 });
    const bounds = new Set([0, text.length]);
    marks.forEach((m) => { bounds.add(Math.max(0, Math.min(text.length, m.s))); bounds.add(Math.max(0, Math.min(text.length, m.e))); });
    const pts = Array.from(bounds).sort((a, b) => a - b);
    // 区間ごとに優先度の高い印を選ぶ（指摘数が多くても速いよう開始位置で並べて走査）
    marks.sort((a, b) => a.s - b.s);
    let html = '';
    let mi = 0;
    const activeSet = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      while (mi < marks.length && marks[mi].s <= a) { activeSet.push(marks[mi]); mi++; }
      for (let j = activeSet.length - 1; j >= 0; j--) if (activeSet[j].e <= a) activeSet.splice(j, 1);
      const seg = T.escapeHtml(text.slice(a, b));
      if (!activeSet.length) { html += seg; continue; }
      let best = activeSet[0];
      activeSet.forEach((m) => {
        if (m.pri > best.pri || (m.pri === best.pri && (m.e - m.s) < (best.e - best.s))) best = m;
      });
      const isActive = best.i >= 0 && best.i === S.active;
      html += '<mark class="' + best.cls + (isActive ? ' active' : '') + '" data-i="' + best.i + '">' + seg + '</mark>';
    }
    S.backdrop.innerHTML = html + '\n​';
  }

  function onCaret() {
    updateSelHint();
    const pos = S.textarea.selectionStart;
    let found = -1;
    let best = 0;
    S.issues.forEach((it, i) => {
      if (pos >= it.start && pos <= it.end && SEV_ORDER[it.severity] > best) { found = i; best = SEV_ORDER[it.severity]; }
    });
    setActive(found, false);
  }

  function setActive(i, scroll) {
    S.active = i;
    renderBackdrop();
    renderIssueBar();
    S.panelBody.querySelectorAll('.issue-card').forEach((c) => c.classList.toggle('active', +c.dataset.i === i));
    if (i >= 0) {
      const card = S.panelBody.querySelector('.issue-card[data-i="' + i + '"]');
      if (card && !scroll) card.scrollIntoView({ block: 'nearest' });
    }
  }

  function focusRange(start, end) {
    S.textarea.focus({ preventScroll: true });
    S.textarea.setSelectionRange(start, end);
    // ハイライトの位置を使ってスクロール
    const probe = document.createElement('span');
    const text = S.textarea.value;
    S.backdrop.textContent = text.slice(0, start);
    probe.textContent = text.slice(start, end) || '​';
    S.backdrop.appendChild(probe);
    const top = probe.getBoundingClientRect().top - S.scroll.getBoundingClientRect().top + S.scroll.scrollTop;
    renderBackdrop();
    S.scroll.scrollTop = Math.max(0, top - S.scroll.clientHeight / 3);
  }

  function replaceRange(start, end, str) {
    const ta = S.textarea;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, end);
    let ok = false;
    try {
      ok = str === '' ? document.execCommand('delete') : document.execCommand('insertText', false, str);
    } catch (e) { ok = false; }
    if (!ok || ta.value.slice(start, start + str.length) !== str) {
      if (ta.value.slice(start, start + str.length) !== str) {
        ta.setRangeText(str, start, end, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    }
  }

  function applyIssue(it) {
    const text = S.textarea.value;
    if (it.suggestion == null) return;
    if (text.slice(it.start, it.end) !== it.text) { toast('本文が変わったため適用できません。再チェックします'); runAnalysis(); return; }
    replaceRange(it.start, it.end, it.suggestion);
    S.active = -1;
    renderIssueBar();
    runAnalysis();
  }

  function ignoreIssue(it) {
    if (S.ch.ignored.indexOf(it.key) < 0) S.ch.ignored.push(it.key);
    App().touch();
    toast(`「${it.text.slice(0, 12)}」の指摘をこの話で無視します`);
    S.active = -1;
    renderIssueBar();
    runAnalysis();
  }

  function disableRule(it) {
    const st = App().settings;
    if (it.source === 'consistency') st.consistency[it.ruleId] = false;
    else st.rules[it.ruleId] = false;
    App().saveSettings();
    toast(`「${it.rule}」を無効にしました（設定から戻せます）`);
    runAnalysis();
  }

  function renderIssueBar() {
    const it = S.issues[S.active];
    clear(S.issueBar);
    if (!it) { S.issueBar.hidden = true; return; }
    S.issueBar.hidden = false;
    S.issueBar.append(
      h('span', { class: 'sev-dot sev-' + it.severity }),
      h('span', { class: 'issue-bar-msg' }, h('strong', null, it.rule), '　', it.message),
      it.suggestion != null ? btn(it.suggestion === '' ? '削除する' : `「${trunc(it.suggestion, 10)}」にする`, { small: true, primary: true, onClick: () => applyIssue(it) }) : null,
      actionButton(it),
      btn('無視', { small: true, ghost: true, onClick: () => ignoreIssue(it) }),
      btn('', { icon: 'x', small: true, ghost: true, title: '閉じる', onClick: () => setActive(-1) }));
  }

  function trunc(s, n) {
    s = String(s).replace(/\n/g, '↵');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // ───── 挿入系 ─────
  function insertText(str) {
    const ta = S.textarea;
    replaceRange(ta.selectionStart, ta.selectionEnd, str);
  }

  function wrapOrInsert(open, close) {
    const ta = S.textarea;
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    const sel = ta.value.slice(a, b);
    replaceRange(a, b, open + sel + close);
    const caret = sel ? a + open.length + sel.length + close.length : a + open.length;
    ta.setSelectionRange(caret, caret);
  }

  async function insertRuby() {
    const ta = S.textarea;
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    const sel = ta.value.slice(a, b);
    if (!sel) {
      replaceRange(a, b, '|《》');
      ta.setSelectionRange(a + 1, a + 1);
      toast('「|」と「《」の間に親文字、《》の中に読みを入力します');
      return;
    }
    const r = await UI.prompt(`「${trunc(sel, 12)}」の読み（ルビ）`, '', { placeholder: 'よみがな' });
    if (!r) return;
    replaceRange(a, b, '|' + sel + '《' + r + '》');
  }

  // ───── 検索・置換 ─────
  function openFind() {
    S.find.open = true;
    S.findBar.hidden = false;
    const sel = V.getSelection();
    if (sel && sel.text.length < 40 && sel.text.indexOf('\n') < 0) S.find.q = sel.text;
    renderFindBar();
    computeFind();
    renderBackdrop();
    const inp = S.findBar.querySelector('input');
    inp.focus();
    inp.select();
  }

  function closeFind() {
    S.find.open = false;
    S.findBar.hidden = true;
    renderBackdrop();
    S.textarea.focus();
  }

  function computeFind() {
    const q = S.find.q;
    const text = S.textarea.value;
    S.find.matches = [];
    if (q) {
      let i = text.indexOf(q);
      while (i >= 0 && S.find.matches.length < 2000) {
        S.find.matches.push({ start: i, end: i + q.length });
        i = text.indexOf(q, i + q.length);
      }
    }
    if (S.find.cur >= S.find.matches.length) S.find.cur = S.find.matches.length ? 0 : -1;
    const c = S.findBar.querySelector('.find-count');
    if (c) c.textContent = S.find.matches.length ? `${S.find.cur + 1}/${S.find.matches.length}` : (q ? '0件' : '');
  }

  function findStep(d) {
    const n = S.find.matches.length;
    if (!n) return;
    S.find.cur = (S.find.cur + d + n) % n;
    const m = S.find.matches[S.find.cur];
    computeFind();
    focusRange(m.start, m.end);
    S.findBar.querySelector('input').focus();
  }

  function renderFindBar() {
    clear(S.findBar);
    const q = h('input', {
      class: 'input', type: 'search', value: S.find.q, placeholder: '検索', 'aria-label': '検索する語',
      oninput: (e) => { S.find.q = e.target.value; S.find.cur = 0; computeFind(); renderBackdrop(); },
      onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); } },
    });
    const r = h('input', {
      class: 'input', type: 'text', value: S.find.r, placeholder: '置換後', 'aria-label': '置換後の語',
      oninput: (e) => { S.find.r = e.target.value; },
    });
    S.findBar.append(
      q, h('span', { class: 'find-count muted small' }),
      btn('', { icon: 'up', ghost: true, small: true, title: '前へ', onClick: () => findStep(-1) }),
      btn('', { icon: 'down', ghost: true, small: true, title: '次へ', onClick: () => findStep(1) }),
      r,
      btn('置換', { small: true, onClick: () => {
        const m = S.find.matches[S.find.cur];
        if (!m) return;
        replaceRange(m.start, m.end, S.find.r);
        computeFind();
        findStep(0);
      } }),
      btn('この話ですべて置換', { small: true, onClick: () => replaceAll(false) }),
      btn('全話で置換', { small: true, onClick: () => replaceAll(true) }),
      btn('', { icon: 'x', ghost: true, small: true, title: '閉じる', onClick: closeFind }));
  }

  async function replaceAll(allChapters) {
    const q = S.find.q;
    if (!q) return;
    const rep = S.find.r;
    const p = P();
    syncBody();
    let count = 0;
    const targets = allChapters ? p.chapters : [S.ch];
    targets.forEach((c) => { count += c.body.split(q).length - 1; });
    if (!count) { toast('見つかりませんでした'); return; }
    if (!(await UI.confirm(`${allChapters ? '全話' : 'この話'}の「${q}」${count}件を「${rep}」に置き換えます。`, { okLabel: '置換' }))) return;
    targets.forEach((c) => {
      if (c.body.indexOf(q) < 0) return;
      if (allChapters) pushSnapshot(c, '置換前（' + q + '→' + rep + '）', true);
      c.body = c.body.split(q).join(rep);
      c.updatedAt = Date.now();
    });
    S.textarea.value = S.ch.body;
    S.lastText = S.ch.body;
    App().touch();
    computeFind();
    runAnalysis();
    renderChapterList();
    toast(count + '件を置換しました');
  }

  // ───── 版の保存（履歴） ─────
  function pushSnapshot(c, label, auto) {
    const last = c.snapshots[0];
    if (last && last.body === c.body) return false;
    c.snapshots.unshift({ id: UI.uid('s'), at: Date.now(), label: label || '', body: c.body, auto: !!auto, chars: T.stats(c.body).charsNoSpace });
    // 自動保存分から古い順に間引く
    while (c.snapshots.length > 30) {
      let k = -1;
      for (let i = c.snapshots.length - 1; i >= 0; i--) if (c.snapshots[i].auto) { k = i; break; }
      c.snapshots.splice(k >= 0 ? k : c.snapshots.length - 1, 1);
    }
    App().touch();
    return true;
  }

  function autoSnapshot() {
    if (!S) return;
    syncBody();
    const c = S.ch;
    if (c.body === S.openedBody) return;
    const lastAuto = c.snapshots.find((s) => s.auto);
    if (lastAuto && Date.now() - lastAuto.at < 10 * 60 * 1000 && c.snapshots[0] === lastAuto) {
      lastAuto.body = c.body;
      lastAuto.at = Date.now();
      lastAuto.chars = T.stats(c.body).charsNoSpace;
      App().touch();
      return;
    }
    pushSnapshot(c, '自動保存', true);
  }

  function openHistory() {
    syncBody();
    const c = S.ch;
    const list = h('div', { class: 'snapshot-list' });
    const render = () => {
      clear(list);
      if (!c.snapshots.length) list.appendChild(h('p', { class: 'muted' }, 'まだ保存した版はありません。'));
      c.snapshots.forEach((s, i) => {
        list.appendChild(h('div', { class: 'snapshot' },
          h('div', { class: 'snapshot-meta' },
            h('strong', null, s.label || (s.auto ? '自動保存' : '手動保存')),
            h('span', { class: 'muted small' }, UI.fmtDate(s.at, true) + '・' + UI.fmtNum(s.chars || 0) + '字')),
          h('div', { class: 'row' },
            btn('見る', { small: true, ghost: true, onClick: () => UI.modal({ title: s.label || UI.fmtDate(s.at, true), wide: true, body: h('pre', { class: 'snapshot-text' }, s.body) }) }),
            btn('この版に戻す', { small: true, onClick: async () => {
              if (!(await UI.confirm('今の本文を版として保存してから、この版に戻します。'))) return;
              pushSnapshot(c, '復元前の状態', false);
              S.textarea.value = s.body;
              onInput();
              runAnalysis();
              closeFn();
              toast('復元しました');
            } }),
            btn('', { icon: 'trash', small: true, ghost: true, title: '削除', onClick: () => { c.snapshots.splice(i, 1); App().touch(); render(); } }))));
      });
    };
    render();
    const closeFn = UI.modal({
      title: '版の保存と履歴：' + c.title, wide: true,
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, '大きく書き直す前に「今の版を保存」しておくと、いつでも戻せます。話を切り替えたときにも自動で保存されます（最大30件）。'),
        h('div', { class: 'row' }, btn('今の版を保存', { icon: 'save', primary: true, onClick: async () => {
          const label = await UI.prompt('版の名前（任意）', '', { placeholder: '例：初稿、推敲前' });
          if (label == null) return;
          if (pushSnapshot(c, label, false)) toast('保存しました'); else toast('前回の版から変更がありません');
          render();
        } })),
        list),
    });
  }

  // ───── 状態表示 ─────
  function renderStatus() {
    const st = T.stats(S.textarea.value);
    const p = P();
    const today = App().todayWritten();
    const goal = p.goal.daily || 0;
    const pct = goal ? Math.min(100, Math.round((today / goal) * 100)) : 0;
    clear(S.status);
    S.status.append(
      h('span', { title: '空白・改行を除く文字数' }, h('strong', null, UI.fmtNum(st.charsNoSpace)), '字'),
      h('span', { title: '400字詰め原稿用紙換算' }, '原稿用紙 ', h('strong', null, st.pages), '枚'),
      h('span', { class: 'status-today', title: '今日書いた文字数 / 1日の目標' },
        '今日 ', h('strong', null, (today >= 0 ? '+' : '') + UI.fmtNum(today)), goal ? ' / ' + UI.fmtNum(goal) : '',
        goal ? h('span', { class: 'meter' }, h('span', { style: { width: pct + '%' } })) : null),
      S.selHint = h('span', { class: 'status-sel' }),
      h('span', { class: 'status-issues' }, issueSummary()));
    updateSelHint();
  }

  function updateSelHint() {
    if (!S || !S.selHint) return;
    clear(S.selHint);
    const w = selectedWord();
    if (w) S.selHint.appendChild(h('button', { type: 'button', class: 'link-btn', onclick: openDict }, icon('dict', 14), `「${w.length > 10 ? w.slice(0, 10) + '…' : w}」を調べる`));
  }

  function issueSummary() {
    const c = { error: 0, warning: 0, info: 0 };
    S.issues.forEach((i) => { c[i.severity]++; });
    return h('span', null,
      h('span', { class: 'sev-dot sev-error' }), c.error, ' ',
      h('span', { class: 'sev-dot sev-warning' }), c.warning, ' ',
      h('span', { class: 'sev-dot sev-info' }), c.info);
  }

  function renderBadges() {
    const proof = S.issues.filter((i) => i.source === 'proofread').length;
    const cons = S.issues.filter((i) => i.source === 'consistency').length;
    const ai = S.issues.filter((i) => i.source === 'ai').length;
    S.panelTabs.querySelectorAll('[data-badge]').forEach((b) => {
      const n = { proof, cons, ai }[b.dataset.badge];
      b.textContent = n ? String(n) : '';
    });
    renderStatusSoon();
  }

  // ───── パネル ─────
  function renderPanel() {
    if (!S) return;
    S.panelTabs.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === S.panelTab);
      t.setAttribute('aria-selected', t.dataset.tab === S.panelTab ? 'true' : 'false');
    });
    clear(S.panelBody);
    const fn = { proof: panelProof, cons: panelCons, ai: panelAI, dict: panelDict, ref: panelRef, stats: panelStats }[S.panelTab] || panelProof;
    S.panelBody.appendChild(fn());
    renderBadges();
  }

  function issueCard(it) {
    const text = S.textarea.value;
    const before = text.slice(Math.max(0, it.start - 14), it.start).replace(/\n/g, '↵');
    const after = text.slice(it.end, it.end + 14).replace(/\n/g, '↵');
    const more = btn('', { icon: 'more', ghost: true, small: true, title: 'その他' });
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      UI.menu(more, [
        { label: 'この指摘を無視', icon: 'eye', onClick: () => ignoreIssue(it) },
        it.source !== 'ai' ? { label: `「${it.rule}」を無効にする`, icon: 'x', onClick: () => disableRule(it) } : null,
      ].filter(Boolean));
    });
    return h('div', {
      class: 'issue-card' + (it.idx === S.active ? ' active' : ''), dataset: { i: it.idx }, tabindex: 0,
      onclick: () => { setActive(it.idx, true); focusRange(it.start, it.end); },
      onkeydown: (e) => { if (e.key === 'Enter') { setActive(it.idx, true); focusRange(it.start, it.end); } },
    },
    h('div', { class: 'issue-head' },
      h('span', { class: 'sev-dot sev-' + it.severity, title: SEV_LABEL[it.severity] }),
      h('span', { class: 'issue-rule' }, it.rule),
      h('span', { class: 'issue-cat' }, it.category),
      more),
    h('div', { class: 'issue-excerpt' }, h('span', { class: 'ctx' }, before), h('mark', null, trunc(it.text, 40) || '　'), h('span', { class: 'ctx' }, after)),
    h('div', { class: 'issue-msg' }, it.message),
    it.suggestion != null || it.action ? h('div', { class: 'issue-actions' },
      it.suggestion != null ? btn(it.suggestion === '' ? '削除する' : `「${trunc(it.suggestion, 14)}」にする`, {
        small: true, onClick: (e) => { e.stopPropagation(); applyIssue(it); },
      }) : null,
      actionButton(it)) : null);
  }

  /** 指摘に付いた追加の操作（読み方の登録など） */
  function actionButton(it) {
    if (!it.action || it.action.type !== 'register-reading') return null;
    return btn('読み方として登録', {
      small: true, icon: 'bulb', onClick: (e) => { if (e) e.stopPropagation(); registerReading(it.action.base, it.action.reading); },
    });
  }

  function registerReading(base, reading) {
    const p = P();
    p.ideas.unshift({
      id: UI.uid('i'), kind: '読み方', word: base, reading, body: '', tags: ['読み方'], color: '', pinned: false,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    App().touch();
    S.active = -1;
    renderIssueBar();
    runAnalysis(true);
    toast(`アイデア帳に読み方「${base}《${reading}》」を登録しました。以後このルビは指摘しません`);
  }

  function issueList(items, empty) {
    const box = h('div', { class: 'issue-list' });
    if (!items.length) { box.appendChild(h('div', { class: 'empty small' }, empty)); return box; }
    items.slice(0, 400).forEach((it) => box.appendChild(issueCard(it)));
    if (items.length > 400) box.appendChild(h('p', { class: 'muted small' }, `ほか${items.length - 400}件`));
    return box;
  }

  function panelProof() {
    const all = S.issues.filter((i) => i.source === 'proofread');
    const cats = ['all'].concat(Array.from(new Set(all.map((i) => i.category))));
    const items = S.filter === 'all' || cats.indexOf(S.filter) < 0 ? all : all.filter((i) => i.category === S.filter);
    const fixable = all.filter((i) => i.fixable && i.ruleId !== 'hyouki');
    const chips = h('div', { class: 'chips' }, cats.map((c) => h('button', {
      type: 'button', class: 'chip' + ((S.filter === c || (c === 'all' && cats.indexOf(S.filter) < 0)) ? ' active' : ''),
      onclick: () => { S.filter = c; renderPanel(); },
    }, c === 'all' ? `すべて ${all.length}` : `${c} ${all.filter((i) => i.category === c).length}`)));
    return h('div', { class: 'stack-sm' },
      h('div', { class: 'panel-intro' },
        h('p', { class: 'small muted' }, '本文を書くと自動でチェックします。指摘をクリックすると本文の該当箇所へ移動します。'),
        fixable.length ? btn(`記号・表記をまとめて修正（${fixable.length}件）`, { small: true, icon: 'check', onClick: async () => {
          if (!(await UI.confirm(`誤字・記号の作法・表記など、提案のある${fixable.length}件をまとめて修正します。（表記ゆれは対象外）`, { okLabel: '修正' }))) return;
          syncBody();
          pushSnapshot(S.ch, '一括修正前', true);
          const fixed = NS.Proofread.applyFixes(S.textarea.value, fixable);
          S.textarea.value = fixed;
          onInput();
          runAnalysis();
          toast('まとめて修正しました（履歴から元に戻せます）');
        } }) : null),
      chips,
      issueList(items, all.length ? 'この分類の指摘はありません' : '指摘はありません。'));
  }

  /** この話の語り手（地の文の視点）。世界観NGワードを地の文でチェックするかが変わる */
  function narratorRow() {
    const p = P();
    const C = NS.Consistency;
    const nar = (S.cons && S.cons.narrator) || { setting: 'auto', effective: 'third' };
    const projSetting = p.rules.narrator || 'auto';
    const detectedText = !nar.detected ? ''
      : nar.detected.kind === 'first' ? `自動判定：地の文に「${nar.detected.pronoun}」が${nar.detected.count}回`
        : '自動判定：地の文に一人称がほとんどないため';
    const inherit = `作品の設定に従う（${projSetting === 'auto' ? '自動' : C.NARRATOR_SHORT[projSetting]}）`;
    const sel = h('select', {
      class: 'input', 'aria-label': 'この話の語り手',
      onchange: (e) => { S.ch.narrator = e.target.value; App().touch(); runAnalysis(true); },
    }, [['', inherit]].concat(Object.keys(C.NARRATORS).filter((k) => k !== 'auto').map((k) => [k, C.NARRATORS[k]])).map(([v, l]) => h('option', { value: v, selected: (S.ch.narrator || '') === v }, l)));
    const effLabel = nar.detected ? (nar.detected.kind === 'first' ? '一人称' : '三人称') : (C.NARRATOR_SHORT[nar.effective] || '');
    const note = nar.effective === 'omniscient' ? '地の文の世界観NGワードは指摘しません（台詞だけチェック）'
      : nar.effective === 'first' ? '語り手が作中の人物なので、地の文の世界観NGワードも指摘します'
        : '地の文の世界観NGワードは「参考」として控えめに指摘します（神視点にすると指摘しません）';
    const box = h('details', { class: 'sub-section narrator-box', open: S.narrOpen != null ? S.narrOpen : (!S.ch.narrator && projSetting === 'auto' && nar.effective !== 'first') },
      h('summary', null, `語り手：${effLabel}`, detectedText ? h('span', { class: 'muted small' }, '　' + detectedText) : null),
      h('div', { class: 'stack-sm' },
        UI.field('この話の語り手（地の文の視点）', sel),
        h('p', { class: 'small muted' }, note + '。作品全体の設定は「設定資料 → 世界観ルール」で変えられます。')));
    box.addEventListener('toggle', () => { S.narrOpen = box.open; });
    return box;
  }

  function panelCons() {
    const p = P();
    const items = S.issues.filter((i) => i.source === 'consistency');
    const wrap = h('div', { class: 'stack-sm' });
    if (!p.entries.length && !p.rules.ng.length) {
      wrap.appendChild(h('div', { class: 'empty' },
        h('p', null, '設定資料に人物・場所・用語を登録すると、名前の表記ゆれ、一人称や呼び方、髪や瞳の色、年齢、退場後の登場などの食い違いをチェックします。'),
        btn('設定資料を開く', { icon: 'users', onClick: () => App().navigate('lore') })));
    }
    wrap.appendChild(narratorRow());
    wrap.appendChild(issueList(items, '設定との食い違いは見つかりませんでした。'));

    // 話者推定
    const sp = (S.cons && S.cons.speakers) || [];
    const dCount = T.analyze(S.textarea.value).dialogues.length;
    if (dCount) {
      const counts = {};
      sp.forEach((s) => { counts[s.name] = (counts[s.name] || 0) + 1; });
      wrap.appendChild(h('details', { class: 'sub-section', open: true },
        h('summary', null, `台詞の話者（推定） ${sp.length}/${dCount}`),
        h('p', { class: 'small muted' }, '「」の直前・直後の「〇〇は」「〇〇が」や「〇〇「…」」の形から推定しています。一人称・呼び方のチェックはこの推定に基づきます。'),
        h('div', { class: 'chips' }, Object.keys(counts).map((n) => h('span', { class: 'chip static' }, `${n} ${counts[n]}`)),
          dCount - sp.length > 0 ? h('span', { class: 'chip static muted' }, `不明 ${dCount - sp.length}`) : null),
        h('div', { class: 'speaker-list' }, sp.slice(0, 60).map((s) => h('button', {
          type: 'button', class: 'speaker-row', onclick: () => focusRange(s.start, s.end),
        }, h('span', { class: 'speaker-name' }, s.name), h('span', { class: 'speaker-line' }, trunc(S.textarea.value.slice(s.start, s.end), 30)))))));
    }

    // 未登録の固有名詞
    const cands = (S.cons && S.cons.candidates) || [];
    if (cands.length) {
      wrap.appendChild(h('details', { class: 'sub-section', open: true },
        h('summary', null, `設定資料に未登録の固有名詞（候補） ${cands.length}`),
        h('p', { class: 'small muted' }, 'クリックすると設定資料に登録できます。'),
        h('div', { class: 'chips' }, cands.map((c) => {
          const b = h('button', { type: 'button', class: 'chip' }, `${c.word} ${c.count}`);
          b.addEventListener('click', () => UI.menu(b, [
            { label: '人物として登録', icon: 'users', onClick: () => registerEntry(c.word, 'character') },
            { label: '場所として登録', icon: 'map', onClick: () => registerEntry(c.word, 'place') },
            { label: '用語・アイテムとして登録', icon: 'tag', onClick: () => registerEntry(c.word, 'term') },
            { label: '組織として登録', icon: 'flag', onClick: () => registerEntry(c.word, 'org') },
            null,
            { label: '本文で探す', icon: 'search', onClick: () => { S.find.q = c.word; openFind(); } },
          ]));
          return b;
        }))));
    }
    return wrap;
  }

  function registerEntry(name, type) {
    const p = P();
    const e = NS.Lore.newEntry(type, name);
    p.entries.push(e);
    App().touch();
    toast(`「${name}」を${NS.Lore.TYPE_LABEL[type]}として登録しました`);
    runAnalysis(true);
  }

  function panelAI() {
    if (!NS.AIPanel) return h('p', null, 'AI機能を読み込めませんでした');
    const chId = S.ch.id;
    return NS.AIPanel.render({
      getText: () => S.textarea.value,
      getSelection: V.getSelection,
      chapter: S.ch,
      project: P(),
      chapterNo: P().chapters.findIndex((c) => c.id === S.ch.id) + 1,
      addIssues: (items) => V.addAiIssues(items, chId),
      clearIssues: () => V.clearAiIssues(chId),
      focusRange,
      apply: (it) => applyIssue(it),
      aiIssues: () => (S.aiIssues || []),
      rerender: () => { if (S && S.panelTab === 'ai') renderPanel(); },
    });
  }

  /** 辞書タブ（選んでいる語をそのまま調べる） */
  function panelDict() {
    const q = S.dictQuery || '';
    S.dictQuery = '';
    return NS.Dict.render({
      query: q,
      compact: true,
      onInsert: (text) => {
        const ta = S.textarea;
        replaceRange(ta.selectionStart, ta.selectionEnd, text);
        toast(`「${text}」を入れました`);
      },
      onJump: (chapterId, start, end) => {
        if (chapterId === S.ch.id) { focusRange(start, end); return; }
        switchChapter(chapterId);
        setTimeout(() => V.focusRange(start, end), 80);
      },
    });
  }

  function selectedWord() {
    const sel = V.getSelection();
    if (!sel) return '';
    const t = sel.text.trim();
    return t.length <= 30 && t.indexOf('\n') < 0 ? t : '';
  }

  function openDict() {
    S.dictQuery = selectedWord();
    S.panelTab = 'dict';
    PREF.panelTab = 'dict';
    savePref();
    if (S.hidePanel) togglePanel();
    renderPanel();
  }
  V.openDict = function () { if (S) openDict(); };

  function panelRef() {
    const p = P();
    const memo = h('textarea', {
      class: 'input memo', rows: 5, value: S.ch.memo, placeholder: 'この話のメモ（プロット、書きたい場面、伏線など）',
      oninput: (e) => { S.ch.memo = e.target.value; App().touch(); },
    });
    const results = h('div', { class: 'ref-list' });
    const search = h('input', { class: 'input', type: 'search', placeholder: '人物・場所・用語を検索', 'aria-label': '設定資料を検索' });
    const render = () => {
      clear(results);
      const q = search.value.trim();
      const list = p.entries.filter((e) => !q || e.name.indexOf(q) >= 0 || (e.reading || '').indexOf(q) >= 0 || e.aliases.some((a) => a.indexOf(q) >= 0));
      if (!list.length) results.appendChild(h('p', { class: 'muted small' }, p.entries.length ? '見つかりません' : '設定資料はまだありません'));
      list.slice(0, 50).forEach((e) => {
        results.appendChild(h('details', { class: 'ref-item' },
          h('summary', null,
            h('span', { class: 'type-badge t-' + e.type }, NS.Lore.TYPE_LABEL[e.type]),
            h('strong', null, e.name), e.reading ? h('span', { class: 'muted small' }, ' ' + e.reading) : null),
          h('div', { class: 'ref-body' },
            NS.Lore.summaryList(e, p),
            h('div', { class: 'row' },
              btn('本文に挿入', { small: true, onClick: () => insertText(e.name.replace(/[\s　]/g, '')) }),
              btn('開く', { small: true, ghost: true, onClick: () => App().navigate('lore', { id: e.id }) })))));
      });
    };
    search.addEventListener('input', render);
    render();
    const readings = NS.Readings ? NS.Readings.collect(p) : [];
    const readingBox = h('details', { class: 'sub-section' },
      h('summary', null, `登録した読み方（ルビ） ${readings.length}`),
      h('p', { class: 'small muted' }, 'アイデア帳に種類「読み方」で書いたもの、メモ中の 足《アルファ》 のような記法、設定資料の「読み」から集めています。ここにある読みのルビは添削で指摘しません。'),
      readings.length ? h('div', { class: 'reading-list' }, readings.map((r) => h('button', {
        type: 'button', class: 'reading-row', title: '本文に挿入', onclick: () => insertText('|' + r.base + '《' + r.reading + '》'),
      }, h('span', { html: T.rubyToHtml('|' + r.base + '《' + r.reading + '》', { vertical: false }) }), h('span', { class: 'muted small' }, r.source === 'lore' ? '設定資料' : 'アイデア帳')))) : null,
      btn('アイデア帳を開く', { small: true, ghost: true, icon: 'bulb', onClick: () => App().navigate('ideas') }));
    // 伏線（アイデア帳の種類「伏線」）
    const fs = p.ideas.filter((i) => i.kind === '伏線');
    const here = fs.filter((i) => i.plantedIn === S.ch.id || i.payoffIn === S.ch.id);
    const open = fs.filter((i) => !i.resolved);
    const chNo = (id) => { const k = p.chapters.findIndex((c) => c.id === id); return k < 0 ? '' : `第${k + 1}話`; };
    const fsRow = (i) => h('div', { class: 'fs-item' },
      h('label', { class: 'check small', title: '回収済みにする' }, h('input', {
        type: 'checkbox', checked: !!i.resolved, onchange: (e) => { i.resolved = e.target.checked; i.updatedAt = Date.now(); App().touch(); renderPanel(); },
      }), h('span', { class: i.resolved ? 'fs-done' : '' }, (i.body || '').split('\n')[0] || '（無題）')),
      h('span', { class: 'muted small' }, [i.plantedIn ? '張：' + chNo(i.plantedIn) : '', i.payoffIn ? '回収：' + chNo(i.payoffIn) : ''].filter(Boolean).join('　')));
    const fsBox = h('details', { class: 'sub-section', open: here.length > 0 },
      h('summary', null, `伏線　この話 ${here.length}・未回収 ${open.length}`),
      here.length ? h('div', { class: 'stack-sm' }, h('div', { class: 'small muted' }, 'この話で張る・回収する伏線'), here.map(fsRow)) : null,
      open.filter((i) => here.indexOf(i) < 0).length ? h('div', { class: 'stack-sm' }, h('div', { class: 'small muted' }, 'ほかの未回収の伏線'), open.filter((i) => here.indexOf(i) < 0).slice(0, 20).map(fsRow)) : null,
      !fs.length ? h('p', { class: 'small muted' }, 'アイデア帳で種類「伏線」としてメモし、張った話・回収する話を選ぶと、ここで確認できます。') : null,
      btn('アイデア帳を開く', { small: true, ghost: true, icon: 'bulb', onClick: () => App().navigate('ideas') }));
    return h('div', { class: 'stack-sm' }, h('h3', { class: 'panel-h' }, 'この話のメモ'), memo, fsBox, h('h3', { class: 'panel-h' }, '設定資料'), search, results, readingBox);
  }

  function panelStats() {
    const p = P();
    const st = T.stats(S.textarea.value);
    let total = 0;
    const rows = p.chapters.map((c, i) => {
      const n = countOf(c, c.id === S.ch.id ? S.textarea.value : c.body);
      total += n;
      return { i, c, n };
    });
    const pct = (v) => Math.round(v * 100) + '%';
    const goalTotal = p.goal.total || 0;
    const days = Object.keys(p.log).sort().slice(-14);
    const maxDay = Math.max(1, ...days.map((d) => Math.max(0, p.log[d].last - p.log[d].start)));
    const goalInput = (key, label) => UI.field(label, h('input', {
      class: 'input input-num', type: 'number', min: 0, step: 100, value: p.goal[key],
      onchange: (e) => { p.goal[key] = Math.max(0, parseInt(e.target.value, 10) || 0); App().touch(); renderStatus(); renderPanel(); },
    }));
    return h('div', { class: 'stack-sm' },
      h('h3', { class: 'panel-h' }, 'この話'),
      h('dl', { class: 'stat-grid' },
        stat('文字数（空白除く）', UI.fmtNum(st.charsNoSpace) + '字'),
        stat('原稿用紙換算', st.pages + '枚'),
        stat('会話文の割合', pct(st.dialogueRatio)),
        stat('漢字の割合', pct(st.kanjiRatio)),
        stat('文の数', UI.fmtNum(st.sentences)),
        stat('平均の文の長さ', st.avgSentence.toFixed(1) + '字'),
        stat('段落数', UI.fmtNum(st.paragraphs)),
        stat('読了目安', Math.max(1, Math.round(st.readingMinutes)) + '分')),
      h('p', { class: 'small muted' }, '漢字の割合は3割前後が読みやすいと言われます。'),
      h('h3', { class: 'panel-h' }, '作品全体'),
      h('div', { class: 'goal' },
        h('div', { class: 'goal-row' }, h('span', null, UI.fmtNum(total) + '字'), goalTotal ? h('span', { class: 'muted small' }, '目標 ' + UI.fmtNum(goalTotal) + '字') : null),
        goalTotal ? h('div', { class: 'meter big' }, h('span', { style: { width: Math.min(100, (total / goalTotal) * 100) + '%' } })) : null),
      h('div', { class: 'grid-2' }, goalInput('daily', '1日の目標（字）'), goalInput('total', '作品の目標（字）')),
      days.length ? h('div', null,
        h('h3', { class: 'panel-h' }, '最近の執筆量'),
        h('div', { class: 'day-bars', role: 'img', 'aria-label': '日ごとの執筆文字数' }, days.map((d) => {
          const v = Math.max(0, p.log[d].last - p.log[d].start);
          return h('div', { class: 'day-bar', title: d + '：' + UI.fmtNum(v) + '字' },
            h('span', { class: 'day-bar-fill', style: { height: Math.round((v / maxDay) * 100) + '%' } }),
            h('span', { class: 'day-bar-label' }, d.slice(8)));
        }))) : null,
      h('h3', { class: 'panel-h' }, '話ごとの文字数'),
      h('table', { class: 'mini-table' }, h('tbody', null, rows.map((r) => h('tr', { class: r.c.id === S.ch.id ? 'current' : '' },
        h('td', null, r.i + 1), h('td', null, r.c.title), h('td', { class: 'num' }, UI.fmtNum(r.n)))))));
  }

  function stat(label, value) {
    return h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, value));
  }

  NS.Views.write = V;
})(window.Tsuzuri = window.Tsuzuri || {});
