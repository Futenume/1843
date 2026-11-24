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
    return mode;
  }

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

  /** 古いデータや欠けた項目を補う */
  function normalize(p) {
    p.version = 1;
    p.title = p.title || '無題の作品';
    p.author = p.author || '';
    p.synopsis = p.synopsis || '';
    p.chapters = Array.isArray(p.chapters) && p.chapters.length ? p.chapters : [newChapter('第一話')];
    p.chapters.forEach((c) => {
      c.id = c.id || UI.uid('ch');
      c.title = c.title == null ? '無題' : c.title;
      c.body = c.body || '';
      c.memo = c.memo || '';
      c.ignored = Array.isArray(c.ignored) ? c.ignored : [];
      c.snapshots = Array.isArray(c.snapshots) ? c.snapshots : [];
    });
    p.entries = Array.isArray(p.entries) ? p.entries : [];
    p.entries.forEach((e) => {
      e.id = e.id || UI.uid('e');
      e.type = e.type || 'character';
      e.aliases = Array.isArray(e.aliases) ? e.aliases : [];
      e.fields = e.fields || {};
      e.custom = Array.isArray(e.custom) ? e.custom : [];
      e.relations = Array.isArray(e.relations) ? e.relations : [];
      e.appear = e.appear || {};
      e.notes = e.notes || '';
    });
    p.rules = p.rules || {};
    p.rules.ng = Array.isArray(p.rules.ng) ? p.rules.ng : [];
    p.rules.style = Array.isArray(p.rules.style) ? p.rules.style : [];
    p.rules.world = p.rules.world || '';
    p.timeline = Array.isArray(p.timeline) ? p.timeline : [];
    p.ideas = Array.isArray(p.ideas) ? p.ideas : [];
    p.plot = p.plot || {};
    p.plot.columns = Array.isArray(p.plot.columns) && p.plot.columns.length ? p.plot.columns
      : ['起', '承', '転', '結'].map((t) => ({ id: UI.uid('col'), title: t }));
    p.plot.cards = Array.isArray(p.plot.cards) ? p.plot.cards : [];
    p.maps = Array.isArray(p.maps) ? p.maps : [];
    p.log = p.log || {};
    p.goal = p.goal || {};
    if (p.goal.daily == null) p.goal.daily = 2000;
    if (p.goal.total == null) p.goal.total = 100000;
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

  async function deleteProject(id) {
    await del('project:' + id);
    const list = ((await get('projects')) || []).filter((x) => x.id !== id);
    await set('projects', list);
  }

  /** 作品をまるごと複製して新しい ID で取り込む */
  async function importProject(data) {
    const p = normalize(JSON.parse(JSON.stringify(data)));
    const list = (await get('projects')) || [];
    if (list.some((x) => x.id === p.id)) {
      p.id = UI.uid('p');
      p.title = p.title + '（読み込み）';
    }
    await saveProject(p);
    return p;
  }

  NS.Store = {
    init, get, set, del, get mode() { return mode; },
    newProject, newChapter, normalize, listProjects, loadProject, saveProject, deleteProject, importProject, totalChars,
  };
})(window.Tsuzuri = window.Tsuzuri || {});
