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
    { id: 'measure', label: '距離', icon: 'ruler', key: 'm', hint: 'クリックで点を打つか、ドラッグで道をなぞると、道のりと旅の日数を表示します。ダブルクリック／Enter で終わり、Esc で消します' },
  ];

  // 旅の速さ（1日に進む距離と、1時間に進む距離）。道具の設定で変えられる
  const TRAVEL = [
    { id: 'walk', label: '徒歩', kmd: 30, kmh: 4 },
    { id: 'horse', label: '馬', kmd: 60, kmh: 10 },
    { id: 'cart', label: '馬車・隊商', kmd: 25, kmh: 4 },
    { id: 'ship', label: '帆船', kmd: 150, kmh: 7 },
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
    travel: {},
  }, UI.lsGet('tsuzuri.mapPref', null) || {});
  if (!PREF.travel || typeof PREF.travel !== 'object') PREF.travel = {};
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
    const size = h('select', { class: 'input' }, [['s', '小'], ['m', '中'], ['l', '大'], ['w', '世界（横長 2:1）']].map(([v, l]) => h('option', { value: v, selected: v === 'm' }, l)));
    const palette = h('select', { class: 'input' }, Object.keys(E.PALETTES).map((k) => h('option', { value: k, selected: regenerate ? M.map.style.palette === k : k === 'parchment' }, E.PALETTES[k].label)));
    const land = h('input', { type: 'range', min: 10, max: 80, value: 42, class: 'range' });
    const landOut = h('span', { class: 'muted small range-out' }, '42%');
    land.addEventListener('input', () => { landOut.textContent = land.value + '%'; });
    // 世界地図を選んだら、横長の大きさ・地図帳の配色・陸の割合をそれらしく（自分で変えた項目はそのまま）
    let paletteTouched = !!regenerate;
    let sizeTouched = false;
    let nameTouched = !!regenerate;
    palette.addEventListener('change', () => { paletteTouched = true; });
    size.addEventListener('change', () => { sizeTouched = true; });
    name.addEventListener('input', () => { nameTouched = true; });
    preset.addEventListener('change', () => {
      const pr = E.PRESETS[preset.value] || {};
      if (!nameTouched) name.value = pr.world ? '世界地図' : '新しい地図';
      if (pr.world) {
        if (!sizeTouched) size.value = 'w';
        if (!paletteTouched) palette.value = 'atlas';
        land.value = Math.round((pr.land || 0.3) * 100);
      } else {
        if (!sizeTouched && size.value === 'w') size.value = 'm';
        if (!paletteTouched) palette.value = 'parchment';
        land.value = Math.round((pr.land || 0.42) * 100);
      }
      landOut.textContent = land.value + '%';
    });
    const seed = h('input', { class: 'input input-num', type: 'number', value: Math.floor(Math.random() * 99999) });
    const autoB = h('input', { type: 'checkbox', checked: true });
    const autoS = h('input', { type: 'checkbox', checked: true });
    const autoR = h('input', { type: 'checkbox', checked: true });
    const autoT = h('input', { type: 'checkbox', checked: true });
    const autoTLabel = h('span', null, '町と道を置く（仮の地名つき。あとで名前を変えられます）');
    const autoC = h('input', { type: 'checkbox', checked: false });
    let autoCTouched = false;
    autoC.addEventListener('change', () => { autoCTouched = true; });
    const preview = h('canvas', { class: 'gen-preview', width: 300, height: 195, 'aria-label': 'プレビュー' });
    const drawPreview = () => {
      const isWorld = !!(E.PRESETS[preset.value] || {}).world;
      const tmp = E.newMap('p', { preset: preset.value, size: isWorld ? 'w' : 's', seed: +seed.value || 1, land: land.value / 100, palette: palette.value, biome: autoB.checked, stamps: autoS.checked, rivers: autoR.checked, towns: !regenerate && autoT.checked, countries: !regenerate && autoC.checked, compass: false });
      const ph = Math.round(300 * tmp.gh / tmp.gw);
      if (preview.height !== ph) preview.height = ph;
      const n = tmp.gw * tmp.gh;
      const H = E.decodeHeights(tmp.height, n);
      const B = E.decodeBiomes(tmp.biome, n);
      const ctx = preview.getContext('2d');
      const res = preview.width / (tmp.gw * tmp.cell);
      const img = ctx.createImageData(preview.width, preview.height);
      E.renderTerrain(tmp, H, B, img, 0, 0, preview.width, preview.height, res);
      ctx.putImageData(img, 0, 0);
      if (tmp.areas.length) {
        // 国の塗り（陸の形で切り抜く）
        const lay = document.createElement('canvas');
        lay.width = preview.width;
        lay.height = preview.height;
        const lc = lay.getContext('2d');
        lc.setTransform(res, 0, 0, res, 0, 0);
        tmp.areas.forEach((ar) => {
          lc.beginPath();
          ar.points.forEach((pt, i) => (i ? lc.lineTo(pt[0], pt[1]) : lc.moveTo(pt[0], pt[1])));
          lc.closePath();
          lc.fillStyle = hexA(ar.color, 0.32);
          lc.fill();
        });
        const mimg = lc.getImageData(0, 0, lay.width, lay.height);
        for (let y = 0; y < lay.height; y++) {
          for (let x = 0; x < lay.width; x++) {
            if (E.sampleH(H, tmp.gw, tmp.gh, tmp.cell, x / res, y / res) <= 0) mimg.data[(y * lay.width + x) * 4 + 3] = 0;
          }
        }
        lc.putImageData(mimg, 0, 0);
        ctx.drawImage(lay, 0, 0);
      }
      const pk = E.PALETTES[palette.value].assets;
      // 川（見本なので簡単に）
      const plt = E.PALETTES[palette.value];
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      tmp.lines.forEach((ln) => {
        ctx.beginPath();
        ln.points.forEach((pt, i) => (i ? ctx.lineTo(pt[0] * res, pt[1] * res) : ctx.moveTo(pt[0] * res, pt[1] * res)));
        if (ln.kind === 'river' || ln.kind === 'stream') {
          ctx.strokeStyle = `rgb(${plt.coast.join(',')})`;
          ctx.lineWidth = (ln.kind === 'river' ? 2.2 : 1.4) * res * 1.6;
          ctx.stroke();
          ctx.strokeStyle = `rgb(${plt.shallow.join(',')})`;
          ctx.lineWidth = (ln.kind === 'river' ? 2.2 : 1.4) * res;
        } else if (ln.kind === 'border') {
          ctx.strokeStyle = 'rgba(80,40,40,0.8)';
          ctx.lineWidth = 0.8;
          ctx.setLineDash([2.5, 2]);
        } else {
          ctx.strokeStyle = plt.road;
          ctx.lineWidth = Math.max(0.6, (ln.kind === 'highway' ? 2.4 : 1.4) * res);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });
      tmp.stamps.forEach((st) => {
        const sp = AS.sprite(st.a, st.v, pk);
        const k = st.s * res;
        ctx.setTransform(k * (st.f ? -1 : 1), 0, 0, k, st.x * res, st.y * res);
        ctx.drawImage(sp.canvas, sp.x0, sp.y0, sp.w, sp.h);
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    const redraw = UI.debounce(drawPreview, 150);
    [preset, palette, land, seed, autoB, autoS, autoR, autoT, autoC].forEach((el) => { el.addEventListener('input', redraw); el.addEventListener('change', redraw); });
    const syncTownLabel = () => {
      const pr = E.PRESETS[preset.value] || {};
      autoTLabel.textContent = pr.world ? '大陸と海に仮の名前を付ける（あとで変えられます）' : '町と道を置く（仮の地名つき。あとで名前を変えられます）';
      autoT.closest('label').hidden = !!pr.blank || !!regenerate;
      autoC.closest('label').hidden = !!pr.blank || !!regenerate;
      if (!autoCTouched) autoC.checked = !!pr.world; // 世界地図は国に分けて始める
    };
    preset.addEventListener('change', syncTownLabel);
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
          h('label', { class: 'check' }, autoS, '山・丘・森の素材を自動で置く'),
          h('label', { class: 'check' }, autoR, '川を自動で引く（山から海へ）'),
          h('label', { class: 'check' }, autoT, autoTLabel),
          h('label', { class: 'check' }, autoC, '国に分ける（国境・国名・首都。あとで作り直せます）')),
        h('div', { class: 'gen-preview-wrap' }, preview, h('p', { class: 'muted small' }, 'プレビュー'))),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: regenerate ? '作り直す' : '作成', primary: true, onClick: () => {
          if (regenerate) {
            pushUndo();
            const m = M.map;
            const sd = +seed.value || 1;
            const prw = !!(E.PRESETS[preset.value] || {}).world;
            M.H = E.generate(m.gw, m.gh, { preset: preset.value, seed: sd, land: land.value / 100 });
            M.B = autoB.checked ? E.autoBiome(M.H, m.gw, m.gh, sd, prw ? 'world' : null) : new Uint8Array(m.gw * m.gh);
            m.style.ice = prw;
            if (prw && (!m.style.grid || m.style.grid === 'none')) m.style.grid = 'latlon';
            m.seed = sd;
            const natural = new Set(['山・丘', '木・植物']);
            // 自然の素材と、自動で置いた波は、新しい地形に合わせて置き直す
            m.stamps = m.stamps.filter((st) => !(AS.BY_ID[st.a] && (natural.has(AS.BY_ID[st.a].cat) || st.a === 'wave') && !st.name));
            if (autoR.checked) {
              // 名前のない川は新しい地形に合わせて引き直す
              m.lines = m.lines.filter((ln) => !((ln.kind === 'river' || ln.kind === 'stream') && !ln.name)).concat(E.autoRivers(m, M.H, sd));
            }
            if (autoS.checked) m.stamps = m.stamps.concat(E.autoStamps(m, M.H, M.B, sd));
            sortStamps();
            m.style.palette = palette.value;
            M.sel = [];
            renderTerrainFull();
            commit(true);
            renderInspector();
            return;
          }
          const m = E.newMap(name.value.trim() || '地図', { preset: preset.value, size: size.value, seed: +seed.value || 1, land: land.value / 100, palette: palette.value, biome: autoB.checked, stamps: autoS.checked, rivers: autoR.checked, towns: autoT.checked, names: autoT.checked, countries: autoC.checked });
          P().maps.push(m);
          NS.App.touch();
          NS.App.navigate('map', { id: m.id });
        } },
      ],
    });
    // 新しい地図は「世界地図」から（作り直しは今の地図の形に近い「大陸」から）
    preset.value = regenerate ? 'continent' : 'world';
    preset.dispatchEvent(new Event('change'));
    syncTownLabel();
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
    if (id !== 'measure' && id !== 'pan') M.measure = null;
    PREF.tool = id;
    savePref();
    M.toolbar.querySelectorAll('.map-tool').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === id);
      b.setAttribute('aria-pressed', b.dataset.tool === id ? 'true' : 'false');
    });
    M.canvas.dataset.tool = id;
    if (id !== 'select') { M.sel = []; M.vertex = null; }
    if (fromUser && window.innerWidth < 900 && !['select', 'pan', 'erase', 'measure'].includes(id)) setSheet(true);
    renderInspector();
    updateHint();
    draw();
  }

  // 指で操作する端末向けの説明（キー操作の話をしない）
  const TOUCH_HINTS = {
    select: 'タップで選択、ドラッグで移動。選んだものは角の四角で大きさ、上の丸で向きを変えられます。2本指で地図を動かす・拡大',
    pan: '指でなぞって地図を動かします。2本指で拡大・縮小',
    stamp: 'タップした所に素材を置きます。大きさ・向きは下の設定で変えられます',
    path: '指でなぞって線を描くか、タップで点を打って「確定」',
    area: '指で囲むか、タップで頂点を打って「確定」',
    label: 'タップした所に文字を置きます',
    measure: 'タップで点を打つか、指で道をなぞると、道のりと旅の日数を表示します',
  };
  function updateHint() {
    const t = TOOLS.find((x) => x.id === PREF.tool);
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    M.hint.textContent = t ? ((coarse && TOUCH_HINTS[t.id]) || t.hint) : '';
    clear(M.draftBar);
    if (M.regionPick) {
      M.draftBar.hidden = false;
      M.draftBar.append(h('span', { class: 'small measure-sum' }, '詳しい地図にしたい範囲を、ドラッグで囲んでください'),
        btn('取消', { small: true, ghost: true, onClick: () => { M.regionPick = false; updateHint(); draw(); } }));
      return;
    }
    M.draftBar.hidden = !M.draft && !(M.measure && M.measure.pts.length);
    if (!M.draft && M.measure && M.measure.pts.length) {
      const ms = M.measure;
      const info = ms.pts.length >= 2 ? routeInfo(ms.pts) : null;
      const sum = !info ? '次の点をクリック' : info.landKm < 0.5 ? `${fmtKm(info.km)}・帆船 ${fmtTrip(info.km, TRAVEL[3])}`
        : `${fmtKm(info.km)}・${TRAVEL.slice(0, 2).map((t) => t.label + ' ' + fmtTrip(info.eff, t)).join('・')}`;
      M.draftBar.append(...[
        h('span', { class: 'small measure-sum' }, sum),
        ms.done ? null : btn('終わり', { small: true, primary: true, icon: 'check', onClick: () => { ms.done = true; updateHint(); renderInspector(); draw(); } }),
        ms.pts.length >= 2 && !layerLocked('paths') ? btn('道にする', { small: true, title: 'この経路を「道」として地図に残す', onClick: measureToPath }) : null,
        btn('消す', { small: true, ghost: true, onClick: () => { M.measure = null; updateHint(); renderInspector(); draw(); } }),
      ].filter(Boolean));
      return;
    }
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
    draw(true);
  }

  function centerOn(x, y, zoom) {
    if (zoom) M.zoom = Math.max(M.zoom || 1, zoom);
    M.ox = M.cw / 2 - x * M.zoom;
    M.oy = M.ch / 2 - y * M.zoom;
    M.userMoved = true;
    draw(true);
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
    navigating();
    draw(true);
  }

  function toWorld(e) {
    const r = M.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { x: (sx - M.ox) / M.zoom, y: (sy - M.oy) / M.zoom, sx, sy };
  }

  // ───── 地形の描画（重いので少しずつ） ─────
  function renderTerrainFull() {
    invalidateDetail();
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
    invalidateDetail();
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
    c.addEventListener('pointerleave', () => { M.hover = null; draw(true); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', (e) => {
      if (M.draft) { e.preventDefault(); finishDraft(); return; }
      if (PREF.tool === 'measure' && M.measure && !M.measure.done) {
        e.preventDefault();
        M.measure.done = true;
        updateHint();
        renderInspector();
        draw();
      }
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const w = toWorld(e);
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), w.sx, w.sy);
      } else {
        M.ox -= e.deltaX;
        M.userMoved = true;
        navigating();
        draw(true);
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
    if (M.regionPick && e.key === 'Escape') { M.regionPick = false; M.drag = null; updateHint(); draw(); return; }
    if (M.measure && PREF.tool === 'measure') {
      if (e.key === 'Escape') { M.measure = null; updateHint(); renderInspector(); draw(); return; }
      if (e.key === 'Enter') { M.measure.done = true; updateHint(); renderInspector(); draw(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        M.measure.pts.pop();
        M.measure.done = false;
        if (!M.measure.pts.length) M.measure = null;
        updateHint(); renderInspector(); draw();
        return;
      }
    }
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
    if (M.regionPick) { M.drag = { kind: 'region', start: w, end: w }; return; }
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
    if (tool === 'measure') {
      M.drag = { kind: 'measure', start: w, active: false, pts: [[round1(w.x), round1(w.y)]] };
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
      navigating();
      draw(true);
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
      if (M.draft || (PREF.tool === 'measure' && M.measure && !M.measure.done) || ['stamp', 'scatter', 'erase', 'land', 'water', 'relief', 'ground'].includes(PREF.tool)) draw(true);
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
      navigating();
      draw(true);
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
        draw(true);
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
    } else if (d.kind === 'region') {
      d.end = w;
      draw();
    } else if (d.kind === 'measure') {
      if (!d.active && Math.hypot(w.sx - d.start.sx, w.sy - d.start.sy) > 6) d.active = true;
      if (d.active) {
        const last = d.pts[d.pts.length - 1];
        if (Math.hypot(w.x - last[0], w.y - last[1]) * M.zoom > 4) d.pts.push([round1(w.x), round1(w.y)]);
        draw();
      }
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
    } else if (d.kind === 'region') {
      const rect = { x0: Math.min(d.start.x, d.end.x), y0: Math.min(d.start.y, d.end.y), x1: Math.max(d.start.x, d.end.x), y1: Math.max(d.start.y, d.end.y) };
      const cells = Math.min(rect.x1 - rect.x0, rect.y1 - rect.y0) / M.map.cell;
      if (cells < 8) { toast('もう少し大きく囲んでください'); draw(); return; }
      M.regionPick = false;
      updateHint();
      draw();
      regionDialog(rect);
    } else if (d.kind === 'measure') {
      if (d.active && d.pts.length >= 2) {
        // なぞった道のり：続きから足す（終わっていれば新しく測る）
        const pts = simplify(d.pts, 0.8 / Math.max(0.3, M.zoom) + 0.3);
        if (!M.measure || M.measure.done) M.measure = { pts, done: true };
        else { M.measure.pts = M.measure.pts.concat(pts); M.measure.done = true; }
      } else {
        const pt = d.pts[0];
        if (!M.measure || M.measure.done) M.measure = { pts: [pt], done: false };
        else {
          const last = M.measure.pts[M.measure.pts.length - 1];
          if (Math.hypot(last[0] - pt[0], last[1] - pt[1]) * M.zoom > 3) M.measure.pts.push(pt);
        }
      }
      updateHint();
      renderInspector();
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

  // ───── 距離と旅の日数 ─────
  /** 2点間の距離（km）。世界地図は球面上の最短距離（大圏距離）で測る */
  function kmBetween(a, b) {
    const m = M.map;
    const kmPerCell = m.style.kmPerCell || 4;
    if (m.style.world || m.style.grid === 'latlon') {
      const R = (kmPerCell * m.gw) / (2 * Math.PI); // 地図の横幅＝赤道一周
      const lon1 = (a[0] / M.W) * 2 * Math.PI;
      const lon2 = (b[0] / M.W) * 2 * Math.PI;
      const lat1 = (0.5 - a[1] / M.Hpx) * Math.PI;
      const lat2 = (0.5 - b[1] / M.Hpx) * Math.PI;
      const s1 = Math.sin((lat2 - lat1) / 2);
      const s2 = Math.sin((lon2 - lon1) / 2);
      const q = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
    }
    return Math.hypot(b[0] - a[0], b[1] - a[1]) * kmPerCell / m.cell;
  }
  function routeKm(pts) {
    let km = 0;
    for (let i = 1; i < pts.length; i++) km += kmBetween(pts[i - 1], pts[i]);
    return km;
  }
  function speedOf(t) {
    const v = PREF.travel[t.id] || {};
    return { kmd: v.kmd > 0 ? v.kmd : t.kmd, kmh: v.kmh > 0 ? v.kmh : t.kmh };
  }
  function fmtKm(km) {
    if (km < 1) return Math.round(km * 1000) + ' m';
    if (km < 10) return (Math.round(km * 10) / 10) + ' km';
    return Math.round(km).toLocaleString('ja-JP') + ' km';
  }
  /** 「約3時間」「約2.5日」「約2か月」 */
  function fmtTrip(km, t) {
    const sp = speedOf(t);
    const days = km / sp.kmd;
    if (days < 1) {
      const hr = km / sp.kmh;
      if (hr < 1) return '約' + Math.max(1, Math.round(hr * 60)) + '分';
      return '約' + (hr < 10 ? Math.round(hr * 2) / 2 : Math.round(hr)) + '時間';
    }
    if (days < 10) return '約' + (Math.round(days * 2) / 2) + '日';
    if (days < 60) return '約' + Math.round(days) + '日';
    return '約' + (Math.round(days / 30 * 2) / 2) + 'か月';
  }
  // 地形ごとの歩きにくさ（道の上を1とした倍率）
  const TERRAIN = {
    road: { label: '道', color: '#b0793b' },
    plain: { label: '平地', color: '#a9c27a' },
    forest: { label: '森', color: '#3f7a46' },
    rough: { label: '湿地・砂漠・雪など', color: '#c9b27e' },
    hill: { label: '丘', color: '#9b8a62' },
    mtn: { label: '山', color: '#6d5a4a' },
    sea: { label: '海・湖', color: '#5d8fb8' },
  };
  const BIOME_COST = [1.2, 1.5, 1.4, 2.0, 1.6, 2.0, 1.2, 1.5, 1.1, 1.3];
  const ROAD_KINDS = ['highway', 'road', 'trail', 'rail'];
  function roadHash() {
    const lines = M.map.lines;
    const key = lines.length + ':' + lines.reduce((a, l) => a + (ROAD_KINDS.includes(l.kind) ? l.points.length * 7 + l.points[0][0] : 0), 0);
    if (M.roadHashKey === key && M.roadHash) return M.roadHash;
    const hs = new Map();
    const cs = 8;
    lines.forEach((l) => {
      if (!ROAD_KINDS.includes(l.kind) || l.points.length < 2) return;
      sampleSpline(l.points, false, 3).forEach((pt) => {
        const k = Math.floor(pt[0] / cs) + ',' + Math.floor(pt[1] / cs);
        if (!hs.has(k)) hs.set(k, []);
        hs.get(k).push(pt);
      });
    });
    M.roadHash = { hs, cs };
    M.roadHashKey = key;
    return M.roadHash;
  }
  function nearRoad(rh, x, y, r) {
    const cx = Math.floor(x / rh.cs);
    const cy = Math.floor(y / rh.cs);
    const n = Math.ceil(r / rh.cs);
    for (let j = cy - n; j <= cy + n; j++) {
      for (let i = cx - n; i <= cx + n; i++) {
        const list = rh.hs.get(i + ',' + j);
        if (list && list.some((pt) => Math.hypot(pt[0] - x, pt[1] - y) <= r)) return true;
      }
    }
    return false;
  }
  /** 経路が通る地形を調べ、地形を考えた「実際に歩く距離（倍率をかけた距離）」を出す */
  function routeInfo(pts, allRoad) {
    const m = M.map;
    const parts = { road: 0, plain: 0, forest: 0, rough: 0, hill: 0, mtn: 0, sea: 0 };
    let eff = 0;
    const rh = allRoad ? null : roadHash();
    const rr = Math.max(4, m.cell * 0.9);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const segKm = kmBetween(a, b);
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (m.cell * 0.5)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        const km = segKm / n;
        const hh = E.sampleH(M.H, m.gw, m.gh, m.cell, x, y);
        if (hh <= 0) { parts.sea += km; continue; }
        const gx = Math.max(0, Math.min(m.gw - 1, Math.floor(x / m.cell)));
        const gy = Math.max(0, Math.min(m.gh - 1, Math.floor(y / m.cell)));
        const bio = M.B[gy * m.gw + gx] || 0;
        const relief = hh > 0.42 ? 'mtn' : hh > 0.3 ? 'hill' : '';
        const onRoad = allRoad || nearRoad(rh, x, y, rr);
        let f;
        if (onRoad) {
          f = relief === 'mtn' ? 1.5 : relief === 'hill' ? 1.15 : 1;
          parts.road += km;
        } else {
          f = (BIOME_COST[bio] || 1.2) * (relief === 'mtn' ? 2.2 : relief === 'hill' ? 1.3 : 1);
          const cat = relief || (bio === 1 || bio === 5 ? 'forest' : [2, 3, 4, 7, 9].includes(bio) ? 'rough' : 'plain');
          parts[cat] += km;
        }
        eff += km * Math.min(4, f);
      }
    }
    const total = Object.keys(parts).reduce((a, k) => a + parts[k], 0);
    return { km: total, parts, eff, landKm: total - parts.sea, seaKm: parts.sea };
  }
  /** 通る地形の割合の帯 */
  function terrainBar(info) {
    const keys = Object.keys(TERRAIN).filter((k) => info.parts[k] > info.km * 0.005);
    const bar = h('div', { class: 'terrain-bar', role: 'img', 'aria-label': '通る地形：' + keys.map((k) => TERRAIN[k].label + Math.round(info.parts[k] / info.km * 100) + '%').join('、') },
      keys.map((k) => h('span', { style: { width: (info.parts[k] / info.km * 100) + '%', background: TERRAIN[k].color }, title: TERRAIN[k].label })));
    const legend = h('div', { class: 'terrain-legend small' }, keys.map((k) => h('span', null,
      h('i', { style: { background: TERRAIN[k].color } }), `${TERRAIN[k].label} ${Math.round(info.parts[k] / info.km * 100)}%`)));
    return h('div', { class: 'terrain-box' }, bar, legend);
  }
  /** 旅の日数の表（道具の設定と、選んだ道の詳細に出す） */
  function tripTable(info, only) {
    const list = (only ? TRAVEL.filter((t) => only.includes(t.id)) : TRAVEL);
    const rows = [];
    list.forEach((t) => {
      const sp = speedOf(t);
      if (t.id === 'ship') {
        if (info.seaKm < 0.5 && info.landKm > 0) return;
        rows.push(h('tr', null, h('th', null, t.label), h('td', null, h('b', null, fmtTrip(info.seaKm || info.km, t)), info.landKm > 0.5 ? h('div', { class: 'muted' }, `海・湖の区間 ${fmtKm(info.seaKm)}`) : null)));
        return;
      }
      if (info.landKm < 0.5) return;
      const flat = fmtTrip(info.landKm, t);
      const real = fmtTrip(info.eff, t);
      rows.push(h('tr', null, h('th', null, t.label), h('td', null, h('b', null, real), real !== flat ? h('div', { class: 'muted' }, `平らな道なら${flat}`) : null)));
    });
    const box = h('div', { class: 'trip-box' }, h('table', { class: 'trip-table small' }, h('tbody', null, rows)));
    if (info.seaKm >= 0.5 && info.landKm >= 0.5 && !(only && !only.includes('ship'))) box.appendChild(h('p', { class: 'small muted' }, '陸の旅の日数には、海・湖の上は含めていません。'));
    else if (info.seaKm >= 0.5 && info.landKm >= 0.5) box.appendChild(h('p', { class: 'small muted' }, `うち海・湖の上 ${fmtKm(info.seaKm)}（日数には含めていません）`));
    box.appendChild(h('p', { class: 'small muted' }, '1日に進む距離：' + list.map((t) => t.label + speedOf(t).kmd + 'km').join('・')));
    return box;
  }
  /** 面積（km²）。陸だけを塗る領域は陸の部分だけ。世界地図は緯度で面積が縮むのも考える */
  function areaKm2(ar) {
    const m = M.map;
    if (!ar.points || ar.points.length < 3) return 0;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    ar.points.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const gx0 = Math.max(0, Math.floor(x0 / m.cell));
    const gy0 = Math.max(0, Math.floor(y0 / m.cell));
    const gx1 = Math.min(m.gw - 1, Math.ceil(x1 / m.cell));
    const gy1 = Math.min(m.gh - 1, Math.ceil(y1 / m.cell));
    const span = (gx1 - gx0 + 1) * (gy1 - gy0 + 1);
    const step = span > 40000 ? 3 : span > 10000 ? 2 : 1;
    const kc = m.style.kmPerCell || 4;
    const world = m.style.world || m.style.grid === 'latlon';
    let sum = 0;
    for (let gy = gy0; gy <= gy1; gy += step) {
      const wy = (gy + 0.5) * m.cell;
      const f = world ? Math.cos((0.5 - wy / M.Hpx) * Math.PI) : 1;
      for (let gx = gx0; gx <= gx1; gx += step) {
        const wx = (gx + 0.5) * m.cell;
        if (ar.land && M.H[gy * m.gw + gx] <= 0) continue;
        if (inPoly(wx, wy, ar.points)) sum += kc * kc * f * step * step;
      }
    }
    return sum;
  }
  function fmtArea(km2) {
    if (km2 >= 1e4) return (km2 >= 1e6 ? Math.round(km2 / 1e4) : Math.round(km2 / 1e3) / 10).toLocaleString('ja-JP') + '万 km²';
    return Math.round(km2).toLocaleString('ja-JP') + ' km²';
  }

  function measureToPath() {
    if (!M.measure || M.measure.pts.length < 2) return;
    if (layerLocked('paths')) { toast('道・川のレイヤーが隠れているか、ロックされています'); return; }
    pushUndo();
    const ln = { id: UI.uid('ln'), kind: 'road', points: M.measure.pts.map((p) => p.slice()), name: '', w: 1, wobble: PATH_KINDS.road.wobble };
    M.map.lines.push(ln);
    M.measure = null;
    commit();
    setTool('select');
    M.sel = [{ k: 'path', id: ln.id }];
    renderInspector();
    draw();
    toast('道にしました。「選択」で種類（街道・小道・航路など）を変えられます');
  }

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
      // 複製は別の物として扱う（自動で作った国の一部でなくなる）
      delete o.gen;
      delete o.group;
      delete o.nameLabel;
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
      const onLand = E.sampleH(M.H, m.gw, m.gh, m.cell, x, y) > 0;
      for (let i = m.areas.length - 1; i >= 0; i--) {
        const ar = m.areas[i];
        if (ar.land && !onLand) continue; // 陸だけを塗る領域は、海をクリックしても選ばない
        if (inPoly(x, y, ar.points)) return { k: 'area', id: ar.id };
      }
    }
    return null;
  }

  // ───── 描画 ─────
  function palKey() { return (E.PALETTES[M.map.style.palette] || E.PALETTES.parchment).assets; }
  function pal() { return E.PALETTES[M.map.style.palette] || E.PALETTES.parchment; }

  /**
   * 再描画を予約する。viewOnly＝見え方（拡大・移動・カーソル）だけが変わったときは、
   * 地図全体を1枚に描いておいた「場面の画像」を使って速く描く。中身が変わったら描き直す。
   */
  function draw(viewOnly) {
    if (!M || !M.ctx) return;
    if (!viewOnly) M.sceneDirty = true;
    if (M.raf) return;
    M.raf = requestAnimationFrame(frame);
  }

  /** 拡大・移動の操作中（止まってから少しして、くっきり描き直す） */
  function navigating() {
    M.navigating = true;
    clearTimeout(M.navTimer);
    M.navTimer = setTimeout(() => { if (!M) return; M.navigating = false; draw(true); }, 170);
  }

  /** 場面の画像の最大の細かさ（大きすぎる画像は端末の負担になる） */
  function sceneCap() { return Math.min(3, 3200 / Math.max(M.W, M.Hpx)); }

  function buildScene(cs) {
    const w = Math.max(1, Math.ceil(M.W * cs));
    const hh = Math.max(1, Math.ceil(M.Hpx * cs));
    if (!M.scene) M.scene = { canvas: document.createElement('canvas'), scale: 0 };
    const c = M.scene.canvas;
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, hh);
    renderMap(g, { scale: cs, tx: 0, ty: 0, w, h: hh, editing: true, scene: true });
    M.scene.scale = cs;
    M.sceneDirty = false;
  }

  function scheduleSceneBuild() {
    if (M.sceneTimer) return;
    M.sceneTimer = setTimeout(() => {
      if (!M) return;
      M.sceneTimer = 0;
      if (M.navigating || (M.drag && M.drag.kind !== 'pan') || M.job) { scheduleSceneBuild(); return; }
      const cs = Math.min(M.dpr * M.zoom, sceneCap());
      if (M.sceneDirty || !M.scene || Math.abs(M.scene.scale - cs) > 1e-6) { buildScene(cs); draw(true); }
    }, 260);
  }

  /** 見えている範囲（少し広め）の地形を細かい解像度で描く。重いので少しずつ */
  function scheduleDetail(x0, y0, x1, y1, res) {
    clearTimeout(M.detailTimer);
    M.detailTimer = setTimeout(() => {
      if (!M || M.navigating) return;
      const padX = (x1 - x0) * 0.25;
      const padY = (y1 - y0) * 0.25;
      const rx = Math.max(0, Math.floor(x0 - padX));
      const ry = Math.max(0, Math.floor(y0 - padY));
      const rw = Math.min(M.W, Math.ceil(x1 + padX)) - rx;
      const rh = Math.min(M.Hpx, Math.ceil(y1 + padY)) - ry;
      if (rw <= 0 || rh <= 0) return;
      const pw = Math.ceil(rw * res);
      const ph = Math.ceil(rh * res);
      if (pw * ph > 6e6) return; // 大きすぎる場合はあきらめる
      const job = { cancel: false };
      if (M.detailJob) M.detailJob.cancel = true;
      M.detailJob = job;
      const canvas = document.createElement('canvas');
      canvas.width = pw;
      canvas.height = ph;
      const g = canvas.getContext('2d');
      const img = g.createImageData(pw, ph);
      const gen = M.terrainGen;
      let y = 0;
      const step = () => {
        if (!M || job.cancel || gen !== M.terrainGen) return;
        const t0 = performance.now();
        while (y < ph && performance.now() - t0 < 12) {
          const y2 = Math.min(ph, y + 12);
          E.renderTerrain(M.map, M.H, M.B, img, 0, y, pw, y2, res, null, rx, ry);
          y = y2;
        }
        if (y < ph) { requestAnimationFrame(step); return; }
        g.putImageData(img, 0, 0);
        M.detail = { canvas, x: rx, y: ry, w: pw / res, h: ph / res, res, ready: true };
        M.detailJob = null;
        draw(true);
      };
      requestAnimationFrame(step);
    }, 160);
  }
  /** 地形が変わったら、細かい地形を作り直す */
  function invalidateDetail() {
    M.terrainGen = (M.terrainGen || 0) + 1;
    M.detail = null;
    if (M.detailJob) M.detailJob.cancel = true;
  }

  function frame() {
    if (!M || !M.ctx) return;
    M.raf = 0;
    const ctx = M.ctx;
    const S = M.dpr * M.zoom;
    const cap = sceneCap();
    const view = { scale: S, tx: M.dpr * M.ox, ty: M.dpr * M.oy, w: M.canvas.width, h: M.canvas.height, editing: true };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, M.canvas.width, M.canvas.height);
    // ブラシや移動で中身が変わり続けている間は、見えている所だけを直接描く（場面の画像は後で作る）
    const editingLive = !!(M.drag && ['stroke', 'move', 'scale', 'rotate', 'freehand'].includes(M.drag.kind)) || !!M.job;
    // 全体が場面の画像に収まる倍率なら、ちょうどの細かさで作り直して使う
    if (!editingLive && !M.navigating && S <= cap + 1e-6 && (M.sceneDirty || !M.scene || Math.abs(M.scene.scale - S) > 1e-6)) buildScene(S);
    const useScene = M.scene && !M.sceneDirty && (M.navigating || M.scene.scale >= S - 1e-6);
    if (useScene) {
      // 地図の下の影と、場面の画像
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 18 * M.dpr;
      ctx.fillStyle = '#fff';
      ctx.fillRect(view.tx, view.ty, M.W * S, M.Hpx * S);
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = M.navigating ? 'low' : 'high';
      ctx.drawImage(M.scene.canvas, view.tx, view.ty, M.W * S, M.Hpx * S);
    } else {
      // 地形の基本の画像より細かく拡大しているとき：見えている範囲の細かい地形を使う（なければ作る）
      let detail = null;
      if (S > M.res * 1.4 && !editingLive) {
        const vx0 = -view.tx / S;
        const vy0 = -view.ty / S;
        const vx1 = vx0 + view.w / S;
        const vy1 = vy0 + view.h / S;
        const dt = M.detail;
        if (dt && dt.ready && dt.x <= vx0 && dt.y <= vy0 && dt.x + dt.w >= vx1 && dt.y + dt.h >= vy1 && dt.res >= Math.min(S, 3) * 0.7) detail = dt;
        else if (!M.navigating) scheduleDetail(vx0, vy0, vx1, vy1, Math.min(S, 3));
        if (!detail && dt && dt.ready) detail = dt; // 一部でも重なれば、その分は細かく見せる
      }
      renderMap(ctx, view, { detail });
      if (S > cap || editingLive) scheduleSceneBuild();
    }
    ctx.setTransform(S, 0, 0, S, view.tx, view.ty);
    drawOverlay(ctx);
  }

  let paperCanvas = null;
  /** 紙の質感：向きのない細かな粒と、いろいろな向きの短い繊維、ところどころの淡いしみ */
  function paperTexture() {
    if (paperCanvas) return paperCanvas;
    const N = 384;
    const c = document.createElement('canvas');
    c.width = N;
    c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    // 継ぎ目が見えないよう、端でつながるノイズ（周期 N）
    const tile = (x, y, f) => {
      const a = E.vnoise(x * f, y * f);
      const b = E.vnoise((x - N) * f, y * f);
      const c2 = E.vnoise(x * f, (y - N) * f);
      const d = E.vnoise((x - N) * f, (y - N) * f);
      const u = x / N;
      const v = y / N;
      return (a * (1 - u) + b * u) * (1 - v) + (c2 * (1 - u) + d * u) * v;
    };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const n = tile(x, y, 0.035) * 0.55 + tile(x + 31, y + 17, 0.12) * 0.25 + E.hash2(x, y, 5) * 0.2;
        const v = 255 - Math.max(0, n - 0.38) * 70;
        const o = (y * N + x) * 4;
        img.data[o] = v;
        img.data[o + 1] = v - 3;
        img.data[o + 2] = v - 10;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 繊維
    const rnd = AS.mulberry32(77);
    ctx.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = rnd() * N;
      const y = rnd() * N;
      const a = rnd() * Math.PI;
      const L = 3 + rnd() * 9;
      ctx.strokeStyle = `rgba(120,96,70,${0.05 + rnd() * 0.07})`;
      ctx.lineWidth = 0.6 + rnd() * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (rnd() - 0.5) * 2, y + Math.sin(a) * L * 0.5 + (rnd() - 0.5) * 2, x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.stroke();
    }
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
    if (!layerHidden('terrain')) {
      ctx.drawImage(opts.base || M.base, 0, 0, M.W, M.Hpx);
      // 拡大しているときは、見えている所だけ細かく描いた地形を重ねる
      const dt = opts.detail;
      if (dt && dt.ready) ctx.drawImage(dt.canvas, dt.x, dt.y, dt.w, dt.h);
    }
    else { ctx.fillStyle = '#f4efe2'; ctx.fillRect(0, 0, M.W, M.Hpx); }

    if (!layerHidden('areas')) {
      const landAreas = m.areas.filter((ar) => ar.land);
      if (landAreas.length) drawLandAreas(ctx, landAreas, layerHidden('terrain') ? null : (opts.mask || M.mask));
      m.areas.forEach((ar) => { if (!ar.land) drawArea(ctx, ar); });
    }
    // 道の太さ：縮小して見ているときは、細くなりすぎないよう少し太く（書き出しは少しだけ）
    const cssScale = view.editing ? S / (M.dpr || 1) : 1;
    pathBoost = view.editing ? (cssScale < 1 ? Math.min(1.8, Math.pow(1 / cssScale, 0.6)) : 1) : 1.15;
    const order = ['river', 'stream', 'route', 'trail', 'road', 'highway', 'rail', 'wall', 'border'];
    const sorted = layerHidden('paths') ? [] : m.lines.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    if (sorted.length) {
      const rivers = sorted.filter((ln) => ln.kind === 'river' || ln.kind === 'stream');
      // 川は陸の上だけに描き、海や湖に入ったら水面に溶け込ませる
      if (rivers.length) drawRivers(ctx, rivers, pl, layerHidden('terrain') ? null : (opts.mask || M.mask));
      // 航路・国境・城壁は素材の下。道は山や森の上に描く（森や山の陰に隠れないように）
      sorted.forEach((ln) => { if (ln.kind !== 'river' && ln.kind !== 'stream' && !ROAD_KINDS.includes(ln.kind)) drawPath(ctx, ln, pl); });
    }
    // 素材は2回に分けて描く：山・木 → 道 → 町・建物など（道が町の絵の上を横切らないように）
    const NATURAL = { '山・丘': 1, '木・植物': 1 };
    const isNatural = (s) => { const a = AS.BY_ID[s.a]; return !!(a && NATURAL[a.cat]); };
    const drawRoads = () => { sorted.forEach((ln) => { if (ROAD_KINDS.includes(ln.kind)) drawPath(ctx, ln, pl); }); };
    if (layerHidden('stamps')) drawRoads();
    else for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) drawRoads();
      const pk = palKey();
      for (const s of m.stamps) {
        if (isNatural(s) === (pass === 1)) continue;
        if (s.x < vis.x0 || s.x > vis.x1 || s.y < vis.y0 || s.y > vis.y1 + 40) continue;
        const sp = AS.sprite(s.a, s.v, pk, AS.lineScaleFor(s.s));
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
    if (st.grid && st.grid !== 'none' && !layerHidden('deco')) drawGrid(ctx, st, pl);
    if (!layerHidden('labels')) {
      const shown = new Set();
      m.areas.forEach((ar) => {
        if (!ar.name || layerHidden('areas')) return;
        if (ar.nameLabel != null && ar.nameLabel !== '') return; // 国名は「文字」として置いてある
        if (ar.group) { if (shown.has(ar.group)) return; shown.add(ar.group); }
        const c = centroid(ar.points);
        drawText(ctx, ar.name, c[0], c[1], { size: 16, weight: 700, color: hexA(ar.color, 0.95), spacing: 0.4, halo: pl.halo, font: 'shippori' });
      });
      if (!layerHidden('stamps')) {
        // 地名どうし・文字・町の絵と重ならない向きを選んでから描く
        const plan = st.declutter === false ? null : planStampLabels(ctx, layerHidden('areas'));
        m.stamps.forEach((s) => { const n = stampName(s); if (n) drawStampLabel(ctx, s, n, pl, plan && plan.get(s.id)); });
      }
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
        const pat = ctx.createPattern(paperTexture(), 'repeat');
        // 紙の目は地図より細かく（拡大しても粗くならないよう、1単位に約1.7画素）
        if (pat && pat.setTransform && typeof DOMMatrix === 'function') pat.setTransform(new DOMMatrix().scale(0.6));
        ctx.fillStyle = pat;
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
      if (st.legend) drawLegend(ctx, pl);
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
  let pathBoost = 1;
  let areaLayer = null;
  /** 陸だけを塗る領域（国など）：塗りと、内側の縁取りを、陸の形で切り抜いて描く */
  function drawLandAreas(ctx, areas, mask) {
    const paint = (c) => {
      areas.forEach((ar) => {
        if (ar.points.length < 3) return;
        const pts = sampleSpline(ar.points, true, 3);
        c.save();
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
        c.closePath();
        const op = ar.opacity != null ? ar.opacity : 0.22;
        c.fillStyle = hexA(ar.color, op);
        c.fill();
        // 国の形がわかるよう、境の内側をはっきりした色の帯で縁取る（地図帳の国の塗り分けのように）
        c.clip();
        c.lineJoin = 'round';
        const bw = Math.max(4, M.map.cell * 2.2);
        c.strokeStyle = hexA(ar.color, Math.min(0.6, op * 1.5));
        c.lineWidth = bw * 2;
        c.stroke();
        c.strokeStyle = hexA(ar.color, Math.min(0.9, op * 2.4));
        c.lineWidth = bw * 0.7;
        c.stroke();
        c.restore();
      });
    };
    if (!mask) { paint(ctx); return; }
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    if (!areaLayer) areaLayer = document.createElement('canvas');
    if (areaLayer.width !== cw || areaLayer.height !== ch) { areaLayer.width = cw; areaLayer.height = ch; }
    const o = areaLayer.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, cw, ch);
    o.setTransform(ctx.getTransform());
    paint(o);
    o.globalCompositeOperation = 'destination-in';
    o.imageSmoothingEnabled = true;
    o.drawImage(mask, 0, 0, M.W, M.Hpx);
    o.globalCompositeOperation = 'source-over';
    o.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(areaLayer, 0, 0);
    ctx.restore();
  }
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

  /** 道の下に敷く、地面から浮かせる淡い縁取り */
  function roadCasing(ctx, pts, pl, width, dash, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha != null ? alpha : (pl === E.PALETTES.night ? 0.75 : 0.82);
    ctx.strokeStyle = pl.halo;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    strokePoly(ctx, pts);
    ctx.restore();
  }

  /** 2本線の道の、線の間の色（紙の色） */
  function roadCore(pl) { return pl === E.PALETTES.night ? 'rgba(40,34,28,0.95)' : pl === E.PALETTES.atlas ? '#fffdf7' : 'rgba(251,245,228,0.98)'; }

  function drawPath(ctx, ln, pl) {
    if (ln.points.length < 2) return;
    const roadLike = ROAD_KINDS.includes(ln.kind) || ln.kind === 'route';
    const w = (ln.w || 1) * (roadLike ? pathBoost : 1);
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
        // 街道：古地図の「2本の細い線」。うすい縁取りで森や山の上でも読め、線の間は紙の色
        roadCasing(ctx, pts, pl, 5.4 * w, null, 0.6);
        ctx.strokeStyle = pl.road;
        ctx.lineWidth = 3.1 * w;
        strokePoly(ctx, pts);
        ctx.strokeStyle = roadCore(pl);
        ctx.lineWidth = 1.9 * w;
        strokePoly(ctx, pts);
        break;
      case 'road':
        // 道：細い線を長めの破線に（地図の上で「道」と分かる、昔ながらの描き方）
        roadCasing(ctx, pts, pl, 3.8 * w, null, 0.55);
        ctx.strokeStyle = pl.road;
        ctx.lineWidth = 1.35 * w;
        ctx.lineCap = 'butt';
        ctx.setLineDash([6.5 * w, 2.4 * w]);
        strokePoly(ctx, pts);
        break;
      case 'trail':
        // 小道：まるい点を並べた点線
        roadCasing(ctx, pts, pl, 3.2 * w, null, 0.5);
        ctx.strokeStyle = pl.road;
        ctx.lineWidth = 1.45 * w;
        ctx.setLineDash([0.01, 2.9 * w]);
        strokePoly(ctx, pts);
        break;
      case 'rail':
        // 鉄道：細い黒の線に、白黒交互の目盛り
        roadCasing(ctx, pts, pl, 4.6 * w, null, 0.6);
        ctx.lineCap = 'butt';
        ctx.strokeStyle = inkOf(pl);
        ctx.lineWidth = 2.4 * w;
        strokePoly(ctx, pts);
        ctx.strokeStyle = roadCore(pl);
        ctx.lineWidth = 1.3 * w;
        ctx.setLineDash([4.5 * w, 4.5 * w]);
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
        ctx.strokeStyle = hexA(inkOf(pl), 0.6);
        ctx.lineWidth = 1.2 * w;
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

  /** 経緯線（世界地図）：緯線・経線を30°ごと、赤道は太く、回帰線と極圏は点線。端に度数 */
  function drawLatLon(ctx, st, pl) {
    const W = M.W;
    const Hh = M.Hpx;
    const yOf = (lat) => (90 - lat) / 180 * Hh;
    const xOf = (lon) => (lon + 180) / 360 * W;
    const ink = st.palette === 'night' ? 'rgba(255,255,255,0.75)' : 'rgba(40,32,24,0.9)';
    ctx.save();
    ctx.globalAlpha = st.gridOpacity != null ? st.gridOpacity : 0.35;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let lat = -60; lat <= 60; lat += 30) { if (lat) { ctx.moveTo(0, yOf(lat)); ctx.lineTo(W, yOf(lat)); } }
    for (let lon = -150; lon <= 150; lon += 30) { ctx.moveTo(xOf(lon), 0); ctx.lineTo(xOf(lon), Hh); }
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, yOf(0)); ctx.lineTo(W, yOf(0));
    ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    [23.44, -23.44, 66.56, -66.56].forEach((lat) => { ctx.moveTo(0, yOf(lat)); ctx.lineTo(W, yOf(lat)); });
    ctx.stroke();
    ctx.restore();
    const lab = (t, x, y, align) => drawText(ctx, t, 0, 0, { size: Math.max(8, W / 190), weight: 500, color: ink, halo: pl.halo, align, x, y });
    [60, 30, 0, -30, -60].forEach((lat) => lab(lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`, 6, yOf(lat) - 6, 'left'));
    for (let lon = -150; lon <= 150; lon += 30) {
      lab(lon === 0 ? '0°' : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`, xOf(lon) + 3, Hh - 40, 'left');
    }
  }

  function drawGrid(ctx, st, pl) {
    if (st.grid === 'latlon') { drawLatLon(ctx, st, pl); return; }
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

  const MAJOR_STAMPS = ['sym-capital', 'castle', 'city', 'jcastle'];
  /** 素材の名前の大きさと太さ */
  function stampLabelFont(s, a) {
    const big = a.cat === '町・建物' || a.cat === '和風';
    // 地図の広さに合わせた大きさ（全体表示でも読めるように）×「地名の大きさ」の設定
    const unit = Math.max(9, Math.min(18, M.W / 92)) * (M.map.style.labelScale || 1);
    const major = MAJOR_STAMPS.includes(s.a);
    return { size: s.ls || unit * (major ? 1.25 : a.cat === '地図記号' ? 0.95 : big ? 1.05 : 0.9), weight: major ? 700 : 600, major };
  }
  /** 名前を pos（below / right / left / above）に置いたときの、文字の中心 */
  function stampLabelAnchor(s, a, sp, size, pos, w) {
    const sideY = s.y + (a.anchor === 'center' ? 0 : -sp.h * s.s * 0.3);
    if (pos === 'right') { const x = s.x + (sp.x0 + sp.w) * s.s + 3; return { x: x + w / 2, y: sideY, left: x }; }
    if (pos === 'left') { const x = s.x + sp.x0 * s.s - 3; return { x: x - w / 2, y: sideY, left: x - w }; }
    if (pos === 'above') return { x: s.x, y: s.y + sp.y0 * s.s - size * 0.7 };
    return { x: s.x, y: s.y + (sp.y0 + sp.h) * s.s + size * 0.75 };
  }
  const measureCache = new Map();
  function measureLabel(ctx, text, size, weight, font, spacing) {
    const k = text + '\u0000' + size.toFixed(2) + weight + (font || '') + (spacing || 0);
    let w = measureCache.get(k);
    if (w == null) {
      ctx.save();
      ctx.font = `${weight || 500} ${size}px ${(FONTS[font || 'serif'] || FONTS.serif).family}`;
      const chars = Array.from(text);
      w = chars.reduce((acc, c) => acc + ctx.measureText(c).width, 0) + (spacing || 0) * size * Math.max(0, chars.length - 1);
      ctx.restore();
      if (measureCache.size > 4000) measureCache.clear();
      measureCache.set(k, w);
    }
    return w;
  }
  function overlapArea(a, b) {
    const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    if (w <= 0) return 0;
    const hh = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    return hh > 0 ? w * hh : 0;
  }
  /**
   * 地名の自動配置：大事な地名（首都・城・都市）から順に、下 → 右 → 左 → 上 の中で
   * ほかの地名・置いた文字・町の絵と重ならず、地図の外にはみ出さない向きを選ぶ。
   * 向きを自分で決めた素材（s.lp）はそのまま。戻り値：素材の id → 向き
   */
  function planStampLabels(ctx, areasHidden) {
    const m = M.map;
    const plan = new Map();
    const placed = [];
    const pad = 1.5;
    // 先に、置いてある文字（国名・海の名前など）と、領域の名前を障害物にする
    m.labels.forEach((lb) => {
      const sty = LABEL_STYLES[lb.style] || LABEL_STYLES.region;
      const size = lb.size || sty.size;
      const spacing = lb.spacing != null ? lb.spacing : sty.spacing;
      const n = Array.from(lb.text || '').length;
      let w = lb.vertical ? size * 1.15 : measureLabel(ctx, lb.text || '', size, sty.weight, lb.font || sty.font, spacing);
      let hh = lb.vertical ? n * size * (1 + (spacing || 0)) : size * 1.25;
      if (lb.rotation) {
        const r = Math.abs(lb.rotation * Math.PI / 180);
        const ww = Math.abs(Math.cos(r)) * w + Math.abs(Math.sin(r)) * hh;
        hh = Math.abs(Math.sin(r)) * w + Math.abs(Math.cos(r)) * hh;
        w = ww;
      }
      if (lb.curve) hh += w * 0.12;
      placed.push([lb.x - w / 2, lb.y - hh / 2, lb.x + w / 2, lb.y + hh / 2]);
    });
    if (!areasHidden) {
      const seen = new Set();
      m.areas.forEach((ar) => {
        if (!ar.name || (ar.nameLabel != null && ar.nameLabel !== '')) return;
        if (ar.group) { if (seen.has(ar.group)) return; seen.add(ar.group); }
        const c = centroid(ar.points);
        const w = measureLabel(ctx, ar.name, 16, 700, 'shippori', 0.4);
        placed.push([c[0] - w / 2, c[1] - 10, c[0] + w / 2, c[1] + 10]);
      });
    }
    // 町や建物の絵（山や木は数が多いので避けない）
    const icons = [];
    const pk = palKey();
    const items = [];
    m.stamps.forEach((s) => {
      const a = AS.BY_ID[s.a];
      if (!a) return;
      const sp = AS.sprite(s.a, s.v, pk);
      const box = [s.x + sp.x0 * s.s, s.y + sp.y0 * s.s, s.x + (sp.x0 + sp.w) * s.s, s.y + (sp.y0 + sp.h) * s.s];
      const natural = a.cat === '山・丘' || a.cat === '木・植物' || a.id === 'wave';
      if (!natural) icons.push({ s, box });
      const name = stampName(s);
      if (!name || s.lp === 'none' || a.labelPos === 'none') return;
      const f = stampLabelFont(s, a);
      const rank = f.major ? 0 : (a.cat === '町・建物' || a.cat === '和風') ? 1 : a.cat === '地図記号' ? 2 : 3;
      items.push({ s, a, sp, name, f, rank });
    });
    items.sort((p1, p2) => p1.rank - p2.rank || p2.f.size - p1.f.size);
    const W = M.W;
    const Hh = M.Hpx;
    items.forEach((it) => {
      const { s, a, sp, name, f } = it;
      const w = measureLabel(ctx, name, f.size, f.weight, 'serif', 0);
      const hh = f.size * 1.2;
      const def = a.labelPos || 'below';
      const cands = s.lp ? [s.lp] : [def].concat(['below', 'right', 'left', 'above'].filter((q) => q !== def));
      let best = null;
      cands.forEach((pos, i) => {
        const c = stampLabelAnchor(s, a, sp, f.size, pos, w);
        const box = [c.x - w / 2 - pad, c.y - hh / 2, c.x + w / 2 + pad, c.y + hh / 2];
        let score = i * 0.04 * w * hh; // 迷ったら元の向き
        placed.forEach((b) => { score += overlapArea(box, b) * 10; });
        icons.forEach((ic) => { if (ic.s !== s) score += overlapArea(box, ic.box) * 3; });
        const out = Math.max(0, -box[0]) + Math.max(0, box[2] - W) + Math.max(0, -box[1]) + Math.max(0, box[3] - Hh);
        score += out * hh * 12;
        if (!best || score < best.score) best = { pos, box, score };
      });
      plan.set(s.id, best.pos);
      placed.push(best.box);
    });
    return plan;
  }

  function drawStampLabel(ctx, s, name, pl, planned) {
    const a = AS.BY_ID[s.a];
    if (!a || s.lp === 'none' || a.labelPos === 'none') return;
    const pos = s.lp || planned || a.labelPos || 'below';
    const { size, weight } = stampLabelFont(s, a);
    const sp = AS.sprite(s.a, s.v, palKey());
    const ink = pl.ink;
    const c = stampLabelAnchor(s, a, sp, size, pos, 0);
    if (pos === 'right') drawText(ctx, name, 0, 0, { size, weight, color: ink, halo: pl.halo, align: 'left', x: c.left, y: c.y });
    else if (pos === 'left') drawText(ctx, name, 0, 0, { size, weight, color: ink, halo: pl.halo, align: 'right', x: c.left, y: c.y });
    else drawText(ctx, name, c.x, c.y, { size, weight, color: ink, halo: pl.halo });
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

  // ───── 凡例 ─────
  // 町・建物は大事な順に。ここにないもの（山・木・海の飾り）は凡例に出さない
  const LEGEND_STAMPS = ['castle', 'jcastle', 'city', 'town', 'village', 'jvillage', 'port', 'fort', 'tower', 'temple', 'church', 'shrine', 'pagoda', 'torii', 'lighthouse', 'windmill', 'farm', 'camp', 'bridge',
    'market', 'monastery', 'arena', 'mine', 'graveyard', 'ruins', 'cave', 'stones', 'crystal', 'obelisk', 'portal', 'giant-tree', 'dragon', 'battlefield', 'skull',
    'volcano', 'waterfall', 'oasis', 'whirlpool', 'serpent', 'kraken', 'whale'];
  const LEGEND_LINES = ['highway', 'road', 'trail', 'rail', 'river', 'wall', 'border', 'route'];
  /** 地図で使っているものから、凡例の行を作る */
  function legendRows() {
    const m = M.map;
    const rows = [];
    const usedA = new Set(m.stamps.map((s) => s.a));
    LEGEND_STAMPS.forEach((a) => { if (usedA.has(a) && AS.BY_ID[a]) rows.push({ kind: 'stamp', a, label: AS.BY_ID[a].label }); });
    m.stamps.forEach((s) => { if (/^sym-/.test(s.a) && AS.BY_ID[s.a] && !rows.some((r) => r.a === s.a)) rows.push({ kind: 'stamp', a: s.a, label: AS.BY_ID[s.a].label }); });
    const usedL = new Set(m.lines.map((l) => (l.kind === 'stream' ? 'river' : l.kind)));
    LEGEND_LINES.forEach((k) => { if (usedL.has(k)) rows.push({ kind: 'line', line: k, label: (PATH_KINDS[k] || {}).label || k }); });
    // 国・領域（名前のあるものを、色つきで）
    const seen = new Set();
    m.areas.forEach((ar) => {
      const key = ar.group || ar.id;
      if (!ar.name || seen.has(key) || seen.size >= 10) return;
      seen.add(key);
      rows.push({ kind: 'area', color: ar.color, label: ar.name });
    });
    return rows;
  }
  function drawLegend(ctx, pl) {
    const rows = legendRows();
    if (!rows.length) return;
    const u = Math.max(1, Math.min(2, M.W / 1100)); // 大きな地図では少し大きく
    const fs = 11 * u;
    const rowH = 19 * u;
    const icon = 26 * u;
    const pad = 10 * u;
    const ink = inkOf(pl);
    ctx.save();
    ctx.font = `500 ${fs}px "Noto Serif JP", "Hiragino Mincho ProN", serif`;
    const textW = Math.max(ctx.measureText('凡例').width * 1.3, ...rows.map((r) => ctx.measureText(r.label).width));
    const bw = pad * 2 + icon + 8 * u + textW;
    const bh = pad * 2 + 18 * u + rows.length * rowH;
    const pos = M.map.style.legendPos || 'br';
    const margin = 22;
    const bx = pos[1] === 'r' ? M.W - margin - bw : margin;
    const by = pos[0] === 'b' ? M.Hpx - margin - bh - (pos === 'bl' && M.map.style.scale ? 40 : 0) : margin + (pos === 'tl' || pos === 'tr' ? 0 : 0);
    // 枠
    ctx.fillStyle = pl === E.PALETTES.night ? 'rgba(20,24,30,0.86)' : 'rgba(251,246,234,0.92)';
    ctx.strokeStyle = hexA(ink.length === 7 ? ink : '#3a2e24', 0.85);
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4 * u); else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
    ctx.strokeRect(bx + 3 * u, by + 3 * u, bw - 6 * u, bh - 6 * u);
    ctx.fillStyle = pl.ink;
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fs * 1.15}px "Shippori Mincho", "Noto Serif JP", serif`;
    ctx.textAlign = 'center';
    ctx.fillText('凡　例', bx + bw / 2, by + pad + 7 * u);
    ctx.textAlign = 'left';
    ctx.font = `500 ${fs}px "Noto Serif JP", "Hiragino Mincho ProN", serif`;
    rows.forEach((r, i) => {
      const cy = by + pad + 18 * u + i * rowH + rowH / 2;
      const ix = bx + pad;
      if (r.kind === 'stamp') {
        const sp = AS.sprite(r.a, 0, palKey());
        const k = Math.min(icon / sp.w, (rowH * 1.05) / sp.h);
        ctx.drawImage(sp.canvas, ix + (icon - sp.w * k) / 2, cy - (sp.h * k) / 2, sp.w * k, sp.h * k);
      } else if (r.kind === 'line') {
        ctx.save();
        drawPath(ctx, { id: 'legend-' + r.line, kind: r.line, points: [[ix + 1 * u, cy], [ix + icon - 1 * u, cy]], w: r.line === 'river' ? 0.8 * u : u, wobble: 0 }, pl);
        ctx.restore();
      } else {
        ctx.fillStyle = hexA(r.color, 0.45);
        ctx.strokeStyle = hexA(r.color, 0.9);
        ctx.lineWidth = 1.2 * u;
        ctx.fillRect(ix + 3 * u, cy - 6 * u, icon - 6 * u, 12 * u);
        ctx.strokeRect(ix + 3 * u, cy - 6 * u, icon - 6 * u, 12 * u);
      }
      ctx.fillStyle = pl.ink;
      ctx.fillText(r.label, ix + icon + 8 * u, cy + 0.5 * u);
    });
    ctx.restore();
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
    drawMeasure(ctx);
    if (M.drag && M.drag.kind === 'region') {
      const d = M.drag;
      const x = Math.min(d.start.x, d.end.x);
      const y = Math.min(d.start.y, d.end.y);
      const w2 = Math.abs(d.end.x - d.start.x);
      const h2 = Math.abs(d.end.y - d.start.y);
      ctx.save();
      // 囲んだ外側を暗く
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.rect(0, 0, M.W, M.Hpx);
      ctx.rect(x, y, w2, h2);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([6 / z, 4 / z]);
      ctx.strokeRect(x, y, w2, h2);
      ctx.restore();
      const kmW = w2 / M.map.cell * (M.map.style.kmPerCell || 4);
      const kmH = h2 / M.map.cell * (M.map.style.kmPerCell || 4);
      if (w2 * z > 40) measureTag(ctx, [x + w2, y], `${fmtKm(kmW)} × ${fmtKm(kmH)}`, false);
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

  /** 距離を測っている線と、合計の道のり */
  function drawMeasure(ctx) {
    const z = M.zoom;
    const ms = M.measure;
    const d = M.drag && M.drag.kind === 'measure' && M.drag.active ? M.drag : null;
    let pts = ms ? ms.pts.slice() : [];
    if (d) pts = (ms && !ms.done ? pts : []).concat(d.pts);
    else if (ms && !ms.done && M.hover && PREF.tool === 'measure') pts.push([M.hover.x, M.hover.y]);
    if (!pts.length) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const line = () => { ctx.beginPath(); pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]))); ctx.stroke(); };
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 5 / z;
    line();
    ctx.strokeStyle = '#c4382a';
    ctx.lineWidth = 2.2 / z;
    ctx.setLineDash([7 / z, 5 / z]);
    line();
    ctx.setLineDash([]);
    // 打った点と、途中までの距離
    let acc = 0;
    const fixed = ms ? ms.pts : [];
    fixed.forEach((pt, i) => {
      if (i) acc += kmBetween(fixed[i - 1], pt);
      ctx.fillStyle = i === 0 ? '#c4382a' : '#fff';
      ctx.strokeStyle = '#c4382a';
      ctx.lineWidth = 1.6 / z;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], (i === 0 ? 4.5 : 3.5) / z, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (i && i < fixed.length - 1 && fixed.length <= 12) measureTag(ctx, pt, fmtKm(acc), true);
    });
    if (pts.length >= 2) {
      const info = routeInfo(pts);
      const trip = info.landKm < 0.5 ? TRAVEL[3].label + fmtTrip(info.km, TRAVEL[3]) : TRAVEL[0].label + fmtTrip(info.eff, TRAVEL[0]);
      measureTag(ctx, pts[pts.length - 1], fmtKm(info.km) + '・' + trip, false);
    }
    ctx.restore();
  }
  function measureTag(ctx, pt, text, small) {
    const z = M.zoom;
    const fs = (small ? 10 : 12.5) / z;
    ctx.save();
    ctx.font = `${small ? 500 : 700} ${fs}px "Noto Sans JP", "Hiragino Sans", sans-serif`;
    const w = ctx.measureText(text).width;
    const pad = 5 / z;
    // 画面の右端からはみ出すときは、点の左側に出す
    const viewRight = (M.cw - M.ox) / z;
    const x = pt[0] + 9 / z + w + pad * 2 > viewRight - 4 / z ? pt[0] - 9 / z - w - pad * 2 : pt[0] + 9 / z;
    const y = pt[1] - (small ? 8 : 14) / z;
    ctx.fillStyle = small ? 'rgba(255,255,255,0.88)' : '#c4382a';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1 / z;
    const hgt = fs + pad * 1.4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y - hgt / 2, w + pad * 2, hgt, 4 / z); else ctx.rect(x, y - hgt / 2, w + pad * 2, hgt);
    ctx.fill();
    if (small) ctx.stroke();
    ctx.fillStyle = small ? '#7a2219' : '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pad, y + fs * 0.05);
    ctx.restore();
  }

  // ───── 書き出し ─────
  function exportDialog() {
    // 長い辺の画素数から倍率を決める（印刷：300dpi で A4 は 3508px、A3 は 4961px）
    const long = Math.max(M.W, M.Hpx);
    const opts = [
      ['1', 1, '1倍（画面用）'], ['2', 2, '2倍'], ['3', 3, '3倍'], ['4', 4, '4倍'],
      ['a4', 3508 / long, '印刷：A4（300dpi）'], ['a3', 4961 / long, '印刷：A3（300dpi）'],
    ];
    const sizeLabel = (k) => `${Math.round(M.W * k).toLocaleString('ja-JP')}×${Math.round(M.Hpx * k).toLocaleString('ja-JP')}px`;
    const sel = h('select', { class: 'input', 'aria-label': '大きさ' }, opts.map(([v, k, l]) => h('option', { value: v, selected: v === '2' }, `${l}　${sizeLabel(k)}`)));
    const fmt = h('select', { class: 'input', 'aria-label': '形式' },
      h('option', { value: 'png' }, 'PNG（きれい・ファイルは大きめ）'), h('option', { value: 'jpeg' }, 'JPEG（ファイルが小さい・投稿や共有向け）'));
    const warn = h('p', { class: 'small muted' });
    const upd = () => {
      const k = opts.find(([v]) => v === sel.value)[1];
      const px = M.W * k * M.Hpx * k;
      warn.textContent = px > 16e6 ? 'とても大きな画像です。書き出しに時間がかかり、スマートフォンでは失敗することがあります（そのときは小さい大きさを選んでください）。' : '大きいほどきれいですが、書き出しに時間がかかります。';
    };
    sel.addEventListener('change', upd);
    upd();
    UI.modal({
      title: '画像として書き出す',
      body: h('div', { class: 'stack' }, h('div', { class: 'grid-2' }, UI.field('大きさ', sel), UI.field('形式', fmt)), warn,
        h('p', { class: 'muted small' }, '隠しているレイヤーは書き出されません。枠・題名・縮尺・凡例は「地図の設定」で選べます。印刷するときは、用紙の向きを地図に合わせてください。')),
      actions: [{ label: 'キャンセル', ghost: true }, { label: '書き出す', primary: true, onClick: () => { exportPng(opts.find(([v]) => v === sel.value)[1], fmt.value); } }],
    });
  }

  async function exportPng(scale, type) {
    type = type === 'jpeg' ? 'jpeg' : 'png';
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
    if (type === 'jpeg') {
      // JPEG は透明にできないので、下を紙の色で塗っておく
      const bg = document.createElement('canvas');
      bg.width = iw;
      bg.height = ih;
      const g = bg.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, iw, ih);
      g.drawImage(c, 0, 0);
      bg.toBlob((blob) => {
        if (!blob) { toast('書き出せませんでした（画像が大きすぎる可能性があります）', 'error'); return; }
        UI.download(UI.safeFilename(M.map.name) + '.jpg', blob);
        toast('JPEG を書き出しました');
      }, 'image/jpeg', 0.92);
      return;
    }
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
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const parts = [h('p', { class: 'muted small' }, (coarse && TOUCH_HINTS[t.id]) || t.hint)];
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
    if (t.id === 'measure') {
      const ms = M.measure;
      if (ms && ms.pts.length >= 2) {
        const info = routeInfo(ms.pts);
        parts.push(h('div', { class: 'measure-total' }, h('span', { class: 'muted small' }, '道のり'), h('strong', null, fmtKm(info.km))), terrainBar(info), tripTable(info),
          h('p', { class: 'small muted' }, '日数は、通る地形（山・森・湿地など）と、描いてある道を通るかどうかを考えた目安です。'));
        if (M.map.style.world || M.map.style.grid === 'latlon') parts.push(h('p', { class: 'small muted' }, '世界地図では、地球のような球の上での距離として測ります（高緯度ほど、地図の見た目より近くなります）。'));
      } else {
        parts.push(h('p', { class: 'small' }, '出発地をクリックし、曲がり角ごとにクリックしていくと、道のりと旅の日数が出ます。'));
      }
      const speedRow = (tr) => {
        const sp = speedOf(tr);
        return h('label', { class: 'speed-row small' }, h('span', null, tr.label), h('input', {
          class: 'input input-num', type: 'number', min: 1, max: 2000, step: 1, value: sp.kmd, 'aria-label': tr.label + '：1日に進む距離（km）',
          onchange: (e) => {
            const v = Math.round(+e.target.value);
            PREF.travel[tr.id] = Object.assign({}, PREF.travel[tr.id], { kmd: v > 0 && v <= 2000 ? v : tr.kmd });
            savePref();
            renderInspector();
            updateHint();
            draw();
          },
        }), h('span', { class: 'muted' }, 'km／日'));
      };
      const det = h('details', { class: 'speed-box' }, h('summary', { class: 'small' }, '旅の速さを変える'), ...TRAVEL.map(speedRow),
        h('p', { class: 'small muted' }, '目安：徒歩は1日30km前後、馬は乗り継がなければ60km前後、荷を積んだ馬車や隊商は25km前後、帆船は風しだいで1日100〜200km。'),
        btn('標準に戻す', { small: true, ghost: true, onClick: () => { PREF.travel = {}; savePref(); renderInspector(); updateHint(); draw(); } }));
      parts.push(det);
      parts.push(h('p', { class: 'small muted' }, `この地図の縮尺：1マス＝${M.map.style.kmPerCell || 4}km（地図の設定で変えられます）`));
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
      const sp = sampleSpline(obj.points, false, 4);
      const isRoad = ROAD_KINDS.includes(obj.kind);
      const info = routeInfo(sp, isRoad);
      if (obj.kind === 'route') { info.seaKm = info.km; info.landKm = 0; }
      parts.push(h('div', { class: 'measure-total' }, h('span', { class: 'muted small' }, '長さ'), h('strong', null, '約' + fmtKm(info.km))),
        ['border', 'wall', 'river', 'stream'].includes(obj.kind) ? null : tripTable(info, obj.kind === 'route' ? ['ship'] : ['walk', 'horse', 'cart']));
      parts.push(h('p', { class: 'muted small' }, `頂点 ${obj.points.length}個。頂点をドラッグで動かし、選んで Delete で削除できます。`));
      parts.push(btn('向きを反転（川の上流・下流）', { small: true, onClick: () => { beginEdit(); obj.points.reverse(); changed(); } }));
    } else if (k === 'area') {
      // 同じ国の飛び地（島など）と、地図に置いた国名もいっしょに変える
      const mates = () => (obj.group ? M.map.areas.filter((a) => a.group === obj.group) : [obj]);
      const linked = () => (obj.nameLabel ? M.map.labels.find((lb) => lb.id === obj.nameLabel) : null);
      parts.push(UI.field('名前', h('input', { class: 'input', type: 'text', value: obj.name || '', dataset: { focus: '1' }, placeholder: '例：エルミナ王国', oninput: (e) => {
        beginEdit();
        mates().forEach((a) => { a.name = e.target.value; });
        const lb = linked();
        if (lb) lb.text = e.target.value;
        changed();
      } }), linked() ? '地図の国名（文字）も変わります' : null));
      const swatchColors = AREA_COLORS.concat(E.COUNTRY_COLORS || []).filter((c, i, a) => a.indexOf(c) === i);
      parts.push(UI.field('色', h('div', { class: 'swatches' }, swatchColors.map((c) => h('button', {
        type: 'button', class: 'swatch' + (obj.color === c ? ' active' : ''), style: { background: c }, 'aria-label': c,
        onclick: () => { beginEdit(); mates().forEach((a) => { a.color = c; }); changed(true); },
      })))));
      parts.push(UI.field('塗りの濃さ', range(obj.opacity != null ? obj.opacity : 0.22, 0, 0.8, 0.02, (v) => { beginEdit(); mates().forEach((a) => { a.opacity = v; }); changed(); }, (v) => Math.round(v * 100) + '%')));
      parts.push(h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!obj.land, onchange: (e) => { beginEdit(); mates().forEach((a) => { a.land = e.target.checked; }); changed(); } }),
        '陸だけを塗る（海にはみ出さない）'));
      const km2 = mates().reduce((a, ar) => a + areaKm2(ar), 0);
      if (km2 > 0) {
        const JP = 377975;
        const ratio = km2 / JP;
        const cmp = ratio >= 0.95 && ratio <= 1.05 ? '日本とほぼ同じ' : ratio > 1 ? `日本の約${ratio < 10 ? Math.round(ratio * 10) / 10 : Math.round(ratio)}倍` : `日本の約${Math.max(1, Math.round(ratio * 100))}%`;
        parts.push(h('div', { class: 'measure-total' }, h('span', { class: 'muted small' }, '面積'), h('strong', null, '約' + fmtArea(km2)), h('span', { class: 'muted small' }, cmp)));
      }
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

  /** 地図データの小さな見本を描く（地形・線・素材） */
  function drawMapPreview(canvas, m) {
    const n = m.gw * m.gh;
    const H = E.decodeHeights(m.height, n);
    const B = E.decodeBiomes(m.biome, n);
    const ph = Math.round(canvas.width * m.gh / m.gw);
    if (canvas.height !== ph) canvas.height = ph;
    const ctx = canvas.getContext('2d');
    const res = canvas.width / (m.gw * m.cell);
    const img = ctx.createImageData(canvas.width, canvas.height);
    E.renderTerrain(m, H, B, img, 0, 0, canvas.width, canvas.height, res);
    ctx.putImageData(img, 0, 0);
    const plt = E.PALETTES[m.style.palette] || E.PALETTES.parchment;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    m.lines.forEach((ln) => {
      ctx.beginPath();
      ln.points.forEach((pt, i) => (i ? ctx.lineTo(pt[0] * res, pt[1] * res) : ctx.moveTo(pt[0] * res, pt[1] * res)));
      if (ln.kind === 'river' || ln.kind === 'stream') { ctx.strokeStyle = `rgb(${plt.shallow.join(',')})`; ctx.lineWidth = Math.max(0.8, 2 * res); ctx.setLineDash([]); }
      else if (ln.kind === 'border') { ctx.strokeStyle = 'rgba(80,40,40,0.8)'; ctx.lineWidth = 0.8; ctx.setLineDash([2.5, 2]); }
      else { ctx.strokeStyle = plt.road; ctx.lineWidth = Math.max(0.7, 1.6 * res); ctx.setLineDash([]); }
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const pk = plt.assets;
    m.stamps.forEach((st) => {
      const sp = AS.sprite(st.a, st.v, pk);
      const k = st.s * res;
      ctx.setTransform(k * (st.f ? -1 : 1), 0, 0, k, st.x * res, st.y * res);
      ctx.drawImage(sp.canvas, sp.x0, sp.y0, sp.w, sp.h);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2b2118';
    ctx.font = '600 10px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    m.labels.forEach((lb) => ctx.fillText(lb.text, lb.x * res, lb.y * res));
  }

  /** 囲んだ範囲を、詳しい地図にする */
  function regionDialog(rect) {
    const src = M.map;
    // 範囲の中のいちばん大きな国名・地名を、新しい地図の名前に
    const inside = src.labels.filter((lb) => lb.x >= rect.x0 && lb.x <= rect.x1 && lb.y >= rect.y0 && lb.y <= rect.y1 && (lb.style === 'region' || lb.style === 'area'))
      .sort((a, b) => (b.size || 0) - (a.size || 0));
    const name = h('input', { class: 'input', type: 'text', value: inside.length ? inside[0].text + '全図' : src.name + '（詳細）', 'aria-label': '新しい地図の名前' });
    const rivers = h('input', { type: 'checkbox', checked: true });
    const preview = h('canvas', { class: 'gen-preview', width: 300, height: 200, 'aria-label': 'プレビュー' });
    const info = h('p', { class: 'small' });
    let seed = Math.floor(Math.random() * 1e6);
    let result = null;
    const run = () => {
      try {
        result = E.regionMap(src, M.H, M.B, rect, { name: name.value.trim(), seed, rivers: rivers.checked });
      } catch (e) { info.textContent = e.message; result = null; return; }
      drawMapPreview(preview, result.map);
      const m = result.map;
      info.textContent = `約${Math.round(result.zoom * 10) / 10}倍に詳しくします（${m.gw}×${m.gh}マス・1マス＝${m.style.kmPerCell}km）。町・城・道・川・国境・名前を引き継ぎ、山や森は新しい地形に合わせて置き直します。`;
    };
    rivers.addEventListener('change', run);
    UI.modal({
      title: '範囲を詳しい地図にする', wide: true,
      body: h('div', { class: 'gen-dialog' },
        h('div', { class: 'stack' },
          UI.field('新しい地図の名前', name),
          info,
          h('label', { class: 'check' }, rivers, '小さな川を足す（元の地図になかった支流など）'),
          btn('別の細かさで', { icon: 'dice', small: true, title: '入り江や起伏などの細部を、別の形で作り直します', onClick: () => { seed = Math.floor(Math.random() * 1e6); run(); } }),
          h('p', { class: 'small muted' }, '元の地図はそのまま残ります。新しい地図は地図の一覧に加わり、「地図の設定」から元の地図へ戻れます。')),
        h('div', { class: 'gen-preview-wrap' }, preview, h('p', { class: 'muted small' }, 'プレビュー'))),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: '詳しい地図を作る', primary: true, onClick: () => {
          if (!result) return false;
          result.map.name = name.value.trim() || result.map.name;
          P().maps.push(result.map);
          NS.App.touch();
          NS.App.navigate('map', { id: result.map.id });
          toast(`「${result.map.name}」を作りました`);
          return undefined;
        } },
      ],
    });
    setTimeout(run, 20);
  }

  /** 国に分ける（自動で作った国は、作り直すと入れ替わる。自分で描いた領域・国境・文字はそのまま） */
  function countriesDialog() {
    const m = M.map;
    const had = m.areas.some((a) => a.gen === 'country') || m.lines.some((l) => l.gen === 'country') || m.labels.some((l) => l.gen === 'country');
    const count = h('select', { class: 'input' }, h('option', { value: 0 }, '自動（陸の広さに合わせる）'),
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20].map((n) => h('option', { value: n }, n + 'か国')));
    let seed = (m.seed || 1) + (M.countrySeed || 0);
    const names = h('input', { type: 'checkbox', checked: true });
    const caps = h('input', { type: 'checkbox', checked: !m.stamps.some((s) => s.a === 'castle' && s.name) });
    const preview = h('canvas', { class: 'gen-preview', width: 300, height: Math.round(300 * m.gh / m.gw), 'aria-label': 'プレビュー' });
    let result = null;
    const run = () => {
      result = E.autoCountries(m, M.H, M.B, seed, { count: +count.value, names: names.checked, capitals: caps.checked });
      // プレビュー：今の地図の上に国を塗る
      const ctx = preview.getContext('2d');
      const k = preview.width / M.W;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, preview.width, preview.height);
      ctx.drawImage(M.base, 0, 0, preview.width, preview.height);
      const lay = document.createElement('canvas');
      lay.width = preview.width;
      lay.height = preview.height;
      const lc = lay.getContext('2d');
      lc.setTransform(k, 0, 0, k, 0, 0);
      result.areas.forEach((ar) => {
        lc.beginPath();
        ar.points.forEach((pt, i) => (i ? lc.lineTo(pt[0], pt[1]) : lc.moveTo(pt[0], pt[1])));
        lc.closePath();
        lc.fillStyle = hexA(ar.color, 0.45);
        lc.fill();
      });
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.globalCompositeOperation = 'destination-in';
      lc.drawImage(M.mask, 0, 0, preview.width, preview.height);
      ctx.drawImage(lay, 0, 0);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.strokeStyle = 'rgba(60,30,30,0.85)';
      ctx.lineWidth = 1 / k;
      ctx.setLineDash([3 / k, 2 / k]);
      result.borders.forEach((ln) => { ctx.beginPath(); ln.points.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]))); ctx.stroke(); });
      ctx.setLineDash([]);
      ctx.fillStyle = '#2b2118';
      ctx.font = '600 9px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      result.labels.forEach((lb) => ctx.fillText(lb.text, lb.x * k, lb.y * k));
      info.textContent = `${result.count}か国：` + result.labels.map((lb) => lb.text).join('・');
    };
    const info = h('p', { class: 'small muted' });
    [count, names, caps].forEach((el) => el.addEventListener('change', run));
    UI.modal({
      title: '国に分ける', wide: true,
      body: h('div', { class: 'gen-dialog' },
        h('div', { class: 'stack' },
          h('p', { class: 'small muted' }, '陸を、山の尾根や大きな川を境にしながら国に分け、色・国境・国名を付けます。国名は仮のカタカナで、あとで「選択」から変えられます。'),
          UI.field('国の数', count),
          h('label', { class: 'check' }, names, '国名を付ける'),
          h('label', { class: 'check' }, caps, '首都の印を置く'),
          btn('別の分け方', { icon: 'dice', small: true, onClick: () => { seed = Math.floor(Math.random() * 1e6); run(); } }),
          had ? h('p', { class: 'small warn' }, '前に自動で作った国（塗り・国境・国名・首都）は、新しいものに入れ替わります。自分で描いた領域や文字はそのままです。') : null),
        h('div', { class: 'gen-preview-wrap' }, preview, info)),
      actions: [
        { label: 'キャンセル', ghost: true },
        { label: had ? '入れ替える' : '国に分ける', primary: true, onClick: () => {
          if (!result) return;
          pushUndo();
          m.areas = m.areas.filter((a) => a.gen !== 'country').concat(result.areas);
          m.lines = m.lines.filter((l) => l.gen !== 'country').concat(result.borders);
          m.labels = m.labels.filter((l) => l.gen !== 'country').concat(result.labels);
          const caps2 = result.stamps;
          if (caps2.length) {
            const near = (st) => caps2.some((c) => Math.hypot(c.x - st.x, c.y - st.y) < 16) && AS.BY_ID[st.a] && ['山・丘', '木・植物'].includes(AS.BY_ID[st.a].cat) && !st.name;
            m.stamps = m.stamps.filter((st) => st.gen !== 'country' && !near(st)).concat(caps2);
          } else {
            m.stamps = m.stamps.filter((st) => st.gen !== 'country');
          }
          sortStamps();
          M.sel = [];
          commit();
          renderInspector();
          draw();
          toast(`${result.count}か国に分けました。国を選ぶと、名前・色・面積を確認できます`);
        } },
      ],
    });
    setTimeout(run, 20);
  }

  function mapPane() {
    const p = P();
    const m = M.map;
    const st = m.style;
    const set = (k, v, terrain) => { pushUndo(); st[k] = v; if (terrain) renderTerrainFull(); commit(); draw(); };
    const toggle = (k, label, terrain) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st[k], onchange: (e) => set(k, e.target.checked, terrain) }), label);
    const sel = (k, opts, label) => UI.field(label, h('select', { class: 'input', onchange: (e) => { set(k, e.target.value); renderInspector(); } }, opts.map(([v, l]) => h('option', { value: v, selected: String(st[k]) === v }, l))));
    const from = m.region && p.maps.find((x) => x.id === m.region.from);
    const regionNote = from ? h('p', { class: 'small muted region-note' }, `「${from.name}」の一部を約${m.region.zoom}倍に詳しくした地図です。`,
      btn('元の地図を開く', { small: true, ghost: true, onClick: () => NS.App.navigate('map', { id: from.id }) })) : null;
    return section('地図の設定', regionNote,
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
        sel('grid', [['none', 'なし'], ['square', '方眼'], ['hex', '六角形（ヘックス）'], ['latlon', '経緯線（世界地図）']], 'マス目'),
        UI.field('マスの大きさ', h('input', { class: 'input input-num', type: 'number', min: 2, max: 80, value: st.gridSize || 12, onchange: (e) => set('gridSize', Math.max(2, parseInt(e.target.value, 10) || 12)) }))),
      UI.field('縮尺（1マス＝何km）', h('input', { class: 'input input-num', type: 'number', min: 0.01, step: 0.5, value: st.kmPerCell, onchange: (e) => set('kmPerCell', Math.max(0.01, parseFloat(e.target.value) || 1)) }),
        `地図の横幅 ≒ ${UI.fmtNum(m.gw * st.kmPerCell)} km`),
      h('div', { class: 'check-grid' },
        toggle('hillshade', '起伏の陰影', true), toggle('ripples', '海の波紋', true),
        toggle('scale', '縮尺'), toggle('vignette', '周辺を暗く'), toggle('texture', '紙の質感'), toggle('ice', '極地の氷', true),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st.legend, onchange: (e) => { set('legend', e.target.checked); renderInspector(); } }), '凡例'),
        h('label', { class: 'check', title: '町や城の名前が、ほかの名前・文字・町の絵と重ならないよう、下・右・左・上から置き場所を自動で選びます（名前の位置を決めた素材はそのまま）' },
          h('input', { type: 'checkbox', checked: st.declutter !== false, onchange: (e) => set('declutter', e.target.checked) }), '地名を重ねない')),
      st.legend ? sel('legendPos', [['br', '右下'], ['bl', '左下'], ['tr', '右上'], ['tl', '左上']], '凡例の位置') : null,
      h('div', { class: 'row wrap' },
        btn('山・森を置き直す', { icon: 'mountain', small: true, title: '今の地形（高さ・地面）に合わせて、山・丘・森などを自動で置き直します', onClick: replantDialog }),
        btn('地形を作り直す', { icon: 'dice', small: true, onClick: () => newMapDialog(true) }),
        btn('国に分ける', { icon: 'flag', small: true, title: '陸を、山や川を境にして国に分け、国境・国名・首都を付けます', onClick: countriesDialog }),
        btn('範囲を詳しい地図に', { icon: 'search', small: true, title: '地図の一部を囲んで、その範囲を拡大した詳しい地図を新しく作ります（世界地図 → 国 → 地方）', onClick: () => {
          M.regionPick = true;
          M.sel = [];
          setTool('pan');
          M.regionPick = true;
          if (window.innerWidth < 900) setSheet(false);
          updateHint();
          draw();
        } }),
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
        h('li', null, '道具のキー：V 選択・H 移動・B 陸・N 海・R 起伏・G 地面・S 素材・F 散布・X 消す・L 道川・A 領域・T 文字・M 距離'),
        h('li', null, 'Q / E で回転、[ ] で大きさ、Ctrl+D で複製、Ctrl+Z で元に戻す'),
        h('li', null, '何もない所をドラッグで範囲選択、Shift+クリックで追加選択'))));
  }

  V.TOOLS = TOOLS;
  NS.Views.map = V;
})(window.Tsuzuri = window.Tsuzuri || {});
