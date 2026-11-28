/*
 * ホーム画面に追加したとき用の最小限のサービスワーカー。
 * いつもネットワークを先に使い（＝最新版が出ていれば必ずそれを表示）、つながらないときだけ前回のコピーを出す。
 * version.json（自動更新の確認）は横取りしない。個人のデータは扱わない（localStorage はここを通らない）。
 */
const CACHE = "cst-timetable-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (e) => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin) return;
  if (u.pathname.endsWith("/version.json") || u.pathname.endsWith("/sw.js")) return;
  e.respondWith(
    fetch(r)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(r.mode === "navigate" ? new URL("./", self.registration.scope).href : r, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(r.mode === "navigate" ? new URL("./", self.registration.scope).href : r)
          .then((m) => m || Response.error()),
      ),
  );
});
