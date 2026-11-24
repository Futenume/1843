/*
 * 綴り — 空想地図エディタ（Inkarnate / Wonderdraft 風）
 * 陸・海のブラシ、起伏、地面の質感、素材（山・木・町・城…）のスタンプと散布ブラシ、消しゴム、
 * 川・道・国境などの線（クリックでもフリーハンドでも）、領域、曲線・縦書きの文字、レイヤー、
 * 複数選択、元に戻す/やり直す、設定資料（場所）との連携、高解像度の PNG 書き出し。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;
  const E = NS.MapEngine;
  const AS = NS.MapAssets;

  const TOOLS = [
    { id: 'select', label: '選択', icon: 'cursor', key: 'v', hint: 'クリックで選択、ドラッグで移動。何もない所をドラッグで範囲選択（Shift で追加）。Delete で削除' },
    { id: 'pan', label: '移動', icon: 'hand', key: 'h', hint: 'ドラッグで地図を動かします（スペースキー・中ボタン・2本指でも可）' },
    { id: 'land', label: '陸', icon: 'brush', key: 'b', brush: true, terrain: true, hint: 'なぞった所を陸地にします' },
    { id: 'water', label: '海・湖', icon: 'wave', key: 'n', brush: true, terrain: true, hint: 'なぞった所を海や湖にします' },
    { id: 'relief', label: '起伏', icon: 'mountain', key: 'r', brush: true, terrain: true, hint: '土地を高く・低く・なだらかにします（陰影が変わります）' },
    { id: 'ground', label: '地面', icon: 'layers', key: 'g', brush: true, hint: '森の地面・砂漠・雪原・農地などの質感を塗ります' },
    { id: 'stamp', label: '素材', icon: 'tree', key: 's', hint: 'クリックした所に素材を置きます。Q/E で回転、[ ] で大きさ' },
    { id: 'scatter', label: '散布', icon: 'sparkles', key: 'f', brush: true, hint: 'なぞった所に森や山脈をまとめて描きます' },
    { id: 'erase', label: '消す', icon: 'eraser', key: 'x', brush: true, hint: 'なぞった所の素材を消します' },
    { id: 'path', label: '道・川', icon: 'route', key: 'l', hint: 'ドラッグでフリーハンド、クリックで点を打ってダブルクリック／Enterで確定' },
    { id: 'area', label: '領域', icon: 'polygon', key: 'a', hint: 'ドラッグで囲むか、クリックで頂点を打ち、始点をクリック／Enterで確定' },
    { id: 'label', label: '文字', icon: 'text', key: 't', hint: 'クリックした所に地名などの文字を置きます' },
  ];

  const PATH_KINDS = {
    river: { label: '川', wobble: 0.55 },
    stream: { label: '小川', wobble: 0.6 },
    highway: { label: '街道', wobble: 0.12 },
    road: { label: '道', wobble: 0.18 },
    trail: { label: '小道', wobble: 0.3 },
    rail: { label: '鉄道', wobble: 0 },
    border: { label: '国境・境界', wobble: 0.2 },
    wall: { label: '城壁・長城', wobble: 0.05 },
    route: { label: '航路', wobble: 0.08 },
  };

  const FONTS = {
    serif: { label: '明朝', family: '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif' },
    shippori: { label: 'しっぽり明朝', family: '"Shippori Mincho", "Noto Serif JP", serif' },
    antique: { label: '古風（Zen Antique）', family: '"Zen Antique", "Noto Serif JP", serif' },
    brush: { label: '筆文字（佑字肅）', family: '"Yuji Syuku", "Noto Serif JP", serif' },
    klee: { label: '手書き（クレー）', family: '"Klee One", "Noto Sans JP", sans-serif' },
    sans: { label: 'ゴシック', family: '"Noto Sans JP", "Hiragino Sans", sans-serif' },
    dela: { label: '極太（Dela Gothic）', family: '"Dela Gothic One", "Noto Sans JP", sans-serif' },
  };

  const LABEL_STYLES = {
    region: { label: '国名', font: 'shippori', size: 30, weight: 700, spacing: 0.55, color: 'ink' },
    area: { label: '地方・領地', font: 'shippori', size: 18, weight: 600, spacing: 0.4, color: 'ink' },
    sea: { label: '海・湖', font: 'shippori', size: 20, weight: 500, spacing: 0.7, color: 'water' },
    range: { label: '山脈・森', font: 'antique', size: 15, weight: 400, spacing: 0.35, color: 'glyph' },
    river: { label: '川', font: 'serif', size: 11, weight: 500, spacing: 0.2, color: 'water' },
    city: { label: '都市', font: 'serif', size: 13, weight: 700, spacing: 0.08, color: 'ink' },
    place: { label: '小さな地名', font: 'serif', size: 10.5, weight: 500, spacing: 0.05, color: 'ink' },
    title: { label: '題字', font: 'brush', size: 40, weight: 400, spacing: 0.15, color: 'ink' },
  };
  const LABEL_COLORS = [['', '既定'], ['#3a2e24', '墨'], ['#4c7aa3', '青'], ['#8c3b2a', '赤茶'], ['#2f6b3b', '緑'], ['#6a4f9a', '紫'], ['#b8892a', '金'], ['#ffffff', '白']];
  const AREA_COLORS = ['#c8553d', '#d9a441', '#6a994e', '#3d7ea6', '#5f4b8b', '#b5838d', '#2a9d8f', '#7f5539'];

  // 道具の設定（画面を切り替えても保つ）
  const PREF = Object.assign({
    tool: 'select', brush: { size: 6, strength: 0.7 }, relief: 'raise', biome: 1,
    stamp: { a: 'castle', cat: '町・建物', s: 1, r: 0, randVar: true, randFlip: true },
    scatter: { set: 'forest', size: 22, density: 1, scale: 1 }, erase: { size: 16 },
    path: { kind: 'river', w: 1 }, area: { color: AREA_COLORS[0], opacity: 0.22 }, label: { style: 'region' },
  }, UI.lsGet('tsuzuri.mapPref', null) || {});
  function savePref() { UI.lsSet('tsuzuri.mapPref', PREF); }

  function P() { return NS.App.project; }
  const V = {};
  let M = null;

  V.mount = function (view, params) {
    const p = P();
    M = {
      view, draft: null, freehand: null, sel: [], vertex: null, drag: null, undo: [], redo: [], pointers: new Map(),
      hover: null, space: false, labelBoxes: new Map(), clipboard: null, userMoved: false,
    };
    const id = params.id || p.lastMapId;
    const map = p.maps.find((m) => m.id === id) || p.maps[0];
    if (!map) { renderEmpty(); return; }
    openMap(map);
  };

  V.unmount = function () {
    if (!M) return;
    if (M.raf) cancelAnimationFrame(M.raf);
    if (M.job) M.job.cancel = true;
    if (M.ro) M.ro.disconnect();
    if (M.onKey) { document.removeEventListener('keydown', M.onKey); document.removeEventListener('keyup', M.onKeyUp); }
    document.querySelectorAll('.popover').forEach((x) => x.remove());
    M = null;
  };

  // ───── 地図がないとき ─────
  function renderEmpty() {
    clear(M.view);
    M.view.appendChild(h('div', { class: 'map-empty' },
      h('div', { class: 'empty big' },
        icon('map', 48),
        h('h2', null, '空想地図をつくる'),
        h('p', null, '大陸や島を自動で生成し、山・森・町・城などの素材を置いたり、ブラシでまとめて描いたりして地図を仕上げます。地名は設定資料の「場所」とつなげられます。'),
        btn('新しい地図', { icon: 'plus', primary: true, onClick: () => newMapDialog() }))));
  }

  /** 新しい地図・地形の作り直し */
  function newMapDialog(regenerate) {
    const name = h('input', { class: 'input', type: 'text', value: regenerate ? M.map.name : '世界地図' });
    const preset = h('select', { class: 'input' }, Object.keys(E.PRESETS).map((k) => h('option', { value: k }, E.PRESETS[k].label)));
    const size = h('select', { class: 'input' }, [['s', '小'], ['m', '中'], ['l', '大']].map(([v, l]) => h('option', { value: v, selected: v === 'm' }, l)));
    const palette = h('select', { class: 'input' }, Object.keys(E.PALETTES).map((k) => h('option', { value: k, selected: regenerate ? M.map.style.palette === k : k === 'parchment' }, E.PALETTES[k].label)));
    const land = h('input', { type: 'range', min: 10, max: 80, value: 42, class: 'range' });
    const landOut = h('span', { class: 'muted small range-out' }, '42%');
    land.addEventListener('input', () => { landOut.textContent = land.value + '%'; });
    const seed = h('input', { class: 'input input-num', type: 'number', value: Math.floor(Math.random() * 99999) });
    const autoB = h('input', { type: 'checkbox', checked: true });
    const autoS = h('input', { type: 'checkbox', checked: true });
    const preview = h('canvas', { class: 'gen-preview', width: 300, height: 195, 'aria-label': 'プレビュー' });
    const drawPreview = () => {
      const tmp = E.newMap('p', { preset: preset.value, size: 's', seed: +seed.value || 1, land: land.value / 100, palette: palette.value, biome: autoB.checked, stamps: autoS.checked, compass: false });
      const n = tmp.gw * tmp.gh;
      const H = E.decodeHeights(tmp.height, n);
      const B = E.decodeBiomes(tmp.biome, n);
      const ctx = preview.getContext('2d');
      const res = preview.width / (tmp.gw * tmp.cell);
      const img = ctx.createImageData(preview.width, preview.height);
      E.renderTerrain(tmp, H, B, img, 0, 0, preview.width, preview.height, res);
      ctx.putImageData(img, 0, 0);
      const pk = E.PALETTES[palette.value].assets;
      tmp.stamps.forEach((st) => {
        const sp = AS.sprite(st.a, st.v, pk);
        const k = st.s * res;
        ctx.setTransform(k * (st.f ? -1 : 1), 0, 0, k, st.x * res, st.y * res);
        ctx.drawImage(sp.canvas, sp.x0, sp.y0, sp.w, sp.h);
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    const redraw = UI.debounce(drawPreview, 150);
    [preset, palette, land, seed, autoB, autoS].forEach((el) => { el.addEventListener('input', redraw); el.addEventListener('change', redraw); });
    UI.modal({
      title: regenerate ? '地形を作り直す' : '新しい地図', wide: true,
      body: h('div', { class: 'gen-dialog' },
        h('div', { class: 'stack' },
          regenerate ? h('p', { class: 'muted small' }, '陸地・地面と、山・木などの自然の素材を作り直します。町や城などの素材、名前を付けた素材、線、領域、文字はそのまま残ります（元に戻すこともできます）。') : UI.field('地図の名前', name),
          h('div', { class: 'grid-2' }, UI.field('地形', preset), regenerate ? UI.field('配色', palette) : UI.field('大きさ', size)),
          regenerate ? null : UI.field('配色', palette),
          UI.field('陸の割合', h('div', { class: 'row' }, land, landOut)),
          UI.field('シード（同じ数なら同じ地形）', h('div', { class: 'row' }, seed, btn('', { icon: 'dice', ghost: true, title: 'ランダム', onClick: () => { seed.value = Math.floor(Math.random() * 99999); drawPreview(); } }))),
          h('label', { class: 'check' }, autoB, '地面（森・砂漠・雪原など）を自動で塗る'),
          h('label', { class: 'check' }, autoS, '山・丘・森の素材を自動で置く')),
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
            const natural = new Set(['山・丘', '木・植物']);
            m.stamps = m.stamps.filter((st) => !(AS.BY_ID[st.a] && natural.has(AS.BY_ID[st.a].cat) && !st.name));
            if (autoS.checked) m.stamps = m.stamps.concat(E.autoStamps(m, M.H, M.B, sd)).sort((a, b) => a.y - b.y);
            m.style.palette = palette.value;
            M.sel = [];
            renderTerrainFull();
            commit(true);
            renderInspector();
            return;
          }
          const m = E.newMap(name.value.trim() || '地図', { preset: preset.value, size: size.value, seed: +seed.value || 1, land: land.value / 100, palette: palette.value, biome: autoB.checked, stamps: autoS.checked });
          P().maps.push(m);
          NS.App.touch();
          NS.App.navigate('map', { id: m.id });
        } },
      ],
    });
    setTimeout(drawPreview, 30);
  }

  // ───── 地図を開く ─────
  function openMap(map) {
    const p = P();
    p.lastMapId = map.id;
    E.migrate(map);
    M.map = map;
    const n = map.gw * map.gh;
    M.H = map.height ? E.decodeHeights(map.height, n) : E.generate(map.gw, map.gh, { preset: 'continent', seed: map.seed || 1 });
    M.B = map.biome ? E.decodeBiomes(map.biome, n) : new Uint8Array(n);
    M.W = map.gw * map.cell;
    M.Hpx = map.gh * map.cell;
    M.res = E.pickRes(M.W, M.Hpx);
    M.base = document.createElement('canvas');
    M.base.width = Math.round(M.W * M.res);
    M.base.height = Math.round(M.Hpx * M.res);
    M.baseCtx = M.base.getContext('2d');
    M.img = M.baseCtx.createImageData(M.base.width, M.base.height);
    // 陸地マスク（川を海岸で切るため）
    M.mask = document.createElement('canvas');
    M.mask.width = M.base.width;
    M.mask.height = M.base.height;
    M.maskCtx = M.mask.getContext('2d');
    M.maskImg = M.maskCtx.createImageData(M.base.width, M.base.height);
    M.baseCtx.fillStyle = '#e9e2d0';
    M.baseCtx.fillRect(0, 0, M.base.width, M.base.height);
    build();
    renderTerrainFull();
    fit();
    const focus = NS.App.pendingMapFocus;
    if (focus && focus.mapId === map.id) {
      NS.App.pendingMapFocus = null;
      const st = map.stamps.find((x) => x.id === (focus.stampId || focus.markerId));
      if (st) { M.sel = [{ k: 'stamp', id: st.id }]; centerOn(st.x, st.y, 2.5); setSheet(true); renderInspector(); }
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
    const layersBtn = btn('レイヤー', { icon: 'layers', small: true, ghost: true, title: 'レイヤーの表示・ロック' });
    layersBtn.addEventListener('click', () => UI.popover(layersBtn, layersPane()));
    const top = h('div', { class: 'map-topbar' },
      mapSel,
      h('div', { class: 'toolbar-group' }, M.undoBtn, M.redoBtn),
      h('div', { class: 'toolbar-group' },
        btn('', { icon: 'minus', ghost: true, title: '縮小（-）', onClick: () => zoomBy(0.8) }),
        btn('', { icon: 'plus', ghost: true, title: '拡大（+）', onClick: () => zoomBy(1.25) }),
        btn('全体', { ghost: true, small: true, title: '全体を表示（0）', onClick: fit })),
      h('div', { class: 'toolbar-group' },
        layersBtn,
        btn('書き出し', { icon: 'image', small: true, title: '画像（PNG）として書き出す', onClick: exportDialog }),
        btn('', { icon: 'info', ghost: true, title: 'キー操作の一覧（?）', onClick: showShortcuts }),
        btn('', { icon: 'panel', ghost: true, title: 'パネルを表示/隠す', onClick: () => setSheet(!M.layout.classList.contains('sheet-open')) })));

    M.toolbar = h('div', { class: 'map-tools', role: 'toolbar', 'aria-label': '地図の道具' });
    TOOLS.forEach((t) => M.toolbar.appendChild(h('button', {
      type: 'button', class: 'map-tool' + (PREF.tool === t.id ? ' active' : ''), dataset: { tool: t.id }, title: `${t.label}（${t.key.toUpperCase()}）— ${t.hint}`,
      'aria-pressed': PREF.tool === t.id ? 'true' : 'false',
      onclick: () => setTool(t.id, true),
    }, icon(t.icon, 20), h('span', null, t.label))));

    M.canvas = h('canvas', { class: 'map-canvas', tabindex: 0, 'aria-label': '地図キャンバス', dataset: { tool: PREF.tool } });
    M.ctx = M.canvas.getContext('2d');
    M.hint = h('div', { class: 'map-hint' });
    M.draftBar = h('div', { class: 'map-draftbar', hidden: true });
    M.progress = h('div', { class: 'map-progress', hidden: true });
    M.stage = h('div', { class: 'map-stage' }, M.canvas, M.hint, M.draftBar, M.progress);
    M.inspector = h('aside', { class: 'map-inspector', 'aria-label': '地図の詳細' });
    M.layout = h('div', { class: 'map-layout' + (window.innerWidth >= 900 ? ' sheet-open' : '') }, M.toolbar, M.stage, M.inspector);
    M.view.append(top, M.layout);

    bindEvents();
    M.ro = new ResizeObserver(() => resize());
    M.ro.observe(M.stage);
    resize();
    renderInspector();
    updateHint();
    updateUndoButtons();
  }

  function setSheet(open) {
    M.layout.classList.toggle('sheet-open', !!open);
    setTimeout(resize, 0);
  }

  function setTool(id, fromUser) {
    if (M.draft) finishDraft();
    PREF.tool = id;
    savePref();
    M.toolbar.querySelectorAll('.map-tool').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === id);
      b.setAttribute('aria-pressed', b.dataset.tool === id ? 'true' : 'false');
    });
    M.canvas.dataset.tool = id;
    if (id !== 'select') { M.sel = []; M.vertex = null; }
    if (fromUser && window.innerWidth < 900 && !['select', 'pan', 'erase'].includes(id)) setSheet(true);
    renderInspector();
    updateHint();
    draw();
  }

  function updateHint() {
    const t = TOOLS.find((x) => x.id === PREF.tool);
    M.hint.textContent = t ? t.hint : '';
    clear(M.draftBar);
    M.draftBar.hidden = !M.draft;
    if (M.draft) {
      M.draftBar.append(
        h('span', { class: 'small' }, PREF.tool === 'path' ? `点 ${M.draft.length}個` : `頂点 ${M.draft.length}個`),
        btn('確定', { small: true, primary: true, icon: 'check', onClick: finishDraft }),
        btn('1点戻す', { small: true, onClick: () => { M.draft.pop(); if (!M.draft.length) M.draft = null; updateHint(); draw(); } }),
        btn('取消', { small: true, ghost: true, onClick: () => { M.draft = null; updateHint(); draw(); } }));
    }
  }

  // ───── 表示 ─────
  function resize() {
    if (!M || !M.stage) return;
    const r = M.stage.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    M.dpr = window.devicePixelRatio || 1;
    M.cw = r.width;
    M.ch = r.height;
    M.canvas.width = Math.round(M.cw * M.dpr);
    M.canvas.height = Math.round(M.ch * M.dpr);
    M.canvas.style.width = M.cw + 'px';
    M.canvas.style.height = M.ch + 'px';
    if (M.zoom == null || !M.userMoved) fit(true);
    draw();
  }

  function fit(auto) {
    if (!M.cw) return;
    const pad = M.cw < 500 ? 8 : 24;
    M.zoom = Math.min((M.cw - pad * 2) / M.W, (M.ch - pad * 2) / M.Hpx);
    M.ox = (M.cw - M.W * M.zoom) / 2;
    M.oy = (M.ch - M.Hpx * M.zoom) / 2;
    if (auto !== true) M.userMoved = false;
    draw();
  }

  function centerOn(x, y, zoom) {
    if (zoom) M.zoom = Math.max(M.zoom || 1, zoom);
    M.ox = M.cw / 2 - x * M.zoom;
    M.oy = M.ch / 2 - y * M.zoom;
    M.userMoved = true;
    draw();
  }

  function zoomBy(f, sx, sy) {
    if (sx == null) { sx = M.cw / 2; sy = M.ch / 2; }
    const z = Math.max(0.1, Math.min(16, M.zoom * f));
    const wx = (sx - M.ox) / M.zoom;
    const wy = (sy - M.oy) / M.zoom;
    M.zoom = z;
    M.ox = sx - wx * z;
    M.oy = sy - wy * z;
    M.userMoved = true;
    draw();
  }

  function toWorld(e) {
    const r = M.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { x: (sx - M.ox) / M.zoom, y: (sy - M.oy) / M.zoom, sx, sy };
  }

  // ───── 地形の描画（重いので少しずつ） ─────
  function renderTerrainFull() {
    if (M.job) M.job.cancel = true;
    const job = { y: 0, cancel: false };
    M.job = job;
    const iw = M.base.width;
    const ih = M.base.height;
    M.progress.hidden = false;
    const step = () => {
      if (job.cancel || !M) return;
      const t0 = performance.now();
      const y0 = job.y;
      while (job.y < ih && performance.now() - t0 < 14) {
        const y1 = Math.min(ih, job.y + 16);
        E.renderTerrain(M.map, M.H, M.B, M.img, 0, job.y, iw, y1, M.res, M.maskImg);
        job.y = y1;
      }
      M.baseCtx.putImageData(M.img, 0, 0, 0, y0, iw, job.y - y0);
      M.maskCtx.putImageData(M.maskImg, 0, 0, 0, y0, iw, job.y - y0);
      M.progress.textContent = `地形を描いています… ${Math.round((job.y / ih) * 100)}%`;
      draw();
      if (job.y < ih) requestAnimationFrame(step);
      else { M.progress.hidden = true; M.job = null; }
    };
    requestAnimationFrame(step);
  }

  function terrainRect(wx0, wy0, wx1, wy1) {
    const r = M.res;
    const x0 = Math.max(0, Math.floor(wx0 * r));
    const y0 = Math.max(0, Math.floor(wy0 * r));
    const x1 = Math.min(M.base.width, Math.ceil(wx1 * r));
    const y1 = Math.min(M.base.height, Math.ceil(wy1 * r));
    if (x1 <= x0 || y1 <= y0) return;
    E.renderTerrain(M.map, M.H, M.B, M.img, x0, y0, x1, y1, r, M.maskImg);
    M.baseCtx.putImageData(M.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    M.maskCtx.putImageData(M.maskImg, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }

  function applyBrush(wx, wy) {
    const m = M.map;
    const tool = PREF.tool;
    if (tool === 'scatter') { scatterAt(wx, wy); return; }
    if (tool === 'erase') { eraseAt(wx, wy); return; }
    const cx = wx / m.cell - 0.5;
    const cy = wy / m.cell - 0.5;
    const r = PREF.brush.size;
    const st = PREF.brush.strength;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(m.gw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(m.gh - 1, Math.ceil(cy + r));
    const H = M.H;
    const B = M.B;
    const gw = m.gw;
    const src = tool === 'relief' && PREF.relief === 'smooth' ? H.slice() : null;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        // 中心はしっかり、縁はやわらかく
        const w = (d < 0.6 ? 1 : 1 - (d - 0.6) / 0.4) * st;
        const i = y * gw + x;
        const n = E.hash2(x, y, 77) - 0.5;
        if (tool === 'land') {
          const target = 0.1 + n * 0.05;
          if (H[i] < target) H[i] += (target - H[i]) * Math.min(1, w * 1.2);
        } else if (tool === 'water') {
          const target = -0.28 + n * 0.05;
          if (H[i] > target) H[i] += (target - H[i]) * Math.min(1, w * 1.2);
        } else if (tool === 'relief') {
          if (PREF.relief === 'raise') { if (H[i] > 0) H[i] = Math.min(1, H[i] + w * (0.08 + n * 0.05)); }
          else if (PREF.relief === 'lower') { if (H[i] > 0.02) H[i] = Math.max(0.02, H[i] - w * 0.08); }
          else {
            let s = 0;
            let c = 0;
            for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
              const X = x + xx;
              const Y = y + yy;
              if (X < 0 || Y < 0 || X >= gw || Y >= m.gh) continue;
              s += src[Y * gw + X]; c++;
            }
            H[i] += (s / c - H[i]) * Math.min(1, w);
          }
        } else if (tool === 'ground') {
          if (w > 0.15 || d < 0.85) B[i] = PREF.biome;
        }
      }
    }
    const pad = 3 * m.cell + 2;
    terrainRect(x0 * m.cell - pad, y0 * m.cell - pad, (x1 + 1) * m.cell + pad, (y1 + 1) * m.cell + pad);
    draw();
  }

  // ───── 素材の散布・消しゴム ─────
  function buildHash(cellSize) {
    const grid = new Map();
    const key = (x, y) => Math.floor(x / cellSize) + ',' + Math.floor(y / cellSize);
    M.map.stamps.forEach((st) => {
      const k = key(st.x, st.y);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(st);
    });
    return { grid, cellSize, add(st) { const k = key(st.x, st.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(st); } };
  }

  function nearAny(hash, x, y, r) {
    const cs = hash.cellSize;
    const ix = Math.floor(x / cs);
    const iy = Math.floor(y / cs);
    const n = Math.ceil(r / cs) + 1;
    for (let dy = -n; dy <= n; dy++) {
      for (let dx = -n; dx <= n; dx++) {
        const list = hash.grid.get((ix + dx) + ',' + (iy + dy));
        if (!list) continue;
        for (const st of list) {
          const a = AS.BY_ID[st.a];
          const rr = Math.max(r * 0.55, a ? a.size * 0.32 * st.s : 4);
          if (Math.abs(st.x - x) < rr && Math.abs(st.y - y) < rr * 0.7) return true;
        }
      }
    }
    return false;
  }

  function scatterAt(wx, wy) {
    const set = AS.SCATTER.find((s) => s.id === PREF.scatter.set) || AS.SCATTER[0];
    const R = PREF.scatter.size;
    const spacing = set.spacing / PREF.scatter.density * PREF.scatter.scale;
    if (!M.drag.hash) M.drag.hash = buildHash(Math.max(4, spacing));
    const tries = Math.max(2, Math.round((Math.PI * R * R) / (spacing * spacing) * 0.35));
    const m = M.map;
    let added = 0;
    for (let k = 0; k < tries; k++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * R;
      const x = wx + Math.cos(a) * rr;
      const y = wy + Math.sin(a) * rr * 0.85;
      if (x < 2 || y < 2 || x > M.W - 2 || y > M.Hpx - 2) continue;
      const hh = E.sampleH(M.H, m.gw, m.gh, m.cell, x, y);
      if (set.land && hh <= 0.01) continue;
      if (set.water && hh > -0.02) continue;
      if (nearAny(M.drag.hash, x, y, spacing)) continue;
      const aid = set.assets[Math.floor(Math.random() * set.assets.length)];
      const st = { id: E.sid(), a: aid, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, s: Math.round(PREF.scatter.scale * (0.85 + Math.random() * 0.3) * 100) / 100, r: 0, f: Math.random() < 0.5, v: Math.floor(Math.random() * 8) };
      m.stamps.push(st);
      M.drag.hash.add(st);
      added++;
    }
    if (added) { M.drag.changed = true; sortStamps(); draw(); }
  }

  function eraseAt(wx, wy) {
    if (layerLocked('stamps')) return;
    const R = PREF.erase.size;
    const before = M.map.stamps.length;
    M.map.stamps = M.map.stamps.filter((st) => Math.hypot(st.x - wx, (st.y - wy) * 1.1) > R);
    if (M.map.stamps.length !== before) { M.drag.changed = true; draw(); }
  }

  /** 素材の描く順：前後の指定（z）→ 奥（上）から手前（下）へ */
  function sortStamps() { M.map.stamps.sort((a, b) => ((a.z || 0) - (b.z || 0)) || (a.y - b.y)); }
  function setStampZ(obj, where) {
    const zs = M.map.stamps.map((x) => x.z || 0);
    obj.z = where === 'front' ? Math.max(0, ...zs) + 1 : where === 'back' ? Math.min(0, ...zs) - 1 : 0;
    if (!obj.z) delete obj.z;
    sortStamps();
  }

  // ───── 元に戻す ─────
  function snapshot() {
    const m = M.map;
    return { H: M.H.slice(), B: M.B.slice(), v: JSON.stringify({ stamps: m.stamps, lines: m.lines, areas: m.areas, labels: m.labels, style: m.style, layers: m.layers, seed: m.seed, name: m.name }) };
  }
  function restore(s) {
    const m = M.map;
    const terrainChanged = !sameArr(M.H, s.H) || !sameArr(M.B, s.B);
    const look = (st) => st.palette + st.hillshade + st.ripples;
    const before = look(m.style);
    M.H = s.H.slice();
    M.B = s.B.slice();
    Object.assign(m, JSON.parse(s.v));
    // 元に戻した後も、まだあるものは選んだままにする
    M.sel = M.sel.filter((x) => findObj(x.k, x.id));
    if (M.sel.length !== 1) M.vertex = null;
    if (terrainChanged || before !== look(m.style)) renderTerrainFull();
    commit(terrainChanged);
    renderInspector();
    draw();
  }
  function sameArr(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function pushUndo(snap) {
    M.undo.push(snap || snapshot());
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

  function commit(terrain) {
    const m = M.map;
    if (terrain) {
      m.height = E.encodeHeights(M.H);
      m.biome = E.encodeBiomes(M.B);
    }
    m.updatedAt = Date.now();
    NS.App.touch();
  }

  // ───── レイヤー ─────
  const LAYERS = [['terrain', '地形'], ['areas', '領域'], ['paths', '道・川'], ['stamps', '素材'], ['labels', '文字'], ['deco', '枠・縮尺・題名・マス目']];
  function layerHidden(k) { return !!(M.map.layers[k] && M.map.layers[k].hidden); }
  function layerLocked(k) { return !!(M.map.layers[k] && (M.map.layers[k].locked || M.map.layers[k].hidden)); }
  function layersPane() {
    const box = h('div', { class: 'layers-pane' }, h('div', { class: 'small muted' }, 'レイヤー（目＝表示、鍵＝ロック）'));
    LAYERS.forEach(([k, label]) => {
      const L = M.map.layers[k] = M.map.layers[k] || {};
      const row = h('div', { class: 'layer-row' + (L.hidden ? ' off' : '') }, h('span', null, label));
      const eye = btn('', { icon: L.hidden ? 'eyeoff' : 'eye', ghost: true, small: true, title: L.hidden ? '表示する' : '隠す' });
      const lock = btn('', { icon: L.locked ? 'lock' : 'unlock', ghost: true, small: true, title: L.locked ? 'ロックを外す' : 'ロック（選択・編集できなくする）' });
      eye.addEventListener('click', () => { L.hidden = !L.hidden; commit(); draw(); clear(eye).appendChild(icon(L.hidden ? 'eyeoff' : 'eye', 18)); row.classList.toggle('off', !!L.hidden); });
      lock.addEventListener('click', () => { L.locked = !L.locked; commit(); clear(lock).appendChild(icon(L.locked ? 'lock' : 'unlock', 18)); });
      row.append(k === 'terrain' || k === 'deco' ? h('span') : lock, eye);
      box.appendChild(row);
    });
    return box;
  }

  // ───── 入力 ─────
  function bindEvents() {
    const c = M.canvas;
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('pointerleave', () => { M.hover = null; draw(); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', (e) => { if (M.draft) { e.preventDefault(); finishDraft(); } });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const w = toWorld(e);
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), w.sx, w.sy);
      } else {
        M.ox -= e.deltaX;
        M.userMoved = true;
        draw();
      }
    }, { passive: false });
    M.onKey = onKey;
    M.onKeyUp = (e) => { if (e.key === ' ' && M) { M.space = false; if (M.canvas) M.canvas.classList.remove('panning'); } };
    document.addEventListener('keydown', M.onKey);
    document.addEventListener('keyup', M.onKeyUp);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /** キー操作の一覧 */
  function showShortcuts() {
    const rows = (list) => h('table', { class: 'kbd-table' }, h('tbody', null, list.map(([k, d]) => h('tr', null,
      h('td', null, k.split(' / ').map((x, i) => [i ? ' / ' : '', h('kbd', null, x)])), h('td', null, d)))));
    UI.modal({
      title: '地図のキー操作',
      wide: true,
      body: h('div', { class: 'kbd-grid' },
        h('section', null, h('h3', { class: 'panel-h' }, '道具'), rows(TOOLS.map((t) => [t.key.toUpperCase(), t.label]))),
        h('section', null, h('h3', { class: 'panel-h' }, '編集'), rows([
          ['Ctrl+Z', '元に戻す'], ['Ctrl+Shift+Z / Ctrl+Y', 'やり直す'], ['Ctrl+C / Ctrl+V', 'コピー・貼り付け'], ['Ctrl+D', '複製'],
          ['Ctrl+A', '素材をすべて選ぶ'], ['Delete', '選んだものを消す'], ['矢印', '1ずつ動かす（Shift で10）'], ['Q / E', '15°ずつ回す'],
          ['[ / ]', 'ブラシ・素材の大きさ'], ['Esc', '選択や描きかけの線を取り消す'], ['Enter', '描いている線・領域を確定'],
        ])),
        h('section', null, h('h3', { class: 'panel-h' }, '表示'), rows([
          ['ホイール / ピンチ', '拡大・縮小'], ['スペース+ドラッグ', '地図を動かす（中ボタン・2本指でも）'], ['+ / -', '拡大・縮小'], ['0', '全体を表示'], ['?', 'この一覧'],
        ]), h('p', { class: 'small muted' }, '選んだ素材・文字は、角の四角をドラッグで大きさ、上の丸をドラッグで向きを変えられます（Shift で15°刻み）。'))),
      actions: [{ label: '閉じる', primary: true }],
    });
  }

  function onKey(e) {
    if (!M || !M.map) return;
    const tag = (e.target && e.target.tagName) || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    if (document.querySelector('.modal-overlay')) return;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (mod && e.key.toLowerCase() === 'c') { copySel(); return; }
    if (mod && e.key.toLowerCase() === 'v') { pasteSel(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); M.sel = M.map.stamps.map((s) => ({ k: 'stamp', id: s.id })); renderInspector(); draw(); return; }
    if (e.key === ' ') { M.space = true; M.canvas.classList.add('panning'); e.preventDefault(); return; }
    if (e.key === 'Escape') {
      if (M.draft) { M.draft = null; updateHint(); draw(); } else { M.sel = []; M.vertex = null; renderInspector(); draw(); }
      return;
    }
    if (e.key === 'Enter' && M.draft) { finishDraft(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (M.draft) { M.draft.pop(); if (!M.draft.length) M.draft = null; updateHint(); draw(); e.preventDefault(); return; }
      if (M.sel.length) { deleteSelection(); e.preventDefault(); return; }
    }
    if (e.key.startsWith('Arrow') && M.sel.length) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
      const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      pushUndo();
      moveSel(dx, dy);
      commit();
      draw();
      return;
    }
    if (e.key === '?') { showShortcuts(); return; }
    if (e.key === '+' || e.key === '=') { zoomBy(1.25); return; }
    if (e.key === '-') { zoomBy(0.8); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === 'q' || e.key === 'e') {
      const da = e.key === 'q' ? -15 : 15;
      if (PREF.tool === 'stamp') { PREF.stamp.r = ((PREF.stamp.r + da) % 360 + 360) % 360; savePref(); renderInspector(); draw(); return; }
      const items = selObjs().filter((o) => o.k === 'stamp' || o.k === 'label');
      if (items.length) {
        pushUndo();
        items.forEach((o) => { if (o.k === 'stamp') o.obj.r = (((o.obj.r || 0) + da) % 360 + 360) % 360; else o.obj.rotation = clamp((o.obj.rotation || 0) + da, -90, 90); });
        commit();
        renderInspector();
        draw();
      }
      return;
    }
    if (e.key === '[' || e.key === ']') {
      const f = e.key === '[' ? 1 / 1.15 : 1.15;
      if (PREF.tool === 'stamp') PREF.stamp.s = clamp(PREF.stamp.s * f, 0.2, 6);
      else if (PREF.tool === 'scatter') PREF.scatter.size = clamp(PREF.scatter.size * f, 4, 200);
      else if (PREF.tool === 'erase') PREF.erase.size = clamp(PREF.erase.size * f, 3, 200);
      else PREF.brush.size = clamp(Math.round(PREF.brush.size * f) || 1, 1, 40);
      savePref();
      renderInspector();
      draw();
      return;
    }
    if (!mod && !e.altKey) {
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t) setTool(t.id);
    }
  }

  function onDown(e) {
    M.canvas.focus({ preventScroll: true });
    try { M.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
    const w = toWorld(e);
    M.pointers.set(e.pointerId, { sx: w.sx, sy: w.sy });
    if (M.pointers.size === 2) {
      const [a, b] = Array.from(M.pointers.values());
      M.pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, cx: (a.sx + b.sx) / 2, cy: (a.sy + b.sy) / 2, zoom: M.zoom, ox: M.ox, oy: M.oy };
      if (M.drag && M.drag.kind === 'stroke') endStroke();
      M.drag = null;
      M.freehand = null;
      return;
    }
    if (M.pointers.size > 2) return;
    const tool = PREF.tool;
    if (e.button === 1 || e.button === 2 || tool === 'pan' || M.space) {
      M.drag = { kind: 'pan', sx: w.sx, sy: w.sy, ox: M.ox, oy: M.oy };
      return;
    }
    const def = TOOLS.find((t) => t.id === tool);
    if (def && def.brush) {
      if ((def.terrain || tool === 'ground') && layerLocked('terrain')) { toast('地形レイヤーが隠れているか、ロックされています'); return; }
      if ((tool === 'scatter' || tool === 'erase') && layerLocked('stamps')) { toast('素材レイヤーが隠れているか、ロックされています'); return; }
      M.drag = { kind: 'stroke', last: w, snap: snapshot(), changed: false };
      applyBrush(w.x, w.y);
      if (def.terrain || tool === 'ground') M.drag.changed = true;
      return;
    }
    if (tool === 'stamp') {
      if (layerLocked('stamps')) { toast('素材レイヤーが隠れているか、ロックされています'); return; }
      pushUndo();
      const a = AS.BY_ID[PREF.stamp.a] || AS.ASSETS[0];
      const st = {
        id: E.sid(), a: a.id, x: round1(w.x), y: round1(w.y), s: PREF.stamp.s, r: PREF.stamp.r,
        f: PREF.stamp.randFlip && !a.anchor && a.cat !== '地図記号' ? Math.random() < 0.5 : false,
        v: PREF.stamp.randVar ? Math.floor(Math.random() * a.variants) : 0,
      };
      M.map.stamps.push(st);
      sortStamps();
      commit();
      draw();
      return;
    }
    if (tool === 'path' || tool === 'area') {
      if (layerLocked(tool === 'path' ? 'paths' : 'areas')) { toast('レイヤーが隠れているか、ロックされています'); return; }
      if (M.draft) {
        if (tool === 'area' && M.draft.length >= 3) {
          const f = M.draft[0];
          if (Math.hypot(f[0] - w.x, f[1] - w.y) * M.zoom < 12) { finishDraft(); return; }
        }
        M.draft.push([round1(w.x), round1(w.y)]);
        updateHint();
        draw();
        return;
      }
      M.freehand = { start: w, pts: [[round1(w.x), round1(w.y)]], active: false };
      M.drag = { kind: 'freehand' };
      return;
    }
    if (tool === 'label') {
      if (layerLocked('labels')) { toast('文字レイヤーが隠れているか、ロックされています'); return; }
      pushUndo();
      const st = LABEL_STYLES[PREF.label.style] || LABEL_STYLES.region;
      const lb = { id: UI.uid('lb'), x: round1(w.x), y: round1(w.y), text: PREF.label.style === 'title' ? M.map.name : '地名', style: PREF.label.style, size: st.size, rotation: 0, vertical: false, curve: 0 };
      M.map.labels.push(lb);
      setTool('select');
      M.sel = [{ k: 'label', id: lb.id }];
      commit();
      setSheet(true);
      renderInspector(true);
      draw();
      return;
    }
    // 選択：まず取っ手（大きさ・向き）
    const hd = handleAt(w, e.pointerType === 'touch');
    if (hd) {
      const o = hd.tb.obj;
      M.drag = {
        kind: hd.kind, start: w, moved: false, k: hd.tb.k, id: o.id, cx: hd.tb.cx, cy: hd.tb.cy,
        d0: Math.max(1e-3, Math.hypot(w.x - hd.tb.cx, w.y - hd.tb.cy)), a0: Math.atan2(w.y - hd.tb.cy, w.x - hd.tb.cx),
        s0: hd.tb.k === 'stamp' ? o.s : (o.size || (LABEL_STYLES[o.style] || LABEL_STYLES.region).size),
        r0: hd.tb.deg, snap: snapshot(),
      };
      return;
    }
    const hit = hitTest(w.x, w.y);
    if (hit) {
      const already = M.sel.some((s) => s.k === hit.k && s.id === hit.id);
      if (e.shiftKey) {
        if (already) M.sel = M.sel.filter((s) => !(s.k === hit.k && s.id === hit.id));
        else M.sel.push({ k: hit.k, id: hit.id });
      } else if (!already || hit.vertex != null) {
        M.sel = [{ k: hit.k, id: hit.id }];
      }
      M.vertex = hit.vertex != null ? hit.vertex : null;
      M.drag = { kind: 'move', start: w, moved: false, orig: selObjs().map((o) => ({ k: o.k, id: o.id, data: JSON.parse(JSON.stringify(o.obj)) })) };
      if (window.innerWidth < 900) setSheet(true);
    } else if (e.pointerType === 'touch') {
      M.drag = { kind: 'pan', sx: w.sx, sy: w.sy, ox: M.ox, oy: M.oy, clearSel: !e.shiftKey };
    } else {
      if (!e.shiftKey) { M.sel = []; M.vertex = null; }
      M.drag = { kind: 'box', start: w, end: w };
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
      const z = clamp(M.pinch.zoom * d / M.pinch.d, 0.1, 16);
      const wx = (M.pinch.cx - M.pinch.ox) / M.pinch.zoom;
      const wy = (M.pinch.cy - M.pinch.oy) / M.pinch.zoom;
      M.zoom = z;
      M.ox = cx - wx * z;
      M.oy = cy - wy * z;
      M.userMoved = true;
      draw();
      return;
    }
    M.hover = w;
    const d = M.drag;
    if (!d) {
      if (PREF.tool === 'select') {
        const hd = handleAt(w, e.pointerType === 'touch');
        const cur = hd ? (hd.kind === 'rotate' ? 'grab' : 'nwse-resize') : '';
        if (M.canvas.style.cursor !== cur) M.canvas.style.cursor = cur;
      }
      if (M.draft || ['stamp', 'scatter', 'erase', 'land', 'water', 'relief', 'ground'].includes(PREF.tool)) draw();
      return;
    }
    if (d.kind === 'scale' || d.kind === 'rotate') {
      const obj = findObj(d.k, d.id);
      if (!obj) return;
      if (!d.moved) {
        if (Math.hypot(w.x - d.start.x, w.y - d.start.y) * M.zoom < 2) return;
        d.moved = true;
        pushUndo(d.snap);
      }
      if (d.kind === 'scale') {
        const f = Math.hypot(w.x - d.cx, w.y - d.cy) / d.d0;
        if (d.k === 'stamp') obj.s = Math.round(clamp(d.s0 * f, 0.15, 8) * 100) / 100;
        else obj.size = Math.round(clamp(d.s0 * f, 5, 160) * 10) / 10;
      } else {
        let deg = d.r0 + (Math.atan2(w.y - d.cy, w.x - d.cx) - d.a0) * 180 / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        deg = ((Math.round(deg) % 360) + 540) % 360 - 180;
        if (d.k === 'stamp') obj.r = deg; else obj.rotation = clamp(deg, -90, 90); // 文字は逆さまにしない
      }
      draw();
      return;
    }
    if (d.kind === 'pan') {
      if (Math.hypot(w.sx - d.sx, w.sy - d.sy) > 4) d.moved = true;
      M.ox = d.ox + (w.sx - d.sx);
      M.oy = d.oy + (w.sy - d.sy);
      M.userMoved = true;
      draw();
    } else if (d.kind === 'stroke') {
      const dist = Math.hypot(w.x - d.last.x, w.y - d.last.y);
      const radius = PREF.tool === 'scatter' ? PREF.scatter.size : PREF.tool === 'erase' ? PREF.erase.size : PREF.brush.size * M.map.cell;
      const step = Math.max(1, radius * 0.35);
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
    } else if (d.kind === 'freehand') {
      const f = M.freehand;
      if (!f) return;
      if (!f.active && Math.hypot(w.sx - f.start.sx, w.sy - f.start.sy) > 6) f.active = true;
      if (f.active) {
        const last = f.pts[f.pts.length - 1];
        if (Math.hypot(w.x - last[0], w.y - last[1]) * M.zoom > 4) f.pts.push([round1(w.x), round1(w.y)]);
        draw();
      }
    } else if (d.kind === 'move') {
      const dx = w.x - d.start.x;
      const dy = w.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * M.zoom < 3) return;
      if (!d.moved) {
        if (d.orig.some((o) => layerLocked(layerOf(o.k)))) return;
        d.moved = true;
        const snap = snapshot();
        const v = JSON.parse(snap.v);
        d.orig.forEach((o) => {
          const list = v[listOf(o.k)];
          const i = list.findIndex((x) => x.id === o.id);
          if (i >= 0) list[i] = o.data;
        });
        snap.v = JSON.stringify(v);
        pushUndo(snap);
      }
      d.orig.forEach((o) => {
        const obj = findObj(o.k, o.id);
        if (!obj) return;
        if (o.k === 'stamp' || o.k === 'label') {
          obj.x = round1(o.data.x + dx);
          obj.y = round1(o.data.y + dy);
        } else if (M.vertex != null && d.orig.length === 1) {
          obj.points[M.vertex] = [round1(o.data.points[M.vertex][0] + dx), round1(o.data.points[M.vertex][1] + dy)];
        } else {
          obj.points = o.data.points.map((pt) => [round1(pt[0] + dx), round1(pt[1] + dy)]);
        }
      });
      draw();
    } else if (d.kind === 'box') {
      d.end = w;
      draw();
    }
  }

  function onUp(e) {
    M.pointers.delete(e.pointerId);
    if (M.pointers.size < 2) M.pinch = null;
    const d = M.drag;
    if (!d) return;
    if (d.kind === 'stroke') { endStroke(); return; }
    M.drag = null;
    if (d.kind === 'pan') {
      if (d.clearSel && !d.moved) { M.sel = []; M.vertex = null; renderInspector(); draw(); }
    } else if (d.kind === 'freehand') {
      const f = M.freehand;
      M.freehand = null;
      if (f && f.active && f.pts.length >= 2) {
        const pts = simplify(f.pts, 1.2 / Math.max(0.3, M.zoom) + 0.6);
        if (PREF.tool === 'path' && pts.length >= 2) createPath(pts);
        else if (PREF.tool === 'area' && pts.length >= 3) createArea(pts);
      } else if (f) {
        M.draft = [f.pts[0]];
        updateHint();
      }
      draw();
    } else if (d.kind === 'scale' || d.kind === 'rotate') {
      if (d.moved) { commit(); renderInspector(); }
      draw();
    } else if (d.kind === 'move') {
      if (d.moved) {
        if (d.orig.some((o) => o.k === 'stamp')) sortStamps();
        commit();
        renderInspector();
      }
    } else if (d.kind === 'box') {
      const x0 = Math.min(d.start.x, d.end.x);
      const x1 = Math.max(d.start.x, d.end.x);
      const y0 = Math.min(d.start.y, d.end.y);
      const y1 = Math.max(d.start.y, d.end.y);
      if ((x1 - x0) * M.zoom > 4 || (y1 - y0) * M.zoom > 4) {
        const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
        if (!layerLocked('stamps')) M.map.stamps.forEach((st) => { if (inside(st.x, st.y)) M.sel.push({ k: 'stamp', id: st.id }); });
        if (!layerLocked('labels')) M.map.labels.forEach((lb) => { if (inside(lb.x, lb.y)) M.sel.push({ k: 'label', id: lb.id }); });
        if (!layerLocked('paths')) M.map.lines.forEach((ln) => { if (ln.points.every((pt) => inside(pt[0], pt[1]))) M.sel.push({ k: 'path', id: ln.id }); });
        if (!layerLocked('areas')) M.map.areas.forEach((ar) => { if (ar.points.every((pt) => inside(pt[0], pt[1]))) M.sel.push({ k: 'area', id: ar.id }); });
        const seen = new Set();
        M.sel = M.sel.filter((s) => { const k = s.k + s.id; if (seen.has(k)) return false; seen.add(k); return true; });
      }
      renderInspector();
      draw();
    }
  }

  function endStroke() {
    const d = M.drag;
    M.drag = null;
    if (!d) return;
    if (d.changed) {
      pushUndo(d.snap);
      commit(['land', 'water', 'relief', 'ground'].includes(PREF.tool));
    }
    draw();
  }

  function layerOf(k) { return k === 'stamp' ? 'stamps' : k === 'label' ? 'labels' : k === 'path' ? 'paths' : 'areas'; }
  function listOf(k) { return k === 'stamp' ? 'stamps' : k === 'label' ? 'labels' : k === 'path' ? 'lines' : 'areas'; }

  /** 線を間引く（Ramer–Douglas–Peucker） */
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = 1;
    keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let maxD = 0;
      let idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = distToSeg(pts[i][0], pts[i][1], pts[a], pts[b]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  /** 川は高い方から低い方へ流れる（下流ほど太く描く）ように向きをそろえる */
  function orientDownhill(pts) {
    if (pts.length < 2) return pts;
    const m = M.map;
    const hAt = (p) => E.sampleH(M.H, m.gw, m.gh, m.cell, p[0], p[1]);
    const a = hAt(pts[0]);
    const b = hAt(pts[pts.length - 1]);
    return a < b - 0.01 ? pts.slice().reverse() : pts;
  }

  function createPath(pts) {
    pushUndo();
    const kind = PREF.path.kind;
    if (kind === 'river' || kind === 'stream') pts = orientDownhill(pts);
    const ln = { id: UI.uid('ln'), kind, points: pts, name: '', w: PREF.path.w, wobble: (PATH_KINDS[kind] || {}).wobble || 0 };
    M.map.lines.push(ln);
    commit();
    renderInspector();
  }

  function createArea(pts) {
    pushUndo();
    const ar = { id: UI.uid('ar'), points: pts, color: PREF.area.color, opacity: PREF.area.opacity, name: '' };
    M.map.areas.push(ar);
    commit();
    renderInspector();
  }

  function finishDraft() {
    const pts = M.draft;
    M.draft = null;
    updateHint();
    if (!pts) return;
    const clean = [];
    pts.forEach((pt) => {
      const last = clean[clean.length - 1];
      if (!last || Math.hypot(last[0] - pt[0], last[1] - pt[1]) > 1) clean.push(pt);
    });
    if (PREF.tool === 'path' && clean.length >= 2) createPath(clean);
    else if (PREF.tool === 'area' && clean.length >= 3) createArea(clean);
    else toast(PREF.tool === 'path' ? '線には2点以上が必要です' : '領域には3点以上が必要です');
    draw();
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  function findObj(k, id) {
    return (M.map[listOf(k)] || []).find((x) => x.id === id) || null;
  }
  function selObjs() {
    return M.sel.map((s) => ({ k: s.k, id: s.id, obj: findObj(s.k, s.id) })).filter((o) => o.obj);
  }

  function moveSel(dx, dy) {
    selObjs().forEach(({ k, obj }) => {
      if (k === 'stamp' || k === 'label') { obj.x = round1(obj.x + dx); obj.y = round1(obj.y + dy); }
      else obj.points = obj.points.map((pt) => [round1(pt[0] + dx), round1(pt[1] + dy)]);
    });
    sortStamps();
  }

  function deleteSelection() {
    const items = selObjs();
    if (!items.length) return;
    pushUndo();
    if (items.length === 1 && M.vertex != null && (items[0].k === 'path' || items[0].k === 'area')) {
      const o = items[0].obj;
      if (o.points.length > (items[0].k === 'path' ? 2 : 3)) {
        o.points.splice(M.vertex, 1);
        M.vertex = null;
        commit();
        renderInspector();
        draw();
        return;
      }
    }
    const ids = new Set(items.map((o) => o.k + ':' + o.id));
    M.map.stamps = M.map.stamps.filter((x) => !ids.has('stamp:' + x.id));
    M.map.labels = M.map.labels.filter((x) => !ids.has('label:' + x.id));
    M.map.lines = M.map.lines.filter((x) => !ids.has('path:' + x.id));
    M.map.areas = M.map.areas.filter((x) => !ids.has('area:' + x.id));
    M.sel = [];
    M.vertex = null;
    commit();
    renderInspector();
    draw();
  }

  function copySel() {
    const items = selObjs();
    if (items.length) M.clipboard = items.map((o) => ({ k: o.k, data: JSON.parse(JSON.stringify(o.obj)) }));
  }
  function pasteSel() {
    if (!M.clipboard || !M.clipboard.length) return;
    pushUndo();
    const off = 12;
    M.sel = [];
    M.clipboard.forEach(({ k, data }) => {
      const o = JSON.parse(JSON.stringify(data));
      o.id = k === 'stamp' ? E.sid() : UI.uid(k === 'label' ? 'lb' : k === 'path' ? 'ln' : 'ar');
      if (k === 'stamp' || k === 'label') { o.x += off; o.y += off; } else o.points = o.points.map((pt) => [pt[0] + off, pt[1] + off]);
      if (k === 'stamp') delete o.entryId;
      M.map[listOf(k)].push(o);
      M.sel.push({ k, id: o.id });
    });
    M.clipboard = M.clipboard.map((c) => ({ k: c.k, data: Object.assign({}, c.data, c.k === 'stamp' || c.k === 'label' ? { x: c.data.x + off, y: c.data.y + off } : { points: c.data.points.map((pt) => [pt[0] + off, pt[1] + off]) }) }));
    sortStamps();
    commit();
    renderInspector();
    draw();
  }
  function duplicateSel() { copySel(); pasteSel(); }

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

  function stampHit(st, x, y, tol) {
    const sp = AS.sprite(st.a, st.v, palKey());
    let dx = x - st.x;
    let dy = y - st.y;
    if (st.r) {
      const a = -st.r * Math.PI / 180;
      const rx = dx * Math.cos(a) - dy * Math.sin(a);
      const ry = dx * Math.sin(a) + dy * Math.cos(a);
      dx = rx;
      dy = ry;
    }
    dx /= st.s * (st.f ? -1 : 1);
    dy /= st.s;
    const t = tol / st.s;
    if (dx < sp.x0 - t || dx > sp.x0 + sp.w + t || dy < sp.y0 - t || dy > sp.y0 + sp.h + t) return false;
    // 透明な部分はすり抜ける
    if (sp.alpha === undefined) {
      try { sp.alpha = sp.canvas.getContext('2d').getImageData(0, 0, sp.canvas.width, sp.canvas.height).data; } catch (e) { sp.alpha = null; }
    }
    if (!sp.alpha) return true;
    const kx = sp.canvas.width / sp.w;
    const ky = sp.canvas.height / sp.h;
    const r = Math.max(1, Math.round(t * kx));
    const cx = Math.round((dx - sp.x0) * kx);
    const cy = Math.round((dy - sp.y0) * ky);
    const stepPx = Math.max(1, Math.round(r / 2));
    for (let yy = cy - r; yy <= cy + r; yy += stepPx) {
      for (let xx = cx - r; xx <= cx + r; xx += stepPx) {
        if (xx < 0 || yy < 0 || xx >= sp.canvas.width || yy >= sp.canvas.height) continue;
        if (sp.alpha[(yy * sp.canvas.width + xx) * 4 + 3] > 40) return true;
      }
    }
    return false;
  }

  function hitTest(x, y) {
    const m = M.map;
    const tol = 6 / M.zoom;
    if (!layerLocked('labels')) {
      for (let i = m.labels.length - 1; i >= 0; i--) {
        const lb = m.labels[i];
        const box = M.labelBoxes.get(lb.id);
        if (!box) continue;
        const a = -(lb.rotation || 0) * Math.PI / 180;
        const dx = x - lb.x;
        const dy = y - lb.y - (box.cy || 0);
        const rx = dx * Math.cos(a) - dy * Math.sin(a);
        const ry = dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(rx) <= box.w / 2 + tol && Math.abs(ry) <= box.h / 2 + tol) return { k: 'label', id: lb.id };
      }
    }
    if (!layerLocked('stamps')) {
      for (let i = m.stamps.length - 1; i >= 0; i--) {
        if (stampHit(m.stamps[i], x, y, tol)) return { k: 'stamp', id: m.stamps[i].id };
      }
    }
    const one = M.sel.length === 1 ? M.sel[0] : null;
    const kinds = [['path', 'lines', 'paths'], ['area', 'areas', 'areas']];
    for (const [k, prop, layer] of kinds) {
      if (layerLocked(layer)) continue;
      const list = m[prop];
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        if (one && one.k === k && one.id === it.id) {
          for (let v = 0; v < it.points.length; v++) {
            if (Math.hypot(x - it.points[v][0], y - it.points[v][1]) <= tol * 1.4) return { k, id: it.id, vertex: v };
          }
        }
        const n = it.points.length;
        for (let v = 0; v < n - (k === 'path' ? 1 : 0); v++) {
          if (distToSeg(x, y, it.points[v], it.points[(v + 1) % n]) <= tol + 2.5 * (it.w || 1)) return { k, id: it.id };
        }
      }
    }
    if (!layerLocked('areas')) {
      for (let i = m.areas.length - 1; i >= 0; i--) if (inPoly(x, y, m.areas[i].points)) return { k: 'area', id: m.areas[i].id };
    }
    return null;
  }

  // ───── 描画 ─────
  function palKey() { return (E.PALETTES[M.map.style.palette] || E.PALETTES.parchment).assets; }
  function pal() { return E.PALETTES[M.map.style.palette] || E.PALETTES.parchment; }

  function draw() {
    if (!M || !M.ctx || M.raf) return;
    M.raf = requestAnimationFrame(() => {
      if (!M || !M.ctx) return;
      M.raf = 0;
      const ctx = M.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, M.canvas.width, M.canvas.height);
      const view = { scale: M.dpr * M.zoom, tx: M.dpr * M.ox, ty: M.dpr * M.oy, w: M.canvas.width, h: M.canvas.height, editing: true };
      renderMap(ctx, view);
      ctx.setTransform(view.scale, 0, 0, view.scale, view.tx, view.ty);
      drawOverlay(ctx);
    });
  }

  let paperCanvas = null;
  function paperTexture() {
    if (paperCanvas) return paperCanvas;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const n = E.vnoise(x * 0.05, y * 0.05) * 0.6 + E.vnoise(x * 0.3, y * 0.02) * 0.25 + E.hash2(x, y, 5) * 0.15;
        const v = 255 - Math.max(0, n - 0.35) * 90;
        const o = (y * 256 + x) * 4;
        img.data[o] = v;
        img.data[o + 1] = v - 4;
        img.data[o + 2] = v - 12;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    paperCanvas = c;
    return c;
  }

  /** 地図本体を描く（編集画面と書き出しで共通） */
  function renderMap(ctx, view, opts) {
    opts = opts || {};
    const m = M.map;
    const st = m.style;
    const pl = pal();
    const S = view.scale;
    const setWorld = () => ctx.setTransform(S, 0, 0, S, view.tx, view.ty);
    setWorld();
    const vis = { x0: -view.tx / S - 60, y0: -view.ty / S - 60, x1: (view.w - view.tx) / S + 60, y1: (view.h - view.ty) / S + 60 };
    if (view.editing) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 18 * M.dpr;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, M.W, M.Hpx);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (!layerHidden('terrain')) ctx.drawImage(opts.base || M.base, 0, 0, M.W, M.Hpx);
    else { ctx.fillStyle = '#f4efe2'; ctx.fillRect(0, 0, M.W, M.Hpx); }

    if (!layerHidden('areas')) m.areas.forEach((ar) => drawArea(ctx, ar));
    if (!layerHidden('paths')) {
      const order = ['river', 'stream', 'route', 'trail', 'road', 'highway', 'rail', 'wall', 'border'];
      const sorted = m.lines.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      const rivers = sorted.filter((ln) => ln.kind === 'river' || ln.kind === 'stream');
      // 川は陸の上だけに描き、海や湖に入ったら水面に溶け込ませる
      if (rivers.length) drawRivers(ctx, rivers, pl, layerHidden('terrain') ? null : (opts.mask || M.mask));
      sorted.forEach((ln) => { if (ln.kind !== 'river' && ln.kind !== 'stream') drawPath(ctx, ln, pl); });
    }
    if (!layerHidden('stamps')) {
      const pk = palKey();
      for (const s of m.stamps) {
        if (s.x < vis.x0 || s.x > vis.x1 || s.y < vis.y0 || s.y > vis.y1 + 40) continue;
        const sp = AS.sprite(s.a, s.v, pk);
        const k = S * s.s;
        const fx = s.f ? -1 : 1;
        if (s.r) {
          const a = s.r * Math.PI / 180;
          const c = Math.cos(a);
          const sn = Math.sin(a);
          ctx.setTransform(k * c * fx, k * sn * fx, -k * sn, k * c, view.tx + s.x * S, view.ty + s.y * S);
        } else {
          ctx.setTransform(k * fx, 0, 0, k, view.tx + s.x * S, view.ty + s.y * S);
        }
        ctx.drawImage(sp.canvas, sp.x0, sp.y0, sp.w, sp.h);
      }
      setWorld();
    }
    if (st.grid && st.grid !== 'none' && !layerHidden('deco')) drawGrid(ctx, st);
    if (!layerHidden('labels')) {
      m.areas.forEach((ar) => {
        if (!ar.name || layerHidden('areas')) return;
        const c = centroid(ar.points);
        drawText(ctx, ar.name, c[0], c[1], { size: 16, weight: 700, color: hexA(ar.color, 0.95), spacing: 0.4, halo: pl.halo, font: 'shippori' });
      });
      if (!layerHidden('stamps')) m.stamps.forEach((s) => { const n = stampName(s); if (n) drawStampLabel(ctx, s, n, pl); });
      m.labels.forEach((lb) => {
        const sty = LABEL_STYLES[lb.style] || LABEL_STYLES.region;
        const color = lb.color || (sty.color === 'water' ? pl.water : sty.color === 'glyph' ? pl.glyph : pl.ink);
        const box = drawText(ctx, lb.text, lb.x, lb.y, {
          size: lb.size || sty.size, weight: sty.weight, color, spacing: lb.spacing != null ? lb.spacing : sty.spacing, halo: lb.halo === false ? null : pl.halo,
          rotation: lb.rotation || 0, vertical: lb.vertical, curve: lb.curve || 0, font: lb.font || sty.font,
        });
        if (view.editing) M.labelBoxes.set(lb.id, box);
      });
    }
    if (!layerHidden('deco')) {
      if (st.texture) {
        ctx.save();
        ctx.globalAlpha = st.palette === 'atlas' ? 0.2 : 0.35;
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = ctx.createPattern(paperTexture(), 'repeat');
        ctx.fillRect(0, 0, M.W, M.Hpx);
        ctx.restore();
      }
      if (st.vignette) {
        const g = ctx.createRadialGradient(M.W / 2, M.Hpx / 2, Math.min(M.W, M.Hpx) * 0.35, M.W / 2, M.Hpx / 2, Math.hypot(M.W, M.Hpx) * 0.55);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, st.palette === 'night' ? 'rgba(0,0,0,0.5)' : 'rgba(70,45,20,0.32)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, M.W, M.Hpx);
      }
      if (st.scale) drawScale(ctx, pl);
      if (st.title && st.title !== 'none' && m.name) drawTitle(ctx, m.name, st.title, pl);
      drawFrame(ctx, st.frame || 'simple', pl);
    }
  }

  function hexA(hex, a) {
    const mm = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!mm) return `rgba(120,120,120,${a})`;
    const n = parseInt(mm[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function centroid(pts) {
    let x = 0;
    let y = 0;
    pts.forEach((p) => { x += p[0]; y += p[1]; });
    return [x / pts.length, y / pts.length];
  }

  function sampleSpline(pts, closed, step) {
    const n = pts.length;
    if (n < 2) return pts.slice();
    const out = [];
    const get = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1);
      const p1 = get(i);
      const p2 = get(i + 1);
      const p3 = get(i + 2);
      const k = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let j = 0; j < k; j++) {
        const t = j / k;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  }

  function wobble(pts, amount, seed) {
    if (!amount || pts.length < 3) return pts;
    const out = [];
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const o = pts[Math.max(0, i - 1)];
      const dx = q[0] - o[0];
      const dy = q[1] - o[1];
      const L = Math.hypot(dx, dy) || 1;
      if (i > 0) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const n = (E.vnoise(s * 0.06 + seed, seed * 0.37) - 0.5) * amount * 9 + (E.vnoise(s * 0.25 + seed, 3.1) - 0.5) * amount * 2.4;
      const fade = Math.min(1, i / 4, (pts.length - 1 - i) / 4);
      out.push([p[0] - (dy / L) * n * fade, p[1] + (dx / L) * n * fade]);
    }
    return out;
  }

  function strokePoly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  function seedOf(id) { return (AS.hashStr(String(id)) % 1000) / 10; }
  function inkOf(pl) { return pl.ink === '#f2ead8' ? '#1a1a1a' : pl.ink; }

  let riverLayer = null;
  /** 川をまとめて別の層に描き、陸地マスクで切り抜いてから重ねる */
  function drawRivers(ctx, rivers, pl, mask) {
    if (!mask) { rivers.forEach((ln) => drawPath(ctx, ln, pl)); return; }
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    if (!riverLayer) riverLayer = document.createElement('canvas');
    if (riverLayer.width !== cw || riverLayer.height !== ch) { riverLayer.width = cw; riverLayer.height = ch; }
    const o = riverLayer.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, cw, ch);
    o.setTransform(ctx.getTransform());
    rivers.forEach((ln) => drawPath(o, ln, pl));
    o.globalCompositeOperation = 'destination-in';
    o.imageSmoothingEnabled = true;
    o.drawImage(mask, 0, 0, M.W, M.Hpx);
    o.globalCompositeOperation = 'source-over';
    o.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(riverLayer, 0, 0);
    ctx.restore();
  }

  /** 川の色：海岸近くの海と同じ色にして、河口で海につながって見えるようにする */
  function riverColors(pl) {
    const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const fill = mixc(pl.shallow, pl.glow, 0.35);
    return { fill: `rgb(${fill.join(',')})`, edge: `rgba(${pl.coast.join(',')},0.9)` };
  }

  function drawPath(ctx, ln, pl) {
    if (ln.points.length < 2) return;
    const w = ln.w || 1;
    const pts = wobble(sampleSpline(ln.points, false, 3), ln.wobble != null ? ln.wobble : (PATH_KINDS[ln.kind] || {}).wobble || 0, seedOf(ln.id));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (ln.kind) {
      case 'river':
      case 'stream': {
        const max = (ln.kind === 'river' ? 3.2 : 1.4) * w;
        const min = (ln.kind === 'river' ? 0.7 : 0.5) * w;
        const n = pts.length;
        const rc = riverColors(pl);
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? rc.fill : rc.edge;
          for (let i = 0; i < n - 1; i++) {
            const t = i / Math.max(1, n - 2);
            ctx.lineWidth = min + (max - min) * t + (pass ? 0 : 0.9);
            ctx.beginPath();
            ctx.moveTo(pts[i][0], pts[i][1]);
            ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
            ctx.stroke();
          }
        }
        break;
      }
      case 'highway':
        ctx.strokeStyle = pl.road;
        ctx.lineWidth = 3.4 * w;
        strokePoly(ctx, pts);
        ctx.strokeStyle = 'rgba(255,246,222,0.95)';
        ctx.lineWidth = 1.5 * w;
        strokePoly(ctx, pts);
        break;
      case 'road':
        ctx.strokeStyle = pl.road;
        ctx.lineWidth = 1.6 * w;
        strokePoly(ctx, pts);
        break;
      case 'trail':
        ctx.strokeStyle = pl.road;
        ctx.lineWidth = 1.1 * w;
        ctx.setLineDash([3 * w, 2.6 * w]);
        strokePoly(ctx, pts);
        break;
      case 'rail':
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#2b2b2b';
        ctx.lineWidth = 2.8 * w;
        strokePoly(ctx, pts);
        ctx.strokeStyle = '#fafafa';
        ctx.lineWidth = 1.6 * w;
        ctx.setLineDash([6 * w, 6 * w]);
        strokePoly(ctx, pts);
        break;
      case 'border':
        ctx.strokeStyle = hexA(pl.border, 0.2);
        ctx.lineWidth = 6 * w;
        strokePoly(ctx, pts);
        ctx.strokeStyle = pl.border;
        ctx.lineWidth = 1.5 * w;
        ctx.setLineDash([7 * w, 3 * w, 1.5 * w, 3 * w]);
        strokePoly(ctx, pts);
        break;
      case 'wall':
        ctx.strokeStyle = inkOf(pl);
        ctx.lineWidth = 3.8 * w;
        strokePoly(ctx, pts);
        ctx.strokeStyle = '#cfc5b3';
        ctx.lineWidth = 2.4 * w;
        strokePoly(ctx, pts);
        ctx.strokeStyle = hexA(inkOf(pl), 0.45);
        ctx.lineCap = 'butt';
        ctx.lineWidth = 2.4 * w;
        ctx.setLineDash([1.2 * w, 2.4 * w]);
        strokePoly(ctx, pts);
        break;
      case 'route':
        ctx.strokeStyle = hexA(inkOf(pl), 0.55);
        ctx.lineWidth = 1 * w;
        ctx.setLineDash([5 * w, 4 * w]);
        strokePoly(ctx, pts);
        break;
      default:
        ctx.strokeStyle = inkOf(pl);
        ctx.lineWidth = 1.4 * w;
        strokePoly(ctx, pts);
    }
    ctx.restore();
  }

  function drawArea(ctx, ar) {
    if (ar.points.length < 3) return;
    const pts = sampleSpline(ar.points, true, 3);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = hexA(ar.color, ar.opacity != null ? ar.opacity : 0.22);
    ctx.fill();
    ctx.setLineDash([6, 3.5]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = hexA(ar.color, 0.85);
    ctx.stroke();
    ctx.restore();
  }

  function drawGrid(ctx, st) {
    const size = (st.gridSize || 12) * M.map.cell;
    ctx.save();
    ctx.strokeStyle = st.palette === 'night' ? 'rgba(255,255,255,0.6)' : 'rgba(50,40,30,0.85)';
    ctx.globalAlpha = st.gridOpacity != null ? st.gridOpacity : 0.25;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    if (st.grid === 'hex') {
      const r = size / 2;
      const w = Math.sqrt(3) * r;
      for (let row = 0, y = 0; y < M.Hpx + r; row++, y += r * 1.5) {
        for (let x = (row % 2) * w / 2; x < M.W + w; x += w) {
          for (let k = 0; k < 3; k++) {
            const a0 = Math.PI / 6 + k * Math.PI / 3;
            const a1 = a0 + Math.PI / 3;
            ctx.moveTo(x + r * Math.cos(a0), y + r * Math.sin(a0));
            ctx.lineTo(x + r * Math.cos(a1), y + r * Math.sin(a1));
          }
        }
      }
    } else {
      for (let x = size; x < M.W; x += size) { ctx.moveTo(x, 0); ctx.lineTo(x, M.Hpx); }
      for (let y = size; y < M.Hpx; y += size) { ctx.moveTo(0, y); ctx.lineTo(M.W, y); }
    }
    ctx.stroke();
    ctx.restore();
  }

  function stampName(s) {
    if (s.name) return s.name;
    if (s.entryId) {
      const e = P().entries.find((x) => x.id === s.entryId);
      if (e) return e.name;
    }
    return '';
  }

  function drawStampLabel(ctx, s, name, pl) {
    const a = AS.BY_ID[s.a];
    if (!a || s.lp === 'none' || a.labelPos === 'none') return;
    const pos = s.lp || a.labelPos || 'below';
    const big = a.cat === '町・建物' || a.cat === '和風';
    // 地図の広さに合わせた大きさ（全体表示でも読めるように）×「地名の大きさ」の設定
    const unit = Math.max(9, Math.min(18, M.W / 92)) * (M.map.style.labelScale || 1);
    const major = ['sym-capital', 'castle', 'city', 'jcastle'].includes(s.a);
    const size = s.ls || unit * (major ? 1.25 : a.cat === '地図記号' ? 0.95 : big ? 1.05 : 0.9);
    const weight = major ? 700 : 600;
    const sp = AS.sprite(s.a, s.v, palKey());
    const ink = pl.ink;
    const sideY = s.y + (a.anchor === 'center' ? 0 : -sp.h * s.s * 0.3);
    if (pos === 'right') drawText(ctx, name, 0, 0, { size, weight, color: ink, halo: pl.halo, align: 'left', x: s.x + (sp.x0 + sp.w) * s.s + 3, y: sideY });
    else if (pos === 'left') drawText(ctx, name, 0, 0, { size, weight, color: ink, halo: pl.halo, align: 'right', x: s.x + sp.x0 * s.s - 3, y: sideY });
    else if (pos === 'above') drawText(ctx, name, s.x, s.y + sp.y0 * s.s - size * 0.7, { size, weight, color: ink, halo: pl.halo });
    else drawText(ctx, name, s.x, s.y + (sp.y0 + sp.h) * s.s + size * 0.75, { size, weight, color: ink, halo: pl.halo });
  }

  const fontLoaded = new Set();
  function ensureFont(key, weight) {
    const f = FONTS[key];
    if (!f || fontLoaded.has(key + weight) || typeof document === 'undefined' || !document.fonts) return;
    fontLoaded.add(key + weight);
    document.fonts.load(`${weight || 400} 20px ${f.family}`, '地図あア国').then(() => draw()).catch(() => {});
  }

  /** 文字を描く（字間・縦書き・回転・曲線・縁取り）。戻り値は当たり判定用の大きさ */
  function drawText(ctx, text, cx, cy, o) {
    text = String(text || '');
    if (!text) return { w: 0, h: 0 };
    const size = o.size || 14;
    const fkey = o.font || 'serif';
    ensureFont(fkey, o.weight);
    const family = (FONTS[fkey] || FONTS.serif).family;
    ctx.save();
    ctx.font = `${o.weight || 500} ${size}px ${family}`;
    ctx.textBaseline = 'middle';
    const chars = Array.from(text);
    const spacing = (o.spacing || 0) * size;
    const widths = chars.map((c) => ctx.measureText(c).width);
    let w;
    let hh;
    let cyOff = 0;
    if (o.vertical) {
      w = size * 1.15;
      hh = chars.length * (size + spacing) - spacing;
    } else {
      w = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
      hh = size * 1.25;
    }
    if (o.align === 'left' || o.align === 'right') {
      ctx.translate(o.align === 'right' ? o.x - w : o.x, o.y);
    } else {
      ctx.translate(cx, cy);
      if (o.rotation) ctx.rotate(o.rotation * Math.PI / 180);
    }
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const passes = [];
    if (o.halo) passes.push((c, x, y) => { ctx.strokeStyle = o.halo; ctx.lineWidth = Math.max(2, size * 0.26); ctx.strokeText(c, x, y); });
    passes.push((c, x, y) => { ctx.fillStyle = o.color || '#222'; ctx.fillText(c, x, y); });
    const curve = !o.vertical && o.curve ? o.curve * Math.PI / 180 : 0;
    if (curve) {
      const R = w / Math.abs(curve);
      const k = Math.sign(curve);
      passes.forEach((fn) => {
        let s = 0;
        chars.forEach((c, i) => {
          const phi = (s + widths[i] / 2 - w / 2) / R;
          ctx.save();
          ctx.translate(R * Math.sin(phi), k * R * (1 - Math.cos(phi)));
          ctx.rotate(k * phi);
          ctx.textAlign = 'center';
          fn(c, 0, 0);
          ctx.restore();
          s += widths[i] + spacing;
        });
      });
      const sag = R * (1 - Math.cos(Math.abs(curve) / 2));
      hh += sag;
      cyOff = k * sag / 2;
    } else {
      passes.forEach((fn) => {
        if (o.vertical) {
          ctx.textAlign = 'center';
          let y = -hh / 2 + size / 2;
          chars.forEach((c) => { fn(c, 0, y); y += size + spacing; });
        } else {
          ctx.textAlign = 'left';
          let x = o.align === 'left' || o.align === 'right' ? 0 : -w / 2;
          chars.forEach((c, i) => { fn(c, x, 0); x += widths[i] + spacing; });
        }
      });
    }
    ctx.restore();
    return { w, h: hh, cy: cyOff };
  }

  function drawScale(ctx, pl) {
    const m = M.map;
    const kmPerPx = (m.style.kmPerCell || 4) / m.cell;
    const target = 120 * kmPerPx;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const nice = [1, 2, 5, 10].map((k) => k * pow).reverse().find((v) => v <= target) || pow;
    const len = nice / kmPerPx;
    const x = 24;
    const y = M.Hpx - 26;
    ctx.save();
    ctx.fillStyle = pl.halo;
    ctx.fillRect(x - 8, y - 17, len + 16, 28);
    ctx.strokeStyle = inkOf(pl);
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#fbf7ee' : inkOf(pl);
      ctx.fillRect(x + (len / 4) * i, y, len / 4, 4);
    }
    ctx.strokeRect(x, y, len, 4);
    ctx.restore();
    const label = nice >= 1 ? `${nice} km` : `${Math.round(nice * 1000)} m`;
    drawText(ctx, '0', 0, 0, { size: 10, color: pl.ink, align: 'left', x: x - 3, y: y - 7 });
    drawText(ctx, label, 0, 0, { size: 10, color: pl.ink, align: 'right', x: x + len + 4, y: y - 7 });
  }

  function drawTitle(ctx, name, kind, pl) {
    const size = 26;
    ensureFont('brush', 400);
    ctx.save();
    ctx.font = `400 ${size}px ${FONTS.brush.family}`;
    const chars = Array.from(name);
    const tw = chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + size * 0.15 * (chars.length - 1);
    ctx.restore();
    const cx = M.W / 2;
    const cy = 36;
    if (kind === 'banner') {
      const w = tw + 70;
      const hgt = 40;
      const x0 = cx - w / 2;
      const x1 = cx + w / 2;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#3a2e24';
      ctx.lineWidth = 1.3;
      [-1, 1].forEach((dir) => {
        const xe = dir < 0 ? x0 + 8 : x1 - 8;
        ctx.beginPath();
        ctx.moveTo(xe, cy - hgt / 2 + 8);
        ctx.lineTo(xe + dir * 30, cy - hgt / 2 + 8);
        ctx.lineTo(xe + dir * 20, cy + 4);
        ctx.lineTo(xe + dir * 30, cy + hgt / 2 + 8);
        ctx.lineTo(xe, cy + hgt / 2 + 8);
        ctx.closePath();
        ctx.fillStyle = '#d9c9a2';
        ctx.fill();
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(x0, cy - hgt / 2);
      ctx.quadraticCurveTo(cx, cy - hgt / 2 - 8, x1, cy - hgt / 2);
      ctx.lineTo(x1, cy + hgt / 2);
      ctx.quadraticCurveTo(cx, cy + hgt / 2 - 8, x0, cy + hgt / 2);
      ctx.closePath();
      ctx.fillStyle = '#f1e6c8';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      drawText(ctx, name, cx, cy - 3, { size, weight: 400, color: '#3a2e24', spacing: 0.15, font: 'brush' });
    } else {
      drawText(ctx, name, cx, cy, { size, weight: 400, color: pl.ink, spacing: 0.15, halo: pl.halo, font: 'brush' });
    }
  }

  function drawFrame(ctx, kind, pl) {
    if (kind === 'none') return;
    const ink = pl.ink === '#f2ead8' ? '#d8ccb4' : pl.ink;
    ctx.save();
    ctx.strokeStyle = ink;
    if (kind === 'ornate') {
      const b = 10;
      ctx.fillStyle = '#efe4c8';
      ctx.fillRect(0, 0, M.W, b);
      ctx.fillRect(0, M.Hpx - b, M.W, b);
      ctx.fillRect(0, 0, b, M.Hpx);
      ctx.fillRect(M.W - b, 0, b, M.Hpx);
      ctx.fillStyle = ink;
      const seg = 24;
      for (let x = b, i = 0; x < M.W - b; x += seg, i++) {
        if (i % 2) continue;
        ctx.fillRect(x, 3, Math.min(seg, M.W - b - x), 4);
        ctx.fillRect(x, M.Hpx - 7, Math.min(seg, M.W - b - x), 4);
      }
      for (let y = b, i = 0; y < M.Hpx - b; y += seg, i++) {
        if (i % 2) continue;
        ctx.fillRect(3, y, 4, Math.min(seg, M.Hpx - b - y));
        ctx.fillRect(M.W - 7, y, 4, Math.min(seg, M.Hpx - b - y));
      }
      ctx.lineWidth = 1.6;
      ctx.strokeRect(1, 1, M.W - 2, M.Hpx - 2);
      ctx.strokeRect(b, b, M.W - b * 2, M.Hpx - b * 2);
      ctx.lineWidth = 0.6;
      ctx.strokeRect(3, 3, M.W - 6, M.Hpx - 6);
      ctx.strokeRect(7, 7, M.W - 14, M.Hpx - 14);
      [[0, 0], [M.W - b, 0], [0, M.Hpx - b], [M.W - b, M.Hpx - b]].forEach(([x, y]) => {
        ctx.fillStyle = '#efe4c8';
        ctx.fillRect(x, y, b, b);
        ctx.strokeRect(x + 1, y + 1, b - 2, b - 2);
        ctx.beginPath();
        ctx.arc(x + b / 2, y + b / 2, 2, 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
      });
    } else {
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, M.W - 2, M.Hpx - 2);
      ctx.lineWidth = 0.7;
      ctx.strokeRect(5, 5, M.W - 10, M.Hpx - 10);
    }
    ctx.restore();
  }

  // ───── 選んだ素材・文字の、大きさと向きの取っ手 ─────
  /** 1つだけ選んでいる素材・文字の外枠（回転を含む）と取っ手の位置（ワールド座標） */
  function transformBox() {
    if (M.sel.length !== 1) return null;
    const { k, obj } = selObjs()[0] || {};
    if (!obj || (k !== 'stamp' && k !== 'label') || layerLocked(layerOf(k))) return null;
    let cx; let cy; let x0; let y0; let x1; let y1; let deg;
    if (k === 'stamp') {
      const sp = AS.sprite(obj.a, obj.v, palKey());
      cx = obj.x; cy = obj.y; deg = obj.r || 0;
      x0 = obj.f ? -(sp.x0 + sp.w) * obj.s : sp.x0 * obj.s;
      x1 = obj.f ? -sp.x0 * obj.s : (sp.x0 + sp.w) * obj.s;
      y0 = sp.y0 * obj.s; y1 = (sp.y0 + sp.h) * obj.s;
    } else {
      const box = M.labelBoxes.get(obj.id);
      if (!box) return null;
      cx = obj.x; cy = obj.y + (box.cy || 0); deg = obj.rotation || 0;
      x0 = -box.w / 2; x1 = box.w / 2; y0 = -box.h / 2; y1 = box.h / 2;
    }
    const z = M.zoom;
    const pad = 3 / z;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const a = deg * Math.PI / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tw = (lx, ly) => [cx + lx * ca - ly * sa, cy + lx * sa + ly * ca];
    return {
      k, obj, cx, cy, deg,
      corners: [tw(x0, y0), tw(x1, y0), tw(x1, y1), tw(x0, y1)],
      rot: tw((x0 + x1) / 2, y0 - 22 / z),
      rotBase: tw((x0 + x1) / 2, y0),
    };
  }

  /** 取っ手の上か（touch は少し広め） */
  function handleAt(w, touch) {
    const tb = transformBox();
    if (!tb) return null;
    const tol = (touch ? 16 : 8) / M.zoom;
    if (Math.hypot(w.x - tb.rot[0], w.y - tb.rot[1]) <= tol) return { kind: 'rotate', tb };
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(w.x - tb.corners[i][0], w.y - tb.corners[i][1]) <= tol) return { kind: 'scale', tb, corner: i };
    }
    return null;
  }

  function drawHandles(ctx) {
    const tb = transformBox();
    if (!tb) return;
    const z = M.zoom;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.4 / z;
    ctx.strokeStyle = '#2f6fed';
    ctx.beginPath();
    ctx.moveTo(tb.rotBase[0], tb.rotBase[1]);
    ctx.lineTo(tb.rot[0], tb.rot[1]);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(tb.rot[0], tb.rot[1], 5 / z, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    tb.corners.forEach((c) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(c[0] - 4 / z, c[1] - 4 / z, 8 / z, 8 / z);
      ctx.strokeRect(c[0] - 4 / z, c[1] - 4 / z, 8 / z, 8 / z);
    });
    ctx.restore();
  }

  function drawOverlay(ctx) {
    const z = M.zoom;
    ctx.save();
    ctx.lineWidth = 1.5 / z;
    selObjs().forEach(({ k, obj }) => {
      ctx.strokeStyle = '#2f6fed';
      ctx.setLineDash([4 / z, 3 / z]);
      if (k === 'stamp') {
        const sp = AS.sprite(obj.a, obj.v, palKey());
        ctx.save();
        ctx.translate(obj.x, obj.y);
        if (obj.r) ctx.rotate(obj.r * Math.PI / 180);
        const bx = obj.f ? -(sp.x0 + sp.w) * obj.s : sp.x0 * obj.s;
        ctx.strokeRect(bx - 2 / z, sp.y0 * obj.s - 2 / z, sp.w * obj.s + 4 / z, sp.h * obj.s + 4 / z);
        ctx.restore();
      } else if (k === 'label') {
        const box = M.labelBoxes.get(obj.id);
        if (box) {
          ctx.save();
          ctx.translate(obj.x, obj.y + (box.cy || 0));
          ctx.rotate((obj.rotation || 0) * Math.PI / 180);
          ctx.strokeRect(-box.w / 2 - 4 / z, -box.h / 2 - 3 / z, box.w + 8 / z, box.h + 6 / z);
          ctx.restore();
        }
      } else {
        const pts = sampleSpline(obj.points, k === 'area', 4);
        ctx.beginPath();
        pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
        if (k === 'area') ctx.closePath();
        ctx.stroke();
        if (M.sel.length === 1) {
          ctx.setLineDash([]);
          obj.points.forEach((pt, i) => {
            ctx.fillStyle = M.vertex === i ? '#2f6fed' : '#fff';
            ctx.fillRect(pt[0] - 3.5 / z, pt[1] - 3.5 / z, 7 / z, 7 / z);
            ctx.strokeRect(pt[0] - 3.5 / z, pt[1] - 3.5 / z, 7 / z, 7 / z);
          });
        }
      }
    });
    ctx.setLineDash([]);
    if (!M.drag || M.drag.kind === 'scale' || M.drag.kind === 'rotate') drawHandles(ctx);
    if (M.drag && M.drag.kind === 'box') {
      const d = M.drag;
      const x = Math.min(d.start.x, d.end.x);
      const y = Math.min(d.start.y, d.end.y);
      ctx.fillStyle = 'rgba(47,111,237,0.08)';
      ctx.strokeStyle = '#2f6fed';
      ctx.fillRect(x, y, Math.abs(d.end.x - d.start.x), Math.abs(d.end.y - d.start.y));
      ctx.strokeRect(x, y, Math.abs(d.end.x - d.start.x), Math.abs(d.end.y - d.start.y));
    }
    const drafting = M.draft && M.draft.length ? M.draft.concat(M.hover ? [[M.hover.x, M.hover.y]] : []) : M.freehand && M.freehand.active ? M.freehand.pts : null;
    if (drafting) {
      ctx.setLineDash(M.freehand ? [] : [5 / z, 4 / z]);
      ctx.strokeStyle = PREF.tool === 'area' ? PREF.area.color : '#2f6fed';
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      drafting.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
      if (PREF.tool === 'area' && drafting.length > 2) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      (M.draft || []).forEach((pt) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pt[0], pt[1], 3.5 / z, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    }
    if (M.hover && !M.space && !(M.drag && M.drag.kind === 'pan')) {
      const t = PREF.tool;
      let r = 0;
      if (t === 'land' || t === 'water' || t === 'relief' || t === 'ground') r = PREF.brush.size * M.map.cell;
      else if (t === 'scatter') r = PREF.scatter.size;
      else if (t === 'erase') r = PREF.erase.size;
      if (r) {
        ctx.strokeStyle = 'rgba(20,20,20,0.75)';
        ctx.lineWidth = 1.2 / z;
        ctx.beginPath(); ctx.arc(M.hover.x, M.hover.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(M.hover.x, M.hover.y, r + 1.2 / z, 0, Math.PI * 2); ctx.stroke();
      }
      if (t === 'stamp' && !M.drag) {
        const a = AS.BY_ID[PREF.stamp.a];
        if (a) {
          const sp = AS.sprite(a.id, 0, palKey());
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.translate(M.hover.x, M.hover.y);
          if (PREF.stamp.r) ctx.rotate(PREF.stamp.r * Math.PI / 180);
          ctx.scale(PREF.stamp.s, PREF.stamp.s);
          ctx.drawImage(sp.canvas, sp.x0, sp.y0, sp.w, sp.h);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  // ───── 書き出し ─────
  function exportDialog() {
    const sel = h('select', { class: 'input' }, [1, 2, 3].map((s) => h('option', { value: s, selected: s === 2 }, `${s}倍（${Math.round(M.W * s)}×${Math.round(M.Hpx * s)}px）`)));
    UI.modal({
      title: '画像として書き出す',
      body: h('div', { class: 'stack' }, UI.field('大きさ', sel), h('p', { class: 'muted small' }, '大きいほどきれいですが、書き出しに時間がかかります。隠しているレイヤーは書き出されません。')),
      actions: [{ label: 'キャンセル', ghost: true }, { label: '書き出す', primary: true, onClick: () => { exportPng(+sel.value); } }],
    });
  }

  async function exportPng(scale) {
    const iw = Math.round(M.W * scale);
    const ih = Math.round(M.Hpx * scale);
    const base = document.createElement('canvas');
    base.width = iw;
    base.height = ih;
    const bctx = base.getContext('2d');
    const img = bctx.createImageData(iw, ih);
    const mask = document.createElement('canvas');
    mask.width = iw;
    mask.height = ih;
    const mctx = mask.getContext('2d');
    const mimg = mctx.createImageData(iw, ih);
    M.progress.hidden = false;
    for (let y = 0; y < ih; y += 48) {
      E.renderTerrain(M.map, M.H, M.B, img, 0, y, iw, Math.min(ih, y + 48), scale, mimg);
      if (y % 240 === 0) {
        M.progress.textContent = `書き出し中… ${Math.round((y / ih) * 100)}%`;
        await new Promise((r) => setTimeout(r, 0));
        if (!M) return;
      }
    }
    bctx.putImageData(img, 0, 0);
    mctx.putImageData(mimg, 0, 0);
    const c = document.createElement('canvas');
    c.width = iw;
    c.height = ih;
    const ctx = c.getContext('2d');
    renderMap(ctx, { scale, tx: 0, ty: 0, w: iw, h: ih, editing: false }, { base, mask });
    M.progress.hidden = true;
    c.toBlob((blob) => {
      if (!blob) { toast('書き出せませんでした（画像が大きすぎる可能性があります）', 'error'); return; }
      UI.download(UI.safeFilename(M.map.name) + '.png', blob);
      toast('PNG を書き出しました');
    }, 'image/png');
  }

  // ───── パネル ─────
  function renderInspector(focusName) {
    if (!M || !M.inspector) return;
    const box = M.inspector;
    clear(box);
    box.appendChild(h('div', { class: 'sheet-handle' }, h('span', { class: 'small muted' }, '詳細'), btn('', { icon: 'x', ghost: true, small: true, title: 'パネルを閉じる', onClick: () => setSheet(false) })));
    const items = selObjs();
    if (items.length) box.appendChild(selectionPane(items));
    else {
      box.appendChild(toolPane());
      if (PREF.tool === 'select' || PREF.tool === 'pan') {
        box.appendChild(placesPane());
        box.appendChild(mapPane());
      }
    }
    if (focusName) {
      const f = box.querySelector('[data-focus]');
      if (f) setTimeout(() => { f.focus(); if (f.select) f.select(); }, 30);
    }
  }

  function section(title, ...children) {
    return h('section', { class: 'insp-section' }, title ? h('h3', null, title) : null, ...children);
  }

  function range(value, min, max, step, onInput, fmt) {
    const out = h('span', { class: 'muted small range-out' }, fmt ? fmt(value) : value);
    const r = h('input', { type: 'range', class: 'range', min, max, step, value, oninput: (e) => { const v = parseFloat(e.target.value); out.textContent = fmt ? fmt(v) : v; onInput(v); } });
    return h('div', { class: 'row' }, r, out);
  }

  function assetGrid(ids, activeId, onPick) {
    const pk = palKey();
    return h('div', { class: 'asset-grid' }, ids.map((id) => {
      const a = AS.BY_ID[id];
      return h('button', {
        type: 'button', class: 'asset-btn' + (id === activeId ? ' active' : ''), title: a.label, 'aria-label': a.label,
        onclick: () => onPick(id),
      }, AS.thumb(id, pk, 40), h('span', null, a.label));
    }));
  }

  function toolPane() {
    const t = TOOLS.find((x) => x.id === PREF.tool) || TOOLS[0];
    const parts = [h('p', { class: 'muted small' }, t.hint)];
    const brushSize = () => UI.field('ブラシの大きさ（[ ]）', range(PREF.brush.size, 1, 40, 1, (v) => { PREF.brush.size = v; savePref(); draw(); }));
    const strength = () => UI.field('強さ', range(PREF.brush.strength, 0.1, 1, 0.05, (v) => { PREF.brush.strength = v; savePref(); }, (v) => Math.round(v * 100) + '%'));
    if (t.id === 'land' || t.id === 'water') parts.push(brushSize(), strength());
    if (t.id === 'relief') {
      parts.push(h('div', { class: 'chips' }, [['raise', '高く'], ['lower', '低く'], ['smooth', 'なだらかに']].map(([k, l]) => h('button', {
        type: 'button', class: 'chip' + (PREF.relief === k ? ' active' : ''), onclick: () => { PREF.relief = k; savePref(); renderInspector(); },
      }, l))), brushSize(), strength());
    }
    if (t.id === 'ground') {
      const pl = pal();
      parts.push(h('div', { class: 'swatch-grid' }, E.BIOMES.map((b) => {
        const col = b.id ? pl.biome[b.id] : pl.ramp[0][1];
        return h('button', { type: 'button', class: 'swatch-btn' + (PREF.biome === b.id ? ' active' : ''), onclick: () => { PREF.biome = b.id; savePref(); renderInspector(); } },
          h('span', { class: 'swatch', style: { background: `rgb(${col.map(Math.round).join(',')})` } }), b.label);
      })), brushSize());
    }
    if (t.id === 'stamp') {
      const cats = AS.CATEGORIES;
      if (!cats.includes(PREF.stamp.cat)) PREF.stamp.cat = cats[0];
      const pick = (id) => {
        PREF.stamp.a = id;
        // 最近使った素材（先頭に）
        PREF.recent = [id].concat((PREF.recent || []).filter((x) => x !== id && AS.BY_ID[x])).slice(0, 8);
        savePref();
        renderInspector();
      };
      const gridBox = h('div');
      const showGrid = () => {
        clear(gridBox);
        const q = (M.assetQ || '').trim();
        if (q) {
          const qs = q.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
          const hits = AS.ASSETS.filter((a) => (a.label + ' ' + a.cat + ' ' + a.id).indexOf(q) >= 0 || a.label.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)).indexOf(qs) >= 0);
          gridBox.appendChild(hits.length ? assetGrid(hits.map((a) => a.id), PREF.stamp.a, pick) : h('p', { class: 'small muted' }, '見つかりません'));
        } else {
          gridBox.appendChild(assetGrid(AS.ASSETS.filter((a) => a.cat === PREF.stamp.cat).map((a) => a.id), PREF.stamp.a, pick));
        }
      };
      const search = h('input', {
        class: 'input', type: 'search', placeholder: '素材を探す（例：城、木、塔）', value: M.assetQ || '', 'aria-label': '素材を探す',
        oninput: (e) => { M.assetQ = e.target.value; showGrid(); },
      });
      parts.push(search);
      const recent = (PREF.recent || []).filter((x) => AS.BY_ID[x]);
      if (recent.length) parts.push(h('div', { class: 'small muted' }, '最近使った素材'), assetGrid(recent, PREF.stamp.a, pick));
      parts.push(h('div', { class: 'chips' }, cats.map((c) => h('button', {
        type: 'button', class: 'chip' + (PREF.stamp.cat === c && !(M.assetQ || '').trim() ? ' active' : ''), onclick: () => { PREF.stamp.cat = c; M.assetQ = ''; savePref(); renderInspector(); },
      }, c))));
      showGrid();
      parts.push(gridBox);
      parts.push(UI.field('大きさ（[ ]）', range(PREF.stamp.s, 0.2, 4, 0.05, (v) => { PREF.stamp.s = v; savePref(); draw(); }, (v) => Math.round(v * 100) + '%')));
      parts.push(UI.field('回転（Q / E）', range(PREF.stamp.r, 0, 345, 15, (v) => { PREF.stamp.r = v; savePref(); draw(); }, (v) => v + '°')));
      parts.push(h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: PREF.stamp.randVar, onchange: (e) => { PREF.stamp.randVar = e.target.checked; savePref(); } }), '置くたびに形を少し変える'));
      parts.push(h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: PREF.stamp.randFlip, onchange: (e) => { PREF.stamp.randFlip = e.target.checked; savePref(); } }), 'ランダムに左右反転'));
    }
    if (t.id === 'scatter') {
      parts.push(h('div', { class: 'asset-grid' }, AS.SCATTER.map((s) => h('button', {
        type: 'button', class: 'asset-btn' + (PREF.scatter.set === s.id ? ' active' : ''), onclick: () => { PREF.scatter.set = s.id; savePref(); renderInspector(); },
      }, AS.thumb(s.assets[0], palKey(), 40), h('span', null, s.label)))));
      parts.push(UI.field('ブラシの大きさ（[ ]）', range(PREF.scatter.size, 4, 120, 1, (v) => { PREF.scatter.size = v; savePref(); draw(); })));
      parts.push(UI.field('密度', range(PREF.scatter.density, 0.4, 2, 0.1, (v) => { PREF.scatter.density = v; savePref(); }, (v) => Math.round(v * 100) + '%')));
      parts.push(UI.field('素材の大きさ', range(PREF.scatter.scale, 0.4, 3, 0.05, (v) => { PREF.scatter.scale = v; savePref(); }, (v) => Math.round(v * 100) + '%')));
    }
    if (t.id === 'erase') parts.push(UI.field('消しゴムの大きさ（[ ]）', range(PREF.erase.size, 3, 120, 1, (v) => { PREF.erase.size = v; savePref(); draw(); })));
    if (t.id === 'path') {
      parts.push(h('div', { class: 'swatch-grid' }, Object.keys(PATH_KINDS).map((k) => h('button', {
        type: 'button', class: 'swatch-btn' + (PREF.path.kind === k ? ' active' : ''), onclick: () => { PREF.path.kind = k; savePref(); renderInspector(); },
      }, h('span', { class: 'line-sample ls-' + k }), PATH_KINDS[k].label))));
      parts.push(UI.field('太さ', range(PREF.path.w, 0.4, 4, 0.1, (v) => { PREF.path.w = v; savePref(); }, (v) => Math.round(v * 100) + '%')));
    }
    if (t.id === 'area') {
      parts.push(h('div', { class: 'swatches' }, AREA_COLORS.map((c) => h('button', {
        type: 'button', class: 'swatch' + (PREF.area.color === c ? ' active' : ''), style: { background: c }, 'aria-label': c,
        onclick: () => { PREF.area.color = c; savePref(); renderInspector(); },
      }))));
      parts.push(UI.field('塗りの濃さ', range(PREF.area.opacity, 0, 0.7, 0.02, (v) => { PREF.area.opacity = v; savePref(); }, (v) => Math.round(v * 100) + '%')));
    }
    if (t.id === 'label') {
      parts.push(h('div', { class: 'swatch-grid' }, Object.keys(LABEL_STYLES).map((k) => h('button', {
        type: 'button', class: 'swatch-btn' + (PREF.label.style === k ? ' active' : ''), onclick: () => { PREF.label.style = k; savePref(); renderInspector(); },
      }, LABEL_STYLES[k].label))));
    }
    return section('道具：' + t.label, ...parts);
  }

  function selectionPane(items) {
    const p = P();
    const parts = [];
    let undoPushed = false;
    const beginEdit = () => { if (!undoPushed) { pushUndo(); undoPushed = true; } };
    const changed = (redrawInsp) => { commit(); draw(); if (redrawInsp) renderInspector(); };
    const actions = h('div', { class: 'row wrap' },
      btn('削除', { icon: 'trash', small: true, danger: true, ghost: true, onClick: deleteSelection }),
      btn('複製', { icon: 'copy', small: true, ghost: true, onClick: duplicateSel }),
      btn('選択を解除', { small: true, ghost: true, onClick: () => { M.sel = []; M.vertex = null; renderInspector(); draw(); } }));
    if (items.length > 1) {
      const stamps = items.filter((o) => o.k === 'stamp');
      parts.push(h('p', null, `${items.length}個を選択中（素材 ${stamps.length}）`));
      if (stamps.length) {
        const bases = stamps.map((o) => o.obj.s);
        parts.push(UI.field('大きさをまとめて変える', range(100, 30, 300, 5, (v) => {
          beginEdit();
          stamps.forEach((o, i) => { o.obj.s = Math.round(bases[i] * v) / 100; });
          changed();
        }, (v) => v + '%')));
      }
      parts.push(actions);
      return section('複数選択', ...parts);
    }
    const { k, obj } = items[0];
    if (k === 'stamp') {
      const a = AS.BY_ID[obj.a] || AS.ASSETS[0];
      const entry = obj.entryId ? p.entries.find((x) => x.id === obj.entryId) : null;
      parts.push(h('div', { class: 'row' }, AS.thumb(obj.a, palKey(), 44), h('div', null, h('strong', null, a.label), h('div', { class: 'muted small' }, a.cat))));
      parts.push(UI.field('名前（地図に表示）', h('input', {
        class: 'input', type: 'text', value: obj.name || '', placeholder: entry ? entry.name : '例：王都ルーネ', dataset: { focus: '1' },
        oninput: (e) => { beginEdit(); obj.name = e.target.value; changed(); },
      })));
      parts.push(h('div', { class: 'grid-2' },
        UI.field('名前の位置', h('select', { class: 'input', onchange: (e) => { beginEdit(); obj.lp = e.target.value; changed(); } },
          [['', '自動'], ['below', '下'], ['right', '右'], ['above', '上'], ['left', '左'], ['none', '表示しない']].map(([v, l]) => h('option', { value: v, selected: (obj.lp || '') === v }, l)))),
        UI.field('種類', h('select', { class: 'input', onchange: (e) => { beginEdit(); obj.a = e.target.value; obj.v = 0; changed(true); } },
          AS.ASSETS.filter((x) => x.cat === a.cat).map((x) => h('option', { value: x.id, selected: x.id === obj.a }, x.label))))));
      parts.push(UI.field('大きさ', range(obj.s, 0.2, 5, 0.05, (v) => { beginEdit(); obj.s = v; changed(); }, (v) => Math.round(v * 100) + '%')));
      parts.push(UI.field('回転', range(obj.r || 0, 0, 359, 1, (v) => { beginEdit(); obj.r = v; changed(); }, (v) => v + '°')));
      parts.push(h('div', { class: 'row wrap' },
        btn('左右反転', { icon: 'flip', small: true, onClick: () => { beginEdit(); obj.f = !obj.f; changed(); } }),
        a.variants > 1 ? btn('形を変える', { icon: 'dice', small: true, onClick: () => { beginEdit(); obj.v = ((obj.v || 0) + 1) % a.variants; changed(); } }) : null),
      h('div', { class: 'row wrap' },
        btn('最前面へ', { icon: 'up', small: true, ghost: true, title: 'ほかの素材より手前に描く', onClick: () => { beginEdit(); setStampZ(obj, 'front'); changed(true); } }),
        btn('最背面へ', { icon: 'down', small: true, ghost: true, title: 'ほかの素材より奥に描く', onClick: () => { beginEdit(); setStampZ(obj, 'back'); changed(true); } }),
        obj.z ? btn('前後を自動に戻す', { small: true, ghost: true, title: '上にあるものほど奥に描く、ふつうの順に戻す', onClick: () => { beginEdit(); setStampZ(obj, 'auto'); changed(true); } }) : null));
      const places = p.entries.filter((x) => x.type === 'place');
      parts.push(UI.field('設定資料とつなぐ', h('select', {
        class: 'input', onchange: (e) => { beginEdit(); obj.entryId = e.target.value; changed(true); },
      }, h('option', { value: '' }, '（つながっていない）'), places.map((x) => h('option', { value: x.id, selected: x.id === obj.entryId }, x.name)))));
      if (entry) {
        parts.push(h('div', { class: 'linked-entry' }, NS.Lore.summaryList(entry, p),
          btn('設定資料を開く', { small: true, icon: 'users', onClick: () => NS.App.navigate('lore', { id: entry.id }) })));
      } else {
        parts.push(btn('この地点を設定資料に登録', { small: true, icon: 'plus', onClick: () => {
          const name = obj.name || a.label;
          const e = NS.Lore.newEntry('place', name);
          e.fields.kind = a.label;
          if (obj.note) e.fields.desc = obj.note;
          p.entries.push(e);
          beginEdit();
          obj.entryId = e.id;
          if (!obj.name) obj.name = name;
          changed(true);
          toast(`「${name}」を設定資料の「場所」に登録しました`);
        } }));
      }
      parts.push(UI.field('メモ', h('textarea', { class: 'input', rows: 2, value: obj.note || '', oninput: (e) => { obj.note = e.target.value; commit(); } })));
    } else if (k === 'label') {
      const sty = LABEL_STYLES[obj.style] || LABEL_STYLES.region;
      parts.push(UI.field('文字', h('input', { class: 'input', type: 'text', value: obj.text, dataset: { focus: '1' }, oninput: (e) => { beginEdit(); obj.text = e.target.value; changed(); } })));
      parts.push(h('div', { class: 'grid-2' },
        UI.field('種類', h('select', { class: 'input', onchange: (e) => { beginEdit(); obj.style = e.target.value; obj.size = LABEL_STYLES[obj.style].size; delete obj.font; changed(true); } },
          Object.keys(LABEL_STYLES).map((s) => h('option', { value: s, selected: obj.style === s }, LABEL_STYLES[s].label)))),
        UI.field('書体', h('select', { class: 'input', onchange: (e) => { beginEdit(); obj.font = e.target.value; changed(); } },
          Object.keys(FONTS).map((f) => h('option', { value: f, selected: (obj.font || sty.font) === f }, FONTS[f].label))))));
      parts.push(UI.field('大きさ', range(obj.size || sty.size, 6, 96, 1, (v) => { beginEdit(); obj.size = v; changed(); })));
      parts.push(UI.field('字間', range(obj.spacing != null ? obj.spacing : sty.spacing, 0, 1.5, 0.05, (v) => { beginEdit(); obj.spacing = v; changed(); })));
      parts.push(UI.field('回転', range(obj.rotation || 0, -90, 90, 1, (v) => { beginEdit(); obj.rotation = v; changed(); }, (v) => v + '°')));
      parts.push(UI.field('曲げる（弧）', range(obj.curve || 0, -180, 180, 5, (v) => { beginEdit(); obj.curve = v; changed(); }, (v) => v + '°')));
      parts.push(UI.field('色', h('div', { class: 'swatches' }, LABEL_COLORS.map(([c, l]) => h('button', {
        type: 'button', class: 'swatch' + ((obj.color || '') === c ? ' active' : ''), title: l, 'aria-label': l, style: { background: c || 'transparent' },
        onclick: () => { beginEdit(); obj.color = c; changed(true); },
      })))));
      parts.push(h('div', { class: 'check-grid' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!obj.vertical, onchange: (e) => { beginEdit(); obj.vertical = e.target.checked; changed(); } }), '縦書き'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: obj.halo !== false, onchange: (e) => { beginEdit(); obj.halo = e.target.checked; changed(); } }), '縁取り')));
    } else if (k === 'path') {
      parts.push(UI.field('種類', h('select', { class: 'input', onchange: (e) => { beginEdit(); obj.kind = e.target.value; changed(); } },
        Object.keys(PATH_KINDS).map((x) => h('option', { value: x, selected: obj.kind === x }, PATH_KINDS[x].label)))));
      parts.push(UI.field('太さ', range(obj.w || 1, 0.3, 5, 0.1, (v) => { beginEdit(); obj.w = v; changed(); }, (v) => Math.round(v * 100) + '%')));
      parts.push(UI.field('自然な揺らぎ', range(obj.wobble != null ? obj.wobble : 0.3, 0, 1.5, 0.05, (v) => { beginEdit(); obj.wobble = v; changed(); }, (v) => Math.round(v * 100) + '%')));
      parts.push(UI.field('名前（メモ）', h('input', { class: 'input', type: 'text', value: obj.name || '', oninput: (e) => { obj.name = e.target.value; commit(); } }), '地図に名前を書くには「文字」道具を使います'));
      parts.push(h('p', { class: 'muted small' }, `頂点 ${obj.points.length}個。頂点をドラッグで動かし、選んで Delete で削除できます。`));
      parts.push(btn('向きを反転（川の上流・下流）', { small: true, onClick: () => { beginEdit(); obj.points.reverse(); changed(); } }));
    } else if (k === 'area') {
      parts.push(UI.field('名前', h('input', { class: 'input', type: 'text', value: obj.name || '', dataset: { focus: '1' }, placeholder: '例：エルミナ王国', oninput: (e) => { beginEdit(); obj.name = e.target.value; changed(); } })));
      parts.push(UI.field('色', h('div', { class: 'swatches' }, AREA_COLORS.map((c) => h('button', {
        type: 'button', class: 'swatch' + (obj.color === c ? ' active' : ''), style: { background: c }, 'aria-label': c,
        onclick: () => { beginEdit(); obj.color = c; changed(true); },
      })))));
      parts.push(UI.field('塗りの濃さ', range(obj.opacity != null ? obj.opacity : 0.22, 0, 0.8, 0.02, (v) => { beginEdit(); obj.opacity = v; changed(); }, (v) => Math.round(v * 100) + '%')));
    }
    parts.push(actions);
    const title = { stamp: '素材', label: '文字', path: '線：' + ((PATH_KINDS[obj.kind] || {}).label || ''), area: '領域' }[k];
    return section(title, ...parts);
  }

  function placesPane() {
    const named = M.map.stamps.filter((s) => s.name || s.entryId);
    const list = h('div', { class: 'marker-list' }, named.length ? named.map((s) => h('button', {
      type: 'button', class: 'marker-row', onclick: () => { M.sel = [{ k: 'stamp', id: s.id }]; centerOn(s.x, s.y); renderInspector(); },
    }, AS.thumb(s.a, palKey(), 22), h('span', null, stampName(s) || '（名前なし）'), s.entryId ? icon('link', 14) : h('span'))) : h('p', { class: 'muted small' }, '名前の付いた地点はまだありません。「素材」で城や町を置き、選択して名前を付けます。'));
    return section('地名の一覧', list);
  }

  // 地形に合わせて、山・丘・森などの自然の素材を置き直す（町や建物、文字はそのまま）
  const NATURE = new Set(['mountain', 'mountain-tall', 'mountain-snow', 'mountain-range', 'hill', 'tree-round', 'tree-conifer', 'tree-snow', 'tree-jungle', 'tree-palm', 'reeds', 'dune', 'rocks']);
  const MOUNTAINS = new Set(['mountain', 'mountain-tall', 'mountain-snow', 'mountain-range', 'hill']);
  function replantDialog() {
    const m = M.map;
    const cM = m.stamps.filter((x) => MOUNTAINS.has(x.a)).length;
    const cT = m.stamps.filter((x) => NATURE.has(x.a) && !MOUNTAINS.has(x.a)).length;
    const chM = h('input', { type: 'checkbox', checked: true });
    const chT = h('input', { type: 'checkbox', checked: false });
    UI.modal({
      title: '山・森を置き直す',
      body: h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, '今の地形（高さ・地面の種類）に合わせて、自然の素材を自動で置き直します。町・建物・文字・道などはそのままです。手で置いた山や木も置き直されます（「元に戻す」で戻せます）。'),
        h('label', { class: 'check' }, chM, `山・丘（今 ${cM}個）`),
        h('label', { class: 'check' }, chT, `森・湿地・砂丘・岩（今 ${cT}個）`)),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: '置き直す', primary: true, onClick: () => {
          if (!chM.checked && !chT.checked) return;
          pushUndo();
          const fresh = E.autoStamps(m, M.H, M.B, (m.seed || 1) + Date.now() % 997);
          const want = (a) => (MOUNTAINS.has(a) ? chM.checked : NATURE.has(a) ? chT.checked : false);
          m.stamps = m.stamps.filter((x) => !want(x.a)).concat(fresh.filter((x) => want(x.a)));
          sortStamps();
          M.sel = [];
          commit();
          draw();
          renderInspector();
          toast('置き直しました');
        } },
      ],
    });
  }

  function mapPane() {
    const p = P();
    const m = M.map;
    const st = m.style;
    const set = (k, v, terrain) => { pushUndo(); st[k] = v; if (terrain) renderTerrainFull(); commit(); draw(); };
    const toggle = (k, label, terrain) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st[k], onchange: (e) => set(k, e.target.checked, terrain) }), label);
    const sel = (k, opts, label) => UI.field(label, h('select', { class: 'input', onchange: (e) => { set(k, e.target.value); renderInspector(); } }, opts.map(([v, l]) => h('option', { value: v, selected: String(st[k]) === v }, l))));
    return section('地図の設定',
      UI.field('名前', h('input', { class: 'input', type: 'text', value: m.name, onchange: (e) => {
        m.name = e.target.value || '地図';
        commit();
        draw();
        const o = M.view.querySelector('.map-select option[value="' + m.id + '"]');
        if (o) o.textContent = m.name;
      } })),
      UI.field('配色', h('select', { class: 'input', onchange: (e) => { set('palette', e.target.value, true); renderInspector(); } },
        Object.keys(E.PALETTES).map((k) => h('option', { value: k, selected: st.palette === k }, E.PALETTES[k].label)))),
      h('div', { class: 'grid-2' },
        sel('title', [['none', 'なし'], ['plain', '文字だけ'], ['banner', '帯（リボン）']], '題名'),
        sel('frame', [['none', 'なし'], ['simple', 'シンプル'], ['ornate', '古地図風']], '枠')),
      UI.field('地名の大きさ', h('select', { class: 'input', onchange: (e) => { set('labelScale', parseFloat(e.target.value)); renderInspector(); } },
        [[0.8, '小さめ'], [1, 'ふつう'], [1.25, '大きめ'], [1.55, 'とても大きく']].map(([v, l]) => h('option', { value: v, selected: (st.labelScale || 1) === v }, l)))),
      h('div', { class: 'grid-2' },
        sel('grid', [['none', 'なし'], ['square', '方眼'], ['hex', '六角形（ヘックス）']], 'マス目'),
        UI.field('マスの大きさ', h('input', { class: 'input input-num', type: 'number', min: 2, max: 80, value: st.gridSize || 12, onchange: (e) => set('gridSize', Math.max(2, parseInt(e.target.value, 10) || 12)) }))),
      UI.field('縮尺（1マス＝何km）', h('input', { class: 'input input-num', type: 'number', min: 0.01, step: 0.5, value: st.kmPerCell, onchange: (e) => set('kmPerCell', Math.max(0.01, parseFloat(e.target.value) || 1)) }),
        `地図の横幅 ≒ ${UI.fmtNum(m.gw * st.kmPerCell)} km`),
      h('div', { class: 'check-grid' },
        toggle('hillshade', '起伏の陰影', true), toggle('ripples', '海の波紋', true),
        toggle('scale', '縮尺'), toggle('vignette', '周辺を暗く'), toggle('texture', '紙の質感')),
      h('div', { class: 'row wrap' },
        btn('山・森を置き直す', { icon: 'mountain', small: true, title: '今の地形（高さ・地面）に合わせて、山・丘・森などを自動で置き直します', onClick: replantDialog }),
        btn('地形を作り直す', { icon: 'dice', small: true, onClick: () => newMapDialog(true) }),
        btn('画像で書き出す', { icon: 'image', small: true, onClick: exportDialog })),
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
        } })),
      h('details', { class: 'hint-details' }, h('summary', { class: 'small' }, '操作のヒント'), h('ul', { class: 'hint-list small muted' },
        h('li', null, 'ホイール／ピンチで拡大縮小、スペース＋ドラッグ・2本指で移動'),
        h('li', null, '道具のキー：V 選択・H 移動・B 陸・N 海・R 起伏・G 地面・S 素材・F 散布・X 消す・L 道川・A 領域・T 文字'),
        h('li', null, 'Q / E で回転、[ ] で大きさ、Ctrl+D で複製、Ctrl+Z で元に戻す'),
        h('li', null, '何もない所をドラッグで範囲選択、Shift+クリックで追加選択'))));
  }

  V.TOOLS = TOOLS;
  NS.Views.map = V;
})(window.Tsuzuri = window.Tsuzuri || {});
