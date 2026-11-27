declare const __BUILD_ID__: string;

const KEY = "cst-timetable:reloaded-for";

/**
 * 公開中の版（version.json、キャッシュなしで取得）と、いま動いている版を比べる。
 * 違えば新しい版へ 1 回だけ再読み込みする（同じ版に対して 2 回目はしない＝無限ループ防止）。
 * 起動時と、アプリに戻ってきたとき（タブ切り替え・スマホの復帰）に確認する。
 */
export function keepFresh() {
  if (typeof __BUILD_ID__ === "undefined" || import.meta.env.DEV) return;
  const check = async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: "no-store" });
      if (!r.ok) return;
      const { build } = await r.json();
      if (!build || build === __BUILD_ID__) return;
      if (sessionStorage.getItem(KEY) === build) return;
      sessionStorage.setItem(KEY, build);
      const u = new URL(location.href);
      u.searchParams.set("v", build); // クエリを変えて、キャッシュ済みの古い HTML を確実に避ける
      location.replace(u.toString());
    } catch {
      /* オフラインなどは何もしない */
    }
  };
  check();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
}
