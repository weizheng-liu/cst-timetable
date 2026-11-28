import { Share, SquarePlus, MoreVertical, Monitor } from "lucide-preact";

/** ワンタップで入れられないブラウザ向けの手順（主に iPhone / iPad の Safari） */
export function InstallPanel({ ios }: { ios: boolean }) {
  return (
    <>
      {ios ? (
        <ol class="install-steps">
          <li>
            <span class="ico"><Share size={18} /></span>
            <span>Safari の下（iPad は右上）の <b>共有ボタン</b> を押す</span>
          </li>
          <li>
            <span class="ico"><SquarePlus size={18} /></span>
            <span>メニューを少し下へ送って <b>「ホーム画面に追加」</b> を選ぶ</span>
          </li>
          <li>
            <span class="ico num">3</span>
            <span>右上の <b>「追加」</b> を押すと、ホーム画面にアイコンが並びます</span>
          </li>
        </ol>
      ) : (
        <ol class="install-steps">
          <li>
            <span class="ico"><MoreVertical size={18} /></span>
            <span>Chrome・Edge：右上のメニュー →<b>「アプリをインストール」</b>または<b>「ホーム画面に追加」</b></span>
          </li>
          <li>
            <span class="ico"><Monitor size={18} /></span>
            <span>Mac の Safari：メニューバーの「ファイル」→<b>「Dock に追加」</b></span>
          </li>
        </ol>
      )}
      <p class="fine">
        {ios ? "iPhone・iPad では、ほかのアプリ（LINE・Chrome など）の中ではなく Safari で開いているときだけ追加できます。" : ""}
        追加したアイコンから開くと、ブラウザの枠なしで全画面表示になります。時間割や成績はこれまでどおりこの端末にだけ保存されます。
      </p>
    </>
  );
}
