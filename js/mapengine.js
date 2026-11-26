/*
 * 綴り — 空想地図エンジン（地形の生成・描画・保存形式）
 * 高さマップ（-1〜1、0 が海面）と地面マップを格子で持ち、描画時に双線形補間＋細かなノイズで
 * 自然な海岸線、浅瀬の光、波紋、起伏の陰影、地面の質感（森・砂漠・岩場・農地など）を描く。
 */
(function (NS) {
  'use strict';

  const BIOMES = [
    { id: 0, key: 'grass', label: '草原' },
    { id: 1, key: 'forest', label: '森の地面' },
    { id: 2, key: 'desert', label: '砂漠' },
    { id: 3, key: 'swamp', label: '湿地' },
    { id: 4, key: 'snow', label: '雪原' },
    { id: 5, key: 'jungle', label: '密林' },
    { id: 6, key: 'steppe', label: '荒れ地' },
    { id: 7, key: 'rock', label: '岩場' },
    { id: 8, key: 'farm', label: '農地' },
    { id: 9, key: 'ash', label: '焦土' },
  ];

  const PALETTES = {
    parchment: {
      label: '羊皮紙',
      deep: [143, 172, 190], shallow: [196, 216, 220], glow: [226, 236, 230], ripple: [118, 150, 172], coast: [70, 56, 44],
      beach: [240, 228, 190],
      ramp: [[0, [236, 226, 192]], [0.22, [226, 216, 172]], [0.45, [205, 188, 142]], [0.68, [180, 157, 120]], [0.86, [156, 134, 104]], [0.95, [244, 241, 234]]],
      biome: { 1: [166, 184, 126], 2: [238, 219, 168], 3: [168, 176, 138], 4: [242, 244, 246], 5: [128, 160, 104], 6: [218, 204, 156], 7: [196, 190, 176], 8: [214, 204, 140], 9: [120, 108, 98] },
      paper: 5, ink: '#3a2e24', water: '#4c7aa3', road: '#7e5236', border: '#8c3b5e', halo: 'rgba(247,240,222,0.9)', glyph: '#6b5843', assets: 'parchment',
    },
    atlas: {
      label: '地図帳',
      deep: [44, 98, 150], shallow: [126, 182, 220], glow: [196, 230, 246], ripple: [86, 142, 190], coast: [34, 62, 92],
      beach: [246, 232, 182],
      ramp: [[0, [164, 204, 136]], [0.2, [192, 216, 146]], [0.42, [220, 204, 144]], [0.62, [194, 158, 110]], [0.82, [158, 122, 94]], [0.94, [250, 250, 250]]],
      biome: { 1: [96, 156, 90], 2: [238, 212, 150], 3: [118, 156, 118], 4: [252, 252, 252], 5: [56, 132, 76], 6: [204, 208, 136], 7: [176, 172, 162], 8: [222, 210, 124], 9: [96, 86, 80] },
      paper: 0, ink: '#1f2a30', water: '#2f6fa8', road: '#a8432c', border: '#7a2f6b', halo: 'rgba(255,255,255,0.88)', glyph: '#6a4f37', assets: 'atlas',
    },
    mono: {
      label: '墨絵',
      deep: [232, 228, 218], shallow: [242, 238, 229], glow: [250, 247, 240], ripple: [160, 150, 132], coast: [38, 33, 28],
      beach: [250, 247, 240],
      ramp: [[0, [252, 249, 242]], [0.5, [240, 236, 226]], [0.8, [222, 216, 204]], [0.95, [252, 250, 246]]],
      biome: { 1: [232, 232, 222], 2: [250, 245, 232], 3: [232, 232, 224], 4: [255, 255, 255], 5: [220, 224, 212], 6: [244, 240, 228], 7: [228, 226, 220], 8: [240, 236, 222], 9: [210, 206, 200] },
      paper: 3, ink: '#2b2520', water: '#3c3a38', road: '#3b3330', border: '#5a4a46', halo: 'rgba(252,249,242,0.92)', glyph: '#3b342e', assets: 'mono',
    },
    night: {
      label: '夜（暗い海）',
      deep: [22, 34, 52], shallow: [44, 70, 96], glow: [86, 120, 150], ripple: [70, 100, 130], coast: [12, 14, 18],
      beach: [168, 160, 136],
      ramp: [[0, [126, 140, 112]], [0.25, [140, 146, 112]], [0.5, [150, 136, 108]], [0.75, [128, 112, 94]], [0.94, [226, 230, 236]]],
      biome: { 1: [84, 112, 80], 2: [176, 160, 120], 3: [86, 104, 90], 4: [220, 226, 234], 5: [60, 96, 66], 6: [146, 140, 104], 7: [134, 132, 126], 8: [156, 150, 100], 9: [70, 64, 60] },
      paper: 3, ink: '#f2ead8', water: '#9cc4e8', road: '#d8b080', border: '#e08ab0', halo: 'rgba(20,24,30,0.78)', glyph: '#e8dcc8', assets: 'atlas',
    },
  };

  // ───── 乱数・ノイズ ─────
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // 描画用の高速な値ノイズ（0〜1）
  const PERM = new Uint8Array(512);
  (function () {
    const r = mulberry32(20240611);
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  })();
  function vnoise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const X = xi & 255;
    const Y = yi & 255;
    const a = PERM[PERM[X] + Y];
    const b = PERM[PERM[X + 1] + Y];
    const c = PERM[PERM[X] + Y + 1];
    const d = PERM[PERM[X + 1] + Y + 1];
    const ab = a + (b - a) * u;
    const cd = c + (d - c) * u;
    return (ab + (cd - ab) * v) / 255;
  }

  function makeNoise(seed) {
    const smooth = (t) => t * t * (3 - 2 * t);
    function value(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const fx = smooth(x - xi);
      const fy = smooth(y - yi);
      const a = hash2(xi, yi, seed);
      const b = hash2(xi + 1, yi, seed);
      const c = hash2(xi, yi + 1, seed);
      const d = hash2(xi + 1, yi + 1, seed);
      return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    }
    return function fbm(x, y, oct) {
      let sum = 0;
      let amp = 0.5;
      let f = 1;
      let norm = 0;
      for (let o = 0; o < (oct || 5); o++) {
        sum += value(x * f, y * f) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2.03;
      }
      return sum / norm;
    };
  }

  const PRESETS = {
    world: { label: '世界地図（いくつもの大陸）', world: true, freq: 3.4, land: 0.3, size: 'w' },
    continent: { label: '大陸', freq: 3.2, falloff: 1.25, land: 0.42 },
    islands: { label: '群島', freq: 6, falloff: 0.55, land: 0.3 },
    island: { label: 'ひとつの島', freq: 3.8, falloff: 2.2, land: 0.3 },
    archipelago: { label: '多島海', freq: 9, falloff: 0.4, land: 0.24 },
    coast: { label: '海岸線', freq: 3.5, falloff: 0, land: 0.55, gradient: true },
    lake: { label: '内海のある大地', freq: 3.6, falloff: -1.1, land: 0.68 },
    sea: { label: '白紙（海）', blank: -0.4 },
    land: { label: '白紙（陸）', blank: 0.15 },
  };

  /**
   * 世界地図：大陸の「核」をいくつか置き、ゆがめたノイズで海岸線を作る。
   * 左右の端は海にして（地図の端で大陸が切れないように）、極地は海にする（氷は描画で）。
   */
  function generateWorld(gw, gh, opts, preset) {
    const seed = (opts.seed >>> 0) || 1;
    const rnd = mulberry32(seed + 4049);
    const fbm = makeNoise(seed);
    const warp = makeNoise(seed + 7919);
    const H = new Float32Array(gw * gh);
    const aspect = gw / gh;
    const n = 4 + Math.floor(rnd() * 4);
    const centers = [];
    const rad = (q) => Math.max(q.rx * aspect, q.ry);
    for (let i = 0; i < n * 120 && centers.length < n; i++) {
      const c = { x: 0.11 + rnd() * 0.78, y: 0.2 + rnd() * 0.6, rx: 0.05 + rnd() * 0.07, ry: 0.08 + rnd() * 0.1 };
      // 大陸どうしが重ならないよう、大きさに合わせて離す（別々の大陸になるように）
      if (centers.some((q) => Math.hypot((q.x - c.x) * aspect, q.y - c.y) < (rad(q) + rad(c)) * 1.3 + 0.05)) continue;
      centers.push(c);
    }
    const cores = [];
    // 1つの大陸を2〜4個のふくらみで作り、腕や半島のある形にする
    centers.forEach((c) => {
      const lobes = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < lobes; k++) {
        const a = rnd() * Math.PI * 2;
        const off = k ? 0.45 + rnd() * 0.45 : 0;
        cores.push({
          x: c.x + Math.cos(a) * c.rx * off, y: c.y + Math.sin(a) * c.ry * off,
          rx: c.rx * (k ? 0.45 + rnd() * 0.35 : 0.85), ry: c.ry * (k ? 0.45 + rnd() * 0.35 : 0.85), a: rnd() * Math.PI, k: k ? 0.75 + rnd() * 0.25 : 0.95,
        });
      }
    });
    // 小さな島々の核
    const isles = 5 + Math.floor(rnd() * 6);
    for (let i = 0; i < isles; i++) cores.push({ x: 0.08 + rnd() * 0.84, y: 0.15 + rnd() * 0.7, rx: 0.015 + rnd() * 0.03, ry: 0.015 + rnd() * 0.035, a: rnd() * Math.PI, k: 0.6 + rnd() * 0.3 });
    const freq = preset.freq * (opts.roughness || 1);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const nx = x / gw;
        const ny = y / gh;
        const wx = (warp(nx * 3, ny * 3, 3) - 0.5) * 0.26 + (warp(nx * 11 + 2, ny * 11, 2) - 0.5) * 0.04;
        const wy = (warp(nx * 3 + 5.2, ny * 3 + 1.3, 3) - 0.5) * 0.26 + (warp(nx * 11, ny * 11 + 4, 2) - 0.5) * 0.04;
        let core = 0;
        for (const c of cores) {
          const dx = (nx + wx - c.x) * aspect;
          const dy = ny + wy - c.y;
          const ca = Math.cos(c.a);
          const sa = Math.sin(c.a);
          const u = (dx * ca + dy * sa) / (c.rx * aspect);
          const v = (-dx * sa + dy * ca) / c.ry;
          const d = u * u + v * v;
          if (d < 4) core = Math.max(core, c.k * (1 - d / 4));
        }
        // 大陸の核の近くは海岸線を複雑に、離れた所はノイズを弱めて、大陸どうしが陸続きになりにくくする
        let v = core * 0.85 + (fbm((nx + wx) * freq * aspect, (ny + wy) * freq, 6) - 0.5) * (0.66 + core * 0.95);
        // 左右の端と極地は海に寄せる
        const ex = Math.min(nx, 1 - nx);
        if (ex < 0.05) v -= (0.05 - ex) * 6;
        const lat = Math.abs(ny - 0.5) * 2;
        if (lat > 0.84) v -= (lat - 0.84) * 3;
        H[y * gw + x] = v;
      }
    }
    return H;
  }

  /** 地形を生成する（Float32Array、-1〜1） */
  function generate(gw, gh, opts) {
    opts = opts || {};
    const preset = PRESETS[opts.preset || 'continent'] || PRESETS.continent;
    let H = new Float32Array(gw * gh);
    if (preset.blank != null) { H.fill(preset.blank); return H; }
    if (preset.world) {
      H = generateWorld(gw, gh, opts, preset);
      return normalizeHeights(H, gw, gh, opts.land != null ? opts.land : preset.land, true);
    }
    const seed = (opts.seed >>> 0) || 1;
    const fbm = makeNoise(seed);
    const warp = makeNoise(seed + 7919);
    const aspect = gw / gh;
    const freq = preset.freq * (opts.roughness || 1);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const nx = x / gw;
        const ny = y / gh;
        const wx = (warp(nx * 2, ny * 2, 3) - 0.5) * 0.35;
        const wy = (warp(nx * 2 + 5.2, ny * 2 + 1.3, 3) - 0.5) * 0.35;
        let v = fbm((nx + wx) * freq * aspect, (ny + wy) * freq, 6);
        const dx = (nx - 0.5) * 2;
        const dy = (ny - 0.5) * 2;
        const d = Math.sqrt(dx * dx * 0.85 + dy * dy);
        if (preset.gradient) v += (0.5 - nx) * 0.9;
        else v -= Math.pow(d, 2) * preset.falloff * 0.5;
        if (!preset.gradient) {
          const e = Math.min(nx, ny, 1 - nx, 1 - ny);
          if (e < 0.06) v -= (0.06 - e) * 4;
        }
        H[y * gw + x] = v;
      }
    }
    return normalizeHeights(H, gw, gh, opts.land != null ? opts.land : preset.land, !preset.gradient);
  }

  /** 陸の割合に合わせて海面を決め、-1〜1 にそろえる。edges＝外周1〜2マスを海にする */
  function normalizeHeights(H, gw, gh, landRatio, edges) {
    const sorted = Array.from(H).sort((a, b) => a - b);
    const t = sorted[Math.floor((1 - landRatio) * (sorted.length - 1))];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    for (let i = 0; i < H.length; i++) {
      const v = H[i];
      H[i] = v >= t ? Math.pow((v - t) / (max - t || 1), 1.3) : -Math.pow((t - v) / (t - min || 1), 0.7);
    }
    if (edges) {
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const e = Math.min(x, y, gw - 1 - x, gh - 1 - y);
          if (e < 2) H[y * gw + x] = Math.min(H[y * gw + x], -0.2);
        }
      }
    }
    return H;
  }

  /** 高さと乱数から地面の種類を自動で塗る */
  function autoBiome(H, gw, gh, seed, climate) {
    const B = new Uint8Array(gw * gh);
    const moist = makeNoise(((seed >>> 0) || 1) + 104729);
    if (climate === 'world') return worldBiome(H, gw, gh, moist, B);
    for (let y = 0; y < gh; y++) {
      const lat = Math.abs(y / gh - 0.5) * 2;
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const h = H[i];
        if (h <= 0) continue;
        const m = moist(x / gw * 4, y / gh * 4, 4);
        const temp = 1 - lat * 0.9 - h * 0.6;
        let b = 0;
        if (temp < 0.16 || h > 0.86) b = 4;
        else if (h > 0.62) b = 7;
        else if (m > 0.6 && h < 0.12) b = 3;
        else if (m > 0.53) b = temp > 0.72 ? 5 : 1;
        else if (m < 0.36 && temp > 0.55) b = 2;
        else if (m < 0.42) b = 6;
        B[i] = b;
      }
    }
    return B;
  }

  /**
   * 世界地図の気候帯：赤道は密林、その少し外は乾いた砂漠の帯、中緯度は草原と森、
   * 高緯度は針葉樹林、その先はツンドラ（荒れ地）と雪原。海から遠い内陸は乾きやすい。
   */
  function worldBiome(H, gw, gh, moist, B) {
    // 海からの距離（内陸ほど乾く）を粗く求める
    const dist = new Float32Array(gw * gh).fill(1e9);
    const q = [];
    for (let i = 0; i < H.length; i++) if (H[i] <= 0) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % gw;
      const y = (i / gw) | 0;
      const d = dist[i] + 1;
      if (x > 0 && dist[i - 1] > d) { dist[i - 1] = d; q.push(i - 1); }
      if (x < gw - 1 && dist[i + 1] > d) { dist[i + 1] = d; q.push(i + 1); }
      if (y > 0 && dist[i - gw] > d) { dist[i - gw] = d; q.push(i - gw); }
      if (y < gh - 1 && dist[i + gw] > d) { dist[i + gw] = d; q.push(i + gw); }
    }
    for (let y = 0; y < gh; y++) {
      const latRaw = Math.abs(y / gh - 0.5) * 2;
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const h = H[i];
        if (h <= 0) continue;
        const lat = latRaw + (moist(x / gw * 9 + 3.3, y / gh * 9, 2) - 0.5) * 0.12;
        const inland = Math.min(1, dist[i] / (gw * 0.06));
        const m = moist(x / gw * 5, y / gh * 5, 4) - inland * 0.18;
        let b = 0;
        if (h > 0.8 || lat > 0.82) b = 4; // 雪
        else if (lat > 0.7) b = m > 0.5 ? 1 : 6; // 針葉樹林 か ツンドラ
        else if (h > 0.62) b = 7; // 岩山
        else if (lat < 0.2) b = m > 0.42 ? 5 : (m > 0.32 ? 0 : 2); // 赤道：密林
        else if (lat < 0.42) b = m < 0.5 ? 2 : (m > 0.6 ? 1 : 0); // 亜熱帯の乾燥帯
        else if (m > 0.62 && h < 0.12) b = 3; // 湿地
        else if (m > 0.5) b = 1; // 温帯の森
        else if (m < 0.36) b = 6;
        B[i] = b;
      }
    }
    return B;
  }

  // ───── 描画 ─────
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function ramp(stops, v) {
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return mix(stops[i - 1][1], stops[i][1], t);
      }
    }
    return stops[stops.length - 1][1];
  }

  /** 地面の質感（色を少し変える） */
  /** 拡大しても四角い模様が見えにくいノイズ（向きを変えた2つの値ノイズを重ねる） */
  function tnoise(x, y) {
    const a = vnoise(x, y);
    const b = vnoise(x * 0.866 - y * 0.5 + 17.3, x * 0.5 + y * 0.866 + 5.1);
    const n = ((a + b) * 0.5 - 0.5) * 1.45 + 0.5;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  function texture(b, c, wx, wy) {
    switch (b) {
      case 1: {
        const k = 0.9 + tnoise(wx * 0.35, wy * 0.35) * 0.16;
        return [c[0] * k, c[1] * k, c[2] * k];
      }
      case 2: {
        const s = Math.sin(wx * 0.22 + vnoise(wx * 0.05, wy * 0.05) * 6 + wy * 0.06);
        const g = (hash2(wx | 0, wy | 0, 3) - 0.5) * 6;
        const k = 1 + s * 0.03;
        return [c[0] * k + g, c[1] * k + g, c[2] * k + g];
      }
      case 3: {
        const n = tnoise(wx * 0.18, wy * 0.18);
        if (n > 0.72) return mix(c, [120, 150, 160], 0.45);
        const k = 0.92 + n * 0.12;
        return [c[0] * k, c[1] * k, c[2] * k];
      }
      case 4: {
        const n = vnoise(wx * 0.07, wy * 0.07);
        return mix(c, [214, 224, 236], Math.max(0, n - 0.45) * 0.8);
      }
      case 5: {
        const k = 0.86 + tnoise(wx * 0.45, wy * 0.45) * 0.2;
        return [c[0] * k, c[1] * k, c[2] * k];
      }
      case 6: {
        const k = 0.94 + vnoise(wx * 0.04, wy * 0.3) * 0.1;
        return [c[0] * k, c[1] * k, c[2] * k];
      }
      case 7: {
        const g = (hash2(wx * 2 | 0, wy * 2 | 0, 7) - 0.5) * 10;
        const k = 0.9 + tnoise(wx * 0.4, wy * 0.4) * 0.16;
        return [c[0] * k + g, c[1] * k + g, c[2] * k + g];
      }
      case 8: {
        const ox = wx + vnoise(wy * 0.03, 1) * 10;
        const oy = wy + vnoise(wx * 0.03, 2) * 10;
        const r = hash2(Math.floor(ox / 16), Math.floor(oy / 12), 8);
        const base = r < 0.33 ? c : r < 0.66 ? [c[0] * 0.92, c[1] * 1.02, c[2] * 0.85] : [c[0] * 1.04, c[1] * 0.98, c[2] * 0.9];
        if (((ox % 16) + 16) % 16 < 0.7 || ((oy % 12) + 12) % 12 < 0.7) return mix(base, [110, 96, 70], 0.4);
        const stripe = Math.sin((r < 0.5 ? ox : oy) * 1.6) > 0.6 ? 0.93 : 1;
        return [base[0] * stripe, base[1] * stripe, base[2] * stripe];
      }
      case 9: {
        if (hash2(wx | 0, wy | 0, 9) > 0.985) return [200, 90, 50];
        const k = 0.9 + vnoise(wx * 0.3, wy * 0.3) * 0.2;
        return [c[0] * k, c[1] * k, c[2] * k];
      }
      default: {
        const k = 0.97 + vnoise(wx * 0.2, wy * 0.2) * 0.06;
        return [c[0] * k, c[1] * k, c[2] * k];
      }
    }
  }

  /**
   * 地形を ImageData に描く。
   * img は「世界座標 × res」の大きさ。rx0..ry1 は画像のピクセル範囲（その部分だけ描き直せる）。
   */
  /**
   * 地形を描く。mask（同じ大きさの ImageData）を渡すと、陸を不透明・水を透明にした
   * 「陸地マスク」も書き込む（川を海岸で切るのに使う。縁はなめらかに）。
   */
  /**
   * 海の各マスから一番近い陸までの距離（マス単位）。なめらかに補間できるよう、
   * 地形が変わったときだけ計算し直す（高さの合計で変化を見分ける）。
   */
  const coastCache = new WeakMap();
  function coastDistance(H, gw, gh) {
    let sum = 0;
    for (let i = 0; i < H.length; i++) sum += H[i] * ((i % 7) + 1);
    const hit = coastCache.get(H);
    if (hit && hit.sum === sum) return hit.d;
    const d = new Float32Array(gw * gh);
    const INF = 1e6;
    for (let i = 0; i < d.length; i++) d[i] = H[i] > 0 ? 0 : INF;
    // 2回の走査で近似ユークリッド距離（3-4 チャンファー）
    const a = 1;
    const b = 1.4142;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + a);
        if (y > 0) {
          v = Math.min(v, d[i - gw] + a);
          if (x > 0) v = Math.min(v, d[i - gw - 1] + b);
          if (x < gw - 1) v = Math.min(v, d[i - gw + 1] + b);
        }
        d[i] = v;
      }
    }
    for (let y = gh - 1; y >= 0; y--) {
      for (let x = gw - 1; x >= 0; x--) {
        const i = y * gw + x;
        let v = d[i];
        if (x < gw - 1) v = Math.min(v, d[i + 1] + a);
        if (y < gh - 1) {
          v = Math.min(v, d[i + gw] + a);
          if (x < gw - 1) v = Math.min(v, d[i + gw + 1] + b);
          if (x > 0) v = Math.min(v, d[i + gw - 1] + b);
        }
        d[i] = v;
      }
    }
    coastCache.set(H, { sum, d });
    return d;
  }

  function renderTerrain(map, H, B, img, rx0, ry0, rx1, ry1, res, mask, offX, offY) {
    res = res || 1;
    // offX, offY：画像の左上がワールド座標のどこか（拡大表示用の細かい部分画像）
    offX = offX || 0;
    offY = offY || 0;
    const md = mask ? mask.data : null;
    const pal = PALETTES[(map.style && map.style.palette) || 'parchment'] || PALETTES.parchment;
    const shade = !map.style || map.style.hillshade !== false;
    const ripples = !map.style || map.style.ripples !== false;
    const ice = !!(map.style && map.style.ice);
    const CD = coastDistance(H, map.gw, map.gh);
    const { gw, gh, cell } = map;
    const W = img.width;
    const data = img.data;
    rx0 = Math.max(0, rx0 | 0); ry0 = Math.max(0, ry0 | 0);
    rx1 = Math.min(W, Math.ceil(rx1)); ry1 = Math.min(img.height, Math.ceil(ry1));
    for (let py = ry0; py < ry1; py++) {
      const wy = (py + 0.5) / res + offY;
      const gy = wy / cell - 0.5;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const ya = Math.max(0, Math.min(gh - 1, y0));
      const yb = Math.max(0, Math.min(gh - 1, y0 + 1));
      for (let px = rx0; px < rx1; px++) {
        const wx = (px + 0.5) / res + offX;
        const gx = wx / cell - 0.5;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const xa = Math.max(0, Math.min(gw - 1, x0));
        const xb = Math.max(0, Math.min(gw - 1, x0 + 1));
        const h00 = H[ya * gw + xa];
        const h10 = H[ya * gw + xb];
        const h01 = H[yb * gw + xa];
        const h11 = H[yb * gw + xb];
        const top = h00 + (h10 - h00) * fx;
        const bot = h01 + (h11 - h01) * fx;
        let h = top + (bot - top) * fy;
        const dhdx = ((h10 - h00) * (1 - fy) + (h11 - h01) * fy) / cell;
        const dhdy = (bot - top) / cell;
        const gm = Math.sqrt(dhdx * dhdx + dhdy * dhdy) + 1e-6;
        // 海岸線の細かな凹凸（平らな所では付けない）
        const amp = Math.min(0.05, gm * 3.5);
        if (amp > 0.002) h += ((vnoise(wx * 0.09, wy * 0.09) * 0.65 + vnoise(wx * 0.31, wy * 0.31) * 0.35) - 0.5) * amp;
        const dist = gm < 0.0004 ? 99 : Math.abs(h) / gm;
        let c;
        if (h < 0) {
          // 深さ：沖ほど深い色に。海岸からの距離（なめらかに補間）も使い、沖の浅い所が雲のように白く浮かないようにする
          const c00 = CD[ya * gw + xa];
          const c10 = CD[ya * gw + xb];
          const c01 = CD[yb * gw + xa];
          const c11 = CD[yb * gw + xb];
          const cd = ((c00 + (c10 - c00) * fx) * (1 - fy) + (c01 + (c11 - c01) * fx) * fy) * cell;
          const dD = Math.min(1, Math.max(0, cd - 2) / 46);
          const dH = Math.min(1, -h / 0.45);
          let depth = Math.max(dD * 0.85, dH);
          depth = depth * depth * (3 - 2 * depth);
          c = mix(pal.shallow, pal.deep, depth);
          c = mix(c, pal.glow, Math.exp(-dist / 5) * 0.45);
          if (ripples) {
            for (let k = 0; k < 3; k++) {
              const a = 1 - Math.abs(dist - (5 + k * 5.5)) / 0.75;
              if (a > 0) c = mix(c, pal.ripple, a * (0.5 - k * 0.13));
            }
            // 沖の細い横波（古地図の版画のような海の模様）
            if (cd > 20) {
              const w = Math.sin(wy * 0.62 + Math.sin(wx * 0.045 + wy * 0.01) * 2.2 + vnoise(wx * 0.03, wy * 0.03) * 5);
              const f = Math.min(1, (cd - 20) / 30) * Math.max(0, (w - 0.93) / 0.07) * (vnoise(wx * 0.012 + 9, wy * 0.04) > 0.45 ? 1 : 0);
              if (f > 0) c = mix(c, pal.ripple, f * 0.22);
            }
          }
          const n = (vnoise(wx * 0.02, wy * 0.02) - 0.5) * 5 + (vnoise(wx * 0.11, wy * 0.11) - 0.5) * 2;
          c = [c[0] + n, c[1] + n, c[2] + n];
        } else {
          c = ramp(pal.ramp, h);
          // 地面の境目を、マス目の角ばりではなく、ゆるやかに波打つ形にする（細かなざらつきも少し残す）
          const jx = (vnoise(wx * 0.11 + 13.1, wy * 0.11) - 0.5) * 1.7 + (hash2(px, py, 1337) - 0.5) * 0.35;
          const jy = (vnoise(wx * 0.11, wy * 0.11 + 7.7) - 0.5) * 1.7 + (hash2(py, px, 1338) - 0.5) * 0.35;
          const bxi = Math.max(0, Math.min(gw - 1, Math.round(gx + jx)));
          const byi = Math.max(0, Math.min(gh - 1, Math.round(gy + jy)));
          const b = B ? B[byi * gw + bxi] : 0;
          if (b && pal.biome[b] && h < 0.82) c = mix(c, pal.biome[b], b === 4 ? 0.88 : 0.68);
          c = texture(b, c, wx, wy);
          if (dist < 2.4 && h < 0.25) c = mix(c, pal.beach, (1 - dist / 2.4) * 0.55);
          // 手描きの水彩のような、ゆるやかな色むら＋海岸の内側をわずかに濃く
          const wc = 1 + (vnoise(wx * 0.008 + 17, wy * 0.008) - 0.5) * 0.07;
          const rim = dist < 9 && dist > 1.5 ? 1 - (1 - (dist - 1.5) / 7.5) * 0.06 : 1;
          c = [c[0] * wc * rim, c[1] * wc * rim, c[2] * wc * rim];
          if (shade) {
            const s = 1 + (-dhdx - dhdy) * 0.7071 * 9;
            const k = Math.max(0.6, Math.min(1.3, s));
            c = [c[0] * k, c[1] * k, c[2] * k];
          }
        }
        if (dist < 0.95) c = mix(c, pal.coast, Math.max(0, 1 - dist / 0.95) * 0.92);
        // 極地の氷（世界地図）
        if (ice) {
          const lat = Math.abs(wy / (gh * cell) - 0.5) * 2;
          const edge = 0.86 + (vnoise(wx * 0.009 + 5, 1.7) - 0.5) * 0.12 + (vnoise(wx * 0.03, wy * 0.05) - 0.5) * 0.06 + (vnoise(wx * 0.11, wy * 0.13) - 0.5) * 0.02;
          const t = (lat - edge) * gh * cell * 0.5; // 氷の縁からの距離（ワールド単位、内側が正）
          if (t > -1.2) {
            let ic = mix(pal.ice || [238, 243, 246], [255, 255, 255], 0.3 + vnoise(wx * 0.05, wy * 0.05) * 0.4);
            // ひび割れ
            const cr = Math.abs(vnoise(wx * 0.06 + 3, wy * 0.06) - 0.5);
            if (cr < 0.012) ic = mix(ic, pal.iceShade || [178, 196, 210], 0.6);
            ic = mix(ic, pal.iceShade || [178, 196, 210], Math.max(0, 1 - t / 5) * 0.35);
            const a = Math.max(0, Math.min(1, (t + 1.2) / 1.2));
            c = mix(c, ic, a);
            if (Math.abs(t) < 0.9) c = mix(c, pal.coast, (1 - Math.abs(t) / 0.9) * 0.75);
          }
        }
        if (pal.paper) {
          const n = (hash2(px, py, 99) - 0.5) * pal.paper * 2;
          c = [c[0] + n, c[1] + n, c[2] + n];
        }
        const o = (py * W + px) * 4;
        if (md) {
          // 海岸線からの符号つき距離（陸が正）を1画素ぶんの幅でなめらかにする
          const sd = gm < 0.0004 ? (h > 0 ? 9 : -9) : h / gm;
          const a = 0.5 + sd * res;
          md[o] = 255; md[o + 1] = 255; md[o + 2] = 255;
          md[o + 3] = a <= 0 ? 0 : a >= 1 ? 255 : a * 255;
        }
        data[o] = c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0];
        data[o + 1] = c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1];
        data[o + 2] = c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2];
        data[o + 3] = 255;
      }
    }
  }

  function sampleH(H, gw, gh, cell, wx, wy) {
    const x = Math.max(0, Math.min(gw - 1, Math.round(wx / cell - 0.5)));
    const y = Math.max(0, Math.min(gh - 1, Math.round(wy / cell - 0.5)));
    return H[y * gw + x];
  }
  function sampleB(B, gw, gh, cell, wx, wy) {
    const x = Math.max(0, Math.min(gw - 1, Math.round(wx / cell - 0.5)));
    const y = Math.max(0, Math.min(gh - 1, Math.round(wy / cell - 0.5)));
    return B[y * gw + x];
  }

  let stampSeq = 0;
  function sid() {
    stampSeq = (stampSeq + 1) % 1e6;
    return 's' + Date.now().toString(36) + stampSeq.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  /** 地形から山・丘・森などの素材を自動で並べる */
  function autoStamps(map, H, B, seed) {
    const { gw, gh, cell } = map;
    const W = gw * cell;
    const Hpx = gh * cell;
    const rnd = mulberry32(((seed >>> 0) || 1) + 31337);
    const out = [];
    // 川の上には木や山を置かない（川が隠れないように）
    const wet = new Uint8Array(gw * gh);
    (map.lines || []).forEach((ln) => {
      if (ln.kind !== 'river' && ln.kind !== 'stream') return;
      for (let i = 0; i + 1 < ln.points.length; i++) {
        const [ax, ay] = ln.points[i];
        const [bx, by] = ln.points[i + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell * 0.5)));
        for (let k = 0; k <= steps; k++) {
          const cx = Math.floor((ax + (bx - ax) * k / steps) / cell);
          const cy = Math.floor((ay + (by - ay) * k / steps) / cell);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x >= 0 && y >= 0 && x < gw && y < gh) wet[y * gw + x] = 1;
          }
        }
      }
    });
    const onRiver = (x, y) => wet[Math.max(0, Math.min(gh - 1, Math.floor(y / cell))) * gw + Math.max(0, Math.min(gw - 1, Math.floor(x / cell)))] === 1;
    const put = (a, x, y, s) => { if (onRiver(x, y)) return; out.push({ id: sid(), a, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, s: Math.round(s * 100) / 100, r: 0, f: rnd() < 0.5, v: Math.floor(rnd() * 8) }); };
    // 山：高い所から順に、大きさに合わせて間隔をあけて置く（主峰ほど大きく、裾へ向かって小さく）
    const placed = [];
    const GS = 40;
    const grid = new Map();
    const near = (x, y, fn) => {
      const gx = Math.floor(x / GS);
      const gy = Math.floor(y / GS);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const list = grid.get((gx + dx) + ',' + (gy + dy));
        if (list) for (const q of list) if (fn(q)) return true;
      }
      return false;
    };
    const addPlaced = (q) => {
      const k = Math.floor(q.x / GS) + ',' + Math.floor(q.y / GS);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(q);
      placed.push(q);
    };
    const cs = 6;
    const cand = [];
    for (let y = cs; y < Hpx - 6; y += cs) {
      for (let x = cs / 2; x < W - 6; x += cs) {
        const jx = x + (rnd() - 0.5) * cs;
        const jy = y + (rnd() - 0.5) * cs;
        const h = sampleH(H, gw, gh, cell, jx, jy);
        if (h <= 0.3) continue;
        // 尾根らしさ：周りより高い所ほど山を置きやすく、谷や台地の中ほどは間をあける
        const around = (sampleH(H, gw, gh, cell, jx - 14, jy) + sampleH(H, gw, gh, cell, jx + 14, jy) + sampleH(H, gw, gh, cell, jx, jy - 14) + sampleH(H, gw, gh, cell, jx, jy + 14)) / 4;
        const ridge = h - around;
        const gap = vnoise(jx * 0.018 + 41.3, jy * 0.018 + 7.9);
        cand.push({ x: jx, y: jy, h, ridge, gap, o: h + ridge * 2 + (rnd() - 0.5) * 0.05 });
      }
    }
    cand.sort((a, b) => b.o - a.o);
    for (const c of cand) {
      if (c.h > 0.42) {
        // 谷筋や、ところどころ（ゆるやかなノイズで決める）は山を置かず、連なりの間に切れ目を作る
        if (c.h < 0.72 && (c.ridge < -0.015 || c.gap < 0.32) && rnd() < 0.75) continue;
        const t = Math.min(1, (c.h - 0.42) / 0.45);
        let sc = 0.75 + t * 1.15 + Math.max(0, c.ridge) * 3 + rnd() * 0.15;
        // 小さな島などでは、裾が海にはみ出さない大きさまで縮める
        const fits = (k) => {
          const w = 15 * k;
          const pts = [[-w, 0], [w, 0], [-w * 0.55, -w * 0.5], [w * 0.55, -w * 0.5], [0, -w * 0.9], [0, 2]];
          return pts.every(([dx, dy]) => sampleH(H, gw, gh, cell, c.x + dx, c.y + dy) > 0.03);
        };
        while (sc > 0.6 && !fits(sc)) sc *= 0.86;
        if (sc <= 0.6 && !fits(sc)) continue;
        const r = 14 * sc;
        // 横方向は重なりを少なく、縦方向（手前と奥）は少し重ねて奥行きを出す
        if (near(c.x, c.y, (q) => Math.hypot(c.x - q.x, (c.y - q.y) * 1.45) < (r + q.r) * 0.74)) continue;
        const snowy = c.h > 0.74;
        const a = snowy ? (rnd() < 0.55 ? 'mountain-snow' : 'mountain-tall') : (c.h > 0.62 && rnd() < 0.18 ? 'mountain-snow' : 'mountain');
        put(a, c.x, c.y, sc);
        addPlaced({ x: c.x, y: c.y, r, kind: 'm' });
      } else if (c.h <= 0.42 && rnd() < 0.35) {
        // 裾野の丘
        const sc = 0.8 + rnd() * 0.35;
        if (sampleH(H, gw, gh, cell, c.x - 13 * sc, c.y) <= 0.03 || sampleH(H, gw, gh, cell, c.x + 13 * sc, c.y) <= 0.03) continue;
        const r = 12 * sc;
        if (near(c.x, c.y, (q) => Math.hypot(c.x - q.x, (c.y - q.y) * 1.5) < (r + q.r) * (q.kind === 'm' ? 0.7 : 0.95))) continue;
        put('hill', c.x, c.y, sc);
        addPlaced({ x: c.x, y: c.y, r, kind: 'h' });
      }
    }
    const ts = 5.5;
    for (let y = ts; y < Hpx - 2; y += ts * 0.85) {
      for (let x = ts / 2; x < W - 2; x += ts) {
        const jx = x + (rnd() - 0.5) * ts * 0.9;
        const jy = y + (rnd() - 0.5) * ts * 0.7;
        const h = sampleH(H, gw, gh, cell, jx, jy);
        if (h <= 0.02 || h > 0.42) continue;
        const b = B ? sampleB(B, gw, gh, cell, jx, jy) : 0;
        const lat = Math.abs(jy / Hpx - 0.5) * 2;
        if (b === 1 && rnd() < 0.72) put(lat > 0.55 || rnd() < 0.3 ? 'tree-conifer' : 'tree-round', jx, jy, 0.85 + rnd() * 0.3);
        else if (b === 5 && rnd() < 0.75) put(rnd() < 0.82 ? 'tree-jungle' : 'tree-palm', jx, jy, 0.85 + rnd() * 0.3);
        else if (b === 4 && rnd() < 0.06) put('tree-snow', jx, jy, 0.9 + rnd() * 0.2);
        else if (b === 2 && rnd() < 0.05) put('dune', jx, jy, 0.8 + rnd() * 0.4);
        else if (b === 3 && rnd() < 0.2) put('reeds', jx, jy, 0.9 + rnd() * 0.2);
        else if (b === 7 && rnd() < 0.1) put('rocks', jx, jy, 0.8 + rnd() * 0.3);
        else if (b === 0 && rnd() < 0.012) put('tree-round', jx, jy, 0.9);
      }
    }
    // 海の飾り：沖にまばらな波の印と、船を1〜2隻
    const deepEnough = (x, y, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => sampleH(H, gw, gh, cell, x + dx, y + dy) < -0.12);
    const ws = 105;
    for (let y = ws * 0.6; y < Hpx - 20; y += ws * 0.75) {
      for (let x = ws * 0.5; x < W - 30; x += ws) {
        const jx = x + (rnd() - 0.5) * ws * 0.7;
        const jy = y + (rnd() - 0.5) * ws * 0.5;
        if (jy < 70 && jx > W * 0.3 && jx < W * 0.7) continue; // 題名の帯のあたりは空ける
        if (rnd() < 0.5 && deepEnough(jx, jy, 34)) put('wave', jx, jy, 0.9 + rnd() * 0.35);
      }
    }
    let ships = 0;
    for (let i = 0; i < 60 && ships < 2; i++) {
      const x = 60 + rnd() * (W - 120);
      const y = 90 + rnd() * (Hpx - 160);
      const h = sampleH(H, gw, gh, cell, x, y);
      if (h < -0.1 && h > -0.55 && deepEnough(x, y, 22) && !out.some((q) => q.a === 'ship' && Math.hypot(q.x - x, q.y - y) < W * 0.3)) {
        put('ship', x, y, 1.1 + rnd() * 0.2);
        ships++;
      }
    }
    out.sort((a, b) => a.y - b.y);
    return out;
  }

  // ───── 保存形式 ─────
  function bytesToB64(bytes) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
  }
  function b64ToBytes(b64) {
    const s = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function encodeHeights(H) {
    const q = new Int8Array(H.length);
    for (let i = 0; i < H.length; i++) {
      // 陸と海の区別（符号）が丸めで失われないようにする
      let v = Math.round(H[i] * 127);
      if (v === 0) v = H[i] >= 0 ? 1 : -1;
      q[i] = Math.max(-127, Math.min(127, v));
    }
    return bytesToB64(new Uint8Array(q.buffer));
  }
  function decodeHeights(b64, n) {
    const bytes = b64ToBytes(b64);
    const q = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
    const H = new Float32Array(n);
    for (let i = 0; i < n && i < q.length; i++) H[i] = q[i] / 127;
    return H;
  }
  function encodeBiomes(B) { return bytesToB64(B); }
  function decodeBiomes(b64, n) {
    const bytes = b64ToBytes(b64);
    const B = new Uint8Array(n);
    B.set(bytes.subarray(0, n));
    return B;
  }

  const SIZES = { s: [240, 156], m: [300, 195], l: [380, 247], w: [420, 210] };

  function defaultStyle(palette) {
    return {
      palette: palette || 'parchment', hillshade: true, ripples: true, grid: 'none', gridSize: 12, gridOpacity: 0.25,
      kmPerCell: 4, scale: true, title: 'banner', frame: 'simple', vignette: true, texture: true,
    };
  }

  function defaultLayers() {
    return { terrain: {}, stamps: {}, paths: {}, areas: {}, labels: {}, deco: {} };
  }

  /** 地図データの雛形 */
  function newMap(name, opts) {
    opts = opts || {};
    const pr = PRESETS[opts.preset || 'continent'] || PRESETS.continent;
    const size = SIZES[opts.size || pr.size || 'm'] || SIZES.m;
    const gw = size[0];
    const gh = size[1];
    const cell = 4;
    const seed = opts.seed || Math.floor(Math.random() * 1e9);
    const H = generate(gw, gh, { preset: opts.preset || 'continent', seed, land: opts.land });
    const B = opts.biome === false ? new Uint8Array(gw * gh) : autoBiome(H, gw, gh, seed, pr.world ? 'world' : null);
    const style = defaultStyle(opts.palette);
    if (pr.world) {
      // 世界地図：経緯線・極地の氷・地球規模の縮尺（横幅＝一周およそ4万km）
      style.grid = 'latlon';
      style.gridOpacity = 0.35;
      style.ice = true;
      style.kmPerCell = Math.round(40000 / gw);
      style.world = true;
    }
    const map = {
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || '新しい地図', gw, gh, cell, seed,
      height: encodeHeights(H), biome: encodeBiomes(B),
      stamps: [], lines: [], areas: [], labels: [],
      style, layers: defaultLayers(),
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    if (opts.rivers !== false && !PRESETS[opts.preset || 'continent'].blank) map.lines = autoRivers(map, H, seed);
    // 町と道（国の地図）／大陸と海の仮の名前（世界地図）
    let towns = null;
    if (opts.towns && !pr.blank && !pr.world) {
      towns = autoSettlements(map, H, B, seed);
      map.lines = map.lines.concat(towns.lines);
    }
    if (opts.names && pr.world) map.labels = autoWorldLabels(map, H, seed);
    // 国（国境・国名・首都）
    let countries = null;
    if (opts.countries && !pr.blank) {
      countries = autoCountries(map, H, B, seed, { count: opts.countryCount || 0, capitals: !towns });
      map.areas = countries.areas;
      map.lines = map.lines.concat(countries.borders);
      // 国名と重なるので、大陸の名前は外し、海の名前だけ残す
      map.labels = map.labels.filter((lb) => lb.style !== 'region').concat(countries.labels);
    }
    if (opts.stamps !== false) map.stamps = autoStamps(map, H, B, seed);
    const placed = (towns ? towns.stamps : []).concat(countries ? countries.stamps : []);
    if (placed.length) {
      // 町や首都の周りの木や山はどける
      const near = (st) => placed.some((t) => Math.hypot(t.x - st.x, t.y - st.y) < 18);
      map.stamps = map.stamps.filter((st) => !near(st)).concat(placed).sort((a, b) => a.y - b.y);
    }
    if (opts.compass !== false) map.stamps.push({ id: sid(), a: 'compass', x: gw * cell - 56, y: 68, s: 1, r: 0, f: false, v: 0 });
    return map;
  }

  // ───── 仮の地名 ─────
  const SYL = ['ア', 'イ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'セ', 'ソ', 'タ', 'テ', 'ト', 'ナ', 'ニ', 'ノ', 'ハ', 'フ', 'ホ', 'マ', 'ミ', 'メ', 'モ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ガ', 'ギ', 'グ', 'ゴ', 'ザ', 'ゼ', 'ダ', 'デ', 'ド', 'バ', 'ベ', 'ボ', 'ヴァ', 'ヴィ', 'ユ', 'ヨ', 'ワ', 'ティ', 'フェ', 'シェ'];
  const END = ['ン', 'ル', 'ス', 'ア', 'ド', 'ラ', 'リア', 'ニア', 'ール', 'ーン', 'ム', 'ト', 'ディア', 'ロス', 'ネ'];
  /** カタカナの空想の地名を作る（同じ地図では重ならない） */
  function makeNamer(seed) {
    const rnd = mulberry32(((seed >>> 0) || 1) + 99991);
    const used = new Set();
    return () => {
      for (let t = 0; t < 40; t++) {
        const n = 1 + Math.floor(rnd() * 2);
        let w = '';
        let prev = '';
        for (let i = 0; i < n; i++) {
          let sy = SYL[Math.floor(rnd() * SYL.length)];
          if (sy === prev) sy = SYL[Math.floor(rnd() * SYL.length)];
          w += sy;
          prev = sy;
        }
        w += END[Math.floor(rnd() * END.length)];
        if (w.length >= 3 && w.length <= 6 && !used.has(w)) { used.add(w); return w; }
      }
      return 'ノルド' + used.size;
    };
  }

  /** 陸のかたまり（4方向でつながる陸）。大きい順に { cells, cx, cy, n } */
  function landMasses(H, gw, gh, minCells) {
    const seen = new Uint8Array(gw * gh);
    const out = [];
    for (let i = 0; i < H.length; i++) {
      if (H[i] <= 0 || seen[i]) continue;
      const st = [i];
      seen[i] = 1;
      let n = 0; let sx = 0; let sy = 0;
      const cells = [];
      while (st.length) {
        const k = st.pop();
        const x = k % gw;
        const y = (k / gw) | 0;
        n++; sx += x; sy += y;
        cells.push(k);
        if (x > 0 && !seen[k - 1] && H[k - 1] > 0) { seen[k - 1] = 1; st.push(k - 1); }
        if (x < gw - 1 && !seen[k + 1] && H[k + 1] > 0) { seen[k + 1] = 1; st.push(k + 1); }
        if (y > 0 && !seen[k - gw] && H[k - gw] > 0) { seen[k - gw] = 1; st.push(k - gw); }
        if (y < gh - 1 && !seen[k + gw] && H[k + gw] > 0) { seen[k + gw] = 1; st.push(k + gw); }
      }
      if (n >= (minCells || 1)) out.push({ cells, n, cx: sx / n, cy: sy / n });
    }
    return out.sort((a, b) => b.n - a.n);
  }

  /**
   * 世界地図の仮の名前：大きな大陸に「〇〇大陸」、広い海に「〇〇海／〇〇洋」。
   * 文字は大陸の中で、なるべく山の少ない所に置く。
   */
  function autoWorldLabels(map, H, seed) {
    const { gw, gh, cell } = map;
    const name = makeNamer(seed);
    const labels = [];
    const masses = landMasses(H, gw, gh, 500).slice(0, 8);
    masses.forEach((m) => {
      // 重心に近く、低めの陸のマスを探す
      let best = null;
      let bs = -Infinity;
      for (let i = 0; i < m.cells.length; i += 7) {
        const k = m.cells[i];
        const x = k % gw;
        const y = (k / gw) | 0;
        const sc = -Math.hypot(x - m.cx, (y - m.cy) * 1.3) - H[k] * 40;
        if (sc > bs) { bs = sc; best = [x, y]; }
      }
      if (!best) return;
      const size = Math.max(18, Math.min(34, Math.sqrt(m.n) * 0.55));
      labels.push({ id: sid(), x: (best[0] + 0.5) * cell, y: (best[1] + 0.5) * cell, text: name() + '大陸', style: 'region', size: Math.round(size), rotation: 0, vertical: false, curve: 0 });
    });
    // 海：陸から遠い所を、互いに離して3つまで
    const CD = coastDistance(H, gw, gh);
    const cand = [];
    for (let y = Math.floor(gh * 0.18); y < gh * 0.82; y += 3) {
      for (let x = Math.floor(gw * 0.06); x < gw * 0.94; x += 3) {
        const k = y * gw + x;
        if (H[k] <= 0) cand.push({ x, y, d: CD[k] });
      }
    }
    cand.sort((a, b) => b.d - a.d);
    const seas = [];
    for (const c of cand) {
      if (seas.length >= 3 || c.d < 12) break;
      if (seas.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < gw * 0.25)) continue;
      seas.push(c);
      labels.push({ id: sid(), x: (c.x + 0.5) * cell, y: (c.y + 0.5) * cell, text: name() + (c.d > 30 ? '洋' : '海'), style: 'sea', size: c.d > 30 ? 24 : 20, rotation: 0, vertical: false, curve: 0 });
    }
    return labels;
  }

  /**
   * 国の地図の町と道：平らで川や海に近い所に、王都・町・村・港を置き、道でつなぐ。
   * 道は山や水を避けて通る（格子の最短経路）。地名は仮のカタカナ。
   */
  function autoSettlements(map, H, B, seed) {
    const { gw, gh, cell } = map;
    const rnd = mulberry32(((seed >>> 0) || 1) + 5381);
    const name = makeNamer(seed + 17);
    const CD = coastDistance(H, gw, gh);
    // 川のマス
    const wet = new Uint8Array(gw * gh);
    (map.lines || []).forEach((ln) => {
      if (ln.kind !== 'river' && ln.kind !== 'stream') return;
      ln.points.forEach(([px, py]) => {
        const x = Math.floor(px / cell);
        const y = Math.floor(py / cell);
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx; const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) wet[yy * gw + xx] = 1;
        }
      });
    });
    const slope = (x, y) => {
      const k = y * gw + x;
      const hx = H[k + 1] - H[k - 1];
      const hy = H[k + gw] - H[k - gw];
      return Math.hypot(hx, hy);
    };
    // 本島（いちばん大きな陸）に置く
    const mass = landMasses(H, gw, gh, 200)[0];
    if (!mass) return { stamps: [], lines: [] };
    const onMain = new Uint8Array(gw * gh);
    mass.cells.forEach((k) => { onMain[k] = 1; });
    const cands = [];
    for (let i = 0; i < mass.cells.length; i += 3) {
      const k = mass.cells[i];
      const x = k % gw;
      const y = (k / gw) | 0;
      if (x < 3 || y < 3 || x > gw - 4 || y > gh - 4) continue;
      const h = H[k];
      if (h < 0.03 || h > 0.42) continue;
      const b = B ? B[k] : 0;
      if (b === 4 || b === 3 || b === 7) continue;
      const sl = slope(x, y);
      const coast = CD[k];
      let score = 1 - sl * 6 + (wet[k] ? 0.8 : 0) + (b === 8 || b === 0 ? 0.3 : 0) - h * 0.6 + rnd() * 0.25;
      cands.push({ x, y, k, score, coastal: false, coast, sl });
    }
    // 海辺（港の候補）：海から 2〜4 マスの陸
    const coastCands = [];
    for (let i = 0; i < mass.cells.length; i += 2) {
      const k = mass.cells[i];
      const x = k % gw;
      const y = (k / gw) | 0;
      if (x < 4 || y < 4 || x > gw - 5 || y > gh - 5) continue;
      if (H[k] < 0.02 || H[k] > 0.25) continue;
      const nearSea = [[3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dy]) => H[(y + dy) * gw + x + dx] <= 0);
      if (nearSea) coastCands.push({ x, y, k, score: 1 - slope(x, y) * 5 + rnd() * 0.3 });
    }
    cands.sort((a, b) => b.score - a.score);
    coastCands.sort((a, b) => b.score - a.score);
    const placed = [];
    const far = (c, d) => placed.every((q) => Math.hypot(q.x - c.x, q.y - c.y) >= d);
    const span = Math.sqrt(mass.n);
    // 王都：点数が高く、本島の中心寄り
    let capital = null;
    let best = -Infinity;
    cands.slice(0, 400).forEach((c) => {
      const s2 = c.score - Math.hypot(c.x - mass.cx, c.y - mass.cy) / span * 1.2;
      if (s2 > best) { best = s2; capital = c; }
    });
    if (!capital) return { stamps: [], lines: [] };
    placed.push(Object.assign({ kind: 'capital' }, capital));
    const port = coastCands.find((c) => far(c, span * 0.25));
    if (port) placed.push(Object.assign({ kind: 'port' }, port));
    const nTowns = Math.max(2, Math.min(5, Math.round(span / 22)));
    for (const c of cands) { if (placed.filter((q) => q.kind === 'town').length >= nTowns) break; if (far(c, span * 0.22)) placed.push(Object.assign({ kind: 'town' }, c)); }
    const nVil = Math.max(3, Math.min(9, Math.round(span / 12)));
    for (const c of cands) { if (placed.filter((q) => q.kind === 'village').length >= nVil) break; if (far(c, span * 0.12)) placed.push(Object.assign({ kind: 'village' }, c)); }

    // 道：格子の上の最短経路（山・急な斜面は高く、水は通れない）
    const costAt = (k) => {
      if (!onMain[k]) return Infinity;
      const h = H[k];
      return 1 + Math.max(0, h - 0.35) * 40 + (h > 0.6 ? 60 : 0) + (B && B[k] === 3 ? 3 : 0);
    };
    const roadCell = new Uint8Array(gw * gh);
    const route = (a, b) => {
      const N = gw * gh;
      const dist = new Float32Array(N).fill(Infinity);
      const prev = new Int32Array(N).fill(-1);
      const open = [a.k];
      dist[a.k] = 0;
      const heur = (k) => Math.hypot((k % gw) - b.x, ((k / gw) | 0) - b.y);
      const pq = [[heur(a.k), a.k]];
      let iter = 0;
      while (pq.length && iter++ < 60000) {
        // 小さな優先度つきキュー（二分ヒープ）
        const top = pq[0];
        const last = pq.pop();
        if (pq.length) {
          pq[0] = last;
          let i = 0;
          for (;;) {
            const l = i * 2 + 1; const r = l + 1; let m = i;
            if (l < pq.length && pq[l][0] < pq[m][0]) m = l;
            if (r < pq.length && pq[r][0] < pq[m][0]) m = r;
            if (m === i) break;
            const t = pq[i]; pq[i] = pq[m]; pq[m] = t; i = m;
          }
        }
        const k = top[1];
        if (k === b.k) break;
        const x = k % gw;
        const y = (k / gw) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (nx < 1 || ny < 1 || nx >= gw - 1 || ny >= gh - 1) continue;
          const nk = ny * gw + nx;
          let c = costAt(nk);
          if (!Number.isFinite(c)) continue;
          if (roadCell[nk]) c *= 0.55; // 既にある道に沿うと安い（道が合流する）
          const nd = dist[k] + c * (dx && dy ? 1.4142 : 1);
          if (nd < dist[nk]) {
            dist[nk] = nd;
            prev[nk] = k;
            const item = [nd + heur(nk), nk];
            pq.push(item);
            let i = pq.length - 1;
            while (i > 0) { const p2 = (i - 1) >> 1; if (pq[p2][0] <= pq[i][0]) break; const t = pq[i]; pq[i] = pq[p2]; pq[p2] = t; i = p2; }
          }
        }
      }
      if (prev[b.k] < 0) return null;
      const path = [];
      for (let k = b.k; k >= 0; k = prev[k]) { path.push([k % gw, (k / gw) | 0]); if (k === a.k) break; }
      path.reverse();
      path.forEach(([x, y]) => { roadCell[y * gw + x] = 1; });
      return path;
    };
    const lines = [];
    const toWorldLine = (path, kind) => {
      const simp = rdp(path, 1.2);
      return { id: sid(), kind, points: simp.map(([x, y]) => [Math.round((x + 0.5) * cell * 10) / 10, Math.round((y + 0.5) * cell * 10) / 10]), name: '', w: 1, wobble: kind === 'highway' ? 0.12 : 0.18 };
    };
    // つなぐ順：まず王都・港・町を街道で結び（幹線）、そのあと村を一番近い所へ道でつなぐ
    const byDist = (list) => list.slice().sort((p1, p2) => Math.hypot(p1.x - capital.x, p1.y - capital.y) - Math.hypot(p2.x - capital.x, p2.y - capital.y));
    const nearestOf = (q, list) => {
      let near = list[0];
      list.forEach((l) => { if (Math.hypot(l.x - q.x, l.y - q.y) < Math.hypot(near.x - q.x, near.y - q.y)) near = l; });
      return near;
    };
    const majors = [placed[0]];
    byDist(placed.slice(1).filter((q) => q.kind !== 'village')).forEach((q) => {
      const path = route(nearestOf(q, majors), q);
      if (path && path.length > 2) lines.push(toWorldLine(path, 'highway'));
      majors.push(q);
    });
    const linked = majors.slice();
    byDist(placed.filter((q) => q.kind === 'village')).forEach((q) => {
      const path = route(nearestOf(q, linked), q);
      if (path && path.length > 2) lines.push(toWorldLine(path, 'road'));
      linked.push(q);
    });
    const ASSET = { capital: 'castle', port: 'port', town: 'town', village: 'village' };
    const stamps = placed.map((q) => ({
      id: sid(), a: ASSET[q.kind], x: Math.round((q.x + 0.5) * cell * 10) / 10, y: Math.round((q.y + 0.5) * cell * 10) / 10,
      s: q.kind === 'capital' ? 1.5 : q.kind === 'village' ? 1 : 1.2, r: 0, f: false, v: Math.floor(rnd() * 4),
      name: q.kind === 'capital' ? '王都' + name() : q.kind === 'port' ? name() + '港' : name(), entryId: '', note: '',
    }));
    return { stamps, lines };
  }

  /**
   * 川を自動で引く：高い所から、いちばん低い隣へと下っていき、海（や湖）に着いたものだけを残す。
   * 途中で別の川に合流したら、そこで終わる（支流）。戻り値は川の線（ワールド座標）の配列。
   */
  function autoRivers(map, H, seed, count) {
    const { gw, gh, cell } = map;
    const rnd = mulberry32(((seed >>> 0) || 1) + 7177);
    const n = gw * gh;
    const owner = new Int32Array(n).fill(-1);
    // 細かな凸凹で川が迷わないよう、なめらかにした高さで流れを決める（海かどうかは元の高さで見る）
    const Hs = new Float32Array(n);
    {
      const R = 2;
      const tmp = new Float32Array(n);
      for (let y = 0; y < gh; y++) {
        let acc = 0; let cnt = 0;
        for (let x = -R; x < gw + R; x++) {
          if (x + R < gw) { acc += H[y * gw + x + R]; cnt++; }
          if (x - R - 1 >= 0) { acc -= H[y * gw + x - R - 1]; cnt--; }
          if (x >= 0 && x < gw) tmp[y * gw + x] = acc / cnt;
        }
      }
      for (let x = 0; x < gw; x++) {
        let acc = 0; let cnt = 0;
        for (let y = -R; y < gh + R; y++) {
          if (y + R < gh) { acc += tmp[(y + R) * gw + x]; cnt++; }
          if (y - R - 1 >= 0) { acc -= tmp[(y - R - 1) * gw + x]; cnt--; }
          if (y >= 0 && y < gh) Hs[y * gw + x] = acc / cnt;
        }
      }
    }
    const sources = [];
    for (let i = 0; i < 4000 && sources.length < 400; i++) {
      const x = 2 + Math.floor(rnd() * (gw - 4));
      const y = 2 + Math.floor(rnd() * (gh - 4));
      const h = H[y * gw + x];
      if (h > 0.5 && h < 0.85) sources.push({ x, y, h });
    }
    sources.sort((a, b) => b.h - a.h);
    const want = count || Math.max(3, Math.round((gw * gh) / 9000));
    const rivers = [];
    const picked = [];
    const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const src of sources) {
      if (rivers.length >= want) break;
      if (picked.some((q) => Math.hypot(q.x - src.x, q.y - src.y) < Math.max(gw, gh) * 0.12)) continue;
      const path = [[src.x, src.y]];
      const seen = new Set([src.y * gw + src.x]);
      let x = src.x;
      let y = src.y;
      let ok = false;
      let joined = -1;
      for (let step = 0; step < gw * 3; step++) {
        let best = null;
        let bestH = Infinity;
        for (const [dx, dy] of N8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 1 || ny < 1 || nx >= gw - 1 || ny >= gh - 1) continue;
          const k = ny * gw + nx;
          if (seen.has(k)) continue;
          // 少しだけ揺らぎを入れて、まっすぐになりすぎないようにする
          const hv = Hs[k] + (rnd() - 0.5) * 0.004 + (dx && dy ? 0.001 : 0);
          if (hv < bestH) { bestH = hv; best = [nx, ny, k]; }
        }
        if (!best) break;
        // 窪地で上りになる場合も、少しなら越える（それ以上は諦める）
        if (bestH > Hs[y * gw + x] + 0.04) break;
        [x, y] = best;
        seen.add(best[2]);
        path.push([x, y]);
        if (H[best[2]] <= 0) { ok = true; break; }
        if (owner[best[2]] >= 0) { ok = true; joined = owner[best[2]]; break; }
      }
      if (!ok || path.length < 14) continue;
      // 行きつ戻りつした輪（近くに戻ってくる部分）を切り取る
      for (let i = 0; i < path.length; i++) {
        let cut = -1;
        for (let j = path.length - 1; j > i + 2; j--) {
          if (Math.abs(path[j][0] - path[i][0]) <= 1 && Math.abs(path[j][1] - path[i][1]) <= 1) { cut = j; break; }
        }
        if (cut > 0) path.splice(i + 1, cut - i - 1);
      }
      if (path.length < 10) continue;
      const id = rivers.length;
      path.forEach(([px, py]) => { owner[py * gw + px] = id; });
      picked.push(src);
      // 角ばった格子の道を間引き（RDP）、角を丸めて（Chaikin）なめらかな線にする
      const simp = rdp(path, 0.9);
      let pts = simp;
      for (let it = 0; it < 2; it++) {
        const q = [pts[0]];
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
        q.push(pts[pts.length - 1]);
        pts = q;
      }
      // 間隔をおよそ2マスごとに整える
      const thin = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const l = thin[thin.length - 1];
        if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) >= 2) thin.push(pts[i]);
      }
      thin.push(pts[pts.length - 1]);
      const world = thin.map(([px, py]) => [Math.round((px + 0.5) * cell * 10) / 10, Math.round((py + 0.5) * cell * 10) / 10]);
      // 海側の端は、少し海の中まで伸ばす（海岸で切れて自然に流れ込む）
      if (joined < 0) {
        const a = world[world.length - 2];
        const b = world[world.length - 1];
        world.push([Math.round((b[0] + (b[0] - a[0]) * 0.6) * 10) / 10, Math.round((b[1] + (b[1] - a[1]) * 0.6) * 10) / 10]);
      }
      rivers.push({ id: sid(), kind: joined >= 0 ? 'stream' : 'river', points: world, name: '', w: joined >= 0 ? 1.15 : 1.5 + rnd() * 0.5, wobble: 0.3 });
    }
    return rivers;
  }

  // ───── 範囲を詳しい地図にする（世界地図 → 国 → 地方） ─────
  // 自動で置き直す素材（名前のない山・木・海の飾り）。名前やつながりのある素材は持っていく
  const REGEN_STAMP = /^(mountain|volcano|mesa|hill|rocks|dune|tree-|bush|grass|reeds|wave|ship|whirlpool|sea-rock|compass)/;
  const SYMBOL_ART = {
    'sym-capital': ['castle', 1.1], 'sym-castle': ['castle', 0.9], 'sym-city': ['city', 1], 'sym-town': ['town', 1], 'sym-village': ['village', 1],
    'sym-port': ['port', 1], 'sym-fort': ['fort', 1], 'sym-temple': ['temple', 1], 'sym-ruin': ['ruins', 1], 'sym-cave': ['cave', 1], 'sym-tower': ['tower', 1],
  };

  /** 線を、範囲の中の部分ごとに切り分けて、新しい座標に移す */
  function clipPolyline(points, tf, W, Hh, margin) {
    const out = [];
    let run = [];
    const inside = (p) => p[0] >= -margin && p[1] >= -margin && p[0] <= W + margin && p[1] <= Hh + margin;
    const pts = points.map(tf);
    pts.forEach((p, i) => {
      if (inside(p)) {
        // 外から入ってきたところは、外の1点もつないで端まで届かせる
        if (!run.length && i > 0) run.push(pts[i - 1]);
        run.push(p);
      } else if (run.length) {
        run.push(p);
        if (run.length >= 2) out.push(run);
        run = [];
      }
    });
    if (run.length >= 2) out.push(run);
    return out;
  }
  /** 多角形を長方形で切り抜く（Sutherland–Hodgman） */
  function clipPolygon(pts, x0, y0, x1, y1) {
    const edges = [
      (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1,
    ];
    const cross = [
      (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])],
      (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])],
      (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0],
      (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1],
    ];
    let out = pts;
    for (let e = 0; e < 4 && out.length; e++) {
      const input = out;
      out = [];
      for (let i = 0; i < input.length; i++) {
        const cur = input[i];
        const prev = input[(i + input.length - 1) % input.length];
        const cIn = edges[e](cur);
        const pIn = edges[e](prev);
        if (cIn) { if (!pIn) out.push(cross[e](prev, cur)); out.push(cur); } else if (pIn) out.push(cross[e](prev, cur));
      }
    }
    return out;
  }

  /**
   * 選んだ範囲を、もっと詳しい地図にする。
   * src：元の地図、Hs・Bs：元の高さと地面、rect：{ x0, y0, x1, y1 }（元の地図の座標）
   * opts：{ name, seed, rivers（川を足す）}
   * 戻り値：新しい地図（データ）と { zoom }。zoom は何倍に拡大したか
   */
  function regionMap(src, Hs, Bs, rect, opts) {
    opts = opts || {};
    const cell = src.cell;
    const Wsrc = src.gw * cell;
    const Hsrc = src.gh * cell;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const x0 = cl(Math.min(rect.x0, rect.x1), 0, Wsrc);
    const x1 = cl(Math.max(rect.x0, rect.x1), 0, Wsrc);
    const y0 = cl(Math.min(rect.y0, rect.y1), 0, Hsrc);
    const y1 = cl(Math.max(rect.y0, rect.y1), 0, Hsrc);
    const rw = (x1 - x0) / cell;
    const rh = (y1 - y0) / cell;
    if (rw < 6 || rh < 6) throw new Error('範囲が小さすぎます');
    // 新しい地図の大きさ：長い辺をおよそ300マスに
    const long = 300;
    let gw = Math.round(rw >= rh ? long : long * rw / rh);
    let gh = Math.round(rw >= rh ? long * rh / rw : long);
    gw = cl(gw, 80, 400);
    gh = cl(gh, 80, 400);
    const zoom = gw / rw; // 元の1マスが新しい地図の何マスか
    const seed = (opts.seed >>> 0) || ((src.seed || 1) * 31 + Math.round(x0 * 7 + y0 * 13)) >>> 0;
    const fine = makeNoise(seed + 11);
    const relief = makeNoise(seed + 29);
    const warp = makeNoise(seed + 47);
    const N = gw * gh;
    const H = new Float32Array(N);
    const B = new Uint8Array(N);
    const sample = (sx, sy) => {
      const x = cl(sx, 0, src.gw - 1.001);
      const y = cl(sy, 0, src.gh - 1.001);
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const fx = x - xi;
      const fy = y - yi;
      const k = yi * src.gw + xi;
      const a = Hs[k]; const b = Hs[k + 1]; const c = Hs[k + src.gw]; const d = Hs[k + src.gw + 1];
      return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    };
    // 細かさ：拡大するほど、元の地図にない細部（入り江・岬・小さな起伏）を足す
    const amp = Math.min(1, 0.35 + Math.log2(Math.max(1, zoom)) * 0.22);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const sx = x0 / cell + (x + 0.5) / zoom - 0.5;
        const sy = y0 / cell + (y + 0.5) / zoom - 0.5;
        const h0 = sample(sx, sy);
        const coastAmp = 0.16 * amp * Math.exp(-Math.abs(h0) / 0.12); // 海岸のあたりほど大きく
        const reliefAmp = 0.07 * amp * Math.max(0, Math.min(1, h0 * 1.6)); // 高い所ほど起伏を
        const n1 = fine(x * 0.045, y * 0.045, 5) - 0.5;
        const n2 = relief(x * 0.09, y * 0.09, 4) - 0.5;
        const i = y * gw + x;
        H[i] = h0 + n1 * 2 * coastAmp + n2 * 2 * reliefAmp;
        // 地面：境目が四角くならないよう、少しゆがめて元の地面を拾う
        const wx = (warp(x * 0.04, y * 0.04, 3) - 0.5) * 2.4;
        const wy = (warp(x * 0.04 + 37, y * 0.04 + 11, 3) - 0.5) * 2.4;
        const bx = cl(Math.round(sx + wx), 0, src.gw - 1);
        const by = cl(Math.round(sy + wy), 0, src.gh - 1);
        B[i] = Bs[by * src.gw + bx];
      }
    }
    // 拡大すると土地の起伏がよく見えるので、陸の高さを少し強める（平らな国でも丘や山並みが見え、川が流れる）
    let maxLand = 0;
    for (let i = 0; i < N; i++) if (H[i] > maxLand) maxLand = H[i];
    if (maxLand > 0.12) {
      const stretch = Math.max(1, Math.min(1.6, 0.72 / maxLand));
      for (let i = 0; i < N; i++) if (H[i] > 0) H[i] *= stretch;
    }
    const W = gw * cell;
    const Hh = gh * cell;
    const tf = (p) => [Math.round((p[0] - x0) * zoom * 10) / 10, Math.round((p[1] - y0) * zoom * 10) / 10];
    const inRect = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const st = Object.assign({}, src.style);
    st.kmPerCell = Math.round((src.style.kmPerCell || 4) / zoom * 100) / 100;
    if (st.grid === 'latlon') st.grid = 'none';
    st.world = false;
    st.ice = false;
    const map = {
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: opts.name || (src.name || '地図') + '（詳細）', gw, gh, cell, seed,
      height: encodeHeights(H), biome: encodeBiomes(B),
      stamps: [], lines: [], areas: [], labels: [], style: st, layers: defaultLayers(),
      region: { from: src.id, rect: { x0, y0, x1, y1 }, zoom: Math.round(zoom * 100) / 100 },
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    // 線（川・道・国境など）
    (src.lines || []).forEach((ln) => {
      clipPolyline(ln.points || [], tf, W, Hh, cell * 2).forEach((pts) => {
        map.lines.push(Object.assign({}, ln, { id: 'ln' + sid(), points: pts, w: ln.kind === 'river' || ln.kind === 'stream' ? Math.min(3, (ln.w || 1) * Math.max(1, Math.sqrt(zoom) * 0.8)) : (ln.w || 1) }));
      });
    });
    if (opts.rivers !== false) {
      // 拡大した地図には、元の地図になかった小さな川も足す
      const more = autoRivers(map, H, seed).filter((r) => !map.lines.some((l) => (l.kind === 'river' || l.kind === 'stream') && l.points.some((p) => Math.hypot(p[0] - r.points[0][0], p[1] - r.points[0][1]) < cell * 6)));
      more.forEach((r) => { r.kind = 'stream'; });
      map.lines = map.lines.concat(more.slice(0, 12));
    }
    // 文字（国名など）
    const labelId = new Map();
    const grow = Math.max(1, Math.min(2.2, Math.sqrt(zoom) * 0.9));
    (src.labels || []).forEach((lb) => {
      if (!inRect(lb.x, lb.y)) return;
      const id = 'lb' + sid();
      labelId.set(lb.id, id);
      let [x, y] = tf([lb.x, lb.y]);
      const big = lb.style === 'region' || lb.style === 'area' || lb.style === 'sea' || lb.style === 'range';
      const size = Math.min(big ? 40 : 22, Math.round((lb.size || 14) * (big ? grow : Math.min(1.4, grow)) * 10) / 10);
      // 端で切れないよう、文字の幅の分だけ内側へ（横書きの文字）
      if (!lb.vertical) {
        const half = Array.from(String(lb.text || '')).length * size * (1 + (lb.spacing != null ? lb.spacing : 0.4)) / 2 + cell;
        x = half * 2 < W ? Math.max(half, Math.min(W - half, x)) : W / 2;
        y = Math.max(size + cell, Math.min(Hh - size - cell, y));
      }
      map.labels.push(Object.assign({}, lb, { id, x, y, size }));
    });
    // 領域（国の塗りなど）は範囲で切り抜く
    (src.areas || []).forEach((ar) => {
      const clipped = clipPolygon(ar.points || [], x0, y0, x1, y1);
      if (clipped.length < 3) return;
      const pts = clipped.map(tf);
      let a2 = 0;
      for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = pts[(i + 1) % pts.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
      if (Math.abs(a2) / 2 < cell * cell * 4) return;
      map.areas.push(Object.assign({}, ar, { id: 'ar' + sid(), points: pts, nameLabel: ar.nameLabel ? (labelId.get(ar.nameLabel) || '') : ar.nameLabel }));
    });
    // 素材：町・城・名前のある物は持っていき、山・木・海の飾りは新しい地形に合わせて置き直す
    const kept = [];
    (src.stamps || []).forEach((s) => {
      if (!inRect(s.x, s.y)) return;
      if (REGEN_STAMP.test(s.a) && !s.name && !s.entryId) return;
      const [x, y] = tf([s.x, s.y]);
      // 世界地図の記号（★など）は、詳しい地図では絵の素材に
      const art = zoom >= 1.8 ? SYMBOL_ART[s.a] : null;
      kept.push(Object.assign({}, s, art ? { a: art[0], s: art[1], v: 0 } : { s: Math.round((s.s || 1) * Math.max(1, Math.min(1.8, Math.pow(zoom, 0.3))) * 100) / 100 }, { id: sid(), x, y }));
    });
    const natural = autoStamps(map, H, B, seed).filter((n) => !kept.some((t) => Math.hypot(t.x - n.x, t.y - n.y) < 20));
    map.stamps = natural.concat(kept).sort((a, b) => a.y - b.y);
    map.stamps.push({ id: sid(), a: 'compass', x: W - 56, y: 68, s: 1, r: 0, f: false, v: 0 });
    return { map, zoom };
  }

  // ───── 国を自動で分ける ─────
  const COUNTRY_SUFFIX = ['王国', '王国', '王国', '公国', '帝国', '共和国', '連邦', '大公国', '首長国', '皇国', '自由都市連合', '神聖国'];
  // 地形の色（黄土・緑）に埋もれないよう、赤・紫・青寄りを多めに
  const COUNTRY_COLORS = ['#d1495b', '#8e5ccc', '#3a7fc1', '#e0823a', '#2a9d8f', '#c2589c', '#5a6fd6', '#b8682e', '#7fae3e', '#d4a017', '#4f9fbf', '#9c3d54'];

  /**
   * 陸を、山の尾根や大きな川を境にしながら、いくつかの国に分ける。
   * opts: { count（0なら自動）, names（国名）, capitals（首都の印） }
   * 戻り値：{ areas, borders, labels, stamps, count }。どれも gen:'country' の印つき（作り直すときに入れ替える）
   */
  function autoCountries(map, H, B, seed, opts) {
    opts = opts || {};
    const { gw, gh, cell } = map;
    const N = gw * gh;
    const rnd = mulberry32(((seed >>> 0) || 1) + 7919);
    const name = makeNamer((seed >>> 0) + 313);
    const world = !!(map.style && map.style.world);
    const masses = landMasses(H, gw, gh, 1);
    const totalLand = masses.reduce((a, m) => a + m.n, 0);
    const empty = { areas: [], borders: [], labels: [], stamps: [], count: 0 };
    if (totalLand < 40) return empty;
    let want = opts.count > 0 ? Math.round(opts.count) : Math.round(Math.max(world ? 6 : 3, Math.min(world ? 14 : 8, totalLand / (world ? 2400 : 1900))));
    want = Math.max(1, Math.min(24, want));

    // 川のマス（国境になりやすい）
    const wet = new Uint8Array(N);
    (map.lines || []).forEach((ln) => {
      if (ln.kind !== 'river') return;
      ln.points.forEach(([px, py], i) => {
        if (i < 2) return; // 源流のあたりは境にしない
        const x = Math.floor(px / cell);
        const y = Math.floor(py / cell);
        if (x >= 0 && y >= 0 && x < gw && y < gh) wet[y * gw + x] = 1;
      });
    });

    // 国の中心（種）：大きな陸ほど多く、互いに離して置く
    const big = masses.filter((m) => m.n >= Math.max(60, totalLand * 0.03));
    if (!big.length) big.push(masses[0]);
    const bigLand = big.reduce((a, m) => a + m.n, 0);
    let quota = big.map((m) => Math.max(1, Math.round(want * m.n / bigLand)));
    // 合計を want に合わせる（大きい陸から増減）
    let sumQ = quota.reduce((a, b) => a + b, 0);
    for (let i = 0; sumQ > want && i < 200; i++) { const j = quota.indexOf(Math.max(...quota)); if (quota[j] <= 1) break; quota[j]--; sumQ--; }
    for (let i = 0; sumQ < want && i < 200; i++) { quota[i % quota.length]++; sumQ++; }
    const seeds = [];
    big.forEach((m, mi) => {
      const cand = [];
      for (let i = 0; i < m.cells.length; i += 2) {
        const k = m.cells[i];
        const h = H[k];
        if (h < 0.02 || h > 0.4) continue;
        if (B && (B[k] === 4 || B[k] === 7)) continue;
        cand.push(k);
      }
      if (!cand.length) cand.push(m.cells[0]);
      const mine = [];
      for (let q = 0; q < quota[mi]; q++) {
        let best = -1;
        let bs = -Infinity;
        for (let t = 0; t < Math.min(cand.length, 700); t++) {
          const k = cand[Math.floor(rnd() * cand.length)];
          const x = k % gw;
          const y = (k / gw) | 0;
          let d = Infinity;
          mine.forEach((o) => { d = Math.min(d, Math.hypot(o.x - x, o.y - y)); });
          // 最初の国は陸の中ほど、次からは既にある国から遠い所
          const sc = mine.length ? d - H[k] * 20 + rnd() * 3 : -Math.hypot(x - m.cx, y - m.cy) * 0.6 - H[k] * 20 + rnd() * 6;
          if (sc > bs) { bs = sc; best = k; }
        }
        if (best >= 0) mine.push({ k: best, x: best % gw, y: (best / gw) | 0 });
      }
      mine.forEach((o) => seeds.push(o));
    });
    const n = seeds.length;
    const strength = seeds.map(() => 0.78 + rnd() * 0.5); // 大きな国と小さな国ができるように

    // 広がり方（多方向からの最短経路）。山・川は越えにくく、海はもっと越えにくい
    const CD = coastDistance(H, gw, gh);
    const costAt = (k) => {
      const h = H[k];
      if (h <= 0) return CD[k] <= 2.5 ? 6 : 14;
      const x = k % gw;
      const y = (k / gw) | 0;
      let c = 1 + (h > 0.4 ? 2 + (h - 0.4) * 40 : 0) + (wet[k] ? 7 : 0);
      c *= 0.75 + vnoise(x * 0.09 + seed * 0.001, y * 0.09) * 0.5;
      return c;
    };
    const lab = new Int16Array(N).fill(-1);
    const dist = new Float64Array(N).fill(Infinity); // 64ビット（取り出すときの比較で誤差が出ないように）
    const heap = [];
    const push = (d, k, r) => {
      heap.push([d, k, r]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const t = heap[i]; heap[i] = heap[p]; heap[p] = t; i = p; }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1; const r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          const t = heap[i]; heap[i] = heap[m]; heap[m] = t; i = m;
        }
      }
      return top;
    };
    seeds.forEach((o, r) => { dist[o.k] = 0; push(0, o.k, r); });
    const limit = world ? 900 : 600; // これより遠い島は、どの国にも属さない
    while (heap.length) {
      const [d, k, r] = pop();
      if (d > dist[k] || lab[k] >= 0) continue;
      lab[k] = r;
      const x = k % gw;
      const y = (k / gw) | 0;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of nb) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const nk = ny * gw + nx;
        if (lab[nk] >= 0) continue;
        const nd = d + costAt(nk) * strength[r];
        if (nd < dist[nk] && nd < limit) { dist[nk] = nd; push(nd, nk, r); }
      }
    }
    // 海は岸の近く（2マス）だけを国の範囲に含める（塗りは陸だけに描く）
    for (let k = 0; k < N; k++) if (H[k] <= 0 && CD[k] > 2.5) lab[k] = -1;

    // 飛び地の小さなかけら（陸続きなのに離れた数マス）は、周りの国に入れる
    const seen = new Uint8Array(N);
    for (let k0 = 0; k0 < N; k0++) {
      if (seen[k0] || lab[k0] < 0 || H[k0] <= 0) continue;
      const r = lab[k0];
      const comp = [k0];
      seen[k0] = 1;
      const nbCount = new Map();
      let touchesSea = false;
      for (let i = 0; i < comp.length; i++) {
        const k = comp[i];
        const x = k % gw;
        const y = (k / gw) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const nk = ny * gw + nx;
          if (H[nk] <= 0) { touchesSea = true; continue; }
          if (lab[nk] === r) { if (!seen[nk]) { seen[nk] = 1; comp.push(nk); } }
          else if (lab[nk] >= 0) nbCount.set(lab[nk], (nbCount.get(lab[nk]) || 0) + 1);
        }
      }
      if (comp.length < 30 && nbCount.size) {
        let to = -1; let bc = -1;
        nbCount.forEach((c, l) => { if (c > bc) { bc = c; to = l; } });
        // 島ぜんぶが1つの国なら飛び地のまま。陸続きのかけらだけ入れ替える
        if (to >= 0 && (!touchesSea || comp.length < 12)) comp.forEach((k) => { lab[k] = to; });
      }
    }

    // 国の大きさ（陸のマス数）
    const size = new Array(n).fill(0);
    for (let k = 0; k < N; k++) if (H[k] > 0 && lab[k] >= 0) size[lab[k]]++;

    // 隣り合う国（色分けのため）
    const adj = seeds.map(() => new Set());
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const k = y * gw + x;
        const a = lab[k];
        if (a < 0) continue;
        if (x + 1 < gw) { const b = lab[k + 1]; if (b >= 0 && b !== a) { adj[a].add(b); adj[b].add(a); } }
        if (y + 1 < gh) { const b = lab[k + gw]; if (b >= 0 && b !== a) { adj[a].add(b); adj[b].add(a); } }
      }
    }
    const colorIdx = new Array(n).fill(-1);
    const order = seeds.map((_, i) => i).sort((a, b) => adj[b].size - adj[a].size);
    const offset = Math.floor(rnd() * COUNTRY_COLORS.length);
    order.forEach((r) => {
      const used = new Set(Array.from(adj[r]).map((q) => colorIdx[q]));
      let c = 0;
      while (used.has(c) && c < COUNTRY_COLORS.length - 1) c++;
      colorIdx[r] = c;
    });

    // 国名
    const bySize = seeds.map((_, i) => i).sort((a, b) => size[b] - size[a]);
    const names = new Array(n).fill('');
    const stems = new Array(n).fill('');
    bySize.forEach((r, i) => {
      const stem = name();
      stems[r] = stem;
      let suf;
      if (i === 0 && n >= 4) suf = rnd() < 0.6 ? '帝国' : '王国';
      else if (size[r] < totalLand * 0.04) suf = ['公国', '大公国', '自由都市連合', '首長国'][Math.floor(rnd() * 4)];
      else suf = COUNTRY_SUFFIX[Math.floor(rnd() * COUNTRY_SUFFIX.length)];
      names[r] = stem + suf;
    });

    // 輪郭：国ごとのマスの外周をたどる（塗りは陸の形で切り抜くので、海側に少しはみ出してよい）
    const areas = [];
    const W1 = gw + 1;
    const groupIds = seeds.map(() => sid());
    for (let r = 0; r < n; r++) {
      if (!size[r]) continue;
      const inR = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && lab[y * gw + x] === r;
      // 外周の向きつきの辺（国を左手に見て回る）
      const next = new Map();
      const addE = (ax, ay, bx, by) => {
        const a = ay * W1 + ax;
        if (!next.has(a)) next.set(a, []);
        next.get(a).push(by * W1 + bx);
      };
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          if (!inR(x, y)) continue;
          if (!inR(x, y - 1)) addE(x, y, x + 1, y);
          if (!inR(x + 1, y)) addE(x + 1, y, x + 1, y + 1);
          if (!inR(x, y + 1)) addE(x + 1, y + 1, x, y + 1);
          if (!inR(x - 1, y)) addE(x, y + 1, x, y);
        }
      }
      const loops = [];
      next.forEach((list, start) => {
        while (list.length) {
          const loop = [start];
          let cur = list.pop();
          let prev = start;
          let guard = 0;
          while (cur !== start && guard++ < 200000) {
            loop.push(cur);
            const outs = next.get(cur);
            if (!outs || !outs.length) break;
            // 分かれ道（斜めに接する角）では、来た向きから見て右へ曲がる方を選ぶ
            let pick = 0;
            if (outs.length > 1) {
              const px = prev % W1; const py = (prev / W1) | 0;
              const cx = cur % W1; const cy = (cur / W1) | 0;
              const dx = cx - px; const dy = cy - py;
              pick = outs.findIndex((o) => { const ox = o % W1 - cx; const oy = ((o / W1) | 0) - cy; return dx * oy - dy * ox > 0; });
              if (pick < 0) pick = 0;
            }
            prev = cur;
            cur = outs.splice(pick, 1)[0];
          }
          if (loop.length >= 4) loops.push(loop.map((v) => [v % W1, (v / W1) | 0]));
        }
      });
      loops.forEach((lp) => {
        let a2 = 0;
        for (let i = 0; i < lp.length; i++) { const p = lp[i]; const q = lp[(i + 1) % lp.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
        if (a2 <= 0 || a2 / 2 < 5) return; // 穴（内側の輪）や小さすぎる島は除く
        // 閉じた輪は、始点から一番遠い点で2つに分けて間引く（始点と終点が同じだと間引けないため）
        let far = 0; let fd = -1;
        lp.forEach((p, i) => { const d = Math.hypot(p[0] - lp[0][0], p[1] - lp[0][1]); if (d > fd) { fd = d; far = i; } });
        const simp = rdp(lp.slice(0, far + 1), 0.75).concat(rdp(lp.slice(far).concat([lp[0]]), 0.75).slice(1, -1));
        if (simp.length < 3) return;
        areas.push({
          id: 'ar' + sid(), points: simp.map(([x, y]) => [Math.round(x * cell * 10) / 10, Math.round(y * cell * 10) / 10]),
          color: COUNTRY_COLORS[colorIdx[r] % COUNTRY_COLORS.length], opacity: 0.36, name: names[r], land: true, group: groupIds[r], gen: 'country', _area: a2 / 2,
        });
      });
    }
    // 大きな輪から先に塗る
    areas.sort((a, b) => b._area - a._area);
    areas.forEach((a) => { delete a._area; });

    // 国境：陸で、違う国のマスが接する辺をつないだ線
    const adjV = new Map();
    const addU = (a, b) => {
      if (!adjV.has(a)) adjV.set(a, []);
      if (!adjV.has(b)) adjV.set(b, []);
      adjV.get(a).push(b);
      adjV.get(b).push(a);
    };
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const k = y * gw + x;
        if (H[k] <= 0 || lab[k] < 0) continue;
        if (x + 1 < gw && H[k + 1] > 0 && lab[k + 1] >= 0 && lab[k + 1] !== lab[k]) addU(y * W1 + x + 1, (y + 1) * W1 + x + 1);
        if (y + 1 < gh && H[k + gw] > 0 && lab[k + gw] >= 0 && lab[k + gw] !== lab[k]) addU((y + 1) * W1 + x, (y + 1) * W1 + x + 1);
      }
    }
    const usedE = new Set();
    const ek = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
    const chains = [];
    const walk = (start, first) => {
      const ch = [start];
      let prev = start;
      let cur = first;
      usedE.add(ek(start, first));
      for (let guard = 0; guard < 100000; guard++) {
        ch.push(cur);
        const nb = adjV.get(cur);
        if (nb.length !== 2) break;
        const nx = nb[0] === prev ? nb[1] : nb[0];
        if (usedE.has(ek(cur, nx))) break;
        usedE.add(ek(cur, nx));
        prev = cur;
        cur = nx;
      }
      return ch;
    };
    adjV.forEach((nb, v) => { if (nb.length !== 2) nb.forEach((w) => { if (!usedE.has(ek(v, w))) chains.push(walk(v, w)); }); });
    adjV.forEach((nb, v) => { nb.forEach((w) => { if (!usedE.has(ek(v, w))) chains.push(walk(v, w)); }); });
    const borders = [];
    chains.forEach((ch) => {
      if (ch.length < 3) return;
      const pts = rdp(ch.map((v) => [v % W1, (v / W1) | 0]), 0.7);
      if (pts.length < 2) return;
      borders.push({ id: 'ln' + sid(), kind: 'border', points: pts.map(([x, y]) => [Math.round(x * cell * 10) / 10, Math.round(y * cell * 10) / 10]), name: '', w: world ? 0.8 : 1, wobble: 0.12, gen: 'country' });
    });

    // 国名の位置：国の中で、国境や海岸から一番遠い所（山の上は少し避ける）
    const inner = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const x = k % gw;
      const y = (k / gw) | 0;
      const r = lab[k];
      let edge = r < 0 || H[k] <= 0;
      if (!edge) edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx; const ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return true; const nk = ny * gw + nx; return lab[nk] !== r || H[nk] <= 0; });
      inner[k] = edge ? 0 : 1e9;
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const k = y * gw + x;
      if (!inner[k]) continue;
      let v = inner[k];
      if (x > 0) v = Math.min(v, inner[k - 1] + 1);
      if (y > 0) v = Math.min(v, inner[k - gw] + 1);
      if (x > 0 && y > 0) v = Math.min(v, inner[k - gw - 1] + 1.414);
      if (x < gw - 1 && y > 0) v = Math.min(v, inner[k - gw + 1] + 1.414);
      inner[k] = v;
    }
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) {
      const k = y * gw + x;
      if (!inner[k]) continue;
      let v = inner[k];
      if (x < gw - 1) v = Math.min(v, inner[k + 1] + 1);
      if (y < gh - 1) v = Math.min(v, inner[k + gw] + 1);
      if (x < gw - 1 && y < gh - 1) v = Math.min(v, inner[k + gw + 1] + 1.414);
      if (x > 0 && y < gh - 1) v = Math.min(v, inner[k + gw - 1] + 1.414);
      inner[k] = v;
    }
    const bestAt = new Array(n).fill(-1);
    const bestSc = new Array(n).fill(-Infinity);
    for (let k = 0; k < N; k++) {
      const r = lab[k];
      if (r < 0 || H[k] <= 0) continue;
      const sc = Math.min(inner[k], 14) - Math.max(0, H[k] - 0.35) * 25 + inner[k] * 0.02;
      if (sc > bestSc[r]) { bestSc[r] = sc; bestAt[r] = k; }
    }
    const labels = [];
    const stamps = [];
    // 地図にもともとある町・城など（首都はこれと重ならない所に。名前のある町がある国には首都を足さない）
    const settle = (map.stamps || []).filter((st) => st.gen !== 'country' && (st.name || st.entryId || /castle|city|town|village|port|fort|capital|palace|keep|tenshu/.test(st.a || '')));
    const cellOf = (st) => {
      const gx = Math.max(0, Math.min(gw - 1, Math.floor(st.x / cell)));
      const gy = Math.max(0, Math.min(gh - 1, Math.floor(st.y / cell)));
      return lab[gy * gw + gx];
    };
    for (let r = 0; r < n; r++) {
      if (!size[r] || bestAt[r] < 0) continue;
      const k = bestAt[r];
      let fs = Math.round(Math.max(world ? 15 : 13, Math.min(world ? 28 : 30, Math.sqrt(size[r]) * (world ? 0.42 : 0.5))));
      // 長い国名は少し小さく。地図の端からはみ出さないよう、文字の幅の分だけ内側へ
      const len = names[r].length;
      if (len > 6) fs = Math.max(12, Math.round(fs * 6 / len));
      const halfW = (len * fs * 1.55) / 2 + 6;
      const x = Math.max(halfW + cell * 2, Math.min(gw * cell - halfW - cell * 2, (k % gw + 0.5) * cell));
      const y = Math.max(fs + cell * 3, Math.min(gh * cell - fs - cell * 3, (((k / gw) | 0) + 0.5) * cell));
      let lbId = '';
      if (opts.names !== false) {
        lbId = 'lb' + sid();
        labels.push({ id: lbId, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, text: names[r], style: 'region', size: fs, rotation: 0, vertical: false, curve: 0, gen: 'country', group: groupIds[r] });
      }
      areas.forEach((a) => { if (a.group === groupIds[r]) a.nameLabel = lbId; });
      if (opts.capitals && !settle.some((st) => (st.name || st.entryId) && cellOf(st) === r)) {
        // 首都：国の中の、平らで住みやすい所。国名の文字とは重ならない所に
        const capName = name();
        const capW = capName.length * 12 + 18; // 首都の印と、右に出る名前の幅の目安
        const halfH = fs * 0.75 + 10;
        const lx = x;
        const ly = y;
        let ck = -1; let cs = -Infinity;
        for (let i = 0; i < 1500; i++) {
          const kk = Math.floor(rnd() * N);
          if (lab[kk] !== r || H[kk] <= 0.02 || H[kk] > 0.36) continue;
          const px = (kk % gw + 0.5) * cell;
          const py = (((kk / gw) | 0) + 0.5) * cell;
          if (px > lx - halfW - capW - 8 && px < lx + halfW + 12 && Math.abs(py - ly) < halfH) continue; // 国名と首都名がかぶる
          if (px + capW > gw * cell - cell * 2) continue; // 首都名が地図の端からはみ出す
          if (settle.some((st) => Math.abs(st.x - px) < 60 + capW * 0.5 && Math.abs(st.y - py) < 26)) continue; // もとからある町と重なる
          const dl = Math.hypot(px - lx, (py - ly) * 1.4);
          const sc = Math.min(inner[kk], 8) - dl / (fs * 4) - H[kk] * 6 + (wet[kk] ? 2 : 0) + (CD[kk] > 0 ? 0 : 0);
          if (sc > cs) { cs = sc; ck = kk; }
        }
        if (ck >= 0) {
          stamps.push({ id: sid(), a: world ? 'sym-capital' : 'castle', x: (ck % gw + 0.5) * cell, y: (((ck / gw) | 0) + 0.8) * cell, s: world ? 0.9 : 0.75, r: 0, f: false, v: 0, name: capName, gen: 'country' });
        }
      }
    }
    return { areas, borders, labels, stamps, count: n };
  }

  /** 折れ線の間引き（Ramer–Douglas–Peucker） */
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = 1;
    keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a];
      const [bx, by] = pts[b];
      const L = Math.hypot(bx - ax, by - ay) || 1;
      let md = 0;
      let mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  /** 古い形式の地図（地点・自動の山記号）を新しい形式に直す */
  function migrate(map) {
    map.lines = map.lines || [];
    map.areas = map.areas || [];
    map.labels = map.labels || [];
    const old = map.style || {};
    if (!Array.isArray(map.stamps)) {
      map.stamps = [];
      const n = map.gw * map.gh;
      if (old.glyphs !== false && map.height) {
        const H = decodeHeights(map.height, n);
        const B = map.biome ? decodeBiomes(map.biome, n) : new Uint8Array(n);
        map.stamps = autoStamps(map, H, B, map.seed || 1);
      }
      (map.markers || []).forEach((mk) => {
        map.stamps.push({ id: mk.id || sid(), a: 'sym-' + (mk.type || 'pin'), x: mk.x, y: mk.y, s: 1, r: 0, f: false, v: 0, name: mk.name || '', entryId: mk.entryId || '', note: mk.note || '' });
      });
      if (old.compass) map.stamps.push({ id: sid(), a: 'compass', x: map.gw * map.cell - 56, y: 68, s: 1, r: 0, f: false, v: 0 });
      map.stamps.sort((a, b) => a.y - b.y);
    }
    delete map.markers;
    const st = Object.assign(defaultStyle(old.palette), old);
    if (st.title === true) st.title = 'plain';
    if (st.title === false) st.title = 'none';
    if (st.grid === true) st.grid = 'square';
    if (st.grid === false) st.grid = 'none';
    if (st.kmPerCell == null) st.kmPerCell = 4;
    delete st.glyphs;
    delete st.compass;
    map.style = st;
    map.layers = Object.assign(defaultLayers(), map.layers || {});
    return map;
  }

  function findLand(H, gw, gh, rnd, minH, maxH) {
    for (let k = 0; k < 4000; k++) {
      const x = 6 + Math.floor(rnd() * (gw - 12));
      const y = 6 + Math.floor(rnd() * (gh - 12));
      const h = H[y * gw + x];
      if (h >= (minH == null ? 0.05 : minH) && h <= (maxH == null ? 0.35 : maxH)) return { x, y };
    }
    return { x: gw >> 1, y: gh >> 1 };
  }

  /** 解像度（世界座標 1px あたりの画素数）を地図の大きさから決める */
  function pickRes(W, H, budget) {
    return Math.max(1, Math.min(2, Math.sqrt((budget || 2.4e6) / (W * H))));
  }

  NS.MapEngine = {
    BIOMES, PALETTES, PRESETS, SIZES, COUNTRY_COLORS, mulberry32, makeNoise, hash2, vnoise, generate, autoBiome, renderTerrain, autoStamps,
    encodeHeights, decodeHeights, encodeBiomes, decodeBiomes, newMap, migrate, autoRivers, autoSettlements, autoWorldLabels, autoCountries, regionMap, clipPolygon, makeNamer, findLand, pickRes, sampleH, defaultStyle, sid,
  };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
