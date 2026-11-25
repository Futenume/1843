/*
 * 綴り — 名前を考える
 * 和名（現代・時代もの）は読みつき、西洋風はカタカナの名と姓、ファンタジーは音を組み合わせた造語、地名は和風とカタカナ。
 * ブラウザでも Node でも動く純粋関数のみ。
 */
(function (NS) {
  'use strict';

  const pairs = (s) => s.trim().split(/\s+/).map((x) => { const [a, b] = x.split(':'); return [a, b || '']; });

  const SURNAME = pairs(`
    佐藤:さとう 鈴木:すずき 高橋:たかはし 田中:たなか 伊藤:いとう 渡辺:わたなべ 山本:やまもと 中村:なかむら 小林:こばやし 加藤:かとう
    吉田:よしだ 山田:やまだ 佐々木:ささき 山口:やまぐち 松本:まつもと 井上:いのうえ 木村:きむら 林:はやし 斎藤:さいとう 清水:しみず
    山崎:やまざき 森:もり 池田:いけだ 橋本:はしもと 阿部:あべ 石川:いしかわ 中島:なかじま 小川:おがわ 前田:まえだ 岡田:おかだ
    長谷川:はせがわ 藤田:ふじた 後藤:ごとう 近藤:こんどう 村上:むらかみ 遠藤:えんどう 青木:あおき 坂本:さかもと 西村:にしむら 福田:ふくだ
    柊:ひいらぎ 久遠:くおん 月島:つきしま 白石:しらいし 黒崎:くろさき 神崎:かんざき 如月:きさらぎ 鷹野:たかの 朝比奈:あさひな 一ノ瀬:いちのせ
    早乙女:さおとめ 東雲:しののめ 葛城:かつらぎ 桐生:きりゅう 結城:ゆうき 氷室:ひむろ 真壁:まかべ 霧島:きりしま 天城:あまぎ 藤堂:とうどう
    綾瀬:あやせ 七瀬:ななせ 水無瀬:みなせ 篠宮:しのみや 御影:みかげ 雪村:ゆきむら 久我:くが 鳴海:なるみ 有栖川:ありすがわ 宮守:みやもり
    相沢:あいざわ 秋山:あきやま 芦屋:あしや 一条:いちじょう 浅葱:あさぎ 九条:くじょう 榊:さかき 白鳥:しらとり 高槻:たかつき 夜宵:やよい`);
  const MALE = pairs(`
    蓮:れん 湊:みなと 陽翔:はると 蒼:あおい 樹:いつき 悠真:ゆうま 大和:やまと 颯太:そうた 律:りつ 朔:さく
    透:とおる 響:ひびき 慎一:しんいち 健太:けんた 翔:しょう 拓海:たくみ 隼人:はやと 誠:まこと 修司:しゅうじ 恭介:きょうすけ
    亮:りょう 和真:かずま 圭:けい 晴臣:はるおみ 宗一郎:そういちろう 直人:なおと 奏:かなで 碧:あお 創:はじめ 迅:じん
    瑛太:えいた 冬馬:とうま 理人:りひと 哉:かなた 千隼:ちはや 灯真:とうま 一颯:いぶき 柊斗:しゅうと 怜:れい 玲央:れお`);
  const FEMALE = pairs(`
    陽葵:ひまり 凛:りん 結衣:ゆい 葵:あおい 紬:つむぎ 澪:みお 栞:しおり 美咲:みさき 千尋:ちひろ 雫:しずく
    遥:はるか 楓:かえで 琴音:ことね 真白:ましろ 小春:こはる 茜:あかね 菫:すみれ 灯:あかり 七海:ななみ 柚葉:ゆずは
    沙耶:さや 鈴:すず 椿:つばき 薫:かおる 紗希:さき 夏希:なつき 唯:ゆい 朱音:あかね 透子:とうこ 詩:うた
    瑠璃:るり 雪乃:ゆきの 月乃:つきの 結月:ゆづき 心春:こはる 莉子:りこ 花音:かのん 彩葉:いろは 水月:みづき 美空:みそら`);
  const OLD_SURNAME = pairs(`
    真田:さなだ 柳生:やぎゅう 榊原:さかきばら 土方:ひじかた 本多:ほんだ 酒井:さかい 堀:ほり 大久保:おおくぼ 朝倉:あさくら 浅井:あざい
    黒田:くろだ 細川:ほそかわ 片倉:かたくら 毛利:もうり 上杉:うえすぎ 九条:くじょう 鷹司:たかつかさ 結城:ゆうき 松平:まつだいら 井伊:いい
    織部:おりべ 宇喜多:うきた 筒井:つつい 蜂須賀:はちすか 佐竹:さたけ 最上:もがみ 南部:なんぶ 丹羽:にわ 滝川:たきがわ 服部:はっとり`);
  const OLD_MALE = pairs(`
    源之助:げんのすけ 弥助:やすけ 新右衛門:しんえもん 甚八:じんぱち 宗兵衛:そうべえ 小太郎:こたろう 鷹丸:たかまる 清十郎:せいじゅうろう 勘九郎:かんくろう 伊織:いおり
    主水:もんど 兵庫:ひょうご 左近:さこん 蔵人:くろうど 又兵衛:またべえ 半蔵:はんぞう 平八郎:へいはちろう 吉之丞:きちのじょう 宗矩:むねのり 頼母:たのも
    数馬:かずま 采女:うねめ 権六:ごんろく 彦四郎:ひこしろう 十兵衛:じゅうべえ`);
  const OLD_FEMALE = pairs(`
    お菊:おきく お蝶:おちょう 千代:ちよ 小夜:さよ 志乃:しの 綾:あや 静:しず 雪:ゆき 菊乃:きくの 初音:はつね
    桔梗:ききょう 早苗:さなえ 紅葉:もみじ お艶:おつや 八重:やえ 葛葉:くずのは 小百合:さゆり 琴:こと 楓:かえで 鶴:つる
    百合:ゆり 撫子:なでしこ 夕霧:ゆうぎり 若菜:わかな 千鶴:ちづる`);

  const W_MALE = 'レオン アルベルト ユリウス セドリック ルーカス エドガー フェリクス ヴィクトル ギルバート クラウス ノア エリオット ジークフリート ラファエル オスカー テオドール アラン ミハイル ルドルフ カイル アーサー ライナルト ゼノ ローラン イヴァン'.split(' ');
  const W_FEMALE = 'エレナ ソフィア リリアナ クラリス アメリア セシリア イザベル フローラ ヴィオラ エミリア ルイーズ オリヴィア マリアンヌ シャーロット アリシア ロザリー ノエル イリス カミーユ ベアトリス ミレイユ レティシア ヘレナ ユーフェミア'.split(' ');
  const W_FAMILY = 'アルトハイム ローゼンベルク ヴァレンティーノ グランディス ハーヴェイ ウィンスロウ ブラックウッド シュタイナー ベルナール ローレンス クロフォード ヴェルナー モンテクレール アッシュフォード ノイマン ラングレー オルブライト フォルクナー シルヴァーニ エーデルシュタイン リヒトフォーゲル ベルンシュタイン グレイフォード'.split(' ');
  const NOBLE = ['フォン・', 'ド・', 'ディ・', ''];

  const FANTASY = {
    elf: { label: '優美（エルフ風）', syl: 'エ ル リ ア シ フィ ネ ラ セ レ ミ ナ ティ ウィ イ ノ ユ メ'.split(' '), end: 'エル リエル ウィン ネア シア リス ディル ファ ラス ミア ティア ルーン'.split(' ') },
    dwarf: { label: '重厚（ドワーフ・戦士風）', syl: 'グ ド ボ ガ ゴル ダ ブ ザ バル ギ トル ヴォ グラ ハ ロ'.split(' '), end: 'イン ック ドル ガン ボルグ ラム ダール ゴス グリム ガルド ドゥル'.split(' ') },
    arcane: { label: '神秘（魔法・古代風）', syl: 'ア ザ ネ ヴァ オ シュ カ イ エ ム ラ セ ル ヘ'.split(' '), end: 'ゼル ノス ディア エル ヴィス ラン オン ゼア トゥス ミール ラグナ'.split(' ') },
  };

  const PLACE_HEAD = pairs(`
    白:しら 黒:くろ 霧:きり 月:つき 鷹:たか 雪:ゆき 朱:あけ 青:あお 桜:さくら 椿:つばき 狐:きつね 鴉:からす 星:ほし 風:かざ
    石:いし 鬼:おに 竜:たつ 楓:かえで 蛍:ほたる 鈴:すず 霞:かすみ 氷:ひ 萩:はぎ 藤:ふじ 湊:みなと 葦:あし 蒼:あお 紅:べに`);
  const PLACE_TAIL = pairs(`
    沢:さわ 谷:だに 原:はら 峠:とうげ 浦:うら 森:もり 岬:みさき 野:の 川:かわ 宮:みや 坂:さか 里:さと 島:しま 山:やま
    淵:ぶち 瀬:せ 町:まち 村:むら ヶ丘:がおか ノ辻:のつじ 津:つ 平:だいら 渡:わたり`);
  const K_SYL = 'ア イ エ オ カ キ ク ケ コ サ シ セ ソ タ テ ト ナ ニ ノ ハ フ ホ マ ミ メ モ ラ リ ル レ ロ ガ ギ グ ゴ ザ ゼ ダ デ ド バ ベ ボ ヴァ ヴィ ユ ヨ ワ ティ フェ シェ'.split(' ');
  const K_END = 'ン ル ス ア ド ラ リア ニア ール ーン ム ト ディア ロス ネ'.split(' ');
  const K_KIND = ['', '', '', '', '', 'の森', '湖', '山', '平原', '港', '砦', '谷'];

  const STYLES = {
    jp: { label: '和名（現代）', person: true },
    jpOld: { label: '和名（時代もの）', person: true },
    west: { label: '西洋風（カタカナ）', person: true },
    elf: { label: FANTASY.elf.label, person: true },
    dwarf: { label: FANTASY.dwarf.label, person: true },
    arcane: { label: FANTASY.arcane.label, person: true },
    placeJp: { label: '地名（和風）', person: false },
    placeKana: { label: '地名（カタカナ）', person: false },
  };

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  // カタカナの造語（同じ音が続きすぎないように）
  function coin(r, syl, end, min, max) {
    for (let t = 0; t < 30; t++) {
      const n = min + Math.floor(r() * (max - min + 1));
      let w = '';
      let prev = '';
      for (let i = 0; i < n; i++) {
        let s = pick(r, syl);
        if (s === prev) s = pick(r, syl);
        w += s;
        prev = s;
      }
      w += pick(r, end);
      const len = Array.from(w).length;
      if (len >= 3 && len <= 7 && !/(.)\1\1/.test(w)) return w;
    }
    return pick(r, syl) + pick(r, end);
  }

  /** 1つ作る。戻り値：{ name, reading, given, family, note } */
  function one(style, gender, r) {
    const g = gender === 'm' || gender === 'f' ? gender : (r() < 0.5 ? 'm' : 'f');
    if (style === 'jp' || style === 'jpOld') {
      const old = style === 'jpOld';
      const [sn, sr] = pick(r, old ? OLD_SURNAME : SURNAME);
      const [gn, gr] = pick(r, old ? (g === 'm' ? OLD_MALE : OLD_FEMALE) : (g === 'm' ? MALE : FEMALE));
      // 「お菊」のような呼び名は、姓を付けない（町人の娘など）
      if (gn.startsWith('お')) return { name: gn, reading: gr, family: '', given: gn, note: '女性・呼び名' };
      return { name: sn + gn, reading: sr + ' ' + gr, family: sn, given: gn, note: g === 'm' ? '男性' : '女性' };
    }
    if (style === 'west') {
      const gn = pick(r, g === 'm' ? W_MALE : W_FEMALE);
      const fam = pick(r, W_FAMILY);
      const noble = r() < 0.3 ? pick(r, NOBLE) : '';
      return { name: gn + '・' + noble + fam, reading: '', family: fam, given: gn, note: (g === 'm' ? '男性' : '女性') + (noble ? '・貴族風' : '') };
    }
    if (FANTASY[style]) {
      const f = FANTASY[style];
      const gn = coin(r, f.syl, f.end, 1, 2);
      const withFamily = r() < 0.55;
      const fam = withFamily ? coin(r, f.syl, f.end, 1, 3) : '';
      return { name: fam ? gn + '・' + fam : gn, reading: '', family: fam, given: gn, note: g === 'm' ? '男性向き' : '女性向き' };
    }
    if (style === 'placeJp') {
      const [hn, hr] = pick(r, PLACE_HEAD);
      let [tn, tr] = pick(r, PLACE_TAIL);
      if (hn === tn) [tn, tr] = PLACE_TAIL[0];
      return { name: hn + tn, reading: hr + tr, note: '地名' };
    }
    // カタカナの地名
    const base = coin(r, K_SYL, K_END, 1, 2);
    const kind = pick(r, K_KIND);
    return { name: base + kind, reading: '', note: kind ? '地名（' + kind.replace(/^の/, '') + '）' : '地名' };
  }

  /**
   * 名前を作る。opts: { gender: 'm'|'f'|'any', count, seed, avoid: [すでにある名前] }
   * 同じ名前は出さない。
   */
  function generate(style, opts) {
    opts = opts || {};
    const r = rng(opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9));
    const count = Math.max(1, Math.min(60, opts.count || 12));
    const avoid = new Set((opts.avoid || []).map(String));
    const out = [];
    const seen = new Set();
    for (let t = 0; out.length < count && t < count * 30; t++) {
      const n = one(STYLES[style] ? style : 'jp', opts.gender || 'any', r);
      if (seen.has(n.name) || avoid.has(n.name) || (n.given && avoid.has(n.given))) continue;
      seen.add(n.name);
      out.push(n);
    }
    return out;
  }

  NS.Names = { STYLES, generate };
})(typeof globalThis !== 'undefined' ? (globalThis.Tsuzuri = globalThis.Tsuzuri || {}) : (window.Tsuzuri = window.Tsuzuri || {}));
