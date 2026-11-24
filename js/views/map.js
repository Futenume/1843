/*
 * 綴り — 空想地図エディタ
 * 地形ブラシ（陸・海・隆起・沈降・平滑・植生）、川・道・鉄道・境界線、領域、地名マーカー、文字ラベル、
 * 自動生成、元に戻す/やり直す、設定資料（場所）との連携、PNG 書き出し。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;
  const E = NS.MapEngine;

  const TOOLS = [
    { id: 'select', label: '選択', icon: 'cursor', key: 'v', hint: '地点・文字・線を選んで移動。Deleteキーで削除' },
    { id: 'pan', label: '移動', icon: 'hand', key: 'h', hint: 'ドラッグで地図を動かす（スペースキーを押しながらでも可）' },
    { id: 'land', label: '陸', icon: 'brush', key: 'b', hint: 'なぞった所を陸地にする', group: 'terrain' },
    { id: 'sea', label: '海', icon: 'wave', key: 'n', hint: 'なぞった所を海にする', group: 'terrain' },
    { id: 'raise', label: '山', icon: 'mountain', key: 'r', hint: 'なぞった所を高くする（山脈）', group: 'terrain' },
    { id: 'lower', label: '削る', icon: 'down', key: 'f', hint: 'なぞった所を低くする', group: 'terrain' },
    { id: 'smooth', label: '均す', icon: 'layers', key: 'g', hint: '起伏をなだらかにする', group: 'terrain' },
    { id: 'biome', label: '植生', icon: 'tree', key: 'p', hint: '森・砂漠・雪原などを塗る' },
    { id: 'line', label: '線', icon: 'route', key: 'l', hint: 'クリックで点を打ち、ダブルクリックかEnterで確定（川・道・鉄道・国境）' },
    { id: 'area', label: '領域', icon: 'polygon', key: 'a', hint: 'クリックで頂点を打ち、始点クリック・ダブルクリック・Enterで確定' },
    { id: 'marker', label: '地点', icon: 'marker', key: 'm', hint: 'クリックした場所に都市・城・村などを置く' },
    { id: 'label', label: '文字', icon: 'text', key: 't', hint: 'クリックした場所に地名・海の名前などを書く' },
  ];

  const LINE_KINDS = {
    river: { label: '川' },
    highway: { label: '街道・大通り' },
    road: { label: '道' },
    path: { label: '小道' },
    rail: { label: '鉄道' },
    border: { label: '国境・境界' },
  };

  const MARKERS = {
    capital: { label: '首都・王都', size: 15 },
    city: { label: '都市', size: 13 },
    town: { label: '町', size: 11.5 },
    village: { label: '村', size: 10.5 },
    castle: { label: '城', size: 11.5 },
    fort: { label: '砦', size: 10.5 },
    port: { label: '港', size: 10.5 },
    temple: { label: '神殿・寺院', size: 10.5 },
    ruin: { label: '遺跡', size: 10.5 },
    cave: { label: '洞窟・迷宮', size: 10.5 },
    tower: { label: '塔', size: 10.5 },
    peak: { label: '山頂', size: 10.5 },
    station: { label: '駅', size: 11 },
    school: { label: '学校', size: 10.5 },
    hospital: { label: '病院', size: 10.5 },
    shrine: { label: '神社', size: 10.5 },
    shop: { label: '店', size: 10 },
    house: { label: '家', size: 10 },
    park: { label: '公園', size: 10.5 },
    pin: { label: '目印', size: 10.5 },
  };

  const LABEL_STYLES = {
    region: { label: '国・地方', size: 26, weight: 700, spacing: 0.45, color: 'ink' },
    sea: { label: '海・湖', size: 20, weight: 500, spacing: 0.6, color: 'water' },
    range: { label: '山脈・森', size: 15, weight: 600, spacing: 0.35, color: 'glyph' },
    place: { label: '小さな地名', size: 12, weight: 500, spacing: 0.08, color: 'ink' },
    title: { label: '題字', size: 36, weight: 700, spacing: 0.25, color: 'ink' },
  };

  const AREA_COLORS = ['#c8553d', '#d9a441', '#6a994e', '#3d7ea6', '#5f4b8b', '#b5838d', '#2a9d8f', '#7f5539'];
  const FONT = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif';

  function P() { return NS.App.project; }

  const V = {};
  let M = null;

  V.mount = function (view, params) {
    const p = P();
    M = {
      view, tool: 'select', brush: { size: 5, strength: 0.6 }, biome: 1, lineKind: 'river', areaColor: AREA_COLORS[0],
      markerType: 'city', labelStyle: 'region', draft: null, sel: null, drag: null, undo: [], redo: [],
      pointers: new Map(), hover: null, space: false, needsDraw: true, labelBoxes: new Map(),
    };
    const id = params.id || p.lastMapId;
    const map = p.maps.find((m) => m.id === id) || p.maps[0];
    if (!map) { renderEmpty(); return; }
    openMap(map);
  };

  V.unmount = function () {
    if (!M) return;
    if (M.raf) cancelAnimationFrame(M.raf);
    if (M.ro) M.ro.disconnect();
    if (M.onKey) { document.removeEventListener('keydown', M.onKey); document.removeEventListener('keyup', M.onKeyUp); }
    M = null;
  };

  // ───── 地図がないとき ─────
  function renderEmpty() {
    clear(M.view);
    M.view.appendChild(h('div', { class: 'map-empty' },
      h('div', { class: 'empty big' },
        icon('map', 48),
        h('h2', null, '空想地図をつくる'),
        h('p', null, '大陸や島を自動で生成して、ブラシで海岸線や山脈を描き足し、都市・城・街道・川・国境を置いていけます。地点は設定資料の「場所」とつなげられます。'),
        btn('新しい地図', { icon: 'plus', primary: true, onClick: () => newMapDialog() }))));
  }

  function newMapDialog(regenerate) {
    const name = h('input', { class: 'input', type: 'text', value: regenerate ? M.map.name : '世界地図' });
    const preset = h('select', { class: 'input' }, Object.keys(E.PRESETS).map((k) => h('option', { value: k }, E.PRESETS[k].label)));
    const size = h('select', { class: 'input' }, [['s', '小（160×104マス）'], ['m', '中（200×130マス）'], ['l', '大（260×170マス）']].map(([v, l]) => h('option', { value: v, selected: v === 'm' }, l)));
    const palette = h('select', { class: 'input' }, Object.keys(E.PALETTES).map((k) => h('option', { value: k, selected: regenerate ? M.map.style.palette === k : k === 'parchment' }, E.PALETTES[k].label)));
    const land = h('input', { type: 'range', min: 10, max: 80, value: 42, class: 'range' });
    const landOut = h('span', { class: 'muted small' }, '42%');
    land.addEventListener('input', () => { landOut.textContent = land.value + '%'; });
    const seed = h('input', { class: 'input input-num', type: 'number', value: Math.floor(Math.random() * 99999) });
    const autoB = h('input', { type: 'checkbox', checked: true });
    const preview = h('canvas', { class: 'gen-preview', width: 260, height: 169, 'aria-label': 'プレビュー' });
    const drawPreview = () => {
      const gw = 130;
      const gh = 85;
      const Hh = E.generate(gw, gh, { preset: preset.value, seed: +seed.value || 1, land: land.value / 100 });
      const Bb = autoB.checked ? E.autoBiome(Hh, gw, gh, +seed.value || 1) : new Uint8Array(gw * gh);
      const ctx = preview.getContext('2d');
      const img = ctx.createImageData(260, 170);
      E.renderTerrain({ gw, gh, cell: 2, style: { palette: palette.value, hillshade: true } }, Hh, Bb, img, 0, 0, 260, 170);
      ctx.putImageData(img, 0, 0);
    };
    const redraw = UI.debounce(drawPreview, 120);
    [preset, palette, land, seed, autoB].forEach((el) => el.addEventListener('input', redraw));
    [preset, palette, autoB].forEach((el) => el.addEventListener('change', redraw));
    UI.modal({
      title: regenerate ? '地形を作り直す' : '新しい地図', wide: true,
      body: h('div', { class: 'gen-dialog' },
        h('div', { class: 'stack' },
          regenerate ? h('p', { class: 'muted small' }, '地形と植生だけを作り直します。地点・線・文字はそのまま残ります（元に戻すこともできます）。') : UI.field('地図の名前', name),
          h('div', { class: 'grid-2' }, UI.field('地形', preset), regenerate ? null : UI.field('大きさ', size)),
          UI.field('配色', palette),
          UI.field('陸の割合', h('div', { class: 'row' }, land, landOut)),
          h('div', { class: 'grid-2' },
            UI.field('シード（同じ数なら同じ地形）', h('div', { class: 'row' }, seed, btn('', { icon: 'dice', ghost: true, title: 'ランダム', onClick: () => { seed.value = Math.floor(Math.random() * 99999); drawPreview(); } }))),
            h('label', { class: 'check' }, autoB, '植生も自動で塗る'))),
        h('div', { class: 'gen-preview-wrap' }, preview, h('p', { class: 'muted small' }, 'プレビュー'))),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: regenerate ? '作り直す' : '作成', primary: true, onClick: () => {
          if (regenerate) {
            pushUndo();
            const m = M.map;
            const sd = +seed.value || 1;
            M.H = E.generate(m.gw, m.gh, { preset: preset.value, seed: sd, land: land.value / 100 });
            M.B = autoB.checked ? E.autoBiome(M.H, m.gw, m.gh, sd) : new Uint8Array(m.gw * m.gh);
            m.seed = sd;
            m.style.palette = palette.value;
            terrainChanged(true);
            commit(true);
            renderInspector();
            return;
          }
          const m = E.newMap(name.value.trim() || '地図', { preset: preset.value, size: size.value, seed: +seed.value || 1, land: land.value / 100, palette: palette.value, biome: autoB.checked });
          P().maps.push(m);
          NS.App.touch();
          V.unmount();
          V.mount(document.getElementById('view'), { id: m.id });
        } },
      ],
    });
    setTimeout(drawPreview, 30);
  }

  // ───── 地図を開く ─────
  function openMap(map) {
    const p = P();
    p.lastMapId = map.id;
    M.map = map;
    map.lines = map.lines || [];
    map.areas = map.areas || [];
    map.markers = map.markers || [];
    map.labels = map.labels || [];
    map.style = Object.assign({ palette: 'parchment', hillshade: true, glyphs: true, grid: false, kmPerCell: 5, compass: true, scale: true, title: true }, map.style || {});
    const n = map.gw * map.gh;
    M.H = map.height ? E.decodeHeights(map.height, n) : E.generate(map.gw, map.gh, { preset: 'continent', seed: map.seed || 1 });
    M.B = map.biome ? E.decodeBiomes(map.biome, n) : new Uint8Array(n);
    M.W = map.gw * map.cell;
    M.Hpx = map.gh * map.cell;
    M.base = document.createElement('canvas');
    M.base.width = M.W;
    M.base.height = M.Hpx;
    M.baseCtx = M.base.getContext('2d');
    M.img = M.baseCtx.createImageData(M.W, M.Hpx);
    build();
    terrainChanged(true);
    fit();
    if (NS.App.pendingMapFocus && NS.App.pendingMapFocus.mapId === map.id) {
      const mk = map.markers.find((x) => x.id === NS.App.pendingMapFocus.markerId);
      NS.App.pendingMapFocus = null;
      if (mk) { M.sel = { kind: 'marker', id: mk.id }; centerOn(mk.x, mk.y, 2); renderInspector(); }
    }
  }

  function build() {
    if (M.ro) M.ro.disconnect();
    if (M.onKey) { document.removeEventListener('keydown', M.onKey); document.removeEventListener('keyup', M.onKeyUp); }
    clear(M.view);
    const p = P();
    const mapSel = h('select', { class: 'input map-select', 'aria-label': '地図を選ぶ', onchange: (e) => {
      if (e.target.value === '__new') { e.target.value = M.map.id; newMapDialog(); return; }
      NS.App.navigate('map', { id: e.target.value });
    } }, p.maps.map((m) => h('option', { value: m.id, selected: m.id === M.map.id }, m.name)), h('option', { value: '__new' }, '＋ 新しい地図…'));

    M.undoBtn = btn('', { icon: 'undo', ghost: true, title: '元に戻す（Ctrl+Z）', onClick: undo });
    M.redoBtn = btn('', { icon: 'redo', ghost: true, title: 'やり直す（Ctrl+Shift+Z）', onClick: redo });
    const top = h('div', { class: 'map-topbar' },
      mapSel,
      h('div', { class: 'toolbar-group' }, M.undoBtn, M.redoBtn),
      h('div', { class: 'toolbar-group' },
        btn('', { icon: 'plus', ghost: true, title: '拡大', onClick: () => zoomBy(1.25) }),
        btn('', { icon: 'minus', ghost: true, title: '縮小', onClick: () => zoomBy(0.8) }),
        btn('全体', { ghost: true, small: true, title: '全体を表示', onClick: fit })),
      h('div', { class: 'toolbar-group' },
        btn('PNG', { icon: 'image', small: true, title: '画像として書き出す', onClick: exportPng }),
        btn('', { icon: 'panel', ghost: true, title: 'パネルを表示/隠す', onClick: () => M.layout.classList.toggle('hide-inspector') })));

    M.toolbar = h('div', { class: 'map-tools', role: 'toolbar', 'aria-label': '地図の道具' });
    TOOLS.forEach((t) => M.toolbar.appendChild(h('button', {
      type: 'button', class: 'map-tool' + (M.tool === t.id ? ' active' : ''), dataset: { tool: t.id }, title: `${t.label}（${t.key.toUpperCase()}）— ${t.hint}`,
      'aria-pressed': M.tool === t.id ? 'true' : 'false',
      onclick: () => setTool(t.id),
    }, icon(t.icon, 20), h('span', null, t.label))));

    M.canvas = h('canvas', { class: 'map-canvas', tabindex: 0, 'aria-label': '地図キャンバス' });
    M.ctx = M.canvas.getContext('2d');
    M.hint = h('div', { class: 'map-hint' });
    M.stage = h('div', { class: 'map-stage' }, M.canvas, M.hint);
    M.inspector = h('aside', { class: 'map-inspector', 'aria-label': '地図の詳細' });
    M.layout = h('div', { class: 'map-layout' + (window.innerWidth < 900 ? ' hide-inspector' : '') }, M.toolbar, M.stage, M.inspector);
    M.view.append(top, M.layout);

    bindEvents();
    M.ro = new ResizeObserver(() => { resize(); });
    M.ro.observe(M.stage);
    resize();
    renderInspector();
    updateHint();
    updateUndoButtons();
  }

  function setTool(id) {
    if (M.draft) finishDraft();
    M.tool = id;
    M.toolbar.querySelectorAll('.map-tool').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === id);
      b.setAttribute('aria-pressed', b.dataset.tool === id ? 'true' : 'false');
    });
    M.canvas.dataset.tool = id;
    if (id !== 'select') M.sel = null;
    renderInspector();
    updateHint();
    draw();
  }

  function updateHint() {
    const t = TOOLS.find((x) => x.id === M.tool);
    M.hint.textContent = M.draft ? (M.tool === 'line' ? `点 ${M.draft.length}個 — ダブルクリック／Enterで確定、Escで取り消し、Backspaceで1点戻す` : `頂点 ${M.draft.length}個 — 始点をクリック／Enterで確定`) : (t ? t.hint : '');
  }

  // ───── 座標・表示 ─────
  function resize() {
    if (!M) return;
    const r = M.stage.getBoundingClientRect();
    M.dpr = window.devicePixelRatio || 1;
    M.cw = Math.max(50, r.width);
    M.ch = Math.max(50, r.height);
    M.canvas.width = Math.round(M.cw * M.dpr);
    M.canvas.height = Math.round(M.ch * M.dpr);
    M.canvas.style.width = M.cw + 'px';
    M.canvas.style.height = M.ch + 'px';
    if (M.zoom == null) fit();
    draw();
  }

  function fit() {
    if (!M.cw) return;
    const pad = 24;
    M.zoom = Math.min((M.cw - pad * 2) / M.W, (M.ch - pad * 2) / M.Hpx);
    M.ox = (M.cw - M.W * M.zoom) / 2;
    M.oy = (M.ch - M.Hpx * M.zoom) / 2;
    draw();
  }

  function centerOn(x, y, zoom) {
    if (zoom) M.zoom = Math.max(M.zoom || 1, zoom);
    M.ox = M.cw / 2 - x * M.zoom;
    M.oy = M.ch / 2 - y * M.zoom;
    draw();
  }

  function zoomBy(f, sx, sy) {
    if (sx == null) { sx = M.cw / 2; sy = M.ch / 2; }
    const z = Math.max(0.15, Math.min(12, M.zoom * f));
    const wx = (sx - M.ox) / M.zoom;
    const wy = (sy - M.oy) / M.zoom;
    M.zoom = z;
    M.ox = sx - wx * z;
    M.oy = sy - wy * z;
    draw();
  }

  function toWorld(e) {
    const r = M.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { x: (sx - M.ox) / M.zoom, y: (sy - M.oy) / M.zoom, sx, sy };
  }

  // ───── 地形 ─────
  function terrainChanged(full, rect) {
    if (full) {
      E.renderTerrain(M.map, M.H, M.B, M.img, 0, 0, M.W, M.Hpx);
      M.baseCtx.putImageData(M.img, 0, 0);
    } else if (rect) {
      E.renderTerrain(M.map, M.H, M.B, M.img, rect[0], rect[1], rect[2], rect[3]);
      const x = Math.max(0, Math.floor(rect[0]));
      const y = Math.max(0, Math.floor(rect[1]));
      M.baseCtx.putImageData(M.img, 0, 0, x, y, Math.min(M.W, Math.ceil(rect[2])) - x, Math.min(M.Hpx, Math.ceil(rect[3])) - y);
    }
    if (full) M.glyphs = E.computeGlyphs(M.map, M.H, M.B);
    draw();
  }

  function applyBrush(wx, wy) {
    const m = M.map;
    const cx = wx / m.cell - 0.5;
    const cy = wy / m.cell - 0.5;
    const r = M.brush.size;
    const st = M.brush.strength;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(m.gw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(m.gh - 1, Math.ceil(cy + r));
    const H = M.H;
    const B = M.B;
    const gw = m.gw;
    let src = null;
    if (M.tool === 'smooth') src = H.slice();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        const w = Math.pow(1 - d, 1.6) * st;
        const i = y * gw + x;
        const n = (E.hash2(x, y, 77) - 0.5);
        switch (M.tool) {
          case 'land': if (H[i] < 0.12) H[i] += (0.12 + n * 0.06 - H[i]) * Math.min(1, w * 0.9); break;
          case 'sea': if (H[i] > -0.3) H[i] += (-0.3 - H[i]) * Math.min(1, w * 0.9); break;
          case 'raise': H[i] = Math.min(1, H[i] + w * (0.05 + n * 0.04)); break;
          case 'lower': H[i] = Math.max(-1, H[i] - w * 0.05); break;
          case 'smooth': {
            let s = 0;
            let c = 0;
            for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
              const X = x + xx;
              const Y = y + yy;
              if (X < 0 || Y < 0 || X >= gw || Y >= m.gh) continue;
              s += src[Y * gw + X]; c++;
            }
            H[i] += (s / c - H[i]) * Math.min(1, w);
            break;
          }
          case 'biome': if (w > 0.05 || d < 0.85) B[i] = M.biome; break;
          default: break;
        }
      }
    }
    const pad = 2;
    terrainChanged(false, [(x0 - pad) * m.cell, (y0 - pad) * m.cell, (x1 + pad + 1) * m.cell, (y1 + pad + 1) * m.cell]);
  }

  // ───── 元に戻す ─────
  function snapshot() {
    const m = M.map;
    return { H: M.H.slice(), B: M.B.slice(), v: JSON.stringify({ lines: m.lines, areas: m.areas, markers: m.markers, labels: m.labels, style: m.style, seed: m.seed }) };
  }
  function restore(s) {
    const m = M.map;
    M.H = s.H.slice();
    M.B = s.B.slice();
    const v = JSON.parse(s.v);
    m.lines = v.lines; m.areas = v.areas; m.markers = v.markers; m.labels = v.labels; m.style = v.style; m.seed = v.seed;
    M.sel = null;
    terrainChanged(true);
    commit(true);
    renderInspector();
  }
  function pushUndo() {
    M.undo.push(snapshot());
    if (M.undo.length > 40) M.undo.shift();
    M.redo = [];
    updateUndoButtons();
  }
  function undo() {
    if (!M.undo.length) return;
    M.redo.push(snapshot());
    restore(M.undo.pop());
    updateUndoButtons();
  }
  function redo() {
    if (!M.redo.length) return;
    M.undo.push(snapshot());
    restore(M.redo.pop());
    updateUndoButtons();
  }
  function updateUndoButtons() {
    if (M.undoBtn) M.undoBtn.disabled = !M.undo.length;
    if (M.redoBtn) M.redoBtn.disabled = !M.redo.length;
  }

  /** 変更を作品データに書き戻して保存 */
  function commit(terrain) {
    const m = M.map;
    if (terrain) {
      m.height = E.encodeHeights(M.H);
      m.biome = E.encodeBiomes(M.B);
    }
    m.updatedAt = Date.now();
    NS.App.touch();
  }

  // ───── 入力 ─────
  function bindEvents() {
    const c = M.canvas;
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('pointerleave', () => { M.hover = null; draw(); });
    c.addEventListener('dblclick', (e) => { if (M.draft) { e.preventDefault(); finishDraft(); } });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const w = toWorld(e);
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), w.sx, w.sy);
      } else {
        M.ox -= e.deltaX;
        draw();
      }
    }, { passive: false });
    M.onKey = (e) => {
      if (!M) return;
      const tag = (e.target && e.target.tagName) || '';
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
      if (typing || document.querySelector('.modal-overlay')) return;
      if (e.key === ' ') { M.space = true; M.canvas.classList.add('panning'); e.preventDefault(); return; }
      if (e.key === 'Escape') { if (M.draft) { M.draft = null; updateHint(); draw(); } else { M.sel = null; renderInspector(); draw(); } return; }
      if (e.key === 'Enter' && M.draft) { finishDraft(); return; }
      if ((e.key === 'Backspace' || e.key === 'Delete')) {
        if (M.draft) { M.draft.pop(); if (!M.draft.length) M.draft = null; updateHint(); draw(); e.preventDefault(); return; }
        if (M.sel) { deleteSelection(); e.preventDefault(); return; }
      }
      if (e.key === '+' || e.key === '=') { zoomBy(1.25); return; }
      if (e.key === '-') { zoomBy(0.8); return; }
      if (e.key === '[') { M.brush.size = Math.max(1, M.brush.size - 1); renderInspector(); draw(); return; }
      if (e.key === ']') { M.brush.size = Math.min(30, M.brush.size + 1); renderInspector(); draw(); return; }
      if (!mod && !e.altKey) {
        const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    M.onKeyUp = (e) => { if (e.key === ' ' && M) { M.space = false; M.canvas.classList.remove('panning'); } };
    document.addEventListener('keydown', M.onKey);
    document.addEventListener('keyup', M.onKeyUp);
  }

  function onDown(e) {
    M.canvas.focus({ preventScroll: true });
    M.canvas.setPointerCapture(e.pointerId);
    const w = toWorld(e);
    M.pointers.set(e.pointerId, { sx: w.sx, sy: w.sy });
    if (M.pointers.size === 2) {
      const [a, b] = Array.from(M.pointers.values());
      M.pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy), cx: (a.sx + b.sx) / 2, cy: (a.sy + b.sy) / 2, zoom: M.zoom, ox: M.ox, oy: M.oy };
      if (M.drag && M.drag.kind === 'stroke') endStroke();
      M.drag = null;
      return;
    }
    if (e.button === 1 || e.button === 2 || M.tool === 'pan' || M.space) {
      M.drag = { kind: 'pan', sx: w.sx, sy: w.sy, ox: M.ox, oy: M.oy };
      return;
    }
    const tool = M.tool;
    const def = TOOLS.find((t) => t.id === tool);
    if (def && (def.group === 'terrain' || tool === 'biome')) {
      pushUndo();
      M.drag = { kind: 'stroke', last: w };
      applyBrush(w.x, w.y);
      return;
    }
    if (tool === 'line' || tool === 'area') {
      if (!M.draft) M.draft = [];
      if (tool === 'area' && M.draft.length >= 3) {
        const f = M.draft[0];
        if (Math.hypot(f[0] - w.x, f[1] - w.y) * M.zoom < 12) { finishDraft(); return; }
      }
      M.draft.push([round1(w.x), round1(w.y)]);
      updateHint();
      draw();
      return;
    }
    if (tool === 'marker') {
      pushUndo();
      const mk = { id: UI.uid('mk'), x: round1(w.x), y: round1(w.y), type: M.markerType, name: '', entryId: '', note: '' };
      M.map.markers.push(mk);
      M.sel = { kind: 'marker', id: mk.id };
      commit();
      renderInspector(true);
      draw();
      return;
    }
    if (tool === 'label') {
      pushUndo();
      const st = LABEL_STYLES[M.labelStyle];
      const lb = { id: UI.uid('lb'), x: round1(w.x), y: round1(w.y), text: '地名', style: M.labelStyle, size: st.size, rotation: 0, vertical: false };
      M.map.labels.push(lb);
      M.sel = { kind: 'label', id: lb.id };
      commit();
      renderInspector(true);
      draw();
      return;
    }
    // 選択
    const hit = hitTest(w.x, w.y);
    M.sel = hit;
    if (hit) {
      M.drag = { kind: 'move', start: w, hit, moved: false, orig: JSON.stringify(getSelObj(hit)) };
    } else {
      M.drag = { kind: 'pan', sx: w.sx, sy: w.sy, ox: M.ox, oy: M.oy };
    }
    renderInspector();
    draw();
  }

  function onMove(e) {
    const w = toWorld(e);
    if (M.pointers.has(e.pointerId)) M.pointers.set(e.pointerId, { sx: w.sx, sy: w.sy });
    if (M.pinch && M.pointers.size === 2) {
      const [a, b] = Array.from(M.pointers.values());
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      const cx = (a.sx + b.sx) / 2;
      const cy = (a.sy + b.sy) / 2;
      const z = Math.max(0.15, Math.min(12, M.pinch.zoom * d / M.pinch.d));
      const wx = (M.pinch.cx - M.pinch.ox) / M.pinch.zoom;
      const wy = (M.pinch.cy - M.pinch.oy) / M.pinch.zoom;
      M.zoom = z;
      M.ox = cx - wx * z;
      M.oy = cy - wy * z;
      draw();
      return;
    }
    M.hover = w;
    const d = M.drag;
    if (!d) { if (M.draft || TOOLS.find((t) => t.id === M.tool && (t.group || t.id === 'biome'))) draw(); return; }
    if (d.kind === 'pan') {
      M.ox = d.ox + (w.sx - d.sx);
      M.oy = d.oy + (w.sy - d.sy);
      draw();
    } else if (d.kind === 'stroke') {
      const dist = Math.hypot(w.x - d.last.x, w.y - d.last.y);
      const step = Math.max(1, M.brush.size * M.map.cell * 0.35);
      if (dist >= step) {
        const n = Math.floor(dist / step);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          applyBrush(d.last.x + (w.x - d.last.x) * t, d.last.y + (w.y - d.last.y) * t);
        }
        d.last = w;
      } else {
        draw();
      }
    } else if (d.kind === 'move') {
      const dx = w.x - d.start.x;
      const dy = w.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * M.zoom < 3) return;
      if (!d.moved) { d.moved = true; pushUndoFrom(d); }
      const orig = JSON.parse(d.orig);
      const obj = getSelObj(d.hit);
      if (!obj) return;
      if (d.hit.kind === 'marker' || d.hit.kind === 'label') {
        obj.x = round1(orig.x + dx);
        obj.y = round1(orig.y + dy);
      } else if (d.hit.vertex != null) {
        obj.points[d.hit.vertex] = [round1(orig.points[d.hit.vertex][0] + dx), round1(orig.points[d.hit.vertex][1] + dy)];
      } else {
        obj.points = orig.points.map((pt) => [round1(pt[0] + dx), round1(pt[1] + dy)]);
      }
      draw();
    }
  }

  function pushUndoFrom(d) {
    // ドラッグ開始時点の状態を記録
    const snap = snapshot();
    const v = JSON.parse(snap.v);
    const obj = JSON.parse(d.orig);
    const list = v[d.hit.kind + 's'];
    const i = list.findIndex((x) => x.id === obj.id);
    if (i >= 0) list[i] = obj;
    snap.v = JSON.stringify(v);
    M.undo.push(snap);
    if (M.undo.length > 40) M.undo.shift();
    M.redo = [];
    updateUndoButtons();
  }

  function onUp(e) {
    M.pointers.delete(e.pointerId);
    if (M.pointers.size < 2) M.pinch = null;
    const d = M.drag;
    M.drag = null;
    if (!d) return;
    if (d.kind === 'stroke') endStroke();
    else if (d.kind === 'move' && d.moved) { commit(); renderInspector(); }
  }

  function endStroke() {
    M.glyphs = E.computeGlyphs(M.map, M.H, M.B);
    commit(true);
    draw();
  }

  function finishDraft() {
    const pts = M.draft;
    M.draft = null;
    updateHint();
    if (!pts) return;
    // ダブルクリックで同じ点が重なるのを除く
    const clean = [];
    pts.forEach((pt) => {
      const last = clean[clean.length - 1];
      if (!last || Math.hypot(last[0] - pt[0], last[1] - pt[1]) > 1) clean.push(pt);
    });
    if (M.tool === 'line' && clean.length >= 2) {
      pushUndo();
      const ln = { id: UI.uid('ln'), kind: M.lineKind, points: clean, name: '' };
      M.map.lines.push(ln);
      M.sel = { kind: 'line', id: ln.id };
      commit();
    } else if (M.tool === 'area' && clean.length >= 3) {
      pushUndo();
      const ar = { id: UI.uid('ar'), points: clean, color: M.areaColor, name: '' };
      M.map.areas.push(ar);
      M.sel = { kind: 'area', id: ar.id };
      commit();
    } else {
      toast(M.tool === 'line' ? '線には2点以上が必要です' : '領域には3点以上が必要です');
    }
    renderInspector();
    draw();
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  function getSelObj(sel) {
    if (!sel) return null;
    return (M.map[sel.kind + 's'] || []).find((x) => x.id === sel.id) || null;
  }

  function deleteSelection() {
    const sel = M.sel;
    if (!sel) return;
    const list = M.map[sel.kind + 's'];
    const i = list.findIndex((x) => x.id === sel.id);
    if (i < 0) return;
    pushUndo();
    if ((sel.kind === 'line' && sel.vertex != null && list[i].points.length > 2) || (sel.kind === 'area' && sel.vertex != null && list[i].points.length > 3)) {
      list[i].points.splice(sel.vertex, 1);
      M.sel = { kind: sel.kind, id: sel.id };
    } else {
      list.splice(i, 1);
      M.sel = null;
    }
    commit();
    renderInspector();
    draw();
  }

  // ───── 当たり判定 ─────
  function distToSeg(px, py, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }

  function inPoly(x, y, pts) {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0];
      const yi = pts[i][1];
      const xj = pts[j][0];
      const yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
    }
    return ins;
  }

  function hitTest(x, y) {
    const m = M.map;
    const tol = 8 / M.zoom;
    const sc = m.cell / 6;
    for (let i = m.labels.length - 1; i >= 0; i--) {
      const lb = m.labels[i];
      const box = M.labelBoxes.get(lb.id);
      if (!box) continue;
      const a = -(lb.rotation || 0) * Math.PI / 180;
      const dx = x - lb.x;
      const dy = y - lb.y;
      const rx = dx * Math.cos(a) - dy * Math.sin(a);
      const ry = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(rx) <= box.w / 2 + tol && Math.abs(ry) <= box.h / 2 + tol) return { kind: 'label', id: lb.id };
    }
    for (let i = m.markers.length - 1; i >= 0; i--) {
      const mk = m.markers[i];
      if (Math.hypot(x - mk.x, y - mk.y) <= 9 * sc + tol) return { kind: 'marker', id: mk.id };
    }
    const sel = M.sel;
    for (const kind of ['line', 'area']) {
      const list = m[kind + 's'];
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        if (sel && sel.id === it.id) {
          for (let k = 0; k < it.points.length; k++) {
            if (Math.hypot(x - it.points[k][0], y - it.points[k][1]) <= tol) return { kind, id: it.id, vertex: k };
          }
        }
        const n = it.points.length;
        for (let k = 0; k < n - (kind === 'line' ? 1 : 0); k++) {
          if (distToSeg(x, y, it.points[k], it.points[(k + 1) % n]) <= tol + 2 * sc) return { kind, id: it.id };
        }
      }
    }
    for (let i = m.areas.length - 1; i >= 0; i--) {
      if (inPoly(x, y, m.areas[i].points)) return { kind: 'area', id: m.areas[i].id };
    }
    return null;
  }

  // ───── 描画 ─────
  function draw() {
    if (!M || M.raf) return;
    M.raf = requestAnimationFrame(() => {
      if (!M) return;
      M.raf = 0;
      const ctx = M.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, M.canvas.width, M.canvas.height);
      ctx.setTransform(M.dpr * M.zoom, 0, 0, M.dpr * M.zoom, M.dpr * M.ox, M.dpr * M.oy);
      renderMap(ctx, M.zoom, true);
      drawOverlay(ctx);
    });
  }

  function pal() { return E.PALETTES[M.map.style.palette] || E.PALETTES.parchment; }

  /** 地図本体を描く（書き出しでも使う） */
  function renderMap(ctx, zoom, editing) {
    const m = M.map;
    const st = m.style;
    const pl = pal();
    const sc = m.cell / 6;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = editing ? 18 / zoom : 0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, M.W, M.Hpx);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(M.base, 0, 0);

    if (st.grid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(60,50,40,0.18)';
      ctx.lineWidth = 0.6 / Math.max(zoom, 0.5);
      const step = m.cell * 10;
      ctx.beginPath();
      for (let x = step; x < M.W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, M.Hpx); }
      for (let y = step; y < M.Hpx; y += step) { ctx.moveTo(0, y); ctx.lineTo(M.W, y); }
      ctx.stroke();
      ctx.restore();
    }

    // 領域
    m.areas.forEach((ar) => {
      if (ar.points.length < 3) return;
      ctx.save();
      tracePath(ctx, ar.points, true);
      ctx.fillStyle = hexA(ar.color, 0.2);
      ctx.fill();
      ctx.setLineDash([6 * sc, 4 * sc]);
      ctx.lineWidth = 1.6 * sc;
      ctx.strokeStyle = hexA(ar.color, 0.85);
      ctx.stroke();
      ctx.restore();
    });

    // 山・森の記号
    if (st.glyphs && M.glyphs) drawGlyphs(ctx, M.glyphs, pl);

    // 線
    const order = ['river', 'path', 'road', 'highway', 'rail', 'border'];
    m.lines.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).forEach((ln) => drawLine(ctx, ln, pl, sc));

    // 領域名
    m.areas.forEach((ar) => {
      if (!ar.name) return;
      const c = centroid(ar.points);
      drawText(ctx, ar.name, c[0], c[1], { size: 14 * sc, weight: 700, color: hexA(ar.color, 0.95), spacing: 0.3, halo: pl.halo });
    });

    // 地点
    m.markers.forEach((mk) => drawMarker(ctx, mk, pl, sc));

    // 文字
    m.labels.forEach((lb) => {
      const s = LABEL_STYLES[lb.style] || LABEL_STYLES.region;
      const color = s.color === 'water' ? pl.water : s.color === 'glyph' ? pl.glyph : pl.ink;
      const box = drawText(ctx, lb.text, lb.x, lb.y, { size: lb.size || s.size, weight: s.weight, color, spacing: s.spacing, halo: pl.halo, rotation: lb.rotation || 0, vertical: lb.vertical });
      M.labelBoxes.set(lb.id, box);
    });

    // 方位・縮尺・題字・枠
    if (st.compass) drawCompass(ctx, M.W - 46 * sc, 52 * sc, 30 * sc, pl);
    if (st.scale) drawScale(ctx, pl, sc);
    if (st.title && m.name) {
      drawText(ctx, m.name, 0, 0, { size: 20 * sc, weight: 700, color: pl.ink, spacing: 0.3, halo: pl.halo, align: 'left', x: 18 * sc, y: 30 * sc });
    }
    ctx.save();
    ctx.strokeStyle = pl.ink;
    ctx.lineWidth = 2 * sc;
    ctx.strokeRect(1 * sc, 1 * sc, M.W - 2 * sc, M.Hpx - 2 * sc);
    ctx.lineWidth = 0.7 * sc;
    ctx.strokeRect(5 * sc, 5 * sc, M.W - 10 * sc, M.Hpx - 10 * sc);
    ctx.restore();
  }

  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return `rgba(120,120,120,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function centroid(pts) {
    let x = 0;
    let y = 0;
    pts.forEach((p) => { x += p[0]; y += p[1]; });
    return [x / pts.length, y / pts.length];
  }

  function tracePath(ctx, pts, closed) {
    ctx.beginPath();
    const n = pts.length;
    if (!n) return;
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (n === 2 && !closed) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
    const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1);
      const p1 = get(i);
      const p2 = get(i + 1);
      const p3 = get(i + 2);
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (closed) ctx.closePath();
  }

  function drawLine(ctx, ln, pl, sc) {
    const pts = ln.points;
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (ln.kind) {
      case 'river': {
        // 河口に向かって太くする
        const n = pts.length;
        const get = (i) => pts[Math.max(0, Math.min(n - 1, i))];
        ctx.strokeStyle = pl.water;
        for (let i = 0; i < n - 1; i++) {
          const p0 = get(i - 1);
          const p1 = get(i);
          const p2 = get(i + 1);
          const p3 = get(i + 2);
          ctx.lineWidth = (0.9 + (i / Math.max(1, n - 2)) * 2.6) * sc;
          ctx.beginPath();
          ctx.moveTo(p1[0], p1[1]);
          ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
          ctx.stroke();
        }
        break;
      }
      case 'highway':
        tracePath(ctx, pts, false);
        ctx.strokeStyle = pl.road;
        ctx.lineWidth = 3.6 * sc;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,246,222,0.95)';
        ctx.lineWidth = 1.6 * sc;
        ctx.stroke();
        break;
      case 'road':
        tracePath(ctx, pts, false);
        ctx.strokeStyle = pl.road;
        ctx.lineWidth = 1.8 * sc;
        ctx.stroke();
        break;
      case 'path':
        tracePath(ctx, pts, false);
        ctx.strokeStyle = pl.road;
        ctx.lineWidth = 1.2 * sc;
        ctx.setLineDash([3 * sc, 3 * sc]);
        ctx.stroke();
        break;
      case 'rail':
        tracePath(ctx, pts, false);
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#2b2b2b';
        ctx.lineWidth = 3 * sc;
        ctx.stroke();
        ctx.strokeStyle = '#fafafa';
        ctx.lineWidth = 1.8 * sc;
        ctx.setLineDash([7 * sc, 7 * sc]);
        ctx.stroke();
        break;
      case 'border':
        tracePath(ctx, pts, false);
        ctx.strokeStyle = hexA(pl.border, 0.18);
        ctx.lineWidth = 6 * sc;
        ctx.stroke();
        ctx.strokeStyle = pl.border;
        ctx.lineWidth = 1.6 * sc;
        ctx.setLineDash([8 * sc, 3 * sc, 2 * sc, 3 * sc]);
        ctx.stroke();
        break;
      default:
        tracePath(ctx, pts, false);
        ctx.strokeStyle = pl.ink;
        ctx.lineWidth = 1.5 * sc;
        ctx.stroke();
    }
    ctx.restore();
  }

  function drawGlyphs(ctx, glyphs, pl) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    glyphs.forEach((g) => {
      const s = g.s;
      if (g.k === 'm') {
        ctx.beginPath();
        ctx.moveTo(g.x - s, g.y);
        ctx.lineTo(g.x - s * 0.12, g.y - s * 1.15);
        ctx.lineTo(g.x + s * 0.95, g.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(250,244,230,0.92)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(g.x - s * 0.12, g.y - s * 1.15);
        ctx.lineTo(g.x + s * 0.95, g.y);
        ctx.lineTo(g.x + s * 0.15, g.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(110,90,70,0.35)';
        ctx.fill();
        if (g.snow) {
          ctx.beginPath();
          ctx.moveTo(g.x - s * 0.42, g.y - s * 0.68);
          ctx.lineTo(g.x - s * 0.12, g.y - s * 1.15);
          ctx.lineTo(g.x + s * 0.28, g.y - s * 0.7);
          ctx.closePath();
          ctx.fillStyle = '#fff';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(g.x - s, g.y);
        ctx.lineTo(g.x - s * 0.12, g.y - s * 1.15);
        ctx.lineTo(g.x + s * 0.95, g.y);
        ctx.strokeStyle = pl.glyph;
        ctx.lineWidth = Math.max(0.6, s * 0.09);
        ctx.stroke();
      } else if (g.k === 'h') {
        ctx.beginPath();
        ctx.moveTo(g.x - s, g.y);
        ctx.quadraticCurveTo(g.x, g.y - s * 0.95, g.x + s, g.y);
        ctx.strokeStyle = pl.glyph;
        ctx.lineWidth = Math.max(0.5, s * 0.1);
        ctx.stroke();
      } else if (g.k === 't' || g.k === 'j') {
        const r = s * (g.k === 'j' ? 0.62 : 0.55);
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(g.x, g.y - s * 0.55);
        ctx.strokeStyle = pl.tree;
        ctx.lineWidth = Math.max(0.4, s * 0.12);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(g.x, g.y - s * 0.55 - r * 0.8, r, 0, Math.PI * 2);
        ctx.fillStyle = g.k === 'j' ? 'rgba(70,120,70,0.75)' : 'rgba(110,150,90,0.7)';
        ctx.fill();
        ctx.lineWidth = Math.max(0.4, s * 0.08);
        ctx.stroke();
      } else if (g.k === 's') {
        ctx.beginPath();
        ctx.moveTo(g.x - s * 0.7, g.y);
        ctx.lineTo(g.x + s * 0.7, g.y);
        for (let k = -1; k <= 1; k++) { ctx.moveTo(g.x + k * s * 0.35, g.y); ctx.lineTo(g.x + k * s * 0.45, g.y - s * 0.5); }
        ctx.strokeStyle = 'rgba(70,100,80,0.7)';
        ctx.lineWidth = Math.max(0.4, s * 0.08);
        ctx.stroke();
      } else if (g.k === 'd') {
        ctx.beginPath();
        ctx.moveTo(g.x - s * 0.8, g.y);
        ctx.quadraticCurveTo(g.x - s * 0.2, g.y - s * 0.45, g.x + s * 0.5, g.y);
        ctx.strokeStyle = 'rgba(170,130,80,0.6)';
        ctx.lineWidth = Math.max(0.4, s * 0.08);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  function markerName(mk) {
    if (mk.name) return mk.name;
    if (mk.entryId) {
      const e = P().entries.find((x) => x.id === mk.entryId);
      if (e) return e.name;
    }
    return '';
  }

  function drawMarker(ctx, mk, pl, sc) {
    const x = mk.x;
    const y = mk.y;
    const s = sc;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = pl.ink;
    ctx.fillStyle = pl.ink;
    ctx.lineWidth = 1.3 * s;
    const paper = '#fbf7ee';
    const circle = (r, fill) => { ctx.beginPath(); ctx.arc(x, y, r * s, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };
    switch (mk.type) {
      case 'capital': {
        circle(7.5, paper);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5;
          const r = (i % 2 ? 2.4 : 5.6) * s;
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = '#b23a2a';
        ctx.fill();
        break;
      }
      case 'city': circle(5.2, paper); ctx.beginPath(); ctx.arc(x, y, 2.6 * s, 0, Math.PI * 2); ctx.fillStyle = pl.ink; ctx.fill(); break;
      case 'town': circle(3.6, pl.ink); break;
      case 'village': circle(2.3, paper); break;
      case 'castle': {
        ctx.beginPath();
        const w = 5.5 * s;
        ctx.moveTo(x - w, y + 4 * s);
        ctx.lineTo(x - w, y - 4 * s);
        ctx.lineTo(x - w * 0.6, y - 4 * s); ctx.lineTo(x - w * 0.6, y - 2.4 * s);
        ctx.lineTo(x - w * 0.2, y - 2.4 * s); ctx.lineTo(x - w * 0.2, y - 4 * s);
        ctx.lineTo(x + w * 0.2, y - 4 * s); ctx.lineTo(x + w * 0.2, y - 2.4 * s);
        ctx.lineTo(x + w * 0.6, y - 2.4 * s); ctx.lineTo(x + w * 0.6, y - 4 * s);
        ctx.lineTo(x + w, y - 4 * s);
        ctx.lineTo(x + w, y + 4 * s);
        ctx.closePath();
        ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y + 4 * s, 1.8 * s, Math.PI, 0); ctx.fillStyle = pl.ink; ctx.fill();
        break;
      }
      case 'fort': ctx.beginPath(); ctx.rect(x - 4 * s, y - 4 * s, 8 * s, 8 * s); ctx.fillStyle = paper; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.rect(x - 1.6 * s, y - 1.6 * s, 3.2 * s, 3.2 * s); ctx.fillStyle = pl.ink; ctx.fill(); break;
      case 'port': {
        circle(5.5, paper);
        ctx.beginPath();
        ctx.moveTo(x, y - 3.6 * s); ctx.lineTo(x, y + 3.4 * s);
        ctx.moveTo(x - 2.2 * s, y - 1.8 * s); ctx.lineTo(x + 2.2 * s, y - 1.8 * s);
        ctx.moveTo(x - 3 * s, y + 1 * s); ctx.quadraticCurveTo(x, y + 5 * s, x + 3 * s, y + 1 * s);
        ctx.stroke();
        break;
      }
      case 'temple': {
        ctx.beginPath();
        ctx.moveTo(x - 5.5 * s, y - 1.5 * s); ctx.lineTo(x, y - 5.5 * s); ctx.lineTo(x + 5.5 * s, y - 1.5 * s); ctx.closePath();
        ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(x - 4 * s, y - 1.5 * s, 8 * s, 5.5 * s); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 1.8 * s, y - 1.5 * s); ctx.lineTo(x - 1.8 * s, y + 4 * s); ctx.moveTo(x + 1.8 * s, y - 1.5 * s); ctx.lineTo(x + 1.8 * s, y + 4 * s); ctx.stroke();
        break;
      }
      case 'ruin': {
        ctx.beginPath();
        ctx.moveTo(x - 4.5 * s, y + 4 * s); ctx.lineTo(x - 4.5 * s, y - 3 * s); ctx.lineTo(x - 2.5 * s, y - 4.5 * s); ctx.lineTo(x - 2.5 * s, y + 4 * s);
        ctx.moveTo(x + 1 * s, y + 4 * s); ctx.lineTo(x + 1 * s, y - 1 * s); ctx.lineTo(x + 3.5 * s, y - 2.2 * s); ctx.lineTo(x + 3.5 * s, y + 4 * s);
        ctx.moveTo(x - 5.5 * s, y + 4 * s); ctx.lineTo(x + 5 * s, y + 4 * s);
        ctx.stroke();
        break;
      }
      case 'cave': {
        ctx.beginPath();
        ctx.moveTo(x - 6 * s, y + 3.5 * s); ctx.quadraticCurveTo(x, y - 8 * s, x + 6 * s, y + 3.5 * s); ctx.closePath();
        ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 2.4 * s, y + 3.5 * s); ctx.quadraticCurveTo(x, y - 2.6 * s, x + 2.4 * s, y + 3.5 * s); ctx.closePath();
        ctx.fillStyle = pl.ink; ctx.fill();
        break;
      }
      case 'tower': {
        ctx.beginPath(); ctx.moveTo(x - 2.6 * s, y + 5 * s); ctx.lineTo(x - 1.8 * s, y - 4 * s); ctx.lineTo(x + 1.8 * s, y - 4 * s); ctx.lineTo(x + 2.6 * s, y + 5 * s); ctx.closePath();
        ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 2.6 * s, y - 4 * s); ctx.lineTo(x, y - 7.5 * s); ctx.lineTo(x + 2.6 * s, y - 4 * s); ctx.closePath(); ctx.fillStyle = pl.ink; ctx.fill();
        break;
      }
      case 'peak': ctx.beginPath(); ctx.moveTo(x - 5 * s, y + 3.5 * s); ctx.lineTo(x, y - 5 * s); ctx.lineTo(x + 5 * s, y + 3.5 * s); ctx.closePath(); ctx.fillStyle = pl.ink; ctx.fill(); break;
      case 'station': {
        ctx.beginPath(); ctx.rect(x - 6 * s, y - 2.8 * s, 12 * s, 5.6 * s); ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(x - 6 * s, y - 2.8 * s, 6 * s, 5.6 * s); ctx.fillStyle = pl.ink; ctx.fill();
        break;
      }
      case 'school': circle(5.5, paper); drawGlyphChar(ctx, '文', x, y, 7 * s, pl.ink); break;
      case 'hospital': circle(5.5, paper); ctx.beginPath(); ctx.moveTo(x, y - 3.2 * s); ctx.lineTo(x, y + 3.2 * s); ctx.moveTo(x - 3.2 * s, y); ctx.lineTo(x + 3.2 * s, y); ctx.lineWidth = 1.8 * s; ctx.strokeStyle = '#b23a2a'; ctx.stroke(); break;
      case 'shrine': {
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(x - 5.5 * s, y - 4 * s); ctx.quadraticCurveTo(x, y - 5.4 * s, x + 5.5 * s, y - 4 * s);
        ctx.moveTo(x - 4 * s, y - 1.8 * s); ctx.lineTo(x + 4 * s, y - 1.8 * s);
        ctx.moveTo(x - 3 * s, y - 4.6 * s); ctx.lineTo(x - 3.4 * s, y + 4.5 * s);
        ctx.moveTo(x + 3 * s, y - 4.6 * s); ctx.lineTo(x + 3.4 * s, y + 4.5 * s);
        ctx.strokeStyle = '#b23a2a';
        ctx.stroke();
        break;
      }
      case 'shop': ctx.beginPath(); ctx.rect(x - 4 * s, y - 2 * s, 8 * s, 6 * s); ctx.fillStyle = paper; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 5 * s, y - 2 * s); ctx.lineTo(x - 3.5 * s, y - 5 * s); ctx.lineTo(x + 3.5 * s, y - 5 * s); ctx.lineTo(x + 5 * s, y - 2 * s); ctx.closePath(); ctx.fillStyle = '#d9a441'; ctx.fill(); ctx.stroke(); break;
      case 'house': ctx.beginPath(); ctx.moveTo(x - 4 * s, y + 4 * s); ctx.lineTo(x - 4 * s, y - 1 * s); ctx.lineTo(x, y - 4.5 * s); ctx.lineTo(x + 4 * s, y - 1 * s); ctx.lineTo(x + 4 * s, y + 4 * s); ctx.closePath(); ctx.fillStyle = paper; ctx.fill(); ctx.stroke(); break;
      case 'park': ctx.beginPath(); ctx.arc(x, y - 1.5 * s, 4 * s, 0, Math.PI * 2); ctx.fillStyle = '#6a994e'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y + 2.5 * s); ctx.lineTo(x, y + 5 * s); ctx.stroke(); break;
      default: {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x - 5 * s, y - 6 * s, x - 5 * s, y - 12 * s, x, y - 12 * s);
        ctx.bezierCurveTo(x + 5 * s, y - 12 * s, x + 5 * s, y - 6 * s, x, y);
        ctx.fillStyle = '#b23a2a';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y - 8 * s, 1.8 * s, 0, Math.PI * 2); ctx.fillStyle = paper; ctx.fill();
      }
    }
    ctx.restore();
    const name = markerName(mk);
    if (name) {
      const def = MARKERS[mk.type] || MARKERS.pin;
      const fs = def.size * sc;
      const offX = (mk.type === 'capital' ? 10 : 8) * sc;
      drawText(ctx, name, 0, 0, { size: fs, weight: mk.type === 'capital' || mk.type === 'city' ? 700 : 500, color: pl.ink, halo: pl.halo, align: 'left', x: x + offX, y: y + fs * 0.36 });
    }
  }

  function drawGlyphChar(ctx, ch, x, y, size, color) {
    ctx.save();
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(ch, x, y + size * 0.05);
    ctx.restore();
  }

  /** 文字を描く（字間・縦書き・回転・縁取り対応）。戻り値は大きさ */
  function drawText(ctx, text, cx, cy, o) {
    text = String(text || '');
    const size = o.size || 14;
    ctx.save();
    ctx.font = `${o.weight || 500} ${size}px ${FONT}`;
    ctx.textBaseline = 'middle';
    const chars = Array.from(text);
    const spacing = (o.spacing || 0) * size;
    let w;
    let hgt;
    if (o.vertical) {
      w = size * 1.1;
      hgt = chars.length * (size + spacing) - spacing;
    } else {
      const widths = chars.map((c) => ctx.measureText(c).width);
      w = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
      hgt = size * 1.2;
      o._widths = widths;
    }
    if (o.align === 'left') {
      ctx.translate(o.x, o.y);
    } else {
      ctx.translate(cx, cy);
      if (o.rotation) ctx.rotate(o.rotation * Math.PI / 180);
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.halo || 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, size * 0.24);
    ctx.fillStyle = o.color || '#222';
    const passes = [(c, x, y) => ctx.strokeText(c, x, y), (c, x, y) => ctx.fillText(c, x, y)];
    passes.forEach((fn) => {
      if (o.vertical) {
        ctx.textAlign = 'center';
        let y = -hgt / 2 + size / 2;
        chars.forEach((c) => { fn(c, 0, y); y += size + spacing; });
      } else {
        ctx.textAlign = 'left';
        let x = o.align === 'left' ? 0 : -w / 2;
        chars.forEach((c, i) => { fn(c, x, 0); x += o._widths[i] + spacing; });
      }
    });
    ctx.restore();
    return { w, h: hgt };
  }

  function drawCompass(ctx, x, y, r, pl) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = pl.ink;
    ctx.lineWidth = r * 0.04;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 - Math.PI / 2;
      const len = i % 2 ? r * 0.55 : r;
      const wdt = i % 2 ? r * 0.09 : r * 0.14;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(0, -wdt); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fillStyle = pl.ink; ctx.fill();
      ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(0, wdt); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fillStyle = '#fbf7ee'; ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    drawText(ctx, '北', x, y - r - r * 0.3, { size: r * 0.42, weight: 700, color: pl.ink, halo: pl.halo });
  }

  function drawScale(ctx, pl, sc) {
    const m = M.map;
    const kmPerCell = m.style.kmPerCell || 5;
    const kmPerPx = kmPerCell / m.cell;
    const target = 120 * sc * kmPerPx;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const nice = [1, 2, 5, 10].map((k) => k * pow).reverse().find((v) => v <= target) || pow;
    const len = nice / kmPerPx;
    const x = 22 * sc;
    const y = M.Hpx - 24 * sc;
    ctx.save();
    ctx.fillStyle = pl.halo;
    ctx.fillRect(x - 6 * sc, y - 16 * sc, len + 12 * sc, 26 * sc);
    ctx.strokeStyle = pl.ink;
    ctx.lineWidth = 1 * sc;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#fbf7ee' : pl.ink;
      ctx.fillRect(x + (len / 4) * i, y, len / 4, 4 * sc);
    }
    ctx.strokeRect(x, y, len, 4 * sc);
    ctx.restore();
    const label = nice >= 1 ? `${nice} km` : `${Math.round(nice * 1000)} m`;
    drawText(ctx, '0', 0, 0, { size: 10 * sc, color: pl.ink, halo: pl.halo, align: 'left', x: x - 2 * sc, y: y - 7 * sc });
    drawText(ctx, label, 0, 0, { size: 10 * sc, color: pl.ink, halo: pl.halo, align: 'left', x: x + len - 14 * sc, y: y - 7 * sc });
  }

  function drawOverlay(ctx) {
    const z = M.zoom;
    const m = M.map;
    ctx.save();
    ctx.lineWidth = 1.5 / z;
    // 選択
    const sel = M.sel;
    const obj = getSelObj(sel);
    if (obj) {
      ctx.strokeStyle = '#2f6fed';
      ctx.setLineDash([4 / z, 3 / z]);
      if (sel.kind === 'marker') {
        ctx.beginPath(); ctx.arc(obj.x, obj.y, 11 * (m.cell / 6) + 2 / z, 0, Math.PI * 2); ctx.stroke();
      } else if (sel.kind === 'label') {
        const box = M.labelBoxes.get(obj.id);
        if (box) {
          ctx.save();
          ctx.translate(obj.x, obj.y);
          ctx.rotate((obj.rotation || 0) * Math.PI / 180);
          ctx.strokeRect(-box.w / 2 - 4 / z, -box.h / 2 - 3 / z, box.w + 8 / z, box.h + 6 / z);
          ctx.restore();
        }
      } else {
        tracePath(ctx, obj.points, sel.kind === 'area');
        ctx.stroke();
        ctx.setLineDash([]);
        obj.points.forEach((pt, i) => {
          ctx.fillStyle = sel.vertex === i ? '#2f6fed' : '#fff';
          ctx.fillRect(pt[0] - 3.5 / z, pt[1] - 3.5 / z, 7 / z, 7 / z);
          ctx.strokeRect(pt[0] - 3.5 / z, pt[1] - 3.5 / z, 7 / z, 7 / z);
        });
      }
    }
    // 作図中の線
    if (M.draft && M.draft.length) {
      const pts = M.draft.concat(M.hover ? [[M.hover.x, M.hover.y]] : []);
      ctx.setLineDash([5 / z, 4 / z]);
      ctx.strokeStyle = M.tool === 'area' ? M.areaColor : '#2f6fed';
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
      if (M.tool === 'area' && pts.length > 2) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      M.draft.forEach((pt) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pt[0], pt[1], 3.5 / z, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    }
    // ブラシの範囲
    const def = TOOLS.find((t) => t.id === M.tool);
    if (M.hover && def && (def.group === 'terrain' || def.id === 'biome') && !M.space) {
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(20,20,20,0.7)';
      ctx.lineWidth = 1.2 / z;
      ctx.beginPath(); ctx.arc(M.hover.x, M.hover.y, M.brush.size * m.cell, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(M.hover.x, M.hover.y, M.brush.size * m.cell + 1.2 / z, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // ───── 書き出し ─────
  function exportPng() {
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = M.W * scale;
    c.height = M.Hpx * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    renderMap(ctx, scale, false);
    c.toBlob((blob) => {
      if (!blob) { toast('書き出せませんでした', 'error'); return; }
      UI.download(UI.safeFilename(M.map.name) + '.png', blob);
      toast('PNG を書き出しました');
    }, 'image/png');
  }

  // ───── パネル ─────
  function renderInspector(focusName) {
    if (!M || !M.inspector) return;
    const box = M.inspector;
    clear(box);
    const sel = M.sel;
    const obj = getSelObj(sel);
    if (obj) box.appendChild(selectionPane(sel, obj));
    else box.appendChild(toolPane());
    if (!obj) box.appendChild(mapPane());
    if (focusName) {
      const f = box.querySelector('[data-focus]');
      if (f) setTimeout(() => { f.focus(); f.select && f.select(); }, 30);
    }
  }

  function section(title, ...children) {
    return h('section', { class: 'insp-section' }, h('h3', null, title), ...children);
  }

  function range(value, min, max, step, onInput, fmt) {
    const out = h('span', { class: 'muted small range-out' }, fmt ? fmt(value) : value);
    const r = h('input', { type: 'range', class: 'range', min, max, step, value, oninput: (e) => { const v = parseFloat(e.target.value); out.textContent = fmt ? fmt(v) : v; onInput(v); } });
    return h('div', { class: 'row' }, r, out);
  }

  function toolPane() {
    const t = TOOLS.find((x) => x.id === M.tool);
    const parts = [h('p', { class: 'muted small' }, t.hint)];
    if (t.group === 'terrain' || t.id === 'biome') {
      parts.push(UI.field('ブラシの大きさ（[ ] キー）', range(M.brush.size, 1, 30, 1, (v) => { M.brush.size = v; draw(); })));
      parts.push(UI.field('強さ', range(M.brush.strength, 0.1, 1, 0.05, (v) => { M.brush.strength = v; }, (v) => Math.round(v * 100) + '%')));
    }
    if (t.id === 'biome') {
      parts.push(h('div', { class: 'swatch-grid' }, E.BIOMES.map((b) => {
        const color = b.id ? 'rgb(' + (pal().biome[b.id] || [200, 200, 200]).join(',') + ')' : 'rgb(' + pal().ramp[0][1].map(Math.round).join(',') + ')';
        return h('button', {
          type: 'button', class: 'swatch-btn' + (M.biome === b.id ? ' active' : ''),
          onclick: () => { M.biome = b.id; renderInspector(); },
        }, h('span', { class: 'swatch', style: { background: color } }), b.label);
      })));
    }
    if (t.id === 'line') {
      parts.push(h('div', { class: 'swatch-grid' }, Object.keys(LINE_KINDS).map((k) => h('button', {
        type: 'button', class: 'swatch-btn' + (M.lineKind === k ? ' active' : ''), onclick: () => { M.lineKind = k; renderInspector(); },
      }, h('span', { class: 'line-sample ls-' + k }), LINE_KINDS[k].label))));
    }
    if (t.id === 'area') {
      parts.push(h('div', { class: 'swatches' }, AREA_COLORS.map((c) => h('button', {
        type: 'button', class: 'swatch' + (M.areaColor === c ? ' active' : ''), style: { background: c }, 'aria-label': c,
        onclick: () => { M.areaColor = c; renderInspector(); },
      }))));
    }
    if (t.id === 'marker') {
      parts.push(h('div', { class: 'marker-grid' }, Object.keys(MARKERS).map((k) => h('button', {
        type: 'button', class: 'swatch-btn' + (M.markerType === k ? ' active' : ''), onclick: () => { M.markerType = k; renderInspector(); },
      }, markerIcon(k), MARKERS[k].label))));
    }
    if (t.id === 'label') {
      parts.push(h('div', { class: 'swatch-grid' }, Object.keys(LABEL_STYLES).map((k) => h('button', {
        type: 'button', class: 'swatch-btn' + (M.labelStyle === k ? ' active' : ''), onclick: () => { M.labelStyle = k; renderInspector(); },
      }, LABEL_STYLES[k].label))));
    }
    if (M.draft) {
      parts.push(h('div', { class: 'row' },
        btn('確定', { small: true, primary: true, icon: 'check', onClick: finishDraft }),
        btn('1点戻す', { small: true, onClick: () => { M.draft.pop(); if (!M.draft.length) M.draft = null; updateHint(); draw(); renderInspector(); } }),
        btn('取り消し', { small: true, ghost: true, onClick: () => { M.draft = null; updateHint(); draw(); renderInspector(); } })));
    }
    return section('道具：' + t.label, ...parts);
  }

  function markerIcon(type) {
    const c = h('canvas', { width: 44, height: 44, class: 'marker-icon', 'aria-hidden': 'true' });
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    drawMarker(ctx, { x: 11, y: type === 'pin' ? 17 : 11, type, name: '' }, pal(), 1);
    return c;
  }

  function selectionPane(sel, obj) {
    const p = P();
    const m = M.map;
    const parts = [];
    const del = btn('削除', { icon: 'trash', small: true, danger: true, ghost: true, onClick: deleteSelection });
    const changed = (redrawInsp) => { commit(); draw(); if (redrawInsp) renderInspector(); };
    let undoPushed = false;
    const beginEdit = () => { if (!undoPushed) { pushUndo(); undoPushed = true; } };
    if (sel.kind === 'marker') {
      const entry = obj.entryId ? p.entries.find((x) => x.id === obj.entryId) : null;
      parts.push(UI.field('名前', h('input', {
        class: 'input', type: 'text', value: obj.name, placeholder: entry ? entry.name : '地名', dataset: { focus: '1' },
        oninput: (e) => { beginEdit(); obj.name = e.target.value; changed(); },
      })));
      parts.push(UI.field('種類', h('select', { class: 'input', onchange: (e) => { beginEdit(); obj.type = e.target.value; changed(true); } },
        Object.keys(MARKERS).map((k) => h('option', { value: k, selected: obj.type === k }, MARKERS[k].label)))));
      const places = p.entries.filter((x) => x.type === 'place');
      parts.push(UI.field('設定資料とつなぐ', h('select', {
        class: 'input', onchange: (e) => {
          beginEdit();
          obj.entryId = e.target.value;
          const en = p.entries.find((x) => x.id === obj.entryId);
          if (en && !obj.name) obj.name = '';
          changed(true);
        },
      }, h('option', { value: '' }, '（つながっていない）'), places.map((x) => h('option', { value: x.id, selected: x.id === obj.entryId }, x.name)))));
      if (entry) {
        parts.push(h('div', { class: 'linked-entry' },
          NS.Lore.summaryList(entry, p),
          btn('設定資料を開く', { small: true, icon: 'users', onClick: () => NS.App.navigate('lore', { id: entry.id }) })));
      } else {
        parts.push(btn('この地点を設定資料に登録', { small: true, icon: 'plus', onClick: () => {
          const name = obj.name || '新しい場所';
          const e = NS.Lore.newEntry('place', name);
          e.fields.kind = MARKERS[obj.type] ? MARKERS[obj.type].label : '';
          if (obj.note) e.fields.desc = obj.note;
          p.entries.push(e);
          beginEdit();
          obj.entryId = e.id;
          changed(true);
          toast(`「${name}」を設定資料の「場所」に登録しました`);
        } }));
      }
      parts.push(UI.field('メモ', h('textarea', { class: 'input', rows: 3, value: obj.note || '', oninput: (e) => { obj.note = e.target.value; commit(); } })));
    } else if (sel.kind === 'label') {
      parts.push(UI.field('文字', h('input', { class: 'input', type: 'text', value: obj.text, dataset: { focus: '1' }, oninput: (e) => { beginEdit(); obj.text = e.target.value; changed(); } })));
      parts.push(UI.field('種類', h('select', { class: 'input', onchange: (e) => { beginEdit(); obj.style = e.target.value; obj.size = LABEL_STYLES[obj.style].size; changed(true); } },
        Object.keys(LABEL_STYLES).map((k) => h('option', { value: k, selected: obj.style === k }, LABEL_STYLES[k].label)))));
      parts.push(UI.field('大きさ', range(obj.size || 20, 8, 72, 1, (v) => { beginEdit(); obj.size = v; changed(); })));
      parts.push(UI.field('回転', range(obj.rotation || 0, -90, 90, 1, (v) => { beginEdit(); obj.rotation = v; changed(); }, (v) => v + '°')));
      parts.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!obj.vertical, onchange: (e) => { beginEdit(); obj.vertical = e.target.checked; changed(); } }), '縦書き'));
    } else if (sel.kind === 'line') {
      parts.push(UI.field('種類', h('select', { class: 'input', onchange: (e) => { beginEdit(); obj.kind = e.target.value; changed(); } },
        Object.keys(LINE_KINDS).map((k) => h('option', { value: k, selected: obj.kind === k }, LINE_KINDS[k].label)))));
      parts.push(UI.field('名前（メモ）', h('input', { class: 'input', type: 'text', value: obj.name || '', oninput: (e) => { obj.name = e.target.value; commit(); } }),
        '地図に名前を書くには「文字」道具を使います'));
      parts.push(h('p', { class: 'muted small' }, `頂点 ${obj.points.length}個。頂点をドラッグで移動、選んでDeleteで削除できます。`));
      parts.push(btn('向きを反転（川の上流・下流）', { small: true, onClick: () => { beginEdit(); obj.points.reverse(); changed(); } }));
    } else if (sel.kind === 'area') {
      parts.push(UI.field('名前', h('input', { class: 'input', type: 'text', value: obj.name || '', dataset: { focus: '1' }, placeholder: '例：エルミナ王国', oninput: (e) => { beginEdit(); obj.name = e.target.value; changed(); } })));
      parts.push(UI.field('色', h('div', { class: 'swatches' }, AREA_COLORS.map((c) => h('button', {
        type: 'button', class: 'swatch' + (obj.color === c ? ' active' : ''), style: { background: c }, 'aria-label': c,
        onclick: () => { beginEdit(); obj.color = c; changed(true); },
      })))));
    }
    parts.push(h('div', { class: 'row' }, del, btn('選択を解除', { small: true, ghost: true, onClick: () => { M.sel = null; renderInspector(); draw(); } })));
    const title = { marker: '地点', label: '文字', line: '線：' + (LINE_KINDS[obj.kind] ? LINE_KINDS[obj.kind].label : ''), area: '領域' }[sel.kind];
    return section(title, ...parts);
  }

  function mapPane() {
    const p = P();
    const m = M.map;
    const st = m.style;
    const set = (k, v) => { st[k] = v; commit(); draw(); };
    const toggle = (k, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st[k], onchange: (e) => set(k, e.target.checked) }), label);
    const markerList = h('div', { class: 'marker-list' }, m.markers.length ? m.markers.map((mk) => h('button', {
      type: 'button', class: 'marker-row', onclick: () => { M.sel = { kind: 'marker', id: mk.id }; centerOn(mk.x, mk.y); renderInspector(); },
    }, h('span', { class: 'muted small' }, (MARKERS[mk.type] || MARKERS.pin).label), h('span', null, markerName(mk) || '（名前なし）'), mk.entryId ? icon('link', 14) : null)) : h('p', { class: 'muted small' }, 'まだ地点がありません。「地点」道具で置けます。'));
    return h('div', null,
      section('地点の一覧', markerList),
      section('地図の設定',
        UI.field('名前', h('input', { class: 'input', type: 'text', value: m.name, onchange: (e) => { m.name = e.target.value || '地図'; commit(); draw(); build(); } })),
        UI.field('配色', h('select', { class: 'input', onchange: (e) => { st.palette = e.target.value; terrainChanged(true); commit(); renderInspector(); } },
          Object.keys(E.PALETTES).map((k) => h('option', { value: k, selected: st.palette === k }, E.PALETTES[k].label)))),
        UI.field('縮尺（1マス＝何km）', h('input', { class: 'input input-num', type: 'number', min: 0.01, step: 0.5, value: st.kmPerCell, onchange: (e) => set('kmPerCell', Math.max(0.01, parseFloat(e.target.value) || 1)) }),
          `地図の横幅 ≒ ${UI.fmtNum(m.gw * st.kmPerCell)} km`),
        h('div', { class: 'check-grid' },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.hillshade !== false, onchange: (e) => { st.hillshade = e.target.checked; terrainChanged(true); commit(); } }), '起伏の陰影'),
          toggle('glyphs', '山・森の記号'), toggle('grid', '方眼'), toggle('compass', '方位記号'), toggle('scale', '縮尺'), toggle('title', '題名')),
        h('div', { class: 'row wrap' },
          btn('地形を作り直す', { icon: 'dice', small: true, onClick: () => newMapDialog(true) }),
          btn('PNGで書き出す', { icon: 'image', small: true, onClick: exportPng })),
        h('div', { class: 'row wrap' },
          btn('地図を複製', { icon: 'copy', small: true, ghost: true, onClick: () => {
            const copy = JSON.parse(JSON.stringify(m));
            copy.id = UI.uid('m');
            copy.name += '（複製）';
            p.maps.push(copy);
            NS.App.touch();
            NS.App.navigate('map', { id: copy.id });
          } }),
          btn('地図を削除', { icon: 'trash', small: true, danger: true, ghost: true, onClick: async () => {
            if (!(await UI.confirm(`地図「${m.name}」を削除します。元に戻せません。`, { danger: true, okLabel: '削除' }))) return;
            p.maps.splice(p.maps.indexOf(m), 1);
            NS.App.touch();
            NS.App.navigate('map', p.maps[0] ? { id: p.maps[0].id } : {});
          } }))),
      section('操作のヒント', h('ul', { class: 'hint-list small muted' },
        h('li', null, 'ホイール／ピンチで拡大縮小、スペース＋ドラッグで移動'),
        h('li', null, '道具はキーでも切り替え（V 選択・B 陸・N 海・R 山・L 線・M 地点・T 文字）'),
        h('li', null, 'Ctrl+Z で元に戻す、Ctrl+Shift+Z でやり直す'))));
  }

  V.MARKERS = MARKERS;
  NS.Views.map = V;
})(window.Tsuzuri = window.Tsuzuri || {});
