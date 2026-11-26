/*
 * 綴り — 特殊な読み方（ルビ）の登録簿
 * アイデア帳（種類「読み方」や、本文に 足《アルファ》 のように書いたメモ）と、
 * 設定資料の「読み」から、作者が意図した読み方を集める。添削・AI・辞書で使う。
 */
(function (NS) {
  'use strict';
  const KANJI = '一-鿿㐀-䶿々〆ヵヶ';
  const RE_PIPE = /[|｜]([^|｜《》\n]{1,20})《([^《》\n]{0,30})》/g;
  const RE_KANJI = new RegExp('([' + KANJI + ']{1,20})《([^《》\\n]{0,30})》', 'g');

  /** カタカナ→ひらがな、空白除去（読みの比較用） */
  function normReading(s) {
    return String(s || '').replace(/[\s　・]/g, '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }

  function hasKanji(s) { return new RegExp('[' + KANJI + ']').test(s); }

  /** 文章中のルビ記法を位置付きで取り出す */
  function findRubies(text) {
    const out = [];
    let m;
    RE_PIPE.lastIndex = 0;
    while ((m = RE_PIPE.exec(text)) !== null) {
      const baseStart = m.index + 1;
      const readingStart = baseStart + m[1].length + 1;
      out.push({ start: m.index, end: m.index + m[0].length, base: m[1], reading: m[2], baseStart, readingStart, readingEnd: readingStart + m[2].length, pipe: true });
    }
    RE_KANJI.lastIndex = 0;
    while ((m = RE_KANJI.exec(text)) !== null) {
      const prevEnd = out.find((r) => r.pipe && m.index >= r.start && m.index < r.end);
      if (prevEnd) continue;
      const readingStart = m.index + m[1].length + 1;
      out.push({ start: m.index, end: m.index + m[0].length, base: m[1], reading: m[2], baseStart: m.index, readingStart, readingEnd: readingStart + m[2].length, pipe: false });
    }
    return out.sort((a, b) => a.start - b.start);
  }

  /** メモの一行から「表記・読み」の組を読み取る（足＝アルファ、足 → アルファ、足（アルファ） など） */
  function parseLine(line) {
    const t = line.trim();
    if (!t) return null;
    let m = t.match(/^([^＝=→:：（(／/\s]+)\s*(?:＝|=|→|:|：|／|\/)\s*([^\s（(]+)/);
    if (m) return { base: m[1].replace(/^[|｜]/, ''), reading: m[2] };
    m = t.match(/^([^（(\s]+)\s*[（(]([^）)]+)[）)]/);
    if (m) return { base: m[1].replace(/^[|｜]/, ''), reading: m[2] };
    return null;
  }

  /** 作品から登録された読み方を集める */
  function collect(project) {
    const list = [];
    const seen = new Set();
    const add = (base, reading, source, id, note) => {
      base = String(base || '').trim();
      reading = String(reading || '').trim();
      if (!base || !reading) return;
      const k = base + '\u0000' + normReading(reading);
      if (seen.has(k)) return;
      seen.add(k);
      list.push({ base, reading, source, id, note: note || '' });
    };
    ((project && project.ideas) || []).forEach((it) => {
      if (it.word && it.reading) add(it.word, it.reading, 'idea', it.id, it.body);
      findRubies(it.body || '').forEach((r) => add(r.base, r.reading, 'idea', it.id));
      if (it.kind === '読み方') (it.body || '').split('\n').forEach((line) => { const p = parseLine(line); if (p) add(p.base, p.reading, 'idea', it.id); });
    });
    ((project && project.entries) || []).forEach((e) => {
      if (!e.reading) return;
      const name = String(e.name || '').replace(/[\s　]/g, '');
      if (hasKanji(name)) add(name, e.reading.replace(/[\s　]/g, ''), 'lore', e.id);
      // 姓・名に分けて読みも分けて書いてある場合（山田 太郎 / やまだ たろう）
      const parts = String(e.name || '').trim().split(/[\s　]+/);
      const rp = String(e.reading || '').trim().split(/[\s　]+/);
      if (parts.length > 1 && parts.length === rp.length) parts.forEach((p, i) => { if (hasKanji(p)) add(p, rp[i], 'lore', e.id); });
    });
    // 世界観ルールのお金（「黒聖貨《こくせいか》」のような造語の読み）
    const coins = project && project.rules && project.rules.currency && project.rules.currency.units;
    (coins || []).forEach((u) => { if (u && u.name && u.reading && hasKanji(u.name)) add(u.name.trim(), u.reading.replace(/[\s　]/g, ''), 'world', null, 'お金'); });
    return list;
  }

  /** 表記 → 読みの集合 */
  function index(list) {
    const map = new Map();
    (list || []).forEach((r) => {
      if (!map.has(r.base)) map.set(r.base, { readings: new Set(), items: [] });
      const v = map.get(r.base);
      v.readings.add(normReading(r.reading));
      v.items.push(r);
    });
    return map;
  }

  /** 普段とは違う読み（当て字）らしいか */
  function looksSpecial(base, reading) {
    if (!hasKanji(base)) return false;
    if (/[ァ-ヺ]/.test(reading)) return true; // カタカナの読み
    if (/[A-Za-zＡ-Ｚａ-ｚ]/.test(reading)) return true;
    const kanjiCount = (base.match(new RegExp('[' + KANJI + ']', 'g')) || []).length;
    return normReading(reading).length > kanjiCount * 4 + 1;
  }

  NS.Readings = { collect, index, findRubies, normReading, looksSpecial, parseLine, hasKanji };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
