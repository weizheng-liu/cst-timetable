import { AlertTriangle } from "lucide-preact";
import { DAYS, type PeriodTimes } from "../lib/periods";
import { cellKey } from "../lib/schedule";
import type { Course } from "../lib/types";
import { FAMILY_VARS, type Family } from "../lib/data";

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
