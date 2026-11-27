import type { Course, DataIndex, DeptFile, Requirements } from "./types";

const BASE = import.meta.env.BASE_URL + "data/";

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function loadIndex(): Promise<DataIndex> {
  const { latest } = await getJson<{ latest: number }>("years.json");
  return getJson<DataIndex>(`${latest}/index.json`);
}

export function loadDept(year: number, code: string): Promise<DeptFile> {
  return getJson<DeptFile>(`${year}/dept-${code}.json`);
}

/** 共通・教養科目（gakka=99）。データにない年度は空 */
export async function loadCommon(index: DataIndex): Promise<Course[]> {
  if (!index.common) return [];
  try {
    return (await getJson<DeptFile>(`${index.year}/dept-${index.common.code}.json`)).courses;
  } catch {
    return [];
  }
}

export interface ReqIndexEntry {
  entryYear: number;
  dept: string;
  file: string;
  verified: boolean;
}

export async function loadRequirements(entryYear: number, dept: string): Promise<Requirements | null> {
  try {
    const idx = await getJson<ReqIndexEntry[]>("requirements/index.json");
    const hit = idx.find((x) => x.entryYear === entryYear && x.dept === dept);
    return hit ? await getJson<Requirements>(`requirements/${hit.file}`) : null;
  } catch {
    return null;
  }
}

/** Colour family for a course card: from the requirement group if known, else a heuristic. */
export type Family = "major" | "basic" | "liberal" | "other";

export function familyOf(c: Course, groupOf: (c: Course) => string | null): Family {
  const g = groupOf(c);
  if (g) {
    if (g.startsWith("major")) return "major";
    if (g.startsWith("basic")) return "basic";
    if (g.startsWith("liberal") || g.startsWith("common")) return "liberal";
  }
  if (c.syllabusDepartment === "99") return "basic";
  if (c.syllabusDepartment && c.syllabusDepartment === c.department) return "major";
  return "other";
}

export const FAMILY_VARS: Record<Family, { tint: string; bar: string; label: string }> = {
  major: { tint: "var(--c-major)", bar: "var(--c-major-bar)", label: "専門" },
  basic: { tint: "var(--c-basic)", bar: "var(--c-basic-bar)", label: "基礎" },
  liberal: { tint: "var(--c-liberal)", bar: "var(--c-liberal-bar)", label: "教養" },
  other: { tint: "var(--c-other)", bar: "var(--c-other-bar)", label: "その他" },
};

export const EVAL_TAGS: { id: string; label: string }[] = [
  { id: "no-exam", label: "試験なし" },
  { id: "report-heavy", label: "レポート中心" },
  { id: "attendance-heavy", label: "出席重視" },
  { id: "exam-heavy", label: "試験重視" },
];

export const EVAL_CATEGORY: Record<string, { label: string; color: string }> = {
  exam: { label: "試験", color: "var(--c-major-bar)" },
  quiz: { label: "小テスト", color: "#9c8fe0" },
  report: { label: "レポート・課題", color: "var(--c-basic-bar)" },
  attendance: { label: "出席・平常点", color: "var(--c-liberal-bar)" },
  presentation: { label: "発表", color: "#d48aa6" },
  other: { label: "その他", color: "var(--c-other-bar)" },
};
