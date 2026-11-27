import { AlertTriangle } from "lucide-preact";
import { DAYS, type PeriodTimes } from "../lib/periods";
import { cellKey } from "../lib/schedule";
import type { Course } from "../lib/types";
import { FAMILY_VARS, type Family } from "../lib/data";

const EN_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface Props {
  days: number; // 5 or 6
  periods: number; // 6 or 7
  times: PeriodTimes;
  onPeriod: (period: number) => void;
  cells: Map<string, Course[]>; // selected courses by cell (current term)
  offered: Set<string>; // cells where at least one course is offered
  family: (c: Course) => Family;
  onCell: (day: number, period: number) => void;
}

export function Grid({ days, periods, times, onPeriod, cells, offered, family, onCell }: Props) {
  const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0
  const rows = [];
  rows.push(<div key="corner" />);
  for (let d = 1; d <= days; d++)
    rows.push(
      <div key={`h${d}`} class={`head ${todayIdx === d - 1 ? "today" : ""}`}>
        {DAYS[d - 1]}
        <small class="en">{EN_DAYS[d - 1]}</small>
      </div>,
    );
  for (let p = 1; p <= periods; p++) {
    rows.push(
      <button key={`p${p}`} class="period" aria-label={`${p}限 ${times[p]?.[0]}〜${times[p]?.[1]}（授業時間を編集）`} onClick={() => onPeriod(p)}>
        <b>{p}</b>
        <span class="t">{times[p]?.[0]}</span>
        <span class="t end">{times[p]?.[1]}</span>
      </button>,
    );
    for (let d = 1; d <= days; d++) {
      const cs = cells.get(cellKey(d, p)) ?? [];
      rows.push(<Cell key={`${d}-${p}`} d={d} p={p} cs={cs} cells={cells} offered={offered.has(cellKey(d, p))} family={family} onCell={onCell} />);
    }
  }
  return (
    <div class="grid" style={{ "--days": days }} role="grid" aria-label="時間割">
      {rows}
    </div>
  );
}

function Cell({ d, p, cs, cells, offered, family, onCell }: { d: number; p: number; cs: Course[]; cells: Map<string, Course[]>; offered: boolean; family: Props["family"]; onCell: Props["onCell"] }) {
  const label = `${DAYS[d - 1]}曜${p}限`;
  if (!cs.length) {
    return <button class={`cell empty ${offered ? "has-offer" : ""}`} aria-label={`${label} 空き${offered ? "（開講科目あり）" : ""}`} onClick={() => onCell(d, p)} />;
  }
  const conflict = cs.length > 1;
  const c = cs[0];
  const same = (k: string) => {
    const o = cells.get(k) ?? [];
    return !conflict && o.length === 1 && o[0].id === c.id;
  };
  const up = same(cellKey(d, p - 1));
  const down = same(cellKey(d, p + 1));
  const fam = FAMILY_VARS[family(c)];
  return (
    <button
      class={`cell filled ${conflict ? "conflict" : ""} ${up ? "cont-up" : ""} ${down ? "cont-down" : ""}`}
      style={{ "--tint": fam.tint, "--bar": fam.bar }}
      aria-label={`${label} ${cs.map((x) => x.name).join("、")}${conflict ? " 時間が重複しています" : ""}`}
      onClick={() => onCell(d, p)}
    >
      <span class="tint" />
      {up ? null : (
        <>
          <span class="name">{c.name}</span>
          {!conflict && <span class="meta">{c.teachers[0] ?? ""}</span>}
        </>
      )}
      {conflict && (
        <span class="badge-conflict">
          <AlertTriangle size={11} />
          <span class="wide-only">{cs.length}件重複</span>
          <span class="narrow-only">{cs.length}</span>
        </span>
      )}
    </button>
  );
}

export function GridSkeleton({ days = 6, periods = 6 }) {
  const items = [];
  items.push(<div key="c" />);
  for (let d = 0; d < days; d++) items.push(<div key={`h${d}`} class="skeleton" style={{ height: 14, margin: "2px 8px 4px" }} />);
  for (let p = 0; p < periods; p++) {
    items.push(<div key={`p${p}`} />);
    for (let d = 0; d < days; d++) items.push(<div key={`${d}${p}`} class="skeleton" style={{ minHeight: 76, opacity: 0.7 }} />);
  }
  return (
    <div class="grid" style={{ "--days": days }} aria-busy="true" aria-label="読み込み中">
      {items}
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
