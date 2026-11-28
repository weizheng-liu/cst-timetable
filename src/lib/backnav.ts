// スマホの「戻る」（Android の戻るボタン・戻るジェスチャー、ブラウザの戻る）を、アプリの中の「1 つ前へ」にする。
//
// 履歴の並び：[元のページ, 見張り, パネル1, パネル2, …]
// - パネル（シート）を 1 枚開くごとに履歴を 1 つ積む。戻る = いちばん上のパネルを閉じる。
// - 画面の ×・背景タップでパネルを閉じたときは、積んだ分の履歴を history.go(-n) で消す（その popstate は無視）。
// - 「見張り」はホーム画面で戻るを押したときの受け皿。最初のタップで積む（操作なしで積んだ履歴は
//   Chrome が戻るで飛ばすことがあるため）。ホームで戻る → 見張りが外れて「もう一度で終了」を出す。
//   2 秒以内にもう一度戻ると、本当にサイト（アプリ）を出る。2 秒たつか画面に触れると見張りを積み直す。
import { useEffect, useRef } from "preact/hooks";

const EXIT_WINDOW = 2000;

export function useBackButton(depth: number, onBack: () => void, onExitWarn: () => void) {
  const pushed = useRef(0); // 積んだパネルの数
  const guard = useRef(false); // 見張りが積まれているか
  const ignore = useRef(0); // 自分で history.go した分の popstate を無視する
  const timer = useRef<number | undefined>(undefined);
  const cb = useRef({ onBack, onExitWarn });
  cb.current = { onBack, onExitWarn };

  const armGuard = () => {
    if (guard.current || pushed.current > 0) return;
    history.pushState({ cst: "guard" }, "");
    guard.current = true;
  };

  useEffect(() => {
    const onPop = () => {
      if (ignore.current > 0) {
        ignore.current--;
        return;
      }
      if (pushed.current > 0) {
        pushed.current--;
        cb.current.onBack();
        return;
      }
      // ホームで戻る：見張りが外れた。次の戻るでアプリを出る
      guard.current = false;
      cb.current.onExitWarn();
      clearTimeout(timer.current);
      timer.current = window.setTimeout(armGuard, EXIT_WINDOW);
    };
    // 見張りは最初の操作で積む（ユーザー操作のあとに積んだ履歴は戻るで飛ばされない）
    const onTouch = () => {
      if (!guard.current) {
        clearTimeout(timer.current);
        armGuard();
      }
    };
    addEventListener("popstate", onPop);
    addEventListener("pointerdown", onTouch, true);
    addEventListener("keydown", onTouch, true);
    return () => {
      removeEventListener("popstate", onPop);
      removeEventListener("pointerdown", onTouch, true);
      removeEventListener("keydown", onTouch, true);
      clearTimeout(timer.current);
    };
  }, []);

  // パネルの枚数と履歴をそろえる
  useEffect(() => {
    if (depth > pushed.current) {
      if (!guard.current && pushed.current === 0) {
        history.pushState({ cst: "guard" }, "");
        guard.current = true;
      }
      for (let i = pushed.current; i < depth; i++) history.pushState({ cst: "panel", depth: i + 1 }, "");
      pushed.current = depth;
    } else if (depth < pushed.current) {
      // × や背景タップで閉じた：積んだ履歴を消す（popstate は 1 回だけ来る）
      ignore.current++;
      history.go(depth - pushed.current);
      pushed.current = depth;
    }
  }, [depth]);
}
