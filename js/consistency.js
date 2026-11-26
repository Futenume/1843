/*
 * 綴り — 設定矛盾チェック（ルールベース）
 * 設定資料（人物・場所・用語・世界観ルール）と本文を照らし合わせ、
 * 名前の表記ゆれ・一人称・呼び方・外見・年齢・退場後の登場・世界観NGワードなどを検出する。
 */
(function (NS) {
  'use strict';
  const T = NS.Text;

  const RULES = [
    { id: 'ng-word', name: '世界観NGワード', severity: 'warning', default: true, fix: true,
      desc: '設定資料の「世界観ルール」に登録した、作中に存在しない言葉を検出します。台詞は常に、地の文は語り手（一人称・三人称・神視点）に合わせてチェックします。' },
    { id: 'world', name: '世界観ルール（通貨・単位・暦・文明）', severity: 'warning', default: true, fix: true,
      desc: '設定資料の「世界観ルール」で決めた通貨・単位・暦・文明の水準に合わない言葉（メートル・〇円・月曜日・電話など）を検出し、この世界の言い方に換算した言い換えを提案します。' },
    { id: 'name-variant', name: '固有名詞の表記ゆれ', severity: 'error', default: true, fix: true,
      desc: '「斎藤／斉藤」「ヴァイス／バイス」など、登録名と表記が違う固有名詞を検出します。' },
    { id: 'first-person', name: '一人称の食い違い', severity: 'warning', default: true,
      desc: '台詞の話者を推定し、設定した一人称と違う一人称を検出します。' },
    { id: 'calls', name: '呼び方の食い違い', severity: 'info', default: true,
      desc: '人物同士の「呼び方」設定と違う呼び方をしている台詞を検出します。' },
    { id: 'appearance', name: '外見の食い違い（髪・瞳）', severity: 'warning', default: true,
      desc: '設定した髪色・瞳の色と違う描写を検出します。' },
    { id: 'age', name: '年齢の食い違い', severity: 'info', default: true,
      desc: '設定年齢と違う「〇歳」の表記を検出します。' },
    { id: 'timeline', name: '登場範囲の食い違い', severity: 'warning', default: true,
      desc: '退場（死亡）したはずの人物の発言や、初登場前の発言を検出します。' },
  ];
  const RULE_MAP = {};
  RULES.forEach((r) => { RULE_MAP[r.id] = r; });

  const HONORIFICS = ['お兄ちゃん', 'お姉ちゃん', '兄ちゃん', '姉ちゃん', '兄さん', '姉さん', 'にいさん', 'ねえさん', 'さん', 'くん', '君', 'ちゃん',
    '様', 'さま', '殿', 'どの', '先輩', '先生', 'せんせい', '氏', 'たん', 'っち', '兄', '姉', '卿', '嬢', '師匠', '陛下', '殿下', '閣下'];
  const RE_HONORIFIC = new RegExp('^(?:' + HONORIFICS.slice().sort((a, b) => b.length - a.length).map(T.escapeRegExp).join('|') + ')');

  // ───── 一人称 ─────
  const PRONOUN_FAMILIES = [
    { key: '俺様', forms: ['俺様', 'オレ様', 'おれ様'] },
    { key: '私', forms: ['私', 'わたし', 'ワタシ', 'わたくし', 'ワタクシ'] },
    { key: 'あたし', forms: ['あたし', 'アタシ'] },
    { key: 'あたい', forms: ['あたい', 'アタイ'] },
    { key: '僕', forms: ['僕', 'ぼく', 'ボク'] },
    { key: '俺', forms: ['俺', 'おれ', 'オレ'] },
    { key: '儂', forms: ['儂', 'わし', 'ワシ'] },
    { key: '我', forms: ['我', 'われ', 'ワレ'], weak: true },
    { key: '吾輩', forms: ['吾輩', '我輩', 'わがはい', 'ワガハイ'] },
    { key: '拙者', forms: ['拙者'] },
    { key: '某', forms: ['某', 'それがし'], weak: true },
    { key: '小生', forms: ['小生'] },
    { key: 'わらわ', forms: ['わらわ', '妾'] },
    { key: '余', forms: ['余'], weak: true },
    { key: '朕', forms: ['朕'] },
    { key: 'おいら', forms: ['おいら', 'オイラ'] },
    { key: 'うち', forms: ['うち', 'ウチ'], weak: true },
    { key: '自分', forms: ['自分'], weak: true },
  ];
  const PRONOUN_INDEX = {};
  PRONOUN_FAMILIES.forEach((f) => f.forms.forEach((form) => { PRONOUN_INDEX[form] = f; }));
  const FOLLOW = '(?=[はがのをにもとへでやっ、。！？!?…―─」』\\s\\u3000ねよさだ]|たち|達|ら|ども|$)';
  function pronounPattern(form) {
    let core;
    if (/^[一-鿿]/.test(form)) core = '(?<![\\u4E00-\\u9FFF々])' + form;
    else if (/^[ァ-ヴ]/.test(form)) core = '(?<![ァ-ヴー])' + form + '(?![ァ-ヴー])';
    else core = '(?<![ぁ-ん])' + form;
    if (form === '我') core += '(?!に返)';
    if (/様$/.test(form)) return core;
    return core + FOLLOW;
  }
  const RE_PRONOUN = new RegExp(
    Object.keys(PRONOUN_INDEX).sort((a, b) => b.length - a.length).map((f) => '(?:' + pronounPattern(f) + ')').join('|'),
    'g'
  );

  function parsePronounSetting(v) {
    const out = new Set();
    String(v || '').split(/[\/／、,，・\s　（）()]+/).forEach((tok) => {
      if (!tok) return;
      const fam = PRONOUN_INDEX[tok];
      if (fam) out.add(fam.key);
      else out.add('raw:' + tok);
    });
    return out;
  }

  // ───── 色 ─────
  const COLORS = [
    ['黒', ['漆黒', '真っ黒', '黒', 'ブラック', '濡れ羽', '濡羽', '烏羽']],
    ['白', ['純白', '真っ白', '白', 'ホワイト', '雪色']],
    ['銀', ['白銀', '銀', 'シルバー', 'プラチナ']],
    ['金', ['黄金', '金', 'こがね', 'ブロンド', 'ゴールド', '蜂蜜色', 'はちみつ色']],
    ['茶', ['焦げ茶', 'こげ茶', '茶', '栗色', '亜麻色', '鳶色', 'とび色', 'ブラウン', '褐色', '胡桃色']],
    ['赤', ['真紅', '深紅', '紅', '赤', '朱', '緋', '茜', '臙脂', 'ワインレッド', 'レッド', 'ルビー', '紅玉']],
    ['青', ['群青', '紺碧', '紺', '藍', '蒼', '青', '碧', '空色', '水色', '瑠璃', 'サファイア', 'ブルー', 'アクアマリン']],
    ['緑', ['翡翠', '翠', '緑', '碧', 'エメラルド', '若草', '新緑', 'グリーン', '深緑', '萌黄']],
    ['紫', ['紫', '菫', 'すみれ色', '藤色', 'アメジスト', 'バイオレット', 'パープル', '葡萄色', 'ラベンダー']],
    ['灰', ['灰', '鈍色', '鼠色', 'グレー', 'グレイ', '鉛色']],
    ['桃', ['桃色', '桜色', 'ピンク', '薄紅', '珊瑚']],
    ['黄', ['黄', '山吹', 'レモン色', 'イエロー']],
    ['琥珀', ['琥珀', 'アンバー', '鼈甲', 'べっこう']],
    ['橙', ['橙', 'オレンジ', '蜜柑色', '柑子色']],
  ];
  const COLOR_WORDS = {};
  COLORS.forEach(([g, words]) => words.forEach((w) => {
    (COLOR_WORDS[w] = COLOR_WORDS[w] || new Set()).add(g);
  }));
  const RE_COLOR = new RegExp(Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length).map(T.escapeRegExp).join('|'), 'g');
  const COLOR_EXCLUDE = ['金属', '金具', '金貨', '金額', '金庫', '金銭', '金曜', 'お金', '青年', '青春', '赤ん', '紅茶', 'お茶', '喫茶', '抹茶',
    '茶碗', '茶屋', '茶会', '緑茶', '白紙', '白状', '白昼', '黒幕', '灰皿', '黄昏', '真っ赤な嘘', '赤の他人', '白黒', '紺色の制服'];
  const COMPAT = [['白', '銀'], ['金', '黄'], ['琥珀', '金'], ['琥珀', '茶'], ['琥珀', '橙'], ['黒', '灰']];
  function colorGroupsIn(s) {
    const out = new Set();
    RE_COLOR.lastIndex = 0;
    let m;
    while ((m = RE_COLOR.exec(s)) !== null) COLOR_WORDS[m[0]].forEach((g) => out.add(g));
    return out;
  }
  function compatible(found, setting) {
    for (const f of found) {
      if (setting.has(f)) return true;
      for (const [x, y] of COMPAT) {
        if ((f === x && setting.has(y)) || (f === y && setting.has(x))) return true;
      }
    }
    return false;
  }

  // ───── 異体字・誤変換しやすい字 ─────
  const KANJI_VARIANTS = {
    '斎': '斉齋齊', '斉': '斎齋齊', '齋': '斎斉', '辺': '邊邉', '邊': '辺邉', '邉': '辺邊', '沢': '澤', '澤': '沢',
    '浜': '濱', '濱': '浜', '島': '嶋嶌', '嶋': '島', '崎': '﨑嵜碕', '﨑': '崎', '高': '髙', '髙': '高', '竜': '龍', '龍': '竜',
    '桜': '櫻', '櫻': '桜', '国': '國', '國': '国', '広': '廣', '廣': '広', '真': '眞', '眞': '真', '恵': '惠', '惠': '恵',
    '栄': '榮', '実': '實', '寿': '壽', '徳': '德', '富': '冨', '冨': '富', '藤': '籐', '籐': '藤', '堀': '掘', '掘': '堀',
    '瀬': '瀨', '祐': '佑裕', '佑': '祐裕', '裕': '祐佑', '輔': '介助', '介': '輔助', '助': '介輔', '弥': '彌', '彌': '弥',
    '遥': '遙', '遙': '遥', '凛': '凜', '凜': '凛', '剣': '劍剱劔', '黒': '黑', '円': '圓', '亜': '亞', '智': '知', '知': '智',
    '奈': '菜那', '菜': '奈', '那': '奈', '綾': '彩', '彩': '綾', '涼': '凉', '晃': '光', '光': '晃', '伸': '信', '信': '伸',
    '一': '壱', '壱': '一', '嵐': '蘭', '蘭': '嵐', '響': '晌', '沙': '紗砂', '紗': '沙', '玲': '怜', '怜': '玲', '陽': '暘',
  };

  function normKana(s) {
    return s.replace(/ヴァ/g, 'バ').replace(/ヴィ/g, 'ビ').replace(/ヴェ/g, 'ベ').replace(/ヴォ/g, 'ボ').replace(/ヴ/g, 'ブ')
      .replace(/[ァィゥェォャュョヮ]/g, (c) => ({ 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ' }[c]))
      .replace(/[ー・＝=\s　ッ]/g, '').replace(/ヂ/g, 'ジ').replace(/ヅ/g, 'ズ');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (Math.abs(m - n) > 2) return 3;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  const LOANWORDS = new Set(('ドア テーブル ベッド カーテン コーヒー ミルク パン ケーキ チョコ チョコレート ジュース ビール ワイン グラス カップ スプーン フォーク ナイフ ' +
    'テレビ ラジオ スマホ スマートフォン パソコン メール メッセージ ニュース ゲーム アニメ マンガ カメラ ノート ペン ボールペン シャツ スカート ズボン コート ' +
    'ジャケット セーター ブーツ スニーカー ポケット バッグ カバン リュック ハンカチ タオル シャワー トイレ キッチン リビング ソファ ソファー クッション ランプ ' +
    'ライト スイッチ エレベーター ビル マンション アパート ホテル レストラン カフェ コンビニ スーパー デパート バス タクシー トラック バイク ボート ' +
    'ホーム ベンチ ポスト ページ メモ リスト データ システム プログラム コンピュータ コンピューター エネルギー パワー スピード タイミング チャンス ピンチ ' +
    'ミス リズム メロディ メロディー ピアノ ギター ドラム ダンス スポーツ サッカー テニス ボール チーム メンバー クラス グループ リーダー キャプテン ' +
    'マネージャー スタッフ サービス イベント パーティー パーティ プレゼント カード チケット ポイント レベル スキル ステータス モンスター ドラゴン スライム ' +
    'ゴブリン オーク エルフ ドワーフ ギルド クエスト ダンジョン アイテム ポーション スクロール ソード シールド アーマー マジック ゴーレム ヒーロー ヒロイン ' +
    'ストーリー シーン ラスト スタート ゴール ライン ルール ゲート ドラマ ファン アイドル プロ イメージ ショック ストレス トラブル プレッシャー ペース ' +
    'ルート コース エリア ゾーン スペース サイズ カラー ピンク オレンジ グレー ブルー グリーン レッド ホワイト ブラック ゴールド シルバー ブラウン ' +
    'ハート キス デート ジョーク センス マナー ルーム ベランダ フロア ロビー カウンター ガラス プラスチック コンクリート ロープ チェーン ハンマー ' +
    'アクセサリー ネックレス ピアス リボン スカーフ マスク メガネ サングラス ヘルメット タバコ ライター ガス エンジン ハンドル ブレーキ タイヤ ' +
    'シート ベルト ロック キー ネット インターネット サイト アプリ ボタン ウィンドウ モニター スクリーン ポスター ステージ ライブ コンサート ショー ' +
    'チャイム ベル サイレン アラーム ノック カーペット マット パジャマ シーツ クローゼット ナイト モード タイプ ケース パターン ポーズ サイン ' +
    'ストップ ジャンプ ダメージ ヒット ミッション ターゲット チェック セット ピース マップ ルーン ブレス ブレード ランク ギア ハンター ソロ ペア ' +
    'ウイルス ワクチン ベテラン ゲスト ホスト オーナー マスター ボス プリンセス プリンス クイーン キング ナイフ ピストル ライフル スナイパー ' +
    'シャッター ガード タワー ホール ロビー トンネル ルーキー ジム プール ビーチ リゾート テント キャンプ ハイキング ランチ ディナー スープ サラダ ' +
    'ステーキ パスタ ピザ アイス クッキー キャンディ チーズ バター ソース ハム ソーセージ ベーコン トマト レモン メロン バナナ リンゴ イチゴ').split(/\s+/));

  function isKatakana(s) {
    return /^[ァ-ヴー・]+$/.test(s);
  }

  /** 設定資料から名前の索引を作る */
  /** 世界観ルールのお金を、用語として名前の一覧に加える（表記ゆれの検出・未登録の候補から外すため） */
  function coinEntries(rules, entries) {
    const units = rules && rules.currency && rules.currency.units;
    if (!units || !units.length) return [];
    const have = new Set((entries || []).map((e) => e && e.name));
    return units.filter((u) => u && u.name && u.name.trim().length >= 2 && !have.has(u.name.trim())).map((u, i) => ({
      id: 'coin-' + i, type: 'term', name: u.name.trim(), reading: u.reading || '', aliases: [], fields: { kind: 'お金' }, custom: [], relations: [], appear: {}, notes: '', virtual: true,
    }));
  }

  function buildNameIndex(entries) {
    const forms = new Map(); // form -> [entryId]
    const byId = {};
    (entries || []).forEach((e) => {
      if (!e || !e.name) return;
      byId[e.id] = e;
      const set = new Set();
      const full = e.name.trim();
      const compact = full.replace(/[\s　]/g, '');
      if (compact) set.add(compact);
      const parts = full.split(/[\s　・＝=]+/).filter(Boolean);
      // 姓・名に分けた形も登録（1文字の名は漢字のみ。前後が漢字でない場合だけ一致させる）
      if (parts.length > 1) parts.forEach((p) => { if (p.length >= 2 || /^[\u4E00-\u9FFF々]$/.test(p)) set.add(p); });
      if (/・|＝/.test(compact)) set.add(compact.replace(/[・＝=]/g, ''));
      (e.aliases || []).forEach((al) => {
        const a2 = String(al || '').trim();
        if (a2) set.add(a2.replace(/[\s　]/g, ''));
      });
      set.forEach((f) => {
        if (!forms.has(f)) forms.set(f, []);
        if (forms.get(f).indexOf(e.id) < 0) forms.get(f).push(e.id);
      });
    });
    const list = Array.from(forms.keys()).sort((a, b) => b.length - a.length);
    let re = null;
    if (list.length) {
      re = new RegExp(list.map((f) => {
        const ef = T.escapeRegExp(f);
        if (isKatakana(f)) return '(?<![ァ-ヴー])' + ef + '(?![ァ-ヴー])';
        if (/^[ぁ-ん]+$/.test(f)) return '(?<![ぁ-ん])' + ef + '(?=[はがのをにもとへでやっさくちねよ、。！？!?…」』\\s\\u3000]|$)';
        if (f.length === 1) return '(?<![\\u4E00-\\u9FFF々])' + ef + '(?![\\u4E00-\\u9FFF々])';
        return ef;
      }).join('|'), 'g');
    }
    const normKanaMap = new Map();
    list.forEach((f) => { if (isKatakana(f) && !normKanaMap.has(normKana(f))) normKanaMap.set(normKana(f), f); });
    return { forms, list, re, byId, normKanaMap };
  }

  function findMentions(masked, index) {
    const out = [];
    if (!index.re) return out;
    index.re.lastIndex = 0;
    let m;
    while ((m = index.re.exec(masked)) !== null) {
      const ids = index.forms.get(m[0]) || [];
      out.push({ start: m.index, end: m.index + m[0].length, form: m[0], ids, entryId: ids.length === 1 ? ids[0] : null });
    }
    return out;
  }

  /** 名前の後ろの敬称を含めた終端と、その直後の文字 */
  function afterName(masked, end) {
    const rest = masked.slice(end, end + 8);
    const h = rest.match(RE_HONORIFIC);
    const e2 = end + (h ? h[0].length : 0);
    return { end: e2, next: masked[e2] || '', honorific: h ? h[0] : '' };
  }

  // 設定資料にない「別の主語」（彼女が・少年は・僕が など）。これが間にあると、話者を名前から推定しない
  const RE_OTHER_SUBJECT = /(?:彼女|彼|あいつ|こいつ|そいつ|奴|やつ|少女|少年|男|女|老人|老婆|子供|子ども|誰か|皆|みんな|二人|全員|俺|僕|私|わたし|あたし|おれ|ぼく|自分)(?:たち|達|ら)?[はがも]/;

  /** 台詞の話者を推定する */
  function attributeSpeakers(a, mentions) {
    const m = a.masked;
    const out = [];
    const narrMentions = mentions.filter((x) => !a.inDialogue[x.start] && x.entryId);
    a.dialogues.forEach((d, di) => {
      const para = a.paragraphs[d.para];
      let prevEnd = para.start;
      for (let k = di - 1; k >= 0; k--) {
        if (a.dialogues[k].para !== d.para) break;
        prevEnd = a.dialogues[k].end;
        break;
      }
      let speaker = null;
      let method = null;
      // (a) 台本形式：太郎「……」
      const beforeTrim = m.slice(prevEnd, d.start).replace(/[\s　:：]/g, '');
      const pre = narrMentions.filter((x) => x.start >= prevEnd && x.end <= d.start);
      if (beforeTrim && pre.length === 1 && beforeTrim === pre[0].form) {
        speaker = pre[0].entryId;
        method = 'prefix';
      }
      // (b) 台詞の後：「……」と太郎は言った
      if (!speaker && d.closed) {
        let stop = para.end;
        const nextQ = m.slice(d.end, para.end).search(/[「『]/);
        if (nextQ >= 0) stop = Math.min(stop, d.end + nextQ);
        const nextP = m.slice(d.end, para.end).search(/。/);
        if (nextP >= 0) stop = Math.min(stop, d.end + nextP + 1);
        const after = m.slice(d.end, stop);
        if (/^(?:と|って|、と|とだけ|という)/.test(after)) {
          const cands = narrMentions.filter((x) => x.start >= d.end && x.start < d.end + 24 && x.end <= stop);
          for (const c of cands) {
            // 「……」と彼女が言うと、太郎は頷いた → 話者は太郎ではない
            if (RE_OTHER_SUBJECT.test(m.slice(d.end, c.start))) break;
            const an = afterName(m, c.end);
            if (/[はがも]/.test(an.next)) { speaker = c.entryId; method = 'after'; break; }
          }
        }
      }
      // (c) 台詞の前の地の文：太郎は振り返った。「……」
      if (!speaker) {
        const cands = narrMentions.filter((x) => x.start >= Math.max(prevEnd, d.start - 60) && x.end <= d.start);
        for (let k = cands.length - 1; k >= 0; k--) {
          const an = afterName(m, cands[k].end);
          if (/[はがも]/.test(an.next)) {
            // 太郎が言いかけたとき、彼女が「……」 → 話者は太郎ではない
            if (!RE_OTHER_SUBJECT.test(m.slice(an.end + 1, d.start))) { speaker = cands[k].entryId; method = 'before'; }
            break;
          }
        }
      }
      // (d) 台詞だけの行の次の行：「……」↵　太郎は呆れたように言った。
      if (!speaker && d.closed && !m.slice(d.end, para.end).replace(/[\s　]/g, '') && d.para + 1 < a.paragraphs.length) {
        const np = a.paragraphs[d.para + 1];
        const lead = m.slice(np.start, np.end).match(/^[\s　]*/)[0].length;
        const c = narrMentions.find((x) => x.start === np.start + lead);
        if (c) {
          const an = afterName(m, c.end);
          const rest = m.slice(an.end + 1, Math.min(np.end, an.end + 24));
          if (/[はが]/.test(an.next) && !/[「『]/.test(rest.split(/[。]/)[0]) && RE_SPEECH_VERB.test(rest.split(/[。]/)[0])) { speaker = c.entryId; method = 'next'; }
        }
      }
      // (e) 台詞で始まる行の前の行（地の文だけ）の最後の文の主語：太郎は窓の外を見た。↵「……」
      if (!speaker && !m.slice(para.start, d.start).replace(/[\s　]/g, '') && d.para > 0) {
        const pp = a.paragraphs[d.para - 1];
        const hasDialogue = a.dialogues.some((x) => x.para === d.para - 1);
        if (!hasDialogue && pp.end > pp.start) {
          // 行の中で最後に「名前は／名前が」で始まる文を探し、その後に別の主語が出てこなければ、その人物を話者とみなす
          const sents = a.sentences.filter((x) => x.para === d.para - 1);
          for (let k = sents.length - 1; k >= 0; k--) {
            const st = sents[k];
            const lead = m.slice(st.start, st.end).match(/^[\s　]*/)[0].length;
            const c = narrMentions.find((x) => x.start === st.start + lead);
            if (!c) continue;
            const an = afterName(m, c.end);
            if (!/[はが]/.test(an.next)) break;
            const rest = m.slice(an.end + 1, pp.end);
            const otherName = narrMentions.some((x) => x.start > an.end && x.end <= pp.end && x.entryId !== c.entryId && /[はがも]/.test(afterName(m, x.end).next));
            if (!RE_OTHER_SUBJECT.test(rest) && !otherName) { speaker = c.entryId; method = 'context'; }
            break;
          }
        }
      }
      if (speaker) out.push({ start: d.start, end: d.end, innerStart: d.innerStart, innerEnd: d.innerEnd, entryId: speaker, method });
    });
    return out;
  }
  const RE_SPEECH_VERB = /(?:言[っうい]|答え|応え|叫|呟|つぶや|返し|返す|尋ね|訊|聞き返|怒鳴|囁|ささや|笑っ|微笑|続け|告げ|促し|頷|うなず|ぼやい|漏ら|吐き捨て)/;

  function sentenceAt(a, pos) {
    // 二分探索
    let lo = 0;
    let hi = a.sentences.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = a.sentences[mid];
      if (pos < s.start) hi = mid - 1;
      else if (pos >= s.end) lo = mid + 1;
      else return s;
    }
    return null;
  }

  function splitList(v) {
    return String(v || '').split(/[\/／、,，]+/).map((s) => s.trim()).filter(Boolean);
  }

  function parseAgeSetting(v) {
    const nums = (String(v || '').match(/[0-9０-９]+|[一二三四五六七八九十百]+/g) || []).map(T.parseJaNumber).filter((n) => !isNaN(n));
    if (!nums.length) return null;
    return { min: Math.min.apply(null, nums), max: Math.max.apply(null, nums) };
  }

  // ───── 語り手（地の文の視点） ─────
  const NARRATORS = {
    auto: '自動（本文から判定）',
    first: '一人称（作中の人物が語る）',
    third: '三人称・一元視点（作中の人物に寄り添って語る）',
    omniscient: '三人称・神視点（作品の外から語る）',
  };
  const NARRATOR_SHORT = { first: '一人称', third: '三人称（一元視点）', omniscient: '神視点' };
  // 地の文の一人称（「私立」「僕ら」などの語の一部は除く）
  const RE_NARR_FP = /(私|わたし|あたし|僕|ぼく|俺|おれ|オレ|儂|わし|拙者|我輩|吾輩)(?=[はがもをにへとのやでだっ、。…―]|たち|達|ら[はがもをにのと、])/g;

  /** 地の文に一人称がよく出てくるかで、一人称の語りかどうかを判定する */
  function detectNarrator(text, analyzed) {
    const a = analyzed || T.analyze(text || '');
    const m = a.masked;
    let count = 0;
    let narrChars = 0;
    const words = {};
    for (let i = 0; i < m.length; i++) if (!a.inDialogue[i] && !/\s/.test(m[i])) narrChars++;
    RE_NARR_FP.lastIndex = 0;
    let mm;
    while ((mm = RE_NARR_FP.exec(m)) !== null) {
      if (a.inDialogue[mm.index]) continue;
      // 「私立」「僕の」などの直前が漢字の語（「公私」など）は数えない
      if (mm.index > 0 && /[一-龠々]/.test(m[mm.index - 1]) && mm[1] === '私') continue;
      count++;
      words[mm[1]] = (words[mm[1]] || 0) + 1;
    }
    const per1000 = narrChars ? (count * 1000) / narrChars : 0;
    const first = count >= 2 && per1000 >= 1.2;
    let top = '';
    Object.keys(words).forEach((w) => { if (!top || words[w] > words[top]) top = w; });
    return { kind: first ? 'first' : 'third', count, pronoun: top, narrChars };
  }

  /**
   * 設定との矛盾をチェックする。
   * @param {string} text 本文
   * @param {object} ctx { entries, rules:{ng:[{word,reason,suggestion,scope}]}, chapterNo, enabled:{id:bool}, ignore:Set,
   *                       narrator:'auto'|'first'|'third'|'omniscient'（地の文の語り手） }
   */
  function check(text, ctx) {
    ctx = ctx || {};
    const enabled = (id) => (ctx.enabled && Object.prototype.hasOwnProperty.call(ctx.enabled, id) ? !!ctx.enabled[id] : RULE_MAP[id].default);
    const a = T.analyze(text || '');
    const m = a.masked;
    const entries = (ctx.entries || []).concat(coinEntries(ctx.rules, ctx.entries));
    const index = ctx.index || buildNameIndex(entries);
    const mentions = findMentions(m, index);
    const issues = [];
    const add = (ruleId, start, end, message, suggestion, extra) => {
      const r = RULE_MAP[ruleId];
      issues.push(Object.assign({
        ruleId, rule: r.name, category: '設定', severity: r.severity, start, end,
        text: text.slice(start, end), message, suggestion: suggestion == null ? null : suggestion,
        fixable: suggestion != null && !!r.fix, source: 'consistency',
      }, extra || {}));
    };
    const nameOf = (id) => (index.byId[id] ? index.byId[id].name : '？');

    // 語り手
    const narrSetting = NARRATORS[ctx.narrator] ? ctx.narrator : 'auto';
    const detected = narrSetting === 'auto' ? detectNarrator(text, a) : null;
    const narrator = { setting: narrSetting, effective: detected ? detected.kind : narrSetting, detected };

    // 台詞は常に。地の文は「範囲」と語り手しだい（NGワードと世界観ルールで共通）
    const levelAt = (pos, scope) => {
      const inDlg = !!a.inDialogue[pos];
      if (inDlg) return { severity: 'warning', note: '（台詞）', inDlg };
      if (scope === 'all') return { severity: 'warning', note: '（地の文）', inDlg };
      if (scope === 'dialogue') return null;
      if (narrator.effective === 'first') return { severity: 'warning', note: detected ? `（一人称「${detected.pronoun}」の語りの地の文）` : '（一人称の語りの地の文）', inDlg };
      if (narrator.effective === 'third') return { severity: 'info', note: '（三人称の地の文。視点人物に寄り添う語りなら言い換えを。作品の外から語る神視点なら、語り手を「神視点」にするとこの指摘は出ません）', inDlg };
      return null;
    };

    // 世界観NGワード
    const ngRanges = [];
    if (enabled('ng-word')) {
      ((ctx.rules && ctx.rules.ng) || []).forEach((r) => {
        if (!r || !r.word) return;
        const scope = r.scope === 'all' || r.scope === 'dialogue' ? r.scope : 'auto';
        const re = new RegExp(T.escapeRegExp(r.word), 'g');
        const base = `世界観NGワード「${r.word}」${r.reason ? '：' + r.reason : ''}${r.suggestion ? `（言い換え例：「${r.suggestion}」）` : ''}`;
        let mm;
        while ((mm = re.exec(m)) !== null) {
          const lv = levelAt(mm.index, scope);
          if (!lv) continue;
          ngRanges.push([mm.index, mm.index + mm[0].length]);
          add('ng-word', mm.index, mm.index + mm[0].length, base + lv.note, r.suggestion || null, { severity: lv.severity, inDialogue: lv.inDlg });
        }
      });
    }

    // 世界観ルール（通貨・単位・暦と時刻・文明の水準・外来語）
    if (enabled('world') && NS.WorldRules && ctx.rules && NS.WorldRules.active(ctx.rules)) {
      NS.WorldRules.scan(m, ctx.rules, { names: index.list }).forEach((f) => {
        if (ngRanges.some(([s0, e0]) => f.start < e0 && f.end > s0)) return; // NGワードと同じ所は1つにまとめる
        const lv = levelAt(f.start, f.scope);
        if (!lv) return;
        const severity = f.severity === 'info' || lv.severity === 'info' ? 'info' : 'warning';
        add('world', f.start, f.end, f.message + (f.scope === 'all' && !lv.inDlg ? '' : lv.note), f.suggestion, { severity, inDialogue: lv.inDlg, worldKind: f.kind });
      });
    }

    // 固有名詞の表記ゆれ
    if (enabled('name-variant') && index.list.length) {
      const registered = new Set(index.list);
      const seenVariant = new Set();
      index.list.forEach((form) => {
        if (isKatakana(form)) return;
        const chars = Array.from(form);
        chars.forEach((c, i) => {
          const vs = KANJI_VARIANTS[c];
          if (!vs) return;
          Array.from(vs).forEach((v) => {
            const variant = chars.slice(0, i).concat([v], chars.slice(i + 1)).join('');
            if (registered.has(variant) || seenVariant.has(variant)) return;
            seenVariant.add(variant);
            let pos = m.indexOf(variant);
            while (pos >= 0) {
              add('name-variant', pos, pos + variant.length,
                `「${variant}」は設定資料では「${form}」と表記されています`, form, { entryId: (index.forms.get(form) || [])[0] });
              pos = m.indexOf(variant, pos + variant.length);
            }
          });
        });
      });
      // カタカナ名
      const runs = {};
      const reRun = /[ァ-ヴ][ァ-ヴー・]{2,}/g;
      let mm;
      while ((mm = reRun.exec(m)) !== null) {
        (runs[mm[0]] = runs[mm[0]] || []).push(mm.index);
      }
      Object.keys(runs).forEach((run) => {
        if (registered.has(run)) return;
        const nk = normKana(run);
        const exact = index.normKanaMap.get(nk);
        if (exact && exact !== run) {
          runs[run].forEach((pos) => add('name-variant', pos, pos + run.length,
            `「${run}」は設定資料では「${exact}」と表記されています`, exact, { severity: 'warning', entryId: (index.forms.get(exact) || [])[0] }));
          return;
        }
        // 似た名前（誤字の可能性）
        if (run.length < 4 || runs[run].length >= 3 || LOANWORDS.has(run)) return;
        // 登録名の前方一致・後方一致（「アレン」→「アレンス」等）は別名の可能性が高いので除外
        for (const [nf, form] of index.normKanaMap) {
          if (form.length < 4) continue;
          if (run.indexOf(form) >= 0 || form.indexOf(run) >= 0) continue;
          if (levenshtein(nk, nf) === 1) {
            runs[run].forEach((pos) => add('name-variant', pos, pos + run.length,
              `「${run}」は登録名「${form}」の誤字ではありませんか？`, form, { severity: 'info', entryId: (index.forms.get(form) || [])[0] }));
            break;
          }
        }
      });
    }

    // 話者推定
    const speakers = attributeSpeakers(a, mentions);

    speakers.forEach((sp) => {
      const e = index.byId[sp.entryId];
      if (!e) return;
      const f = e.fields || {};
      const inner = m.slice(sp.innerStart, sp.innerEnd).replace(/『[^』]*』/g, (s) => T.FILLER.repeat(s.length));
      const methodNote = '（推定話者）';
      // 前の行の主語から推定したもの（確度が低い）は控えめに出す
      const weakSev = sp.method === 'context' ? { severity: 'info' } : {};

      // 一人称
      if (enabled('first-person') && f.firstPerson && f.firstPerson.trim()) {
        const allowed = parsePronounSetting(f.firstPerson);
        RE_PRONOUN.lastIndex = 0;
        let pm;
        while ((pm = RE_PRONOUN.exec(inner)) !== null) {
          const fam = PRONOUN_INDEX[pm[0]];
          if (!fam) continue;
          const pos = sp.innerStart + pm.index;
          if (allowed.has(fam.key)) {
            // 同じ一人称で表記違い（俺／オレ）
            const rawForms = Array.from(allowed).filter((x) => x.indexOf('raw:') !== 0);
            const settingForms = splitList(f.firstPerson.replace(/[\s　・]/g, '/'));
            if (settingForms.length && settingForms.indexOf(pm[0]) < 0 && rawForms.length) {
              const same = settingForms.find((sf) => PRONOUN_INDEX[sf] === fam);
              if (same) {
                add('first-person', pos, pos + pm[0].length,
                  `${e.name}${methodNote}の一人称は設定では「${same}」です（表記ゆれ：「${pm[0]}」）`, same,
                  { severity: 'info', entryId: e.id });
              }
            }
            continue;
          }
          if (fam.weak) continue;
          add('first-person', pos, pos + pm[0].length,
            `${e.name}${methodNote}の一人称は設定では「${f.firstPerson}」ですが、「${pm[0]}」が使われています`, null,
            Object.assign({ entryId: e.id }, weakSev));
        }
      }

      // 呼び方
      if (enabled('calls') && Array.isArray(e.relations)) {
        e.relations.forEach((rel) => {
          if (!rel || !rel.targetId || !rel.calls) return;
          const calls = splitList(rel.calls);
          if (!calls.length) return;
          mentions.forEach((mt) => {
            if (mt.start < sp.innerStart || mt.end > sp.innerEnd) return;
            if (mt.entryId !== rel.targetId) return;
            const an = afterName(m, mt.end);
            const said = m.slice(mt.start, an.end);
            if (calls.indexOf(said) >= 0) return;
            if (calls.some((c) => c.length > said.length && m.slice(mt.start, mt.start + c.length) === c)) return;
            add('calls', mt.start, an.end,
              `設定では${e.name}は${nameOf(rel.targetId)}を「${calls.join('／')}」と呼びます（本文：「${said}」）${methodNote}`,
              calls[0], Object.assign({ entryId: e.id, fixable: false }, weakSev));
          });
        });
      }

      // 登場範囲
      if (enabled('timeline') && ctx.chapterNo && e.appear) {
        const until = parseInt(e.appear.until, 10);
        const from = parseInt(e.appear.from, 10);
        if (until && ctx.chapterNo > until) {
          add('timeline', sp.start, sp.end,
            `${e.name}は第${until}話で${e.appear.reason || '退場'}していますが、第${ctx.chapterNo}話で発言しています${methodNote}`, null,
            { entryId: e.id });
        } else if (from && ctx.chapterNo < from) {
          add('timeline', sp.start, sp.end,
            `${e.name}の初登場は第${from}話の設定ですが、第${ctx.chapterNo}話で発言しています${methodNote}`, null,
            { severity: 'info', entryId: e.id });
        }
      }
    });

    // 外見（髪・瞳）
    if (enabled('appearance')) checkAppearance(a, mentions, index, add);
    // 年齢
    if (enabled('age')) checkAge(a, mentions, index, add);

    const out = [];
    const seen = new Set();
    issues.sort((x, y) => x.start - y.start || y.end - x.end).forEach((it) => {
      const k = it.ruleId + ':' + it.start + ':' + it.end;
      if (seen.has(k)) return;
      seen.add(k);
      it.key = it.ruleId + '|' + it.text;
      if (ctx.ignore && ctx.ignore.has && ctx.ignore.has(it.key)) return;
      out.push(it);
    });

    return {
      issues: out,
      speakers: speakers.map((s) => Object.assign({ name: nameOf(s.entryId) }, s)),
      mentions,
      candidates: findCandidates(m, index),
      narrator,
    };
  }

  function nearestCharacter(mentions, index, from, to, pos) {
    let best = null;
    mentions.forEach((mt) => {
      if (!mt.entryId || mt.start < from || mt.end > to) return;
      const e = index.byId[mt.entryId];
      if (!e || e.type !== 'character') return;
      if (mt.end <= pos) {
        if (!best || best.after || mt.end > best.mt.end) best = { mt, after: false };
      } else if (!best) {
        if (mt.start - pos < 24) best = { mt, after: true };
      }
    });
    return best ? best.mt : null;
  }

  function checkAppearance(a, mentions, index, add) {
    const m = a.masked;
    const parts = [
      { field: 'hair', label: '髪', re: /髪|ヘア|赤毛|毛先/g },
      { field: 'eyes', label: '瞳', re: /瞳|双眸|眸|眼(?![鏡差前下中科力球光])|目(?![的標指覚立線安撃印次録上下玉頭元配処盛尻])/g },
    ];
    parts.forEach((part) => {
      part.re.lastIndex = 0;
      let km;
      while ((km = part.re.exec(m)) !== null) {
        const kw = km[0];
        const kwStart = km.index;
        const kwEnd = kwStart + kw.length;
        const s = sentenceAt(a, kwStart);
        if (!s) continue;
        const sent = m.slice(s.start, s.end);
        if (/染め|染ま|ウィッグ|かつら|カツラ|変装|カラコン|コンタクト|白髪(?:交じ|まじ|が増)|幻|夢の中|見間違/.test(sent)) continue;
        let found = null;
        let foundStart = -1;
        if (kw === '赤毛') { found = new Set(['赤']); foundStart = kwStart; }
        const strict = kw === '目' || kw === '眼';
        if (!found) {
          const winStart = Math.max(s.start, kwStart - (strict ? 6 : 10));
          const win = m.slice(winStart, kwStart);
          let last = null;
          RE_COLOR.lastIndex = 0;
          let cm;
          while ((cm = RE_COLOR.exec(win)) !== null) last = { w: cm[0], i: cm.index };
          if (last) {
            const tail = win.slice(last.i + last.w.length);
            const ok = strict ? /^(?:色)?(?:の|い|な)?$/.test(tail) : !/[、。」』]/.test(tail);
            if (ok) { found = COLOR_WORDS[last.w]; foundStart = winStart + last.i; }
          }
        }
        if (!found && !strict) {
          const after = m.slice(kwEnd, Math.min(s.end, kwEnd + 12));
          const am = after.match(/^(?:の色)?[はがも]、?/);
          if (am) {
            const rest = after.slice(am[0].length);
            RE_COLOR.lastIndex = 0;
            const cm = RE_COLOR.exec(rest);
            if (cm && cm.index <= 4 && !/^(?:では|じゃ)な/.test(rest.slice(cm.index + cm[0].length).replace(/^色/, ''))) {
              found = COLOR_WORDS[cm[0]];
              foundStart = kwEnd + am[0].length + cm.index;
            }
          }
        }
        if (!found) continue;
        // 慣用句・別の意味の除外
        const ctxStr = m.slice(Math.max(0, foundStart - 2), Math.min(m.length, kwEnd + 4));
        if (COLOR_EXCLUDE.some((x) => ctxStr.indexOf(x) >= 0)) continue;
        if (part.field === 'eyes') {
          if (/白い目で|白目|目を白黒|目の前が真っ|色目/.test(m.slice(Math.max(0, foundStart - 2), kwEnd + 4))) continue;
          if (found.has('赤') && /泣|涙|充血|寝不足|腫ら|擦/.test(sent)) continue;
        }
        const ch = nearestCharacter(mentions, index, s.start, s.end, Math.min(foundStart, kwStart));
        if (!ch) continue;
        const e = index.byId[ch.entryId];
        const setting = e.fields && e.fields[part.field];
        if (!setting) continue;
        const settingGroups = colorGroupsIn(setting);
        if (!settingGroups.size) continue;
        if (compatible(found, settingGroups)) continue;
        const start = Math.min(foundStart, kwStart);
        const end = Math.max(kwEnd, foundStart + 1);
        add('appearance', start, end,
          `設定では${e.name}の${part.label}は「${setting}」です（本文：「${m.slice(start, end)}」）`, null, { entryId: e.id });
      }
    });
  }

  function checkAge(a, mentions, index, add) {
    const m = a.masked;
    const re = /([0-9０-９]{1,3}|[一二三四五六七八九十百]{1,4})(?:歳|才)(?!年上|年下|上|下|差|違|以上|以下|未満|くらい|ぐらい|前後|頃|ごろ|から|まで|の頃|の時|のとき|の子|児)/g;
    let mm;
    while ((mm = re.exec(m)) !== null) {
      const age = T.parseJaNumber(mm[1]);
      if (isNaN(age)) continue;
      const s = sentenceAt(a, mm.index);
      if (!s) continue;
      const end = mm.index + mm[0].length;
      let ch = null;
      // 「十七歳の太郎」
      const afterM = m.slice(end, end + 3);
      if (/^の/.test(afterM)) {
        ch = mentions.find((x) => x.entryId && x.start >= end + 1 && x.start <= end + 2 && index.byId[x.entryId].type === 'character') || null;
      }
      // 「太郎は十七歳」
      if (!ch) {
        const cands = mentions.filter((x) => x.entryId && x.start >= s.start && x.end <= mm.index && index.byId[x.entryId].type === 'character');
        for (let k = cands.length - 1; k >= 0; k--) {
          const an = afterName(m, cands[k].end);
          if (/[はがも]/.test(an.next) && mm.index - an.end <= 12) { ch = cands[k]; break; }
        }
      }
      if (!ch) continue;
      const e = index.byId[ch.entryId];
      const set = parseAgeSetting(e.fields && e.fields.age);
      if (!set) continue;
      if (age >= set.min && age <= set.max) continue;
      add('age', mm.index, end,
        `設定では${e.name}は${e.fields.age}${/歳|才/.test(e.fields.age) ? '' : '歳'}です（本文：「${mm[0]}」）`, null, { entryId: e.id });
    }
  }

  /** 設定資料に未登録の固有名詞らしき語（カタカナ語・「〇〇王国」など） */
  function findCandidates(m, index) {
    const counts = {};
    const registeredNorm = new Set(Array.from(index.normKanaMap.keys()));
    const registered = new Set(index.list);
    const reRun = /[ァ-ヴ][ァ-ヴー・]{2,}/g;
    let mm;
    while ((mm = reRun.exec(m)) !== null) {
      const w = mm[0].replace(/・+$/, '');
      if (w.length < 3) continue;
      if (LOANWORDS.has(w) || registered.has(w) || registeredNorm.has(normKana(w))) continue;
      if (/^(.{1,3})\1+$/.test(w) || /ッ$/.test(w)) continue;
      if (Array.from(registered).some((r) => isKatakana(r) && w.indexOf(r) >= 0)) continue;
      counts[w] = counts[w] || { word: w, count: 0, kind: 'katakana' };
      counts[w].count++;
    }
    const rePlace = /((?:[一-鿿々]{2,4})|(?:[ァ-ヴー]{2,}))(王国|帝国|公国|共和国|連邦|皇国|村|町|市|城|山|川|湖|森|島|学園|高校|学院|騎士団|教会|神殿|ギルド|商会|一族|領|街|砦|港|大陸|海)/g;
    while ((mm = rePlace.exec(m)) !== null) {
      const w = mm[0];
      if (registered.has(w) || registered.has(mm[1])) continue;
      if (/^(?:この|その|あの|大きな|小さな)/.test(w)) continue;
      counts[w] = counts[w] || { word: w, count: 0, kind: 'place' };
      counts[w].count++;
    }
    return Object.values(counts)
      .filter((c) => c.count >= 2 || c.kind === 'place')
      .sort((x, y) => y.count - x.count)
      .slice(0, 20);
  }

  /** 各話での人物・用語の登場回数（設定資料の「登場箇所」用） */
  function countMentionsByEntry(texts, entries) {
    const index = buildNameIndex(entries);
    return texts.map((t) => {
      const counts = {};
      findMentions(T.maskRuby(t || ''), index).forEach((mt) => {
        mt.ids.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
      });
      return counts;
    });
  }

  NS.Consistency = {
    RULES, RULE_MAP, check, buildNameIndex, detectNarrator, NARRATORS, NARRATOR_SHORT, findMentions, attributeSpeakers, countMentionsByEntry,
    normKana, levenshtein, colorGroupsIn, parsePronounSetting, PRONOUN_FAMILIES,
  };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
