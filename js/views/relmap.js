/*
 * 綴り — キャラ相関図
 * 設定資料の人物と「関係・呼び方」から相関図を描く。ドラッグで配置、線を引いて関係を追加、
 * 線をクリックして編集、自動配置、組織の表示、PNG 書き出し。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;
  const SVGNS = 'http://www.w3.org/2000/svg';

  const KINDS = [
    { id: 'family', label: '家族', color: '#2a9d8f', dash: '' },
    { id: 'love', label: '恋人・想い', color: '#d6456b', dash: '' },
    { id: 'friend', label: '友人・仲間', color: '#3d7ea6', dash: '' },
    { id: 'mentor', label: '師弟', color: '#7f5539', dash: '' },
    { id: 'lord', label: '主従', color: '#6a4f9a', dash: '' },
    { id: 'colleague', label: '同僚・所属', color: '#6c757d', dash: '4 3' },
    { id: 'rival', label: 'ライバル', color: '#d9a441', dash: '8 4' },
    { id: 'enemy', label: '敵対', color: '#c0392b', dash: '6 3 1.5 3' },
    { id: 'other', label: 'その他', color: '#8a8177', dash: '2 3' },
  ];
  const KIND = {};
  KINDS.forEach((k) => { KIND[k.id] = k; });

  /** メモから種類を推測（古いデータ用） */
  function guessKind(note) {
    const n = String(note || '');
    if (/父|母|兄|姉|弟|妹|祖|叔|伯|娘|息子|夫|妻|家族|親子|兄弟|姉妹|従/.test(n)) return 'family';
    if (/恋|想い|片思い|婚約|好き|愛/.test(n)) return 'love';
    if (/師|弟子/.test(n)) return 'mentor';
    if (/主|従者|部下|上司|臣|仕え/.test(n)) return 'lord';
    if (/敵|仇|宿敵|対立/.test(n)) return 'enemy';
    if (/ライバル|好敵手/.test(n)) return 'rival';
    if (/同僚|所属|仲間|戦友/.test(n)) return 'colleague';
    if (/友|幼なじみ|親友|相棒/.test(n)) return 'friend';
    return 'other';
  }
  function kindOf(rel) { return KIND[rel.kind] || KIND[guessKind(rel.note)]; }

  function P() { return NS.App.project; }
  function touch() { NS.App.touch(); }

  function el(tag, attrs, ...children) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
    children.forEach((c) => { if (c) e.appendChild(c); });
    return e;
  }

  let R = null;

  /** 設定資料の中に相関図を描く */
  function mount(container) {
    const p = P();
    p.relmap = p.relmap || {};
    p.relmap.pos = p.relmap.pos || {};
    if (p.relmap.showCalls == null) p.relmap.showCalls = true;
    R = { container, view: { x: 0, y: 0, k: 1 }, connect: false, drag: null, selected: null };
    build();
  }

  function nodes() {
    const p = P();
    return p.entries.filter((e) => e.type === 'character' || (p.relmap.showOrgs && e.type === 'org'));
  }

  function edges() {
    const p = P();
    const ids = new Set(nodes().map((n) => n.id));
    const out = [];
    p.entries.forEach((e) => {
      if (e.type !== 'character' || !ids.has(e.id)) return;
      e.relations.forEach((rel, i) => {
        if (!rel.targetId || !ids.has(rel.targetId) || rel.targetId === e.id) return;
        out.push({ from: e.id, to: rel.targetId, rel, index: i, owner: e });
      });
    });
    if (p.relmap.showOrgs) {
      p.entries.filter((o) => o.type === 'org').forEach((o) => {
        if (o.fields.leader && ids.has(o.fields.leader)) out.push({ from: o.fields.leader, to: o.id, org: true, label: '代表' });
        const members = String(o.fields.members || '');
        p.entries.filter((c) => c.type === 'character' && c.id !== o.fields.leader).forEach((c) => {
          const forms = [c.name.replace(/[\s　]/g, '')].concat(c.aliases, c.name.split(/[\s　・]/).filter((x) => x.length >= 2));
          if (forms.some((f) => f && members.indexOf(f) >= 0)) out.push({ from: c.id, to: o.id, org: true, label: '所属' });
        });
      });
    }
    return out;
  }

  function ensurePositions() {
    const p = P();
    const list = nodes();
    const missing = list.filter((n) => !p.relmap.pos[n.id]);
    if (!missing.length) return;
    const n = list.length;
    list.forEach((nd, i) => {
      if (p.relmap.pos[nd.id]) return;
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      p.relmap.pos[nd.id] = [Math.cos(a) * 220 + (Math.random() - 0.5) * 20, Math.sin(a) * 160 + (Math.random() - 0.5) * 20];
    });
    if (missing.length === list.length) layout(true);
  }

  /** ばねモデルで自動配置（関係のある人物は約200px、ない人物は離して並べる） */
  function computeLayout(ids, pairs, init) {
    const pos = {};
    ids.forEach((id, i) => { pos[id] = init[id] ? init[id].slice() : [Math.cos(i * 2.4) * 200, Math.sin(i * 2.4) * 150]; });
    const L = 210;
    const REP = 260000;
    const SPR = 0.06;
    const GRAV = 0.012;
    const N = 600;
    for (let it = 0; it < N; it++) {
      const t = 24 * (1 - it / N) + 0.4;
      const disp = {};
      ids.forEach((id) => { disp[id] = [0, 0]; });
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = pos[ids[i]];
          const b = pos[ids[j]];
          let dx = a[0] - b[0];
          let dy = a[1] - b[1];
          let d = Math.hypot(dx, dy);
          if (d < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = 1; }
          const f = REP / (d * d);
          disp[ids[i]][0] += (dx / d) * f; disp[ids[i]][1] += (dy / d) * f;
          disp[ids[j]][0] -= (dx / d) * f; disp[ids[j]][1] -= (dy / d) * f;
        }
      }
      pairs.forEach(([u, v]) => {
        const a = pos[u];
        const b = pos[v];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const d = Math.hypot(dx, dy) || 1;
        const f = SPR * (d - L);
        disp[u][0] += (dx / d) * f; disp[u][1] += (dy / d) * f;
        disp[v][0] -= (dx / d) * f; disp[v][1] -= (dy / d) * f;
      });
      ids.forEach((id) => {
        const d = disp[id];
        d[0] -= pos[id][0] * GRAV;
        d[1] -= pos[id][1] * GRAV * 1.4;
        const len = Math.hypot(d[0], d[1]) || 1;
        const m = Math.min(len, t);
        pos[id][0] += (d[0] / len) * m;
        pos[id][1] += (d[1] / len) * m;
      });
    }
    return pos;
  }

  function layout(silent) {
    const p = P();
    const list = nodes();
    if (!list.length) return;
    const ids = list.map((n) => n.id);
    const seen = new Set();
    const pairs = [];
    edges().forEach((e) => {
      const k = e.from < e.to ? e.from + '|' + e.to : e.to + '|' + e.from;
      if (seen.has(k) || !ids.includes(e.from) || !ids.includes(e.to)) return;
      seen.add(k);
      pairs.push([e.from, e.to]);
    });
    const pos = computeLayout(ids, pairs, silent ? p.relmap.pos : {});
    ids.forEach((id) => { p.relmap.pos[id] = [Math.round(pos[id][0]), Math.round(pos[id][1])]; });
    if (!silent) { touch(); render(); fitView(); }
  }

  function build() {
    const p = P();
    clear(R.container);
    const connectBtn = btn('線をつなぐ', { icon: 'link', small: true, title: '人物から人物へドラッグして関係を追加', onClick: () => {
      R.connect = !R.connect;
      connectBtn.classList.toggle('active', R.connect);
      R.svg.classList.toggle('connecting', R.connect);
      toast(R.connect ? '人物から人物へドラッグすると関係を追加できます' : '線をつなぐモードを終了しました');
    } });
    const toolbar = h('div', { class: 'relmap-toolbar' },
      connectBtn,
      btn('自動配置', { icon: 'dice', small: true, onClick: () => layout() }),
      btn('全体', { small: true, ghost: true, onClick: fitView }),
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!p.relmap.showOrgs, onchange: (e) => { p.relmap.showOrgs = e.target.checked; touch(); ensurePositions(); render(); } }), '組織も表示'),
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: p.relmap.showCalls !== false, onchange: (e) => { p.relmap.showCalls = e.target.checked; touch(); render(); } }), '呼び方を表示'),
      btn('PNG', { icon: 'image', small: true, title: '画像として書き出す', onClick: exportPng }));
    R.svg = el('svg', { class: 'relmap-svg', role: 'img', 'aria-label': 'キャラ相関図' });
    R.g = el('g');
    R.defs = el('defs');
    R.svg.append(R.defs, R.g);
    R.side = h('div', { class: 'relmap-side' });
    const legend = h('div', { class: 'relmap-legend' }, KINDS.map((k) => h('span', { class: 'legend-item' },
      h('span', { class: 'legend-line', style: { borderTopColor: k.color, borderTopStyle: k.dash ? 'dashed' : 'solid' } }), k.label)));
    const stage = h('div', { class: 'relmap-stage' }, R.svg, legend);
    R.container.append(h('div', { class: 'relmap' }, toolbar, h('div', { class: 'relmap-body' }, stage, R.side)));
    bind();
    ensurePositions();
    render();
    renderSide();
    requestAnimationFrame(fitView);
  }

  function markerFor(color) {
    const id = 'arrow-' + color.replace('#', '');
    if (!R.defs.querySelector('#' + id)) {
      R.defs.appendChild(el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
        el('path', { d: 'M0,0 L10,5 L0,10 z', fill: color })));
    }
    return 'url(#' + id + ')';
  }

  const NODE_R = 30;

  function render() {
    const p = P();
    clear(R.g);
    const list = nodes();
    if (!list.length) {
      R.g.appendChild(el('text', { x: 0, y: 0, 'text-anchor': 'middle', class: 'relmap-empty', text: '人物を登録すると、ここに相関図が表示されます' }));
      return;
    }
    const pos = p.relmap.pos;
    const E = edges();
    const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    const pairs = {};
    E.forEach((e) => { const k = pairKey(e.from, e.to); pairs[k] = (pairs[k] || 0) + 1; });
    const edgeLayer = el('g');
    const labelLayer = el('g');
    E.forEach((e) => {
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) return;
      const kind = e.org ? { color: '#9a8f80', dash: '3 3' } : kindOf(e.rel);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      // 双方向なら左右にふくらませる
      const both = pairs[pairKey(e.from, e.to)] > 1;
      const bend = both ? 34 : 0;
      const nx = -uy;
      const ny = ux;
      const r2 = list.find((n) => n.id === e.to && n.type === 'org') ? NODE_R + 6 : NODE_R + 4;
      const sx = a[0] + ux * (NODE_R + 4) + nx * (both ? 8 : 0);
      const sy = a[1] + uy * (NODE_R + 4) + ny * (both ? 8 : 0);
      const ex = b[0] - ux * r2 + nx * (both ? 8 : 0);
      const ey = b[1] - uy * r2 + ny * (both ? 8 : 0);
      const mx = (sx + ex) / 2 + nx * bend;
      const my = (sy + ey) / 2 + ny * bend;
      const path = `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
      const selected = R.selected && R.selected.kind === 'edge' && R.selected.from === e.from && R.selected.index === e.index;
      const hit = el('path', { d: path, class: 'relmap-edge-hit', onclick: (ev) => { ev.stopPropagation(); if (!e.org) editRelation(e.owner, e.index); } });
      const line = el('path', {
        d: path, fill: 'none', stroke: kind.color, 'stroke-width': selected ? 3.5 : 2, 'stroke-dasharray': kind.dash || null,
        'marker-end': markerFor(kind.color), class: 'relmap-edge',
      });
      edgeLayer.append(line, hit);
      // ラベル
      const lx = (sx + 2 * mx + ex) / 4;
      const ly = (sy + 2 * my + ey) / 4;
      const texts = [];
      if (e.org) texts.push({ t: e.label, cls: 'rl-note' });
      else {
        const note = e.rel.note || (e.rel.kind ? kindOf(e.rel).label : '');
        if (note) texts.push({ t: note, cls: 'rl-note' });
        if (p.relmap.showCalls !== false && e.rel.calls) texts.push({ t: '「' + e.rel.calls.split(/[\/／]/)[0] + '」', cls: 'rl-calls' });
      }
      if (texts.length) {
        const g = el('g', { class: 'relmap-label', transform: `translate(${lx},${ly})`, onclick: (ev) => { ev.stopPropagation(); if (!e.org) editRelation(e.owner, e.index); } });
        texts.forEach((x, i) => g.appendChild(el('text', { x: 0, y: (i - (texts.length - 1) / 2) * 14 + 4, 'text-anchor': 'middle', class: x.cls, fill: i === 0 ? kind.color : null, text: x.t })));
        labelLayer.appendChild(g);
      }
    });
    R.g.appendChild(edgeLayer);
    // ノード
    const nodeLayer = el('g');
    list.forEach((n) => {
      const [x, y] = pos[n.id];
      const isOrg = n.type === 'org';
      const color = n.color || (isOrg ? '#8a8177' : '#6c7a96');
      const dead = n.appear && n.appear.until;
      const sel = R.selected && R.selected.kind === 'node' && R.selected.id === n.id;
      const g = el('g', { class: 'relmap-node' + (sel ? ' selected' : '') + (dead ? ' dead' : ''), transform: `translate(${x},${y})`, 'data-id': n.id });
      if (isOrg) g.appendChild(el('rect', { x: -NODE_R - 6, y: -NODE_R * 0.7, width: (NODE_R + 6) * 2, height: NODE_R * 1.4, rx: 10, fill: color, class: 'node-shape' }));
      else g.appendChild(el('circle', { r: NODE_R, fill: color, class: 'node-shape' }));
      if (dead) g.appendChild(el('circle', { r: NODE_R + 4, fill: 'none', stroke: '#8a8177', 'stroke-dasharray': '3 3', 'stroke-width': 1.5 }));
      const initial = Array.from(n.name.replace(/[\s　]/g, ''))[0] || '？';
      g.appendChild(el('text', { x: 0, y: 7, 'text-anchor': 'middle', class: 'node-initial', text: isOrg ? n.name.slice(0, 4) : initial }));
      g.appendChild(el('text', { x: 0, y: NODE_R + (isOrg ? 4 : 18), 'text-anchor': 'middle', class: 'node-name', text: isOrg ? '' : n.name }));
      const sub = isOrg ? (n.fields.kind || '組織') : [n.fields.role, dead ? `第${n.appear.until}話で${n.appear.reason || '退場'}` : ''].filter(Boolean).join('・');
      if (sub) g.appendChild(el('text', { x: 0, y: NODE_R + (isOrg ? 18 : 33), 'text-anchor': 'middle', class: 'node-sub', text: sub }));
      nodeLayer.appendChild(g);
    });
    R.g.append(nodeLayer, labelLayer);
    applyView();
  }

  function applyView() {
    R.g.setAttribute('transform', `translate(${R.view.x},${R.view.y}) scale(${R.view.k})`);
  }

  function fitView() {
    if (!R || !R.svg) return;
    const p = P();
    const list = nodes();
    const rect = R.svg.getBoundingClientRect();
    if (!list.length || rect.width < 10) { R.view = { x: rect.width / 2, y: rect.height / 2, k: 1 }; applyView(); return; }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    list.forEach((n) => { const [x, y] = p.relmap.pos[n.id]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const pad = 90;
    const k = Math.min(1.4, Math.min(rect.width / (x1 - x0 + pad * 2), rect.height / (y1 - y0 + pad * 2)));
    R.view = { k, x: rect.width / 2 - ((x0 + x1) / 2) * k, y: rect.height / 2 - ((y0 + y1) / 2) * k };
    applyView();
  }

  function toLocal(e) {
    const r = R.svg.getBoundingClientRect();
    return { x: (e.clientX - r.left - R.view.x) / R.view.k, y: (e.clientY - r.top - R.view.y) / R.view.k, sx: e.clientX, sy: e.clientY };
  }

  function nodeAt(pt) {
    const p = P();
    let best = null;
    nodes().forEach((n) => {
      const [x, y] = p.relmap.pos[n.id];
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d <= NODE_R + 6 && (!best || d < best.d)) best = { n, d };
    });
    return best ? best.n : null;
  }

  function bind() {
    const svg = R.svg;
    const pointers = new Map();
    svg.addEventListener('pointerdown', (e) => {
      const pt = toLocal(e);
      pointers.set(e.pointerId, pt);
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        R.drag = { kind: 'pinch', d: Math.hypot(a.sx - b.sx, a.sy - b.sy), view: Object.assign({}, R.view), cx: (a.sx + b.sx) / 2, cy: (a.sy + b.sy) / 2 };
        return;
      }
      const n = nodeAt(pt);
      if (n && R.connect && n.type === 'character') {
        R.drag = { kind: 'connect', from: n, pt };
      } else if (n) {
        R.drag = { kind: 'node', id: n.id, start: pt, orig: P().relmap.pos[n.id].slice(), moved: false };
      } else {
        R.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: Object.assign({}, R.view), moved: false };
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, toLocal(e));
      const d = R.drag;
      if (!d) return;
      if (d.kind === 'pinch' && pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
        zoomAt(d.view, dist / d.d, d.cx, d.cy);
      } else if (d.kind === 'pan') {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3) d.moved = true;
        R.view.x = d.view.x + (e.clientX - d.sx);
        R.view.y = d.view.y + (e.clientY - d.sy);
        applyView();
      } else if (d.kind === 'node') {
        const pt = toLocal(e);
        if (!d.moved && Math.hypot(pt.x - d.start.x, pt.y - d.start.y) * R.view.k < 3) return;
        d.moved = true;
        P().relmap.pos[d.id] = [Math.round(d.orig[0] + pt.x - d.start.x), Math.round(d.orig[1] + pt.y - d.start.y)];
        render();
      } else if (d.kind === 'connect') {
        const pt = toLocal(e);
        let ghost = R.g.querySelector('.relmap-ghost');
        if (!ghost) { ghost = el('line', { class: 'relmap-ghost' }); R.g.appendChild(ghost); }
        const [x, y] = P().relmap.pos[d.from.id];
        ghost.setAttribute('x1', x); ghost.setAttribute('y1', y); ghost.setAttribute('x2', pt.x); ghost.setAttribute('y2', pt.y);
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      const d = R.drag;
      R.drag = null;
      if (!d) return;
      if (d.kind === 'node') {
        if (d.moved) touch();
        else { R.selected = { kind: 'node', id: d.id }; render(); renderSide(); }
      } else if (d.kind === 'pan' && !d.moved) {
        R.selected = null;
        render();
        renderSide();
      } else if (d.kind === 'connect') {
        const ghost = R.g.querySelector('.relmap-ghost');
        if (ghost) ghost.remove();
        const target = nodeAt(toLocal(e));
        if (target && target.id !== d.from.id && target.type === 'character') addRelationDialog(d.from, target);
      }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(R.view, Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
  }

  function zoomAt(base, f, cx, cy) {
    const r = R.svg.getBoundingClientRect();
    const k = Math.max(0.2, Math.min(4, base.k * f));
    const px = cx - r.left;
    const py = cy - r.top;
    const wx = (px - base.x) / base.k;
    const wy = (py - base.y) / base.k;
    R.view = { k, x: px - wx * k, y: py - wy * k };
    applyView();
  }

  // ───── 関係の追加・編集 ─────
  function kindSelect(value) {
    return h('select', { class: 'input' }, KINDS.map((k) => h('option', { value: k.id, selected: k.id === value }, k.label)));
  }

  function addRelationDialog(from, to) {
    const kind = kindSelect('friend');
    const note = h('input', { class: 'input', type: 'text', placeholder: '例：幼なじみ、兄、宿敵' });
    const calls = h('input', { class: 'input', type: 'text', placeholder: `${from.name}は${to.name}を何と呼ぶ？` });
    const back = h('input', { type: 'checkbox', checked: true });
    const backNote = h('input', { class: 'input', type: 'text', placeholder: '相手から見た関係' });
    const backCalls = h('input', { class: 'input', type: 'text', placeholder: `${to.name}は${from.name}を何と呼ぶ？` });
    UI.modal({
      title: `${from.name} → ${to.name}`,
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid-2' }, UI.field('関係の種類', kind), UI.field('関係（メモ）', note)),
        UI.field('呼び方', calls, '台詞の呼び方チェックに使います'),
        h('label', { class: 'check' }, back, `${to.name} → ${from.name} の関係も追加する`),
        h('div', { class: 'grid-2' }, UI.field('相手から見た関係', backNote), UI.field('相手からの呼び方', backCalls))),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: '追加', primary: true, onClick: () => {
          from.relations.push({ targetId: to.id, kind: kind.value, note: note.value.trim(), calls: calls.value.trim() });
          if (back.checked && !to.relations.some((r) => r.targetId === from.id)) {
            to.relations.push({ targetId: from.id, kind: kind.value, note: backNote.value.trim(), calls: backCalls.value.trim() });
          }
          touch();
          render();
          renderSide();
        } },
      ],
    });
  }

  function editRelation(owner, index) {
    const rel = owner.relations[index];
    if (!rel) return;
    const p = P();
    const target = p.entries.find((e) => e.id === rel.targetId);
    R.selected = { kind: 'edge', from: owner.id, index };
    render();
    const kind = kindSelect(rel.kind || guessKind(rel.note));
    const note = h('input', { class: 'input', type: 'text', value: rel.note || '' });
    const calls = h('input', { class: 'input', type: 'text', value: rel.calls || '' });
    UI.modal({
      title: `${owner.name} → ${target ? target.name : '？'}`,
      onClose: () => { R.selected = null; render(); },
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid-2' }, UI.field('関係の種類', kind), UI.field('関係（メモ）', note)),
        UI.field('呼び方', calls, '複数あるときは／で区切ります')),
      actions: [
        { label: '削除', danger: true, ghost: true, onClick: async () => {
          if (!(await UI.confirm('この関係を削除します。', { danger: true, okLabel: '削除' }))) return false;
          owner.relations.splice(index, 1);
          touch();
          renderSide();
        } },
        { label: '保存', primary: true, onClick: () => {
          rel.kind = kind.value;
          rel.note = note.value.trim();
          rel.calls = calls.value.trim();
          touch();
          renderSide();
        } },
      ],
    });
  }

  function renderSide() {
    const p = P();
    clear(R.side);
    const sel = R.selected && R.selected.kind === 'node' ? p.entries.find((e) => e.id === R.selected.id) : null;
    if (!sel) {
      R.side.append(
        h('h3', { class: 'panel-h' }, '使い方'),
        h('ul', { class: 'hint-list small muted' },
          h('li', null, '人物をドラッグで動かせます。何もない所をドラッグで全体を移動、ホイール／ピンチで拡大縮小'),
          h('li', null, '「線をつなぐ」を押してから人物から人物へドラッグすると、関係を追加できます'),
          h('li', null, '線や関係の文字をクリックすると、種類・呼び方を編集できます'),
          h('li', null, '関係と呼び方は設定資料の人物にも保存され、台詞の呼び方チェックに使われます')),
        h('p', { class: 'small muted' }, `人物 ${p.entries.filter((e) => e.type === 'character').length}人・関係 ${edges().filter((e) => !e.org).length}本`));
      return;
    }
    const others = p.entries.filter((e) => e.type === 'character' && e.id !== sel.id);
    const incoming = [];
    p.entries.forEach((e) => e.relations.forEach((r, i) => { if (r.targetId === sel.id) incoming.push({ e, r, i }); }));
    R.side.append(
      h('div', { class: 'row' }, h('span', { class: 'color-dot big', style: { background: sel.color || '#6c7a96' } }), h('h3', null, sel.name)),
      sel.fields && sel.fields.role ? h('p', { class: 'small muted' }, sel.fields.role) : null,
      h('div', { class: 'row wrap' },
        btn('設定資料を開く', { small: true, icon: 'users', onClick: () => NS.App.navigate('lore', { id: sel.id }) }),
        sel.type === 'character' ? btn('関係を追加', { small: true, icon: 'plus', onClick: () => {
          if (!others.length) { toast('ほかの人物を登録してください'); return; }
          const sel2 = h('select', { class: 'input' }, others.map((o) => h('option', { value: o.id }, o.name)));
          UI.modal({
            title: '相手を選ぶ', body: UI.field('相手', sel2),
            actions: [{ label: 'キャンセル', ghost: true }, { label: '次へ', primary: true, onClick: () => { setTimeout(() => addRelationDialog(sel, others.find((o) => o.id === sel2.value)), 50); } }],
          });
        } }) : null),
      h('h3', { class: 'panel-h' }, `${sel.name}から`),
      relList(sel.relations.map((r, i) => ({ owner: sel, r, i, other: p.entries.find((x) => x.id === r.targetId) }))),
      h('h3', { class: 'panel-h' }, `${sel.name}へ`),
      relList(incoming.map(({ e, r, i }) => ({ owner: e, r, i, other: e }))));
  }

  function relList(items) {
    if (!items.length) return h('p', { class: 'small muted' }, 'なし');
    return h('div', { class: 'rel-list' }, items.map(({ owner, r, i, other }) => {
      const k = kindOf(r);
      return h('button', { type: 'button', class: 'rel-item', onclick: () => editRelation(owner, i) },
        h('span', { class: 'legend-line', style: { borderTopColor: k.color, borderTopStyle: k.dash ? 'dashed' : 'solid' } }),
        h('span', null, h('strong', null, other ? other.name : '？'), h('span', { class: 'muted small' }, '　' + (r.note || k.label) + (r.calls ? `・「${r.calls}」` : ''))));
    }));
  }

  // ───── 書き出し ─────
  function exportPng() {
    const p = P();
    const list = nodes();
    if (!list.length) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    list.forEach((n) => { const [x, y] = p.relmap.pos[n.id]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const pad = 110;
    const w = x1 - x0 + pad * 2;
    const hgt = y1 - y0 + pad * 2;
    const clone = R.svg.cloneNode(true);
    clone.setAttribute('xmlns', SVGNS);
    clone.setAttribute('width', w * 2);
    clone.setAttribute('height', hgt * 2);
    clone.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${w} ${hgt}`);
    const mainG = Array.from(clone.children).find((c) => c.tagName.toLowerCase() === 'g');
    if (mainG) mainG.setAttribute('transform', '');
    const style = document.createElementNS(SVGNS, 'style');
    style.textContent = `text{font-family:"Noto Sans JP","Hiragino Sans",sans-serif}.node-initial{fill:#fff;font-size:22px;font-weight:700}.node-name{fill:#2a2521;font-size:14px;font-weight:700;paint-order:stroke;stroke:#fffdf8;stroke-width:4px}.node-sub{fill:#887f74;font-size:11px;paint-order:stroke;stroke:#fffdf8;stroke-width:3px}.rl-note{font-size:12px;font-weight:700;paint-order:stroke;stroke:#fffdf8;stroke-width:4px}.rl-calls{fill:#5a5248;font-size:11px;paint-order:stroke;stroke:#fffdf8;stroke-width:4px}.relmap-edge-hit{display:none}.node-shape{stroke:#fffdf8;stroke-width:3px}`;
    clone.insertBefore(style, clone.firstChild);
    const bg = document.createElementNS(SVGNS, 'rect');
    bg.setAttribute('x', x0 - pad); bg.setAttribute('y', y0 - pad); bg.setAttribute('width', w); bg.setAttribute('height', hgt); bg.setAttribute('fill', '#fffdf8');
    clone.insertBefore(bg, style.nextSibling);
    const title = document.createElementNS(SVGNS, 'text');
    title.setAttribute('x', x0 - pad + 20); title.setAttribute('y', y0 - pad + 34);
    title.setAttribute('style', 'font-size:20px;font-weight:700;fill:#2a2521');
    title.textContent = p.title + '　相関図';
    clone.appendChild(title);
    const data = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = hgt * 2;
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob((blob) => { if (blob) { UI.download(UI.safeFilename(p.title) + '_相関図.png', blob); toast('相関図を書き出しました'); } }, 'image/png');
    };
    img.onerror = () => toast('書き出せませんでした', 'error');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
  }

  NS.RelMap = { mount, KINDS, KIND, guessKind, kindOf, computeLayout, refit: () => { if (R) fitView(); } };
})(window.Tsuzuri = window.Tsuzuri || {});
