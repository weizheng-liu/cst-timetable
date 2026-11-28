import { normName } from "./credits";
import { dayName, t } from "./i18n";
import { clashesWith, inTerm } from "./schedule";
import type { Course, Slot } from "./types";

export type ResolveOption =
  | { kind: "move"; from: Course; to: Course; recommended: true }
  | { kind: "keep"; keep: Course; drop: Course; dropRequired: boolean };

/** "金曜 4限" / "金曜 3・4限" / "月曜 1限・木曜 2限" */
export function slotText(slots: Slot[]): string {
  const byDay = new Map<number, number[]>();
  for (const s of slots) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.period]);
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, ps]) => t("{day}曜 {p}限", { day: dayName(d), p: ps.sort((a, b) => a - b).join("・") }))
    .join("・");
}

/**
 * 同じ科目の別クラスのうち、x を外せば今の時間割と一切ぶつからないもの。
 * 同名・同学期・履修可能（canTake）であることが条件。
 */
export function alternativesFor(x: Course, all: Course[], selected: Course[], view: "前期" | "後期", canTake: (c: Course) => boolean): Course[] {
  const rest = selected.filter((s) => s.id !== x.id);
  const name = normName(x.name);
  return all.filter((c) => c.id !== x.id && normName(c.name) === name && c.slots.length > 0 && inTerm(c, view) && canTake(c) && !rest.some((s) => s.id === c.id) && clashesWith(c, rest).length === 0);
}

/**
 * 重複した 2 科目の解決方法。単位を失わない「移動」があれば必ず先頭（おすすめ）に置き、
 * 続いて「A だけ残す」「B だけ残す」。必修を外す選択肢は dropRequired で印を付ける。
 */
export function resolveOptions(a: Course, b: Course, all: Course[], selected: Course[], view: "前期" | "後期", canTake: (c: Course) => boolean, isRequired: (c: Course) => boolean): ResolveOption[] {
  const out: ResolveOption[] = [];
  // 必修でない方を動かす案を優先する
  const movers = [a, b].sort((x, y) => Number(isRequired(x)) - Number(isRequired(y)));
  for (const x of movers) {
    const alt = alternativesFor(x, all, selected, view, canTake)[0];
    if (alt) {
      out.push({ kind: "move", from: x, to: alt, recommended: true });
      break;
    }
  }
  const keeps: ResolveOption[] = [
    { kind: "keep", keep: a, drop: b, dropRequired: isRequired(b) },
    { kind: "keep", keep: b, drop: a, dropRequired: isRequired(a) },
  ];
  // 必修を外さない方を先に
  keeps.sort((x, y) => Number((x as any).dropRequired) - Number((y as any).dropRequired));
  return [...out, ...keeps];
}
