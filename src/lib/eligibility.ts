import type { Course } from "./types";

/**
 * Can a student of (dept, grade) take this course?
 *  yes        : 対象。通常の一覧に出す
 *  otherGrade : 学科は対象だが配当年次が違う（「他学年も表示」で出す）
 *  maybe      : 「クラス」欄を読み取れなかった共通科目。一覧に出して「履修条件 要確認」を付ける
 *  no         : 対象外（他学科専用・他キャンパス・再履修/教職/留学生向け）
 */
export type Eligible = "yes" | "otherGrade" | "maybe" | "no";

export function eligibleFor(c: Course, dept: string, grade: number, homeCampus: string | null): Eligible {
  const e = c.eligibility;
  if (!e) {
    // 学科の Index に載っている科目（その学科の学生向けに開講されている）
    return c.grade == null || c.grade === grade ? "yes" : "otherGrade";
  }
  if (homeCampus && c.campus && c.campus !== homeCampus) return "no";
  if (e.kind === "special") return "no";
  if (c.grade != null && grade < c.grade) return "no";
  if (e.kind === "unknown") return c.grade == null || c.grade === grade ? "maybe" : "otherGrade";
  if (e.kind === "graded") {
    const r = e.rules.find((r) => (r.minGrade == null || grade >= r.minGrade) && (r.maxGrade == null || grade <= r.maxGrade));
    if (!r) return "no";
    return r.depts == null || r.depts.includes(dept) ? "yes" : "no";
  }
  const r = e.rules[0];
  if (r?.depts && !r.depts.includes(dept)) return "no";
  return c.grade == null || c.grade === grade ? "yes" : "otherGrade";
}

/** The campus where most of the department's own courses for this grade are held (e.g. 電子 = 船橋). */
export function homeCampusOf(deptCourses: Course[], grade: number): string | null {
  const n = new Map<string, number>();
  for (const c of deptCourses) if (c.campus && (c.grade === grade || c.grade == null)) n.set(c.campus, (n.get(c.campus) ?? 0) + 1);
  let best: string | null = null;
  for (const [k, v] of n) if (best == null || v > (n.get(best) ?? 0)) best = k;
  return best;
}
