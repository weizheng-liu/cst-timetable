import { ClipboardPaste, Bookmark, Copy } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";
import { bookmarklet, parseEntries, resolveEntries, type Entry, type Resolved } from "../lib/importer";
import { slotLabel } from "../lib/periods";
import { slotName } from "../lib/i18n";
import { isUnscheduled } from "../lib/schedule";
import type { CustomCourse } from "../lib/custom";
import type { Course } from "../lib/types";
import { t, tv } from "../lib/i18n";

const KEEP = "__keep"; // 表の時間のまま「自分で追加」

interface Props {
  initialCodes: Entry[] | null;
  all: Course[];
  byId: Map<string, Course>;
  selectedIds: Set<string>;
  siteUrl: string;
  /** 表示中の学年が在籍学年より前（過去の記録）なら、時間が変わった科目は表の時間のまま残すのを初期値に */
  past: boolean;
  onApply: (ids: string[], extra: Omit<CustomCourse, "id">[], mode: "replace" | "append") => void;
  onCopied: (msg: string) => void;
}

/** 表の時間と今年度の科目の時間が違うか（オンデマンド化した、時間が動いた） */
function timeDiffers(r: Resolved): boolean {
  if (!r.course || !r.slot) return false;
  return isUnscheduled(r.course) || !r.course.slots.some((s) => s.day === r.slot!.day && s.period === r.slot!.period);
}

function keepAsCustom(r: Resolved): Omit<CustomCourse, "id"> {
  const span = r.entry.span ?? 1;
  const slots = r.slot ? Array.from({ length: span }, (_, i) => ({ day: r.slot!.day, period: r.slot!.period + i })).filter((s) => s.period <= 7) : [];
  return { name: r.course?.name || r.entry.name || r.entry.code, term: r.entry.term === "後期" ? "後期" : r.entry.term === "年間" ? "年間" : "前期", slots, room: null, credits: r.course?.credits ?? 0 };
}

/**
 * 学校の「履修届確認表」から時間割CDと科目名だけを読み取って時間割に並べる。
 * 貼り付けた文字はこの画面の中だけで使い、保存も送信もしない。
 * 時間割CD は年度ごとに振り直されるので、名前が合わなければ名前で今年度の科目を探す。
 */
export function ImportPanel({ initialCodes, all, byId, selectedIds, siteUrl, past, onApply, onCopied }: Props) {
  const [text, setText] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const entries = useMemo(() => (text ? parseEntries(text) : initialCodes ?? []), [text, initialCodes]);
  const rows = useMemo(() => resolveEntries(entries, all, byId), [entries, all, byId]);
  const bm = useMemo(() => bookmarklet(siteUrl), [siteUrl]);

  const defaultOf = (r: Resolved) => (!r.course ? KEEP : timeDiffers(r) && past ? KEEP : r.course.id);
  const valueOf = (r: Resolved) => pick[r.entry.code] ?? defaultOf(r);
  const ids = [...new Set(rows.map(valueOf).filter((v) => v && v !== KEEP))];
  const extra = rows.filter((r) => valueOf(r) === KEEP).map(keepAsCustom);
  const count = ids.length + extra.length;
  const fresh = ids.filter((id) => !selectedIds.has(id)).length + extra.length;
  const changed = rows.filter((r) => r.how !== "code" || timeDiffers(r)).length;

  const copy = (s: string, msg: string) =>
    navigator.clipboard?.writeText(s).then(() => onCopied(msg), () => onCopied(t("コピーできませんでした。長押しで選択してください")));

  return (
    <>
      {!initialCodes && (
        <>
          <ol class="steps">
            <li>{t("学校の履修登録システムで「履修届確認表」を開く")}</li>
            <li>{t("ページ全体を選択してコピー（PC：Ctrl+A → Ctrl+C／スマホ：長押し →「すべて選択」→ コピー）")}</li>
            <li>{t("下の欄に貼り付ける")}</li>
          </ol>
          <label class="paste-box">
            <ClipboardPaste size={15} />
            <textarea
              rows={4}
              placeholder={t("ここに貼り付け（例：(前期)J31D:電磁気学Ⅰ及び演習…）")}
              value={text}
              onInput={(e) => {
                setText((e.target as HTMLTextAreaElement).value);
                setPick({});
              }}
            />
          </label>
          <p class="fine">{t("読み取るのは「(前期)J31D:電磁気学Ⅰ及び演習」のような時間割CDと科目名だけです。氏名・学生番号などは読まず、保存も送信もしません。")}</p>
        </>
      )}

      {rows.length > 0 && (
        <>
          <h3 class="sec-label">
            {t("見つかった科目")} <span class="num">{count}</span>
            {changed > 0 && <span class="dim"> ／ {t("今年度と違う {n}", { n: changed })}</span>}
          </h3>
          <ul class="pick-list shot-list">
            {rows.map((r) => {
              const v = valueOf(r);
              const differs = timeDiffers(r);
              const label = r.slot ? slotName(r.slot.day, r.slot.period) : t("時間外");
              const simple = r.how === "code" && !differs;
              return (
                <li key={r.entry.code} class={`pick shot-row${v ? "" : " off"}`}>
                  <span class="shot-slot mono">{label}</span>
                  <span class="shot-main">
                    <span class="shot-read">
                      <span class="mono">{r.entry.code}</span> {r.entry.name} {r.entry.term && `· ${tv(r.entry.term)}`}
                    </span>
                    {simple ? (
                      <b class="shot-fixed">
                        {r.course!.name} <span class="dim">· {t("{n}単位", { n: r.course!.credits })} · {slotLabel(r.course!.slots)}</span>
                      </b>
                    ) : (
                      <span class="shot-sel">
                        <select value={v} aria-label={t("{code} の取り込み方", { code: r.entry.code })} onChange={(e) => setPick((p) => ({ ...p, [r.entry.code]: (e.target as HTMLSelectElement).value }))}>
                          {r.course && (
                            <option value={r.course.id}>
                              {t("今年度の {name}（{when}）", { name: r.course.name, when: isUnscheduled(r.course) ? t("時間外・オンデマンド") : slotLabel(r.course.slots) })}
                            </option>
                          )}
                          <option value={KEEP}>{t("表の時間のまま自分で追加（{when}・{n}単位）", { when: label + (r.entry.span ? `–${(r.slot?.period ?? 0) + r.entry.span - 1}` : ""), n: r.course?.credits ?? 0 })}</option>
                          <option value="">{t("取り込まない")}</option>
                        </select>
                      </span>
                    )}
                    <span class="tags">
                      {selectedIds.has(v) && <span class="tag on">{t("選択中")}</span>}
                      {(r.how === "renamed" || r.how === "moved") && <span class="tag amber">{t(byId.has(r.entry.code) ? "今年度は {code} が別の科目 · 名前で照合" : "今年度は {code} が無い · 名前で照合", { code: r.entry.code })}</span>}
                      {r.how === "none" && <span class="tag amber">{t("今年度のデータに無い")}</span>}
                      {differs && r.course && isUnscheduled(r.course) && <span class="tag amber">{t("今年度は時間外・オンデマンド")}</span>}
                      {differs && r.course && !isUnscheduled(r.course) && <span class="tag amber">{t("今年度は別の時間")}</span>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {changed > 0 && (
            <p class="fine">
              {t("時間割CD は年度ごとに振り直されるため、前の年度の表はコードではなく科目名で今年度の科目と照合しています。過去の学年に取り込むときは、時間が変わった科目は表の時間のまま「自分で追加した科目」として残すのが初期値です。")}
            </p>
          )}
          {count > 0 && (
            <div class="sheet-cta col">
              <button class="btn primary cta" onClick={() => onApply(ids, extra, "replace")}>
                <span class="cta-name">{t("今の時間割を置き換えて取り込む")}</span>
                <span class="cta-cr">{t("{n}科目", { n: count })}</span>
              </button>
              <button class="btn ghost block" disabled={!fresh} onClick={() => onApply(ids, extra, "append")}>
                {t("今の時間割に追加（新しく {n} 科目）", { n: fresh })}
              </button>
            </div>
          )}
        </>
      )}
      {text && rows.length === 0 && <div class="note miss">{t("時間割CDが見つかりません。「履修届確認表」のページ全体をコピーしたか確認してください。")}</div>}

      {!initialCodes && (
        <details class="bm">
          <summary>
            <Bookmark size={15} /> {t("PC なら「ブックマークレット」でワンクリック")}
          </summary>
          <ol class="steps">
            <li>
              {t("下のボタンをブックマークバーへドラッグ（または URL をコピーして新しいブックマークの URL 欄に貼る）")}
            </li>
            <li>{t("「履修届確認表」を開いた状態でそのブックマークをクリック")}</li>
            <li>{t("このサイトが新しいタブで開き、そのまま取り込み画面になります")}</li>
          </ol>
          <div class="bm-row">
            <a class="btn ghost" href={bm} onClick={(e) => { e.preventDefault(); onCopied(t("ブックマークバーへドラッグして登録してください")); }}>
              <Bookmark size={15} /> {t("時間割に取り込む")}
            </a>
            <button class="btn ghost" onClick={() => copy(bm, t("ブックマークレットをコピーしました"))}>
              <Copy size={15} /> {t("URL をコピー")}
            </button>
          </div>
          <p class="fine">{t("ページ上で時間割CDと科目名を集めて、URL の「#」以降に付けてこのサイトを開くだけです（氏名・学生番号は集めません）。「#」以降はサーバーに送られません。学校のシステムへの操作や送信はしません。")}</p>
        </details>
      )}
    </>
  );
}
