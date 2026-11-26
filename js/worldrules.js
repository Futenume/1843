/*
 * 綴り — 世界観ルール（通貨・単位・暦と時刻・文明の水準・外来語）
 * 設定資料に書いた「この世界の決まり」をもとに、本文の中の“この世界にないもの”を見つける。
 *   ・現実の単位（メートル・キロ・グラム…）→ この世界の単位に換算した言い換え（百メートル → 約百三十歩）
 *   ・現実のお金（〇円・ドル）→ この世界の通貨に換算（千円 → 銅貨十枚）。設定にない硬貨（白金貨など）
 *   ・現実の曜日・元号・西暦、決めた月の名前、時計のない世界の「〇時・〇分」
 *   ・文明の水準：電気・自動車・銃・時計・写真など、この世界にないもの
 *   ・和風・時代ものでの、カタカナの外来語（ドア → 戸・扉）
 * ブラウザでも Node でも動く純粋関数のみ。
 */
(function (NS) {
  'use strict';

  // ───── 数（算用数字・漢数字） ─────
  const KD = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '壱': 1, '弐': 2, '参': 3 };
  const toHalf = (s) => String(s).replace(/[０-９．，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  function parseSmall(s) {
    // 千以下の漢数字（「二〇二」のような並びも）
    if (/^[〇零一二三四五六七八九]{2,}$/.test(s)) return parseInt(Array.from(s).map((c) => KD[c]).join(''), 10);
    let total = 0;
    let cur = 0;
    let any = false;
    for (const c of s) {
      if (c in KD) { cur = KD[c]; any = true; } else if (c === '十') { total += (cur || 1) * 10; cur = 0; any = true; } else if (c === '百') { total += (cur || 1) * 100; cur = 0; any = true; } else if (c === '千') { total += (cur || 1) * 1000; cur = 0; any = true; } else return NaN;
    }
    return any ? total + cur : NaN;
  }
  /** 「250」「２５０」「1.5」「二百五十」「一万二千」「三億」などを数に。読めなければ NaN */
  function parseNum(str) {
    const s = toHalf(str).replace(/,/g, '');
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    let total = 0;
    let rest = s;
    for (const [mark, mul] of [['億', 1e8], ['万', 1e4]]) {
      const i = rest.indexOf(mark);
      if (i >= 0) {
        const head = rest.slice(0, i);
        const v = head ? (/^\d+$/.test(head) ? parseInt(head, 10) : parseSmall(head)) : 1;
        if (isNaN(v)) return NaN;
        total += v * mul;
        rest = rest.slice(i + 1);
      }
    }
    if (rest) {
      const v = /^\d+$/.test(rest) ? parseInt(rest, 10) : parseSmall(rest);
      if (isNaN(v)) return NaN;
      total += v;
    }
    return total;
  }
  function kanji(n) {
    n = Math.round(n);
    if (n === 0) return '〇';
    const D = '〇一二三四五六七八九';
    const small = (v) => {
      let s = '';
      [[1000, '千'], [100, '百'], [10, '十']].forEach(([u, ch]) => { const q = Math.floor(v / u); if (q) { s += (q === 1 ? '' : D[q]) + ch; v %= u; } });
      return s + (v ? D[v] : '');
    };
    let s = '';
    const oku = Math.floor(n / 1e8);
    const man = Math.floor((n % 1e8) / 1e4);
    const rest = n % 1e4;
    if (oku) s += small(oku) + '億';
    if (man) s += small(man) + '万';
    if (rest) s += small(rest);
    return s;
  }
  /** 本で使いやすい、きりのよい数に（大きい数は上から2けた） */
  function roundNice(v) {
    if (!(v > 0)) return 0;
    if (v >= 100) { const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; }
    if (v >= 10) return Math.round(v);
    if (v >= 1) return Math.round(v * 2) / 2;
    return Math.max(0.1, Math.round(v * 10) / 10);
  }
  /** 元の書き方（漢数字・算用数字・全角数字）に合わせて数を書く。漢数字は整数にする */
  function fmt(v, useKanji) {
    if (useKanji === true) return kanji(Math.max(1, Math.round(v)));
    const t = Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
    return useKanji === 'wide' ? t.replace(/[0-9.]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)) : t;
  }
  // 数の書き方：漢数字なら true、全角数字なら 'wide'、半角なら false
  const numStyle = (s) => (isKanjiNum(s) ? true : /[０-９]/.test(s) ? 'wide' : false);
  function isKanjiNum(s) { return /^[〇零一二三四五六七八九十百千万億壱弐参]+$/.test(s); }

  // 数のあとに単位が続く形
  const NUM = '[0-9０-９]+(?:[.．][0-9０-９]+)?|[〇零一二三四五六七八九十百千万億]+|数十|数百|数千|十数|数';
  const VAGUE = new Set(['数', '数十', '数百', '数千', '十数']);
  // カタカナの語は、前後に別のカタカナが続かないとき（「センチメンタル」「インチキ」「マイルド」を拾わない）
  const KB = '(?<![ァ-ヴー])';
  const KA = '(?![ァ-ヴー])';

  // ───── 現実の単位（基本の単位：長さ m・重さ g・量 L） ─────
  const REAL_UNITS = [
    ['キロメートル', 'length', 1000], ['センチメートル', 'length', 0.01], ['ミリメートル', 'length', 0.001], ['メートル', 'length', 1],
    ['マイル', 'length', 1609.344], ['フィート', 'length', 0.3048], ['インチ', 'length', 0.0254], ['ヤード', 'length', 0.9144],
    ['キログラム', 'weight', 1000], ['グラム', 'weight', 1], ['トン', 'weight', 1e6], ['ポンド', 'weight', 453.6], ['オンス', 'weight', 28.35],
    ['ミリリットル', 'volume', 0.001], ['リットル', 'volume', 1],
    ['センチ', 'length', 0.01], ['ミリ', 'length', 0.001], ['キロ', 'kilo', 1000],
  ];
  // 数がなくても指摘する語（短い語は数があるときだけ）
  const NEEDS_NUMBER = new Set(['センチ', 'ミリ', 'キロ', 'トン', 'インチ', 'ポンド', 'オンス']);
  const LATIN_UNITS = { km: ['length', 1000], cm: ['length', 0.01], mm: ['length', 0.001], kg: ['weight', 1000], mg: ['weight', 0.001] };
  const KIND_LABEL = { length: '長さ', weight: '重さ', volume: '量' };
  const BASE_LABEL = { length: 'm', weight: 'g', volume: 'L' };

  /** この世界の単位への換算。units: [{ kind, name, amount（基本の単位で） }] */
  function convertUnit(value, kind, units, useKanji, vague) {
    const list = units.filter((u) => u.kind === kind && u.amount > 0).sort((a, b) => b.amount - a.amount);
    if (!list.length) return null;
    if (vague) {
      // 「数メートル」→ 近い大きさの単位があれば「数歩」。大きさが2倍以上違うと意味が変わるので、案は出さない
      let best = list[0];
      list.forEach((u) => { if (Math.abs(Math.log(u.amount / value)) < Math.abs(Math.log(best.amount / value))) best = u; });
      return Math.abs(Math.log(best.amount / value)) <= Math.log(2) ? vague + best.name : null;
    }
    // いちばん小さい単位よりずっと小さい量（「一ミリ」など）は、単位で言い換えない
    if (value / list[list.length - 1].amount < 0.2) return null;
    // 大きい単位で1以上になるもの（「半里」と言える半分以上も可）
    const u = list.find((x) => value / x.amount >= (useKanji === true ? 0.45 : 1)) || list[list.length - 1];
    const exact = value / u.amount;
    if (useKanji === true && exact < 10) {
      // 漢数字は「一里半」「半里」のように半分まで。半分の刻みから離れているときは「一里あまり」「一里足らず」
      const say = (r) => { const whole = Math.floor(r); const half = r - whole === 0.5; return whole ? kanji(whole) + u.name + (half ? '半' : '') : '半' + u.name; };
      const near = Math.max(0.5, Math.round(exact * 2) / 2);
      if (Math.abs(near - exact) <= exact * 0.08) return (Math.abs(near - exact) > exact * 1e-6 ? '約' : '') + say(near);
      const down = Math.floor(exact * 2) / 2;
      const up = Math.ceil(exact * 2) / 2;
      if (down < 0.5 || Number.isInteger(up)) return say(up) + '足らず';
      return say(down) + 'あまり';
    }
    const r = roundNice(exact);
    const shown = useKanji === true ? Math.max(1, Math.round(r)) : r;
    const approx = Math.abs(shown - exact) > exact * 1e-6; // 丸めたら「約」
    return (approx ? '約' : '') + fmt(shown, useKanji) + u.name;
  }
  function describeAmount(u) {
    const base = BASE_LABEL[u.kind];
    let v = u.amount;
    let unit = base;
    if (u.kind === 'length' && v >= 1000) { v /= 1000; unit = 'km'; } else if (u.kind === 'length' && v < 1) { v *= 100; unit = 'cm'; }
    if (u.kind === 'weight' && v >= 1000) { v /= 1000; unit = 'kg'; }
    if (u.kind === 'volume' && v < 1) { v *= 1000; unit = 'mL'; }
    return `${u.name}（約${Math.round(v * 100) / 100}${unit}）`;
  }

  // ───── お金 ─────
  const REAL_MONEY = ['ドル', 'ユーロ', 'セント', 'ペニー', 'ペンス'];
  // お金にまつわる、ふつうの言葉（硬貨の名前ではない）
  const COMMON_MONEY = new Set(['通貨', '雑貨', '百貨', '外貨', '硬貨', '財貨', '邦貨', '奇貨', '滞貨', '良貨', '悪貨', '正貨', '金銭', '小銭', '釣銭', '身銭', '賽銭', '口銭', '日銭', '悪銭', '古銭', '銅銭', '銀銭', '金貨銭', '寛永通宝', '一文銭', '借銭', '路銭', '餞銭', '湯銭', '木戸銭', '渡し銭', '駄賃銭']);

  // ───── 造語のお金を考える ─────
  // 高い順に3段。名前は「〜貨」、読みは音読みで
  const COIN_TIERS = [
    [['黒聖', 'こくせい'], ['星晶', 'せいしょう'], ['竜鱗', 'りゅうりん'], ['天輝', 'てんき'], ['皇', 'こう'], ['聖', 'せい'], ['金冠', 'きんかん'], ['翠晶', 'すいしょう'], ['紅玉', 'こうぎょく'], ['蒼星', 'そうせい'], ['陽', 'よう'], ['神鋼', 'しんこう']],
    [['白銀', 'はくぎん'], ['月', 'げつ'], ['銀環', 'ぎんかん'], ['銀', 'ぎん'], ['青銀', 'せいぎん'], ['銀葉', 'ぎんよう'], ['真銀', 'しんぎん'], ['月輪', 'げつりん'], ['銀鱗', 'ぎんりん'], ['白鋼', 'はっこう']],
    [['赤銅', 'しゃくどう'], ['銅', 'どう'], ['青銅', 'せいどう'], ['鉄', 'てつ'], ['灰', 'かい'], ['石', 'せき'], ['銅葉', 'どうよう'], ['角', 'かく'], ['錫', 'すず'], ['黒鉄', 'くろがね']],
  ];
  const COIN_KANA = {
    syl: 'ル ミ セ ラ ディ オ ソ ペ ク レ ヴァ フィ エ リ ア カ テ マ ロ'.split(' '),
    end: ['ナ', 'ス', 'ル', 'ド', 'ン', 'ラ', 'リン', 'ール', 'ム', 'ト', 'ア'],
  };
  const COIN_RATES = [[10000, 100, 1], [100, 10, 1], [1000, 50, 1], [400, 20, 1]];
  /**
   * 造語のお金の組み合わせを考える。style: 'kanji'（〜貨・読みつき）| 'kana'（カタカナ）
   * 戻り値：[{ coins: [{ name, reading, value }]（高い順）, yen }]
   */
  function coinSets(style, seed, count) {
    let a = (seed >>> 0) || 1;
    const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const out = [];
    const seen = new Set();
    for (let t = 0; out.length < (count || 6) && t < 200; t++) {
      const rates = pick(COIN_RATES);
      let coins;
      if (style === 'kana') {
        const used = new Set();
        coins = rates.map((value) => {
          let w = '';
          for (let k = 0; k < 30; k++) {
            const parts = [];
            const n = 1 + Math.floor(rnd() * 2);
            for (let i = 0; i < n; i++) parts.push(pick(COIN_KANA.syl));
            parts.push(pick(COIN_KANA.end));
            w = parts.join('');
            const len = Array.from(w).length;
            // 同じ音が続かない・3〜5文字・先頭の音がほかの段と重ならない
            const okSound = parts.every((x, i) => i === 0 || x !== parts[i - 1]) && !/(.)\1/.test(w);
            if (okSound && len >= 3 && len <= 5 && !used.has(w) && !Array.from(used).some((u) => u[0] === w[0])) break;
          }
          used.add(w);
          return { name: w, reading: '', value };
        });
      } else {
        coins = COIN_TIERS.map((tier, i) => { const [n, r] = pick(tier); return { name: n + '貨', reading: r + 'か', value: rates[i] }; });
        // 同じ字が続きすぎないように（「銀貨・銀環貨」など）
        if (new Set(coins.map((c) => c.name[0])).size < coins.length) continue;
      }
      const key = coins.map((c) => c.name).join('/');
      if (seen.has(key)) continue;
      seen.add(key);
      // 円の目安：いちばん安いお金1枚が10〜100円くらいになるように
      out.push({ coins, yen: rates[0] >= 10000 ? 100 : rates[0] >= 1000 ? 50 : 10 });
    }
    return out;
  }
  function coinPhrase(name, n, useKanji, approx) {
    const num = (approx ? '約' : '') + fmt(n, useKanji);
    return /[貨札玉幣]$/.test(name) ? `${name}${num}枚` : `${num}${name}`;
  }
  /** 円の金額を、この世界の硬貨に。currency: { units:[{name,value}], yen }（value は一番小さい硬貨を1とした値、yen は一番小さい硬貨1枚の円） */
  function convertYen(yen, currency, useKanji) {
    const units = (currency.units || []).filter((u) => u.name && u.value > 0).sort((a, b) => b.value - a.value);
    if (!units.length || !(currency.yen > 0)) return null;
    const base = yen / currency.yen;
    const u = units.find((x) => base / x.value >= 1) || units[units.length - 1];
    const exact = base / u.value;
    if (exact < 0.75) return null; // いちばん小さいお金1枚にも満たない額は、言い換えを出さない（文を考え直す）
    const r = Math.max(1, exact >= 10 ? roundNice(exact) : Math.round(exact));
    return coinPhrase(u.name, r, useKanji, Math.abs(r - exact) > exact * 1e-6);
  }

  // ───── 暦と時刻 ─────
  const WEEKDAYS = '月火水木金土日';
  const REAL_ERAS = ['西暦', '紀元前', '紀元後', '令和', '平成', '昭和', '大正', '明治'];

  // ───── 文明の水準（この世界にないもの） ─────
  const TECH = [
    { id: 'electric', label: '電気・電化製品', words: [['携帯電話', '伝令', '使い'], ['電話', '伝令', '使い'], ['電気', ''], ['電灯', 'ランプ', '行灯'], ['電球', 'ランプ', '行灯'], ['電池', ''], ['停電', ''], ['充電', ''], ['スマートフォン', ''], ['スマホ', ''], ['テレビ', ''], ['ラジオ', ''], ['パソコン', ''], ['コンピューター', ''], ['コンピュータ', ''], ['インターネット', ''], ['メール', '手紙', '文'], ['エアコン', ''], ['冷蔵庫', '氷室'], ['掃除機', ''], ['エレベーター', '昇降機', '昇降機']] },
    { id: 'vehicle', label: '自動車・鉄道・飛行機', words: [['自動車', '馬車', '駕籠'], ['電車', '馬車', '駕籠'], ['列車', '馬車', '駕籠'], ['汽車', '馬車', '駕籠'], ['新幹線', ''], ['地下鉄', ''], ['線路', ''], ['自転車', '馬', '馬'], ['バイク', '馬', '馬'], ['飛行機', ''], ['ヘリコプター', ''], ['トラック', '荷馬車', '大八車'], ['タクシー', '辻馬車', '駕籠'], ['ガソリン', '']] },
    { id: 'firearm', label: '火薬・銃', words: [['手榴弾', ''], ['ダイナマイト', ''], ['ミサイル', ''], ['ピストル', ''], ['ライフル', ''], ['拳銃', ''], ['鉄砲', '弩'], ['大砲', '投石機'], ['火薬', ''], ['爆弾', ''], ['弾丸', '矢'], ['銃', '弩']] },
    { id: 'clock', label: '機械の時計', words: [['時計', '']] },
    { id: 'record', label: '写真・録音・映像', words: [['写真', '肖像画', '絵姿'], ['カメラ', ''], ['映画', '芝居', '芝居'], ['録音', ''], ['録画', ''], ['ビデオ', '']] },
    { id: 'material', label: '近代の素材・道具', words: [['プラスチック', ''], ['ビニール', ''], ['ナイロン', ''], ['コンクリート', '石', '石'], ['アスファルト', '石畳', '石畳'], ['ペットボトル', ''], ['ボールペン', '羽根ペン', '筆'], ['マッチ', '火打ち石'], ['ライター', '火打ち石'], ['缶詰', '']] },
    { id: 'medicine', label: '近代の医療', words: [['抗生物質', ''], ['ワクチン', ''], ['レントゲン', ''], ['注射', '']] },
    { id: 'paper', label: '紙幣・カード', words: [['クレジットカード', ''], ['紙幣', '金貨', '小判']] },
  ];
  const TECH_PRESETS = {
    none: { label: '現代・制限なし', cats: [], loan: false },
    medieval: { label: '中世風（電気・機械・火薬なし）', cats: ['electric', 'vehicle', 'firearm', 'clock', 'record', 'material', 'medicine', 'paper'], loan: false },
    early: { label: '近世風（銃・時計・紙幣はある）', cats: ['electric', 'vehicle', 'record', 'material', 'medicine'], loan: false },
    steam: { label: '蒸気の時代（汽車はある・電気はない）', cats: ['electric', 'record', 'material', 'medicine'], loan: false },
    japanese: { label: '和風・時代もの（外来語も控える）', cats: ['electric', 'vehicle', 'record', 'material', 'medicine', 'paper'], loan: true },
  };
  // 「砂時計」「日時計」「水時計」「花時計」「腹時計」は、時計がない世界でも使える
  const TECH_EXCEPT = { 時計: /[砂日水花腹]$/ };

  // ───── 外来語（和風・時代もの向け） ─────
  const LOANWORDS = [
    ['ドア', '戸・扉'], ['テーブル', '卓・机'], ['ベッド', '寝床・寝台'], ['カーテン', '帳・幕'], ['コップ', '湯呑み・杯'], ['スプーン', '匙'], ['ナイフ', '小刀'],
    ['フォーク', '箸'], ['ケーキ', '菓子'], ['ミルク', '乳'], ['スープ', '汁・吸い物'], ['ワイン', '葡萄酒'], ['ビール', '麦酒'], ['コーヒー', '茶'], ['ジュース', '果汁'],
    ['チャンス', '好機'], ['タイミング', '頃合い'], ['スピード', '速さ'], ['パワー', '力'], ['エネルギー', '力・気力'], ['ショック', '衝撃'], ['イメージ', '印象・姿'],
    ['ミス', 'しくじり・誤り'], ['ペース', '調子・足取り'], ['リズム', '拍子'], ['テンション', '気分'], ['ストレス', '気苦労'], ['プレッシャー', '重圧'],
    ['リーダー', '頭・首領'], ['メンバー', '仲間'], ['チーム', '組・一団'], ['グループ', '一団・組'], ['ルール', '決まり・掟'], ['ゲーム', '遊び・勝負'],
    ['スタート', '始まり'], ['ゴール', '行き着く先'], ['ポイント', '要所'], ['プラン', '策・計画'], ['アイデア', '案・思いつき'], ['アイディア', '案・思いつき'], ['ヒント', '手がかり'],
    ['トラブル', '揉め事'], ['ピンチ', '窮地'], ['ライバル', '好敵手'], ['パートナー', '相棒'], ['ボス', '親玉・頭目'], ['ターゲット', '標的・的'], ['ミッション', '務め・任務'],
    ['プライド', '誇り'], ['ハート', '心'], ['ベスト', '最善'], ['ラスト', '最後'], ['サイン', '合図'], ['メッセージ', '言付け'], ['ニュース', '知らせ'],
    ['スケジュール', '予定'], ['ルート', '道筋'], ['コース', '道筋'], ['スタイル', '様式・姿'], ['デザイン', '意匠'], ['カラー', '色'], ['サイズ', '大きさ'],
    ['キッチン', '台所'], ['トイレ', '厠'], ['シャワー', '行水'], ['タオル', '手拭い'], ['ポケット', '懐・袂'], ['バッグ', '袋・包み'], ['ノート', '帳面'], ['メモ', '書き付け'],
    ['ページ', '丁'], ['リスト', '一覧・目録'], ['パーティー', '宴'], ['プレゼント', '贈り物'], ['サービス', 'もてなし'], ['ホテル', '宿・旅籠'], ['レストラン', '料理屋'],
    ['ベンチ', '腰掛け'], ['ロープ', '縄・綱'], ['ハンマー', '槌'], ['シャツ', '肌着'], ['ズボン', '袴'], ['スカート', '裳'], ['ブーツ', '長靴'], ['コート', '外套・羽織'],
    ['ハンカチ', '手拭い'], ['リボン', '紐・帯'], ['ネックレス', '首飾り'], ['ドレス', '衣装'], ['カード', '札'], ['ボール', '毬・球'], ['ベル', '鈴・鐘'], ['ゲート', '門'],
    ['タワー', '塔'], ['ストーリー', '物語'], ['ヒーロー', '英雄'], ['モンスター', '化け物・妖'], ['パニック', '恐慌・混乱'], ['ダメージ', '痛手'], ['ガード', '守り'],
    ['アタック', '攻め'], ['スキル', '技・腕前'], ['レベル', '腕前・格'], ['ランク', '位・等級'], ['ポジション', '持ち場'], ['オフィス', '詰所・役所'], ['ルーム', '部屋'],
    ['ショップ', '店'], ['マーケット', '市'], ['ランプ', '行灯・灯'], ['ライト', '明かり'], ['ガラス', 'ぎやまん・玻璃'], ['ボタン', '留め具'], ['ペン', '筆'], ['インク', '墨'],
  ];

  /** 設定に「あり」と書いた言葉（「、」や空白区切り） */
  const splitWords = (s) => String(s || '').split(/[\s、,，・／/]+/).map((x) => x.trim()).filter(Boolean);
  const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** 世界観ルールに、本文で調べることが1つでもあるか */
  function active(rules) {
    if (!rules) return false;
    const c = rules.currency || {};
    const u = rules.units || {};
    const cal = rules.calendar || {};
    const t = rules.tech || {};
    return !!((c.units && c.units.length) || (u.list && u.list.length) || cal.era || (cal.months && cal.months.length) || (cal.weekdays && cal.weekdays.length) || cal.noWeek || cal.noClock ||
      (t.cats && t.cats.length) || t.loanwords || (t.extra && splitWords(t.extra).length));
  }

  /**
   * 本文を調べる。text は ruby などを伏せた本文（位置は元の本文と同じ）。
   * 戻り値：[{ start, end, kind, message, suggestion, scope: 'auto'|'all', severity: 'warning'|'info' }]（重なる指摘は長い方だけ）
   */
  function scan(text, rules, opts) {
    opts = opts || {};
    const out = [];
    if (!rules) return out;
    const s = String(text || '');
    const units = ((rules.units && rules.units.list) || []).filter((x) => x && x.name && x.amount > 0 && KIND_LABEL[x.kind]);
    const currency = rules.currency || {};
    const coins = (currency.units || []).filter((x) => x && x.name && x.value > 0);
    const cal = rules.calendar || {};
    const tech = rules.tech || {};
    const allowed = new Set(splitWords(tech.allow));
    (opts.names || []).forEach((n) => allowed.add(n));
    const push = (f) => out.push(f);
    const each = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(s)) !== null) { fn(m); if (m[0] === '') re.lastIndex++; } };

    // 現実の単位
    if (units.length) {
      const kinds = new Set(units.map((x) => x.kind));
      const listOf = (kind) => units.filter((x) => x.kind === kind).map(describeAmount).join('・');
      const words = REAL_UNITS.map((r) => r[0]).sort((a, b) => b.length - a.length).map(escRe).join('|');
      const re = new RegExp('(' + NUM + ')?[ 　]?' + KB + '(' + words + ')' + KA, 'g');
      each(re, (m) => {
        const [, num, word] = m;
        if (!num && NEEDS_NUMBER.has(word)) return;
        const def = REAL_UNITS.find((r) => r[0] === word);
        let kind = def[1];
        if (kind === 'kilo') {
          // 「キロ」は、あとに続く言葉から距離か重さかを決める（「十キロの荷物」「五キロもある」は重さ）
          const after = s.slice(m.index + m[0].length, m.index + m[0].length + 8);
          const heavy = /^(?:の|も|は|ほど|近い|近く|以上|もの)?(?:荷|重|体重|米|肉|鉄|石|砂|袋|樽|箱|塊|岩|鎧|剣|斧|槌|小麦|麦|ある|あった|量|超え)/.test(after);
          kind = kinds.has('weight') && (heavy || !kinds.has('length')) ? 'weight' : 'length';
        }
        const factor = word === 'キロ' && kind === 'weight' ? 1000 : def[2];
        if (!kinds.has(kind)) return; // この種類の単位を決めていなければ指摘しない
        let suggestion = null;
        if (num) {
          const vague = VAGUE.has(num) ? num : '';
          const v = vague ? 1 : parseNum(num);
          if (vague || v > 0) suggestion = convertUnit(vague ? factor : v * factor, kind, units, vague ? true : numStyle(num), vague);
          // 「一ミリも動かない」→「少しも動かない」
          if (!suggestion && !vague && s[m.index + m[0].length] === 'も' && v * factor <= 0.05) suggestion = '少し';
        }
        push({ start: m.index, end: m.index + m[0].length, kind: 'unit', scope: 'auto', severity: 'warning',
          message: `この世界の${KIND_LABEL[kind]}の単位は ${listOf(kind)} です${word === 'キロ' && kinds.has('length') && kinds.has('weight') ? `（「キロ」を${KIND_LABEL[kind]}として換算しました）` : ''}`, suggestion });
      });
      const reL = /([0-9０-９]+(?:[.．][0-9０-９]+)?)[ 　]?(km|cm|mm|kg|mg|ｋｍ|ｃｍ|ｍｍ|ｋｇ)(?![A-Za-zＡ-Ｚａ-ｚ])/g;
      each(reL, (m) => {
        const key = toHalf(m[2]).replace(/[ａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const [kind, factor] = LATIN_UNITS[key] || [];
        if (!kind || !kinds.has(kind)) return;
        push({ start: m.index, end: m.index + m[0].length, kind: 'unit', scope: 'auto', severity: 'warning',
          message: `この世界の${KIND_LABEL[kind]}の単位は ${listOf(kind)} です`, suggestion: convertUnit(parseNum(m[1]) * factor, kind, units, numStyle(m[1]), '') });
      });
    }

    // 現実のお金・設定にない硬貨
    if (coins.length) {
      const names = coins.slice().sort((a, b) => b.value - a.value).map((c) => c.name);
      const msg = `この世界のお金は ${names.join('・')} です`;
      const reYen = new RegExp('(?<![〇一二三四五六七八九十百千万億0-9０-９])(' + NUM + ')(万|億)?円(?![形周滑満熟盤弧柱錐陣卓舞])|[¥￥][ 　]?([0-9０-９,，]+)', 'g');
      each(reYen, (m) => {
        const num = m[1] || m[3];
        // 「関東一円」「辺り一円」（その辺り一帯）は、お金ではない
        if (m[1] === '一' && !m[2] && /[一-龯り]$/.test(s.slice(Math.max(0, m.index - 1), m.index))) return;
        let suggestion = null;
        if (currency.yen > 0 && !VAGUE.has(num)) {
          const yen = parseNum(num) * (m[2] === '万' ? 1e4 : m[2] === '億' ? 1e8 : 1);
          if (yen > 0) suggestion = convertYen(yen, currency, numStyle(num));
        }
        push({ start: m.index, end: m.index + m[0].length, kind: 'money', scope: 'auto', severity: 'warning', message: msg + (currency.yen > 0 ? `（${names[names.length - 1]}1枚＝およそ${currency.yen}円として換算）` : ''), suggestion });
      });
      each(new RegExp(KB + '(' + REAL_MONEY.join('|') + ')' + KA, 'g'), (m) => {
        push({ start: m.index, end: m.index + m[0].length, kind: 'money', scope: 'auto', severity: 'warning', message: msg, suggestion: null });
      });
      // 設定にない硬貨（「〜貨」「〜銭」の硬貨を決めているとき。造語の「黒聖貨」なども）
      const suffixes = Array.from(new Set(names.map((n) => n.slice(-1)).filter((c) => c === '貨' || c === '銭')));
      if (suffixes.length) {
        // 似た名前（「黒聖貨」と「黒星貨」など）なら、言い換えの案に
        const similar = (w) => names.find((n) => n.length === w.length && n.slice(-1) === w.slice(-1) && Array.from(n).filter((c, i) => c !== w[i]).length === 1);
        each(new RegExp('(?<![一-龯々])([一-龯々]{1,3}[' + suffixes.join('') + '])(?![一-龯々])', 'g'), (m) => {
          const w = m[1];
          if (names.includes(w) || allowed.has(w) || COMMON_MONEY.has(w)) return;
          const near = similar(w);
          push({ start: m.index, end: m.index + w.length, kind: 'coin', scope: 'all', severity: 'info',
            message: near ? `「${w}」は設定資料のお金にありません。「${near}」の書き間違いでなければ、新しいお金として設定資料に足してください（この世界のお金：${names.join('・')}）` : `「${w}」は設定資料のお金にありません（${names.join('・')}）。新しいお金なら、設定資料に足してください`,
            suggestion: near || null });
        });
      }
    }

    // 暦と時刻
    const weekdays = (cal.weekdays || []).filter(Boolean);
    if (weekdays.length || cal.noWeek) {
      each(/([月火水木金土日])曜日?/g, (m) => {
        const i = '月火水木金土日'.indexOf(m[1]);
        const sug = weekdays.length === 7 ? weekdays[i] : null;
        push({ start: m.index, end: m.index + m[0].length, kind: 'calendar', scope: 'auto', severity: 'warning',
          message: cal.noWeek ? 'この世界には曜日がありません' : `この世界の曜日は ${weekdays.join('・')} です`, suggestion: sug });
      });
    }
    if (cal.era) {
      each(new RegExp('(' + REAL_ERAS.join('|') + ')', 'g'), (m) => {
        push({ start: m.index, end: m.index + m[0].length, kind: 'calendar', scope: 'auto', severity: 'warning', message: `この世界の年の数え方は「${cal.era}」です`, suggestion: m[1] === '紀元前' || m[1] === '紀元後' ? null : cal.era });
      });
    }
    const months = (cal.months || []).filter(Boolean);
    if (months.length === 12) {
      each(new RegExp('(?<![〇一二三四五六七八九十百0-9０-９ヶか])(' + '[0-9０-９]{1,2}|十[一二]?|[一二三四五六七八九]' + ')月(?![曜間]|ほど|ばかり|あまり|余り|も|後|前|ぶり|経|が経|半|分)', 'g'), (m) => {
        const n = parseNum(m[1]);
        if (!(n >= 1 && n <= 12)) return;
        push({ start: m.index, end: m.index + m[0].length, kind: 'calendar', scope: 'auto', severity: 'info', message: `この世界の${n}番目の月は「${months[n - 1]}」です（暦の月の名前）`, suggestion: months[n - 1] });
      });
    }
    if (cal.noClock) {
      const note = `この世界には時計がありません${cal.timeNote ? `（時刻の言い方：${cal.timeNote}）` : ''}`;
      // 「一時」は「一時的・一時は」などが多いので除く。「十分」は「十分後」のように時間のときだけ
      each(new RegExp('(?<![〇一二三四五六七八九十百0-9０-９])(' + NUM + ')(時(?![代間期点折計刻限差速雨化局勢世節頃中的]))', 'g'), (m) => {
        if (m[1] === '一' || VAGUE.has(m[1])) return;
        push({ start: m.index, end: m.index + m[0].length, kind: 'clock', scope: 'auto', severity: 'warning', message: note, suggestion: null });
      });
      each(new RegExp('(?<![〇一二三四五六七八九十百0-9０-９])(' + NUM + ')(分(?=後|前|間|ほど|程|おき|ごと|過ぎ|足らず|も経|が経)|秒)', 'g'), (m) => {
        push({ start: m.index, end: m.index + m[1].length + 1, kind: 'clock', scope: 'auto', severity: 'warning', message: note, suggestion: null });
      });
    }

    // 文明の水準（この世界にないもの）
    const cats = new Set(tech.cats || []);
    const techWords = [];
    TECH.forEach((c) => { if (cats.has(c.id)) c.words.forEach(([w, sug, ja]) => techWords.push({ w, sug, ja, label: c.label })); });
    splitWords(tech.extra).forEach((w) => techWords.push({ w, sug: '', label: '' }));
    techWords.filter((t) => !allowed.has(t.w)).sort((a, b) => b.w.length - a.w.length).forEach((t) => {
      const kata = /^[ァ-ヴー]+$/.test(t.w);
      each(new RegExp((kata ? KB : '') + escRe(t.w) + (kata ? KA : ''), 'g'), (m) => {
        const ex = TECH_EXCEPT[t.w];
        if (ex && ex.test(s.slice(Math.max(0, m.index - 1), m.index))) return;
        // 1文字の語が熟語の一部のとき（「銃眼」など）は、置き換えると別の語になるので案を出さない
        const inCompound = t.w.length === 1 && /[一-龯]/.test(s[m.index + 1] || '');
        const sug = (tech.loanwords && t.ja) || t.sug;
        push({ start: m.index, end: m.index + t.w.length, kind: 'tech', scope: 'all', severity: 'warning',
          message: `「${t.w}」はこの世界にありません${t.label ? `（文明の水準：${t.label}なし）` : ''}${sug ? `。言い換え例：「${sug}」` : ''}`, suggestion: inCompound ? null : (sug || null) });
      });
    });

    // 外来語（和風・時代もの）
    if (tech.loanwords) {
      const map = new Map(LOANWORDS.filter(([w]) => !allowed.has(w)));
      each(/[ァ-ヴー]+/g, (m) => {
        const alt = map.get(m[0]);
        if (!alt) return;
        push({ start: m.index, end: m.index + m[0].length, kind: 'loan', scope: 'auto', severity: 'info',
          message: `カタカナの外来語「${m[0]}」（和風・時代ものの世界では、言い換え例：「${alt}」）`, suggestion: alt.split('・')[0] });
      });
    }

    // 重なる指摘は、長い方（先に見つけた方）だけ残す
    out.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const kept = [];
    let lastEnd = -1;
    out.forEach((f) => { if (f.start >= lastEnd) { kept.push(f); lastEnd = f.end; } });
    return kept;
  }

  /** 換算表（設定資料の画面用）。amount を kind の基本単位で */
  function unitTable(amount, kind, units) {
    return units.filter((u) => u.kind === kind && u.amount > 0).map((u) => ({ name: u.name, value: amount / u.amount }));
  }

  NS.WorldRules = {
    parseNum, kanji, roundNice, convertUnit, convertYen, describeAmount, unitTable, scan, active, coinSets,
    REAL_UNITS, TECH, TECH_PRESETS, LOANWORDS, KIND_LABEL, BASE_LABEL, REAL_ERAS,
  };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
