import type { Course, DataIndex, DeptFile, EvalPart, Requirements } from "./types";
import { k } from "./i18n";

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
  core: k("専門必修"),
  elective: k("専門選択"),
  general: k("共通教育"),
  lang: k("外国語"),
  lab: k("実験・演習"),
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
  { id: "no-exam", label: k("試験なし") },
  { id: "report-heavy", label: k("レポート中心") },
  { id: "attendance-heavy", label: k("出席重視") },
  { id: "exam-heavy", label: k("試験重視") },
];

export const EVAL_CATEGORY: Record<string, { label: string; color: string }> = {
  exam: { label: k("試験"), color: "var(--ev-exam)" },
  quiz: { label: k("小テスト"), color: "var(--ev-quiz)" },
  report: { label: k("レポート・課題"), color: "var(--ev-report)" },
  attendance: { label: k("出席・平常点"), color: "var(--ev-attend)" },
  presentation: { label: k("発表"), color: "var(--ev-present)" },
  other: { label: k("その他"), color: "var(--ev-other)" },
};

function guessEvalCategory(label: string): string {
  if (/小テスト|小試験|クイズ/.test(label)) return "quiz";
  if (/平常|出席/.test(label)) return "attendance";
  if (/試験|テスト|考査/.test(label)) return "exam";
  if (/レポート|課題|宿題|演習問題|提出/.test(label)) return "report";
  if (/参加|取り組み|態度/.test(label)) return "attendance";
  if (/発表|プレゼン/.test(label)) return "presentation";
  return "other";
}

/**
 * 成績評価の内訳。シラバスから読み取った内訳の合計が 100% にならないとき（読み違い・読み残し）は、
 * 原文の「○○：20点」「○○ 40%」の行を読み直して、合計 100 になればそちらを使う。
 * どちらも 100 にならなければ complete=false（画面では原文を必ず併記する）。
 */
const GENERIC_LABEL = /^(成績評価|評価|総合評価|成績|全体|合計|総合)(の|は|を|で)?$/;

export function evalParts(c: Course): { parts: EvalPart[]; complete: boolean } {
  // 「成績評価の 20% に TOEIC が反映」の「成績評価の」のような、項目名でない語は内訳から外す
  const given = c.evaluation.parts.filter((p) => !GENERIC_LABEL.test(p.label.normalize("NFKC").trim()));
  const total = (ps: EvalPart[]) => ps.reduce((s, p) => s + p.percent, 0);
  if (given.length && Math.abs(total(given) - 100) <= 1) return { parts: given, complete: true };
  const re = /^[\s・●○■□◆◇\-－\d.．)）]*([^:：\d%％]{1,30}?)\s*[:：]?\s*(\d{1,3}(?:\.\d+)?)\s*(?:点|%|％)/;
  const found: EvalPart[] = [];
  for (const line of c.evaluation.text.normalize("NFKC").split(/\n|。/)) {
    if (/未満|以上|以下|を超|満たない/.test(line)) continue; // 合格条件の文は内訳ではない
    const m = line.match(re);
    if (!m) continue;
    const label = m[1].replace(/[「」『』]/g, "").replace(/[(（\s]+$/, "").trim();
    if (!label || GENERIC_LABEL.test(label)) continue;
    found.push({ label, percent: +m[2], category: guessEvalCategory(label) });
  }
  if (found.length && Math.abs(total(found) - 100) <= 1) return { parts: found, complete: true };
  return { parts: given, complete: false };
}
