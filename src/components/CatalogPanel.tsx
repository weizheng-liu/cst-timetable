import { t, tv } from "../lib/i18n";
import { useMemo, useState } from "preact/hooks";
import { KINDS, buildCatalog, type Kind } from "../lib/catalog";
import { slotLabel } from "../lib/periods";
import type { Course, ReqCourse, Requirements } from "../lib/types";

interface Props {
  courses: Course[]; // 今学期・表示中の学年で取れる科目
  req: Requirements | null;
  reqOf: (c: Course) => ReqCourse | undefined;
  selectedIds: Set<string>;
  isPassed: (c: Course) => boolean;
  onToggle: (c: Course) => void;
  onOpen: (c: Course) => void;
  homeCampus: string | null;
}

/** 今学期に取れる科目の一覧。区分ごとに色分けし、クラスごとの曜日・時限をボタンで出す */
export function CatalogPanel({ courses, req, reqOf, selectedIds, isPassed, onToggle, onOpen, homeCampus }: Props) {
  const cat = useMemo(() => buildCatalog(courses, reqOf, req), [courses, req]);
  const [only, setOnly] = useState<Kind | "all">("all");
  const kinds = KINDS.filter((k) => cat.get(k.id)!.length);
  return (
    <>
      <div class="chips cat-chips" role="tablist" aria-label={t("区分で絞り込み")}>
        <button role="tab" aria-selected={only === "all"} class={`chip ${only === "all" ? "on" : ""}`} onClick={() => setOnly("all")}>
          {t("すべて")}
        </button>
        {kinds.map((k) => (
          <button key={k.id} role="tab" aria-selected={only === k.id} class={`chip kchip t-${k.tone} ${only === k.id ? "on" : ""}`} onClick={() => setOnly(k.id)}>
            <i class="kmark" aria-hidden="true">{tv(k.mark)}</i>
            {tv(k.label)}
            <span class="num">{cat.get(k.id)!.length}</span>
          </button>
        ))}
      </div>
      {kinds
        .filter((k) => only === "all" || only === k.id)
        .map((k) => (
          <section key={k.id} class={`cat-sec t-${k.tone}`}>
            <h3 class="cat-h">
              <i class="kmark" aria-hidden="true">{tv(k.mark)}</i>
              {tv(k.label)}
              <span class="num">{t("{n}科目", { n: cat.get(k.id)!.length })}</span>
            </h3>
            <ul class="cat-list">
              {cat.get(k.id)!.map((e) => {
                const passed = isPassed(e.sections[0]);
                const onAny = e.sections.some((c) => selectedIds.has(c.id));
                return (
                  <li key={e.key} class={`cat-item ${passed ? "passed" : ""} ${onAny ? "has-on" : ""}`}>
                    <button class="cat-name" onClick={() => onOpen(e.sections[0])}>
                      <b>{e.name}</b>
                      <span class="cat-meta">
                        <em class="num">{e.credits}</em>{t("単位")}
                        {e.tag && e.tag !== k.label && <> · {tv(e.tag)}</>}
                        {passed && <span class="tag pass">{t("修得済")}</span>}
                      </span>
                    </button>
                    {(() => {
                      const campuses = [...new Set(e.sections.map((c) => c.campus).filter(Boolean))];
                      return (
                        (e.distinctTimes > 1 || campuses.length > 1) && (
                          <span class="multi">
                            {e.distinctTimes > 1 && t("時間 {n}通り", { n: e.distinctTimes })}
                            {e.distinctTimes > 1 && campuses.length > 1 && " · "}
                            {campuses.length > 1 && t("{c}で開講", { c: campuses.join("・") })}
                          </span>
                        )
                      );
                    })()}
                    <span class="times">
                      {e.sections.map((c) => {
                        const on = selectedIds.has(c.id);
                        const away = !!(homeCampus && c.campus && c.campus !== homeCampus);
                        return (
                          <button
                            key={c.id}
                            class={`time ${on ? "on" : ""} ${away ? "away" : ""}`}
                            aria-pressed={on}
                            aria-label={`${e.name} ${slotLabel(c.slots)} ${c.campus ?? ""}${c.teachers[0] ? ` ${c.teachers[0]}` : ""}: ${on ? t("外す") : t("時間割に追加")}`}
                            onClick={() => onToggle(c)}
                          >
                            <b>{c.slots.length ? slotLabel(c.slots) : t("集中・時間外")}</b>
                            <small>
                              <span class={`campus ${away ? "away" : ""}`}>{c.campus ?? "—"}</span>
                              {e.sections.length > 1 && <> · {c.teachers[0]?.replace(/\s.*$/, "") ?? c.id}</>}
                            </small>
                          </button>
                        );
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      {!kinds.length && <p class="muted">{t("この学期に取れる科目が見つかりません。")}</p>}
      <p class="fine">{t("時間のボタンを押すとそのクラスを時間割に追加・解除します。科目名を押すと詳細。区分は学部要覧の配置表から、要覧にない科目は推定です。点線のクラスは普段と別のキャンパス（{c}以外）での開講です。", { c: homeCampus ?? "—" })}</p>
    </>
  );
}
