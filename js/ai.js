/*
 * 綴り — AI 機能（Claude API）
 * AI添削・AI設定矛盾チェック・AIに相談。
 * Anthropic 公式 SDK をブラウザで読み込み、利用者自身の API キーで直接呼び出す。
 * キーはこの端末の localStorage にだけ保存し、作品のバックアップには含めない。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;
  const { h, icon, btn, clear, toast } = UI;

  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.7.0/+esm';
  const KEY_STORAGE = 'tsuzuri.apiKey';
  const MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5（高品質・おすすめ）'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5（速くて安価）'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5（最安・簡易チェック向け）'],
  ];
  // サーバー側のフォールバックに対応しているモデル
  const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

  let sdkPromise = null;
  function loadSDK() {
    if (!sdkPromise) {
      sdkPromise = import(SDK_URL).catch((e) => {
        sdkPromise = null;
        throw new Error('AIライブラリを読み込めませんでした（インターネット接続を確認してください）');
      });
    }
    return sdkPromise;
  }

  function getKey() {
    try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { return ''; }
  }
  function setKey(k) {
    try {
      if (k) localStorage.setItem(KEY_STORAGE, k);
      else localStorage.removeItem(KEY_STORAGE);
      return true;
    } catch (e) { return false; }
  }

  function settings() { return NS.App ? NS.App.settings : {}; }

  async function makeClient() {
    const key = getKey();
    if (!key) throw new Error('APIキーが設定されていません');
    const mod = await loadSDK();
    const Anthropic = mod.default || mod.Anthropic;
    return { Anthropic, client: new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }) };
  }

  function friendlyError(e, Anthropic) {
    if (!e) return '不明なエラー';
    if (Anthropic) {
      if (e instanceof Anthropic.APIUserAbortError) return 'キャンセルしました';
      if (e instanceof Anthropic.AuthenticationError) return 'APIキーが正しくありません。設定を確認してください';
      if (e instanceof Anthropic.PermissionDeniedError) return 'このAPIキーではこのモデルを使えません';
      if (e instanceof Anthropic.NotFoundError) return 'モデルが見つかりません。設定でモデルを選び直してください';
      if (e instanceof Anthropic.RateLimitError) return '利用上限に達したか混み合っています。少し待ってからやり直してください';
      if (e instanceof Anthropic.BadRequestError) return 'リクエストが受け付けられませんでした：' + (e.message || '');
      if (e instanceof Anthropic.InternalServerError) return 'AIサーバーでエラーが起きました。少し待ってからやり直してください';
      if (e instanceof Anthropic.APIConnectionError) return 'AIサーバーに接続できませんでした。インターネット接続を確認してください';
    }
    return e.message || String(e);
  }

  function baseParams(system, user, maxTokens) {
    const st = settings();
    const model = st.aiModel || 'claude-opus-5-5';
    const params = {
      model,
      max_tokens: maxTokens || 32000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: st.aiEffort || 'medium' },
    };
    if (FALLBACK_MODELS.has(model)) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    return params;
  }

  /** ストリーミングで呼び出して最終メッセージを得る */
  async function run(params, opts) {
    opts = opts || {};
    let Anthropic = null;
    try {
      const c = await makeClient();
      Anthropic = c.Anthropic;
      const stream = c.client.beta.messages.stream(params, { signal: opts.signal });
      if (opts.onText) stream.on('text', (delta, snapshot) => opts.onText(snapshot));
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new Error('AIがこの依頼に応じませんでした。内容や範囲を変えて試してください');
      if (msg.stop_reason === 'max_tokens') throw new Error('出力が長すぎて途中で切れました。選択範囲を絞ってやり直してください');
      return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    } catch (e) {
      throw new Error(friendlyError(e, Anthropic));
    }
  }

  async function runJSON(system, user, schema, opts) {
    const params = baseParams(system, user);
    params.output_config.format = { type: 'json_schema', schema };
    const text = await run(params, opts);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('AIの応答を読み取れませんでした');
    }
  }

  // ───── プロンプト ─────
  const PROOF_SYSTEM = [
    'あなたは日本語の小説を専門とする経験豊富な編集者・校正者です。作者の文体と意図を尊重しながら、原稿の問題点を指摘してください。',
    '指摘の対象：誤字脱字・誤変換、文法の誤り、主語と述語のねじれ、意味が通りにくい箇所、言葉の誤用、冗長な表現、読みにくい長文、視点の揺れ（一人称と三人称の混在など）、時制の不統一、同じ語の過剰な繰り返し。',
    'ルール：',
    '- quote には原稿からそのまま抜き出した文字列（10〜40文字程度、原稿内で場所が一つに決まる長さ）を入れる。改変・要約しない。',
    '- suggestion には quote をそのまま置き換えられる修正後の文字列を入れる。置き換え案を示せない指摘（構成上の問題など）は空文字にする。',
    '- reason は日本語で簡潔に（60字程度まで）。',
    '- 台詞の口語表現（い抜き言葉など）や、登場人物の個性としての言葉遣いは、明らかな誤りでない限り指摘しない。',
    '- 好みの問題にすぎない書き換えは控え、本当に直すべき箇所を優先する。多くても40件まで。',
    '- summary には原稿全体の講評（良い点と改善点）を2〜4文で書く。',
  ].join('\n');

  const CONS_SYSTEM = [
    'あなたは日本語の小説の編集者で、設定の整合性チェックを担当しています。設定資料と原稿を照らし合わせ、原稿の中で設定と食い違っている箇所や、原稿の前後で矛盾している箇所を見つけてください。',
    '確認する観点：人物の外見・年齢・一人称・口調・呼び方・性格・能力、人物同士の関係、地名や用語の表記と意味、世界観のルール（存在しない技術・単位・概念など）、時系列（退場した人物の登場など）、原稿内の前後矛盾。',
    'ルール：',
    '- quote には原稿からそのまま抜き出した該当箇所（10〜40文字程度）を入れる。改変しない。',
    '- problem に何が食い違っているかを書き、setting にはその根拠となる設定資料の記述を短く引用する（原稿内の前後矛盾なら、食い違う相手の箇所）。',
    '- suggestion には quote をそのまま置き換えられる、設定に合わせた修正案を入れる。示せない場合は空文字。',
    '- 設定資料に書かれていないことを推測で矛盾扱いしない。確実なものだけを、多くても30件まで。',
    '- summary には全体の所見を1〜3文で書く。食い違いがなければ items は空配列にする。',
  ].join('\n');

  const ASK_SYSTEM = [
    'あなたは日本語の小説の執筆を支える、率直で頼れる編集者です。作者からの相談に、設定資料と原稿を踏まえて答えてください。',
    'アイデア出しを求められたら具体的な案を複数出し、批評を求められたら良い点と改善点を具体的な箇所を挙げて伝えます。',
    '作者の作品なので、方向性を勝手に決めつけず、選択肢として提示してください。回答は日本語で、見出しや箇条書きを適度に使って読みやすく。',
  ].join('\n');

  const PROOF_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'items'],
    properties: {
      summary: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['quote', 'suggestion', 'reason', 'category', 'severity'],
          properties: {
            quote: { type: 'string' },
            suggestion: { type: 'string' },
            reason: { type: 'string' },
            category: { type: 'string', enum: ['誤字脱字', '文法', '表現', '読みやすさ', '視点・時制', 'その他'] },
            severity: { type: 'string', enum: ['error', 'warning', 'info'] },
          },
        },
      },
    },
  };

  const CONS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'items'],
    properties: {
      summary: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['quote', 'problem', 'setting', 'suggestion', 'severity'],
          properties: {
            quote: { type: 'string' },
            problem: { type: 'string' },
            setting: { type: 'string' },
            suggestion: { type: 'string' },
            severity: { type: 'string', enum: ['error', 'warning', 'info'] },
          },
        },
      },
    },
  };

  function manuscriptBlock(ctx, text) {
    return `## 原稿（第${ctx.chapterNo}話「${ctx.chapter.title}」）\n<manuscript>\n${text}\n</manuscript>`;
  }

  function settingsBlock(project) {
    const md = NS.LoreFormat.toMarkdown(project);
    return `## 設定資料\n<settings>\n${md}\n</settings>`;
  }

  /** AI の引用を本文中の位置に結びつける */
  function locate(text, quote, offset, from) {
    if (!quote) return null;
    const tryFind = (q) => {
      let i = text.indexOf(q, from || 0);
      if (i < 0) i = text.indexOf(q);
      return i;
    };
    let i = tryFind(quote);
    let q = quote;
    if (i < 0) {
      q = quote.trim().replace(/^[「『（\s　]+|[」』）。、\s　]+$/g, '');
      if (q.length >= 4) i = tryFind(q);
    }
    if (i < 0) return null;
    return { start: i + (offset || 0), end: i + (offset || 0) + q.length, text: q };
  }

  // 話ごとの直近の結果
  const results = {};

  async function proofread(ctx, scope, signal, onText) {
    const full = ctx.getText();
    const sel = scope === 'selection' ? ctx.getSelection() : null;
    const text = sel ? sel.text : full;
    const offset = sel ? sel.start : 0;
    const user = (ctx.project.synopsis ? `## 作品のあらすじ\n${ctx.project.synopsis}\n\n` : '') + manuscriptBlock(ctx, text);
    const data = await runJSON(PROOF_SYSTEM, user, PROOF_SCHEMA, { signal, onText });
    let cursor = 0;
    const items = (data.items || []).map((it) => {
      const loc = locate(text, it.quote, offset, cursor);
      if (loc) cursor = loc.end - offset;
      return {
        ruleId: 'ai-proof', rule: 'AI添削：' + it.category, category: 'AI', severity: it.severity || 'warning',
        start: loc ? loc.start : -1, end: loc ? loc.end : -1, text: loc ? loc.text : it.quote,
        message: it.reason, suggestion: it.suggestion && loc && loc.text === it.quote ? it.suggestion : null,
        rawSuggestion: it.suggestion || '', fixable: false, source: 'ai', key: 'ai|' + it.quote, found: !!loc,
      };
    });
    return { kind: 'proof', summary: data.summary || '', items, at: Date.now() };
  }

  async function checkConsistency(ctx, scope, signal, onText) {
    const full = ctx.getText();
    const sel = scope === 'selection' ? ctx.getSelection() : null;
    const text = sel ? sel.text : full;
    const offset = sel ? sel.start : 0;
    const user = settingsBlock(ctx.project) + '\n\n' + manuscriptBlock(ctx, text);
    const data = await runJSON(CONS_SYSTEM, user, CONS_SCHEMA, { signal, onText });
    let cursor = 0;
    const items = (data.items || []).map((it) => {
      const loc = locate(text, it.quote, offset, cursor);
      if (loc) cursor = loc.end - offset;
      return {
        ruleId: 'ai-cons', rule: 'AI設定チェック', category: 'AI', severity: it.severity || 'warning',
        start: loc ? loc.start : -1, end: loc ? loc.end : -1, text: loc ? loc.text : it.quote,
        message: it.problem + (it.setting ? `（設定：${it.setting}）` : ''),
        suggestion: it.suggestion && loc && loc.text === it.quote ? it.suggestion : null,
        rawSuggestion: it.suggestion || '', fixable: false, source: 'ai', key: 'ai|' + it.quote, found: !!loc,
      };
    });
    return { kind: 'cons', summary: data.summary || '', items, at: Date.now() };
  }

  async function ask(ctx, question, scope, signal, onText) {
    const sel = scope === 'selection' ? ctx.getSelection() : null;
    const text = sel ? sel.text : ctx.getText();
    const user = settingsBlock(ctx.project) + '\n\n' + manuscriptBlock(ctx, text) + '\n\n## 相談\n' + question;
    const params = baseParams(ASK_SYSTEM, user, 16000);
    return run(params, { signal, onText });
  }

  // ───── 執筆画面の AI タブ ─────
  const Panel = {};
  let running = null;

  Panel.render = function (ctx) {
    const wrap = h('div', { class: 'stack-sm ai-panel' });
    if (!getKey()) {
      wrap.appendChild(h('div', { class: 'empty' },
        icon('sparkles', 32),
        h('p', null, 'Claude（AI）による添削・設定矛盾チェック・相談が使えます。'),
        h('p', { class: 'small muted' }, '利用には Anthropic の APIキー が必要です（利用料は従量課金で、キーの持ち主に請求されます）。ルールベースの「添削」「設定チェック」タブはAIなしでも使えます。'),
        btn('APIキーを設定する', { icon: 'sliders', primary: true, onClick: () => openKeyDialog(() => ctx.rerender()) })));
      return wrap;
    }
    const chId = ctx.chapter.id;
    const sel = ctx.getSelection();
    let scope = sel ? 'selection' : 'all';
    const scopeRow = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '対象' },
      h('label', null, h('input', { type: 'radio', name: 'ai-scope', value: 'all', checked: scope === 'all', onchange: () => { scope = 'all'; } }), 'この話全体'),
      h('label', { class: sel ? '' : 'disabled' }, h('input', { type: 'radio', name: 'ai-scope', value: 'selection', disabled: !sel, checked: scope === 'selection', onchange: () => { scope = 'selection'; } }), sel ? `選択範囲（${sel.text.length}字）` : '選択範囲'));
    const status = h('div', { class: 'ai-status', hidden: !running });
    const resultBox = h('div', { class: 'ai-results' });

    const start = async (kind, question) => {
      if (running) return;
      const text = ctx.getText();
      if (!text.trim()) { toast('本文がありません'); return; }
      const controller = new AbortController();
      running = { controller, kind };
      setRunning(true);
      const onText = (snap) => { status.querySelector('.ai-progress').textContent = `受信中… ${snap.length}字`; };
      try {
        if (kind === 'ask') {
          answer.textContent = '';
          answerBox.hidden = false;
          const out = await ask(ctx, question, scope, controller.signal, (snap) => { answer.textContent = snap; });
          answer.textContent = out;
          results[chId + ':ask'] = { q: question, a: out };
        } else {
          const r = kind === 'proof'
            ? await proofread(ctx, scope, controller.signal, onText)
            : await checkConsistency(ctx, scope, controller.signal, onText);
          results[chId] = r;
          ctx.clearIssues();
          ctx.addIssues(r.items.filter((i) => i.found));
          renderResults();
          toast(r.items.length ? `${r.items.length}件の指摘がありました` : '指摘はありませんでした');
        }
      } catch (e) {
        toast(e.message, 'error');
        if (kind === 'ask') answer.textContent = '（エラー）' + e.message;
      } finally {
        running = null;
        setRunning(false);
      }
    };

    const setRunning = (on) => {
      status.hidden = !on;
      clear(status);
      if (on) {
        status.append(h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'ai-progress' }, 'AIが原稿を読んでいます…'),
          btn('中止', { small: true, ghost: true, onClick: () => running && running.controller.abort() }));
      }
      wrap.querySelectorAll('.ai-run').forEach((b) => { b.disabled = on; });
    };

    const renderResults = () => {
      clear(resultBox);
      const r = results[chId];
      if (!r) return;
      const text = ctx.getText();
      resultBox.appendChild(h('div', { class: 'ai-summary' },
        h('div', { class: 'ai-summary-head' }, icon('sparkles', 16), h('strong', null, r.kind === 'proof' ? 'AI添削の講評' : 'AI設定チェックの所見'),
          h('span', { class: 'muted small' }, UI.relTime(r.at))),
        h('p', null, r.summary || '—')));
      if (!r.items.length) { resultBox.appendChild(h('p', { class: 'muted small' }, '指摘はありませんでした。')); return; }
      r.items.forEach((it) => {
        const stillThere = it.found && text.slice(it.start, it.end) === it.text;
        resultBox.appendChild(h('div', { class: 'issue-card ai-card' + (stillThere ? '' : ' stale') },
          h('div', { class: 'issue-head' }, h('span', { class: 'sev-dot sev-' + it.severity }), h('span', { class: 'issue-rule' }, it.rule)),
          h('div', { class: 'issue-excerpt' }, h('mark', null, it.text)),
          h('div', { class: 'issue-msg' }, it.message),
          it.rawSuggestion ? h('div', { class: 'ai-suggest' }, h('span', { class: 'muted small' }, '修正案'), h('div', null, it.rawSuggestion)) : null,
          h('div', { class: 'issue-actions' },
            stillThere ? btn('該当箇所へ', { small: true, ghost: true, onClick: () => ctx.focusRange(it.start, it.end) }) : h('span', { class: 'muted small' }, it.found ? '本文が変更されました' : '本文中に見つかりません'),
            stillThere && it.suggestion != null ? btn('修正案を適用', { small: true, onClick: () => {
              ctx.apply(it);
              it.found = false;
              renderResults();
            } }) : null)));
      });
    };

    const question = h('textarea', { class: 'input', rows: 3, placeholder: '例：この話の展開に無理はない？／ラストを盛り上げるアイデアを3つ出して／セレナの台詞をもっと彼女らしくするには？' });
    const answer = h('div', { class: 'ai-answer' });
    const answerBox = h('div', { class: 'ai-answer-box', hidden: true }, answer);
    const prev = results[chId + ':ask'];
    if (prev) { question.value = prev.q; answer.textContent = prev.a; answerBox.hidden = false; }

    const st = settings();
    wrap.append(
      h('p', { class: 'small muted' }, `モデル：${(MODELS.find((m) => m[0] === st.aiModel) || MODELS[0])[1].replace(/（.*）/, '')}。本文と設定資料がAnthropicのAPIに送信されます。`),
      scopeRow,
      h('div', { class: 'grid-2' },
        btn('AIで添削', { icon: 'sparkles', primary: true, class: 'ai-run', onClick: () => start('proof') }),
        btn('AIで設定チェック', { icon: 'users', class: 'ai-run', onClick: () => start('cons') })),
      status,
      resultBox,
      h('h3', { class: 'panel-h' }, 'AIに相談'),
      question,
      h('div', { class: 'row' }, btn('相談する', { icon: 'feather', class: 'ai-run', onClick: () => {
        const q = question.value.trim();
        if (!q) { question.focus(); return; }
        start('ask', q);
      } }), btn('', { icon: 'sliders', ghost: true, small: true, title: 'AIの設定', onClick: () => openKeyDialog(() => ctx.rerender()) })),
      answerBox);
    renderResults();
    if (running) setRunning(true);
    return wrap;
  };

  function openKeyDialog(after) {
    const pane = Panel.settingsPane(() => { NS.App.saveSettings(); });
    UI.modal({ title: 'AIの設定', body: pane, wide: true, onClose: after });
  }

  /** 設定画面の「AI」タブ */
  Panel.settingsPane = function (changed) {
    const st = settings();
    const key = h('input', { class: 'input', type: 'password', value: getKey(), placeholder: 'sk-ant-…', autocomplete: 'off', 'aria-label': 'APIキー' });
    const show = h('input', { type: 'checkbox', onchange: (e) => { key.type = e.target.checked ? 'text' : 'password'; } });
    const model = h('select', { class: 'input', onchange: (e) => { st.aiModel = e.target.value; changed(); } },
      MODELS.map(([v, l]) => h('option', { value: v, selected: st.aiModel === v }, l)));
    const effort = h('select', { class: 'input', onchange: (e) => { st.aiEffort = e.target.value; changed(); } },
      [['low', '速さ優先'], ['medium', '標準'], ['high', '丁寧']].map(([v, l]) => h('option', { value: v, selected: (st.aiEffort || 'medium') === v }, l)));
    const testOut = h('span', { class: 'small muted' });
    return h('div', { class: 'stack' },
      h('p', { class: 'small muted' }, 'Anthropic の Claude を使ってAI添削・設定チェック・相談を行います。APIキーは Anthropic Console（console.anthropic.com）で発行できます。キーはこの端末のブラウザにだけ保存され、作品のバックアップには含まれません。共用のパソコンでは使い終わったら削除してください。'),
      UI.field('APIキー', h('div', { class: 'row' }, key, btn('保存', { primary: true, small: true, onClick: () => {
        const v = key.value.trim();
        if (v && !/^sk-/.test(v)) { toast('APIキーの形式が正しくないようです', 'error'); return; }
        setKey(v);
        toast(v ? 'APIキーを保存しました' : 'APIキーを削除しました');
      } }), btn('削除', { small: true, ghost: true, onClick: () => { setKey(''); key.value = ''; toast('APIキーを削除しました'); } }))),
      h('label', { class: 'check small' }, show, 'キーを表示'),
      h('div', { class: 'grid-2' }, UI.field('モデル', model), UI.field('考える深さ', effort)),
      h('div', { class: 'row' }, btn('接続テスト', { small: true, icon: 'check', onClick: async () => {
        if (key.value.trim() && key.value.trim() !== getKey()) setKey(key.value.trim());
        testOut.textContent = '確認中…';
        try {
          const params = baseParams('「OK」とだけ返してください。', 'テスト', 64);
          params.output_config.effort = 'low';
          const out = await run(params);
          testOut.textContent = '接続できました（応答：' + out.trim().slice(0, 20) + '）';
        } catch (e) {
          testOut.textContent = e.message;
        }
      } }), testOut));
  };

  NS.AI = { getKey, setKey, proofread, checkConsistency, ask, locate, MODELS };
  NS.AIPanel = Panel;
})(window.Tsuzuri = window.Tsuzuri || {});
