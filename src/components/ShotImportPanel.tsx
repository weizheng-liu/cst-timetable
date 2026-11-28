import { ImagePlus, RotateCcw } from "lucide-preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { readScreenshot, type ShotRead } from "../lib/ocr";
import { chosenIds, gradeForYear, matchCells, type CellMatch } from "../lib/screenshot";

import { isUnscheduled } from "../lib/schedule";
import type { Course } from "../lib/types";
import type { CustomCourse } from "../lib/custom";
import { dayName, slotName, t, tv } from "../lib/i18n";

const MY = "__my"; // 自分の科目として追加
const KEEP = "__keep"; // 照合した科目を、画像の時間のまま自分で追加

type Term = "前期" | "後期";

interface Props {
  all: Course[];
  starts: Record<number, string>;
  viewGrade: number;
  view: Term;
  dataYear: number | null;
  nowGrade: number | null;
  onApply: (ids: string[], extra: Omit<CustomCourse, "id">[], grade: number, term: Term, mode: "replace" | "append") => void;
}

/**
 * 他の時間割アプリの画面写真を、この端末の中だけで読み取って取り込む。
 * 画像はどこにも送らず、保存もしない（閉じれば消える）。
 */
export function ShotImportPanel({ all, starts, viewGrade, view, dataYear, nowGrade, onApply }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [shot, setShot] = useState<ShotRead | null>(null);
  const [busy, setBusy] = useState<[number, number] | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [grade, setGrade] = useState(viewGrade);
  const [term, setTerm] = useState<Term>(view);
  const [pick, setPick] = useState<Record<string, string>>({}); // "曜-限" → 科目 id（"" は取り込まない、MY は自分で追加）
  const [names, setNames] = useState<Record<string, string>>({}); // 自分で追加する科目の名前（直したもの）

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setFail(null);
    setShot(null);
    setPick({});
    setNames({});
    setUrl(URL.createObjectURL(f));
    setBusy([0, 1]);
    try {
      const r = await readScreenshot(f, starts, (d, t) => setBusy([d, t]));
      if (!r) setFail(t("時間割の格子が見つかりませんでした。曜日と時限が並んだ画面全体の写真を選んでください。"));
      else {
        setShot(r);
        if (r.term) setTerm(r.term);
        const g = gradeForYear(r.year, dataYear, nowGrade);
        if (g) setGrade(g);
      }
    } catch (e) {
      console.error(e);
      setFail(t("読み取りに失敗しました。通信が切れていないか（初回だけ日本語データ 2MB を読み込みます）確かめて、もう一度試してください。"));
    } finally {
      setBusy(null);
    }
  }

  const matches = useMemo(() => (shot ? matchCells(shot.cells, all, term) : []), [shot, all, term]);
  const keyOf = (m: CellMatch) => `${m.day}-${m.period}`;
  // 照合できなかったマスは、はじめから「自分の科目として追加」にしておく
  // 過去の学年に入れるときは、今年度で時間が変わった科目（オンデマンド化を含む）を画像の時間のまま残す
  const differs = (m: CellMatch) => !!m.course && (m.moved || isUnscheduled(m.course));
  const past = nowGrade != null && grade < nowGrade;
  const valueOf = (m: CellMatch): string => pick[keyOf(m)] ?? (m.course ? (past && differs(m) ? KEEP : m.course.id) : MY);
  const final = matches.map((m) => {
    const v = valueOf(m);
    return { ...m, value: v, course: v === MY || v === KEEP || !v ? null : (m.course?.id === v ? m.course : (all.find((c) => c.id === v) ?? null)) };
  });
  const ids = chosenIds(final);
  const nameOf = (m: CellMatch) => (names[keyOf(m)] ?? m.name).trim();
  const extra: Omit<CustomCourse, "id">[] = [];
  for (const m of final) {
    const orig = matches.find((x) => keyOf(x) === keyOf(m))!;
    if (m.value === KEEP && orig.course) {
      const e = extra.find((x) => x.name === orig.course!.name);
      if (e) e.slots.push({ day: m.day, period: m.period });
      else extra.push({ name: orig.course.name, term, slots: [{ day: m.day, period: m.period }], room: m.rooms[0] ?? null, credits: orig.course.credits });
      continue;
    }
    if (m.value !== MY || !nameOf(m)) continue;
    const name = nameOf(m);
    const e = extra.find((x) => x.name === name);
    if (e) e.slots.push({ day: m.day, period: m.period });
    else extra.push({ name, term, slots: [{ day: m.day, period: m.period }], room: m.rooms[0] ?? null, credits: 0 });
  }
  const count = ids.length + extra.length;
  const unread = shot ? shot.filled.length - matches.length : 0;

  return (
    <>
      {!busy && !shot && (
        <>
          <ol class="steps">
            <li>{t("他の時間割アプリで、曜日と時限が並んだ週の画面を開く")}</li>
            <li>{t("スクリーンショットを撮る（氏名や学生番号が写らない画面で）")}</li>
            <li>{t("下のボタンからその画像を選ぶ")}</li>
          </ol>
          <label class="btn primary block shot-pick">
            <ImagePlus size={16} /> {t("画像を選ぶ")}
            <input type="file" accept="image/*" onChange={(e) => onFile((e.target as HTMLInputElement).files?.[0])} />
          </label>
          <p class="fine">{t("画像はこの端末の中だけで読み取ります。送信も保存もしません。初回だけ文字認識用の日本語データ（約 2MB）をこのサイトから読み込みます。")}</p>
          {fail && <div class="note miss">{fail}</div>}
        </>
      )}

      {busy && (
        <div class="shot-busy">
          <b>{t("読み取り中…")} {busy[1] > 1 ? `${busy[0]} / ${busy[1]}` : t("準備しています")}</b>
          <span class="shot-bar">
            <i style={{ width: `${(100 * busy[0]) / Math.max(1, busy[1])}%` }} />
          </span>
          <span class="fine">{t("1 マスずつ文字を読んでいます。スマホでは 30 秒ほどかかることがあります。")}</span>
        </div>
      )}

      {shot && url && (
        <>
          <div class="shot-head">
            <figure class="shot-fig">
              <img src={url} alt="" />
              <svg viewBox={`0 0 ${shot.width} ${shot.height}`} preserveAspectRatio="none">
                {shot.filled.map(({ ci, ri }) => {
                  const c = shot.grid.cols[ci];
                  const r = shot.grid.rows[ri];
                  const m = final.find((x) => x.day === shot.days[ci] && x.period === shot.periods[ri]);
                  const cls = !m?.course ? (m?.value ? "low" : "miss") : m.score < 0.6 || m.moved ? "low" : "ok";
                  return <rect key={`${ci}-${ri}`} class={cls} x={c.start} y={r.start} width={c.end - c.start} height={r.end - r.start} rx={12} />;
                })}
              </svg>
            </figure>
            <div class="shot-opts">
              <label class="field">
                <span>{t("取り込む学年")}</span>
                <select value={grade} onChange={(e) => setGrade(+(e.target as HTMLSelectElement).value)}>
                  {[1, 2, 3, 4].map((g) => (
                    <option value={g}>{t("{n}年の計画", { n: g })}</option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span>{t("学期")}</span>
                <select value={term} onChange={(e) => setTerm((e.target as HTMLSelectElement).value as Term)}>
                  <option value="前期">{t("前期")}</option>
                  <option value="後期">{t("後期")}</option>
                </select>
              </label>
              {shot.year && (
                <p class="fine">
                  {t("画像の見出し：{y}年", { y: shot.year })}{shot.term ? ` ${tv(shot.term)}` : ""}
                </p>
              )}
              <button class="btn ghost block" onClick={() => { setShot(null); setUrl(null); }}>
                <RotateCcw size={14} /> {t("別の画像")}
              </button>
            </div>
          </div>

          <h3 class="sec-label">
            {t("読み取った科目")} <span class="num">{count}</span>
            {extra.length > 0 && <span class="dim"> ／ {t("うち自分で追加 {n}", { n: extra.length })}</span>}
            {unread > 0 && <span class="dim"> ／ {t("読めなかったマス {n}", { n: unread })}</span>}
          </h3>
          <ul class="pick-list shot-list">
            {final.map((m) => {
              const orig = matches.find((x) => keyOf(x) === keyOf(m))!;
              const opts = [...orig.options.map((o) => o.course)];
              if (orig.course && !opts.some((c) => c.id === orig.course!.id)) opts.unshift(orig.course);
              const unsure = m.course && pick[keyOf(m)] === undefined && (m.score < 0.6 || m.moved);
              return (
                <li key={keyOf(m)} class={`pick shot-row${m.value ? "" : " off"}`}>
                  <span class="shot-slot mono">
                    {dayName(m.day)}
                    {m.period}
                  </span>
                  <span class="shot-main">
                    <span class="shot-read">{t("読み取り：")}{m.name || "—"}</span>
                    <span class="shot-sel">
                      <select
                        value={m.value}
                        aria-label={t("{slot}限の科目", { slot: slotName(m.day, m.period) })}
                        onChange={(e) => setPick((p) => ({ ...p, [keyOf(m)]: (e.target as HTMLSelectElement).value }))}
                      >
                        {opts.map((c) => (
                          <option value={c.id}>
                            {c.name}
                            {c.classGroup ? `（${c.classGroup}）` : ""} · {c.teachers[0] ?? ""}
                          </option>
                        ))}
                        {orig.course && differs(orig) && (
                          <option value={KEEP}>
                            {t("画像の時間のまま追加（{name}・{n}単位）", { name: orig.course.name, n: orig.course.credits })}
                          </option>
                        )}
                        <option value={MY}>{t("自分の科目として追加（データに無い科目）")}</option>
                        <option value="">{t("取り込まない")}</option>
                      </select>
                    </span>
                    {m.value === MY && (
                      <input
                        class="shot-name"
                        value={names[keyOf(m)] ?? m.name}
                        maxLength={60}
                        aria-label={t("追加する科目の名前")}
                        placeholder={t("科目名")}
                        onInput={(e) => setNames((n) => ({ ...n, [keyOf(m)]: (e.target as HTMLInputElement).value }))}
                      />
                    )}
                    <span class="tags">
                      {m.value === MY && <span class="tag amber">{t(orig.options.length ? "候補に無いので自分で追加" : "この時間に候補なし · 自分で追加")}{t("（単位 0・名前は直せます）")}</span>}
                      {!m.value && <span class="tag">{t("取り込まない")}</span>}
                      {unsure && !orig.moved && <span class="tag amber">{t("名前が近い科目 · 確かめて")}</span>}
                      {unsure && orig.moved && <span class="tag amber">{t("今年は別の時間 · 確かめて")}</span>}
                      {m.value === KEEP && orig.course && <span class="tag amber">{t(isUnscheduled(orig.course) ? "画像の時間のまま · 今年度は時間外・オンデマンド" : "画像の時間のまま · 今年度は別の時間")}</span>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {!final.length && <div class="note miss">{t("マスの文字が読めませんでした。画面を拡大してから撮り直すと読めることがあります。")}</div>}
          <p class="fine">
            {t("時間割のデータは {y}年度のものです。昔の画面なら、今年度の同じ名前の科目に置き換えて取り込みます。候補に無い科目は「自分の科目として追加」で入ります（単位 0、あとで詳細から消せます）。", { y: dataYear ?? "—" })}
          </p>
          {count > 0 && (
            <div class="sheet-cta col">
              <button class="btn primary cta" onClick={() => onApply(ids, extra, grade, term, "replace")}>
                <span class="cta-name">
                  {t("{n}年の{term}をこの内容にする", { n: grade, term: tv(term) })}
                </span>
                <span class="cta-cr">{t("{n}科目", { n: count })}</span>
              </button>
              <button class="btn ghost block" onClick={() => onApply(ids, extra, grade, term, "append")}>
                {t("{n}年の{term}に追加する", { n: grade, term: tv(term) })}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
