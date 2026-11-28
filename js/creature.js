/*
 * 綴り — 生物の図（横から見た姿・骨格・大きさ比べ）
 * 設定資料の「生物」の体の形と大きさから、その場で図を作る（外部の画像生成は使わない）。
 * 体は「背骨の線＋太さ」と「脚・翼・頭」の組み合わせで作り、骨格もそこから組み立てる。
 * 出力は SVG の文字列（Node でも動く）。
 */
(function (NS) {
  'use strict';

  const D2R = Math.PI / 180;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s];
  const len = (a) => Math.hypot(a[0], a[1]);
  const dir = (deg) => [Math.cos(deg * D2R), Math.sin(deg * D2R)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
  const perp = (a) => [-a[1], a[0]];
  const ang = (a) => Math.atan2(a[1], a[0]) / D2R;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const HEX = /^#[0-9a-f]{6}$/i;

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ───── 色 ─────
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(c) { return '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const x = rgb(a); const y = rgb(b); return hex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]); }

  // ───── 曲線 ─────
  /** Catmull-Rom で点列をなめらかに補間（値の列 extra も同じ割合で補間） */
  function crSample(pts, per, extra) {
    const n = pts.length;
    const out = [];
    const ex = (extra || []).map(() => []);
    const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    for (let i = 0; i < n - 1; i++) {
      const i0 = Math.max(0, i - 1);
      const i3 = Math.min(n - 1, i + 2);
      for (let s = 0; s < per; s++) {
        const t = s / per;
        out.push([cr(pts[i0][0], pts[i][0], pts[i + 1][0], pts[i3][0], t), cr(pts[i0][1], pts[i][1], pts[i + 1][1], pts[i3][1], t)]);
        (extra || []).forEach((arr, k) => ex[k].push(cr(arr[i0], arr[i], arr[i + 1], arr[i3], t)));
      }
    }
    out.push(pts[n - 1].slice(0, 2));
    (extra || []).forEach((arr, k) => ex[k].push(arr[n - 1]));
    return { pts: out, extra: ex };
  }
  /** 点列を SVG のパスに（3つめの要素が真の点は角にする） */
  function pathD(pts, closed, tension) {
    const n = pts.length;
    if (n < 2) return '';
    const T = tension == null ? 1 : tension;
    const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = 'M' + f1(P(0)[0]) + ' ' + f1(P(0)[1]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1); const p1 = P(i); const p2 = P(i + 1); const p3 = P(i + 2);
      if (T === 0) { d += 'L' + f1(p2[0]) + ' ' + f1(p2[1]); continue; }
      const k1 = p1[2] ? 0 : T / 6;
      const k2 = p2[2] ? 0 : T / 6;
      d += 'C' + f1(p1[0] + (p2[0] - p0[0]) * k1) + ' ' + f1(p1[1] + (p2[1] - p0[1]) * k1) + ' '
        + f1(p2[0] - (p3[0] - p1[0]) * k2) + ' ' + f1(p2[1] - (p3[1] - p1[1]) * k2) + ' ' + f1(p2[0]) + ' ' + f1(p2[1]);
    }
    return closed ? d + 'Z' : d;
  }
  function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a) / 2;
  }
  /** 2本の骨で root から target へ届く関節の位置（bend: 1=前へ曲がる、-1=後ろへ） */
  function ik(root, target, a, b, bend) {
    const d = sub(target, root);
    const dist = clamp(len(d), Math.abs(a - b) + 1e-4, a + b - 1e-4);
    const base = ang(d);
    const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
    const al = Math.acos(cosA) / D2R;
    const j1 = add(root, mul(dir(base + al), a));
    const j2 = add(root, mul(dir(base - al), a));
    // bend>0：関節が前（x が大きい側）へ出る向き。root→target の線のどちら側かで選ぶ
    const side = (j) => d[0] * (j[1] - root[1]) - d[1] * (j[0] - root[0]);
    const want = d[1] <= 0 ? bend : -bend;
    const joint = (side(j1) * want > 0) ? j1 : j2;
    const end = add(joint, mul(norm(sub(target, joint)), b));
    return { joint, end };
  }
  /** 骨の鎖に沿った肉づき（点ごとの太さ）を、閉じた輪郭の点列に */
  function limbOutline(chain, widths) {
    const L = [];
    const R = [];
    for (let i = 0; i < chain.length; i++) {
      const prev = chain[Math.max(0, i - 1)];
      const next = chain[Math.min(chain.length - 1, i + 1)];
      const nrm = perp(norm(sub(next, prev)));
      L.push(add(chain[i], mul(nrm, widths[i] / 2)));
      R.push(add(chain[i], mul(nrm, -widths[i] / 2)));
    }
    return L.concat(R.reverse());
  }

  // ───── 体の形のひな形 ─────
  // plan：体の組み立て方。head：頭の形。feet：足先。sliders（0〜1）：neck 首・tail 尾・legs 脚・bulk 胴の太さ・head 頭・wing 翼
  const PRESETS = {
    dragon: { label: '竜（四本脚・翼）', plan: 'quad', head: 'reptile', feet: 'claw', wings: 'bat', horns: 'back', ridge: 'spikes', tailTip: 'spade', skin: 'scale', neck: 0.55, tail: 0.6, legs: 0.5, bulk: 0.6, headSize: 0.55, wing: 0.6, size: 30, color: '#55604a', belly: '#c8b48a' },
    wyvern: { label: '飛竜（翼が前脚）', plan: 'biped', head: 'reptile', feet: 'claw', wings: 'bat', horns: 'back', ridge: 'spikes', tailTip: 'spade', skin: 'scale', neck: 0.5, tail: 0.6, legs: 0.5, bulk: 0.4, headSize: 0.5, wing: 0.65, size: 15, color: '#6b4a3a', belly: '#d2b48c' },
    eastern: { label: '東洋の龍', plan: 'serpent', fly: true, legs4: true, head: 'eastern', feet: 'claw', wings: 'none', horns: 'antler', ridge: 'mane', tailTip: 'tuft', skin: 'scale', neck: 0.5, tail: 0.55, legs: 0.4, bulk: 0.45, headSize: 0.5, wing: 0.5, size: 40, color: '#2f6b5e', belly: '#d9c27a' },
    serpent: { label: '大蛇・海蛇', plan: 'serpent', head: 'snake', feet: 'none', wings: 'none', horns: 'none', ridge: 'none', tailTip: 'none', skin: 'scale', neck: 0.55, tail: 0.5, legs: 0, bulk: 0.45, headSize: 0.5, wing: 0, size: 12, color: '#4d5a3a', belly: '#d6c99a' },
    raptor: { label: '恐竜（二本脚）', plan: 'biped', head: 'reptile', feet: 'claw', wings: 'none', horns: 'none', ridge: 'none', tailTip: 'none', skin: 'scale', neck: 0.35, tail: 0.55, legs: 0.5, bulk: 0.5, headSize: 0.6, wing: 0, size: 12, color: '#6d6450', belly: '#cbbd9a' },
    wolf: { label: '狼・犬の獣', plan: 'quad', head: 'canine', feet: 'paw', wings: 'none', horns: 'none', ridge: 'none', tailTip: 'bushy', skin: 'fur', neck: 0.35, tail: 0.35, legs: 0.42, bulk: 0.45, headSize: 0.5, wing: 0, size: 1.8, color: '#6e6a64', belly: '#cfc8bb' },
    lion: { label: '獅子・猫の獣', plan: 'quad', head: 'feline', feet: 'paw', wings: 'none', horns: 'none', ridge: 'mane', tailTip: 'tuft', skin: 'fur', neck: 0.3, tail: 0.45, legs: 0.36, bulk: 0.55, headSize: 0.55, wing: 0, size: 3, color: '#b08a52', belly: '#e0c9a0' },
    bear: { label: '熊・大きな獣', plan: 'quad', head: 'bear', feet: 'paw', wings: 'none', horns: 'none', ridge: 'none', tailTip: 'none', skin: 'fur', neck: 0.25, tail: 0, legs: 0.2, bulk: 0.7, headSize: 0.6, wing: 0, size: 2.6, color: '#5a4636', belly: '#8a705a' },
    horse: { label: '馬・鹿', plan: 'quad', head: 'equine', feet: 'hoof', wings: 'none', horns: 'none', ridge: 'mane', tailTip: 'hair', skin: 'fur', neck: 0.6, tail: 0.25, legs: 0.45, bulk: 0.55, headSize: 0.5, wing: 0, size: 2.6, color: '#8a6a4a', belly: '#b89a7a' },
    pegasus: { label: '天馬・一角獣', plan: 'quad', head: 'equine', feet: 'hoof', wings: 'feather', horns: 'unicorn', ridge: 'mane', tailTip: 'hair', skin: 'fur', neck: 0.6, tail: 0.25, legs: 0.45, bulk: 0.55, headSize: 0.5, wing: 0.55, size: 2.6, color: '#e9e4d8', belly: '#f4f0e6' },
    griffin: { label: 'グリフォン', plan: 'quad', head: 'beak', feet: 'paw', frontFeet: 'talon', wings: 'feather', horns: 'none', ridge: 'none', tailTip: 'tuft', skin: 'fur', neck: 0.35, tail: 0.45, legs: 0.5, bulk: 0.5, headSize: 0.5, wing: 0.55, size: 4, color: '#a8834f', belly: '#efe6d2' },
    bird: { label: '鳥・怪鳥', plan: 'bird', head: 'beak', feet: 'talon', wings: 'feather', horns: 'none', ridge: 'none', tailTip: 'fan', skin: 'feather', neck: 0.45, tail: 0.4, legs: 0.45, bulk: 0.5, headSize: 0.5, wing: 0.6, size: 1, color: '#6b5440', belly: '#d8c8a8' },
    giant: { label: '巨人・鬼', plan: 'humanoid', head: 'human', feet: 'foot', wings: 'none', horns: 'none', ridge: 'none', tailTip: 'none', skin: 'smooth', neck: 0.3, tail: 0, legs: 0.5, bulk: 0.55, headSize: 0.5, wing: 0, size: 8, color: '#8f7a64', belly: '#a89480' },
    whale: { label: '鯨・海の巨獣', plan: 'fish', head: 'whale', feet: 'none', wings: 'none', horns: 'none', ridge: 'none', tailTip: 'fluke', skin: 'smooth', neck: 0, tail: 0.5, legs: 0, bulk: 0.5, headSize: 0.5, wing: 0, size: 25, color: '#3e5266', belly: '#c9d2d6' },
    fish: { label: '大魚・鮫', plan: 'fish', head: 'shark', feet: 'none', wings: 'none', horns: 'none', ridge: 'fin', tailTip: 'fin', skin: 'smooth', neck: 0, tail: 0.5, legs: 0, bulk: 0.4, headSize: 0.5, wing: 0, size: 6, color: '#5d6e7a', belly: '#e3e6e2' },
    insect: { label: '大蟲（甲虫）', plan: 'insect', head: 'insect', feet: 'none', wings: 'none', horns: 'none', ridge: 'none', tailTip: 'none', skin: 'shell', neck: 0, tail: 0.5, legs: 0.5, bulk: 0.5, headSize: 0.5, wing: 0, size: 2, color: '#3b2e2a', belly: '#5a4438' },
    spider: { label: '大蜘蛛', plan: 'spider', head: 'insect', feet: 'none', wings: 'none', horns: 'none', ridge: 'none', tailTip: 'none', skin: 'fur', neck: 0, tail: 0.5, legs: 0.55, bulk: 0.5, headSize: 0.5, wing: 0, size: 3, color: '#3a3430', belly: '#8a2a20' },
    slime: { label: 'スライム', plan: 'blob', head: 'none', feet: 'none', wings: 'none', horns: 'none', ridge: 'none', tailTip: 'none', skin: 'jelly', neck: 0, tail: 0, legs: 0, bulk: 0.5, headSize: 0.5, wing: 0, size: 1, color: '#4f9ccf', belly: '#bfe3f5' },
  };
  const OPTIONS = {
    horns: [['none', 'なし'], ['back', '後ろへ反る角'], ['ram', '巻き角'], ['antler', '枝分かれの角'], ['unicorn', '一本角'], ['bull', '牛のような角']],
    wings: [['none', 'なし'], ['bat', 'こうもり型（膜）'], ['feather', '鳥型（羽根）']],
    wingPose: [['up', '広げる'], ['fold', 'たたむ']],
    ridge: [['none', 'なし'], ['spikes', 'とげ'], ['fin', '背びれ'], ['mane', 'たてがみ']],
    tailTip: [['none', 'そのまま'], ['spade', '矢じり'], ['tuft', '房'], ['club', 'こぶ'], ['bushy', 'ふさふさ'], ['hair', '長い毛'], ['fan', '扇の羽根'], ['fluke', '尾びれ（横）'], ['fin', '尾びれ（縦）']],
  };
  const VIEWS = [['figure', '姿'], ['skeleton', '骨格'], ['xray', '透かし']];
  const COLORS = ['#55604a', '#2f6b5e', '#3e5266', '#6b4a3a', '#8a2f2a', '#3a3430', '#6e6a64', '#b08a52', '#8a6a4a', '#d8d2c4', '#4f9ccf', '#6a4a8a'];
  const BELLIES = ['#c8b48a', '#d9c27a', '#efe6d2', '#c9d2d6', '#8a705a', '#b84a3a', '#bfe3f5', '#3a3430'];

  /** 図の設定（保存されている分）とひな形を合わせて、描くための値にする */
  function resolve(fig) {
    fig = fig || {};
    const id = PRESETS[fig.preset] ? fig.preset : 'dragon';
    const P = PRESETS[id];
    const num = (k, d) => (Number.isFinite(+fig[k]) ? clamp(+fig[k], 0, 1) : d);
    const pick = (k, list) => (list.some((o) => o[0] === fig[k]) ? fig[k] : P[k]);
    return {
      preset: id, plan: P.plan, head: P.head, feet: P.feet, frontFeet: P.frontFeet || P.feet, fly: !!P.fly, legs4: !!P.legs4, skin: P.skin,
      neck: num('neck', P.neck), tail: num('tail', P.tail), legs: num('legs', P.legs), bulk: num('bulk', P.bulk), headSize: num('head', P.headSize), wing: num('wing', P.wing || 0.5),
      horns: pick('horns', OPTIONS.horns), wings: P.plan === 'quad' || P.plan === 'biped' || P.plan === 'bird' || P.plan === 'humanoid' ? pick('wings', OPTIONS.wings) : 'none',
      wingPose: fig.wingPose === 'fold' ? 'fold' : 'up',
      ridge: pick('ridge', OPTIONS.ridge), tailTip: pick('tailTip', OPTIONS.tailTip),
      color: HEX.test(fig.color || '') ? fig.color : P.color, belly: HEX.test(fig.belly || '') ? fig.belly : P.belly,
      seed: Number.isFinite(+fig.seed) ? +fig.seed : 1,
    };
  }

  // ───── 頭（頭の付け根を原点、頭の向きを +x、長さ 1 の座標） ─────
  // shape：肉づき、skull：頭骨、eye：目、jaw：口の線、nose：鼻の穴、teeth：歯を並べる区間
  const HEADS = {
    reptile: {
      shape: [[-0.12, 0.27], [0.12, 0.31], [0.34, 0.33], [0.46, 0.29], [0.6, 0.23], [0.86, 0.16], [0.99, 0.09], [1.0, -0.02, 1], [0.93, -0.08], [0.62, -0.15], [0.3, -0.22], [0.04, -0.29], [-0.14, -0.24]],
      skull: [[-0.08, 0.2], [0.12, 0.27], [0.36, 0.29], [0.58, 0.21], [0.86, 0.14], [0.99, 0.07], [0.99, -0.02, 1], [0.6, -0.05], [0.2, -0.06], [-0.08, -0.08]],
      jawBone: [[-0.1, -0.06], [0.3, -0.08], [0.95, -0.05, 1], [0.6, -0.13], [0.25, -0.2], [0.0, -0.22], [-0.12, -0.16]],
      holes: [[0.4, 0.17, 0.085, 0.07], [0.66, 0.09, 0.09, 0.045], [0.12, 0.08, 0.07, 0.06], [0.92, 0.07, 0.03, 0.025]],
      eye: [0.41, 0.18], jaw: [[0.99, -0.03], [0.6, -0.06], [0.3, -0.07], [0.18, -0.03]], nose: [0.9, 0.11], teeth: [0.25, 0.97], horn: [0.12, 0.27],
    },
    eastern: {
      shape: [[-0.12, 0.27], [0.12, 0.33], [0.32, 0.34], [0.44, 0.27], [0.62, 0.22], [0.8, 0.22], [0.92, 0.2], [1.02, 0.1], [1.0, -0.02, 1], [0.93, -0.07], [0.62, -0.14], [0.3, -0.2], [0.04, -0.27], [-0.14, -0.22]],
      skull: [[-0.08, 0.2], [0.12, 0.27], [0.36, 0.29], [0.58, 0.2], [0.86, 0.16], [0.99, 0.08], [0.99, -0.02, 1], [0.6, -0.05], [0.2, -0.06], [-0.08, -0.08]],
      jawBone: [[-0.1, -0.06], [0.3, -0.08], [0.95, -0.05, 1], [0.6, -0.12], [0.25, -0.18], [0.0, -0.2], [-0.12, -0.15]],
      holes: [[0.38, 0.17, 0.085, 0.07], [0.66, 0.1, 0.08, 0.04], [0.92, 0.08, 0.03, 0.025]],
      eye: [0.38, 0.19], jaw: [[0.99, -0.03], [0.6, -0.06], [0.3, -0.07], [0.16, -0.02]], nose: [0.93, 0.13], teeth: [0.3, 0.97], horn: [0.1, 0.28], whiskers: true,
    },
    snake: {
      shape: [[-0.15, 0.22], [0.2, 0.27], [0.55, 0.26], [0.85, 0.16], [1.0, 0.04], [0.98, -0.06, 1], [0.8, -0.12], [0.4, -0.18], [0.0, -0.22], [-0.15, -0.2]],
      skull: [[-0.1, 0.17], [0.2, 0.22], [0.55, 0.21], [0.85, 0.12], [0.97, 0.03], [0.95, -0.03, 1], [0.5, -0.04], [-0.1, -0.06]],
      jawBone: [[-0.12, -0.06], [0.5, -0.06], [0.93, -0.06, 1], [0.6, -0.12], [0.1, -0.17], [-0.14, -0.14]],
      holes: [[0.62, 0.11, 0.08, 0.065], [0.9, 0.05, 0.025, 0.02]],
      eye: [0.62, 0.12], jaw: [[0.98, -0.04], [0.5, -0.06], [0.2, -0.07]], nose: [0.93, 0.08], teeth: [0.3, 0.9], horn: [0.3, 0.24], tongue: true,
    },
    canine: {
      shape: [[-0.12, 0.3], [0.12, 0.38], [0.36, 0.38], [0.5, 0.27], [0.8, 0.2], [0.97, 0.16], [1.0, 0.06, 1], [0.95, -0.02], [0.86, -0.08], [0.6, -0.16], [0.3, -0.24], [0.02, -0.32], [-0.16, -0.26]],
      skull: [[-0.1, 0.24], [0.12, 0.33], [0.36, 0.33], [0.5, 0.23], [0.8, 0.16], [0.97, 0.12], [0.98, 0.02, 1], [0.6, -0.04], [0.2, -0.05], [-0.1, -0.08]],
      jawBone: [[-0.08, -0.08], [0.3, -0.07], [0.92, -0.03, 1], [0.6, -0.12], [0.3, -0.18], [0.05, -0.24], [-0.1, -0.18]],
      holes: [[0.38, 0.19, 0.085, 0.08], [0.12, 0.1, 0.08, 0.06], [0.95, 0.07, 0.025, 0.03]],
      eye: [0.4, 0.22], jaw: [[0.95, -0.02], [0.6, -0.07], [0.32, -0.09]], nose: [0.97, 0.1], noseBlob: true, teeth: [0.4, 0.94], horn: [0.1, 0.33], ear: [[0.0, 0.32], [0.1, 0.66, 1], [0.26, 0.36]],
    },
    feline: {
      shape: [[-0.14, 0.32], [0.12, 0.42], [0.42, 0.42], [0.62, 0.3], [0.86, 0.2], [0.97, 0.12], [0.98, 0.02, 1], [0.9, -0.06], [0.7, -0.15], [0.36, -0.26], [0.04, -0.34], [-0.18, -0.28]],
      skull: [[-0.12, 0.26], [0.12, 0.36], [0.42, 0.36], [0.62, 0.26], [0.86, 0.17], [0.96, 0.08], [0.96, 0.0, 1], [0.6, -0.04], [0.2, -0.05], [-0.12, -0.08]],
      jawBone: [[-0.1, -0.08], [0.3, -0.07], [0.9, -0.04, 1], [0.6, -0.13], [0.3, -0.2], [0.05, -0.26], [-0.12, -0.2]],
      holes: [[0.48, 0.2, 0.11, 0.1], [0.94, 0.06, 0.025, 0.03]],
      eye: [0.5, 0.22], jaw: [[0.95, -0.03], [0.62, -0.08], [0.4, -0.08]], nose: [0.96, 0.1], noseBlob: true, teeth: [0.55, 0.92], horn: [0.12, 0.38], ear: [[0.02, 0.36], [0.12, 0.6, 1], [0.28, 0.4]],
    },
    bear: {
      shape: [[-0.14, 0.34], [0.1, 0.42], [0.36, 0.4], [0.56, 0.3], [0.78, 0.22], [0.94, 0.17], [1.0, 0.08], [0.98, 0.0], [0.9, -0.08], [0.7, -0.17], [0.36, -0.3], [0.04, -0.38], [-0.18, -0.3]],
      skull: [[-0.12, 0.26], [0.12, 0.34], [0.4, 0.33], [0.56, 0.24], [0.8, 0.18], [0.97, 0.12], [0.98, 0.02, 1], [0.6, -0.04], [0.2, -0.05], [-0.12, -0.08]],
      jawBone: [[-0.1, -0.08], [0.3, -0.07], [0.92, -0.04, 1], [0.6, -0.13], [0.3, -0.2], [0.05, -0.26], [-0.12, -0.2]],
      holes: [[0.42, 0.2, 0.08, 0.075], [0.96, 0.08, 0.025, 0.03]],
      eye: [0.44, 0.22], jaw: [[0.95, -0.03], [0.62, -0.08], [0.4, -0.09]], nose: [0.98, 0.1], noseBlob: true, teeth: [0.5, 0.94], horn: [0.12, 0.36], ear: [[0.02, 0.34], [0.1, 0.5], [0.22, 0.38]],
    },
    equine: {
      shape: [[-0.1, 0.3], [0.1, 0.36], [0.28, 0.33], [0.6, 0.2], [0.88, 0.1], [1.0, 0.02], [1.0, -0.1, 1], [0.92, -0.18], [0.78, -0.17], [0.5, -0.2], [0.24, -0.34], [0.0, -0.36], [-0.14, -0.26]],
      skull: [[-0.08, 0.24], [0.1, 0.3], [0.28, 0.28], [0.6, 0.16], [0.88, 0.07], [0.98, -0.02, 1], [0.6, -0.06], [0.2, -0.06], [-0.08, -0.08]],
      jawBone: [[-0.1, -0.08], [0.3, -0.08], [0.95, -0.08, 1], [0.7, -0.14], [0.3, -0.26], [0.04, -0.3], [-0.1, -0.2]],
      holes: [[0.24, 0.17, 0.075, 0.07], [0.9, 0.0, 0.035, 0.03]],
      eye: [0.25, 0.18], jaw: [[0.98, -0.1], [0.86, -0.12]], nose: [0.93, 0.0], teeth: [0.75, 0.95], horn: [0.18, 0.33], ear: [[0.0, 0.33], [0.04, 0.6, 1], [0.14, 0.34]],
    },
    beak: {
      shape: [[-0.14, 0.24], [0.06, 0.38], [0.3, 0.4], [0.5, 0.3], [0.62, 0.24], [0.86, 0.14], [0.99, 0.0], [0.98, -0.14, 1], [0.9, -0.06], [0.66, -0.08], [0.46, -0.14], [0.2, -0.24], [-0.12, -0.26]],
      skull: [[-0.1, 0.2], [0.06, 0.32], [0.3, 0.33], [0.5, 0.25], [0.86, 0.12], [0.98, -0.02], [0.96, -0.12, 1], [0.6, -0.06], [0.2, -0.08], [-0.1, -0.1]],
      jawBone: [[-0.08, -0.1], [0.4, -0.08], [0.88, -0.06, 1], [0.6, -0.11], [0.3, -0.16], [-0.06, -0.18]],
      holes: [[0.3, 0.17, 0.11, 0.11], [0.72, 0.1, 0.05, 0.025]],
      eye: [0.32, 0.18], jaw: [[0.92, -0.06], [0.6, -0.07], [0.48, -0.06]], nose: [0.68, 0.14], beak: [[0.5, 0.29], [0.62, 0.24], [0.86, 0.14], [0.99, 0.0], [0.98, -0.14, 1], [0.9, -0.06], [0.66, -0.08], [0.5, -0.1]], horn: [0.08, 0.34],
    },
    human: {
      shape: [[-0.32, 0.72], [-0.2, 0.95], [0.05, 1.02], [0.22, 0.9], [0.27, 0.7], [0.34, 0.56, 1], [0.27, 0.5], [0.3, 0.42], [0.27, 0.32], [0.24, 0.18], [0.1, 0.06], [-0.12, 0.02], [-0.24, 0.2], [-0.34, 0.45]],
      skull: [[-0.3, 0.72], [-0.18, 0.93], [0.05, 0.99], [0.2, 0.88], [0.25, 0.7], [0.28, 0.56], [0.24, 0.42], [-0.1, 0.38], [-0.26, 0.42], [-0.32, 0.56]],
      jawBone: [[-0.12, 0.4], [0.23, 0.38], [0.24, 0.28], [0.2, 0.16], [0.06, 0.08], [-0.08, 0.14], [-0.12, 0.3]],
      holes: [[0.12, 0.66, 0.08, 0.07], [0.22, 0.52, 0.03, 0.04]],
      eye: [0.16, 0.66], jaw: [[0.29, 0.38], [0.2, 0.37]], nose: null, teeth: null, horn: [0.0, 0.95], ear: [[-0.06, 0.62], [-0.02, 0.52], [-0.12, 0.44], [-0.16, 0.56]], upright: true,
    },
  };

  // ───── 組み立て ─────
  function Model() {
    this.prims = []; // 肉づき（layer で描く順番を決める）
    this.bones = []; // 骨格
    this.spine = []; // 背骨の点（骨格・体積の計算に使う）
    this.wingArea = 0;
    this.wingSpan = 0;
    this.limbVol = 0;
    this.extraVol = 0;
    this.measure = null; // 全長を測る方法（'x'＝横の長さ、'arc'＝体に沿った長さ、'h'＝背の高さ）
  }
  Model.prototype.shape = function (layer, pts, fill, opt) { this.prims.push(Object.assign({ t: 'path', layer, pts, closed: true, fill }, opt || {})); };
  Model.prototype.line = function (layer, pts, stroke, w, opt) { this.prims.push(Object.assign({ t: 'path', layer, pts, closed: false, fill: 'none', stroke, sw: w }, opt || {})); };
  Model.prototype.circle = function (layer, c, r, fill, opt) { this.prims.push(Object.assign({ t: 'circle', layer, c, r, fill }, opt || {})); };
  Model.prototype.bone = function (a, b, w, opt) { this.bones.push(Object.assign({ t: 'bone', a, b, w }, opt || {})); };
  Model.prototype.boneShape = function (pts, opt) { this.bones.push(Object.assign({ t: 'shape', pts }, opt || {})); };

  const LAYERS = ['wingFar', 'far', 'farDetail', 'ridge', 'mane0', 'body', 'belly', 'texture', 'bodyDetail', 'mane', 'head', 'headDetail', 'near', 'nearDetail', 'wingNear', 'wingDetail', 'top'];

  /** 頭を置く：base（付け根）・angle（向き）・L（長さ） */
  function placeHead(m, type, base, angle, L, c, opts) {
    const H = HEADS[type];
    if (!H) return null;
    opts = opts || {};
    const ux = dir(angle);
    const uy = perp(ux);
    const T = (p) => {
      if (H.upright) return [base[0] + p[0] * L, base[1] + p[1] * L, p[2]];
      return [base[0] + ux[0] * p[0] * L + uy[0] * p[1] * L, base[1] + ux[1] * p[0] * L + uy[1] * p[1] * L, p[2]];
    };
    const TT = (arr) => arr.map(T);
    // 角（頭の後ろに）
    hornsAt(m, c, T(H.horn), angle, L, H.upright);
    if (H.ear && c.horns !== 'antler') m.shape('head', TT(H.ear), 'skin', { smooth: 0.6 });
    m.shape('head', TT(H.shape), 'skin', { tex: true });
    if (H.beak) m.shape('headDetail', TT(H.beak), 'beak');
    // 目・口・鼻
    const eye = T(H.eye);
    const er = L * (type === 'beak' ? 0.075 : type === 'human' ? 0.05 : 0.06);
    m.circle('headDetail', eye, er, 'eye');
    if (/reptile|eastern|snake/.test(type)) m.prims.push({ t: 'ellipse', layer: 'headDetail', c: eye, rx: er * 0.25, ry: er * 0.8, rot: angle, fill: 'pupil' });
    else m.circle('headDetail', eye, er * 0.55, 'pupil');
    m.circle('headDetail', add(eye, mul(add(ux, uy), er * 0.25)), er * 0.22, 'glint');
    if (H.jaw) m.line('headDetail', TT(H.jaw), 'ink', 1.1);
    if (H.nose) {
      if (H.noseBlob) m.circle('headDetail', T(H.nose), L * 0.05, 'pupil');
      else m.circle('headDetail', T(H.nose), L * 0.022, 'pupil');
    }
    if (H.teeth && /reptile|eastern/.test(type)) {
      const [a, b] = H.teeth;
      const n = Math.round(lerp(4, 9, (b - a)));
      for (let i = 0; i < n; i++) {
        const x = lerp(a, b, (i + 0.5) / n);
        const y = interpY(H.jaw, x);
        if (y == null) continue;
        m.shape('headDetail', [T([x - 0.025, y + 0.004]), T([x + 0.025, y + 0.004]), T([x, y - 0.05, 1])], 'tooth', { smooth: 0 });
      }
    } else if (H.teeth && /canine|feline|bear/.test(type)) {
      // 獣は牙を一本だけ
      const x = H.teeth[1] - 0.06;
      const y = interpY(H.jaw, x);
      if (y != null) m.shape('headDetail', [T([x - 0.03, y + 0.01]), T([x + 0.02, y + 0.01]), T([x - 0.01, y - 0.09, 1])], 'tooth', { smooth: 0 });
    }
    if (H.tongue) m.line('headDetail', [T([0.98, -0.04]), T([1.14, -0.06]), T([1.22, -0.02])], 'tongue', 1.2);
    if (H.whiskers) {
      const s = T([0.95, 0.06]);
      m.line('headDetail', [s, T([1.2, 0.0]), T([1.45, 0.12]), T([1.7, 0.02])], 'mane', 1.6, { smooth: 1 });
      m.line('headDetail', [T([0.9, -0.02]), T([1.1, -0.15]), T([1.32, -0.1]), T([1.5, -0.24])], 'mane', 1.4, { smooth: 1 });
      // あごひげ
      m.shape('mane0', [T([0.3, -0.18]), T([0.55, -0.15]), T([0.5, -0.36]), T([0.38, -0.5, 1]), T([0.3, -0.34])], 'mane');
    }
    if (type === 'human' && opts.tusks) m.shape('headDetail', [T([0.18, 0.3]), T([0.22, 0.32]), T([0.24, 0.48, 1])], 'tooth', { smooth: 0 });
    // 骨
    m.boneShape(TT(H.skull), { holes: H.holes.map((h0) => ({ c: T([h0[0], h0[1]]), rx: h0[2] * L, ry: h0[3] * L, rot: H.upright ? 0 : angle })) });
    m.boneShape(TT(H.jawBone));
    if (H.teeth && c.plan !== 'fish') {
      const [a, b] = H.teeth;
      const n = Math.round(lerp(4, 9, (b - a)));
      for (let i = 0; i < n; i++) {
        const x = lerp(a, b, (i + 0.5) / n);
        const y = interpY(H.skull, x, true);
        if (y == null) continue;
        m.boneShape([T([x - 0.022, y]), T([x + 0.022, y]), T([x, y - 0.06, 1])], { smooth: 0 });
      }
    }
    return { eye, T };
  }
  /** 折れ線の x における y（いちばん下の辺を使うときは lower） */
  function interpY(line, x, lower) {
    let best = null;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]; const b = line[i + 1];
      if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) {
        const y = lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
        if (best == null || (lower ? y < best : true)) best = y;
        if (!lower) break;
      }
    }
    return best;
  }

  /** 角 */
  function hornsAt(m, c, p, angle, L, upright) {
    if (c.horns === 'none') return;
    const back = upright ? 90 : angle + 180;
    const curve = (start, a0, a1, length, w0) => {
      // 先へ行くほど細く曲がる角
      const n = 6;
      const left = []; const right = [];
      let q = start;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = lerp(a0, a1, t);
        const w = w0 * (1 - t * 0.92);
        const nr = perp(dir(a));
        left.push(add(q, mul(nr, w / 2)));
        right.push(add(q, mul(nr, -w / 2)));
        q = add(q, mul(dir(a), length / n));
      }
      const tip = right.pop(); left.pop();
      return left.concat([[q[0], q[1], 1]], right.reverse());
    };
    const put = (pts, far) => {
      m.shape(far ? 'mane0' : 'headDetail', pts, far ? 'hornFar' : 'horn');
      m.boneShape(pts);
    };
    if (c.horns === 'back') {
      put(curve(add(p, mul(dir(back + 60), L * 0.02)), back - 25, back + 5, L * 0.75, L * 0.12), true);
      put(curve(p, back - 30, back - 2, L * 0.8, L * 0.13));
    } else if (c.horns === 'ram') {
      const pts = [];
      const pts2 = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const a = back - 40 + t * 330 * (upright ? -1 : 1);
        const r = L * (0.28 - t * 0.18);
        const q = add(add(p, mul(dir(back - 40), -L * 0.02)), mul(dir(a - 90), r * 0.9));
        const w = L * 0.11 * (1 - t * 0.7);
        pts.push(add(q, mul(dir(a - 90), w / 2)));
        pts2.push(add(q, mul(dir(a - 90), -w / 2)));
      }
      put(pts.concat(pts2.reverse()));
    } else if (c.horns === 'antler') {
      const stem = (s, a, l, w, depth, far) => {
        const e = add(s, mul(dir(a), l));
        m.line(far ? 'mane0' : 'headDetail', [s, e], far ? 'hornFar' : 'horn', 0, { width: w * 1, cap: true });
        m.bone(s, e, w * 0.9, { plain: true });
        if (depth > 0) {
          stem(lerp2(s, e, 0.55), a - 38, l * 0.55, w * 0.7, depth - 1, far);
          stem(e, a + 18, l * 0.6, w * 0.7, depth - 1, far);
        }
      };
      stem(add(p, mul(dir(back), -L * 0.04)), back - 50, L * 0.45, L * 0.07, 2, true);
      stem(p, back - 62, L * 0.5, L * 0.08, 2, false);
    } else if (c.horns === 'unicorn') {
      const base = upright ? add(p, [L * 0.15, -L * 0.05]) : add(p, mul(dir(angle), L * 0.22));
      const a = upright ? 70 : clamp(angle + 100, 35, 75);
      const tip = add(base, mul(dir(a), L * 0.9));
      const nr = perp(dir(a));
      const pts = [add(base, mul(nr, L * 0.05)), [tip[0], tip[1], 1], add(base, mul(nr, -L * 0.05))];
      put(pts);
      for (let i = 1; i < 5; i++) {
        const q = lerp2(base, tip, i / 5);
        m.line('headDetail', [add(q, mul(nr, L * 0.05 * (1 - i / 5))), add(add(q, mul(dir(a), L * 0.04)), mul(nr, -L * 0.05 * (1 - i / 5)))], 'ink', 0.6);
      }
    } else if (c.horns === 'bull') {
      put(curve(add(p, mul(dir(back + 60), L * 0.02)), back - 100, back - 190, L * 0.45, L * 0.12), true);
      put(curve(p, back - 110, back - 200, L * 0.5, L * 0.13));
    }
  }

  /** 背骨の線と太さから胴体を作る。keys: [{p:[x,y], d: 背中側, v: 腹側, tag}] */
  function bodyFromSpine(m, keys, c, opts) {
    opts = opts || {};
    const pts = keys.map((k) => k.p);
    const S = crSample(pts, opts.per || 10, [keys.map((k) => k.d), keys.map((k) => k.v), keys.map((k, i) => i)]);
    const P = S.pts;
    const Dd = S.extra[0].map((v) => Math.max(0.004, v));
    const Vv = S.extra[1].map((v) => Math.max(0.004, v));
    const idx = S.extra[2];
    const top = []; const bot = []; const nrms = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)]; const b = P[Math.min(P.length - 1, i + 1)];
      const n = perp(norm(sub(b, a)));
      nrms.push(n);
      top.push(add(P[i], mul(n, Dd[i])));
      bot.push(add(P[i], mul(n, -Vv[i])));
    }
    let outline;
    if (opts.round) {
      // 尾のない体：後ろを丸く閉じる
      const t0 = norm(sub(P[1], P[0]));
      const r0 = (Dd[0] + Vv[0]) / 2;
      const ctr = add(P[0], mul(nrms[0], (Dd[0] - Vv[0]) / 2));
      outline = [add(ctr, mul(t0, -r0 * 0.85))].concat(top, bot.slice().reverse());
    } else {
      // 尾の先は細くとがらせる
      const tip = [P[0][0], P[0][1], 1];
      outline = [tip].concat(top.slice(1), bot.slice(1).reverse());
    }
    m.shape('body', outline, 'skin', { tex: true, body: true });
    const spine = P.map((p, i) => ({ p, n: nrms[i], d: Dd[i], v: Vv[i], k: idx[i] }));
    m.spine = spine;
    // 体積（だ円の断面を積み上げる）
    let vol = 0;
    for (let i = 1; i < spine.length; i++) {
      const ds = len(sub(spine[i].p, spine[i - 1].p));
      const depth = spine[i].d + spine[i].v;
      vol += Math.PI / 4 * depth * depth * (opts.widthK || 0.72) * ds;
    }
    m.bodyVol = vol;
    return spine;
  }

  /** 腹の帯（爬虫類の腹板） */
  function bellyBand(m, spine, from, to, c) {
    if (to - from < 3) return;
    const outer = []; const inner = [];
    for (let i = from; i <= to; i++) {
      const s = spine[i];
      const w = Math.min(s.v * 0.42, 0.11);
      outer.push(add(s.p, mul(s.n, -s.v * 0.995)));
      inner.push(add(s.p, mul(s.n, -s.v + w)));
    }
    m.shape('belly', outer.concat(inner.slice().reverse()), 'belly', { smooth: 1, noStroke: true });
    if (c.skin === 'scale') {
      for (let i = from + 1; i < to; i += 2) {
        const s = spine[i];
        const w = Math.min(s.v * 0.42, 0.11);
        m.line('belly', [add(s.p, mul(s.n, -s.v)), add(s.p, mul(s.n, -s.v + w))], 'bellyLine', 0.6);
      }
    }
    m.line('belly', inner, 'bellyLine', 0.7);
  }

  /** 背のとげ・背びれ・たてがみ */
  function ridgeAlong(m, spine, from, to, c, opts) {
    opts = opts || {};
    if (c.ridge === 'none' || to <= from) return;
    if (c.ridge === 'spikes') {
      const step = Math.max(2, Math.round((to - from) / 26));
      for (let i = from; i < to; i += step) {
        const s = spine[i];
        const hgt = clamp(s.d * 0.7, 0.012, 0.16) * (opts.k || 1);
        const base = add(s.p, mul(s.n, s.d * 0.85));
        const t = norm(sub(spine[Math.min(spine.length - 1, i + 1)].p, s.p));
        const wdt = len(sub(spine[Math.min(spine.length - 1, i + step)].p, s.p)) * 0.55;
        const tipP = add(add(base, mul(s.n, hgt)), mul(t, -hgt * 0.45));
        m.shape('ridge', [add(base, mul(t, -wdt)), [tipP[0], tipP[1], 1], add(base, mul(t, wdt))], 'horn', { smooth: 0.4 });
      }
    } else if (c.ridge === 'fin') {
      const pts = [];
      const st = Math.max(1, Math.round((to - from) / 30));
      for (let i = from; i <= to; i += st) {
        const s = spine[i];
        const t = (i - from) / (to - from);
        const hgt = Math.sin(Math.PI * Math.pow(t, 0.8)) * clamp(s.d * 0.9, 0.02, 0.35) * (opts.k || 1);
        pts.push(add(s.p, mul(s.n, s.d * 0.8 + hgt)));
      }
      const base = [];
      for (let i = to; i >= from; i -= st) base.push(add(spine[i].p, mul(spine[i].n, spine[i].d * 0.5)));
      m.shape('ridge', pts.concat(base), 'membrane', { smooth: 1 });
      for (let i = from + st * 2; i < to; i += st * 2) {
        const s = spine[i];
        const t = (i - from) / (to - from);
        const hgt = Math.sin(Math.PI * Math.pow(t, 0.8)) * clamp(s.d * 0.9, 0.02, 0.35) * (opts.k || 1);
        m.line('ridge', [add(s.p, mul(s.n, s.d * 0.6)), add(s.p, mul(s.n, s.d * 0.8 + hgt * 0.95))], 'ink', 0.6);
      }
    } else if (c.ridge === 'mane' && opts.flow) {
      // 首すじに沿って横へ垂れるたてがみ
      const st = Math.max(1, Math.round((to - from) / 16));
      const r = rng(c.seed * 5 + 1);
      const top = []; const low = [];
      for (let i = from; i <= to; i += st) {
        const s = spine[i];
        const t = norm(sub(spine[Math.min(spine.length - 1, i + 1)].p, s.p));
        const hgt = clamp(s.d * 0.9, 0.04, 0.16);
        top.push(add(s.p, mul(s.n, s.d * 1.08)));
        const lk = hgt * (0.9 + r() * 0.6);
        const q = add(add(s.p, mul(s.n, s.d * 0.9 - lk * 0.9)), mul(t, -lk * 0.6));
        low.push([q[0], q[1], 1]);
        low.push(add(add(s.p, mul(s.n, s.d * 0.75 - lk * 0.35)), mul(t, lk * 0.2)));
      }
      m.shape('mane', top.concat(low.reverse()), 'mane', { smooth: 0.8 });
    } else if (c.ridge === 'mane') {
      const st = Math.max(1, Math.round((to - from) / 18));
      const out = [];
      const r = rng(c.seed * 7 + 3);
      for (let i = from; i <= to; i += st) {
        const s = spine[i];
        const t = norm(sub(spine[Math.min(spine.length - 1, i + 1)].p, s.p));
        const hgt = clamp(s.d * (0.55 + r() * 0.35), 0.02, 0.2) * (opts.k || 1);
        out.push(add(s.p, mul(s.n, s.d * 0.7)));
        const tp = add(add(s.p, mul(s.n, s.d + hgt)), mul(t, -hgt * 0.9));
        out.push([tp[0], tp[1], 1]);
      }
      const base = [];
      for (let i = to; i >= from; i -= st) base.push(add(spine[i].p, mul(spine[i].n, spine[i].d * 0.4)));
      m.shape('mane0', out.concat(base), 'mane', { smooth: 0.8 });
    }
  }

  /** 尾の先 */
  function tailTipAt(m, spine, c) {
    const s0 = spine[0]; const s1 = spine[3] || spine[1];
    const t = norm(sub(s0.p, s1.p));
    const nr = perp(t);
    const p = s0.p;
    const L = m.unit;
    if (c.tailTip === 'spade') {
      const a = add(p, mul(t, -L * 0.04));
      m.shape('body', [add(a, mul(nr, L * 0.02)), add(add(a, mul(t, L * 0.05)), mul(nr, L * 0.09)), [add(a, mul(t, L * 0.2))[0], add(a, mul(t, L * 0.2))[1], 1], add(add(a, mul(t, L * 0.05)), mul(nr, -L * 0.09)), add(a, mul(nr, -L * 0.02))], 'skin', { smooth: 0.5 });
      m.boneShape([add(a, mul(nr, L * 0.01)), add(add(a, mul(t, L * 0.05)), mul(nr, L * 0.06)), [add(a, mul(t, L * 0.17))[0], add(a, mul(t, L * 0.17))[1], 1], add(add(a, mul(t, L * 0.05)), mul(nr, -L * 0.06)), add(a, mul(nr, -L * 0.01))], { smooth: 0.5 });
    } else if (c.tailTip === 'tuft') {
      const a = add(p, mul(t, -L * 0.06));
      const pts = [];
      const r = rng(c.seed + 11);
      for (let i = 0; i <= 8; i++) {
        const th = -70 + i * 17.5;
        const rr = L * (0.09 + r() * 0.03) * (i % 2 ? 1 : 0.7);
        const q = add(a, add(mul(t, Math.cos(th * D2R) * rr * 1.6), mul(nr, Math.sin(th * D2R) * rr)));
        pts.push(i % 2 ? [q[0], q[1], 1] : q);
      }
      m.shape('mane', [add(a, mul(nr, L * 0.03))].concat(pts, [add(a, mul(nr, -L * 0.03))]), 'mane', { smooth: 0.7 });
    } else if (c.tailTip === 'club') {
      m.circle('body', add(p, mul(t, -L * 0.02)), L * 0.07, 'skin');
      m.bones.push({ t: 'ball', c: add(p, mul(t, -L * 0.02)), r: L * 0.055 });
    } else if (c.tailTip === 'fan') {
      for (let i = -2; i <= 2; i++) {
        const a = ang(t) + i * 12;
        const q = add(p, mul(dir(a), L * 0.32));
        const n2 = perp(dir(a));
        m.shape(i % 2 ? 'farDetail' : 'body', [add(p, mul(n2, L * 0.02)), add(lerp2(p, q, 0.6), mul(n2, L * 0.045)), q, add(lerp2(p, q, 0.6), mul(n2, -L * 0.045)), add(p, mul(n2, -L * 0.02))], i % 2 ? 'far' : 'skin', { smooth: 1 });
        m.line('bodyDetail', [p, lerp2(p, q, 0.95)], 'ink', 0.5);
      }
    } else if (c.tailTip === 'hair') {
      // 付け根から垂れ下がり、先が細くなびく長い毛
      const base = spine[Math.min(spine.length - 1, 2)].p;
      const r = rng(c.seed + 5);
      const back = mul(t, 1);
      const len0 = L * 1.15;
      const pts = [add(base, mul(nr, L * 0.05))];
      const right = [];
      let q = base;
      for (let i = 1; i <= 6; i++) {
        const u = i / 6;
        q = add(q, mul(norm(add(mul(back, 0.55 - u * 0.35), [0, -1])), len0 / 6));
        const w = L * (0.07 + Math.sin(u * Math.PI * 0.9) * 0.08) * (1 - u * 0.5);
        const n2 = perp(norm(add(mul(back, 0.55 - u * 0.35), [0, -1])));
        pts.push(add(q, mul(n2, -w)));
        right.push(add(q, mul(n2, w * 0.8)));
      }
      const tip = add(q, [r() * L * 0.03, -L * 0.08]);
      m.shape('mane', pts.concat([[tip[0], tip[1], 1]], right.reverse(), [add(base, mul(nr, -L * 0.04))]), 'mane', { smooth: 0.9 });
      for (let i = 0; i < 3; i++) m.line('mane', [lerp2(base, q, 0.15), lerp2(base, q, 0.55 + i * 0.12)].map((p2, j) => add(p2, mul(nr, L * 0.02 * (i - 1) * (j + 1)))), 'ink', 0.5);
    } else if (c.tailTip === 'fluke' || c.tailTip === 'fin') {
      // 魚の尾は fishTail で描く
    }
  }

  /** 脚1本（鎖の点と太さ）を描き、骨も足す */
  function legAt(m, chain, widths, layer, fillKey, foot, opts) {
    opts = opts || {};
    const outline = limbOutline(chain, widths);
    if (opts.top) {
      // 付け根（体の中）には線を引かず、体からなめらかに出ているように
      m.shape(layer, outline, fillKey, { tex: layer === 'near', noStroke: true });
      m.line(layer, outline.slice(1, -1), layer === 'near' ? 'ink' : 'farLine', 1, { smooth: 1, edge: true });
    } else m.shape(layer, outline, fillKey, { tex: layer === 'near' });
    const L = m.unit;
    // 足先
    const toe = chain[chain.length - 1];
    const ball = chain[chain.length - 2];
    const fwd = opts.fwd || 1;
    const det = layer === 'near' ? 'nearDetail' : 'farDetail';
    if (foot === 'claw' || foot === 'talon') {
      const tw = Math.max(widths[widths.length - 2] * 0.62, L * 0.02);
      const tl0 = Math.max(len(sub(toe, ball)), tw * 1.6);
      const toeFill = layer === 'near' ? 'skin' : 'far';
      const td = norm(sub(toe, ball));
      for (let i = 2; i >= 0; i--) {
        let b0; let e;
        if (opts.air) {
          // 宙に浮いた足：指を扇に開く
          b0 = ball;
          e = add(ball, mul(dir(ang(td) + (i - 1) * 22 * fwd), tl0 * (1.1 - Math.abs(i - 1) * 0.2)));
        } else {
          b0 = add(ball, [-fwd * i * tw * 0.5, -ball[1] * 0.2]);
          e = [b0[0] + fwd * tl0 * (1.15 - i * 0.22), tw * 0.32];
        }
        m.shape(det, limbOutline([b0, e], [tw * (1 - i * 0.1), tw * 0.6]), toeFill, { smooth: 1 });
        const cd = opts.air ? norm(sub(e, b0)) : [fwd, 0];
        const cn = perp(cd);
        const ct = add(add(e, mul(cd, tw * 0.85)), mul(cn, -fwd * tw * 0.3));
        m.shape(det, [add(e, mul(cn, fwd * tw * 0.3)), [ct[0], ct[1], 1], add(add(e, mul(cn, -fwd * tw * 0.28)), mul(cd, -tw * 0.12))], 'claw', { smooth: 0.5 });
      }
      if (foot === 'talon') {
        const hb = add(ball, [-fwd * tw * 0.6, -ball[1] * 0.4]);
        const ht = [hb[0] - fwd * tw * 1.4, tw * 0.25];
        m.shape(det, limbOutline([hb, ht], [tw * 0.8, tw * 0.5]), toeFill, { smooth: 1 });
        m.shape(det, [add(ht, [0, tw * 0.25]), [ht[0] - fwd * tw * 0.8, ht[1] - tw * 0.2, 1], add(ht, [fwd * tw * 0.1, -tw * 0.25])], 'claw', { smooth: 0.5 });
      }
    } else if (foot === 'paw') {
      if (opts.claws) {
        for (let i = 0; i < 2; i++) {
          const base = add(toe, [-fwd * L * 0.015 * i, L * 0.01]);
          const tipp = add(base, [fwd * L * 0.03, -L * 0.012]);
          m.shape(det, [add(base, [0, L * 0.012]), [tipp[0], tipp[1], 1], add(base, [-fwd * L * 0.01, -L * 0.004])], 'claw', { smooth: 0.5 });
        }
      }
    } else if (foot === 'hoof') {
      const w = widths[widths.length - 1] * 1.25;
      m.shape(det, [add(ball, [-w * 0.55, L * 0.004]), add(ball, [w * 0.45, L * 0.004]), add(toe, [w * 0.75, 0]), add(toe, [-w * 0.6, 0])].map((p, i) => (i >= 2 ? [p[0], p[1], 1] : p)), 'hoof', { smooth: 0.3 });
    }
    // 骨
    const first = opts.top ? 1 : 0;
    for (let i = first; i < chain.length - 1; i++) {
      const w = Math.max(widths[i], widths[i + 1]) * (i === first ? 0.3 : 0.36);
      m.bone(chain[i], chain[i + 1], Math.max(w, L * 0.008), { far: layer !== 'near' });
    }
    // 肉の量（円柱で近似）
    for (let i = first; i < chain.length - 1; i++) {
      const r = (widths[i] + widths[i + 1]) / 4;
      m.limbVol += Math.PI * r * r * len(sub(chain[i + 1], chain[i])) * 0.8;
    }
  }

  /** 膜の翼・羽根の翼 */
  function wingAt(m, root, c, scale, far, tailEnd) {
    const layer = far ? 'wingFar' : 'wingNear';
    const det = far ? 'wingFar' : 'wingDetail';
    const up = c.wingPose !== 'fold';
    const rot = far ? (up ? 14 : 4) : 0;
    const off = far ? [-scale * 0.1, scale * 0.02] : [0, 0];
    const r0 = add(root, off);
    if (c.wings === 'bat') {
      const hum = scale * 0.34; const fore = scale * 0.6;
      const a1 = up ? 142 + rot : 165; const a2 = up ? 52 + rot : 20;
      const elbow = add(r0, mul(dir(a1), hum));
      const wrist = add(elbow, mul(dir(a2), fore));
      // 指：手首から後ろへ扇のように開く（たたむと後ろへそろう）
      const fingers = up ? [[92, 0.5], [128, 1.0], [160, 0.92], [194, 0.78]] : [[192, 0.45], [198, 0.6], [203, 0.58], [208, 0.52]];
      const tips = fingers.map(([a, l]) => add(wrist, mul(dir(a + rot * 0.6), scale * l)));
      const attach = tailEnd;
      const mem = [r0, [elbow[0], elbow[1]], [wrist[0], wrist[1], 1]];
      // 指先のあいだは手首へ向かってくぼむ弧（膜のたるみ）
      for (let i = 0; i < tips.length; i++) {
        mem.push([tips[i][0], tips[i][1], 1]);
        const nx = i + 1 < tips.length ? tips[i + 1] : attach;
        const mid = lerp2(tips[i], nx, 0.5);
        const sag = mul(norm(sub(i + 1 < tips.length ? wrist : r0, mid)), len(sub(nx, tips[i])) * 0.2);
        mem.push(add(mid, sag));
      }
      mem.push([attach[0], attach[1], 1]);
      m.shape(layer, mem, far ? 'membraneFar' : 'membrane', { smooth: 0.9 });
      // 膜のすじ（指と指のあいだ）
      if (!far) {
        for (let i = 0; i < tips.length - 1; i++) {
          const q1 = lerp2(wrist, lerp2(tips[i], tips[i + 1], 0.5), 0.78);
          m.line('wingDetail', [lerp2(wrist, q1, 0.25), q1], 'farLine', 0.5, { smooth: 1 });
        }
      }
      // 腕（骨ばった上腕と前腕）
      const armW = scale * 0.05;
      const arm = [add(r0, mul(dir(a1 - 90), armW * 0.9)), add(elbow, mul(dir(a1 - 90), armW * 0.55)), [elbow[0] + dir(a1 + 90)[0] * armW * 0.2, elbow[1] + dir(a1 + 90)[1] * armW * 0.2, 1],
        add(wrist, mul(dir(a2 + 90), armW * 0.35)), [wrist[0] + dir(a2)[0] * armW * 0.5, wrist[1] + dir(a2)[1] * armW * 0.5, 1], add(wrist, mul(dir(a2 - 90), armW * 0.35)),
        add(elbow, mul(dir(a1 - 90), -armW * 0.4)), add(r0, mul(dir(a1 - 90), -armW * 0.9))];
      m.shape(det, arm, far ? 'far' : 'skin', { smooth: 0.5 });
      tips.forEach((tp, i) => m.line(det, [wrist, lerp2(wrist, tp, 0.55), tp], far ? 'farLine' : 'line', i === 1 ? 1.5 : 1.2, { smooth: 1 }));
      // 親指のつめ
      const th = add(wrist, mul(dir(a2 + 40), scale * 0.07));
      m.shape(det, [add(wrist, mul(dir(a2 + 130), scale * 0.015)), [th[0], th[1], 1], add(wrist, mul(dir(a2 - 50), scale * 0.015))], 'claw');
      // 骨
      m.bone(r0, elbow, armW * 0.7, { far });
      m.bone(elbow, wrist, armW * 0.55, { far });
      tips.forEach((tp) => m.bone(wrist, tp, armW * 0.28, { far, thin: true }));
      m.bones.push({ t: 'membrane', pts: mem, far });
      if (!far) {
        m.wingArea = polyArea(mem) * 2;
        m.wingSpan = (hum + fore + scale * 0.95) * 2 * 0.92;
      }
    } else if (c.wings === 'feather') {
      const hum = scale * 0.3; const fore = scale * 0.42; const hand = scale * 0.3;
      const a1 = up ? 108 + rot : 170; const a2 = up ? 62 + rot : 15; const a3 = up ? 96 + rot : 190;
      const elbow = add(r0, mul(dir(a1), hum));
      const wrist = add(elbow, mul(dir(a2), fore));
      const tipH = add(wrist, mul(dir(a3), hand));
      // 風切り羽：手から後ろへ、腕から下へ
      const prim = [];
      const nP = 7;
      for (let i = 0; i < nP; i++) {
        const t = i / (nP - 1);
        const base = lerp2(tipH, wrist, t);
        const a = up ? lerp(140, 200, t) + rot : lerp(185, 195, t);
        const l = scale * lerp(0.62, 0.5, t);
        prim.push({ base, tip: add(base, mul(dir(a), l)), a });
      }
      const sec = [];
      const nS = 6;
      for (let i = 1; i <= nS; i++) {
        const t = i / nS;
        const base = lerp2(wrist, elbow, t);
        const a = up ? lerp(208, 238, t) + rot : 198;
        const l = scale * lerp(0.48, 0.4, t);
        sec.push({ base, tip: add(base, mul(dir(a), l)), a });
      }
      const all = prim.concat(sec);
      const outline = [r0, elbow, wrist, tipH];
      all.forEach((fth) => outline.push(fth.tip));
      outline.push(tailEnd);
      m.shape(layer, outline, far ? 'membraneFar' : 'feather', { smooth: 0.7 });
      // 一枚ずつの羽根（先から順に重ねる）
      if (!far) {
        all.slice().reverse().forEach((fth) => {
          const n2 = perp(dir(fth.a));
          const w = scale * 0.045;
          const mid = lerp2(fth.base, fth.tip, 0.55);
          m.shape('wingDetail', [add(fth.base, mul(n2, w * 0.5)), add(mid, mul(n2, w)), fth.tip, add(mid, mul(n2, -w)), add(fth.base, mul(n2, -w * 0.5))], 'feather', { smooth: 1 });
          m.line('wingDetail', [fth.base, lerp2(fth.base, fth.tip, 0.92)], 'ink', 0.45);
        });
        // 雨おおい（付け根の小さな羽根の帯）
        const cov = [r0, elbow, wrist, tipH];
        const back = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const q = t < 0.5 ? lerp2(tipH, wrist, t * 2) : lerp2(wrist, elbow, (t - 0.5) * 2);
          back.push(add(q, mul(dir(up ? 205 : 195), scale * 0.17)));
        }
        m.shape('wingDetail', cov.concat(back), 'featherDark', { smooth: 0.8 });
      }
      m.bone(r0, elbow, scale * 0.04, { far });
      m.bone(elbow, wrist, scale * 0.032, { far });
      m.bone(wrist, tipH, scale * 0.026, { far });
      m.bones.push({ t: 'membrane', pts: outline, far, feather: true });
      if (!far) {
        m.wingArea = polyArea(outline) * 2;
        m.wingSpan = (hum + fore + hand + scale * 0.55) * 2 * 0.9;
      }
    }
  }

  // ───── 体の組み立て方ごと ─────
  // seg：上・下・甲・指の長さ（脚の長さに対する割合）。fseg は前脚。w：付け根〜指先の太さ
  const FEET = {
    claw: { seg: [0.42, 0.38, 0.17, 0.09], fseg: [0.36, 0.34, 0.15, 0.08], w: [0.44, 0.15, 0.09, 0.08, 0.05] },
    paw: { seg: [0.36, 0.38, 0.25, 0.07], fseg: [0.33, 0.42, 0.13, 0.07], w: [0.36, 0.13, 0.075, 0.07, 0.06] },
    hoof: { seg: [0.31, 0.36, 0.33, 0.07], fseg: [0.3, 0.38, 0.3, 0.06], w: [0.34, 0.12, 0.06, 0.055, 0.05] },
    talon: { seg: [0.28, 0.42, 0.32, 0.1], fseg: [0.3, 0.36, 0.18, 0.1], w: [0.26, 0.1, 0.045, 0.04, 0.03] },
    foot: { seg: [0.5, 0.47, 0.06, 0.16], fseg: [0.5, 0.47, 0.06, 0.16], w: [0.26, 0.13, 0.09, 0.08, 0.07] },
  };
  // 立ち姿の関節の向き（地面から：甲・すね・もも、度）
  const STAND = {
    paw: { hind: [110, 62, 120], front: [98, 90, 60] },
    hoof: { hind: [96, 66, 116], front: [92, 90, 62] },
    claw: { hind: [138, 80, 124], front: [116, 98, 54] },
    talon: { hind: [104, 66, 118], front: [112, 95, 55] },
    foot: { hind: [90, 90, 92], front: [90, 90, 92] },
  };
  /** 地面に立つ脚を、足先から関節を積み上げて作る（足先の玉が原点） */
  function standLeg(foot, front, reach) {
    const F = FEET[foot] || FEET.claw;
    const s = (front ? F.fseg : F.seg).map((v) => v * reach);
    const A = (STAND[foot] || STAND.claw)[front ? 'front' : 'hind'];
    const ball = [0, s[3] * 0.25];
    const ankle = add(ball, mul(dir(A[0]), s[2]));
    const joint = add(ankle, mul(dir(A[1]), s[1]));
    const socket = add(joint, mul(dir(A[2]), s[0]));
    return { socket, joint, ankle, ball, toe: [s[3] * (foot === 'foot' ? 1.1 : 1), 0], s };
  }
  function legWidths(foot, reach, bulk, front) {
    const F = FEET[foot] || FEET.claw;
    const w = F.w.map((v, i) => v * Math.max(reach, 0.7) * (i === 0 ? bulk : Math.pow(bulk, 0.8)) * (front && i === 0 ? 0.85 : 1));
    return [w[0] * 0.7].concat(w);
  }
  /** 立ち姿の脚を footX に置く */
  function placeStand(rel, footX, foot, reach, bulk, front) {
    const T = (p) => [p[0] + footX, p[1]];
    const widths = legWidths(foot, reach, bulk, front);
    const socket = T(rel.socket);
    const top = add(socket, [front ? 0.02 : -0.04, Math.min(widths[1] * 0.5, 0.1)]);
    return { chain: [top, socket, T(rel.joint), T(rel.ankle), T(rel.ball), T(rel.toe)], widths, top: true };
  }
  /** 脚の鎖：付け根 root から、地面の足の位置 footX へ（歩いている脚） */
  function legChain(root, footX, reach, foot, front, bulk) {
    const F = FEET[foot] || FEET.claw;
    const s = (front ? F.fseg : F.seg).map((v) => v * reach);
    const A = (STAND[foot] || STAND.claw)[front ? 'front' : 'hind'];
    const ball = [footX, s[3] * 0.25];
    const ankle = add(ball, mul(dir(A[0]), s[2]));
    const r = ik(root, ankle, s[0], s[1], front ? -1 : 1);
    const toe = foot === 'foot' ? [footX + s[3] * 1.1, 0] : [footX + s[3], 0];
    const widths = legWidths(foot, reach, bulk, front);
    const top = add(root, [front ? 0.02 : -0.04, Math.min(widths[1] * 0.5, 0.1)]);
    return { chain: [top, root, r.joint, r.end, ball, toe], widths, top: true };
  }

  function buildQuad(m, c) {
    const bulk = 0.7 + c.bulk * 0.8;
    const T = c.head === 'bear' ? 0.82 : 1;
    const reach = (0.5 + c.legs * 0.8) * (c.head === 'equine' ? 1.08 : 1);
    const neckLen = (0.2 + c.neck * 1.15) * (c.head === 'reptile' ? 1.1 : c.head === 'equine' ? 0.95 : 0.75);
    const tailLen = c.tailTip === 'none' && c.tail === 0 ? 0 : (0.08 + c.tail * 2.2) * (c.head === 'reptile' || c.head === 'beak' ? 1 : 0.55);
    const headK = { reptile: 0.42, canine: 0.42, feline: 0.36, bear: 0.4, equine: 0.54, beak: 0.36 }[c.head] || 0.4;
    const headLen = headK * (0.65 + c.headSize * 0.7);
    m.unit = headLen;
    const fr = c.head === 'equine' ? 1 : 0.97;
    const hindRel = standLeg(c.feet, false, reach);
    const frontRel = standLeg(c.frontFeet, true, reach * fr);
    const PR0 = { reptile: [0.15, 0.3], bear: [0.2, 0.34] }[c.head] || [0.12, 0.26];
    const hipSock = 0.04 + (PR0[0] + PR0[1]) * bulk * 0.2;
    const shSock = 0.16 * bulk;
    const H = [0, hindRel.socket[1] + hipSock];
    const shY = frontRel.socket[1] + shSock;
    const th = clamp(Math.asin(clamp((shY - H[1]) / T, -0.9, 0.9)) / D2R, -18, 25);
    const S = add(H, mul(dir(th), T));
    // 首と頭
    const reptile = c.head === 'reptile';
    const neckA = reptile ? 25 + c.neck * 40 : c.head === 'equine' ? 48 : c.head === 'bear' ? 12 : c.head === 'beak' ? 40 : 30;
    const c0d = clamp(neckLen * 0.3, 0.12, 0.3);
    const N1 = add(S, mul(dir(neckA + 10), Math.max(neckLen * 0.5, c0d + 0.1)));
    const B = add(N1, mul(dir(neckA - (reptile ? 22 : 8)), Math.max(neckLen * 0.5, 0.1)));
    const headA = { reptile: -12 + c.neck * 10, canine: -22, feline: -14, bear: -18, equine: -58, beak: -8 }[c.head] || -15;
    // 尾
    const droop = reptile ? [6, 12, 10, 2, -10] : c.tailTip === 'tuft' ? [35, 55, 50, 30, -10] : c.tailTip === 'hair' ? [40, 60, 70] : c.head === 'beak' ? [20, 35, 40, 30, 10] : [40, 55, 62, 58, 50];
    const tailPts = [];
    let q = H;
    const segs = droop.length;
    for (let i = 0; i < segs; i++) {
      q = add(q, mul(dir(180 + droop[i]), tailLen / segs));
      tailPts.push(q);
    }
    const tailThick = c.tailTip === 'bushy' ? 1.7 : reptile ? 1 : c.tailTip === 'hair' ? 0.9 : 0.55;
    const keys = [];
    for (let i = segs - 1; i >= 0 && tailLen > 0; i--) {
      const t = (i + 1) / segs;
      const th0 = lerp(0.12 * bulk, 0.012, Math.pow(t, 0.75)) * tailThick;
      keys.push({ p: tailPts[i], d: th0, v: th0 * (reptile ? 1.1 : 1) });
    }
    if (!tailLen) keys.push({ p: add(H, [-0.1 * bulk, -0.03]), d: 0.14 * bulk, v: 0.24 * bulk });
    // 胴の形（背の厚み・腰・腹・胸の深さ）
    const PR = { reptile: [0.15, 0.3, 0.4, 0.36], canine: [0.11, 0.21, 0.24, 0.37], feline: [0.12, 0.24, 0.27, 0.35], bear: [0.2, 0.34, 0.4, 0.4], equine: [0.13, 0.32, 0.4, 0.4], beak: [0.12, 0.24, 0.28, 0.36] }[c.head] || [0.13, 0.26, 0.32, 0.34];
    const belly = Math.min(PR[2] * bulk, (H[1] + S[1]) / 2 - 0.08);
    keys.push({ p: H, d: PR[0] * bulk, v: Math.min(PR[1] * bulk, H[1] - 0.1) });
    keys.push({ p: add(lerp2(H, S, 0.5), mul(perp(dir(th)), 0.03)), d: PR[0] * bulk * 1.05, v: belly });
    keys.push({ p: S, d: PR[0] * bulk * 1.1, v: Math.min(PR[3] * bulk, S[1] - 0.12) });
    const neckThick = c.head === 'equine' ? 1.15 : c.head === 'bear' ? 1.35 : 1;
    // 胸の前（首の付け根）を前へ張り出させる
    const C0 = add(S, mul(dir(th + (neckA - th) * 0.3), c0d));
    if (neckLen >= 0.45) keys.push({ p: C0, d: PR[0] * bulk, v: Math.min(PR[3] * bulk * 0.85, C0[1] - 0.15) });
    keys.push({ p: N1, d: (0.08 + 0.05 * bulk) * neckThick, v: (0.1 + 0.06 * bulk) * neckThick });
    keys.push({ p: B, d: headLen * 0.25, v: headLen * 0.27 });
    const spine = bodyFromSpine(m, keys, c, { widthK: { canine: 0.26, feline: 0.28, bear: 0.36, equine: 0.48, beak: 0.32 }[c.head] || 0.72, round: !tailLen });
    const iH = spine.findIndex((s) => Math.abs(s.p[0] - H[0]) < 1e-6 && Math.abs(s.p[1] - H[1]) < 1e-6);
    const iS = spine.findIndex((s) => Math.abs(s.p[0] - S[0]) < 1e-6 && Math.abs(s.p[1] - S[1]) < 1e-6);
    m.marks = { H, S, B, iH: Math.max(0, iH), iS: Math.max(0, iS), iEnd: spine.length - 1 };
    // 脚：遠い側（少し暗く・歩幅をずらす）→ 近い側（まっすぐ立つ）
    const hipR = add(H, [0.02, -hipSock]);
    const shR = add(S, [-0.01, -shSock]);
    const hindNear = placeStand(hindRel, hipR[0] - hindRel.socket[0] - 0.02, c.feet, reach, bulk, false);
    const frontNear = placeStand(frontRel, shR[0] - frontRel.socket[0] + 0.02, c.frontFeet, reach * fr, bulk, true);
    const hindFar = legChain(add(hipR, [0.03, 0.01]), hindNear.chain[4][0] + 0.16, reach, c.feet, false, bulk);
    const frontFar = legChain(add(shR, [0.03, 0.01]), frontNear.chain[4][0] - 0.14, reach * fr, c.frontFeet, true, bulk);
    legAt(m, frontFar.chain, frontFar.widths, 'far', 'far', c.frontFeet, { claws: true, top: true });
    legAt(m, hindFar.chain, hindFar.widths, 'far', 'far', c.feet, { top: true });
    m.nearLegs = [hindNear, frontNear];
    // 腹の帯・背のとげ・たてがみ
    if (c.skin === 'scale') bellyBand(m, spine, Math.round(spine.length * 0.12), spine.length - 2, c);
    if (c.ridge === 'mane' && c.head !== 'reptile') {
      if (c.head === 'feline') lionMane(m, B, headLen, headA, c);
      else ridgeAlong(m, spine, m.marks.iS, spine.length - 2, c, { k: 1.2, flow: c.head === 'equine' });
    } else ridgeAlong(m, spine, Math.round(spine.length * 0.04), spine.length - 2, c);
    tailTipAt(m, spine, c);
    placeHead(m, c.head, B, headA, headLen, c);
    legAt(m, hindNear.chain, hindNear.widths, 'near', 'skin', c.feet, { top: true });
    legAt(m, frontNear.chain, frontNear.widths, 'near', 'skin', c.frontFeet, { claws: true, top: true });
    if (c.wings !== 'none') {
      const scale = (0.6 + c.wing * 1.3) * (c.wings === 'feather' ? 0.9 : 1);
      const root = add(S, add(mul(dir(th + 90), 0.1 * bulk), mul(dir(th), -0.06)));
      const tailEnd = add(lerp2(H, S, 0.15), mul(dir(th + 90), 0.12 * bulk));
      wingAt(m, add(root, [0, 0]), c, scale, true, add(tailEnd, [-0.02, 0.02]));
      wingAt(m, root, c, scale, false, tailEnd);
    }
    m.measure = 'x';
    skeletonForSpine(m, spine, c, { iH: m.marks.iH, iS: m.marks.iS, hipR, shR, ribs: true });
  }

  function lionMane(m, B, headLen, headA, c) {
    const r = rng(c.seed + 21);
    const ctr = add(B, mul(dir(headA + 170), headLen * 0.05));
    const ruff = (R0, R1, layer, fill) => {
      const pts = [];
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const a = headA + 60 + i * (250 / n);
        const down = Math.max(0, Math.sin((a - headA - 150) * D2R)); // 下（胸）へ長く
        const rr = headLen * (i % 2 ? R0 + r() * 0.06 : R1) * (1 + down * 0.45);
        pts.push(add(ctr, mul(dir(a), rr)));
      }
      m.shape(layer, pts, fill, { smooth: 0.9 });
    };
    ruff(0.86, 0.72, 'mane0', 'mane');
    ruff(0.68, 0.58, 'mane', 'maneLight');
  }

  function buildBiped(m, c) {
    const bulk = 0.7 + c.bulk * 0.8;
    const T = 0.9;
    const reach = 0.7 + c.legs * 0.9;
    const wyvern = c.wings !== 'none';
    const neckLen = (0.2 + c.neck * 1.0);
    const tailLen = (0.4 + c.tail * 2.3);
    const headLen = 0.45 * (0.65 + c.headSize * 0.8);
    m.unit = headLen;
    const F = FEET[c.feet] || FEET.claw;
    const sock = 0.08 * bulk;
    const rel = standLeg(c.feet, false, reach);
    const H = [0, rel.socket[1] + sock];
    const th = wyvern ? 22 : 8;
    const S = add(H, mul(dir(th), T));
    const neckA = wyvern ? 50 : 32;
    const N1 = add(S, mul(dir(neckA + 10), neckLen * 0.5));
    const B = add(N1, mul(dir(neckA - 25), neckLen * 0.5));
    const headA = wyvern ? -8 : -6;
    const droop = wyvern ? [16, 18, 8, -4, -14] : [10, 6, 2, 0, -2];
    const tailPts = [];
    let q = H;
    droop.forEach((dr) => { q = add(q, mul(dir(180 + dr), tailLen / droop.length)); tailPts.push(q); });
    const keys = [];
    for (let i = droop.length - 1; i >= 0; i--) {
      const t = (i + 1) / droop.length;
      const th0 = lerp(0.16 * bulk, 0.012, Math.pow(t, 0.7));
      keys.push({ p: tailPts[i], d: th0, v: th0 * 1.15 });
    }
    keys.push({ p: H, d: 0.17 * bulk, v: 0.28 * bulk });
    keys.push({ p: lerp2(H, S, 0.5), d: 0.16 * bulk, v: 0.32 * bulk });
    keys.push({ p: S, d: 0.14 * bulk, v: 0.24 * bulk });
    keys.push({ p: N1, d: 0.09 + 0.04 * bulk, v: 0.1 + 0.05 * bulk });
    keys.push({ p: B, d: headLen * 0.25, v: headLen * 0.27 });
    const spine = bodyFromSpine(m, keys, c, { widthK: 0.55 });
    const iH = spine.findIndex((s) => Math.abs(s.p[0] - H[0]) < 1e-6 && Math.abs(s.p[1] - H[1]) < 1e-6);
    const iS = spine.findIndex((s) => Math.abs(s.p[0] - S[0]) < 1e-6 && Math.abs(s.p[1] - S[1]) < 1e-6);
    m.marks = { H, S, B, iH, iS };
    const hipR = add(H, [0.04, -sock]);
    const near = placeStand(rel, hipR[0] - rel.socket[0], c.feet, reach, bulk * 1.15, false);
    const far = legChain(add(hipR, [0.03, 0.01]), near.chain[4][0] - 0.2, reach, c.feet, false, bulk * 1.15);
    legAt(m, far.chain, far.widths, 'far', 'far', c.feet, { top: true });
    if (c.skin === 'scale') bellyBand(m, spine, Math.round(spine.length * 0.1), spine.length - 2, c);
    ridgeAlong(m, spine, Math.round(spine.length * 0.04), spine.length - 2, c);
    tailTipAt(m, spine, c);
    placeHead(m, c.head, B, headA, headLen, c);
    legAt(m, near.chain, near.widths, 'near', 'skin', c.feet, { top: true });
    const shR = add(S, mul(dir(th - 90), 0.12 * bulk));
    if (!wyvern) {
      // 小さな腕
      const arm = [shR, add(shR, mul(dir(-120), 0.2)), add(add(shR, mul(dir(-120), 0.2)), mul(dir(-40), 0.17))];
      const hand = add(arm[2], mul(dir(-60), 0.05));
      m.shape('far', limbOutline(arm.map((p) => add(p, [0.04, 0.02])).concat([add(hand, [0.04, 0.02])]), [0.07, 0.045, 0.03, 0.02]), 'far');
      m.shape('near', limbOutline(arm.concat([hand]), [0.08, 0.05, 0.035, 0.02]), 'skin', { tex: true });
      m.shape('nearDetail', [add(hand, [0, 0.01]), [hand[0] + 0.03, hand[1] - 0.03, 1], add(hand, [-0.01, -0.005])], 'claw');
      m.bone(arm[0], arm[1], 0.03); m.bone(arm[1], arm[2], 0.025); m.bone(arm[2], hand, 0.015);
    } else {
      const scale = 0.6 + c.wing * 1.15;
      const root = add(S, mul(dir(th + 90), 0.08 * bulk));
      const tailEnd = add(lerp2(H, S, 0.05), mul(dir(th + 90), 0.1 * bulk));
      wingAt(m, root, c, scale, true, add(tailEnd, [-0.02, 0.02]));
      wingAt(m, root, c, scale, false, tailEnd);
    }
    m.measure = 'x';
    skeletonForSpine(m, spine, c, { iH, iS, hipR, shR, ribs: true, noScapula: false });
  }

  function buildBird(m, c) {
    const bulk = 0.8 + c.bulk * 0.7;
    const T = 0.8;
    const reach = 0.55 + c.legs * 0.7;
    const neckLen = 0.25 + c.neck * 0.9;
    const headLen = 0.32 * (0.7 + c.headSize * 0.7);
    m.unit = headLen;
    const F = FEET.talon;
    const legH = (F.seg[1]) * reach * 0.95 + F.seg[2] * reach * Math.sin(76 * D2R);
    const H = [0, legH + 0.12 * bulk];
    const th = 32;
    const S = add(H, mul(dir(th), T));
    const N1 = add(S, mul(dir(88), neckLen * 0.5));
    const B = add(N1, mul(dir(40), neckLen * 0.5));
    const tailLen = 0.15 + c.tail * 0.3;
    const T1 = add(H, mul(dir(200), tailLen));
    const keys = [
      { p: T1, d: 0.04, v: 0.04 },
      { p: H, d: 0.17 * bulk, v: 0.22 * bulk },
      { p: lerp2(H, S, 0.5), d: 0.22 * bulk, v: 0.31 * bulk },
      { p: S, d: 0.19 * bulk, v: 0.26 * bulk },
      { p: N1, d: 0.09 + 0.03 * bulk, v: 0.1 + 0.04 * bulk },
      { p: B, d: headLen * 0.25, v: headLen * 0.27 },
    ];
    const spine = bodyFromSpine(m, keys, c, { widthK: 0.8 });
    m.marks = { H, S, B, iH: 10, iS: 30 };
    const hipR = add(H, [0.1, -0.16 * bulk]);
    // 鳥の脚：太ももは羽毛の中、すねから下が見える
    const legOf = (fx, off) => {
      const root = add(hipR, off);
      const s = F.seg.map((v) => v * reach);
      const ball = [fx, s[3] * 0.2];
      const ankle = add(ball, mul(dir(104), s[2]));
      const knee = add(root, [0.06, -0.02]);
      return { chain: [knee, ankle, ball, [fx + s[3], 0]], widths: [0.12 * bulk, 0.045, 0.035, 0.025] };
    };
    const farL = legOf(H[0] + 0.0, [0.03, 0.01]);
    legAt(m, farL.chain, farL.widths, 'far', 'far', 'talon');
    const nearL = legOf(H[0] + 0.12, [0, 0]);
    // 尾羽
    c.tailTip = 'fan';
    tailTipAt(m, spine, c);
    placeHead(m, c.head, B, -6, headLen, c);
    legAt(m, nearL.chain, nearL.widths, 'near', 'skin', 'talon', { skipFirstBone: false });
    // 胸の羽の模様
    if (c.wings === 'feather') {
      const scale = 0.85 + c.wing * 1.4;
      const root = add(S, add(mul(dir(th + 90), 0.18 * bulk), mul(dir(th), -0.1)));
      const tailEnd = add(H, mul(dir(th + 90), 0.18 * bulk));
      wingAt(m, root, c, scale, true, add(tailEnd, [-0.02, 0.02]));
      if (c.wingPose === 'fold') {
        // たたんだ翼：胴の上に重なる羽根の形
        const a = add(S, mul(dir(th + 90), 0.2 * bulk));
        const tip = add(H, mul(dir(205), tailLen * 0.9 + 0.2));
        m.shape('wingNear', [a, add(lerp2(a, tip, 0.4), mul(dir(th + 90), 0.06)), [tip[0], tip[1], 1], add(lerp2(a, tip, 0.5), mul(dir(th - 90), 0.2 * bulk)), add(S, mul(dir(th - 90), 0.05))], 'feather', { smooth: 0.8 });
        for (let i = 1; i < 5; i++) m.line('wingDetail', [lerp2(a, tip, i * 0.18), add(lerp2(a, tip, i * 0.18 + 0.1), mul(dir(th - 90), 0.16 * bulk))], 'ink', 0.6);
        m.wingSpan = (0.3 + 0.42 + 0.3 + 0.55) * scale * 2 * 0.9;
        m.wingArea = 0.3 * scale * scale * 2;
      } else wingAt(m, root, c, scale, false, tailEnd);
    }
    m.measure = 'x';
    skeletonForSpine(m, spine, c, { iH: 10, iS: 30, hipR, ribs: true, noScapula: true });
  }

  /** 巨人・鬼：正面から見た姿（人の比べる図と同じ向き） */
  function buildHumanoid(m, c) {
    const U = 0.25; // 人の頭ひとつ分
    const bk = c.bulk;
    const hu = U * (0.85 + c.headSize * 0.4);
    m.unit = hu;
    const crotch = (3.5 + c.legs * 1.0) * U;
    const hw = (0.7 + bk * 0.45) * U;
    const ww = (0.58 + bk * 0.75) * U;
    const sw = (0.95 + bk * 0.5) * U;
    const shY = crotch + 2.75 * U;
    const nw = 0.3 * U * (1 + bk * 0.5);
    const neckTop = shY + 0.38 * U;
    const mir = (pts) => pts.slice().reverse().map((p) => [-p[0], p[1], p[2]]);
    const symShape = (layer, right, fill, opt) => m.shape(layer, right.concat(mir(right)), fill, opt);
    // 翼（背中から左右へ）
    if (c.wings !== 'none') {
      const scale = (0.9 + c.wing * 1.4) * U * 3;
      const start = m.prims.length;
      const bstart = m.bones.length;
      const root = [-sw * 0.45, shY - 0.2 * U];
      wingAt(m, root, c, scale, false, [-hw * 0.6, crotch + 1.1 * U]);
      // 横から見た翼を回して、正面から見て外へ広がる向きに
      const R = (q) => { const d0 = sub(q, root); const a = 40 * D2R; return [root[0] + d0[0] * Math.cos(a) - d0[1] * Math.sin(a), root[1] + d0[0] * Math.sin(a) + d0[1] * Math.cos(a), q[2]]; };
      const made = m.prims.slice(start);
      made.forEach((p) => { p.layer = 'wingFar'; if (p.pts) p.pts = p.pts.map(R); if (p.c) p.c = R(p.c); });
      m.bones.slice(bstart).forEach((b) => { if (b.a) { b.a = R(b.a); b.b = R(b.b); } if (b.pts) b.pts = b.pts.map(R); });
      made.forEach((p) => m.prims.push(Object.assign({}, p, { pts: p.pts ? p.pts.map((q) => [-q[0], q[1], q[2]]) : p.pts, c: p.c ? [-p.c[0], p.c[1]] : p.c })));
      m.bones.slice(bstart).forEach((b) => m.bones.push(Object.assign({}, b, b.a ? { a: [-b.a[0], b.a[1]], b: [-b.b[0], b.b[1]] } : {}, b.pts ? { pts: b.pts.map((q) => [-q[0], q[1], q[2]]) } : {})));
      m.wingSpan = (m.wingSpan || 0) / 0.92 * 0.95 + sw;
    }
    // 脚
    const legs = [-1, 1].map((sx) => {
      const ch = [[sx * hw * 0.45, crotch + 0.45 * U], [sx * hw * 0.55, crotch], [sx * hw * 0.6, crotch * 0.5], [sx * hw * 0.64, crotch * 0.26], [sx * hw * 0.68, 0.16 * U]];
      const wd = [0.95, 0.9, 0.46, 0.52, 0.3].map((v, i) => v * U * (i < 2 ? 0.8 + bk * 0.45 : 0.85 + bk * 0.3));
      m.shape('far', limbOutline(ch, wd), 'skin', { tex: true });
      // 足
      const fx = sx * hw * 0.7;
      m.shape('farDetail', [[fx - 0.2 * U, 0.02 * U], [fx - 0.17 * U, 0.2 * U], [fx + 0.17 * U, 0.2 * U], [fx + 0.21 * U, 0.02 * U], [fx, -0.01 * U]], 'skin', { smooth: 0.8 });
      m.bone(ch[1], ch[2], 0.2 * U); m.bone(ch[2], ch[4], 0.16 * U);
      m.boneShape([[fx - 0.17 * U, 0.02 * U], [fx - 0.12 * U, 0.15 * U], [fx + 0.12 * U, 0.15 * U], [fx + 0.18 * U, 0.02 * U]]);
      m.limbVol += Math.PI * Math.pow(0.32 * U * (0.85 + bk * 0.3), 2) * crotch;
      return ch;
    });
    // 胴
    const torso = [[0, crotch - 0.08 * U], [hw * 0.98, crotch + 0.12 * U], [hw * 1.05, crotch + 0.6 * U], [ww, crotch + 1.25 * U], [sw * 0.86, crotch + 2.05 * U], [sw * 0.97, shY - 0.18 * U], [sw * 0.88, shY + 0.06 * U], [nw * 1.6, shY + 0.2 * U], [nw, shY + 0.3 * U], [nw * 0.95, neckTop]];
    symShape('body', torso, 'skin', { tex: true, body: true });
    m.line('bodyDetail', [[-sw * 0.62, shY - 0.55 * U], [-sw * 0.3, shY - 0.85 * U], [-0.03 * U, shY - 0.7 * U]], 'line', 0.8, { smooth: 1 });
    m.line('bodyDetail', [[sw * 0.62, shY - 0.55 * U], [sw * 0.3, shY - 0.85 * U], [0.03 * U, shY - 0.7 * U]], 'line', 0.8, { smooth: 1 });
    m.circle('bodyDetail', [0, crotch + 0.95 * U], 0.035 * U, 'line');
    if (bk > 0.55) m.line('bodyDetail', [[-ww * 0.8, crotch + 0.7 * U], [0, crotch + 0.5 * U], [ww * 0.8, crotch + 0.7 * U]], 'line', 0.7, { smooth: 1 });
    // 腰布（角があれば虎の毛皮）
    const oni = c.horns !== 'none';
    symShape('bodyDetail', [[0, crotch + 0.55 * U], [hw * 1.08, crotch + 0.58 * U], [hw * 1.06, crotch + 0.18 * U], [hw * 0.5, crotch + 0.05 * U], [hw * 0.42, crotch - 0.75 * U], [0, crotch - 0.8 * U]], oni ? 'tiger' : 'cloth', { smooth: 0.4 });
    if (oni) {
      for (let i = 0; i < 5; i++) {
        const x = -hw * 0.9 + i * hw * 0.45;
        m.line('bodyDetail', [[x, crotch + 0.52 * U], [x + 0.06 * U, crotch + 0.35 * U], [x - 0.02 * U, crotch + 0.22 * U]], 'claw', 2, { smooth: 1 });
      }
      for (let i = 0; i < 3; i++) m.line('bodyDetail', [[-hw * 0.3, crotch - (0.1 + i * 0.22) * U], [0, crotch - (0.02 + i * 0.22) * U], [hw * 0.3, crotch - (0.1 + i * 0.22) * U]], 'claw', 1.8, { smooth: 1 });
    }
    // 腕
    const armK = 1 + c.legs * 0.1 + (oni ? 0.08 : 0);
    [-1, 1].forEach((sx) => {
      const ch = [[sx * sw * 0.86, shY - 0.05 * U], [sx * sw * 0.92, shY - 0.2 * U], [sx * (sw + 0.16 * U), shY - 1.45 * U * armK], [sx * (sw + 0.3 * U), shY - 2.55 * U * armK]];
      const wd = [0.5, 0.66, 0.4, 0.3].map((v) => v * U * (0.8 + bk * 0.45));
      m.shape('near', limbOutline(ch, wd), 'skin', { tex: true });
      const hand = add(ch[3], [sx * 0.02 * U, -0.24 * U]);
      const hr = 0.25 * U * (0.85 + bk * 0.35);
      m.shape('nearDetail', [[hand[0] - hr, hand[1] + hr * 0.6], [hand[0] + hr, hand[1] + hr * 0.6], [hand[0] + hr * 1.05, hand[1] - hr * 0.5], [hand[0], hand[1] - hr * 1.1], [hand[0] - hr * 1.05, hand[1] - hr * 0.5]], 'skin', { smooth: 0.9 });
      m.line('nearDetail', [[hand[0] - hr * 0.6, hand[1] - hr * 0.2], [hand[0] + hr * 0.6, hand[1] - hr * 0.2]], 'line', 0.6);
      m.bone(ch[1], ch[2], 0.16 * U); m.bone(ch[2], ch[3], 0.11 * U); m.bone(add(ch[2], [sx * 0.08 * U, 0]), add(ch[3], [sx * 0.08 * U, 0]), 0.08 * U);
      m.boneShape([[hand[0] - hr * 0.7, hand[1] + hr * 0.5], [hand[0] + hr * 0.7, hand[1] + hr * 0.5], [hand[0] + hr * 0.6, hand[1] - hr * 0.8], [hand[0] - hr * 0.6, hand[1] - hr * 0.8]]);
      m.limbVol += Math.PI * Math.pow(0.22 * U * (0.8 + bk * 0.45), 2) * 2.6 * U * armK;
    });
    // 頭
    const cy = neckTop + hu * 0.4;
    const rx = hu * 0.39 * (1 + bk * 0.12); const ry = hu * 0.52;
    const head = [];
    for (let i = 0; i < 24; i++) {
      const t = i / 24 * Math.PI * 2;
      const jaw = Math.sin(t) < 0 ? 0.82 + 0.18 * (1 + Math.sin(t)) : 1;
      head.push([Math.cos(t) * rx * jaw, cy + Math.sin(t) * ry]);
    }
    [-1, 1].forEach((sx) => m.shape('head', [[sx * rx * 0.92, cy + ry * 0.15], [sx * rx * 1.22, cy + ry * 0.2], [sx * rx * 1.15, cy - ry * 0.2], [sx * rx * 0.9, cy - ry * 0.25]], 'skin', { smooth: 0.8 }));
    m.shape('head', head, 'skin', { tex: true });
    [-1, 1].forEach((sx) => {
      const e = [sx * rx * 0.38, cy + ry * 0.08];
      m.prims.push({ t: 'ellipse', layer: 'headDetail', c: e, rx: hu * 0.075, ry: hu * 0.05, rot: 0, fill: oni ? 'eye' : 'tooth' });
      m.circle('headDetail', e, hu * 0.032, 'pupil');
      m.line('headDetail', [[sx * rx * 0.62, cy + ry * (oni ? 0.3 : 0.24)], [sx * rx * 0.12, cy + ry * (oni ? 0.18 : 0.26)]], 'ink', 1.6);
    });
    m.line('headDetail', [[0, cy + ry * 0.05], [-hu * 0.05, cy - ry * 0.22], [hu * 0.06, cy - ry * 0.24]], 'line', 0.9, { smooth: 0.5 });
    m.line('headDetail', [[-rx * 0.35, cy - ry * 0.46], [0, cy - ry * (oni ? 0.5 : 0.48)], [rx * 0.35, cy - ry * 0.46]], 'ink', 1.1, { smooth: 1 });
    if (oni) [-1, 1].forEach((sx) => m.shape('headDetail', [[sx * rx * 0.3, cy - ry * 0.47], [sx * rx * 0.42, cy - ry * 0.45], [sx * rx * 0.38, cy - ry * 0.18, 1]], 'tooth', { smooth: 0 }));
    // 角
    const horn = (start, a0, a1, length, w0) => {
      const n = 6; const left = []; const right = []; let q = start;
      for (let i = 0; i <= n; i++) {
        const t = i / n; const a = lerp(a0, a1, t); const w = w0 * (1 - t * 0.9); const nr = perp(dir(a));
        left.push(add(q, mul(nr, w / 2))); right.push(add(q, mul(nr, -w / 2)));
        q = add(q, mul(dir(a), length / n));
      }
      left.pop(); right.pop();
      const pts = left.concat([[q[0], q[1], 1]], right.reverse());
      m.shape('headDetail', pts, 'horn'); m.boneShape(pts);
    };
    if (c.horns === 'unicorn') horn([0, cy + ry * 0.85], 90, 90, hu * 0.55, hu * 0.16);
    else if (c.horns === 'back' || c.horns === 'bull') [-1, 1].forEach((sx) => horn([sx * rx * 0.5, cy + ry * 0.75], sx > 0 ? (c.horns === 'bull' ? 20 : 70) : (c.horns === 'bull' ? 160 : 110), sx > 0 ? (c.horns === 'bull' ? 85 : 95) : (c.horns === 'bull' ? 95 : 85), hu * 0.55, hu * 0.14));
    else if (c.horns === 'ram') [-1, 1].forEach((sx) => horn([sx * rx * 0.75, cy + ry * 0.55], sx > 0 ? 40 : 140, sx > 0 ? -160 : 340, hu * 0.9, hu * 0.16));
    else if (c.horns === 'antler') [-1, 1].forEach((sx) => { horn([sx * rx * 0.5, cy + ry * 0.75], sx > 0 ? 70 : 110, sx > 0 ? 50 : 130, hu * 0.7, hu * 0.08); horn([sx * rx * 0.75, cy + ry * 1.1], sx > 0 ? 100 : 80, sx > 0 ? 95 : 85, hu * 0.3, hu * 0.06); });
    m.topY = cy + ry;
    // 骨（正面）：頭骨・背骨・肋骨・鎖骨・骨盤
    m.boneShape(head.map((p) => [p[0] * 0.9, cy + (p[1] - cy) * 0.94]), { holes: [{ c: [-rx * 0.36, cy + ry * 0.06], rx: hu * 0.1, ry: hu * 0.085, rot: 0 }, { c: [rx * 0.36, cy + ry * 0.06], rx: hu * 0.1, ry: hu * 0.085, rot: 0 }, { c: [0, cy - ry * 0.22], rx: hu * 0.04, ry: hu * 0.07, rot: 0 }] });
    for (let y = crotch + 0.4 * U; y < neckTop; y += 0.17 * U) m.bones.push({ t: 'vert', a: [-0.07 * U, y], b: [0.07 * U, y], w: 0.11 * U, n: [0, 1], spineH: 0, chevron: 0 });
    for (let i = 0; i < 8; i++) {
      const y = shY - 0.3 * U - i * 0.2 * U;
      const w = sw * (0.62 + Math.sin((i + 1) / 9 * Math.PI) * 0.22);
      [-1, 1].forEach((sx) => m.bones.push({ t: 'rib', pts: [[sx * 0.05 * U, y], [sx * w, y - 0.02 * U], [sx * w * 0.85, y - 0.3 * U]], w: 0.06 * U }));
    }
    m.bone([0, shY - 0.15 * U], [0, shY - 1.6 * U], 0.12 * U, { plain: true });
    [-1, 1].forEach((sx) => m.bone([sx * 0.06 * U, shY - 0.05 * U], [sx * sw * 0.86, shY - 0.1 * U], 0.08 * U, { plain: true }));
    symShape('far', [[0, crotch + 0.55 * U]], 'none');
    m.prims.pop();
    m.boneShape([[0, crotch + 0.2 * U], [hw * 0.5, crotch + 0.45 * U], [hw * 0.95, crotch + 0.75 * U], [hw * 0.85, crotch + 0.3 * U], [hw * 0.55, crotch - 0.05 * U], [0, crotch - 0.02 * U], [-hw * 0.55, crotch - 0.05 * U], [-hw * 0.85, crotch + 0.3 * U], [-hw * 0.95, crotch + 0.75 * U], [-hw * 0.5, crotch + 0.45 * U]], { holes: [{ c: [-hw * 0.4, crotch + 0.12 * U], rx: 0.1 * U, ry: 0.08 * U, rot: 0 }, { c: [hw * 0.4, crotch + 0.12 * U], rx: 0.1 * U, ry: 0.08 * U, rot: 0 }] });
    // 体積：胴（だ円柱）と頭
    const avgW = (hw + ww + sw) / 3;
    m.bodyVol = Math.PI * avgW * avgW * 0.45 * (shY - crotch) + 4 / 3 * Math.PI * rx * rx * ry;
    m.measure = 'h';
    m.spine = [];
    m.front = true;
    void legs;
  }

  function buildSerpent(m, c) {
    const bulk = 0.7 + c.bulk * 0.8;
    const Ls = 5 + c.tail * 7;
    const th = (c.fly ? 0.19 : 0.16) * bulk;
    const headLen = (c.head === 'eastern' ? 0.75 : 0.42) * (0.7 + c.headSize * 0.6);
    m.unit = headLen;
    const N = 18;
    const keys = [];
    if (c.fly) {
      const A = Ls * 0.075;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const x = t * Ls * 0.62 + Math.sin(t * Math.PI * 3.2) * Ls * 0.03;
        const y = A * Math.sin(t * Math.PI * 3.2 - 0.9) * (0.6 + t * 0.5) + A * 1.8 + t * A * 1.4;
        const thick = th * (t < 0.35 ? lerp(0.08, 1, Math.pow(t / 0.35, 0.7)) : t > 0.88 ? lerp(1, 0.82, (t - 0.88) / 0.12) : 1);
        keys.push({ p: [x, y], d: thick * 0.95, v: thick * 1.05 });
      }
    } else {
      // 後ろは地をはい、前は鎌首をもたげる
      const rise = Ls * (0.08 + c.neck * 0.12);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        let x = t * Ls * 0.7;
        const thick = th * (t < 0.3 ? lerp(0.07, 1, Math.pow(t / 0.3, 0.7)) : t > 0.85 ? lerp(1, 0.6, (t - 0.85) / 0.15) : 1);
        let y = thick + thick * 0.9 * Math.max(0, Math.sin(t * Math.PI * 5));
        if (t > 0.72) {
          const u = (t - 0.72) / 0.28;
          y += rise * Math.sin(u * Math.PI * 0.5) ** 1.4;
          x -= Ls * 0.08 * Math.sin(u * Math.PI);
        }
        keys.push({ p: [x, y], d: thick, v: thick });
      }
    }
    const last = keys[N - 1].p;
    const prev = keys[N - 2].p;
    keys[N - 1].d = headLen * 0.24; keys[N - 1].v = headLen * 0.25;
    const spine = bodyFromSpine(m, keys, c, { per: 8, widthK: 0.95 });
    bellyBand(m, spine, Math.round(spine.length * 0.06), spine.length - 2, c);
    const headA = c.fly ? ang(sub(last, prev)) - 20 : clamp(ang(sub(last, prev)) - 70, -25, 5);
    if (c.ridge !== 'none') ridgeAlong(m, spine, Math.round(spine.length * 0.08), spine.length - 3, c, { k: c.ridge === 'mane' ? 1 : 0.8 });
    tailTipAt(m, spine, c);
    placeHead(m, c.head, last, headA, headLen, c);
    if (c.legs4) {
      // 四本の短い脚（空をつかむように）
      const legAtFrac = (fr, far, front) => {
        const i = Math.round(spine.length * fr);
        const s = spine[i];
        const root = add(s.p, mul(s.n, -s.v * 0.4));
        const L = (0.8 + c.legs * 0.8) * bulk;
        const a1 = front ? -50 : -125;
        const kn = add(root, mul(dir(a1 + (far ? 18 : 0)), L * 0.45));
        const an = add(kn, mul(dir(front ? -120 : -55), L * 0.38));
        const toe = add(an, mul(dir(front ? -10 : -170), L * 0.2));
        const off = far ? [0.06, 0.04] : [0, 0];
        const chain = [root, kn, an, toe].map((p) => add(p, off));
        legAt(m, chain, [th * 1.5, th * 0.8, th * 0.55, th * 0.42], far ? 'far' : 'near', far ? 'far' : 'skin', 'claw', { fwd: front ? 1 : -1, air: true });
      };
      legAtFrac(0.4, true, false); legAtFrac(0.4, false, false);
      legAtFrac(0.78, true, true); legAtFrac(0.78, false, true);
    }
    m.measure = 'arc';
    m.arcHead = headLen;
    skeletonForSpine(m, spine, c, { iH: Math.round(spine.length * 0.3), iS: spine.length - 3, ribs: true, ribsAll: true, noScapula: true, noPelvis: true });
  }

  function buildFish(m, c) {
    const bulk = 0.7 + c.bulk * 0.8;
    const whale = c.head === 'whale';
    const Lf = 3.2;
    const hmax = (whale ? 0.42 : 0.36) * bulk;
    const y0 = hmax * 1.1;
    const prof = whale ? [[0, 0.07], [0.15, 0.13], [0.35, 0.5], [0.6, 0.92], [0.8, 1], [1, 0.92]] : [[0, 0.1], [0.12, 0.18], [0.35, 0.6], [0.6, 0.95], [0.8, 0.95], [1, 0.8]];
    const keys = prof.map(([t, k]) => ({ p: [t * Lf, y0 + Math.sin(t * Math.PI) * 0.04], d: hmax * k * 0.95, v: hmax * k * 1.05 }));
    const headLen = hmax * 0.8 / 0.33 * (whale ? 0.9 : 0.6) * (0.7 + c.headSize * 0.6);
    m.unit = headLen * 0.5;
    const spine = bodyFromSpine(m, keys, c, { per: 10, widthK: 0.85 });
    const last = keys[keys.length - 1];
    // 頭（体の先をなめらかに閉じる）
    const B = last.p;
    const hd = last.d; const hv = last.v;
    const nose = whale
      ? [[B[0] - 0.02, B[1] + hd], [B[0] + headLen * 0.55, B[1] + hd * 0.9], [B[0] + headLen * 0.95, B[1] + hd * 0.45], [B[0] + headLen, B[1] - hv * 0.1, 1], [B[0] + headLen * 0.9, B[1] - hv * 0.55], [B[0] + headLen * 0.4, B[1] - hv * 0.95], [B[0] - 0.02, B[1] - hv]]
      : [[B[0] - 0.02, B[1] + hd], [B[0] + headLen * 0.5, B[1] + hd * 0.7], [B[0] + headLen, B[1] + hd * 0.05, 1], [B[0] + headLen * 0.85, B[1] - hv * 0.35], [B[0] + headLen * 0.45, B[1] - hv * 0.8], [B[0] - 0.02, B[1] - hv]];
    m.shape('head', nose, 'skin', { tex: true });
    const eye = whale ? [B[0] + headLen * 0.25, B[1] - hv * 0.35] : [B[0] + headLen * 0.55, B[1] + hd * 0.25];
    m.circle('headDetail', eye, headLen * 0.035, 'eye');
    m.circle('headDetail', eye, headLen * 0.02, 'pupil');
    if (whale) {
      m.line('headDetail', [[B[0] + headLen * 0.97, B[1] - hv * 0.15], [B[0] + headLen * 0.6, B[1] - hv * 0.3], [B[0] + headLen * 0.2, B[1] - hv * 0.4]], 'ink', 1.1);
      for (let i = 0; i < 9; i++) {
        const x = B[0] + headLen * (0.85 - i * 0.12);
        m.line('headDetail', [[x, B[1] - hv * 0.5], [x - headLen * 0.2, B[1] - hv * 0.9]], 'bellyLine', 0.6);
      }
    } else {
      m.line('headDetail', [[B[0] + headLen * 0.9, B[1] - hv * 0.35], [B[0] + headLen * 0.55, B[1] - hv * 0.45]], 'ink', 1);
      for (let i = 0; i < 5; i++) {
        const x = B[0] + headLen * (0.1 - i * 0.07);
        m.line('headDetail', [[x, B[1] + hd * 0.3], [x - headLen * 0.04, B[1] - hv * 0.4]], 'ink', 0.8);
      }
    }
    // ひれ
    const s = (t) => spine[Math.round(t * (spine.length - 1))];
    const fin = (t, h, back, upward, layer) => {
      const sp = s(t);
      const base = add(sp.p, mul(sp.n, upward ? sp.d * 0.8 : -sp.v * 0.8));
      const nb = upward ? sp.n : mul(sp.n, -1);
      const tip = add(add(base, mul(nb, h)), [-back * h, 0]);
      return [add(base, [h * 0.6, 0]), [tip[0], tip[1], 1], add(base, [-h * 0.5, 0])];
    };
    if (c.ridge !== 'none' || !whale) m.shape('ridge', fin(0.45, hmax * (whale ? 0.25 : 0.8), 0.7, true), 'skin');
    else m.shape('ridge', fin(0.4, hmax * 0.15, 0.6, true), 'skin');
    const pec = whale ? (() => {
      const sp = s(0.8);
      const base = add(sp.p, mul(sp.n, -sp.v * 0.45));
      return [add(base, [0.12, 0]), add(base, [-0.25, -hmax * 0.8]), [base[0] - 0.4, base[1] - hmax * 1.05, 1], add(base, [-0.05, -hmax * 0.1])];
    })() : fin(0.72, hmax * 0.6, 0.9, false);
    m.shape('near', pec, 'skin', { tex: true });
    if (!whale) { m.shape('far', fin(0.3, hmax * 0.35, 0.6, false), 'far'); }
    // 尾びれ
    const t0 = spine[0];
    const tp = t0.p;
    if (c.tailTip === 'fluke' || whale) {
      m.shape('body', [add(tp, [0.15, 0.05]), add(tp, [-0.15, hmax * 0.35]), [tp[0] - 0.45, tp[1] + hmax * 0.45, 1], add(tp, [-0.28, 0.0]), [tp[0] - 0.45, tp[1] - hmax * 0.3, 1], add(tp, [-0.12, -hmax * 0.22]), add(tp, [0.15, -0.05])], 'skin', { smooth: 0.6 });
    } else {
      m.shape('body', [add(tp, [0.2, 0.06]), add(tp, [-0.2, hmax * 0.6]), [tp[0] - 0.5, tp[1] + hmax * 1.3, 1], add(tp, [-0.22, 0]), [tp[0] - 0.45, tp[1] - hmax * 1.05, 1], add(tp, [-0.15, -hmax * 0.45]), add(tp, [0.2, -0.06])], 'skin', { smooth: 0.6 });
    }
    // 骨：頭骨・背骨・肋骨・ひれの骨
    m.boneShape(nose.map((p) => [lerp(B[0], p[0], 0.92), lerp(B[1], p[1], 0.85), p[2]]), { holes: [{ c: eye, rx: headLen * 0.06, ry: headLen * 0.05, rot: 0 }] });
    m.measure = 'x';
    skeletonForSpine(m, spine, c, { iH: Math.round(spine.length * 0.35), iS: spine.length - 2, ribs: true, noScapula: true, noPelvis: true, fish: true });
    m.bones.push({ t: 'fin', pts: pec });
  }

  function buildInsect(m, c, spider) {
    const bulk = 0.7 + c.bulk * 0.8;
    const reach = 0.7 + c.legs * 0.9;
    m.unit = 0.25;
    const y0 = reach * 0.42;
    const parts = spider
      ? [{ c: [-0.55, y0 + 0.12], rx: 0.5 * bulk, ry: 0.4 * bulk }, { c: [0.15, y0], rx: 0.28, ry: 0.2 }]
      : [{ c: [-0.45, y0 + 0.02], rx: 0.5 * bulk, ry: 0.3 * bulk }, { c: [0.15, y0 + 0.04], rx: 0.18, ry: 0.17 }, { c: [0.42, y0 + 0.02], rx: 0.14, ry: 0.12 }];
    const nLegs = spider ? 4 : 3;
    const legRoot = (spider ? parts[1] : parts[1]).c;
    const mkLeg = (i, far) => {
      const spread = spider ? [-0.15, -0.05, 0.05, 0.14][i] : [-0.08, 0.0, 0.08][i];
      const root = add(legRoot, [spread, -0.06]);
      const dirx = spider ? [-1, -1, 1, 1][i] : [-1, 1, 1][i];
      const L = reach * (spider ? [1.0, 0.85, 0.9, 1.1][i] : [0.75, 0.65, 0.7][i]);
      const knee = add(root, [dirx * L * 0.32 * (far ? 0.8 : 1), L * (spider ? 0.32 : 0.2)]);
      const foot = [root[0] + dirx * L * (far ? 0.6 : 0.8), 0];
      const mid = lerp2(knee, foot, 0.45);
      const midp = add(mid, [dirx * L * 0.05, L * 0.05]);
      const off = far ? [0.04, 0.03] : [0, 0];
      const ch = [root, knee, midp, foot].map((p) => add(p, off));
      legAt(m, ch, [0.07, 0.05, 0.035, 0.02].map((w) => w * bulk), far ? 'far' : 'near', far ? 'far' : 'skin', 'none', { skipFirstBone: false });
    };
    for (let i = 0; i < nLegs; i++) mkLeg(i, true);
    parts.forEach((p, i) => {
      const pts = [];
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; pts.push([p.c[0] + Math.cos(a) * p.rx, p.c[1] + Math.sin(a) * p.ry]); }
      m.shape('body', pts, 'skin', { tex: true });
      m.bones.push({ t: 'shell', pts });
      m.extraVol += 4 / 3 * Math.PI * p.rx * p.ry * Math.min(p.rx, p.ry);
    });
    const abd = parts[0];
    if (!spider) {
      // 背の殻の合わせ目
      m.line('bodyDetail', [[abd.c[0] - abd.rx * 0.95, abd.c[1] + abd.ry * 0.1], [abd.c[0] + abd.rx * 0.9, abd.c[1] + abd.ry * 0.15]], 'ink', 1);
      const hd = parts[2];
      m.line('headDetail', [add(hd.c, [0.08, 0.08]), add(hd.c, [0.3, 0.32]), add(hd.c, [0.5, 0.36])], 'ink', 1.1);
      m.shape('headDetail', [add(hd.c, [0.1, -0.06]), add(hd.c, [0.26, -0.04]), [hd.c[0] + 0.3, hd.c[1] - 0.12, 1], add(hd.c, [0.12, -0.1])], 'claw');
      if (c.horns !== 'none') m.shape('headDetail', [add(hd.c, [0.0, 0.08]), add(hd.c, [0.25, 0.25]), [hd.c[0] + 0.42, hd.c[1] + 0.42, 1], add(hd.c, [0.32, 0.2]), add(hd.c, [0.1, 0.0])], 'horn', { smooth: 0.6 });
      m.circle('headDetail', add(hd.c, [0.06, 0.03]), 0.03, 'eye');
    } else {
      const ce = parts[1].c;
      for (let k = 0; k < 4; k++) m.circle('headDetail', add(ce, [0.16 + (k % 2) * 0.05, 0.08 + Math.floor(k / 2) * 0.04]), 0.018, 'pupil');
      m.shape('headDetail', [add(ce, [0.24, -0.06]), add(ce, [0.32, -0.12]), [ce[0] + 0.28, ce[1] - 0.22, 1], add(ce, [0.22, -0.12])], 'claw');
      // 背の模様
      m.shape('bodyDetail', [add(abd.c, [-0.3, 0.2]), add(abd.c, [0.1, 0.28]), add(abd.c, [0.0, 0.12]), add(abd.c, [-0.25, 0.08])], 'belly', { smooth: 1 });
    }
    for (let i = 0; i < nLegs; i++) mkLeg(i, false);
    m.measure = 'x';
    m.noSkeleton = true;
  }

  function buildBlob(m, c) {
    const bulk = 0.7 + c.bulk * 0.8;
    const w = 1; const hgt = 0.62 * bulk;
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = Math.PI * t;
      const x = -Math.cos(a) * w * 0.5 * (1 + 0.08 * Math.sin(a * 3));
      const y = Math.pow(Math.sin(a), 0.75) * hgt * (1 - 0.15 * (t - 0.5));
      pts.push([x, y]);
    }
    pts.push([w * 0.52, 0.02], [w * 0.3, -0.005], [-w * 0.3, -0.005], [-w * 0.52, 0.02]);
    m.unit = 0.3;
    m.shape('body', pts, 'jelly');
    m.shape('bodyDetail', [[-0.28, hgt * 0.62], [-0.12, hgt * 0.86], [0.02, hgt * 0.9], [-0.14, hgt * 0.72]], 'glint', { smooth: 1, noStroke: true });
    m.circle('headDetail', [0.12, hgt * 0.5], 0.05, 'pupil');
    m.circle('headDetail', [0.3, hgt * 0.48], 0.05, 'pupil');
    m.line('headDetail', [[0.15, hgt * 0.32], [0.22, hgt * 0.28], [0.29, hgt * 0.32]], 'pupil', 1.2);
    m.bones.push({ t: 'core', c: [0.0, hgt * 0.4], r: 0.12 * bulk });
    m.extraVol += 2 / 3 * Math.PI * 0.5 * 0.5 * hgt;
    m.measure = 'x';
    m.noSkeleton = true;
  }

  /** 背骨・肋骨・肩甲骨・骨盤 */
  function skeletonForSpine(m, spine, c, o) {
    const n = spine.length;
    const total = spine.reduce((acc, s, i) => acc + (i ? len(sub(s.p, spine[i - 1].p)) : 0), 0);
    // 椎骨：太さに合わせた大きさで並べる
    let acc = 0;
    let next = 0;
    for (let i = 1; i < n; i++) {
      acc += len(sub(spine[i].p, spine[i - 1].p));
      if (acc < next) continue;
      const s = spine[i];
      const thick = s.d + s.v;
      const size = clamp(thick * 0.22, total * 0.002, 0.08);
      next = acc + size * 1.35;
      const t = norm(sub(spine[Math.min(n - 1, i + 1)].p, spine[Math.max(0, i - 1)].p));
      const c0 = s.p;
      const a = add(c0, mul(t, -size * 0.55));
      const b = add(c0, mul(t, size * 0.55));
      m.bones.push({ t: 'vert', a, b, w: size * 0.75, n: s.n, spineH: (i > o.iH * 0.85 && i <= o.iS + 2) ? s.d * 0.65 : s.d * 0.4, chevron: i < o.iH && !o.fish ? s.v * 0.45 : 0, fish: o.fish });
    }
    // 肋骨
    if (o.ribs) {
      const from = o.ribsAll ? Math.round(n * 0.12) : o.iH;
      const to = o.ribsAll ? n - 4 : o.iS;
      const cnt = o.ribsAll ? Math.round((to - from) / 2) : Math.max(6, Math.round((to - from) / 3));
      for (let k = 0; k <= cnt; k++) {
        const i = Math.round(lerp(from + (to - from) * 0.12, to, k / cnt));
        const s = spine[Math.min(n - 1, Math.max(0, i))];
        const reach = s.v * (o.ribsAll ? 0.85 : o.fish ? 0.8 : lerp(0.55, 0.92, Math.sin(Math.PI * clamp(k / cnt, 0.1, 0.9))));
        const t = norm(sub(spine[Math.min(n - 1, i + 1)].p, s.p));
        const p0 = s.p;
        const p2 = add(add(p0, mul(s.n, -reach)), mul(t, -reach * (o.upright ? -0.3 : 0.35)));
        const p1 = add(lerp2(p0, p2, 0.5), mul(t, reach * 0.22));
        m.bones.push({ t: 'rib', pts: [p0, p1, p2], w: clamp(s.v * 0.05, 0.004, 0.03) });
      }
    }
    // 肩甲骨・骨盤
    if (o.shR && !o.noScapula) {
      const s = spine[Math.min(n - 1, o.iS)];
      const t = norm(sub(spine[Math.min(n - 1, o.iS + 1)].p, s.p));
      const top = add(add(s.p, mul(s.n, s.d * 0.5)), mul(t, -s.d * 0.9));
      const r = o.shR;
      m.boneShape([add(r, mul(t, 0.03)), add(top, mul(t, s.d * 0.45)), add(top, mul(t, -s.d * 0.45)), add(r, mul(t, -0.04))], { smooth: 0.6 });
    }
    if (o.hipR && !o.noPelvis) {
      const s = spine[Math.max(0, Math.min(n - 1, o.iH))];
      const t = norm(sub(spine[Math.min(n - 1, o.iH + 1)].p, s.p));
      const r = o.hipR;
      const il1 = add(add(s.p, mul(t, s.d * 1.2)), mul(s.n, s.d * 0.25));
      const il2 = add(add(s.p, mul(t, -s.d * 0.8)), mul(s.n, s.d * 0.3));
      m.boneShape([il1, il2, add(r, mul(t, -0.05)), add(add(r, mul(s.n, -s.v * 0.35)), mul(t, -s.v * 0.4)), add(r, mul(s.n, -0.02)), add(add(r, mul(s.n, -s.v * 0.3)), mul(t, s.v * 0.35)), add(r, mul(t, 0.05))], { smooth: 0.5, holes: [{ c: r, rx: 0.025, ry: 0.025, rot: 0 }] });
    }
  }

  /** 図の設定から、体の形（モデルの座標）を作る */
  function build(fig) {
    const c = resolve(fig);
    const m = new Model();
    m.c = c;
    if (c.plan === 'quad') buildQuad(m, c);
    else if (c.plan === 'biped') buildBiped(m, c);
    else if (c.plan === 'bird') buildBird(m, c);
    else if (c.plan === 'humanoid') buildHumanoid(m, c);
    else if (c.plan === 'serpent') buildSerpent(m, c);
    else if (c.plan === 'fish') buildFish(m, c);
    else if (c.plan === 'insect') buildInsect(m, c, false);
    else if (c.plan === 'spider') buildInsect(m, c, true);
    else buildBlob(m, c);
    // 範囲（翼は除いた体）と全体
    const bodyB = bounds(m.prims.filter((p) => !/^wing/.test(p.layer)));
    const allB = bounds(m.prims);
    m.bodyBox = bodyB;
    m.box = allB;
    // 全長の測り方
    let measured;
    if (m.measure === 'h') measured = m.topY || bodyB.y1;
    else if (m.measure === 'arc') {
      measured = m.spine.reduce((acc, s, i) => acc + (i ? len(sub(s.p, m.spine[i - 1].p)) : 0), 0) + (m.arcHead || 0);
    } else measured = bodyB.x1 - bodyB.x0;
    m.modelLength = measured;
    m.modelHeight = m.topY || bodyB.y1;
    m.volume = (m.bodyVol || 0) + m.limbVol + m.extraVol + (m.unit ? Math.PI / 6 * m.unit * m.unit * m.unit * 0.25 : 0);
    return m;
  }
  function bounds(prims) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    const P = (p, r) => { r = r || 0; x0 = Math.min(x0, p[0] - r); x1 = Math.max(x1, p[0] + r); y0 = Math.min(y0, p[1] - r); y1 = Math.max(y1, p[1] + r); };
    prims.forEach((p) => {
      if (p.t === 'path') p.pts.forEach((q) => P(q, p.width ? p.width / 2 : 0));
      else if (p.t === 'circle') P(p.c, p.r);
      else if (p.t === 'ellipse') P(p.c, Math.max(p.rx, p.ry));
    });
    if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1 };
    return { x0, y0, x1, y1 };
  }

  // ───── 大きさ ─────
  const LENGTH_UNITS = [
    [/^(km|ｋｍ|キロメートル|キロ)/i, 1000], [/^(cm|ｃｍ|センチメートル|センチ)/i, 0.01], [/^(mm|ｍｍ|ミリメートル|ミリ)/i, 0.001],
    [/^(m|ｍ|メートル|米)/i, 1], [/^(ft|フィート)/i, 0.3048], [/^(尺)/, 0.303], [/^(丈)/, 3.03], [/^(寸)/, 0.0303], [/^(間)/, 1.818], [/^(里)/, 3927],
  ];
  // 数がないとき、たとえで大きさを決める
  const LIKE = [
    [/旅客機|飛行機|ジェット機|航空機/, 40], [/戦闘機/, 18], [/鯨|クジラ|くじら/, 25], [/象|ゾウ|ぞう/, 6.5], [/キリン|きりん|麒麟/, 5],
    [/バス|電車|列車/, 12], [/トラック/, 10], [/馬|うま|ウマ/, 2.4], [/牛|うし|ウシ/, 2.5], [/熊|クマ|くま/, 2.5], [/虎|トラ/, 3], [/犬|イヌ/, 1], [/猫|ネコ|ねこ/, 0.7],
    [/人間|人|ひと/, 1.7], [/子ども|子供/, 1.2], [/家|小屋/, 10], [/城/, 60], [/塔/, 30], [/山/, 600], [/島/, 1500], [/船/, 30], [/鳩|ハト|カラス|烏/, 0.4], [/鷲|ワシ|鷹|タカ/, 0.9],
    [/手のひら|てのひら|掌/, 0.18], [/指/, 0.07], [/りんご|林檎|リンゴ/, 0.08], [/豆|米粒/, 0.008],
  ];
  function toHalf(s) { return String(s).replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)); }
  function parseNumber(s) {
    if (NS.WorldRules && NS.WorldRules.parseNum) return NS.WorldRules.parseNum(s);
    const t = toHalf(s).replace(/,/g, '');
    return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  }
  /** 「40m」「約四十メートル」「30〜40m」「旅客機ほど」「象の2倍」などを m に。worldUnits：この世界の長さの単位 */
  function parseSize(text, worldUnits) {
    if (!text) return null;
    const s = toHalf(String(text)).replace(/,/g, '').trim();
    if (!s) return null;
    const NUM = '([0-9]+(?:\\.[0-9]+)?|[〇零一二三四五六七八九十百千万億]+)';
    const units = (worldUnits || []).filter((u) => u && u.kind === 'length' && u.name && u.amount > 0).sort((a, b) => b.name.length - a.name.length);
    const unitOf = (rest) => {
      for (const u of units) if (rest.startsWith(u.name)) return u.amount;
      for (const [re, k] of LENGTH_UNITS) if (re.test(rest)) return k;
      return null;
    };
    const re = new RegExp(NUM + '(?:\\s*[〜~～\\-ー－]\\s*' + NUM + ')?\\s*', 'g');
    let m;
    while ((m = re.exec(s))) {
      const a = parseNumber(m[1]);
      const b = m[2] ? parseNumber(m[2]) : NaN;
      const rest = s.slice(m.index + m[0].length);
      const k = unitOf(rest);
      if (k != null && Number.isFinite(a)) {
        const v = Number.isFinite(b) ? (a + b) / 2 : a;
        if (v > 0) return v * k;
      }
    }
    for (const [re2, v] of LIKE) {
      if (re2.test(s)) {
        let k = 1;
        const tm = s.match(/([0-9]+(?:\.[0-9]+)?|[一二三四五六七八九十]+)\s*(?:倍|台分|頭分|匹分|人分|機分|個分|隻分|つ分|本分|軒分|艘分)/);
        if (tm) { const n = parseNumber(tm[1]); if (Number.isFinite(n) && n > 0) k = n; }
        if (/半分/.test(s)) k = 0.5;
        return v * k;
      }
    }
    return null;
  }
  function parseWeight(text) {
    if (!text) return null;
    const s = toHalf(String(text)).replace(/,/g, '');
    const m = s.match(/([0-9]+(?:\.[0-9]+)?|[〇一二三四五六七八九十百千万億]+)\s*(t|トン|kg|キロ|g|グラム)/i);
    if (!m) return null;
    const v = parseNumber(m[1]);
    if (!Number.isFinite(v)) return null;
    const u = m[2].toLowerCase();
    return v * (u === 't' || u === 'トン' ? 1000 : u === 'g' || u === 'グラム' ? 0.001 : 1);
  }
  function fmtLen(m) {
    if (!(m > 0)) return '';
    if (m >= 1000) return (Math.round(m / 100) / 10) + 'km';
    if (m >= 10) return Math.round(m) + 'm';
    if (m >= 1) return (Math.round(m * 10) / 10) + 'm';
    if (m >= 0.01) return Math.round(m * 100) + 'cm';
    return (Math.round(m * 10000) / 10) + 'mm';
  }
  function fmtWeight(kg) {
    if (!(kg > 0)) return '';
    const nice = (v) => (v >= 100 ? Math.round(v / 10) * 10 : v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
    if (kg >= 1000) return nice(kg / 1000).toLocaleString('ja-JP') + 't';
    if (kg >= 1) return nice(kg) + 'kg';
    return nice(kg * 1000) + 'g';
  }

  /** 設定の項目から、図の大きさ（m）と各寸法を決める */
  function measure(fig, fields, worldUnits) {
    const m = build(fig);
    fields = fields || {};
    const L = parseSize(fields.length, worldUnits);
    const Hh = parseSize(fields.height, worldUnits);
    const W = parseSize(fields.wingspan, worldUnits);
    let k;
    let basis;
    if (L) { k = L / m.modelLength; basis = 'length'; } else if (Hh) { k = Hh / m.modelHeight; basis = 'height'; } else if (W && m.wingSpan) { k = W / m.wingSpan; basis = 'wingspan'; } else { k = PRESETS[m.c.preset].size / m.modelLength; basis = 'default'; }
    const density = m.c.plan === 'bird' ? 220 : m.c.wings !== 'none' ? 800 : m.c.plan === 'blob' ? 1050 : 1000;
    const weight = m.volume * k * k * k * density;
    return {
      model: m, k, basis,
      length: m.modelLength * k, height: m.modelHeight * k,
      wingspan: m.wingSpan ? m.wingSpan * k : 0, wingArea: m.wingArea ? m.wingArea * k * k : 0,
      weight, weightSet: parseWeight(fields.weight),
      lengthLabel: m.measure === 'h' ? '身長' : '全長',
    };
  }
  /** 飛べるかの目安（翼の面積あたりの重さ） */
  function flightNote(ms) {
    if (!ms.wingArea) return '';
    const w = ms.weightSet || ms.weight;
    const load = w / ms.wingArea; // kg/m²
    if (load <= 12) return '翼の大きさに対して軽く、現実の生き物でも飛べそうです';
    if (load <= 25) return '大きな鳥や翼竜くらいの重さで、羽ばたくより滑空が得意そうです';
    return '現実の生き物なら飛ぶのは難しい重さです（魔力・浮く力などの理由があると説得力が増します）';
  }

  // ───── 比べるもの（m 単位、左下が原点） ─────
  const COMPARE = {
    apple: { label: 'りんご', size: 0.08, w: 0.08, h: 0.085 },
    cat: { label: '猫', size: 0.7, w: 0.7, h: 0.3 },
    human: { label: '人', size: 1.7, w: 0.5, h: 1.7 },
    horse: { label: '馬', size: 2.4, w: 2.4, h: 2.3 },
    elephant: { label: '象', size: 6.5, w: 6.5, h: 3.4 },
    bus: { label: 'バス', size: 12, w: 12, h: 3.2 },
    whale: { label: 'シロナガスクジラ', size: 25, w: 25, h: 4.5 },
    tower: { label: '城の塔', size: 30, w: 9, h: 30 },
    airliner: { label: '旅客機', size: 40, w: 40, h: 12.5 },
    castle: { label: '城', size: 100, w: 100, h: 55 },
  };
  const COMPARE_LIST = [['auto', '自動で選ぶ'], ['none', 'なし'], ['apple', 'りんご'], ['cat', '猫'], ['horse', '馬'], ['elephant', '象'], ['bus', 'バス'], ['whale', '鯨'], ['tower', '城の塔'], ['airliner', '旅客機'], ['castle', '城']];
  function autoCompare(size) {
    let best = null;
    Object.keys(COMPARE).forEach((k) => {
      if (k === 'human') return;
      const d = Math.abs(Math.log(COMPARE[k].size / size));
      if (!best || d < best.d) best = { k, d };
    });
    // 人とほぼ同じ大きさなら、人だけで十分
    if (Math.abs(Math.log(size / 1.7)) < 0.45) return null;
    return best ? best.k : null;
  }
  function comparePrims(id) {
    const out = [];
    const S = (pts, smooth) => out.push({ t: 'path', pts, closed: true, smooth: smooth == null ? 1 : smooth });
    const R = (x, y, w, h0) => S([[x, y, 1], [x + w, y, 1], [x + w, y + h0, 1], [x, y + h0, 1]], 0);
    const C = (c, r) => out.push({ t: 'circle', c, r });
    if (id === 'human') {
      C([0.25, 1.58], 0.11);
      S([[0.07, 1.44], [0.43, 1.44], [0.47, 1.36, 1], [0.48, 0.86], [0.42, 0.86], [0.4, 1.2], [0.37, 0.9], [0.36, 0.0, 1], [0.27, 0.0, 1], [0.25, 0.8], [0.23, 0.0, 1], [0.14, 0.0, 1], [0.13, 0.9], [0.1, 1.2], [0.08, 0.86], [0.02, 0.86], [0.03, 1.36, 1]], 0.4);
    } else if (id === 'horse') {
      S([[0.0, 1.0], [0.25, 1.45], [0.6, 1.55], [1.4, 1.5], [1.7, 1.65], [1.95, 2.25], [2.15, 2.3], [2.4, 1.95], [2.3, 1.85], [2.05, 1.95], [1.85, 1.35], [1.8, 1.0], [1.85, 0, 1], [1.72, 0, 1], [1.62, 0.9], [0.62, 0.9], [0.5, 0, 1], [0.38, 0, 1], [0.38, 0.95], [0.18, 1.1]], 0.7);
    } else if (id === 'elephant') {
      S([[0.0, 1.2], [0.2, 2.4], [0.9, 3.0], [2.6, 3.25], [3.8, 3.4], [4.6, 3.1], [5.2, 2.6], [5.7, 2.0], [6.1, 1.0], [6.5, 0.6], [6.4, 0.5], [5.9, 0.9], [5.4, 1.5], [5.0, 1.6], [4.9, 0, 1], [4.2, 0, 1], [4.2, 1.2], [1.6, 1.2], [1.5, 0, 1], [0.8, 0, 1], [0.7, 1.3], [0.3, 1.5]], 0.7);
    } else if (id === 'bus') {
      S([[0, 0.35, 1], [12, 0.35, 1], [12, 3.0], [11.8, 3.2, 1], [0.2, 3.2, 1], [0, 3.0]], 0);
      C([2.3, 0.5], 0.5); C([9.6, 0.5], 0.5);
      out.push({ t: 'path', pts: [[0.6, 1.6, 1], [11.4, 1.6, 1], [11.4, 2.7, 1], [0.6, 2.7, 1]], closed: true, smooth: 0, hole: true });
    } else if (id === 'whale') {
      S([[0, 1.9], [0.6, 2.7], [0.0, 3.4, 1], [1.4, 2.3], [3.5, 2.6], [9, 3.6], [16, 4.3], [21, 4.4], [24, 3.8], [25, 2.4], [24.2, 1.2], [20, 0.4], [14, 0.0], [8, 0.4], [3.5, 1.5], [1.4, 1.9], [0.0, 0.6, 1], [0.6, 1.6]], 0.8);
    } else if (id === 'tower') {
      S([[0.5, 0, 1], [8.5, 0, 1], [8.0, 25, 1], [9.0, 25, 1], [9.0, 27.5, 1], [7.6, 27.5, 1], [7.6, 26.5, 1], [6.3, 26.5, 1], [6.3, 27.5, 1], [5.2, 27.5, 1], [5.2, 26.5, 1], [3.8, 26.5, 1], [3.8, 27.5, 1], [2.7, 27.5, 1], [2.7, 26.5, 1], [1.4, 26.5, 1], [1.4, 27.5, 1], [0.0, 27.5, 1], [0.0, 25, 1], [1.0, 25, 1]], 0);
      S([[1.5, 27.5, 1], [7.5, 27.5, 1], [4.5, 30, 1]], 0);
    } else if (id === 'airliner') {
      // 胴体・垂直尾翼・主翼・エンジン・脚
      S([[0, 3.6], [1.2, 4.6], [4, 5.4], [30, 5.5], [34.5, 6.1], [37.5, 12.5, 1], [39.5, 12.5, 1], [39.0, 6.4], [39.6, 5.6], [38.5, 4.6], [33, 3.0], [6, 2.0], [2.5, 2.1], [0.6, 2.7]], 0.5);
      S([[14, 3.0, 1], [22, 2.7, 1], [24.5, 2.4, 1], [15, 2.2, 1]], 0);
      S([[12.8, 2.6, 1], [16.6, 2.6, 1], [16.6, 1.3, 1], [12.8, 1.3, 1]], 0.3);
      R(4.6, 0, 0.35, 2.2); R(18, 0, 0.5, 2.3); C([4.8, 0.35], 0.35); C([18.25, 0.45], 0.45);
    } else if (id === 'castle') {
      R(0, 0, 100, 25);
      [[0, 12, 42], [30, 14, 50], [60, 12, 46], [88, 12, 42]].forEach(([x, w, hgt]) => { R(x, 0, w, hgt); S([[x - 1, hgt, 1], [x + w + 1, hgt, 1], [x + w / 2, hgt + w * 0.9, 1]], 0); });
      R(44, 0, 14, 32);
    } else if (id === 'cat') {
      S([[0.0, 0.2], [0.05, 0.26], [0.2, 0.28], [0.45, 0.27], [0.52, 0.3], [0.54, 0.37, 1], [0.58, 0.31], [0.63, 0.37, 1], [0.66, 0.29], [0.7, 0.22], [0.64, 0.18], [0.56, 0.15], [0.55, 0, 1], [0.5, 0, 1], [0.47, 0.14], [0.2, 0.14], [0.17, 0, 1], [0.12, 0, 1], [0.1, 0.17], [0.02, 0.24]], 0.7);
    } else if (id === 'apple') {
      S([[0.04, 0.0], [0.075, 0.015], [0.08, 0.05], [0.06, 0.075], [0.04, 0.07], [0.02, 0.075], [0.0, 0.05], [0.005, 0.015]], 1);
      S([[0.038, 0.07, 1], [0.042, 0.07, 1], [0.046, 0.085, 1], [0.042, 0.086, 1]], 0);
    }
    return out;
  }

  // ───── SVG に描く ─────
  function palette(c, view) {
    const base = c.color;
    const dark = mix(base, '#000000', 0.42);
    const pal = {
      skin: base, skinLight: mix(base, '#ffffff', 0.28), skinDark: mix(base, '#000000', 0.3),
      far: mix(base, '#000000', 0.38), farLine: mix(base, '#000000', 0.6),
      belly: c.belly, bellyLine: mix(c.belly, '#000000', 0.35),
      membrane: mix(base, c.belly, 0.25), membraneFar: mix(mix(base, c.belly, 0.25), '#000000', 0.35),
      feather: mix(base, '#ffffff', 0.08), featherDark: mix(base, '#000000', 0.15),
      horn: '#e8dcc0', hornFar: '#a89b80', claw: '#2a2420', tooth: '#f5efe0', hoof: '#2d2724',
      eye: c.plan === 'quad' && c.head !== 'reptile' ? '#3a2a1a' : '#e3b23c', pupil: '#120d0a', glint: '#ffffff', tongue: '#a8323a',
      mane: mix(base, '#000000', 0.35), maneLight: mix(base, '#000000', 0.18), beak: '#d9b24c', cloth: '#6b5640', tiger: '#d9a53a', jelly: base,
      ink: mix(base, '#000000', 0.62), line: dark,
    };
    if (c.head === 'eastern') { pal.mane = mix(c.belly, '#000000', 0.15); pal.horn = '#efe3c2'; }
    if (c.preset === 'lion') { pal.mane = mix(base, '#3a2010', 0.6); pal.maneLight = mix(base, '#3a2010', 0.35); }
    if (c.preset === 'pegasus') { pal.mane = '#d8cfbd'; pal.hoof = '#7a6a58'; pal.horn = '#f0d890'; pal.eye = '#2a2a3a'; }
    return pal;
  }

  const FONT = "'Hiragino Mincho ProN','Yu Mincho','YuMincho','Noto Serif JP','IPAexMincho','IPAMincho',serif";
  const SANS = "'Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP','IPAexGothic',sans-serif";

  let renderCount = 0;
  /** 寸法の目盛りに使う切りのよい長さ */
  function niceStep(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const r = v / p;
    return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
  }

  /**
   * 図を SVG の文字列で返す。
   * entry：{ name, fields, figure }。opts：{ width, height, view, compare, units（この世界の長さの単位）, title（false で名前を出さない）, dims（false で寸法なし） }
   */
  function render(entry, opts) {
    opts = opts || {};
    entry = entry || {};
    const fig = figureOf(entry);
    const W = Math.round(opts.width || 900);
    const Hh = Math.round(opts.height || 560);
    const view = ['figure', 'skeleton', 'xray'].includes(opts.view || fig.view) ? (opts.view || fig.view) : 'figure';
    const ms = measure(fig, entry.fields || {}, opts.units);
    const m = ms.model;
    const c = m.c;
    const k = ms.k; // モデル → m
    const pal = palette(c, view);
    const dark = view !== 'figure';
    // 比べるもの
    const size = Math.max(ms.length, ms.height);
    const compareId = (opts.compare || fig.compare || 'auto');
    const cmp = compareId === 'none' ? null : compareId === 'auto' ? autoCompare(size) : (COMPARE[compareId] ? compareId : null);
    const showHuman = compareId !== 'none' && size > 0.25 && size < 2000 && cmp !== 'human';
    const bodyB = m.box;
    const cw = (bodyB.x1 - bodyB.x0) * k;
    const ch = Math.max(bodyB.y1 * k, 0.01);
    const items = [];
    const gap = Math.max(cw, cmp ? COMPARE[cmp].w : 0) * 0.08 + 0.02;
    let x = 0;
    if (cmp) { items.push({ id: cmp, x, w: COMPARE[cmp].w, h: COMPARE[cmp].h }); x += COMPARE[cmp].w + gap; }
    const creatureX = x - bodyB.x0 * k;
    x += cw;
    if (showHuman) { x += gap * 0.6; items.push({ id: 'human', x, w: 0.5, h: 1.7 }); x += 0.5; }
    const sceneW = x;
    const sceneH = Math.max(ch, ...items.map((it) => it.h));
    // 余白：上に題名、下に寸法と目盛り
    const titleOn = opts.title !== false && !!(entry.name || '').trim();
    const dimsOn = opts.dims !== false;
    const padL = W * 0.05; const padR = W * 0.04 + (dimsOn ? 78 : 0);
    const padT = (titleOn ? 64 : 22) + 6;
    const padB = dimsOn ? 82 : 30;
    const sc = Math.min((W - padL - padR) / sceneW, (Hh - padT - padB) / sceneH);
    const ox = padL + ((W - padL - padR) - sceneW * sc) / 2;
    const groundY = Hh - padB;
    const X = (mx) => ox + mx * sc;
    const Y = (my) => groundY - my * sc;
    const cx = (p) => [X(creatureX + p[0] * k), Y(p[1] * k), p[2]];
    const lw = clamp(Math.min(W, Hh) / 480, 0.7, 2.2);
    const out = [];
    const uid = 'cr' + (++renderCount);
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="${esc((entry.name || '生物') + 'の図')}">`);
    // 下地
    const bg = dark ? '#1c2228' : '#f3ecdc';
    const bg2 = dark ? '#0f1418' : '#e4d9c2';
    out.push('<defs>');
    out.push(`<radialGradient id="${uid}bg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg2}"/></radialGradient>`);
    const topY = Y(m.bodyBox.y1 * k);
    out.push(`<linearGradient id="${uid}skin" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(topY)}" x2="0" y2="${f1(groundY)}"><stop offset="0" stop-color="${pal.skinLight}"/><stop offset="0.55" stop-color="${pal.skin}"/><stop offset="1" stop-color="${pal.skinDark}"/></linearGradient>`);
    const ps = clamp(sc * k * m.unit * 0.09, 3, 9);
    const texs = {
      scale: `<pattern id="${uid}tex" width="${f1(ps * 1.6)}" height="${f1(ps)}" patternUnits="userSpaceOnUse"><path d="M0 ${f1(ps)}Q${f1(ps * 0.8)} 0 ${f1(ps * 1.6)} ${f1(ps)}M${f1(-ps * 0.8)} ${f1(ps * 0.5)}Q0 ${f1(-ps * 0.5)} ${f1(ps * 0.8)} ${f1(ps * 0.5)}Q${f1(ps * 1.6)} ${f1(-ps * 0.5)} ${f1(ps * 2.4)} ${f1(ps * 0.5)}" fill="none" stroke="#000" stroke-opacity=".2" stroke-width=".7"/></pattern>`,
      fur: `<pattern id="${uid}tex" width="${f1(ps * 1.4)}" height="${f1(ps * 1.2)}" patternUnits="userSpaceOnUse"><path d="M${f1(ps * 0.2)} ${f1(ps * 0.9)}l${f1(ps * 0.35)} ${f1(-ps * 0.5)}M${f1(ps * 0.9)} ${f1(ps * 0.5)}l${f1(ps * 0.3)} ${f1(-ps * 0.4)}" stroke="#000" stroke-opacity=".16" stroke-width=".7" stroke-linecap="round"/></pattern>`,
      feather: `<pattern id="${uid}tex" width="${f1(ps * 2)}" height="${f1(ps * 1.4)}" patternUnits="userSpaceOnUse"><path d="M0 ${f1(ps * 0.7)}a${f1(ps)} ${f1(ps * 0.7)} 0 0 0 ${f1(ps * 2)} 0M${f1(-ps)} ${f1(ps * 1.4)}a${f1(ps)} ${f1(ps * 0.7)} 0 0 0 ${f1(ps * 2)} 0a${f1(ps)} ${f1(ps * 0.7)} 0 0 0 ${f1(ps * 2)} 0" fill="none" stroke="#000" stroke-opacity=".16" stroke-width=".7"/></pattern>`,
      shell: `<pattern id="${uid}tex" width="${f1(ps * 3)}" height="${f1(ps * 3)}" patternUnits="userSpaceOnUse"><circle cx="${f1(ps)}" cy="${f1(ps)}" r=".8" fill="#fff" fill-opacity=".18"/></pattern>`,
    };
    if (texs[c.skin]) out.push(texs[c.skin]);
    out.push(`<radialGradient id="${uid}jelly" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="${mix(c.color, '#ffffff', 0.55)}" stop-opacity=".95"/><stop offset="1" stop-color="${c.color}" stop-opacity=".85"/></radialGradient>`);
    out.push('</defs>');
    out.push(`<rect width="${W}" height="${Hh}" fill="url(#${uid}bg)"/>`);
    // 方眼（1・2・5 の刻み）
    const step = niceStep(Math.max(sceneH / 4, sceneW / 10));
    const gridC = dark ? 'rgba(160,190,210,.10)' : 'rgba(90,70,40,.09)';
    for (let gy = step; gy <= sceneH * 1.25 + 1e-9 && Y(gy) > padT - 10; gy += step) out.push(`<line x1="${f1(padL * 0.5)}" x2="${f1(W - padL * 0.5)}" y1="${f1(Y(gy))}" y2="${f1(Y(gy))}" stroke="${gridC}" stroke-width="1"/>`);
    for (let gx = 0; X(gx) < W; gx += step) out.push(`<line x1="${f1(X(gx))}" x2="${f1(X(gx))}" y1="${f1(padT - 10)}" y2="${f1(groundY)}" stroke="${gridC}" stroke-width="1"/>`);
    // 地面
    const groundC = dark ? '#5d6a72' : '#8a7656';
    out.push(`<line x1="${f1(padL * 0.4)}" x2="${f1(W - padL * 0.4)}" y1="${f1(groundY)}" y2="${f1(groundY)}" stroke="${groundC}" stroke-width="${f1(lw * 1.2)}"/>`);
    // 比べるもの
    const cmpFill = dark ? 'rgba(170,190,205,.28)' : 'rgba(80,80,90,.32)';
    const cmpSolid = dark ? '#3a4650' : '#bfb6a6'; // 重なっても濃くならない、不透明な色
    items.forEach((it) => {
      const prims = comparePrims(it.id);
      const tf = (p) => [X(it.x + p[0]), Y(p[1]), p[2]];
      // 重なる形は1つにまとめて塗る（重なりで穴があかないように）。窓などの穴は下地の色で
      let d = '';
      prims.forEach((p) => { if (p.t !== 'circle' && !p.hole) d += pathD(p.pts.map(tf), true, p.smooth); });
      const holes = prims.filter((p) => p.hole).map((p) => `<path d="${pathD(p.pts.map(tf), true, p.smooth)}" fill="${bg}" fill-opacity=".55"/>`).join('');
      const circles = prims.filter((p) => p.t === 'circle').map((p) => `<circle cx="${f1(X(it.x + p.c[0]))}" cy="${f1(Y(p.c[1]))}" r="${f1(Math.max(0.6, p.r * sc))}"/>`).join('');
      const tiny = it.h * sc < 3;
      out.push(`<g fill="${cmpFill}">${tiny ? `<rect x="${f1(X(it.x))}" y="${f1(Y(it.h) - 2)}" width="${f1(Math.max(1.5, it.w * sc))}" height="${f1(Math.max(2, it.h * sc))}"/>` : `<g opacity="1"><path d="${d}" fill="${cmpSolid}"/>${circles.replace(/<circle /g, `<circle fill="${cmpSolid}" `)}</g>${holes}`}</g>`);
      const C2 = COMPARE[it.id];
      const lab = `${C2.label}（${fmtLen(it.id === 'tower' || it.id === 'human' ? C2.h : C2.w)}）`;
      const lx = X(it.x + it.w / 2);
      out.push(`<text x="${f1(lx)}" y="${f1(groundY + 16)}" font-family="${SANS}" font-size="11.5" fill="${dark ? '#9fb2bf' : '#6d5d45'}" text-anchor="middle">${esc(lab)}</text>`);
    });
    // 影
    const shY = groundY;
    const fx0 = X(creatureX + m.bodyBox.x0 * k); const fx1 = X(creatureX + m.bodyBox.x1 * k);
    const lowest = m.bodyBox.y0 * k * sc;
    out.push(`<ellipse cx="${f1((fx0 + fx1) / 2)}" cy="${f1(shY)}" rx="${f1((fx1 - fx0) * 0.46)}" ry="${f1(Math.max(2, (fx1 - fx0) * 0.03))}" fill="#000" fill-opacity="${lowest > 20 ? 0.06 : 0.14}"/>`);
    // 生き物
    out.push(drawCreature(m, cx, pal, view, lw, k * sc, uid));
    // 寸法
    if (dimsOn) {
      const dimC = dark ? '#c9d6de' : '#4a3c2a';
      const arrow = (x1, y1, x2, y2) => {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const hd = (px, py, aa) => `M${f1(px + Math.cos(aa + 0.4) * 7)} ${f1(py + Math.sin(aa + 0.4) * 7)}L${f1(px)} ${f1(py)}L${f1(px + Math.cos(aa - 0.4) * 7)} ${f1(py + Math.sin(aa - 0.4) * 7)}`;
        return `<path d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}${hd(x1, y1, a)}${hd(x2, y2, a + Math.PI)}" stroke="${dimC}" stroke-width="1" fill="none"/>`;
      };
      if (m.measure !== 'h') {
        const yy = groundY + 34;
        out.push(`<path d="M${f1(fx0)} ${f1(groundY + 4)}V${f1(yy + 5)}M${f1(fx1)} ${f1(groundY + 4)}V${f1(yy + 5)}" stroke="${dimC}" stroke-width=".7" stroke-dasharray="2 2"/>`);
        out.push(arrow(fx0, yy, fx1, yy));
        const lab = `${ms.lengthLabel} ${fmtLen(ms.length)}${m.measure === 'arc' ? '（体に沿って）' : ''}`;
        out.push(`<rect x="${f1((fx0 + fx1) / 2 - lab.length * 6.2)}" y="${f1(yy - 9)}" width="${f1(lab.length * 12.4)}" height="18" fill="${bg}" opacity=".92"/>`);
        out.push(`<text x="${f1((fx0 + fx1) / 2)}" y="${f1(yy + 4.5)}" font-family="${SANS}" font-size="12.5" font-weight="600" fill="${dimC}" text-anchor="middle">${esc(lab)}</text>`);
      }
      const ty = Y(m.bodyBox.y1 * k);
      const vx = Math.min(W - 74, fx1 + 18);
      out.push(`<path d="M${f1(fx1 - 6)} ${f1(ty)}H${f1(vx + 5)}" stroke="${dimC}" stroke-width=".7" stroke-dasharray="2 2"/>`);
      out.push(arrow(vx, ty, vx, groundY));
      const hl = `${m.measure === 'h' ? '身長' : '高さ'} ${fmtLen(ms.height)}`;
      out.push(`<text x="${f1(vx + 6)}" y="${f1((ty + groundY) / 2 + 4)}" font-family="${SANS}" font-size="12" fill="${dimC}">${esc(hl)}</text>`);
      // 目盛り
      const bar = niceStep(sceneW / 5);
      const bx = padL; const by = Hh - 20;
      const bw = bar * sc;
      out.push(`<g stroke="${dimC}" stroke-width="1"><path d="M${f1(bx)} ${f1(by - 4)}V${f1(by)}H${f1(bx + bw)}V${f1(by - 4)}M${f1(bx + bw / 2)} ${f1(by - 3)}V${f1(by)}" fill="none"/></g>`);
      out.push(`<text x="${f1(bx + bw + 6)}" y="${f1(by + 1)}" font-family="${SANS}" font-size="11" fill="${dimC}">${esc(fmtLen(bar))}</text>`);
    }
    // 題名と説明
    if (titleOn) {
      const tc = dark ? '#e8eef2' : '#3a2e20';
      out.push(`<text x="${f1(padL)}" y="34" font-family="${FONT}" font-size="22" font-weight="700" fill="${tc}">${esc(entry.name)}</text>`);
      const kind = (entry.fields && entry.fields.kind) || PRESETS[c.preset].label;
      const bits = [kind, `推定 約${fmtWeight(ms.weight)}`];
      if (ms.wingspan) bits.push(`翼を広げた幅 約${fmtLen(ms.wingspan)}`);
      out.push(`<text x="${f1(padL)}" y="54" font-family="${SANS}" font-size="12" fill="${dark ? '#a9b8c2' : '#6d5d45'}">${esc(bits.join('　・　'))}</text>`);
    }
    const viewLabel = { figure: '姿', skeleton: '骨格', xray: '透かし' }[view];
    out.push(`<text x="${f1(W - 12)}" y="${f1(Hh - 10)}" font-family="${SANS}" font-size="10" fill="${dark ? '#6f8290' : '#a08e70'}" text-anchor="end">${esc(viewLabel)}</text>`);
    out.push('</svg>');
    return out.join('');
  }

  /** 生き物の本体を描く（cx：モデル → 画面、pxPer：モデル 1 あたりの画面の長さ） */
  function drawCreature(m, cx, pal, view, lw, pxPer, uid) {
    const out = [];
    const c = m.c;
    const fillOf = (key) => {
      if (key === 'skin') return c.plan === 'blob' ? `url(#${uid}jelly)` : `url(#${uid}skin)`;
      if (key === 'jelly') return `url(#${uid}jelly)`;
      if (key === 'none') return 'none';
      return pal[key] || key;
    };
    const order = (p) => LAYERS.indexOf(p.layer);
    const prims = m.prims.slice().sort((a, b) => order(a) - order(b));
    const stroke = pal.ink;
    const sw = lw * 1.1;
    const pathOf = (p) => pathD(p.pts.map(cx), p.closed, p.smooth == null ? 1 : p.smooth);
    const skinPaths = [];
    if (view === 'figure') {
      prims.forEach((p) => {
        if (p.t === 'circle') {
          const q = cx(p.c);
          out.push(`<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${f1(Math.max(0.5, p.r * pxPer))}" fill="${fillOf(p.fill)}"${p.fill === 'skin' ? ` stroke="${stroke}" stroke-width="${f1(sw)}"` : ''}/>`);
          return;
        }
        if (p.t === 'ellipse') {
          const q = cx(p.c);
          out.push(`<ellipse cx="${f1(q[0])}" cy="${f1(q[1])}" rx="${f1(Math.max(0.4, p.rx * pxPer))}" ry="${f1(Math.max(0.5, p.ry * pxPer))}" transform="rotate(${f1(-p.rot)} ${f1(q[0])} ${f1(q[1])})" fill="${fillOf(p.fill)}"/>`);
          return;
        }
        const d = pathOf(p);
        if (p.fill === 'none' || !p.closed) {
          const w = p.width ? Math.max(0.8, p.width * pxPer) : p.edge ? sw : (p.sw || 1) * lw;
          const col = pal[p.stroke] || p.stroke || stroke;
          out.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${f1(w)}" stroke-linecap="round" stroke-linejoin="round"${p.width || p.edge ? '' : ' opacity=".85"'}/>`);
          return;
        }
        const st = p.noStroke ? '' : ` stroke="${p.fill === 'far' || p.fill === 'membraneFar' || p.fill === 'hornFar' ? pal.farLine : stroke}" stroke-width="${f1(p.fill === 'claw' || p.fill === 'tooth' ? sw * 0.5 : sw)}" stroke-linejoin="round"`;
        out.push(`<path d="${d}" fill="${fillOf(p.fill)}"${st}/>`);
        if (p.tex) skinPaths.push(d);
        if (p.body && p.tex) out.push('<!--body-->');
      });
      // 体の模様（鱗・毛・羽根）は、体と近い脚の上に重ねる
      if (document_hasPattern(c.skin) && skinPaths.length) {
        const tex = `<path d="${skinPaths.join('')}" fill="url(#${uid}tex)" stroke="none"/>`;
        const at = out.lastIndexOf('<!--body-->');
        if (at >= 0) out.splice(at, 1, tex);
      }
      return out.filter((s) => s !== '<!--body-->').join('');
    }
    // 骨格・透かし：体の輪郭（うすく）→ 骨
    const ghostFill = view === 'xray' ? 'rgba(120,180,220,.16)' : 'none';
    const ghostStroke = view === 'xray' ? 'rgba(150,200,235,.6)' : 'rgba(190,205,215,.38)';
    prims.forEach((p) => {
      if (p.t !== 'path' || !p.closed || p.fill === 'pupil' || p.fill === 'glint' || p.fill === 'tooth' || p.fill === 'eye') return;
      const far = /far|Far/.test(p.layer) || p.fill === 'far';
      out.push(`<path d="${pathOf(p)}" fill="${far ? 'none' : ghostFill}" stroke="${ghostStroke}" stroke-width="${f1(lw * 0.8)}"${view === 'skeleton' ? ' stroke-dasharray="3 3"' : ''} stroke-opacity="${far ? 0.5 : 1}"/>`);
    });
    if (m.noSkeleton) {
      // 骨のない生き物：殻・核を描く
      m.bones.forEach((b) => {
        if (b.t === 'shell') out.push(`<path d="${pathD(b.pts.map(cx), true)}" fill="rgba(236,226,204,.18)" stroke="#e9dfc8" stroke-width="${f1(lw * 1.4)}"/>`);
        if (b.t === 'core') { const q = cx(b.c); out.push(`<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${f1(b.r * pxPer)}" fill="#f2d36b" fill-opacity=".85" stroke="#fff3c4" stroke-width="${f1(lw)}"/><text x="${f1(q[0])}" y="${f1(q[1] + 4)}" font-family="${SANS}" font-size="11" fill="#3a2e10" text-anchor="middle">核</text>`); }
      });
      if (c.plan === 'insect' || c.plan === 'spider') {
        prims.forEach((p) => { if (p.t === 'path' && p.closed && (p.layer === 'near' || p.layer === 'far')) out.push(`<path d="${pathOf(p)}" fill="rgba(236,226,204,${p.layer === 'far' ? 0.08 : 0.2})" stroke="#e9dfc8" stroke-width="${f1(lw)}" stroke-opacity="${p.layer === 'far' ? 0.5 : 1}"/>`); });
        out.push(`<text x="${f1(cx([m.box.x0, m.box.y1])[0])}" y="${f1(cx([m.box.x0, m.box.y1])[1] - 8)}" font-family="${SANS}" font-size="11" fill="#c9d6de">体の外側の殻が骨のかわり（外骨格）</text>`);
      }
      return out.join('');
    }
    const boneFill = '#efe5cf';
    const boneLine = view === 'xray' ? '#2d3c48' : '#3a3026';
    const farBone = '#8f8778';
    const o2 = Math.max(0.6, lw * 0.9);
    const bonesSorted = m.bones.slice().sort((a, b) => (b.far ? 1 : 0) - (a.far ? 1 : 0));
    bonesSorted.forEach((b) => {
      const fill = b.far ? farBone : boneFill;
      if (b.t === 'membrane') {
        out.push(`<path d="${pathD(b.pts.map(cx), true, 0.9)}" fill="${b.feather ? 'rgba(230,220,200,.06)' : 'rgba(210,190,170,.10)'}" stroke="rgba(230,215,190,${b.far ? 0.25 : 0.45})" stroke-width="${f1(lw * 0.7)}" stroke-dasharray="${b.feather ? '2 3' : ''}"/>`);
        return;
      }
      if (b.t === 'bone') {
        const a = cx(b.a); const e = cx(b.b);
        const w = Math.max(1.2, b.w * pxPer);
        const nrm = perp(norm(sub(e, a)));
        const knobs = b.plain ? [] : [add(a, mul(nrm, w * 0.28)), add(a, mul(nrm, -w * 0.28)), add(e, mul(nrm, w * 0.28)), add(e, mul(nrm, -w * 0.28))];
        const kr = w * 0.36;
        const shape = (pad, col) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(e[0])}" y2="${f1(e[1])}" stroke="${col}" stroke-width="${f1(w * 0.62 + pad * 2)}" stroke-linecap="round"/>` + knobs.map((q) => `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${f1(kr + pad)}" fill="${col}"/>`).join('');
        out.push(`<g>${shape(o2, boneLine)}${shape(0, fill)}</g>`);
        return;
      }
      if (b.t === 'vert') {
        const a = cx(b.a); const e = cx(b.b);
        const w = Math.max(1, b.w * pxPer);
        const nn = [b.n[0], -b.n[1]];
        const mid = lerp2(a, e, 0.5);
        const sp = add(mid, mul(nn, Math.max(1, b.spineH * pxPer)));
        const ch2 = b.chevron ? add(mid, mul(nn, -b.chevron * pxPer)) : null;
        const parts = (pad, col) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(e[0])}" y2="${f1(e[1])}" stroke="${col}" stroke-width="${f1(w + pad * 2)}" stroke-linecap="round"/>`
          + `<line x1="${f1(mid[0])}" y1="${f1(mid[1])}" x2="${f1(sp[0])}" y2="${f1(sp[1])}" stroke="${col}" stroke-width="${f1(w * 0.42 + pad * 2)}" stroke-linecap="round"/>`
          + (ch2 ? `<line x1="${f1(mid[0])}" y1="${f1(mid[1])}" x2="${f1(ch2[0])}" y2="${f1(ch2[1])}" stroke="${col}" stroke-width="${f1(w * 0.3 + pad * 2)}" stroke-linecap="round"/>` : '');
        out.push(`<g>${parts(o2 * 0.8, boneLine)}${parts(0, fill)}</g>`);
        return;
      }
      if (b.t === 'rib') {
        const d = pathD(b.pts.map(cx), false);
        const w = Math.max(1, b.w * pxPer);
        out.push(`<path d="${d}" fill="none" stroke="${boneLine}" stroke-width="${f1(w + o2 * 2)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${fill}" stroke-width="${f1(w)}" stroke-linecap="round"/>`);
        return;
      }
      if (b.t === 'ball') {
        const q = cx(b.c);
        out.push(`<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${f1(b.r * pxPer)}" fill="${fill}" stroke="${boneLine}" stroke-width="${f1(o2)}"/>`);
        return;
      }
      if (b.t === 'fin') {
        const pts = b.pts.map(cx);
        const base = lerp2(pts[0], pts[pts.length - 1], 0.5);
        for (let i = 0; i < 5; i++) {
          const tip = lerp2(pts[1], pts[pts.length - 2] || pts[1], i / 4);
          out.push(`<line x1="${f1(base[0])}" y1="${f1(base[1])}" x2="${f1(tip[0])}" y2="${f1(tip[1])}" stroke="${fill}" stroke-width="${f1(Math.max(1, lw))}" stroke-linecap="round"/>`);
        }
        return;
      }
      if (b.t === 'shape') {
        const pts = b.pts.map(cx);
        let d = pathD(pts, true, b.smooth == null ? 0.8 : b.smooth);
        (b.holes || []).forEach((h0) => {
          const q = cx(h0.c);
          const rx = Math.max(0.8, h0.rx * pxPer); const ry = Math.max(0.8, h0.ry * pxPer);
          const r2 = -(h0.rot || 0) * D2R;
          const ex = [Math.cos(r2) * rx, Math.sin(r2) * rx];
          const ey = [-Math.sin(r2) * ry, Math.cos(r2) * ry];
          const pt = (t) => [q[0] + ex[0] * Math.cos(t) + ey[0] * Math.sin(t), q[1] + ex[1] * Math.cos(t) + ey[1] * Math.sin(t)];
          const hp = [];
          for (let i = 0; i < 12; i++) hp.push(pt(-i / 12 * Math.PI * 2));
          d += pathD(hp, true);
        });
        out.push(`<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${boneLine}" stroke-width="${f1(o2)}" stroke-linejoin="round"/>`);
      }
    });
    return out.join('');
  }
  function document_hasPattern(skin) { return skin === 'scale' || skin === 'fur' || skin === 'feather' || skin === 'shell'; }

  // 名前や分類から、体の形のひな形を推し量る（先にあるものほど優先）
  const GUESS = [
    [/恐竜|ラプトル|レックス/, 'raptor'], [/飛竜|ワイバーン/, 'wyvern'], [/龍|東洋の竜/, 'eastern'], [/竜|ドラゴン|ドレイク/, 'dragon'],
    [/大蛇|蛇|ヘビ|へび|サーペント|ナーガ|ワーム|バジリスク/, 'serpent'], [/天馬|ペガサス|一角獣|ユニコーン|麒麟/, 'pegasus'],
    [/グリフォン|グリフィン|ヒッポグリフ/, 'griffin'], [/狼|オオカミ|ウルフ|犬|フェンリル|ケルベロス|ハウンド/, 'wolf'],
    [/獅子|ライオン|猫|ネコ|虎|トラ|豹|キャット|マンティコア|スフィンクス/, 'lion'], [/熊|クマ|ベア/, 'bear'], [/馬|鹿|シカ|ホース|ディア/, 'horse'],
    [/鳥|鷲|鷹|鴉|カラス|フェニックス|不死鳥|鳳凰|ロック|怪鳥|ハーピー|グリフ/, 'bird'],
    [/巨人|鬼|オーガ|トロール|ジャイアント|ゴーレム|オーク|サイクロプス|タイタン/, 'giant'],
    [/鯨|クジラ|リヴァイアサン|レヴィアタン|海獣|クラーケン/, 'whale'], [/魚|鮫|サメ|シャーク/, 'fish'],
    [/蜘蛛|クモ|スパイダー|アラクネ/, 'spider'], [/虫|蟲|甲虫|蟻|アリ|ビートル|蠍|サソリ/, 'insect'], [/スライム|粘体|ゼリー|ゲル/, 'slime'],
  ];
  function guessPreset(text) {
    const s = String(text || '');
    for (const [re, id] of GUESS) if (re.test(s)) return id;
    return null;
  }

  /** 項目の図の設定（形が決まっていなければ、名前などから推し量る） */
  function figureOf(entry) {
    const fig = Object.assign({}, (entry && entry.figure) || {});
    if (!PRESETS[fig.preset]) {
      const f = (entry && entry.fields) || {};
      fig.preset = guessPreset([entry && entry.name, f.kind, f.looks, entry && (entry.aliases || []).join(' ')].join(' ')) || 'dragon';
    }
    return fig;
  }

  /** 小さな見本（一覧・資料パネル用）：寸法や題名なし */
  function thumb(entry, size) {
    return render(entry, { width: size || 160, height: Math.round((size || 160) * 0.62), title: false, dims: false, compare: 'none' });
  }

  NS.Creature = { PRESETS, OPTIONS, VIEWS, COLORS, BELLIES, COMPARE_LIST, resolve, build, render, thumb, measure, parseSize, parseWeight, fmtLen, fmtWeight, flightNote, guessPreset, figureOf, esc };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
