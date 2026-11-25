/*
 * 綴り — 保存（IndexedDB。使えない環境では localStorage → メモリの順にフォールバック）
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const DB_NAME = 'tsuzuri';
  const STORE = 'kv';
  const mem = new Map();
  let db = null;
  let mode = 'mem';

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('no idb')); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  }

  async function init() {
    try {
      db = await openDB();
      mode = 'idb';
    } catch (e) {
      try {
        localStorage.setItem('tsuzuri.__probe', '1');
        localStorage.removeItem('tsuzuri.__probe');
        mode = 'ls';
      } catch (e2) {
        mode = 'mem';
      }
    }
    // ブラウザの空き容量が少ないときに、作品データが自動で消されないよう頼む
    // （Firefox では確認が出るので、返事を待たずに起動を続ける）
    try {
      if (mode !== 'mem' && navigator.storage && navigator.storage.persist) {
        const ask = () => navigator.storage.persist().then((v) => { persisted = !!v; }, () => {});
        if (navigator.storage.persisted) navigator.storage.persisted().then((v) => { persisted = !!v; if (!v) ask(); }, () => {});
        else ask();
      }
    } catch (e) { persisted = false; }
    return mode;
  }
  let persisted = false;

  function tx(kind, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, kind);
      const st = t.objectStore(STORE);
      const req = fn(st);
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function get(key) {
    if (mode === 'idb') return tx('readonly', (st) => st.get(key));
    if (mode === 'ls') {
      try { const v = localStorage.getItem('tsuzuri.kv.' + key); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; }
    }
    return mem.has(key) ? JSON.parse(mem.get(key)) : undefined;
  }

  async function set(key, value) {
    if (mode === 'idb') return tx('readwrite', (st) => st.put(value, key));
    const json = JSON.stringify(value);
    if (mode === 'ls') { localStorage.setItem('tsuzuri.kv.' + key, json); return; }
    mem.set(key, json);
  }

  async function del(key) {
    if (mode === 'idb') return tx('readwrite', (st) => st.delete(key));
    if (mode === 'ls') { localStorage.removeItem('tsuzuri.kv.' + key); return; }
    mem.delete(key);
  }

  function newChapter(title, body) {
    return { id: UI.uid('ch'), title: title || '新しい話', body: body || '', memo: '', ignored: [], snapshots: [], updatedAt: Date.now() };
  }

  function newProject(title) {
    const now = Date.now();
    return normalize({
      id: UI.uid('p'),
      title: title || '無題の作品',
      createdAt: now,
      updatedAt: now,
      chapters: [newChapter('第一話')],
    });
  }

  // ───── 読み込んだデータの安全確認 ─────
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  /** JSON の値だけを深くコピーし、危ないキー（__proto__ など）を取り除く */
  function sanitize(v, depth) {
    depth = depth || 0;
    if (depth > 60) return null;
    if (Array.isArray(v)) return v.map((x) => sanitize(x, depth + 1));
    if (v && typeof v === 'object') {
      const o = {};
      Object.keys(v).forEach((k) => { if (!BAD_KEYS.has(k)) o[k] = sanitize(v[k], depth + 1); });
      return o;
    }
    if (typeof v === 'number' && !Number.isFinite(v)) return 0;
    if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') return null;
    return v;
  }
  const str = (v, d) => (v == null ? (d || '') : typeof v === 'string' ? v : String(v));
  const color = (c) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : '');
  const okId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  const TRASH_DAYS = 30;
  function normChapter(c) {
    c.id = okId(c.id) ? c.id : UI.uid('ch');
    c.title = c.title == null ? '無題' : str(c.title);
    c.body = str(c.body);
    c.memo = str(c.memo);
    c.snapshots = arr(c.snapshots).filter((x) => x && typeof x === 'object').map((x) => Object.assign(x, { body: str(x.body), label: str(x.label) }));
    c.ignored = arr(c.ignored).map((x) => str(x));
    c.narrator = ['first', 'third', 'omniscient'].includes(c.narrator) ? c.narrator : ''; // 空なら作品の設定に従う
    return c;
  }

  /** 古いデータや欠けた項目を補い、型をそろえる */
  function normalize(p) {
    p.version = 1;
    if (!okId(p.id)) p.id = UI.uid('p');
    p.title = str(p.title) || '無題の作品';
    p.author = str(p.author);
    p.synopsis = str(p.synopsis);
    p.chapters = arr(p.chapters).filter((c) => c && typeof c === 'object');
    if (!p.chapters.length) p.chapters = [newChapter('第一話')];
    p.chapters.forEach(normChapter);
    // ごみ箱（消した話。30日・30件まで）
    const limit = Date.now() - TRASH_DAYS * 86400000;
    p.trash = arr(p.trash).filter((t) => t && typeof t === 'object' && t.chapter && typeof t.chapter === 'object')
      .map((t) => ({ at: Number.isFinite(+t.at) ? +t.at : Date.now(), pos: Number.isFinite(+t.pos) ? Math.max(0, Math.round(+t.pos)) : 0, chapter: normChapter(t.chapter) }))
      .filter((t) => t.at >= limit).slice(-30);
    p.entries = arr(p.entries).filter((e) => e && typeof e === 'object');
    p.entries.forEach((e) => {
      e.id = okId(e.id) ? e.id : UI.uid('e');
      e.type = ['character', 'place', 'term', 'org'].includes(e.type) ? e.type : 'character';
      e.name = str(e.name);
      e.reading = str(e.reading);
      e.color = color(e.color);
      e.aliases = arr(e.aliases).map((a) => str(a)).filter(Boolean);
      e.fields = obj(e.fields);
      Object.keys(e.fields).forEach((k) => { if (typeof e.fields[k] !== 'string') e.fields[k] = str(e.fields[k]); });
      e.custom = arr(e.custom).filter((x) => x && typeof x === 'object').map((x) => ({ k: str(x.k), v: str(x.v) }));
      e.relations = arr(e.relations).filter((r) => r && typeof r === 'object').map((r) => Object.assign(r, { targetId: str(r.targetId), calls: str(r.calls), note: str(r.note) }, r.kind != null ? { kind: str(r.kind) } : {}));
      e.appear = obj(e.appear);
      e.notes = str(e.notes);
    });
    p.rules = obj(p.rules);
    p.rules.ng = arr(p.rules.ng).filter((r) => r && typeof r === 'object')
      .map((r) => ({ word: str(r.word), reason: str(r.reason), suggestion: str(r.suggestion), scope: ['auto', 'all', 'dialogue'].includes(r.scope) ? r.scope : 'auto' }));
    p.rules.style = arr(p.rules.style).filter((r) => r && typeof r === 'object').map((r) => ({ from: str(r.from), to: str(r.to) }));
    p.rules.world = str(p.rules.world);
    p.rules.narrator = ['auto', 'first', 'third', 'omniscient'].includes(p.rules.narrator) ? p.rules.narrator : 'auto';
    p.timeline = arr(p.timeline).filter((t) => t && typeof t === 'object');
    p.timeline.forEach((t) => { t.when = str(t.when); t.title = str(t.title); t.desc = str(t.desc); });
    p.ideas = arr(p.ideas).filter((i) => i && typeof i === 'object');
    p.ideas.forEach((i) => {
      if (!okId(i.id)) i.id = UI.uid('i');
      i.body = str(i.body);
      i.kind = str(i.kind) || 'アイデア';
      i.tags = arr(i.tags).map((t) => str(t)).filter(Boolean);
      i.color = color(i.color);
      if (i.word != null) i.word = str(i.word);
      if (i.reading != null) i.reading = str(i.reading);
    });
    p.plot = obj(p.plot);
    p.plot.columns = arr(p.plot.columns).filter((c) => c && typeof c === 'object' && okId(c.id));
    p.plot.columns.forEach((c) => { c.title = str(c.title); });
    if (!p.plot.columns.length) p.plot.columns = ['起', '承', '転', '結'].map((t) => ({ id: UI.uid('col'), title: t }));
    p.plot.cards = arr(p.plot.cards).filter((c) => c && typeof c === 'object');
    p.plot.cards.forEach((c) => { c.title = str(c.title); c.body = str(c.body); c.color = color(c.color); });
    p.maps = arr(p.maps).filter((m) => m && typeof m === 'object' && okId(m.id));
    p.maps.forEach((m) => {
      m.name = str(m.name) || '地図';
      arr(m.areas).forEach((a) => { if (a && typeof a === 'object') a.color = color(a.color) || '#8c3b5e'; });
    });
    p.log = obj(p.log);
    p.goal = obj(p.goal);
    p.goal.daily = Number.isFinite(+p.goal.daily) && p.goal.daily !== null && p.goal.daily !== '' ? Math.max(0, +p.goal.daily) : 2000;
    p.goal.total = Number.isFinite(+p.goal.total) && p.goal.total !== null && p.goal.total !== '' ? Math.max(0, +p.goal.total) : 100000;
    return p;
  }

  function totalChars(p) {
    let n = 0;
    p.chapters.forEach((c) => { n += NS.Text.stats(c.body).charsNoSpace; });
    return n;
  }

  async function listProjects() {
    const list = (await get('projects')) || [];
    return list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async function loadProject(id) {
    const p = await get('project:' + id);
    return p ? normalize(p) : null;
  }

  async function saveProject(p) {
    p.updatedAt = Date.now();
    await set('project:' + p.id, JSON.parse(JSON.stringify(p)));
    const list = (await get('projects')) || [];
    const meta = { id: p.id, title: p.title, updatedAt: p.updatedAt, chars: totalChars(p), chapters: p.chapters.length };
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = meta; else list.push(meta);
    await set('projects', list);
  }

  /** 作品を消す（ごみ箱へ移す。30日たつと自動で消える） */
  async function deleteProject(id) {
    const data = await get('project:' + id);
    const list0 = (await get('projects')) || [];
    const meta = list0.find((x) => x.id === id);
    if (data) {
      await set('trash:' + id, data);
      const tl = ((await get('trashProjects')) || []).filter((x) => x.id !== id);
      tl.push({ id, title: (meta && meta.title) || data.title || '無題', chars: (meta && meta.chars) || 0, deletedAt: Date.now() });
      await set('trashProjects', tl);
    }
    await del('project:' + id);
    await set('projects', list0.filter((x) => x.id !== id));
  }

  /** ごみ箱の作品（古いものはここで消す） */
  async function listTrash() {
    const tl = (await get('trashProjects')) || [];
    const limit = Date.now() - TRASH_DAYS * 86400000;
    const keep = [];
    for (const t of tl) {
      if (!t || typeof t !== 'object' || !okId(t.id)) continue;
      if ((+t.deletedAt || 0) < limit) await del('trash:' + t.id);
      else keep.push(t);
    }
    if (keep.length !== tl.length) await set('trashProjects', keep);
    return keep.slice().sort((a, b) => b.deletedAt - a.deletedAt);
  }

  async function restoreProject(id) {
    const data = await get('trash:' + id);
    if (!data) throw new Error('ごみ箱に見つかりません');
    const p = normalize(data);
    const list = (await get('projects')) || [];
    if (list.some((x) => x.id === p.id)) { p.id = UI.uid('p'); p.title += '（復元）'; }
    await saveProject(p);
    await purgeProject(id);
    return p;
  }

  async function purgeProject(id) {
    await del('trash:' + id);
    await set('trashProjects', ((await get('trashProjects')) || []).filter((x) => x.id !== id));
  }

  /** 作品をまるごと複製して新しい ID で取り込む */
  async function importProject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('作品データの形式が正しくありません');
    const p = normalize(sanitize(data));
    const list = (await get('projects')) || [];
    if (list.some((x) => x.id === p.id)) {
      p.id = UI.uid('p');
      p.title = p.title + '（読み込み）';
    }
    await saveProject(p);
    return p;
  }

  NS.Store = {
    init, get, set, del, get mode() { return mode; }, get persisted() { return persisted; },
    newProject, newChapter, normalize, sanitize, listProjects, loadProject, saveProject, deleteProject, importProject, totalChars,
    listTrash, restoreProject, purgeProject, TRASH_DAYS,
  };
})(window.Tsuzuri = window.Tsuzuri || {});
