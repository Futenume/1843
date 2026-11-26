/*
 * 綴り — サンプル作品
 * 添削・設定チェックの働きが分かるよう、わざと誤りや設定との食い違いを含めてある。
 */
(function (NS) {
  'use strict';
  const UI = NS.UI;

  const CH1 = [
    '　王都ルーネの朝は、鐘の音とともに始まる。',
    '　見習い騎士のリオは、まだ眠い目をこすりながら訓練場へ向かった。石畳の向こうから、銀色の髪をなびかせた少女が走ってくる。',
    '「リオ、遅いわよ。」',
    '　セレナは腰に手を当てて、呆れたように言った。',
    '「ごめん、昨日は遅くまで|星晶石《せいしょうせき》の研究をしてて……」',
    '「言い訳は聞かない。ほら、ガルド師匠がもう待ってる」',
    '　訓練場の真ん中で、灰色の髪の大男が腕を組んで待ってた。ガルドだ。',
    '「遅いぞ、小僧。罰として百メートルを十本だ」',
    '　リオは返事を返す間もなく走り出した。違和感を感じたのは、三本目に差しかかったときだった。',
    '　空が、黒く染まり始めている…',
    '　黒霧の森の方角から、鳥たちが一斉に飛び立った。リオは足を止めた。胸がざわついた。嫌な予感がした。',
    '「なんだ、あれ!?空が見れないくらい真っ暗だ」',
    '　リオは剣を握りしめた。「俺が見てくる。セレナ、ガルド師匠を呼んできて！」',
    '　走り出したリオの背中を、セレナの金色の髪が追いかけるように揺れた。',
  ].join('\n');

  const CH2 = [
    '　黒霧の森は、昼間だというのに夜のように暗かった。',
    '　リオは木々の間を慎重に進んだ。足元で枯れ枝が乾いた音を立てる。',
    '「リオ！」',
    '　振り返ると、ガルドが息を切らして立っていた。',
    '「一人で行くなと言っただろう。……まったく、お前は昔から変わらん」',
    '　ガルドは|大剣《ツヴァイハンダー》を構え、霧の奥をにらんだ。「下がっていろ、リオ。ここは儂が食い止める」',
    '　霧の中から、赤い瞳がいくつも浮かび上がる。',
    '　それが、リオが師匠の背中を見た最後だった。',
  ].join('\n');

  const CH3 = [
    '　あの日から、三日が過ぎた。',
    '　王都の墓地で、リオは小さな墓標の前に立っていた。',
    '「師匠……」',
    '　風が吹いた。背後で、聞き慣れた声がした。',
    '「泣くな、小僧」と、ガルドは笑った。',
    '　リオは息をのんだ。',
    '　すべては、あの|星降りの夜《スターフォール》から始まっていたのだ。',
  ].join('\n');

  function create() {
    const p = NS.Store.newProject('星降る王国の見習い騎士（サンプル）');
    p.synopsis = '王都ルーネで暮らす見習い騎士リオは、ある朝、黒霧の森から広がる異変に気づく。師匠ガルドを失ったリオは、幼なじみのセレナとともに「星降りの夜」の真実を追う。';
    const c1 = NS.Store.newChapter('第一話　黒い空', CH1);
    c1.memo = '・リオとセレナの掛け合いで日常を見せる\n・ガルドは厳しいが情に厚い\n・最後に異変の予兆';
    const c2 = NS.Store.newChapter('第二話　黒霧の森', CH2);
    const c3 = NS.Store.newChapter('第三話　墓標の前で（執筆中）', CH3);
    p.chapters = [c1, c2, c3];

    const rio = NS.Lore.newEntry('character', 'リオ・アルベイン');
    Object.assign(rio, { reading: 'りお・あるべいん', aliases: ['リオ'], color: '#3d7ea6' });
    Object.assign(rio.fields, { role: '主人公', gender: '男', age: '16', firstPerson: '僕', hair: '栗色', eyes: '緑', speech: '素直で丁寧。目上には敬語を使う', personality: 'まっすぐで無鉄砲。困っている人を放っておけない', goal: '一人前の騎士になること' });
    const serena = NS.Lore.newEntry('character', 'セレナ・ヴァルト');
    Object.assign(serena, { reading: 'せれな・ばると', aliases: ['セレナ'], color: '#5f4b8b' });
    Object.assign(serena.fields, { role: 'ヒロイン／幼なじみ', gender: '女', age: '17', firstPerson: '私', hair: '銀色のロングヘア', eyes: '青', speech: '「〜わよ」「〜なさい」と強気な口調', personality: '面倒見がよく勝ち気。実は怖がり' });
    const gald = NS.Lore.newEntry('character', 'ガルド');
    Object.assign(gald, { reading: 'がるど', aliases: [], color: '#7f5539' });
    Object.assign(gald.fields, { role: '師匠', gender: '男', age: '52', firstPerson: '俺', hair: '灰色の短髪', eyes: '黒', speech: '口は悪いが面倒見がいい。リオを「小僧」と呼ぶ', background: '元王国騎士団副団長' });
    gald.appear = { from: 1, until: 2, reason: '死亡' };
    rio.relations = [
      { targetId: serena.id, calls: 'セレナ', note: '幼なじみ' },
      { targetId: gald.id, calls: 'ガルド師匠／師匠', note: '師弟' },
    ];
    serena.relations = [
      { targetId: rio.id, calls: 'リオ', note: '幼なじみ' },
      { targetId: gald.id, calls: 'ガルド師匠', note: '' },
    ];
    gald.relations = [{ targetId: rio.id, calls: '小僧／リオ', note: '弟子' }];

    const kingdom = NS.Lore.newEntry('place', 'エルミナ王国');
    Object.assign(kingdom.fields, { kind: '国', climate: '温暖。北部に山脈、東に黒霧の森', desc: '星晶石の産地として栄える王国' });
    const rune = NS.Lore.newEntry('place', '王都ルーネ');
    rune.aliases = ['ルーネ'];
    Object.assign(rune.fields, { kind: '都市', parent: kingdom.id, desc: '鐘楼の街。王城と騎士団の訓練場がある' });
    const forest = NS.Lore.newEntry('place', '黒霧の森');
    Object.assign(forest.fields, { kind: '森', parent: kingdom.id, desc: '一年中霧が晴れない森。魔物が棲む' });
    const port = NS.Lore.newEntry('place', '港町セイラ');
    port.aliases = ['セイラ'];
    Object.assign(port.fields, { kind: '港町', parent: kingdom.id });
    const stone = NS.Lore.newEntry('term', '星晶石');
    stone.reading = 'せいしょうせき';
    Object.assign(stone.fields, { kind: '鉱石', desc: '星の光を蓄える青い鉱石。魔法の触媒になる', rule: '感情が高ぶると光る。砕くと力を失う' });
    const order = NS.Lore.newEntry('org', '王国騎士団');
    Object.assign(order.fields, { kind: '騎士団', base: rune.id, desc: '王都を守る騎士の集団。見習いは訓練場で修行する' });
    p.entries = [rio, serena, gald, kingdom, rune, forest, port, stone, order];

    p.rules.world = '剣と魔法の中世風ファンタジー。火薬・電気・機械はない。長さの単位は「歩（ほ）」「里（り）」を使う。';
    p.rules.ng = [
      { word: 'スマホ', reason: '電気製品は存在しない', suggestion: '', scope: 'all' },
    ];
    // 世界観ルール：通貨・単位・暦と時刻・文明の水準・設定メモ
    p.rules.currency = {
      units: [{ name: '金貨', value: 10000 }, { name: '銀貨', value: 100 }, { name: '銅貨', value: 1 }], yen: 100, note: '',
      prices: [{ item: 'パン1個', price: '銅貨2枚' }, { item: '宿1泊（食事つき）', price: '銀貨1枚' }, { item: '見習い騎士のひと月の給金', price: '銀貨8枚' }, { item: '鍛えた剣1振り', price: '銀貨30枚' }],
    };
    p.rules.units = { list: [{ kind: 'length', name: '歩', amount: 0.75 }, { kind: 'length', name: '里', amount: 4000 }, { kind: 'weight', name: '斤', amount: 600 }], note: '' };
    p.rules.calendar = {
      era: '王国暦', yearNote: '一年は十二の月。年の初めは雪解けの頃',
      months: ['雪解けの月', '芽吹きの月', '花の月', '若葉の月', '雨の月', '陽の月', '星の月', '実りの月', '収穫の月', '紅葉の月', '霧の月', '白の月'],
      weekdays: [], noWeek: true, noClock: true, timeNote: '一日を十二の鐘で数える（一の鐘＝日の出）',
    };
    p.rules.tech = { preset: 'medieval', cats: ['electric', 'vehicle', 'firearm', 'clock', 'record', 'material', 'medicine', 'paper'], loanwords: false, allow: '', extra: '' };
    p.rules.bible = {
      magic: '星晶石を媒介に、詠唱して使う。使うと体力を消耗し、使いすぎると数日動けなくなる。死者を生き返らせることはできない。',
      religion: '星の女神を信仰している。星降りの夜は「女神の涙」と呼ばれる。',
      politics: 'エルミナ王国は国王と騎士団が治める。騎士は見習い → 従騎士 → 騎士の順に昇格する。',
    };
    p.rules.style = [{ from: '魔方陣', to: '魔法陣' }];
    p.timeline = [
      { id: UI.uid('t'), when: '王国暦312年', title: '星降りの夜', desc: '無数の流星が降り注ぎ、黒霧の森が生まれた' },
      { id: UI.uid('t'), when: '王国暦327年 春', title: 'リオ、見習い騎士になる', desc: 'ガルドに弟子入り' },
      { id: UI.uid('t'), when: '王国暦328年 秋', title: '物語の始まり', desc: '第一話' },
    ];
    const now = Date.now();
    p.ideas = [
      { id: UI.uid('i'), body: '星晶石は持ち主の感情に反応して光る\nリオの剣の柄にも小さな星晶石がはまっている（師匠の形見）', kind: '設定', tags: ['星晶石', '伏線'], color: '#3d7ea6', pinned: true, createdAt: now, updatedAt: now },
      { id: UI.uid('i'), body: 'セレナは実は王家の血を引いている？', kind: '伏線', tags: ['セレナ'], color: '#5f4b8b', pinned: false, plantedIn: c1.id, payoffIn: '', resolved: false, createdAt: now - 3600e3, updatedAt: now - 3600e3 },
      { id: UI.uid('i'), body: '黒い空の正体\n第一話で空が黒く染まる。第三話で黒霧の主が原因と分かる', kind: '伏線', tags: ['黒霧'], color: '', pinned: false, plantedIn: c1.id, payoffIn: c3.id, resolved: false, createdAt: now - 7200e3, updatedAt: now - 7200e3 },
      { id: UI.uid('i'), body: '世界を変えた大災厄。人々はこう呼ぶ', word: '星降りの夜', reading: 'スターフォール', kind: '読み方', tags: ['読み方'], color: '#d9a441', pinned: false, createdAt: now - 1800e3, updatedAt: now - 1800e3 },
      { id: UI.uid('i'), body: '「泣くのは、全部終わってからにしなさい」', kind: '台詞', tags: ['セレナ'], color: '', pinned: false, createdAt: now - 7200e3, updatedAt: now - 7200e3 },
      { id: UI.uid('i'), body: 'ラストシーン\n星降りの丘で、二人が流星を見上げる', kind: 'シーン', tags: ['終盤'], color: '#d9a441', pinned: false, createdAt: now - 86400e3, updatedAt: now - 86400e3 },
    ];
    const cols = p.plot.columns;
    p.plot.cards = [
      { id: UI.uid('c'), columnId: cols[0].id, title: '見習い騎士の朝', body: 'リオ・セレナ・ガルドの日常。空が黒く染まる', chapterId: c1.id, color: '#3d7ea6' },
      { id: UI.uid('c'), columnId: cols[1].id, title: '黒霧の森へ', body: 'リオが森へ。ガルドが追ってくる', chapterId: c2.id, color: '' },
      { id: UI.uid('c'), columnId: cols[1].id, title: '師匠の最期', body: 'ガルドがリオを逃がして魔物の群れに挑む', chapterId: c2.id, color: '#c8553d' },
      { id: UI.uid('c'), columnId: cols[2].id, title: 'セレナの秘密', body: '王家の紋章が刻まれたペンダント', chapterId: '', color: '#5f4b8b' },
      { id: UI.uid('c'), columnId: cols[3].id, title: '星降りの夜、ふたたび', body: '星晶石の力で黒霧を晴らす', chapterId: '', color: '#d9a441' },
    ];

    // 地図
    const E = NS.MapEngine;
    const map = E.newMap('エルミナ王国全図', { preset: 'continent', size: 'm', seed: 24680, land: 0.45, palette: 'teal' });
    const H = E.decodeHeights(map.height, map.gw * map.gh);
    const rnd = E.mulberry32(13579);
    const cell = map.cell;
    const at = (pt) => ({ x: (pt.x + 0.5) * cell, y: (pt.y + 0.5) * cell });
    // 互いに離れた陸地の点を選ぶ
    const picked = [];
    const pick = (minH, maxH) => {
      let best = null;
      for (let k = 0; k < 40; k++) {
        const c = at(E.findLand(H, map.gw, map.gh, rnd, minH, maxH));
        const d = picked.length ? Math.min(...picked.map((q) => Math.hypot(q.x - c.x, q.y - c.y))) : 1e9;
        if (!best || d > best.d) best = { c, d };
        if (d > map.gw * cell * 0.22) break;
      }
      picked.push(best.c);
      return best.c;
    };
    const capital = pick(0.08, 0.25);
    const portPt = pick(0.01, 0.05);
    const village = pick(0.05, 0.3);
    const castle = pick(0.2, 0.45);
    const forestPt = pick(0.06, 0.3);
    // 町や城の素材を置く（周りの木や山は少しどける）
    const clearAround = (pt, r) => { map.stamps = map.stamps.filter((st) => Math.hypot(st.x - pt.x, st.y - pt.y) > r); };
    const place = (pt, a, extra) => {
      clearAround(pt, 22);
      map.stamps.push(Object.assign({ id: E.sid(), a, x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10, s: 1.1, r: 0, f: false, v: 0, name: '', entryId: '', note: '' }, extra));
    };
    place(capital, 'castle', { entryId: rune.id, s: 1.8 });
    place(portPt, 'port', { entryId: port.id, s: 1.5 });
    place(village, 'village', { name: 'ハルト村', note: 'リオの故郷', s: 1.5 });
    place(castle, 'fort', { name: '北の砦', s: 1.5 });
    // 黒霧の森：枯れ木を集めて名前を付ける
    clearAround(forestPt, 34);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 30;
      map.stamps.push({ id: E.sid(), a: 'tree-dead', x: Math.round((forestPt.x + Math.cos(a) * rr) * 10) / 10, y: Math.round((forestPt.y + Math.sin(a) * rr * 0.7) * 10) / 10, s: 0.9 + rnd() * 0.3, r: 0, f: rnd() < 0.5, v: Math.floor(rnd() * 5) });
    }
    // 森の名前は曲がった文字で置くので、洞窟の下には出さない
    map.stamps.push({ id: E.sid(), a: 'cave', x: forestPt.x, y: forestPt.y + 4, s: 1.2, r: 0, f: false, v: 0, name: '', entryId: forest.id, note: '', lp: 'none' });
    map.stamps.sort((a, b) => a.y - b.y);
    const mid = (a, b, j) => [Math.round(((a.x + b.x) / 2 + j) * 10) / 10, Math.round(((a.y + b.y) / 2 - j) * 10) / 10];
    map.lines = (map.lines || []).concat([
      { id: UI.uid('ln'), kind: 'highway', points: [[capital.x, capital.y], mid(capital, portPt, 14), [portPt.x, portPt.y]], name: '王都街道', w: 1, wobble: 0.12 },
      { id: UI.uid('ln'), kind: 'road', points: [[capital.x, capital.y], mid(capital, village, -10), [village.x, village.y]], name: '', w: 1, wobble: 0.18 },
      { id: UI.uid('ln'), kind: 'trail', points: [[capital.x, capital.y], mid(capital, forestPt, 8), [forestPt.x, forestPt.y]], name: '', w: 1, wobble: 0.3 },
    ]);
    map.labels = [
      { id: UI.uid('lb'), x: Math.round(map.gw * cell * 0.5), y: Math.round(map.gh * cell * 0.27), text: 'エルミナ王国', style: 'region', size: 30, rotation: -3, vertical: false, curve: 16 },
      { id: UI.uid('lb'), x: Math.round(map.gw * cell * 0.13), y: Math.round(map.gh * cell * 0.82), text: '西の海', style: 'sea', size: 22, rotation: 0, vertical: false, curve: 0 },
      { id: UI.uid('lb'), x: Math.round(forestPt.x), y: Math.round(forestPt.y - 34), text: '黒霧の森', style: 'range', size: 14, rotation: 0, vertical: false, curve: -20 },
    ];
    p.maps = [map];
    p.lastChapterId = c1.id;
    p.goal.daily = 1500;
    return p;
  }

  NS.Sample = { create };
})(window.Tsuzuri = window.Tsuzuri || {});
