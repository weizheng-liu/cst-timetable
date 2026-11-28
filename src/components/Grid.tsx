import { type PeriodTimes } from "../lib/periods";
import { dateLabel, dayName, t, tv } from "../lib/i18n";
import { cellKey } from "../lib/schedule";
import type { Course } from "../lib/types";
import { roomOf, type Category } from "../lib/data";
import { ALERT_LABEL, md, tokyoWeekday, type Alert } from "../lib/alerts";

const EN_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface Props {
  days: number; // 5 or 6
  periods: number; // 6 or 7
  times: PeriodTimes;
  onPeriod: (period: number) => void;
  cells: Map<string, Course[]>; // selected courses by cell (current term)
  offered: Set<string>; // cells where at least one course is offered
  category: (c: Course) => Category;
  onCell: (day: number, period: number) => void;
  target?: { day: number; period: number } | null; // 選択シートを開いている空きコマ
  moved?: string | null; // 直前に移動した科目（toast が消えるまで強調）
  isRequired?: (c: Course) => boolean; // 必修は「必」の印を付ける
  alertsOf?: (c: Course, day: number) => Alert[]; // 近い試験・次回オンラインなど
}

/**
 * 「緋と方眼」の時間割。方眼紙の上にマスを明示配置し、同じ科目が連続する時限は 1 枚の色块にまとめる。
 * 四隅には製図の対位十字。重複は「斜線 + 1.5px 枠 + 角の点」を必ずセットで出す。
 */
export function Grid({ days, periods, times, onPeriod, cells, offered, category, onCell, target, moved, isRequired, alertsOf }: Props) {
  const todayIdx = tokyoWeekday() - 1; // 日本時間。月=0、日曜は 6 なので列なし
  const items = [];
  if (todayIdx < days)
    items.push(<div key="today-col" class="today-col" aria-hidden="true" style={{ gridColumn: todayIdx + 2, gridRow: `1 / span ${periods + 1}` }} />);
  for (let d = 1; d <= days; d++)
    items.push(
      <div key={`h${d}`} class={`head ${todayIdx === d - 1 ? "today" : ""}`} style={{ gridColumn: d + 1, gridRow: 1 }} aria-label={todayIdx === d - 1 ? t("{day}曜（今日）", { day: dayName(d) }) : undefined}>
        <span class="dname">{dayName(d)}</span>
        {todayIdx === d - 1 && <small class="today-tag">{t("今日")}</small>}
        <small class="en">{EN_DAYS[d - 1]}</small>
      </div>,
    );
  for (let p = 1; p <= periods; p++) {
    items.push(
      <button
        key={`p${p}`}
        class="period"
        style={{ gridColumn: 1, gridRow: p + 1 }}
        aria-label={t("{p}限 {a}〜{b}（授業時間を編集）", { p, a: times[p]?.[0] ?? "", b: times[p]?.[1] ?? "" })}
        onClick={() => onPeriod(p)}
      >
        <b>{p}</b>
        <small>{times[p]?.[0]}</small>
        <small class="end">{times[p]?.[1]}</small>
      </button>,
    );
  }
  const single = (d: number, p: number) => {
    const cs = cells.get(cellKey(d, p)) ?? [];
    return cs.length === 1 ? cs[0] : null;
  };
  for (let d = 1; d <= days; d++) {
    for (let p = 1; p <= periods; p++) {
      const cs = cells.get(cellKey(d, p)) ?? [];
      const label = t("{day}曜 {p}限", { day: dayName(d), p });
      const pos = { gridColumn: d + 1, gridRow: p + 1 };
      if (!cs.length) {
        const isTarget = target?.day === d && target?.period === p;
        items.push(
          <button
            key={`${d}-${p}`}
            class={`cell empty ${offered.has(cellKey(d, p)) ? "has-offer" : ""} ${isTarget ? "is-target" : ""}`}
            style={pos}
            aria-label={`${label} ${t("空き")}${offered.has(cellKey(d, p)) ? t("（開講科目あり）") : ""}`}
            onClick={() => onCell(d, p)}
          >
            {isTarget && <span aria-hidden="true">＋</span>}
          </button>,
        );
        continue;
      }
      if (cs.length > 1) {
        items.push(
          <button key={`${d}-${p}`} class="cell clash" style={pos} aria-label={`${label} ${cs.map((x) => x.name).join(t("と"))}${t("が重複")}`} onClick={() => onCell(d, p)}>
            {cs.slice(0, 2).map((c) => (
              <span key={c.id} class={`half cat-${category(c)}`}>
                <b>{c.name}</b>
              </span>
            ))}
          </button>,
        );
        continue;
      }
      const c = cs[0];
      if (single(d, p - 1)?.id === c.id) continue; // 上のマスにまとめて描いた
      let span = 1;
      while (p + span <= periods && single(d, p + span)?.id === c.id) span++;
      const all = alertsOf?.(c, d) ?? [];
      const hasNote = all.some((a) => a.kind === "note");
      const al = all.filter((a) => a.kind !== "note").slice(0, 2); // マスには大事な順に 2 つまで
      const ex = al.find((a) => a.kind === "exam" || a.kind === "quiz");
      items.push(
        <button
          key={`${d}-${p}`}
          class={`cell filled cat-${category(c)} ${moved === c.id ? "is-moved" : ""} ${ex ? "has-exam" : ""} ${al.length ? "has-alert" : ""} ${hasNote ? "has-note" : ""}`}
          style={{ gridColumn: d + 1, gridRow: `${p + 1} / span ${span}` }}
          aria-label={`${label}${span > 1 ? `–${p + span - 1}` : ""} ${c.name}${isRequired?.(c) ? t("（必修）") : ""}${all.map((a) => `, ${dateLabel(a.date)} ${tv(ALERT_LABEL[a.kind])}${a.text ? `：${a.text}` : ""}`).join("")}`}
          onClick={() => onCell(d, p)}
        >
          <b class="name">{c.name}</b>
          {al.length > 0 && (
            <span class="alerts" aria-hidden="true">
              {al.map((a) => (
                <i key={a.kind} class={`al al-${a.kind}`}>
                  {a.kind === "exam" || a.kind === "quiz" || a.kind === "task" ? `${md(a.date)} ` : ""}
                  {tv(ALERT_LABEL[a.kind])}
                </i>
              ))}
            </span>
          )}
          <small class="meta">
            {isRequired?.(c) && <b class="must">{t("必")}</b>}
            {roomOf(c) ?? tv(c.teachers[0]) ?? ""}
          </small>
        </button>,
      );
    }
  }
  return (
    <div class="gridwrap">
      <div class="grid" style={{ "--days": days, "--periods": periods }} role="grid" aria-label={t("時間割")}>
        {items}
        <i class="reg tl" aria-hidden="true" />
        <i class="reg tr" aria-hidden="true" />
        <i class="reg bl" aria-hidden="true" />
        <i class="reg br" aria-hidden="true" />
      </div>
    </div>
  );
}

export function GridSkeleton({ days = 6, periods = 6 }) {
  const items = [];
  for (let d = 0; d < days; d++) items.push(<div key={`h${d}`} class="skeleton" style={{ gridColumn: d + 2, gridRow: 1, height: 12, margin: "auto 8px" }} />);
  for (let p = 0; p < periods; p++)
    for (let d = 0; d < days; d++) items.push(<div key={`${d}${p}`} class="skeleton" style={{ gridColumn: d + 2, gridRow: p + 2, opacity: 0.7 }} />);
  return (
    <div class="gridwrap">
      <div class="grid" style={{ "--days": days, "--periods": periods }} aria-busy="true" aria-label={t("読み込み中")}>
        {items}
      </div>
    </div>
  );
}

/** sine segment with `cycles` periods and amplitude `amp` across a 100x40 box */
export function tracePath(cycles: number, amp: number): string {
  if (cycles <= 0) return "M0 20 L100 20";
  const pts: string[] = [];
  const steps = Math.max(24, cycles * 16);
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 100;
    const y = 20 - amp * Math.sin((i / steps) * cycles * 2 * Math.PI);
    pts.push(`${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return pts.join(" ");
}

/**
 * オシロスコープテーマ専用: 曜日ごとの「負荷波形」。振幅と周期数がその日のコマ数に比例し、
 * 重複がある日は赤いトレースになる。列は時間割のマスと揃えてある。
 */
export function ScopeTrace({ days, cells }: { days: number; cells: Map<string, Course[]> }) {
  const cols = [];
  cols.push(
    <div key="l" class="trace-label num">
      LOAD
    </div>,
  );
  for (let d = 1; d <= days; d++) {
    let n = 0;
    let err = false;
    for (let p = 1; p <= 7; p++) {
      const cs = cells.get(cellKey(d, p)) ?? [];
      if (cs.length) n++;
      if (cs.length > 1) err = true;
    }
    cols.push(
      <svg key={d} class={`trace ${err ? "err" : ""} ${n ? "" : "idle"}`} viewBox="0 0 100 40" preserveAspectRatio="none">
        <line x1="0" y1="20" x2="100" y2="20" class="axis" />
        <path d={tracePath(n, n ? 5 + n * 2.2 : 0)} />
      </svg>,
    );
  }
  return (
    <div class="scope-trace" style={{ "--days": days }} aria-hidden="true">
      {cols}
    </div>
  );
}
