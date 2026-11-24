/*
 * 綴り — 空想地図の素材（スタンプ）ライブラリ
 * 山・木・町・城・和風の建物・遺跡・海の生き物・方位記号・地図記号などを、手描き風のベクターで描く。
 * 描いた素材は配色ごとに画像としてキャッシュし、地図上では画像として高速に描画する。
 */
(function (NS) {
  'use strict';

  const COLORS = {
    parchment: {
      ink: '#3a2e24', paper: '#fbf6ea', hatch: 'rgba(58,46,36,0.5)',
      rock: '#ece2c9', rockShade: '#ab9673', rockDark: '#8e7c60', snow: '#fdfcf8', snowShade: '#d3d8df',
      hill: '#ddd3a5', hillShade: '#b8aa7a', leaf: '#9db86f', leafShade: '#6b8c47', leafHi: '#c4d796',
      conifer: '#7e9c60', coniferShade: '#557540', jungle: '#679a50', jungleShade: '#41703a', trunk: '#6e4f35',
      dead: '#6e5a45', grass: '#7c9750', sand: '#ebd7a1', sandShade: '#c9ad72', stone: '#cfc5b3', stoneShade: '#978c7b',
      wall: '#f4ebd7', wallShade: '#d3c4a3', roof: '#b9583d', roofShade: '#8e3f2a', roof2: '#536b8d', roof2Shade: '#3c4f6b',
      roofJ: '#4d525b', roofJShade: '#34373e', water: '#5c8db5', waterLight: '#bcd5e5', foam: '#ffffff', wood: '#a0754b', woodShade: '#6f4d30',
      red: '#b8392a', gold: '#d9a441', lava: '#e0592f', smoke: 'rgba(110,100,92,0.45)', crystal: '#a4d3ee', crystalShade: '#5d97c4',
      glow: 'rgba(160,130,255,0.45)', field: '#dccb86', field2: '#bdb66d', serpent: '#5f8f7e', serpentShade: '#3f6b5d',
    },
    atlas: {
      ink: '#26313a', paper: '#ffffff', hatch: 'rgba(38,49,58,0.45)',
      rock: '#e3d3b3', rockShade: '#a98b66', rockDark: '#7c654a', snow: '#ffffff', snowShade: '#d0dbe7',
      hill: '#cfd89a', hillShade: '#9fab68', leaf: '#77b05f', leafShade: '#4b8540', leafHi: '#a6d389',
      conifer: '#4f9160', coniferShade: '#2f6a41', jungle: '#3f9150', jungleShade: '#256935', trunk: '#6b4a30',
      dead: '#6a5848', grass: '#5f9a48', sand: '#f0d896', sandShade: '#d0ae62', stone: '#c3c0b8', stoneShade: '#8a877f',
      wall: '#fbf6ea', wallShade: '#d8ccb2', roof: '#c4452f', roofShade: '#8f2f1f', roof2: '#3f68a8', roof2Shade: '#2c4b7c',
      roofJ: '#3d434d', roofJShade: '#272b31', water: '#2f78b7', waterLight: '#a9d3f0', foam: '#ffffff', wood: '#a3713f', woodShade: '#6c4a2a',
      red: '#c62f26', gold: '#e0a92e', lava: '#ee5a24', smoke: 'rgba(90,90,96,0.45)', crystal: '#8fd0f5', crystalShade: '#3f8cc8',
      glow: 'rgba(150,110,255,0.5)', field: '#e3d27e', field2: '#b8c460', serpent: '#2f8f78', serpentShade: '#1f6655',
    },
    mono: {
      ink: '#26211d', paper: '#fdfbf6', hatch: 'rgba(38,33,29,0.6)',
      rock: '#fdfbf6', rockShade: '#d8d2c7', rockDark: '#a9a296', snow: '#ffffff', snowShade: '#e6e3dd',
      hill: '#fbf8f1', hillShade: '#dcd6cb', leaf: '#f6f3ec', leafShade: '#cdc7bc', leafHi: '#ffffff',
      conifer: '#f3f0e8', coniferShade: '#c9c3b8', jungle: '#ede9e0', jungleShade: '#bfb8ac', trunk: '#4a423b',
      dead: '#4a423b', grass: '#5b534b', sand: '#faf6ec', sandShade: '#ddd5c4', stone: '#f1eee7', stoneShade: '#c8c2b7',
      wall: '#ffffff', wallShade: '#dedad2', roof: '#cfc9be', roofShade: '#a7a094', roof2: '#cfc9be', roof2Shade: '#a7a094',
      roofJ: '#8d877e', roofJShade: '#6c665e', water: '#5a544d', waterLight: '#ece8df', foam: '#ffffff', wood: '#cfc6b8', woodShade: '#a39a8c',
      red: '#5a524a', gold: '#bcb3a4', lava: '#8a8178', smoke: 'rgba(80,74,68,0.35)', crystal: '#f2f0ea', crystalShade: '#c4beb3',
      glow: 'rgba(60,60,60,0.18)', field: '#f1ece0', field2: '#ddd6c6', serpent: '#e9e5dc', serpentShade: '#bdb7ab',
    },
  };

  // ───── 描画の道具 ─────
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
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const TAU = Math.PI * 2;
  function jit(rnd, a) { return (rnd() - 0.5) * 2 * a; }
  function poly(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  }
  function fs(ctx, fill, ink, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (ink) { ctx.strokeStyle = ink; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  function circ(x, y, r) { return (c) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }; }
  function shapePoly(pts) { return (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }; }
  /** 複数の図形を合体させ、外周だけに線を引く */
  function union(ctx, shapes, fill, ink, lw) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = (lw || 1) * 2;
    shapes.forEach((s) => { ctx.beginPath(); s(ctx); ctx.stroke(); });
    ctx.fillStyle = fill;
    shapes.forEach((s) => { ctx.beginPath(); s(ctx); ctx.fill(); });
  }
  function clipShapes(ctx, shapes) { ctx.beginPath(); shapes.forEach((s) => s(ctx)); ctx.clip(); }
  function ridge(rnd, a, b, n, amp) {
    const pts = [a];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([a[0] + (b[0] - a[0]) * t + jit(rnd, amp), a[1] + (b[1] - a[1]) * t + jit(rnd, amp * 0.7)]);
    }
    pts.push(b);
    return pts;
  }
  function along(pts, t) {
    const f = t * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const u = f - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
  }

  // ───── 山・丘 ─────
  /** 稜線を少しだけぎざぎざにした折れ線（端点は固定） */
  function jag(rnd, a, b, n, amp, bow) {
    const pts = [a];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const nx = -(b[1] - a[1]);
      const ny = b[0] - a[0];
      const L = Math.hypot(nx, ny) || 1;
      // bow > 0 で斜面を内側へ少しへこませる（山らしい反り）
      const k = jit(rnd, amp) + (bow || 0) * Math.sin(Math.PI * t) * len;
      pts.push([a[0] + (b[0] - a[0]) * t + (nx / L) * k, a[1] + (b[1] - a[1]) * t + (ny / L) * k]);
    }
    pts.push(b);
    return pts;
  }

  /**
   * 山：裾の広い形に、肩（小さな峰）を1つ付けることがある。光の当たる左面は明るく、
   * 右面は陰にして斜線を入れる。雪は形に沿ったぎざぎざの縁。足もとに薄い影を落とす。
   */
  function mountain(ctx, rnd, C, o) {
    o = o || {};
    const W = (o.w || 15) * (0.88 + rnd() * 0.28);
    const Hh = (o.h || 23) * (0.88 + rnd() * 0.26);
    const px = jit(rnd, W * 0.14);
    const peak = [px, -Hh];
    // 足もとの影（地面になじませる）
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(W * 0.18, 0.6, W * 1.08, Math.max(2, W * 0.16), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // 輪郭（左の裾 → 左肩 → 頂 → 右肩 → 右の裾）
    const shoulderL = rnd() < 0.45;
    const shoulderR = !shoulderL && rnd() < 0.55;
    let left = [];
    if (shoulderL) {
      const s = [-W * (0.5 + rnd() * 0.12), -Hh * (0.48 + rnd() * 0.14)];
      const dip = [s[0] + (px - s[0]) * 0.45, s[1] + (peak[1] - s[1]) * 0.25 + Hh * 0.06];
      left = jag(rnd, [-W, 0], s, 4, W * 0.05, 0.05).concat(jag(rnd, s, dip, 2, W * 0.03).slice(1), jag(rnd, dip, peak, 4, W * 0.05, 0.04).slice(1));
    } else {
      left = jag(rnd, [-W, 0], peak, 8, W * 0.055, 0.07);
    }
    let right = [];
    if (shoulderR) {
      const s = [W * (0.52 + rnd() * 0.12), -Hh * (0.46 + rnd() * 0.14)];
      const dip = [px + (s[0] - px) * 0.55, peak[1] + (s[1] - peak[1]) * 0.75 + Hh * 0.06];
      right = jag(rnd, peak, dip, 4, W * 0.05, 0.04).concat(jag(rnd, dip, s, 2, W * 0.03).slice(1), jag(rnd, s, [W, 0], 4, W * 0.05, 0.05).slice(1));
    } else {
      right = jag(rnd, peak, [W, 0], 8, W * 0.055, 0.07);
    }
    const body = left.concat(right.slice(1));
    // 稜線（頂から裾へ下りる尾根。ここから右が陰）
    const foot = [px + W * (0.12 + rnd() * 0.16), 0];
    const spine = jag(rnd, peak, foot, 5, W * 0.06);
    poly(ctx, body, true);
    fs(ctx, C.rock);
    const shade = right.concat(spine.slice().reverse().slice(1));
    ctx.save();
    poly(ctx, body, true);
    ctx.clip();
    poly(ctx, shade, true);
    fs(ctx, C.rockShade);
    // 陰の面の斜線（尾根から外へ、斜面に沿って）
    ctx.strokeStyle = C.hatch;
    ctx.lineWidth = 0.5;
    const nH = 7;
    for (let k = 0; k < nH; k++) {
      const t = 0.16 + (k / nH) * 0.8;
      const a = along(spine, t);
      const b = along(right, t);
      const len = 0.35 + rnd() * 0.35;
      line(ctx, a[0] + (b[0] - a[0]) * 0.08, a[1] + 0.4, a[0] + (b[0] - a[0]) * len, a[1] + (b[1] - a[1]) * len + 1.2 + Hh * 0.03);
    }
    // 明るい面の短い筋（岩肌）
    ctx.lineWidth = 0.4;
    for (let k = 0; k < 3; k++) {
      const a = along(left, 0.3 + k * 0.2 + jit(rnd, 0.04));
      line(ctx, a[0] + 1.2, a[1] + 1.1, a[0] + 3 + rnd() * 1.5, a[1] + 3.2 + rnd() * 1.4);
    }
    // 雪
    if (o.snow) {
      const cut = (o.snowCut || 0.42) + rnd() * 0.12; // 頂からどこまで雪か（高さの割合）
      const yLine = peak[1] + Hh * cut;
      const lp = left.reduce((best, q) => (Math.abs(q[1] - yLine) < Math.abs(best[1] - yLine) ? q : best), left[0]);
      const rp = right.reduce((best, q) => (Math.abs(q[1] - yLine) < Math.abs(best[1] - yLine) ? q : best), right[right.length - 1]);
      const iL = left.indexOf(lp);
      const iR = right.indexOf(rp);
      const cap = left.slice(iL).concat(right.slice(1, iR + 1));
      // 雪の下の縁：ぎざぎざ（谷に向かって垂れる）
      const n = 8;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = rp[0] + (lp[0] - rp[0]) * t;
        const y = rp[1] + (lp[1] - rp[1]) * t + (i % 2 ? Hh * (0.1 + rnd() * 0.1) : -Hh * (0.02 + rnd() * 0.03));
        cap.push([x, y]);
      }
      poly(ctx, cap, true);
      fs(ctx, C.snow);
      ctx.save();
      poly(ctx, cap, true);
      ctx.clip();
      poly(ctx, shade, true);
      fs(ctx, C.snowShade);
      ctx.restore();
    }
    ctx.restore();
    // 輪郭と尾根の線
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = o.lw || 0.95;
    poly(ctx, body, false);
    ctx.stroke();
    ctx.lineWidth = 0.55;
    poly(ctx, spine.slice(0, 4), false);
    ctx.stroke();
  }

  function volcano(ctx, rnd, C) {
    const W = 15;
    const Hh = 20;
    const L = ridge(rnd, [-W, 0], [-4, -Hh], 3, 1);
    const R = ridge(rnd, [4, -Hh], [W, 0], 3, 1);
    poly(ctx, L.concat(R), true);
    fs(ctx, C.rockDark);
    poly(ctx, [[0.5, -Hh + 1]].concat(R, [[3, 0]]), true);
    fs(ctx, 'rgba(0,0,0,0.18)');
    // 溶岩
    ctx.strokeStyle = C.lava;
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) {
      const x0 = -2.5 + k * 2.5;
      ctx.beginPath();
      ctx.moveTo(x0, -Hh + 0.5);
      ctx.quadraticCurveTo(x0 + jit(rnd, 3), -Hh * 0.55, x0 * 2.2 + jit(rnd, 2), -Hh * (0.15 + rnd() * 0.2));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, -Hh, 4.2, 1.3, 0, 0, TAU);
    fs(ctx, C.lava, C.ink, 0.8);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.15;
    poly(ctx, L, false);
    ctx.stroke();
    poly(ctx, R, false);
    ctx.stroke();
    // 煙
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(jit(rnd, 2) + k * 1.2, -Hh - 4 - k * 4, 2.6 + k * 0.8, 0, TAU);
      fs(ctx, C.smoke);
    }
  }

  function mesa(ctx, rnd, C) {
    const W = 15;
    const Hh = 10 + rnd() * 3;
    const top = ridge(rnd, [-W * 0.62, -Hh], [W * 0.6, -Hh], 4, 0.6);
    const body = [[-W, 0]].concat(top, [[W, 0]]);
    poly(ctx, body, true);
    fs(ctx, C.sand);
    poly(ctx, [top[top.length - 1], [W, 0], [W * 0.3, 0], [W * 0.25, -Hh]], true);
    fs(ctx, C.sandShade);
    ctx.strokeStyle = C.hatch;
    ctx.lineWidth = 0.5;
    for (let k = 1; k < 4; k++) line(ctx, -W + k * 1.5, -k * Hh / 4, W * 0.55 - k, -k * Hh / 4);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.1;
    poly(ctx, body, false);
    ctx.stroke();
  }

  function hill(ctx, rnd, C) {
    const W = 12 + rnd() * 4;
    const Hh = 6.5 + rnd() * 3;
    const px = jit(rnd, 2.5);
    const top = (c) => { c.moveTo(-W, 0); c.bezierCurveTo(-W * 0.6, -Hh * 1.05, px - W * 0.2, -Hh * 1.32, px + W * 0.12, -Hh * 1.25); c.bezierCurveTo(px + W * 0.45, -Hh * 1.2, W * 0.7, -Hh * 0.75, W, 0); };
    // 足もとの影
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(W * 0.15, 0.5, W * 1.05, 2.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    top(ctx);
    ctx.closePath();
    fs(ctx, C.hill);
    ctx.save();
    ctx.beginPath();
    top(ctx);
    ctx.closePath();
    ctx.clip();
    // 右側の陰
    ctx.beginPath();
    ctx.ellipse(W * 0.75 + px * 0.3, -Hh * 0.05, W * 0.75, Hh * 1.5, -0.25, 0, TAU);
    fs(ctx, C.hillShade);
    ctx.strokeStyle = C.hatch;
    ctx.lineWidth = 0.45;
    for (let k = 0; k < 4; k++) line(ctx, W * 0.18 + k * 2.3 + px * 0.3, -Hh * 0.9 + k * 1.2, W * 0.26 + k * 2.5 + px * 0.3, -Hh * 0.45 + k * 0.9);
    ctx.restore();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    top(ctx);
    ctx.stroke();
    // 草のしるし
    ctx.lineWidth = 0.45;
    ctx.strokeStyle = C.hatch;
    for (let k = 0; k < 2; k++) {
      const gx = -W * 0.45 + k * W * 0.35 + jit(rnd, 1.5);
      line(ctx, gx, -1, gx - 0.8, -2.6);
      line(ctx, gx + 0.8, -1, gx + 1.1, -2.8);
    }
  }

  function rocks(ctx, rnd, C) {
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const cx = (i - (n - 1) / 2) * 5 + jit(rnd, 1);
      const w = 3 + rnd() * 2.5;
      const hh = 4 + rnd() * 4;
      const pts = [[cx - w, 0], [cx - w * 0.8 + jit(rnd, 0.8), -hh * 0.7], [cx + jit(rnd, 1), -hh], [cx + w * 0.8, -hh * 0.6], [cx + w, 0]];
      poly(ctx, pts, true);
      fs(ctx, C.stone, C.ink, 0.9);
      poly(ctx, [pts[2], pts[3], pts[4], [cx + 0.5, 0]], true);
      fs(ctx, C.stoneShade);
      poly(ctx, pts, false);
      fs(ctx, null, C.ink, 0.9);
    }
  }

  function dune(ctx, rnd, C) {
    const W = 11 + rnd() * 4;
    const Hh = 4 + rnd() * 2;
    ctx.beginPath();
    ctx.moveTo(-W, 0);
    ctx.quadraticCurveTo(-W * 0.2, -Hh * 2, W * 0.3, -Hh * 0.6);
    ctx.quadraticCurveTo(W * 0.7, -Hh * 0.2, W, 0);
    ctx.closePath();
    fs(ctx, C.sand);
    ctx.beginPath();
    ctx.moveTo(W * 0.3, -Hh * 0.6);
    ctx.quadraticCurveTo(W * 0.7, -Hh * 0.2, W, 0);
    ctx.lineTo(W * 0.1, 0);
    ctx.closePath();
    fs(ctx, C.sandShade);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-W, 0);
    ctx.quadraticCurveTo(-W * 0.2, -Hh * 2, W * 0.3, -Hh * 0.6);
    ctx.stroke();
  }

  // ───── 木・植物 ─────
  function treeRound(ctx, rnd, C, o) {
    o = o || {};
    const r = (o.r || 3.5) * (0.85 + rnd() * 0.3);
    const cy = -r - (o.trunk || 2.6);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.7;
    line(ctx, 0, 0, 0, cy + r * 0.3);
    ctx.strokeStyle = C.trunk;
    ctx.lineWidth = 0.8;
    line(ctx, 0, -0.3, 0, cy + r * 0.3);
    const lobes = [circ(jit(rnd, 0.3), cy, r), circ(-r * 0.55 + jit(rnd, 0.3), cy + r * 0.25, r * 0.72), circ(r * 0.55 + jit(rnd, 0.3), cy + r * 0.3, r * 0.74), circ(jit(rnd, 0.4), cy - r * 0.45, r * 0.72)];
    union(ctx, lobes, o.fill || C.leaf, C.ink, 0.6);
    ctx.save();
    clipShapes(ctx, lobes);
    ctx.beginPath();
    ctx.arc(r * 0.75, cy + r * 0.55, r * 1.05, 0, TAU);
    fs(ctx, o.shade || C.leafShade);
    ctx.beginPath();
    ctx.arc(-r * 0.35, cy - r * 0.35, r * 0.38, 0, TAU);
    fs(ctx, o.hi || C.leafHi);
    ctx.restore();
  }

  function conifer(ctx, rnd, C, o) {
    o = o || {};
    const h = (o.h || 11) * (0.85 + rnd() * 0.3);
    const w = h * 0.36;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6;
    line(ctx, 0, 0, 0, -2);
    const tiers = [];
    for (let i = 0; i < 3; i++) {
      const base = -1.8 - i * h * 0.27;
      const ww = w * (1 - i * 0.24);
      tiers.push(shapePoly([[-ww, base], [0, base - h * 0.5], [ww, base]]));
    }
    union(ctx, tiers, o.fill || C.conifer, C.ink, 0.55);
    ctx.save();
    clipShapes(ctx, tiers);
    poly(ctx, [[0.2, -h * 1.2], [w * 1.3, -h * 1.2], [w * 1.3, 0], [0.8, 0]], true);
    fs(ctx, o.shade || C.coniferShade);
    ctx.restore();
    if (o.snow) {
      ctx.save();
      clipShapes(ctx, tiers);
      for (let i = 0; i < 3; i++) {
        const base = -1.8 - i * h * 0.27;
        ctx.beginPath();
        ctx.ellipse(0, base - h * 0.42, w * (0.5 - i * 0.1), h * 0.12, 0, 0, TAU);
        fs(ctx, C.snow);
      }
      ctx.restore();
    }
  }

  function palm(ctx, rnd, C) {
    const lean = jit(rnd, 2.5);
    const top = [lean, -12];
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(lean * 0.2, -6, top[0], top[1]);
    ctx.stroke();
    ctx.strokeStyle = C.trunk;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.62 + jit(rnd, 0.1);
      const len = 6 + rnd() * 2;
      const ex = top[0] + Math.cos(a) * len;
      const ey = top[1] + Math.sin(a) * len * 0.75 + 2.5;
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      ctx.quadraticCurveTo(top[0] + Math.cos(a) * len * 0.6, top[1] + Math.sin(a) * len * 0.6 - 2.5, ex, ey);
      ctx.quadraticCurveTo(top[0] + Math.cos(a) * len * 0.45, top[1] + Math.sin(a) * len * 0.45 - 0.5, top[0], top[1]);
      fs(ctx, k % 2 ? C.jungle : C.leaf, C.ink, 0.55);
    }
  }

  function deadTree(ctx, rnd, C) {
    ctx.strokeStyle = C.ink;
    ctx.lineCap = 'round';
    const branch = (x, y, a, len, w, d) => {
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      ctx.lineWidth = w;
      line(ctx, x, y, x2, y2);
      if (d > 0) {
        branch(x2, y2, a - 0.5 + jit(rnd, 0.15), len * 0.68, w * 0.65, d - 1);
        branch(x2, y2, a + 0.45 + jit(rnd, 0.15), len * 0.62, w * 0.65, d - 1);
      }
    };
    branch(0, 0, -Math.PI / 2 + jit(rnd, 0.1), 5.5, 1.6, 3);
  }

  function bush(ctx, rnd, C) {
    const lobes = [circ(-2, -2.2, 2.3), circ(1.8, -2.4, 2.5), circ(0, -3.8, 2.2)];
    union(ctx, lobes, C.leaf, C.ink, 0.55);
    ctx.save();
    clipShapes(ctx, lobes);
    ctx.beginPath();
    ctx.arc(2.5, -1, 2.6, 0, TAU);
    fs(ctx, C.leafShade);
    ctx.restore();
  }

  function grassTuft(ctx, rnd, C) {
    ctx.strokeStyle = C.grass;
    ctx.lineWidth = 0.75;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.32 + jit(rnd, 0.08);
      const len = 3 + rnd() * 2.2;
      ctx.beginPath();
      ctx.moveTo((k - 2) * 0.6, 0);
      ctx.quadraticCurveTo((k - 2) * 0.6 + Math.cos(a) * len * 0.4, -len * 0.6, (k - 2) * 0.6 + Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
    }
  }

  function reeds(ctx, rnd, C) {
    ctx.strokeStyle = C.water;
    ctx.lineWidth = 0.7;
    line(ctx, -6, 0.6, -1.5, 0.6);
    line(ctx, 1, 1.4, 5.5, 1.4);
    ctx.strokeStyle = C.grass;
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 4; k++) {
      const x = -3 + k * 2 + jit(rnd, 0.4);
      const hh = 4 + rnd() * 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + 0.3, -hh * 0.6, x + jit(rnd, 1), -hh);
      ctx.stroke();
      if (k % 2 === 0) {
        ctx.beginPath();
        ctx.ellipse(x + 0.1, -hh * 0.75, 0.5, 1.3, 0, 0, TAU);
        fs(ctx, C.trunk);
      }
    }
  }

  function giantTree(ctx, rnd, C) {
    ctx.save();
    ctx.scale(2.6, 2.6);
    treeRound(ctx, rnd, C, { r: 4.2, trunk: 3.6, fill: C.jungle, shade: C.jungleShade });
    ctx.restore();
    // 根
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 0.8, -2);
      ctx.quadraticCurveTo(k * 2.5, -0.5, k * 4.5, 0.6);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,240,170,0.9)';
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.arc(jit(rnd, 7), -18 - rnd() * 14, 0.6, 0, TAU);
      ctx.fill();
    }
  }

  // ───── 建物 ─────
  /** 2.5D の家（x,y は正面の下端中央） */
  function house(ctx, C, x, y, w, h, roof, roofShade, d) {
    d = d == null ? w * 0.45 : d;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const top = y - h;
    const ridgeY = top - w * 0.5;
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = C.ink;
    poly(ctx, [[x1, y], [x1 + d, y - d * 0.5], [x1 + d, top - d * 0.5], [x1, top]], true);
    fs(ctx, C.wallShade, C.ink, 0.7);
    poly(ctx, [[x0, y], [x1, y], [x1, top], [x0, top]], true);
    fs(ctx, C.wall, C.ink, 0.7);
    poly(ctx, [[x, ridgeY], [x + d, ridgeY - d * 0.5], [x1 + d + 0.5, top - d * 0.5], [x1 + 0.5, top]], true);
    fs(ctx, roofShade, C.ink, 0.7);
    poly(ctx, [[x0 - 0.6, top], [x, ridgeY], [x1 + 0.6, top]], true);
    fs(ctx, roof, C.ink, 0.7);
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - w * 0.12, y - h * 0.55, w * 0.24, h * 0.55);
  }

  function towerShape(ctx, C, x, y, w, h, roof, roofShade, opts) {
    opts = opts || {};
    const x0 = x - w / 2;
    const top = y - h;
    poly(ctx, [[x0, y], [x0 + w, y], [x0 + w, top], [x0, top]], true);
    fs(ctx, C.wall);
    poly(ctx, [[x, y], [x0 + w, y], [x0 + w, top], [x, top]], true);
    fs(ctx, C.wallShade);
    poly(ctx, [[x0, y], [x0 + w, y], [x0 + w, top], [x0, top]], true);
    fs(ctx, null, C.ink, 0.75);
    if (opts.flat) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === 2 ? C.wallShade : C.wall;
        ctx.fillRect(x0 + i * w / 3 + 0.2, top - 1.4, w / 3 - 0.9, 1.4);
        ctx.strokeRect(x0 + i * w / 3 + 0.2, top - 1.4, w / 3 - 0.9, 1.4);
      }
    } else {
      poly(ctx, [[x0 - 0.8, top], [x, top - w * 1.25], [x0 + w + 0.8, top]], true);
      fs(ctx, roof, C.ink, 0.7);
      poly(ctx, [[x, top - w * 1.25], [x0 + w + 0.8, top], [x + 0.3, top]], true);
      fs(ctx, roofShade, C.ink, 0.7);
      if (opts.flag) {
        ctx.lineWidth = 0.6;
        line(ctx, x, top - w * 1.25, x, top - w * 1.25 - 4);
        poly(ctx, [[x, top - w * 1.25 - 4], [x + 3.2, top - w * 1.25 - 3.2], [x, top - w * 1.25 - 2.4]], true);
        fs(ctx, C.red, C.ink, 0.4);
      }
    }
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - 0.45, top + h * 0.28, 0.9, 1.6);
  }

  function wallSeg(ctx, C, x0, y0, x1, y1, hh) {
    poly(ctx, [[x0, y0], [x1, y1], [x1, y1 - hh], [x0, y0 - hh]], true);
    fs(ctx, C.stone, C.ink, 0.65);
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.8));
    ctx.fillStyle = C.stone;
    for (let i = 0; i < n; i += 2) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const ax = x0 + (x1 - x0) * t0;
      const ay = y0 + (y1 - y0) * t0 - hh;
      const bx = x0 + (x1 - x0) * t1;
      const by = y0 + (y1 - y0) * t1 - hh;
      poly(ctx, [[ax, ay], [bx, by], [bx, by - 1.2], [ax, ay - 1.2]], true);
      fs(ctx, C.stone, C.ink, 0.5);
    }
  }

  function castle(ctx, rnd, C) {
    wallSeg(ctx, C, -11, 0, 11, 0, 5);
    towerShape(ctx, C, -10, 1, 4.2, 11, C.roof, C.roofShade, { flag: false });
    towerShape(ctx, C, 10, 1, 4.2, 11, C.roof, C.roofShade, {});
    towerShape(ctx, C, 0, -1.5, 7, 15, C.roof2, C.roof2Shade, { flag: true });
    towerShape(ctx, C, -4.5, 0.5, 3.2, 9, C.roof2, C.roof2Shade, {});
    towerShape(ctx, C, 4.5, 0.5, 3.2, 9, C.roof2, C.roof2Shade, {});
    ctx.beginPath();
    ctx.arc(0, -1.5, 1.6, Math.PI, 0);
    ctx.lineTo(1.6, -1.5);
    fs(ctx, C.ink);
  }

  function city(ctx, rnd, C) {
    const back = [];
    for (let i = 0; i < 7; i++) back.push([-11 + i * 3.6 + jit(rnd, 0.6), -5 - rnd() * 2.5]);
    back.forEach(([x, y], i) => house(ctx, C, x, y, 3.2 + rnd() * 1.2, 2.6 + rnd() * 1.5, i % 3 === 0 ? C.roof2 : C.roof, i % 3 === 0 ? C.roof2Shade : C.roofShade, 1.4));
    towerShape(ctx, C, -3, -3.5, 3.4, 12, C.roof2, C.roof2Shade, { flag: true });
    towerShape(ctx, C, 6, -3, 2.6, 9, C.roof, C.roofShade, {});
    for (let i = 0; i < 5; i++) {
      const x = -9 + i * 4.3 + jit(rnd, 0.5);
      house(ctx, C, x, -0.8 + jit(rnd, 0.4), 3.6, 3.2 + rnd(), i % 2 ? C.roof : C.roof2, i % 2 ? C.roofShade : C.roof2Shade, 1.5);
    }
    wallSeg(ctx, C, -13, 1.5, 13, 1.5, 2.6);
    towerShape(ctx, C, -13, 2.2, 2.6, 5, C.roof, C.roofShade, { flat: true });
    towerShape(ctx, C, 13, 2.2, 2.6, 5, C.roof, C.roofShade, { flat: true });
  }

  function town(ctx, rnd, C) {
    towerShape(ctx, C, 1.5, -2.5, 2.6, 10, C.roof2, C.roof2Shade, {});
    const spots = [[-7, -2.5], [-2.5, -3], [5.5, -2.2], [-5, 0.8], [0, 1], [5, 1.2]];
    spots.forEach(([x, y], i) => house(ctx, C, x + jit(rnd, 0.5), y, 3.6 + rnd(), 3 + rnd() * 1.2, i % 3 === 1 ? C.roof2 : C.roof, i % 3 === 1 ? C.roof2Shade : C.roofShade, 1.6));
  }

  function village(ctx, rnd, C) {
    house(ctx, C, -4 + jit(rnd, 0.5), -1.5, 4, 3.2, C.roof, C.roofShade, 1.8);
    house(ctx, C, 3.5 + jit(rnd, 0.5), -2.3, 3.6, 3, C.roof, C.roofShade, 1.6);
    house(ctx, C, 0 + jit(rnd, 0.5), 1, 3.8, 3.2, C.wood, C.woodShade, 1.7);
  }

  function houseAsset(ctx, rnd, C) {
    house(ctx, C, 0, 0, 5.5, 4.5, rnd() < 0.5 ? C.roof : C.roof2, rnd() < 0.5 ? C.roofShade : C.roof2Shade, 2.4);
  }

  function tower(ctx, rnd, C) {
    towerShape(ctx, C, 0, 0, 4.4, 17, C.roof2, C.roof2Shade, { flag: true });
    ctx.fillStyle = C.ink;
    ctx.fillRect(-0.5, -12, 1, 2);
  }

  function fort(ctx, rnd, C) {
    wallSeg(ctx, C, -10, -3, 0, -7, 4);
    wallSeg(ctx, C, 0, -7, 10, -3, 4);
    towerShape(ctx, C, 0, -6.5, 4, 9, C.wood, C.woodShade, {});
    wallSeg(ctx, C, -10, -3, 0, 1, 4);
    wallSeg(ctx, C, 0, 1, 10, -3, 4);
    towerShape(ctx, C, -10, -2.5, 3, 7, C.wood, C.woodShade, { flat: true });
    towerShape(ctx, C, 10, -2.5, 3, 7, C.wood, C.woodShade, { flat: true });
    towerShape(ctx, C, 0, 1.5, 3, 7, C.wood, C.woodShade, { flat: true });
  }

  function temple(ctx, rnd, C) {
    poly(ctx, [[-11, 0], [11, 0], [10, -2], [-10, -2]], true);
    fs(ctx, C.stone, C.ink, 0.7);
    for (let i = 0; i < 6; i++) {
      const x = -8 + i * 3.2;
      poly(ctx, [[x - 0.9, -2], [x + 0.9, -2], [x + 0.9, -10], [x - 0.9, -10]], true);
      fs(ctx, i > 2 ? C.wallShade : C.wall, C.ink, 0.6);
    }
    poly(ctx, [[-10.5, -10], [10.5, -10], [10.5, -11.5], [-10.5, -11.5]], true);
    fs(ctx, C.wall, C.ink, 0.7);
    poly(ctx, [[-11.5, -11.5], [0, -16.5], [11.5, -11.5]], true);
    fs(ctx, C.wall, C.ink, 0.8);
    poly(ctx, [[0, -16.5], [11.5, -11.5], [0, -11.5]], true);
    fs(ctx, C.wallShade);
    poly(ctx, [[-11.5, -11.5], [0, -16.5], [11.5, -11.5]], true);
    fs(ctx, null, C.ink, 0.8);
  }

  function church(ctx, rnd, C) {
    house(ctx, C, 2.5, 0, 9, 5.5, C.roof2, C.roof2Shade, 3);
    towerShape(ctx, C, -4.5, 0.5, 4, 11, C.roof2, C.roof2Shade, {});
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.7;
    line(ctx, -4.5, -15.5, -4.5, -18.5);
    line(ctx, -5.6, -17.4, -3.4, -17.4);
  }

  function windmill(ctx, rnd, C) {
    poly(ctx, [[-3.5, 0], [3.5, 0], [2.2, -11], [-2.2, -11]], true);
    fs(ctx, C.wall, C.ink, 0.75);
    poly(ctx, [[0, 0], [3.5, 0], [2.2, -11], [0, -11]], true);
    fs(ctx, C.wallShade);
    poly(ctx, [[-3.5, 0], [3.5, 0], [2.2, -11], [-2.2, -11]], true);
    fs(ctx, null, C.ink, 0.75);
    poly(ctx, [[-2.8, -11], [0, -14], [2.8, -11]], true);
    fs(ctx, C.roof, C.ink, 0.7);
    const a0 = rnd() * Math.PI / 2;
    for (let k = 0; k < 4; k++) {
      const a = a0 + k * Math.PI / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pts = [[0, -11.5], [ca * 10 - sa * 0.9, -11.5 + sa * 10 + ca * 0.9], [ca * 10 + sa * 0.9, -11.5 + sa * 10 - ca * 0.9]];
      poly(ctx, [[0, -11.5], [ca * 2.5 + sa * 1.6, -11.5 + sa * 2.5 - ca * 1.6], pts[2], pts[1], [ca * 2.5 - sa * 1.6, -11.5 + sa * 2.5 + ca * 1.6]], true);
      fs(ctx, C.wall, C.ink, 0.55);
    }
    ctx.beginPath();
    ctx.arc(0, -11.5, 0.9, 0, TAU);
    fs(ctx, C.ink);
  }

  function lighthouse(ctx, rnd, C) {
    poly(ctx, [[-6, 0], [6, 0], [4.5, -2.5], [-4.5, -2.5]], true);
    fs(ctx, C.stone, C.ink, 0.7);
    poly(ctx, [[-3, -2.5], [3, -2.5], [2, -17], [-2, -17]], true);
    fs(ctx, C.wall, C.ink, 0.75);
    for (let i = 0; i < 3; i++) {
      const y0 = -4.5 - i * 4.5;
      poly(ctx, [[-2.85 + i * 0.3, y0], [2.85 - i * 0.3, y0], [2.7 - i * 0.3, y0 - 2], [-2.7 + i * 0.3, y0 - 2]], true);
      fs(ctx, C.red, C.ink, 0.5);
    }
    poly(ctx, [[-2.4, -17], [2.4, -17], [2.4, -20], [-2.4, -20]], true);
    fs(ctx, C.gold, C.ink, 0.7);
    poly(ctx, [[-2.8, -20], [0, -22.5], [2.8, -20]], true);
    fs(ctx, C.roof, C.ink, 0.7);
    ctx.strokeStyle = 'rgba(240,200,80,0.7)';
    ctx.lineWidth = 0.9;
    [[-1, -0.25], [-1, 0.15], [1, -0.25], [1, 0.15]].forEach(([sx, sy]) => line(ctx, sx * 3.5, -18.5, sx * 11, -18.5 + sy * 22));
  }

  function farm(ctx, rnd, C) {
    const fields = [[-12, -6, 9, 5], [-2, -7, 8, 5.5], [-11, 0, 8, 4.5], [7, -5, 6, 5]];
    fields.forEach(([x, y, w, hh], i) => {
      poly(ctx, [[x, y + hh], [x + w, y + hh], [x + w + 1.5, y], [x + 1.5, y]], true);
      fs(ctx, i % 2 ? C.field : C.field2, C.ink, 0.55);
      ctx.strokeStyle = C.hatch;
      ctx.lineWidth = 0.45;
      for (let k = 1; k < 5; k++) line(ctx, x + k * w / 5, y + hh, x + 1.5 + k * w / 5, y);
    });
    house(ctx, C, 4, 1.5, 5.5, 4, C.roof, C.roofShade, 2);
  }

  function camp(ctx, rnd, C) {
    const tent = (x, y, w, hh, col) => {
      poly(ctx, [[x - w, y], [x, y - hh], [x + w, y]], true);
      fs(ctx, col, C.ink, 0.7);
      poly(ctx, [[x, y - hh], [x + w, y], [x + 0.5, y]], true);
      fs(ctx, 'rgba(0,0,0,0.15)');
      ctx.fillStyle = C.ink;
      poly(ctx, [[x - 0.8, y], [x, y - hh * 0.45], [x + 0.8, y]], true);
      ctx.fill();
    };
    tent(-5, -2, 4, 6, C.wall);
    tent(4.5, -3, 3.6, 5.5, C.field);
    tent(0, 1.5, 3.8, 5.5, C.wall);
    ctx.beginPath();
    ctx.moveTo(8, 2);
    ctx.quadraticCurveTo(9.5, -1, 9, -3);
    ctx.quadraticCurveTo(11, -0.5, 10, 2);
    ctx.closePath();
    fs(ctx, C.lava, C.ink, 0.5);
  }

  function port(ctx, rnd, C) {
    ctx.strokeStyle = C.waterLight;
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 3; k++) line(ctx, -12 + k * 3, 3 + k, -6 + k * 3, 3 + k);
    poly(ctx, [[-3, 4.5], [10, 4.5], [10, 2.5], [-3, 2.5]], true);
    fs(ctx, C.wood, C.ink, 0.6);
    for (let k = 0; k < 5; k++) line(ctx, -1 + k * 2.6, 2.5, -1 + k * 2.6, 4.5);
    house(ctx, C, -6, 0, 5, 3.6, C.roof, C.roofShade, 2);
    ship(ctx, rnd, C, 6.5, 1.8, 0.55);
  }

  function bridge(ctx, rnd, C) {
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(0, -9, 12, 0);
    ctx.lineTo(12, -2.5);
    ctx.quadraticCurveTo(0, -11.5, -12, -2.5);
    ctx.closePath();
    fs(ctx, C.stone, C.ink, 0.8);
    ctx.beginPath();
    ctx.moveTo(-6.5, -2.2);
    ctx.quadraticCurveTo(0, -6.2, 6.5, -2.2);
    ctx.lineTo(6.5, 0);
    ctx.lineTo(-6.5, 0);
    ctx.closePath();
    fs(ctx, C.waterLight, C.ink, 0.6);
  }

  // ───── 和風 ─────
  function jRoof(ctx, C, x, y, w, hh) {
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.55, y - hh * 0.35, x - w * 0.35, y - hh);
    ctx.lineTo(x + w * 0.35, y - hh);
    ctx.quadraticCurveTo(x + w * 0.55, y - hh * 0.35, x + w, y);
    ctx.quadraticCurveTo(x, y - hh * 0.35, x - w, y);
    ctx.closePath();
    fs(ctx, C.roofJ, C.ink, 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + w * 0.35, y - hh);
    ctx.quadraticCurveTo(x + w * 0.55, y - hh * 0.35, x + w, y);
    ctx.quadraticCurveTo(x + w * 0.5, y - hh * 0.25, x, y - hh * 0.2);
    ctx.closePath();
    fs(ctx, C.roofJShade);
  }

  function jCastle(ctx, rnd, C) {
    poly(ctx, [[-11, 0], [11, 0], [8.5, -6], [-8.5, -6]], true);
    fs(ctx, C.stone, C.ink, 0.8);
    ctx.strokeStyle = C.hatch;
    ctx.lineWidth = 0.4;
    for (let k = 1; k < 3; k++) line(ctx, -11 + k * 0.85, -k * 2, 11 - k * 0.85, -k * 2);
    const tiers = [[-7.5, -6, 15, 4.5], [-5.6, -12.5, 11.2, 3.8], [-3.8, -18, 7.6, 3.4]];
    tiers.forEach(([x, y, w, hh], i) => {
      poly(ctx, [[x, y], [x + w, y], [x + w, y - hh], [x, y - hh]], true);
      fs(ctx, C.wall, C.ink, 0.6);
      ctx.fillStyle = C.ink;
      for (let k = 0; k < 3; k++) ctx.fillRect(x + w * (0.2 + k * 0.28), y - hh * 0.65, 0.8, 1);
      jRoof(ctx, C, x + w / 2, y - hh, w / 2 + 2, 2.6);
    });
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(-1.8, -24.2, 0.7, 0, TAU);
    ctx.arc(1.8, -24.2, 0.7, 0, TAU);
    ctx.fill();
  }

  function pagoda(ctx, rnd, C) {
    let y = 0;
    for (let i = 0; i < 5; i++) {
      const w = 5.6 - i * 0.7;
      const hh = 2.6;
      poly(ctx, [[-w * 0.55, y], [w * 0.55, y], [w * 0.55, y - hh], [-w * 0.55, y - hh]], true);
      fs(ctx, C.red, C.ink, 0.6);
      jRoof(ctx, C, 0, y - hh, w + 1.2, 1.8);
      y -= hh + 1.4;
    }
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.9;
    line(ctx, 0, y + 1.2, 0, y - 4);
    for (let k = 0; k < 4; k++) line(ctx, -0.8, y - k, 0.8, y - k);
  }

  function torii(ctx, rnd, C) {
    ctx.lineCap = 'butt';
    poly(ctx, [[-5.5, 0], [-4.3, 0], [-3.7, -11], [-4.9, -11]], true);
    fs(ctx, C.red, C.ink, 0.6);
    poly(ctx, [[5.5, 0], [4.3, 0], [3.7, -11], [4.9, -11]], true);
    fs(ctx, C.red, C.ink, 0.6);
    poly(ctx, [[-6.5, -8.5], [6.5, -8.5], [6.5, -7.4], [-6.5, -7.4]], true);
    fs(ctx, C.red, C.ink, 0.6);
    ctx.beginPath();
    ctx.moveTo(-8.5, -12.6);
    ctx.quadraticCurveTo(0, -11, 8.5, -12.6);
    ctx.lineTo(8, -11);
    ctx.quadraticCurveTo(0, -9.6, -8, -11);
    ctx.closePath();
    fs(ctx, C.ink);
    ctx.beginPath();
    ctx.moveTo(-7.6, -11);
    ctx.quadraticCurveTo(0, -9.6, 7.6, -11);
    ctx.lineTo(7.4, -10);
    ctx.quadraticCurveTo(0, -8.7, -7.4, -10);
    ctx.closePath();
    fs(ctx, C.red, C.ink, 0.5);
  }

  function shrine(ctx, rnd, C) {
    poly(ctx, [[-6, 0], [6, 0], [6, -5], [-6, -5]], true);
    fs(ctx, C.wood, C.ink, 0.7);
    poly(ctx, [[0, 0], [6, 0], [6, -5], [0, -5]], true);
    fs(ctx, C.woodShade);
    poly(ctx, [[-6, 0], [6, 0], [6, -5], [-6, -5]], true);
    fs(ctx, null, C.ink, 0.7);
    jRoof(ctx, C, 0, -5, 8.5, 5);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.6;
    line(ctx, -2.5, -10, -1.2, -11.8);
    line(ctx, 2.5, -10, 1.2, -11.8);
  }

  function jVillage(ctx, rnd, C) {
    const thatch = (x, y, w, hh) => {
      poly(ctx, [[x - w / 2, y], [x + w / 2, y], [x + w / 2, y - hh], [x - w / 2, y - hh]], true);
      fs(ctx, C.wall, C.ink, 0.6);
      ctx.beginPath();
      ctx.moveTo(x - w / 2 - 1.2, y - hh);
      ctx.lineTo(x - w * 0.15, y - hh - w * 0.55);
      ctx.lineTo(x + w * 0.15, y - hh - w * 0.55);
      ctx.lineTo(x + w / 2 + 1.2, y - hh);
      ctx.closePath();
      fs(ctx, C.field2, C.ink, 0.6);
      ctx.strokeStyle = C.hatch;
      ctx.lineWidth = 0.4;
      for (let k = 1; k < 4; k++) line(ctx, x - w / 2 + k * w / 4, y - hh, x - w * 0.15 + k * w * 0.075, y - hh - w * 0.5);
    };
    thatch(-4.5, -1.5, 5, 3);
    thatch(4, -2.2, 4.6, 2.8);
    thatch(0, 1.2, 5.2, 3);
  }

  // ───── 不思議・遺跡 ─────
  function ruins(ctx, rnd, C) {
    poly(ctx, [[-10, 0.5], [10, 0.5], [9, -1.5], [-9, -1.5]], true);
    fs(ctx, C.stone, C.ink, 0.6);
    const cols = [[-7, 9], [-3.5, 5], [0.5, 11], [4.5, 3.5], [7.5, 7.5]];
    cols.forEach(([x, hh]) => {
      poly(ctx, [[x - 1, -1.5], [x + 1, -1.5], [x + 1, -1.5 - hh], [x + 0.2, -1.5 - hh + 0.8], [x - 1, -1.5 - hh + 0.2]], true);
      fs(ctx, C.wall, C.ink, 0.6);
      poly(ctx, [[x, -1.5], [x + 1, -1.5], [x + 1, -1.5 - hh], [x, -1.5 - hh + 0.4]], true);
      fs(ctx, C.wallShade);
    });
    poly(ctx, [[-7.8, -10.5], [1.4, -12.5], [1.4, -11.3], [-7.8, -9.3]], true);
    fs(ctx, C.wall, C.ink, 0.6);
    ctx.fillStyle = C.stoneShade;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(jit(rnd, 9), 0.4 + rnd() * 0.6, 0.7, 0, TAU); ctx.fill(); }
  }

  function cave(ctx, rnd, C) {
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-11, -9, -3, -11);
    ctx.quadraticCurveTo(5, -13, 9, -7);
    ctx.quadraticCurveTo(12, -3, 12, 0);
    ctx.closePath();
    fs(ctx, C.rock, C.ink, 1);
    ctx.beginPath();
    ctx.moveTo(2, -11.8);
    ctx.quadraticCurveTo(7, -11, 9, -7);
    ctx.quadraticCurveTo(12, -3, 12, 0);
    ctx.lineTo(4, 0);
    ctx.closePath();
    fs(ctx, C.rockShade);
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.quadraticCurveTo(-4.5, -7, 0, -7);
    ctx.quadraticCurveTo(4.5, -7, 4.5, 0);
    ctx.closePath();
    fs(ctx, C.ink);
  }

  function stones(ctx, rnd, C) {
    const n = 7;
    const items = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      items.push([Math.cos(a) * 9, Math.sin(a) * 3.2]);
    }
    items.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => {
      const hh = 5 + rnd() * 2;
      poly(ctx, [[x - 1.4, y], [x + 1.4, y], [x + 1.1, y - hh], [x - 1.2, y - hh + 0.4]], true);
      fs(ctx, C.stone, C.ink, 0.65);
      poly(ctx, [[x, y], [x + 1.4, y], [x + 1.1, y - hh], [x, y - hh + 0.2]], true);
      fs(ctx, C.stoneShade);
    });
  }

  function crystal(ctx, rnd, C) {
    const shards = [[-4, 0, 2, 9, -0.25], [0, 0.5, 2.6, 13, 0.05], [4, 0, 2, 8, 0.3], [-1.5, 1, 1.6, 6, -0.5]];
    shards.forEach(([x, y, w, hh, a]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      poly(ctx, [[-w, 0], [-w, -hh * 0.75], [0, -hh], [w, -hh * 0.75], [w, 0]], true);
      fs(ctx, C.crystal, C.ink, 0.65);
      poly(ctx, [[0, 0], [0, -hh], [w, -hh * 0.75], [w, 0]], true);
      fs(ctx, C.crystalShade);
      poly(ctx, [[-w, 0], [-w, -hh * 0.75], [0, -hh], [w, -hh * 0.75], [w, 0]], true);
      fs(ctx, null, C.ink, 0.65);
      ctx.restore();
    });
  }

  function skull(ctx, rnd, C) {
    ctx.beginPath();
    ctx.arc(0, -7, 5, Math.PI * 0.9, Math.PI * 0.1);
    ctx.lineTo(3.4, -2.8);
    ctx.lineTo(2.6, -0.5);
    ctx.lineTo(-2.6, -0.5);
    ctx.lineTo(-3.4, -2.8);
    ctx.closePath();
    fs(ctx, C.paper, C.ink, 0.9);
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(-1.9, -6.2, 1.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(1.9, -6.2, 1.3, 0, TAU); ctx.fill();
    poly(ctx, [[0, -4.6], [-0.6, -3.4], [0.6, -3.4]], true);
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.5;
    for (let k = -1; k <= 1; k++) line(ctx, k * 1.1, -2.2, k * 1.1, -0.6);
  }

  function portal(ctx, rnd, C) {
    const g = ctx.createRadialGradient(0, -8, 1, 0, -8, 8);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.5, C.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -8, 6, 8, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(0, -8, 5.4, 7.6, 0, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = C.stone;
    ctx.stroke();
    poly(ctx, [[-7, 0.5], [7, 0.5], [5.5, -1], [-5.5, -1]], true);
    fs(ctx, C.stone, C.ink, 0.6);
  }

  function obelisk(ctx, rnd, C) {
    poly(ctx, [[-2.2, 0], [2.2, 0], [1.4, -15], [0, -17], [-1.4, -15]], true);
    fs(ctx, C.stone, C.ink, 0.8);
    poly(ctx, [[0, 0], [2.2, 0], [1.4, -15], [0, -17]], true);
    fs(ctx, C.stoneShade);
    ctx.strokeStyle = C.glow;
    ctx.lineWidth = 0.6;
    for (let k = 0; k < 4; k++) line(ctx, -0.8, -4 - k * 2.8, 0.2, -4 - k * 2.8);
  }

  // ───── 海 ─────
  function ship(ctx, rnd, C, ox, oy, sc) {
    ox = ox || 0;
    oy = oy || 0;
    sc = sc || 1;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(sc, sc);
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.lineTo(9, -3);
    ctx.quadraticCurveTo(7, 1, 4, 1.2);
    ctx.lineTo(-6, 1.2);
    ctx.quadraticCurveTo(-8.5, 0.5, -9, -3);
    ctx.closePath();
    fs(ctx, C.wood, C.ink, 0.8);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.8;
    line(ctx, -1.5, -3, -1.5, -17);
    line(ctx, 4.5, -3, 4.5, -13);
    const sail = (x, top, bot, w) => {
      ctx.beginPath();
      ctx.moveTo(x - w, top);
      ctx.quadraticCurveTo(x + w * 0.4, (top + bot) / 2, x - w, bot);
      ctx.lineTo(x + w, bot);
      ctx.quadraticCurveTo(x + w * 1.6, (top + bot) / 2, x + w, top);
      ctx.closePath();
      fs(ctx, C.paper, C.ink, 0.7);
    };
    sail(-1.5, -16, -9, 4.2);
    sail(-1.5, -8.6, -4, 4.8);
    sail(4.5, -12.5, -5, 3.2);
    poly(ctx, [[-1.5, -17], [1.8, -16.4], [-1.5, -15.7]], true);
    fs(ctx, C.red, C.ink, 0.4);
    ctx.restore();
    ctx.strokeStyle = C.waterLight;
    ctx.lineWidth = 0.7;
    line(ctx, ox - 11 * sc, oy + 2.2 * sc, ox - 5 * sc, oy + 2.2 * sc);
    line(ctx, ox + 3 * sc, oy + 2.6 * sc, ox + 10 * sc, oy + 2.6 * sc);
  }

  function serpent(ctx, rnd, C) {
    const hump = (x, w, hh) => {
      ctx.beginPath();
      ctx.moveTo(x - w, 0);
      ctx.bezierCurveTo(x - w, -hh * 1.3, x + w, -hh * 1.3, x + w, 0);
      ctx.lineTo(x + w * 0.55, 0);
      ctx.bezierCurveTo(x + w * 0.55, -hh * 0.6, x - w * 0.55, -hh * 0.6, x - w * 0.55, 0);
      ctx.closePath();
      fs(ctx, C.serpent, C.ink, 0.8);
    };
    hump(-7, 3.2, 6);
    hump(1, 3.6, 7);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.quadraticCurveTo(7, -9, 11, -11);
    ctx.quadraticCurveTo(14.5, -11.5, 14.5, -9);
    ctx.quadraticCurveTo(12, -8.4, 10.8, -7.5);
    ctx.quadraticCurveTo(9.8, -5, 10, 0);
    ctx.closePath();
    fs(ctx, C.serpent, C.ink, 0.8);
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(12.3, -10, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.waterLight;
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 4; k++) line(ctx, -12 + k * 6.5, 0.6, -9 + k * 6.5, 0.6);
  }

  function whirlpool(ctx, rnd, C) {
    ctx.strokeStyle = C.waterLight;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let t = 0; t < 4 * Math.PI; t += 0.2) {
      const r = 1 + t * 0.85;
      const x = Math.cos(t) * r;
      const y = Math.sin(t) * r * 0.55;
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  function seaRock(ctx, rnd, C) {
    poly(ctx, [[-6, 0], [-4.5, -5], [-1, -7], [2.5, -4.5], [5.5, -2], [6.5, 0]], true);
    fs(ctx, C.stone, C.ink, 0.8);
    poly(ctx, [[-1, -7], [2.5, -4.5], [5.5, -2], [6.5, 0], [0, 0]], true);
    fs(ctx, C.stoneShade);
    ctx.strokeStyle = C.foam;
    ctx.lineWidth = 1;
    line(ctx, -8, 0.8, -3, 0.8);
    line(ctx, 3, 1.2, 9, 1.2);
  }

  /** 海の波の印：2〜3本の波頭を少しずらして重ねる（古地図風） */
  function wave(ctx, rnd, C) {
    const n = 2 + Math.floor(rnd() * 2);
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 9 + jit(rnd, 1.5);
      const y = (k % 2 ? 3.2 : 0) + jit(rnd, 0.8);
      const w = 6.5 + rnd() * 2.5;
      // 波頭（くるりと巻く）
      ctx.strokeStyle = C.water || C.ink;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - w, y + 1.2);
      ctx.bezierCurveTo(x - w * 0.55, y - 2.6, x + w * 0.1, y - 3.6, x + w * 0.45, y - 1.4);
      ctx.bezierCurveTo(x + w * 0.62, y - 0.3, x + w * 0.4, y + 0.9, x + w * 0.15, y + 0.2);
      ctx.stroke();
      // 波の下の細い線
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.8, y + 2.6);
      ctx.quadraticCurveTo(x, y + 1.4, x + w * 0.8, y + 2.6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ───── 装飾 ─────
  function compass(ctx, rnd, C, ornate) {
    const R = ornate ? 30 : 20;
    ctx.save();
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = C.ink;
    if (ornate) {
      ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, TAU); fs(ctx, 'rgba(255,255,255,0.35)', C.ink, 0.8);
      ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, TAU); ctx.stroke();
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * TAU;
        const r0 = R * (i % 4 ? 0.72 : 0.68);
        line(ctx, Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * R * 0.76, Math.sin(a) * R * 0.76);
      }
    } else {
      ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, TAU); ctx.stroke();
    }
    const points = ornate ? 16 : 8;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < points; i++) {
        const level = i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2;
        if (level !== 2 - pass) continue;
        const a = (i / points) * TAU - Math.PI / 2;
        const len = R * [1, 0.68, 0.45][level];
        const wid = R * [0.13, 0.1, 0.07][level];
        ctx.save();
        ctx.rotate(a);
        poly(ctx, [[len, 0], [0, -wid], [0, 0]], true);
        fs(ctx, C.ink);
        poly(ctx, [[len, 0], [0, wid], [0, 0]], true);
        fs(ctx, level === 0 ? C.paper : C.gold, C.ink, 0.6);
        ctx.restore();
      }
    }
    ctx.beginPath(); ctx.arc(0, 0, R * 0.07, 0, TAU); fs(ctx, C.paper, C.ink, 0.7);
    ctx.fillStyle = C.ink;
    ctx.font = `700 ${R * 0.28}px "Noto Serif JP", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -R * 1.15);
    ctx.restore();
  }

  // ───── 地図記号（現代の地図にも） ─────
  function sym(type) {
    return function (ctx, rnd, C) {
      const x = 0;
      const y = 0;
      const paper = C.paper;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.3;
      const circle = (r, fill) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); fs(ctx, fill, C.ink, 1.3); };
      switch (type) {
        case 'capital':
          circle(7.5, paper);
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + i * Math.PI / 5;
            const r = i % 2 ? 2.4 : 5.6;
            ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          }
          ctx.closePath();
          fs(ctx, C.red);
          break;
        case 'city': circle(5.2, paper); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); fs(ctx, C.ink); break;
        case 'town': circle(3.6, C.ink); break;
        case 'village': circle(2.3, paper); break;
        case 'castle':
          poly(ctx, [[-5.5, 4], [-5.5, -4], [-3.3, -4], [-3.3, -2.4], [-1.1, -2.4], [-1.1, -4], [1.1, -4], [1.1, -2.4], [3.3, -2.4], [3.3, -4], [5.5, -4], [5.5, 4]], true);
          fs(ctx, paper, C.ink, 1.3);
          ctx.beginPath(); ctx.arc(0, 4, 1.8, Math.PI, 0); fs(ctx, C.ink);
          break;
        case 'fort': ctx.beginPath(); ctx.rect(-4, -4, 8, 8); fs(ctx, paper, C.ink, 1.3); ctx.fillStyle = C.ink; ctx.fillRect(-1.6, -1.6, 3.2, 3.2); break;
        case 'port':
          circle(5.5, paper);
          ctx.beginPath();
          ctx.moveTo(0, -3.6); ctx.lineTo(0, 3.4);
          ctx.moveTo(-2.2, -1.8); ctx.lineTo(2.2, -1.8);
          ctx.moveTo(-3, 1); ctx.quadraticCurveTo(0, 5, 3, 1);
          ctx.stroke();
          break;
        case 'temple':
          poly(ctx, [[-5.5, -1.5], [0, -5.5], [5.5, -1.5]], true); fs(ctx, paper, C.ink, 1.3);
          ctx.beginPath(); ctx.rect(-4, -1.5, 8, 5.5); fs(ctx, paper, C.ink, 1.3);
          break;
        case 'ruin':
          ctx.beginPath();
          ctx.moveTo(-4.5, 4); ctx.lineTo(-4.5, -3); ctx.lineTo(-2.5, -4.5); ctx.lineTo(-2.5, 4);
          ctx.moveTo(1, 4); ctx.lineTo(1, -1); ctx.lineTo(3.5, -2.2); ctx.lineTo(3.5, 4);
          ctx.moveTo(-5.5, 4); ctx.lineTo(5, 4);
          ctx.stroke();
          break;
        case 'cave':
          ctx.beginPath(); ctx.moveTo(-6, 3.5); ctx.quadraticCurveTo(0, -8, 6, 3.5); ctx.closePath(); fs(ctx, paper, C.ink, 1.3);
          ctx.beginPath(); ctx.moveTo(-2.4, 3.5); ctx.quadraticCurveTo(0, -2.6, 2.4, 3.5); ctx.closePath(); fs(ctx, C.ink);
          break;
        case 'tower':
          poly(ctx, [[-2.6, 5], [-1.8, -4], [1.8, -4], [2.6, 5]], true); fs(ctx, paper, C.ink, 1.3);
          poly(ctx, [[-2.6, -4], [0, -7.5], [2.6, -4]], true); fs(ctx, C.ink);
          break;
        case 'peak': poly(ctx, [[-5, 3.5], [0, -5], [5, 3.5]], true); fs(ctx, C.ink); break;
        case 'station': ctx.beginPath(); ctx.rect(-6, -2.8, 12, 5.6); fs(ctx, paper, C.ink, 1.3); ctx.fillStyle = C.ink; ctx.fillRect(-6, -2.8, 6, 5.6); break;
        case 'school':
          circle(5.5, paper);
          ctx.fillStyle = C.ink;
          ctx.font = '700 7px "Noto Serif JP", serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('文', 0, 0.4);
          break;
        case 'hospital': circle(5.5, paper); ctx.strokeStyle = C.red; ctx.lineWidth = 1.8; line(ctx, 0, -3.2, 0, 3.2); line(ctx, -3.2, 0, 3.2, 0); break;
        case 'shrine':
          ctx.strokeStyle = C.red;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-5.5, -4); ctx.quadraticCurveTo(0, -5.4, 5.5, -4);
          ctx.moveTo(-4, -1.8); ctx.lineTo(4, -1.8);
          ctx.moveTo(-3, -4.6); ctx.lineTo(-3.4, 4.5);
          ctx.moveTo(3, -4.6); ctx.lineTo(3.4, 4.5);
          ctx.stroke();
          break;
        case 'shop':
          ctx.beginPath(); ctx.rect(-4, -2, 8, 6); fs(ctx, paper, C.ink, 1.3);
          poly(ctx, [[-5, -2], [-3.5, -5], [3.5, -5], [5, -2]], true); fs(ctx, C.gold, C.ink, 1.3);
          break;
        case 'house': poly(ctx, [[-4, 4], [-4, -1], [0, -4.5], [4, -1], [4, 4]], true); fs(ctx, paper, C.ink, 1.3); break;
        case 'park': ctx.beginPath(); ctx.arc(0, -1.5, 4, 0, TAU); fs(ctx, '#6a994e', C.ink, 1.3); line(ctx, 0, 2.5, 0, 5); break;
        default:
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-5, -6, -5, -12, 0, -12);
          ctx.bezierCurveTo(5, -12, 5, -6, 0, 0);
          fs(ctx, C.red, C.ink, 1.3);
          ctx.beginPath(); ctx.arc(0, -8, 1.8, 0, TAU); fs(ctx, paper);
      }
    };
  }

  // ───── 素材の一覧 ─────
  // box: [x0, y0, x1, y1]（素材の基準点＝足元からの範囲）。label: 名前の表示位置
  const A = [];
  function def(id, cat, label, box, draw, o) {
    A.push(Object.assign({ id, cat, label, box, draw, variants: 4, labelPos: 'below' }, o || {}));
  }
  def('mountain', '山・丘', '山', [-23, -32, 23, 5], (c, r, C) => mountain(c, r, C, {}), { variants: 10, size: 26 });
  def('mountain-tall', '山・丘', '高い山', [-21, -44, 21, 5], (c, r, C) => mountain(c, r, C, { w: 16, h: 33, snow: r() < 0.7 }), { variants: 8, size: 34 });
  def('mountain-snow', '山・丘', '雪山', [-23, -35, 23, 5], (c, r, C) => mountain(c, r, C, { snow: true, h: 25 }), { variants: 8, size: 28 });
  def('mountain-range', '山・丘', '連山', [-32, -36, 30, 6], (c, r, C) => {
    c.save(); c.translate(-9, -3); c.scale(0.75, 0.75); mountain(c, r, C, { snow: r() < 0.4 }); c.restore();
    c.save(); c.translate(8, -2); c.scale(0.7, 0.7); mountain(c, r, C, {}); c.restore();
    mountain(c, r, C, { h: 24 });
  }, { variants: 5, size: 30 });
  def('volcano', '山・丘', '火山', [-18, -40, 18, 3], volcano, { variants: 3, size: 30 });
  def('mesa', '山・丘', '台地', [-18, -16, 18, 3], mesa, { variants: 3, size: 14 });
  def('hill', '山・丘', '丘', [-19, -15, 19, 4], hill, { variants: 6, size: 11 });
  def('rocks', '山・丘', '岩', [-12, -10, 12, 2], rocks, { variants: 5, size: 8 });
  def('dune', '山・丘', '砂丘', [-16, -11, 16, 2], dune, { variants: 4, size: 8 });

  def('tree-round', '木・植物', '広葉樹', [-7, -15, 7, 2], treeRound, { variants: 8, size: 11 });
  def('tree-conifer', '木・植物', '針葉樹', [-6, -18, 6, 2], conifer, { variants: 8, size: 13 });
  def('tree-snow', '木・植物', '雪の針葉樹', [-6, -18, 6, 2], (c, r, C) => conifer(c, r, C, { snow: true }), { variants: 5, size: 13 });
  def('tree-jungle', '木・植物', '熱帯の木', [-8, -18, 8, 2], (c, r, C) => treeRound(c, r, C, { r: 4.4, trunk: 3.2, fill: C.jungle, shade: C.jungleShade }), { variants: 6, size: 14 });
  def('tree-palm', '木・植物', 'ヤシ', [-10, -20, 10, 2], palm, { variants: 5, size: 14 });
  def('tree-dead', '木・植物', '枯れ木', [-9, -15, 9, 2], deadTree, { variants: 5, size: 11 });
  def('bush', '木・植物', '茂み', [-6, -8, 6, 2], bush, { variants: 4, size: 5 });
  def('grass', '木・植物', '草', [-6, -7, 6, 1.5], grassTuft, { variants: 5, size: 5 });
  def('reeds', '木・植物', '葦（湿地）', [-8, -9, 8, 3], reeds, { variants: 4, size: 6 });

  def('castle', '町・建物', '城', [-16, -26, 16, 3], castle, { variants: 2, size: 22 });
  def('city', '町・建物', '都市', [-17, -22, 17, 6], city, { variants: 4, size: 18 });
  def('town', '町・建物', '町', [-12, -17, 12, 5], town, { variants: 4, size: 14 });
  def('village', '町・建物', '村', [-9, -9, 9, 3], village, { variants: 4, size: 8 });
  def('house', '町・建物', '家', [-5, -10, 7, 2], houseAsset, { variants: 4, size: 8 });
  def('tower', '町・建物', '塔', [-6, -28, 6, 2], tower, { variants: 2, size: 24 });
  def('fort', '町・建物', '砦', [-13, -18, 13, 3], fort, { variants: 2, size: 14 });
  def('temple', '町・建物', '神殿', [-13, -18, 13, 2], temple, { variants: 1, size: 16 });
  def('church', '町・建物', '教会', [-8, -20, 11, 2], church, { variants: 1, size: 18 });
  def('windmill', '町・建物', '風車', [-12, -26, 12, 2], windmill, { variants: 3, size: 20 });
  def('lighthouse', '町・建物', '灯台', [-12, -24, 12, 2], lighthouse, { variants: 1, size: 22 });
  def('farm', '町・建物', '農場', [-14, -12, 14, 3], farm, { variants: 2, size: 10 });
  def('camp', '町・建物', '野営地', [-10, -10, 12, 3], camp, { variants: 2, size: 8 });
  def('port', '町・建物', '港', [-13, -12, 13, 6], port, { variants: 2, size: 10 });
  def('bridge', '町・建物', '橋', [-14, -13, 14, 2], bridge, { variants: 1, size: 9 });

  def('jcastle', '和風', '天守閣', [-13, -28, 13, 2], jCastle, { variants: 1, size: 26 });
  def('pagoda', '和風', '五重塔', [-8, -30, 8, 2], pagoda, { variants: 1, size: 28 });
  def('torii', '和風', '鳥居', [-10, -14, 10, 2], torii, { variants: 1, size: 12 });
  def('shrine', '和風', '社', [-10, -14, 10, 2], shrine, { variants: 1, size: 12 });
  def('jvillage', '和風', '集落', [-9, -10, 9, 3], jVillage, { variants: 2, size: 8 });

  def('ruins', '不思議・遺跡', '遺跡', [-12, -15, 12, 2], ruins, { variants: 3, size: 12 });
  def('cave', '不思議・遺跡', '洞窟', [-14, -15, 14, 2], cave, { variants: 1, size: 12 });
  def('stones', '不思議・遺跡', '環状列石', [-12, -10, 12, 5], stones, { variants: 3, size: 8 });
  def('crystal', '不思議・遺跡', '水晶', [-8, -15, 8, 2], crystal, { variants: 1, size: 13 });
  def('obelisk', '不思議・遺跡', '石碑', [-4, -19, 4, 2], obelisk, { variants: 1, size: 17 });
  def('portal', '不思議・遺跡', '門（ポータル）', [-9, -18, 9, 2], portal, { variants: 1, size: 16 });
  def('giant-tree', '不思議・遺跡', '世界樹', [-22, -48, 22, 2], giantTree, { variants: 2, size: 40 });
  def('skull', '不思議・遺跡', '危険', [-6, -13, 6, 1], skull, { variants: 1, size: 12 });

  def('ship', '海', '帆船', [-12, -19, 12, 4], (c, r, C) => ship(c, r, C), { variants: 1, size: 16, water: true });
  def('serpent', '海', '海竜', [-14, -14, 16, 2], serpent, { variants: 1, size: 12, water: true });
  def('whirlpool', '海', '渦潮', [-12, -8, 12, 8], whirlpool, { variants: 1, size: 8, water: true, anchor: 'center' });
  def('sea-rock', '海', '岩礁', [-10, -9, 10, 2], seaRock, { variants: 1, size: 7, water: true });
  def('wave', '海', '波', [-26, -7, 26, 6], wave, { variants: 6, size: 6, water: true, labelPos: 'none' });

  def('compass', '装飾', '方位記号（飾り）', [-34, -42, 34, 34], (c, r, C) => compass(c, r, C, true), { variants: 1, size: 60, anchor: 'center', labelPos: 'none' });
  def('compass-simple', '装飾', '方位記号', [-23, -29, 23, 23], (c, r, C) => compass(c, r, C, false), { variants: 1, size: 40, anchor: 'center', labelPos: 'none' });

  [['capital', '首都'], ['city', '都市'], ['town', '町'], ['village', '村'], ['castle', '城'], ['fort', '砦'], ['port', '港'],
    ['temple', '神殿・寺院'], ['ruin', '遺跡'], ['cave', '洞窟・迷宮'], ['tower', '塔'], ['peak', '山頂'], ['station', '駅'],
    ['school', '学校'], ['hospital', '病院'], ['shrine', '神社'], ['shop', '店'], ['house', '家'], ['park', '公園'], ['pin', '目印']].forEach(([t, l]) => {
    def('sym-' + t, '地図記号', l, t === 'pin' ? [-7, -14, 7, 2] : [-9, -9, 9, 9], sym(t), { variants: 1, size: 12, anchor: t === 'pin' ? 'bottom' : 'center', labelPos: 'right' });
  });

  const BY_ID = {};
  A.forEach((a) => { BY_ID[a.id] = a; });
  const CATEGORIES = Array.from(new Set(A.map((a) => a.cat)));

  // 散布ブラシの組み合わせ
  const SCATTER = [
    { id: 'forest', label: '広葉樹の森', assets: ['tree-round'], spacing: 6, land: true },
    { id: 'conifer', label: '針葉樹の森', assets: ['tree-conifer'], spacing: 5.5, land: true },
    { id: 'mixed', label: '混交林', assets: ['tree-round', 'tree-conifer'], spacing: 6, land: true },
    { id: 'snowforest', label: '雪の森', assets: ['tree-snow'], spacing: 6, land: true },
    { id: 'jungle', label: '密林', assets: ['tree-jungle', 'tree-jungle', 'tree-palm'], spacing: 7, land: true },
    { id: 'mountains', label: '山脈', assets: ['mountain'], spacing: 15, land: true },
    { id: 'snowy', label: '雪山', assets: ['mountain-snow', 'mountain-tall'], spacing: 15, land: true },
    { id: 'hills', label: '丘陵', assets: ['hill'], spacing: 13, land: true },
    { id: 'rocks', label: '岩場', assets: ['rocks'], spacing: 10, land: true },
    { id: 'dunes', label: '砂丘', assets: ['dune'], spacing: 14, land: true },
    { id: 'swamp', label: '湿地', assets: ['reeds', 'grass'], spacing: 8, land: true },
    { id: 'grass', label: '草むら・茂み', assets: ['grass', 'bush'], spacing: 7, land: true },
    { id: 'dead', label: '枯れた森', assets: ['tree-dead'], spacing: 8, land: true },
    { id: 'waves', label: '波', assets: ['wave'], spacing: 22, water: true },
  ];

  // ───── 画像キャッシュ ─────
  const cache = new Map();
  /** 大きく置いた素材は、線が太くなりすぎないよう細めの線で描いた版を使う（段階ごとに保存） */
  function lineScaleFor(s) { return s >= 1.75 ? 0.68 : s >= 1.3 ? 0.82 : 1; }

  function sprite(id, variant, palKey, lineScale) {
    const a = BY_ID[id] || BY_ID['sym-pin'];
    const v = Math.max(0, (variant | 0) % a.variants);
    const lk = lineScale && lineScale !== 1 ? lineScale : 1;
    const key = a.id + ':' + v + ':' + palKey + (lk !== 1 ? ':' + lk : '');
    let sp = cache.get(key);
    if (sp) return sp;
    const [x0, y0, x1, y1] = a.box;
    const w = x1 - x0;
    const h = y1 - y0;
    const res = Math.min(6, 640 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * res));
    c.height = Math.max(1, Math.ceil(h * res));
    const ctx = c.getContext('2d');
    ctx.scale(res, res);
    ctx.translate(-x0, -y0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // 線の太さだけを変える（形は同じ乱数で同じに描く）
    const target = lk === 1 ? ctx : new Proxy(ctx, {
      get(t, k) { const val = t[k]; return typeof val === 'function' ? val.bind(t) : val; },
      set(t, k, val) { t[k] = k === 'lineWidth' ? val * lk : val; return true; },
    });
    try {
      a.draw(target, mulberry32(hashStr(a.id) + v * 7919 + 13), COLORS[palKey] || COLORS.parchment);
    } catch (e) { console.error('asset', a.id, e); }
    sp = { canvas: c, x0, y0, w, h };
    cache.set(key, sp);
    return sp;
  }

  function clearCache() { cache.clear(); }

  /** 一覧用の小さな見本 */
  function thumb(id, palKey, size) {
    size = size || 44;
    const a = BY_ID[id];
    const c = document.createElement('canvas');
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    c.className = 'asset-thumb';
    if (!a) return c;
    const sp = sprite(id, 0, palKey);
    const ctx = c.getContext('2d');
    const k = Math.min((size * dpr * 0.9) / sp.w, (size * dpr * 0.9) / sp.h);
    const dw = sp.w * k;
    const dh = sp.h * k;
    ctx.drawImage(sp.canvas, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    return c;
  }

  NS.MapAssets = {
    lineScaleFor, ASSETS: A, BY_ID, CATEGORIES, SCATTER, COLORS, sprite, thumb, clearCache, mulberry32, hashStr };
})(window.Tsuzuri = window.Tsuzuri || {});
