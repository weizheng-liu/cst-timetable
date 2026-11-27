import type { Course, Term } from "./types";

/** Does a course meet during the given half-term view? 年間 courses meet in both. */
export function inTerm(c: Course, view: "前期" | "後期"): boolean {
  return c.term === view || c.term === "年間" || c.term === "不明";
}

export const cellKey = (day: number, period: number) => `${day}-${period}`;

/** Map "day-period" -> courses occupying that cell (for one term view). */
export function buildCells(courses: Course[], view: "前期" | "後期"): Map<string, Course[]> {
  const m = new Map<string, Course[]>();
  for (const c of courses) {
    if (!inTerm(c, view)) continue;
    for (const s of c.slots) {
      const k = cellKey(s.day, s.period);
      const arr = m.get(k) ?? [];
      if (!arr.includes(c)) arr.push(c);
      m.set(k, arr);
    }
  }
  return m;
}

export interface Conflict {
  day: number;
  period: number;
  term: "前期" | "後期";
  courses: Course[];
}

/** All time conflicts among selected courses, across both terms. */
export function findConflicts(selected: Course[]): Conflict[] {
  const out: Conflict[] = [];
  for (const view of ["前期", "後期"] as const) {
    for (const [k, cs] of buildCells(selected, view)) {
      if (cs.length > 1) {
        const [day, period] = k.split("-").map(Number);
        out.push({ day, period, term: view, courses: cs });
      }
    }
  }
  return out;
}

/** Would adding `c` clash with an already selected course? Returns the clashing courses. */
export function clashesWith(c: Course, selected: Course[]): Course[] {
  const hit = new Set<Course>();
  for (const o of selected) {
    if (o.id === c.id) continue;
    if (!termsOverlap(c.term, o.term)) continue;
    if (c.slots.some((s) => o.slots.some((t) => t.day === s.day && t.period === s.period))) hit.add(o);
  }
  return [...hit];
}

export function termsOverlap(a: Term, b: Term): boolean {
  if (a === "年間" || b === "年間" || a === "不明" || b === "不明") return true;
  return a === b;
}

/** Courses offered in a given cell for the term view. */
export function coursesAt(all: Course[], day: number, period: number, view: "前期" | "後期"): Course[] {
  return all.filter((c) => inTerm(c, view) && c.slots.some((s) => s.day === day && s.period === period));
}
