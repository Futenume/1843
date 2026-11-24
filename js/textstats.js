/*
 * 綴り — 文章解析ユーティリティ
 * 文・段落・会話文の分割、ルビ記法の処理、文字数などの統計。
 * ブラウザでも Node でも動く純粋関数のみ。
 */
(function (NS) {
  'use strict';

  // ルビ記法などを「位置を保ったまま」無視するための埋め字（私用領域の文字）
  const FILLER = '';

  const QUOTE_OPEN = '「『（(【〈〔［“';
  const PAIRS = {
    '「': '」', '『': '』', '（': '）', '(': ')', '【': '】',
    '〈': '〉', '〔': '〕', '［': '］', '“': '”', '《': '》',
  };
  const CLOSERS = {};
  Object.keys(PAIRS).forEach((k) => { CLOSERS[PAIRS[k]] = k; });

  const KANJI = '一-鿿㐀-䶿々〆ヵヶ';
  const RE_KANJI_RUBY = new RegExp('([' + KANJI + ']+)《([^《》\\n]{1,30})》', 'g');
  const RE_PIPE_RUBY = /[|｜]([^|｜《》\n]{1,20})《([^《》\n]{1,30})》/g;
  const RE_EMPHASIS = /《《([^《》\n]*)》》/g;

  /** ルビ・傍点の記法を、文字位置を変えずに埋め字へ置き換える（本文の解析用） */
  function maskRuby(text) {
    return text
      .replace(RE_EMPHASIS, (m, inner) => FILLER + FILLER + inner + FILLER + FILLER)
      .replace(RE_PIPE_RUBY, (m, base, ruby) => FILLER + base + FILLER.repeat(ruby.length + 2))
      .replace(RE_KANJI_RUBY, (m, base, ruby) => base + FILLER.repeat(ruby.length + 2));
  }

  /** ルビ・傍点の記法を取り除いた素の本文 */
  function stripRuby(text) {
    return text
      .replace(RE_EMPHASIS, '$1')
      .replace(RE_PIPE_RUBY, '$1')
      .replace(RE_KANJI_RUBY, '$1');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** プレビュー用：ルビ・傍点・縦中横を HTML に変換（1 段落分） */
  function rubyToHtml(text, opts) {
    const vertical = !opts || opts.vertical !== false;
    let s = escapeHtml(text);
    s = s.replace(RE_EMPHASIS, '<em class="boten">$1</em>');
    s = s.replace(RE_PIPE_RUBY, '<ruby>$1<rt>$2</rt></ruby>');
    s = s.replace(RE_KANJI_RUBY, '<ruby>$1<rt>$2</rt></ruby>');
    if (vertical) {
      s = s.replace(/(^|[^0-9A-Za-z])([0-9]{2})(?![0-9A-Za-z])/g, '$1<span class="tcy">$2</span>');
      s = s.replace(/[!！][?？]|[?？][!！]|!!|！！|\?\?|？？/g, (m) => '<span class="tcy">' + m.replace(/！/g, '!').replace(/？/g, '?') + '</span>');
    }
    return s;
  }

  /** 段落（改行区切り） */
  function splitParagraphs(text) {
    const out = [];
    let start = 0;
    for (let i = 0; i <= text.length; i++) {
      if (i === text.length || text[i] === '\n') {
        out.push({ start, end: i, text: text.slice(start, i) });
        start = i + 1;
      }
    }
    return out;
  }

  function isSpace(c) {
    return c === ' ' || c === '　' || c === '\t' || c === '\r';
  }

  /**
   * 本文を解析し、段落・文・会話文の位置を返す。
   * - sentences: 地の文/会話文の「文」単位（会話を含む地の文は 1 文として扱う）
   * - dialogues: 最上位の「」『』の範囲
   * - inDialogue: 各文字が会話文の中にあるか (1/0)
   */
  function analyze(rawText) {
    const text = maskRuby(rawText);
    const paragraphs = splitParagraphs(text);
    const sentences = [];
    const dialogues = [];
    const inDialogue = new Uint8Array(text.length);

    paragraphs.forEach((p, pIndex) => {
      const stack = [];
      let sStart = p.start;
      let dlg = null;
      const pushSentence = (end) => {
        let s = sStart;
        while (s < end && isSpace(text[s])) s++;
        if (s < end) {
          const t = text.slice(s, end);
          const first = t[0];
          let kind = 'narration';
          if ((first === '「' || first === '『') && dialogues.length) {
            const d = dialogues[dialogues.length - 1];
            if (d.start === s && d.end === end) kind = 'dialogue';
          }
          sentences.push({ start: s, end, text: t, kind, para: pIndex });
        }
        sStart = end;
      };

      for (let i = p.start; i < p.end; i++) {
        const c = text[i];
        if (QUOTE_OPEN.indexOf(c) >= 0) {
          if (stack.length === 0 && (c === '「' || c === '『')) {
            dlg = { start: i, innerStart: i + 1, para: pIndex, open: c };
          }
          stack.push(c);
          continue;
        }
        if (CLOSERS[c] && QUOTE_OPEN.indexOf(CLOSERS[c]) >= 0) {
          if (stack.length && PAIRS[stack[stack.length - 1]] === c) {
            stack.pop();
            if (stack.length === 0 && dlg) {
              dlg.innerEnd = i;
              dlg.end = i + 1;
              dlg.closed = true;
              dialogues.push(dlg);
              dlg = null;
              // 会話の直後が次の会話 or 段落末なら文の区切り
              let j = i + 1;
              while (j < p.end && isSpace(text[j])) j++;
              if (j >= p.end || text[j] === '「' || text[j] === '『') {
                pushSentence(i + 1);
              }
            }
          }
          continue;
        }
        if (stack.length === 0 && '。！？!?'.indexOf(c) >= 0) {
          let j = i + 1;
          while (j < p.end && '。！？!?'.indexOf(text[j]) >= 0) j++;
          pushSentence(j);
          i = j - 1;
        }
      }
      if (dlg) {
        dlg.innerEnd = p.end;
        dlg.end = p.end;
        dlg.closed = false;
        dialogues.push(dlg);
      }
      pushSentence(p.end);
    });

    dialogues.forEach((d) => {
      for (let i = d.start; i < d.end; i++) inDialogue[i] = 1;
    });

    return { text: rawText, masked: text, paragraphs, sentences, dialogues, inDialogue };
  }

  /** 会話文の中身を文に分割（読みやすさチェック用） */
  function innerSentences(masked, d) {
    const out = [];
    const TERM = '。！？!?';
    let s = d.innerStart;
    let i = d.innerStart;
    while (i < d.innerEnd) {
      if (TERM.indexOf(masked[i]) >= 0) {
        let j = i + 1;
        while (j < d.innerEnd && TERM.indexOf(masked[j]) >= 0) j++;
        out.push({ start: s, end: j, text: masked.slice(s, j), kind: 'dialogue-inner' });
        s = j;
        i = j;
      } else {
        i++;
      }
    }
    if (s < d.innerEnd) out.push({ start: s, end: d.innerEnd, text: masked.slice(s, d.innerEnd), kind: 'dialogue-inner' });
    return out;
  }

  function visibleLength(s) {
    let n = 0;
    for (const c of s) {
      if (c === FILLER || c === '\n' || isSpace(c)) continue;
      n++;
    }
    return n;
  }

  /** 文字数・原稿用紙換算などの統計 */
  function stats(rawText) {
    const plain = stripRuby(rawText || '');
    const chars = plain.replace(/\n/g, '').length;
    const charsNoSpace = plain.replace(/[\s　]/g, '').length;
    const lines = plain.replace(/\n+$/, '').split('\n');
    let gridLines = 0;
    if (plain.trim()) {
      lines.forEach((line) => { gridLines += Math.max(1, Math.ceil(line.length / 20)); });
    }
    const pages = gridLines ? Math.ceil(gridLines / 20) : 0;
    const a = analyze(plain);
    let dialogueChars = 0;
    a.dialogues.forEach((d) => { dialogueChars += visibleLength(plain.slice(d.innerStart, d.innerEnd)); });
    const kanji = (plain.match(/[一-鿿㐀-䶿々]/g) || []).length;
    const kana = (plain.match(/[ぁ-ゖァ-ヺー]/g) || []).length;
    const sentenceCount = a.sentences.length;
    const paraCount = a.paragraphs.filter((p) => p.text.trim()).length;
    return {
      chars,
      charsNoSpace,
      pages,
      gridLines,
      dialogueRatio: charsNoSpace ? dialogueChars / charsNoSpace : 0,
      kanjiRatio: kanji + kana ? kanji / (kanji + kana) : 0,
      sentences: sentenceCount,
      paragraphs: paraCount,
      avgSentence: sentenceCount ? charsNoSpace / sentenceCount : 0,
      dialogues: a.dialogues.length,
      readingMinutes: charsNoSpace / 500,
    };
  }

  const KANJI_DIGITS = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

  /** 「17」「１７」「十七」「二〇二六」などを数値に */
  function parseJaNumber(str) {
    let s = String(str).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (/^[〇零一二三四五六七八九]{2,}$/.test(s)) {
      return parseInt(Array.from(s).map((c) => KANJI_DIGITS[c]).join(''), 10);
    }
    let total = 0;
    let cur = 0;
    for (const c of s) {
      if (c in KANJI_DIGITS) cur = KANJI_DIGITS[c];
      else if (c === '十') { total += (cur || 1) * 10; cur = 0; }
      else if (c === '百') { total += (cur || 1) * 100; cur = 0; }
      else if (c === '千') { total += (cur || 1) * 1000; cur = 0; }
      else return NaN;
    }
    return total + cur;
  }

  /** 数値を漢数字に（縦書き向けの提案用） */
  function toKanjiNumber(n) {
    const digits = '〇一二三四五六七八九';
    if (!isFinite(n) || n < 0) return String(n);
    if (n === 0) return '〇';
    if (n >= 10000) return String(n).split('').map((c) => digits[+c]).join('');
    let s = '';
    [[1000, '千'], [100, '百'], [10, '十']].forEach(([u, ch]) => {
      const q = Math.floor(n / u);
      if (q) { s += (q === 1 ? '' : digits[q]) + ch; n %= u; }
    });
    if (n) s += digits[n];
    return s;
  }

  /** 二つの本文の差分位置（入力中のハイライト位置補正用） */
  function diffRange(a, b) {
    let start = 0;
    const min = Math.min(a.length, b.length);
    while (start < min && a.charCodeAt(start) === b.charCodeAt(start)) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) { endA--; endB--; }
    return { start, oldEnd: endA, newEnd: endB };
  }

  /** 差分に合わせて指摘範囲をずらす（編集箇所に重なる指摘は捨てる） */
  function shiftRanges(items, diff) {
    const delta = (diff.newEnd - diff.start) - (diff.oldEnd - diff.start);
    const out = [];
    items.forEach((it) => {
      if (it.end <= diff.start) out.push(it);
      else if (it.start >= diff.oldEnd) out.push(Object.assign({}, it, { start: it.start + delta, end: it.end + delta }));
    });
    return out;
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  NS.Text = {
    FILLER,
    PAIRS,
    maskRuby,
    stripRuby,
    rubyToHtml,
    escapeHtml,
    splitParagraphs,
    analyze,
    innerSentences,
    visibleLength,
    stats,
    parseJaNumber,
    toKanjiNumber,
    diffRange,
    shiftRanges,
    escapeRegExp,
  };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
