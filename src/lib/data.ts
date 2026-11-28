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
/** デザインシステム「緋と方眼」の 5 類別。色は --cat-<id>-bg / --cat-<id>-ink */
export type Category = "core" | "elective" | "general" | "lang" | "lab";

export const CATEGORY_LABEL: Record<Category, string> = {
  core: "専門必修",
  elective: "専門選択",
  general: "共通教育",
  lang: "外国語",
  lab: "実験・演習",
};

const LANG_RE = /英語|English|ドイツ語|フランス語|中国語|スペイン語|韓国語|朝鮮語|ロシア語|イタリア語|日本語|TOEIC/i;
const LAB_RE = /実験|演習|実習|製図|卒業研究/;

/** 科目名と卒業要件の区分から類別を決める。名前による判定（外国語・実験演習）を優先する */
export function categoryOf(c: Course, req?: { group: string; required: boolean } | null): Category {
  if (LANG_RE.test(c.name)) return "lang";
  if (LAB_RE.test(c.name)) return "lab";
  if (req) {
    if (req.group.startsWith("major")) return req.required ? "core" : "elective";
    if (req.group.startsWith("basic")) return req.required ? "core" : "general"; // 基礎教育の選択科目は専門ではない
    return "general";
  }
  if (c.syllabusDepartment && c.syllabusDepartment !== "99" && c.syllabusDepartment === c.department) return "elective";
  return "general";
}

/** 教室番号（シラバスの kyousituNo）。"0000" は未定・オンラインなどの仮の値なので出さない */
export function roomOf(c: Course): string | null {
  const r = (c.room || "").trim();
  return r && !/^0+$/.test(r) ? r : null;
}

export const EVAL_TAGS: { id: string; label: string }[] = [
  { id: "no-exam", label: "試験なし" },
  { id: "report-heavy", label: "レポート中心" },
  { id: "attendance-heavy", label: "出席重視" },
  { id: "exam-heavy", label: "試験重視" },
];

export const EVAL_CATEGORY: Record<string, { label: string; color: string }> = {
  exam: { label: "試験", color: "var(--cat-core-ink)" },
  quiz: { label: "小テスト", color: "var(--cat-lang-ink)" },
  report: { label: "レポート・課題", color: "var(--cat-elective-ink)" },
  attendance: { label: "出席・平常点", color: "var(--cat-general-ink)" },
  presentation: { label: "発表", color: "var(--ink-3)" },
  other: { label: "その他", color: "var(--cat-lab-ink)" },
};
