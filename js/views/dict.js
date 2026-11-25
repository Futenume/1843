/*
 * 綴り — 辞書（調べたいことをすぐ調べる）
 * 作品の中（設定資料・読み方・アイデア・本文）、創作辞典（オフライン）、
 * ネット辞書（Wikipedia の要約・ウィクショナリーの語義）、外部サイト、AI に聞く。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;
  const D = NS.DictData;

  const cache = new Map();
  const enc = encodeURIComponent;

  function P() { return NS.App && NS.App.project; }

  // ───── ネット辞書 ─────
  async function fetchJSON(url, signal) {
    const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function safeUrl(u, host) {
    try {
      const x = new URL(String(u || ''));
      return x.protocol === 'https:' && x.hostname === host ? x.href : '';
    } catch (e) { return ''; }
  }

  async function wikipedia(q, signal) {
    const s = await fetchJSON(`https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc(q)}&srlimit=3&format=json&origin=*`, signal);
    const hits = (s.query && s.query.search) || [];
    if (!hits.length) return null;
    const exact = hits.find((x) => x.title === q) || hits[0];
    const sum = await fetchJSON(`https://ja.wikipedia.org/api/rest_v1/page/summary/${enc(exact.title)}`, signal);
    // ネットから来た URL は、決まった場所の https だけを使う（javascript: などは使わない）
    const pageUrl = sum.content_urls && sum.content_urls.desktop && sum.content_urls.desktop.page;
    const thumb = sum.thumbnail && sum.thumbnail.source;
    return {
      title: String(sum.title || exact.title), extract: String(sum.extract || ''),
      url: safeUrl(pageUrl, 'ja.wikipedia.org') || `https://ja.wikipedia.org/wiki/${enc(String(sum.title || exact.title))}`,
      thumb: safeUrl(thumb, 'upload.wikimedia.org'), others: hits.filter((x) => x.title !== exact.title).map((x) => String(x.title)),
    };
  }

  /** ウィクショナリーの HTML から日本語の語義を取り出す */
  function parseWiktionary(html) {
    // 文字だけを取り出すので、スクリプト・画像・イベント属性などは解析の前に取り除く
    const clean = String(html || '')
      .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(img|iframe|object|embed|link|meta|source|video|audio|picture)\b[^>]*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    const h2s = Array.from(doc.querySelectorAll('h2'));
    const jp = h2s.find((x) => /^\s*日本語/.test(x.textContent));
    if (!jp) return [];
    let node = jp.closest('.mw-heading') || jp;
    const out = [];
    let pos = '';
    for (let n = node.nextElementSibling; n; n = n.nextElementSibling) {
      if (n.matches('h2') || n.matches('.mw-heading2') || n.querySelector(':scope > h2')) break;
      const heading = n.matches('h3,h4,h5') ? n : n.matches('.mw-heading') ? n.querySelector('h3,h4,h5') : null;
      if (heading) { pos = heading.textContent.replace(/\[編集\]/g, '').trim(); continue; }
      if (n.tagName === 'OL') {
        Array.from(n.children).forEach((li) => {
          const c = li.cloneNode(true);
          c.querySelectorAll('ul, dl, ol, sup, .mw-editsection, style').forEach((x) => x.remove());
          const t = c.textContent.replace(/\s+/g, ' ').trim();
          if (t && !/^(発音|語源|翻訳)/.test(pos)) out.push({ pos, text: t });
        });
      }
      if (out.length >= 8) break;
    }
    return out;
  }

  async function wiktionary(q, signal) {
    const r = await fetchJSON(`https://ja.wiktionary.org/w/api.php?action=parse&page=${enc(q)}&prop=text&format=json&origin=*&redirects=1`, signal);
    if (!r.parse || !r.parse.text) return null;
    const defs = parseWiktionary(r.parse.text['*'] || '');
    return defs.length ? { title: String(r.parse.title), defs, url: `https://ja.wiktionary.org/wiki/${enc(String(r.parse.title))}` } : null;
  }

  const LINKS = [
    ['Weblio辞書', (q) => `https://www.weblio.jp/content/${enc(q)}`],
    ['類語辞典', (q) => `https://thesaurus.weblio.jp/content/${enc(q)}`],
    ['コトバンク', (q) => `https://kotobank.jp/search?q=${enc(q)}`],
    ['Wikipedia', (q) => `https://ja.wikipedia.org/wiki/Special:Search?search=${enc(q)}`],
    ['Google', (q) => `https://www.google.com/search?q=${enc(q)}`],
    ['画像', (q) => `https://www.google.com/search?tbm=isch&q=${enc(q)}`],
  ];

  // ───── 作品の中 ─────
  function inWork(q, p) {
    if (!p || !q) return null;
    const entries = p.entries.filter((e) => (e.name || '').indexOf(q) >= 0 || (e.reading || '').indexOf(q) >= 0 || (e.aliases || []).some((a) => String(a).indexOf(q) >= 0) || (q.length >= 2 && Object.values(e.fields || {}).some((v) => typeof v === 'string' && v.indexOf(q) >= 0)));
    const readings = NS.Readings ? NS.Readings.collect(p).filter((r) => r.base.indexOf(q) >= 0 || NS.Readings.normReading(r.reading).indexOf(NS.Readings.normReading(q)) >= 0) : [];
    const ideas = p.ideas.filter((i) => ((i.body || '') + ' ' + (i.word || '') + ' ' + (i.reading || '')).indexOf(q) >= 0).slice(0, 6);
    const chapters = [];
    p.chapters.forEach((c, i) => {
      const text = c.body || '';
      let n = 0;
      let k = text.indexOf(q);
      const first = k;
      while (k >= 0) { n++; k = text.indexOf(q, k + q.length); }
      if (n) chapters.push({ c, i, n, first });
    });
    return { entries, readings, ideas, chapters };
  }

  /**
   * 辞書の画面を作る。
   * opts: { query, onInsert(text), onJump(chapterId, start, end), compact }
   */
  function render(opts) {
    opts = opts || {};
    const root = h('div', { class: 'dict' + (opts.compact ? ' dict-compact' : '') });
    let controller = null;
    let browseCat = D.CATEGORIES[0].id;
    const input = h('input', { class: 'input', type: 'search', value: opts.query || '', placeholder: '調べたい言葉', 'aria-label': '調べたい言葉' });
    const out = h('div', { class: 'dict-results' });
    const go = () => run(input.value.trim());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } });
    root.append(h('div', { class: 'row dict-search' }, input, btn('調べる', { icon: 'search', primary: true, small: true, onClick: go })), out);

    const section = (title, ...children) => h('section', { class: 'dict-section' }, h('h3', { class: 'panel-h' }, title), ...children);

    function insertBtn(text) {
      if (!opts.onInsert) return null;
      return btn('', { icon: 'pen', ghost: true, small: true, title: `「${text}」を本文に入れる`, onClick: () => opts.onInsert(text) });
    }

    function itemView(it, cat) {
      const chips = it.s ? h('div', { class: 'chips' }, it.s.map((x) => h('button', {
        type: 'button', class: 'chip', title: opts.onInsert ? '本文に入れる（選択中の語と置き換え）' : '', onclick: () => { if (opts.onInsert) opts.onInsert(x); else run(x); },
      }, x))) : null;
      return h('div', { class: 'dict-item' },
        h('div', { class: 'dict-item-head' },
          it.c ? h('span', { class: 'dict-swatch', style: { background: it.c }, title: it.c }) : null,
          h('strong', null, it.w), h('span', { class: 'muted small' }, it.r), it.c ? h('span', { class: 'muted small mono' }, it.c) : null,
          h('span', { class: 'dict-spacer' }), insertBtn(it.w)),
        it.s ? h('div', { class: 'small muted' }, '言い換えの候補') : h('div', { class: 'small' }, it.m),
        chips);
    }

    function browse() {
      clear(out);
      const cat = D.CATEGORIES.find((c) => c.id === browseCat) || D.CATEGORIES[0];
      out.append(
        h('p', { class: 'small muted' }, '言葉を入れて「調べる」を押すと、作品の中・創作辞典・ネット辞書をまとめて調べます。下は創作辞典の一覧です。'),
        h('div', { class: 'chips' }, D.CATEGORIES.map((c) => h('button', {
          type: 'button', class: 'chip' + (c.id === cat.id ? ' active' : ''), onclick: () => { browseCat = c.id; browse(); },
        }, c.label))),
        h('div', { class: 'dict-list' }, cat.items.map((it) => itemView(it, cat))));
    }

    function run(q) {
      if (controller) controller.abort();
      controller = null;
      input.value = q;
      if (!q) { browse(); return; }
      clear(out);
      const p = P();
      // 作品の中
      const w = inWork(q, p);
      if (w && (w.entries.length || w.readings.length || w.ideas.length || w.chapters.length)) {
        const parts = [];
        w.entries.forEach((e) => parts.push(h('details', { class: 'ref-item', open: w.entries.length === 1 },
          h('summary', null, h('span', { class: 'type-badge t-' + e.type }, NS.Lore.TYPE_LABEL[e.type]), h('strong', null, e.name), e.reading ? h('span', { class: 'muted small' }, ' ' + e.reading) : null),
          h('div', { class: 'ref-body' }, NS.Lore.summaryList(e, p), btn('設定資料を開く', { small: true, ghost: true, onClick: () => NS.App.navigate('lore', { id: e.id }) })))));
        if (w.readings.length) {
          parts.push(h('div', { class: 'dict-item' }, h('div', { class: 'small muted' }, '登録した読み方'),
            h('div', { class: 'reading-list' }, w.readings.map((r) => h('div', { class: 'reading-row static', html: NS.Text.rubyToHtml('|' + r.base + '《' + r.reading + '》', { vertical: false }) })))));
        }
        w.ideas.forEach((i) => parts.push(h('div', { class: 'dict-item' }, h('div', { class: 'small muted' }, 'アイデア帳・' + (i.kind || 'アイデア')), h('div', { class: 'small' }, (i.word ? i.word + '《' + (i.reading || '') + '》 ' : '') + (i.body || '').split('\n')[0]))));
        if (w.chapters.length) {
          parts.push(h('div', { class: 'dict-item' }, h('div', { class: 'small muted' }, `本文での使用（全${w.chapters.reduce((a, x) => a + x.n, 0)}回）`),
            h('div', { class: 'chips' }, w.chapters.slice(0, 30).map((x) => h('button', {
              type: 'button', class: 'chip', onclick: () => { if (opts.onJump) opts.onJump(x.c.id, x.first, x.first + q.length); },
            }, `第${x.i + 1}話 ${x.n}回`)))));
        }
        out.appendChild(section('作品の中', ...parts));
      }
      // 創作辞典
      const local = D.search(q);
      if (local.length) {
        out.appendChild(section('創作辞典', ...local.map(({ cat, items }) => h('div', { class: 'dict-cat' },
          h('div', { class: 'small muted' }, cat.label), items.slice(0, 12).map((it) => itemView(it, cat))))));
      }
      // ネット辞書
      const netBox = h('div', { class: 'dict-net' });
      out.appendChild(section('ネット辞書', netBox,
        h('p', { class: 'small muted' }, '入力した言葉だけが Wikipedia／ウィクショナリー（ウィキメディア財団）に送られます。')));
      loadNet(q, netBox);
      // 外部サイト
      out.appendChild(section('ほかのサイトで調べる', h('div', { class: 'row wrap' }, LINKS.map(([label, url]) => h('a', {
        class: 'btn btn-sm', href: url(q), target: '_blank', rel: 'noopener noreferrer',
      }, label)))));
      // AI
      const aiBox = h('div', { class: 'dict-ai' });
      const hasKey = NS.AI && NS.AI.getKey && NS.AI.getKey();
      out.appendChild(section('AIに聞く', hasKey
        ? h('div', { class: 'stack-sm' }, btn(`「${q}」の意味・例文・言い換えを聞く`, { icon: 'sparkles', small: true, onClick: () => askAI(q, aiBox) }), aiBox)
        : h('p', { class: 'small muted' }, '設定 → AI で APIキーを入れると、Claude に意味や例文、言い換えを聞けます。')));
    }

    function loadNet(q, box) {
      clear(box);
      const key = q;
      const show = (res) => {
        clear(box);
        const { wp, wk, error } = res;
        if (wk) {
          box.appendChild(h('div', { class: 'dict-card' },
            h('div', { class: 'dict-card-head' }, h('strong', null, wk.title), h('span', { class: 'muted small' }, 'ウィクショナリー'), h('a', { href: wk.url, target: '_blank', rel: 'noopener noreferrer', class: 'small' }, '開く')),
            h('ol', { class: 'dict-defs' }, wk.defs.map((d) => h('li', null, d.pos ? h('span', { class: 'dict-pos' }, d.pos) : null, d.text)))));
        }
        if (wp) {
          box.appendChild(h('div', { class: 'dict-card' },
            h('div', { class: 'dict-card-head' }, h('strong', null, wp.title), h('span', { class: 'muted small' }, 'Wikipedia'), h('a', { href: wp.url, target: '_blank', rel: 'noopener noreferrer', class: 'small' }, '開く')),
            h('div', { class: 'dict-wp' }, wp.thumb ? h('img', { src: wp.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null, h('p', null, wp.extract)),
            wp.others && wp.others.length ? h('div', { class: 'chips' }, h('span', { class: 'small muted' }, 'ほかの候補：'), wp.others.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => run(t) }, t))) : null));
        }
        if (!wk && !wp) box.appendChild(h('p', { class: 'small muted' }, error ? 'ネット辞書に接続できませんでした（オフラインか、通信が制限されています）。' : '見つかりませんでした。'));
      };
      if (cache.has(key)) { show(cache.get(key)); return; }
      box.appendChild(h('div', { class: 'row small muted' }, h('span', { class: 'spinner' }), '調べています…'));
      controller = new AbortController();
      const signal = controller.signal;
      Promise.allSettled([wikipedia(q, signal), wiktionary(q, signal)]).then(([a, b]) => {
        if (signal.aborted) return;
        const res = {
          wp: a.status === 'fulfilled' ? a.value : null,
          wk: b.status === 'fulfilled' ? b.value : null,
          error: a.status === 'rejected' && b.status === 'rejected',
        };
        if (!res.error) cache.set(key, res);
        show(res);
      });
    }

    async function askAI(q, box) {
      clear(box);
      const ans = h('div', { class: 'ai-answer' });
      box.append(h('div', { class: 'row small muted' }, h('span', { class: 'spinner' }), '考えています…'), ans);
      try {
        const text = await NS.AI.askWord(P(), q, null, (snap) => { ans.textContent = snap; });
        clear(box);
        ans.textContent = text;
        box.appendChild(ans);
      } catch (e) {
        clear(box);
        box.appendChild(h('p', { class: 'small', style: { color: 'var(--danger)' } }, e.message));
      }
    }

    run(opts.query ? String(opts.query).trim() : '');
    setTimeout(() => { if (!opts.query) input.focus(); }, 30);
    root.search = run;
    return root;
  }

  function openModal(q) {
    const view = render({
      query: q,
      onJump: (chapterId, start, end) => {
        close();
        NS.App.navigate('write', { id: chapterId });
        setTimeout(() => NS.Views.write.focusRange && NS.Views.write.focusRange(start, end), 80);
      },
    });
    const close = UI.modal({ title: '辞書', body: view, wide: true });
  }

  NS.Dict = { render, openModal, parseWiktionary, wikipedia, wiktionary };
})(window.Tsuzuri = window.Tsuzuri || {});
