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
    continent: { label: '大陸', freq: 3.2, falloff: 1.25, land: 0.42 },
    islands: { label: '群島', freq: 6, falloff: 0.55, land: 0.3 },
    island: { label: 'ひとつの島', freq: 3.8, falloff: 2.2, land: 0.3 },
    archipelago: { label: '多島海', freq: 9, falloff: 0.4, land: 0.24 },
    coast: { label: '海岸線', freq: 3.5, falloff: 0, land: 0.55, gradient: true },
    lake: { label: '内海のある大地', freq: 3.6, falloff: -1.1, land: 0.68 },
    sea: { label: '白紙（海）', blank: -0.4 },
    land: { label: '白紙（陸）', blank: 0.15 },
  };

  /** 地形を生成する（Float32Array、-1〜1） */
  function generate(gw, gh, opts) {
    opts = opts || {};
    const preset = PRESETS[opts.preset || 'continent'] || PRESETS.continent;
    const H = new Float32Array(gw * gh);
    if (preset.blank != null) { H.fill(preset.blank); return H; }
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
    const sorted = Array.from(H).sort((a, b) => a - b);
    const landRatio = opts.land != null ? opts.land : preset.land;
    const t = sorted[Math.floor((1 - landRatio) * (sorted.length - 1))];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    for (let i = 0; i < H.length; i++) {
      const v = H[i];
      H[i] = v >= t ? Math.pow((v - t) / (max - t || 1), 1.3) : -Math.pow((t - v) / (t - min || 1), 0.7);
    }
    if (!preset.gradient) {
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
  function autoBiome(H, gw, gh, seed) {
    const B = new Uint8Array(gw * gh);
    const moist = makeNoise(((seed >>> 0) || 1) + 104729);
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
  function renderTerrain(map, H, B, img, rx0, ry0, rx1, ry1, res, mask) {
    res = res || 1;
    const md = mask ? mask.data : null;
    const pal = PALETTES[(map.style && map.style.palette) || 'parchment'] || PALETTES.parchment;
    const shade = !map.style || map.style.hillshade !== false;
    const ripples = !map.style || map.style.ripples !== false;
    const { gw, gh, cell } = map;
    const W = img.width;
    const data = img.data;
    rx0 = Math.max(0, rx0 | 0); ry0 = Math.max(0, ry0 | 0);
    rx1 = Math.min(W, Math.ceil(rx1)); ry1 = Math.min(img.height, Math.ceil(ry1));
    for (let py = ry0; py < ry1; py++) {
      const wy = (py + 0.5) / res;
      const gy = wy / cell - 0.5;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const ya = Math.max(0, Math.min(gh - 1, y0));
      const yb = Math.max(0, Math.min(gh - 1, y0 + 1));
      for (let px = rx0; px < rx1; px++) {
        const wx = (px + 0.5) / res;
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
          const depth = Math.min(1, -h / 0.6);
          c = mix(pal.shallow, pal.deep, depth * depth * (3 - 2 * depth));
          c = mix(c, pal.glow, Math.exp(-dist / 7) * 0.6);
          if (ripples) {
            for (let k = 0; k < 3; k++) {
              const a = 1 - Math.abs(dist - (5 + k * 5.5)) / 0.75;
              if (a > 0) c = mix(c, pal.ripple, a * (0.5 - k * 0.13));
            }
          }
          const n = (vnoise(wx * 0.025, wy * 0.025) - 0.5) * 6;
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
          if (shade) {
            const s = 1 + (-dhdx - dhdy) * 0.7071 * 9;
            const k = Math.max(0.6, Math.min(1.3, s));
            c = [c[0] * k, c[1] * k, c[2] * k];
          }
        }
        if (dist < 0.95) c = mix(c, pal.coast, Math.max(0, 1 - dist / 0.95) * 0.92);
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
    const put = (a, x, y, s) => out.push({ id: sid(), a, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, s: Math.round(s * 100) / 100, r: 0, f: rnd() < 0.5, v: Math.floor(rnd() * 8) });
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
        const sc = 0.75 + t * 1.15 + Math.max(0, c.ridge) * 3 + rnd() * 0.15;
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

  const SIZES = { s: [240, 156], m: [300, 195], l: [380, 247] };

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
    const size = SIZES[opts.size || 'm'] || SIZES.m;
    const gw = size[0];
    const gh = size[1];
    const cell = 4;
    const seed = opts.seed || Math.floor(Math.random() * 1e9);
    const H = generate(gw, gh, { preset: opts.preset || 'continent', seed, land: opts.land });
    const B = opts.biome === false ? new Uint8Array(gw * gh) : autoBiome(H, gw, gh, seed);
    const map = {
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || '新しい地図', gw, gh, cell, seed,
      height: encodeHeights(H), biome: encodeBiomes(B),
      stamps: [], lines: [], areas: [], labels: [],
      style: defaultStyle(opts.palette), layers: defaultLayers(),
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    if (opts.stamps !== false) map.stamps = autoStamps(map, H, B, seed);
    if (opts.compass !== false) map.stamps.push({ id: sid(), a: 'compass', x: gw * cell - 56, y: 68, s: 1, r: 0, f: false, v: 0 });
    return map;
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
    BIOMES, PALETTES, PRESETS, SIZES, mulberry32, makeNoise, hash2, vnoise, generate, autoBiome, renderTerrain, autoStamps,
    encodeHeights, decodeHeights, encodeBiomes, decodeBiomes, newMap, migrate, findLand, pickRes, sampleH, defaultStyle, sid,
  };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
