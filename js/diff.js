/*
 * 綴り — 版の比べ方（差分）
 * 段落（行）ごとに比べてから、書き換えた段落の中を1文字ずつ比べる。
 * ブラウザでも Node でも動く純粋関数のみ。
 */
(function (NS) {
  'use strict';

  /**
   * Myers の差分。a・b は配列（文字・行）。
   * 戻り値：[{ t: '=', a: [...] } | { t: '-', a: [...] } | { t: '+', a: [...] }]（同じ種類は1つにまとめる）
   * 違いが maxD を超えるときは null（計算を打ち切る）
   */
  function myers(a, b, maxD) {
    const N = a.length;
    const M = b.length;
    const MAX = N + M;
    const off = MAX + 1;
    const v = new Int32Array(2 * MAX + 3);
    const trace = [];
    let found = -1;
    for (let d = 0; d <= MAX; d++) {
      if (maxD != null && d > maxD) return null;
      // この段の前の状態のうち、あとで使う範囲（-d-1〜d+1）だけを控える
      trace.push(v.slice(off - d - 1, off + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
        else x = v[off + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= N && y >= M) { found = d; break; }
      }
      if (found >= 0) break;
    }
    // たどり直して、手順を作る
    const ops = [];
    let x = N;
    let y = M;
    for (let d = found; d >= 0; d--) {
      const snap = trace[d];
      const get = (k) => snap[k + d + 1];
      const k = x - y;
      let pk;
      if (k === -d || (k !== d && get(k - 1) < get(k + 1))) pk = k + 1;
      else pk = k - 1;
      const px = d === 0 ? 0 : get(pk);
      const py = px - pk;
      while (x > px && y > py) { ops.push(['=', a[x - 1]]); x--; y--; }
      if (d > 0) {
        if (x === px) { ops.push(['+', b[y - 1]]); y--; } else { ops.push(['-', a[x - 1]]); x--; }
      }
    }
    while (x > 0 && y > 0) { ops.push(['=', a[x - 1]]); x--; y--; }
    ops.reverse();
    const out = [];
    ops.forEach(([t, item]) => {
      const last = out[out.length - 1];
      if (last && last.t === t) last.a.push(item);
      else out.push({ t, a: [item] });
    });
    return out;
  }

  function splitLines(s) {
    const out = [];
    const re = /[^\n]*\n|[^\n]+$/g;
    let m;
    while ((m = re.exec(s)) !== null) { if (!m[0]) break; out.push(m[0]); }
    return out;
  }

  /** 1文字ずつの差分（長すぎる段落は、段落ごとの入れ替えとして扱う） */
  function charDiff(oldS, newS) {
    const a = Array.from(oldS);
    const b = Array.from(newS);
    const ops = a.length + b.length <= 6000 ? myers(a, b, 1200) : null;
    if (!ops) return [{ type: 'del', text: oldS }, { type: 'ins', text: newS }];
    return ops.map((o) => ({ type: o.t === '=' ? 'eq' : o.t === '-' ? 'del' : 'ins', text: o.a.join('') }));
  }

  /** 同じ所がどれだけあるか（0〜1）。段落の対応づけに使う */
  function similarity(x, y) {
    if (!x.length || !y.length) return 0;
    const segs = charDiff(x, y);
    let same = 0;
    segs.forEach((s) => { if (s.type === 'eq') same += Array.from(s.text).length; });
    return same / Math.max(Array.from(x).length, Array.from(y).length);
  }

  /**
   * 2つの本文を比べる。
   * 戻り値：{ segs: [{ type: 'eq'|'del'|'ins', text }], added, removed, blocks }
   *   added・removed は空白と改行を除いた文字数、blocks は変わった所の数
   */
  function diffText(oldText, newText) {
    oldText = String(oldText || '');
    newText = String(newText || '');
    const A = splitLines(oldText);
    const B = splitLines(newText);
    const lineOps = myers(A, B, 4000) || [{ t: '-', a: A }, { t: '+', a: B }];
    const segs = [];
    const push = (type, text) => {
      if (!text) return;
      const last = segs[segs.length - 1];
      if (last && last.type === type) last.text += text;
      else segs.push({ type, text });
    };
    for (let i = 0; i < lineOps.length; i++) {
      const op = lineOps[i];
      if (op.t === '=') { push('eq', op.a.join('')); continue; }
      // 消した段落と足した段落が続くときは、似ている段落どうしを1文字ずつ比べる
      const dels = op.t === '-' ? op.a : [];
      let adds = op.t === '+' ? op.a : [];
      if (op.t === '-' && lineOps[i + 1] && lineOps[i + 1].t === '+') { adds = lineOps[i + 1].a; i++; }
      const n = Math.min(dels.length, adds.length);
      for (let j = 0; j < n; j++) {
        if (similarity(dels[j], adds[j]) >= 0.3) charDiff(dels[j], adds[j]).forEach((s) => push(s.type, s.text));
        else { push('del', dels[j]); push('ins', adds[j]); }
      }
      dels.slice(n).forEach((l) => push('del', l));
      adds.slice(n).forEach((l) => push('ins', l));
    }
    const count = (s) => Array.from(s.replace(/[\s　]/g, '')).length;
    let added = 0;
    let removed = 0;
    let blocks = 0;
    let prevEq = true;
    segs.forEach((s) => {
      if (s.type === 'ins') added += count(s.text);
      if (s.type === 'del') removed += count(s.text);
      if (s.type !== 'eq' && prevEq) blocks++;
      prevEq = s.type === 'eq';
    });
    return { segs, added, removed, blocks };
  }

  NS.Diff = { myers, diffText, charDiff, splitLines };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
