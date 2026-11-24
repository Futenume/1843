/*
 * 綴り — 空想地図エンジン（地形の生成・描画・保存形式）
 * 高さマップ（-1〜1、0 が海面）と植生マップを格子で持ち、
 * 描画時に双線形補間して滑らかな海岸線・陰影・等深線を付ける。
 */
(function (NS) {
  'use strict';

  const BIOMES = [
    { id: 0, key: 'none', label: '草原・平地' },
    { id: 1, key: 'forest', label: '森' },
    { id: 2, key: 'desert', label: '砂漠' },
    { id: 3, key: 'swamp', label: '湿地' },
    { id: 4, key: 'snow', label: '雪原' },
    { id: 5, key: 'jungle', label: '密林' },
    { id: 6, key: 'steppe', label: '荒れ地' },
  ];

  const PALETTES = {
    parchment: {
      label: '羊皮紙',
      deep: [150, 178, 196], shallow: [204, 221, 224], ripple: [126, 156, 178], coast: [84, 68, 52],
      ramp: [[0, [238, 228, 195]], [0.22, [228, 219, 176]], [0.45, [207, 189, 142]], [0.68, [178, 154, 116]], [0.86, [150, 128, 100]], [0.95, [244, 241, 234]]],
      biome: { 1: [160, 182, 124], 2: [240, 220, 170], 3: [166, 176, 140], 4: [244, 245, 247], 5: [118, 158, 100], 6: [222, 210, 160] },
      paper: 5, ink: '#4a3a2c', water: '#4c7aa3', road: '#8b5a3c', border: '#8c3b5e', halo: 'rgba(245,238,220,0.9)', glyph: '#6b5843', tree: '#5d7a45',
    },
    atlas: {
      label: '地図帳',
      deep: [52, 104, 152], shallow: [140, 190, 224], ripple: [96, 150, 196], coast: [40, 70, 100],
      ramp: [[0, [168, 206, 140]], [0.2, [196, 218, 148]], [0.42, [222, 206, 146]], [0.62, [196, 160, 112]], [0.82, [160, 124, 96]], [0.94, [250, 250, 250]]],
      biome: { 1: [104, 160, 96], 2: [236, 214, 156], 3: [124, 160, 122], 4: [252, 252, 252], 5: [62, 136, 80], 6: [206, 214, 140] },
      paper: 0, ink: '#1f2a30', water: '#2f6fa8', road: '#b5462f', border: '#7a2f6b', halo: 'rgba(255,255,255,0.88)', glyph: '#6a4f37', tree: '#2f6b3b',
    },
    mono: {
      label: '墨絵',
      deep: [236, 232, 222], shallow: [244, 240, 231], ripple: [176, 166, 146], coast: [44, 38, 32],
      ramp: [[0, [252, 249, 242]], [0.5, [240, 236, 226]], [0.8, [222, 216, 204]], [0.95, [252, 250, 246]]],
      biome: { 1: [228, 230, 220], 2: [250, 244, 230], 3: [232, 232, 224], 4: [255, 255, 255], 5: [218, 224, 210], 6: [244, 240, 228] },
      paper: 3, ink: '#2b2520', water: '#3c3a38', road: '#3b3330', border: '#5a4a46', halo: 'rgba(252,249,242,0.92)', glyph: '#3b342e', tree: '#3b342e',
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
        H[y * gw + x] = v;
      }
    }
    // 陸の割合が目標になるよう海面を決める
    const sorted = Array.from(H).sort((a, b) => a - b);
    const landRatio = opts.land != null ? opts.land : preset.land;
    const t = sorted[Math.floor((1 - landRatio) * (sorted.length - 1))];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    for (let i = 0; i < H.length; i++) {
      const v = H[i];
      H[i] = v >= t ? Math.pow((v - t) / (max - t || 1), 1.3) : -Math.pow((t - v) / (t - min || 1), 0.7);
    }
    // 縁は海にする（海岸線プリセット以外）
    if (!preset.gradient) {
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const e = Math.min(x, y, gw - 1 - x, gh - 1 - y);
          if (e < 3) H[y * gw + x] = Math.min(H[y * gw + x], -0.15 - (3 - e) * 0.1);
        }
      }
    }
    return H;
  }

  /** 高さと乱数から植生を自動で塗る */
  function autoBiome(H, gw, gh, seed) {
    const B = new Uint8Array(gw * gh);
    const moist = makeNoise(((seed >>> 0) || 1) + 104729);
    for (let y = 0; y < gh; y++) {
      const lat = Math.abs(y / gh - 0.5) * 2; // 0=赤道 1=極
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const h = H[i];
        if (h <= 0) continue;
        const m = moist(x / gw * 4, y / gh * 4, 4);
        const temp = 1 - lat * 0.9 - h * 0.6;
        let b = 0;
        if (temp < 0.16 || h > 0.86) b = 4;
        else if (h > 0.6) b = 0;
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
  function lerp3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function ramp(stops, v) {
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return lerp3(stops[i - 1][1], stops[i][1], t);
      }
    }
    return stops[stops.length - 1][1];
  }

  /**
   * 地形を ImageData に描く（px 単位の矩形だけ再描画できる）
   * map: { gw, gh, cell, style:{palette, hillshade} }
   */
  function renderTerrain(map, H, B, img, rx0, ry0, rx1, ry1) {
    const pal = PALETTES[(map.style && map.style.palette) || 'parchment'] || PALETTES.parchment;
    const shade = !map.style || map.style.hillshade !== false;
    const { gw, gh, cell } = map;
    const W = img.width;
    const data = img.data;
    rx0 = Math.max(0, rx0 | 0); ry0 = Math.max(0, ry0 | 0);
    rx1 = Math.min(W, Math.ceil(rx1)); ry1 = Math.min(img.height, Math.ceil(ry1));
    const seed = 1337;
    for (let py = ry0; py < ry1; py++) {
      const gy = (py + 0.5) / cell - 0.5;
      let y0 = Math.floor(gy);
      const fy = gy - y0;
      const ya = Math.max(0, Math.min(gh - 1, y0));
      const yb = Math.max(0, Math.min(gh - 1, y0 + 1));
      for (let px = rx0; px < rx1; px++) {
        const gx = (px + 0.5) / cell - 0.5;
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
        const h = top + (bot - top) * fy;
        const dhdx = ((h10 - h00) * (1 - fy) + (h11 - h01) * fy) / cell;
        const dhdy = (bot - top) / cell;
        const gm = Math.sqrt(dhdx * dhdx + dhdy * dhdy) + 1e-6;
        // 海岸線までのおおよその距離（px）。平らな所は海岸線にしない
        const dist = gm < 0.0004 ? 99 : Math.abs(h) / gm;
        let c;
        if (h < 0) {
          const depth = Math.min(1, -h / 0.6);
          c = lerp3(pal.shallow, pal.deep, depth * depth * (3 - 2 * depth));
          if ((dist > 5 && dist < 6.3) || (dist > 11 && dist < 12)) c = lerp3(c, pal.ripple, 0.45);
        } else {
          c = ramp(pal.ramp, h);
          // 植生（境界は少し揺らして手描き風に）
          const jx = (hash2(px, py, seed) - 0.5) * 0.9;
          const jy = (hash2(py, px, seed + 1) - 0.5) * 0.9;
          const bxi = Math.max(0, Math.min(gw - 1, Math.round(gx + jx)));
          const byi = Math.max(0, Math.min(gh - 1, Math.round(gy + jy)));
          const b = B ? B[byi * gw + bxi] : 0;
          if (b && pal.biome[b] && h < 0.8) c = lerp3(c, pal.biome[b], b === 4 ? 0.85 : 0.62);
          if (shade) {
            const s = 1 + (-dhdx - dhdy) * 0.7071 * 9 * cell / 6;
            const k = Math.max(0.62, Math.min(1.28, s));
            c = [c[0] * k, c[1] * k, c[2] * k];
          }
        }
        if (dist < 1.1) c = lerp3(c, pal.coast, Math.max(0, 1 - dist / 1.1) * 0.9 + 0.1);
        if (pal.paper) {
          const n = (hash2(px, py, 99) - 0.5) * pal.paper * 2;
          c = [c[0] + n, c[1] + n, c[2] + n];
        }
        const o = (py * W + px) * 4;
        data[o] = c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0];
        data[o + 1] = c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1];
        data[o + 2] = c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2];
        data[o + 3] = 255;
      }
    }
  }

  /** 山・木の記号の配置（地形が変わったときに再計算） */
  function computeGlyphs(map, H, B) {
    const { gw, gh, cell } = map;
    const out = [];
    const step = 3;
    for (let y = 1; y < gh - 1; y += step) {
      for (let x = 1; x < gw - 1; x += step) {
        const jx = x + (hash2(x, y, 5) - 0.5) * step * 0.9;
        const jy = y + (hash2(y, x, 6) - 0.5) * step * 0.9;
        const xi = Math.max(0, Math.min(gw - 1, Math.round(jx)));
        const yi = Math.max(0, Math.min(gh - 1, Math.round(jy)));
        const h = H[yi * gw + xi];
        const b = B ? B[yi * gw + xi] : 0;
        const wx = (jx + 0.5) * cell;
        const wy = (jy + 0.5) * cell;
        if (h > 0.5 && hash2(x, y, 8) < 0.85) {
          out.push({ k: 'm', x: wx, y: wy, s: cell * (1.3 + (h - 0.5) * 2.6), snow: h > 0.78 });
        } else if (h > 0.34 && hash2(x, y, 9) < 0.5) {
          out.push({ k: 'h', x: wx, y: wy, s: cell * 1.2 });
        } else if (h > 0 && (b === 1 || b === 5) && hash2(x, y, 11) < 0.85) {
          out.push({ k: b === 5 ? 'j' : 't', x: wx, y: wy, s: cell * 0.9 });
          if (hash2(x, y, 12) < 0.6) out.push({ k: b === 5 ? 'j' : 't', x: wx + cell * 1.2, y: wy + cell * 0.6, s: cell * 0.75 });
        } else if (h > 0 && b === 3 && hash2(x, y, 13) < 0.5) {
          out.push({ k: 's', x: wx, y: wy, s: cell });
        } else if (h > 0 && b === 2 && hash2(x, y, 14) < 0.35) {
          out.push({ k: 'd', x: wx, y: wy, s: cell });
        }
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

  /** 地図データの雛形 */
  function newMap(name, opts) {
    opts = opts || {};
    const size = { s: [160, 104], m: [200, 130], l: [260, 170] }[opts.size || 'm'];
    const gw = size[0];
    const gh = size[1];
    const seed = opts.seed || Math.floor(Math.random() * 1e9);
    const H = generate(gw, gh, { preset: opts.preset || 'continent', seed, land: opts.land });
    const B = opts.biome === false ? new Uint8Array(gw * gh) : autoBiome(H, gw, gh, seed);
    return {
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || '新しい地図', gw, gh, cell: 6, seed,
      height: encodeHeights(H), biome: encodeBiomes(B),
      lines: [], areas: [], markers: [], labels: [],
      style: { palette: opts.palette || 'parchment', hillshade: true, glyphs: true, grid: false, kmPerCell: 5, compass: true, scale: true, title: true },
      createdAt: Date.now(), updatedAt: Date.now(),
    };
  }

  /** 陸地の中からランダムに地点を選ぶ（サンプル作成用） */
  function findLand(H, gw, gh, rnd, minH, maxH) {
    for (let k = 0; k < 4000; k++) {
      const x = 6 + Math.floor(rnd() * (gw - 12));
      const y = 6 + Math.floor(rnd() * (gh - 12));
      const h = H[y * gw + x];
      if (h >= (minH == null ? 0.05 : minH) && h <= (maxH == null ? 0.35 : maxH)) return { x, y };
    }
    return { x: gw >> 1, y: gh >> 1 };
  }

  NS.MapEngine = {
    BIOMES, PALETTES, PRESETS, mulberry32, makeNoise, hash2, generate, autoBiome, renderTerrain, computeGlyphs,
    encodeHeights, decodeHeights, encodeBiomes, decodeBiomes, newMap, findLand,
  };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
