// 綴り — サービスワーカー（オフラインでも使えるように、アプリのファイルを保存しておく）
// 作品のデータはブラウザの保存領域（IndexedDB）にあり、ここでは扱わない。
// AI（api.anthropic.com）や辞書（Wikipedia など）への通信は保存せず、そのまま通す。
const VERSION = '2a41bf483cfb';
const CACHE = 'tsuzuri-' + VERSION;
const FONT_CACHE = 'tsuzuri-fonts';
const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/textstats.js",
  "./js/readings.js",
  "./js/dictdata.js",
  "./js/publish.js",
  "./js/diff.js",
  "./js/importtext.js",
  "./js/epub.js",
  "./js/genko.js",
  "./js/names.js",
  "./js/proofread.js",
  "./js/consistency.js",
  "./js/mapengine.js",
  "./js/mapassets.js",
  "./js/util.js",
  "./js/store.js",
  "./js/app.js",
  "./js/views/editor.js",
  "./js/views/lore.js",
  "./js/views/relmap.js",
  "./js/views/ideas.js",
  "./js/views/map.js",
  "./js/views/preview.js",
  "./js/views/dict.js",
  "./js/views/publish-dialog.js",
  "./js/views/import-dialog.js",
  "./js/views/manuscript.js",
  "./js/ai.js",
  "./js/sample.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('tsuzuri-') && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 同じ場所のアプリのファイル：保存してある版をすぐ返し、裏で新しい版を取り直す
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { e.waitUntil(fresh); return hit; }
      const res = await fresh;
      if (res) return res;
      // オフラインでページを開いたとき
      if (req.mode === 'navigate') return (await c.match('./index.html')) || Response.error();
      return Response.error();
    }));
    return;
  }
  // Google Fonts：一度読んだら保存して、オフラインでも同じ書体で表示する
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      } catch (err) { return Response.error(); }
    }));
  }
  // それ以外（AI・辞書・SDK など）は何もしない（ブラウザに任せる）
});
