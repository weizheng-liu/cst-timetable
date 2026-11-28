import { t } from "../lib/i18n";
import { Share, SquarePlus, MoreVertical, Monitor } from "lucide-preact";

/** ワンタップで入れられないブラウザ向けの手順（主に iPhone / iPad の Safari） */
export function InstallPanel({ ios }: { ios: boolean }) {
  return (
    <>
      {ios ? (
        <ol class="install-steps">
          <li>
            <span class="ico"><Share size={18} /></span>
            <span>{t("Safari の下（iPad は右上）の")} <b>{t("共有ボタン")}</b> {t("を押す")}</span>
          </li>
          <li>
            <span class="ico"><SquarePlus size={18} /></span>
            <span>{t("メニューを少し下へ送って")} <b>{t("「ホーム画面に追加」")}</b> {t("を選ぶ")}</span>
          </li>
          <li>
            <span class="ico num">3</span>
            <span>{t("右上の")} <b>{t("「追加」")}</b> {t("を押すと、ホーム画面にアイコンが並びます")}</span>
          </li>
        </ol>
      ) : (
        <ol class="install-steps">
          <li>
            <span class="ico"><MoreVertical size={18} /></span>
            <span>{t("Chrome・Edge：右上のメニュー →")}<b>{t("「アプリをインストール」")}</b>{t("または")}<b>{t("「ホーム画面に追加」")}</b></span>
          </li>
          <li>
            <span class="ico"><Monitor size={18} /></span>
            <span>{t("Mac の Safari：メニューバーの「ファイル」→")}<b>{t("「Dock に追加」")}</b></span>
          </li>
        </ol>
      )}
      <p class="fine">
        {ios ? t("iPhone・iPad では、ほかのアプリ（LINE・Chrome など）の中ではなく Safari で開いているときだけ追加できます。") : ""}
        {t("追加したアイコンから開くと、ブラウザの枠なしで全画面表示になります。時間割や成績はこれまでどおりこの端末にだけ保存されます。")}
      </p>
    </>
  );
}
