import { useEffect, useState } from "preact/hooks";

/** 「ホーム画面に追加」。Chrome・Edge は beforeinstallprompt でワンタップ、iOS Safari は手順を案内する */
let deferred: any = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function setupPwa() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // 自動のミニバーは出さず、メニューのボタンから出す
    deferred = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
  if ("serviceWorker" in navigator && !import.meta.env.DEV) {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
  }
}

export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    ios: isIOS(),
    /** ブラウザのインストール画面を出す。出せたら true */
    async prompt(): Promise<boolean> {
      if (!deferred) return false;
      const d = deferred;
      deferred = null;
      notify();
      d.prompt();
      const r = await d.userChoice.catch(() => null);
      return r?.outcome === "accepted";
    },
  };
}
