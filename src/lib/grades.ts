import { normName } from "./credits";
import type { ReqCourse, Requirements } from "./types";

/**
 * 日本大学の成績評価（全学共通）:
 *   S 90–100 (GP4) / A 80–89 (3) / B 70–79 (2) / C 60–69 (1) / D 59以下 (0, 不合格) / E 評価なし (0, 不合格)
 *   N = 認定（単位は付くが GPA の対象外）
 * GPA = Σ(GP × 単位) ÷ Σ(S〜E の単位)。D・E も分母に入る。再履修した科目は最新の評価だけを数える
 * （ここでは科目ごとに 1 件しか持たないので、上書き＝最新）。
 */
export type Grade = "S" | "A" | "B" | "C" | "D" | "E" | "N";
export const GRADE_LIST: Grade[] = ["S", "A", "B", "C", "D", "E", "N"];
export const GP: Record<Grade, number | null> = { S: 4, A: 3, B: 2, C: 1, D: 0, E: 0, N: null };
export const isPass = (g: Grade) => g !== "D" && g !== "E";

/** 成績 1 件。キーは科目名の正規化（同じ科目の別クラス・別年度でも同じ科目として扱う） */
export interface GradeEntry {
  name: string;
  credits: number;
  grade: Grade;
}
export type Grades = Record<string, GradeEntry>;

export const gradeKey = (name: string) => normName(name);

export interface GradeSummary {
  gpa: number | null; // 小数 2 桁で表示する
  gpaCredits: number; // 分母（S〜E の単位）
  earned: number; // 修得単位（S〜C と N）
  earnedByGroup: Record<string, number>; // 配置表の区分（葉）ごとの修得単位
  earnedUnmatched: number; // 配置表にない科目の修得単位
  failedRequired: ReqCourse[]; // D・E の必修（要再履修）
  failed: GradeEntry[];
  passed: Set<string>; // 修得済みの科目（gradeKey）
}

export function summarize(grades: Grades, req: Requirements | null): GradeSummary {
  const idx = new Map<string, ReqCourse>();
  for (const c of req?.courses ?? []) idx.set(normName(c.name), c);
  let pts = 0;
  let den = 0;
  let earned = 0;
  let earnedUnmatched = 0;
  const earnedByGroup: Record<string, number> = {};
  const failedRequired: ReqCourse[] = [];
  const failed: GradeEntry[] = [];
  const passed = new Set<string>();
  for (const [k, e] of Object.entries(grades)) {
    const gp = GP[e.grade];
    if (gp != null) {
      pts += gp * e.credits;
      den += e.credits;
    }
    const rc = idx.get(k);
    if (isPass(e.grade)) {
      earned += e.credits;
      passed.add(k);
      if (rc) earnedByGroup[rc.group] = (earnedByGroup[rc.group] ?? 0) + e.credits;
      else earnedUnmatched += e.credits;
    } else {
      failed.push(e);
      if (rc?.required) failedRequired.push(rc);
    }
  }
  return { gpa: den ? Math.round((pts / den) * 100) / 100 : null, gpaCredits: den, earned, earnedByGroup, earnedUnmatched, failedRequired, failed, passed };
}

/** 成績から出した区分別の修得単位に、手入力の「成績未入力の修得分」を足す */
export function mergeEarned(manual: Record<string, number>, fromGrades: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...fromGrades };
  for (const [k, v] of Object.entries(manual)) out[k] = (out[k] ?? 0) + (Number(v) || 0);
  return out;
}

/** 区分の短い表示名: 「教養 Ⅰ群」「基礎 数学系」「専門」など */
export function groupTag(rc: ReqCourse, req: Requirements | null): string {
  const choice = (req?.choiceRules ?? []).find((r) => r.courses.map(normName).includes(normName(rc.name)));
  if (choice) return choice.label.startsWith("専門 ") ? `選択必修 ${choice.label.slice(3)}` : "選択必修";
  const g = req?.groups.find((x) => x.id === rc.group);
  const roman = g?.label.match(/（(.+群)）/)?.[1];
  if (rc.group.startsWith("liberal")) return roman ? `教養 ${roman}` : "教養";
  if (rc.group === "common") return "全学共通";
  if (rc.group === "basic.global") return "基礎 グローバル";
  if (rc.group.startsWith("basic.science")) return g ? `基礎 ${g.label}` : "基礎科学";
  if (rc.group.startsWith("basic")) return "基礎";
  if (rc.group.startsWith("major")) return "専門";
  return g?.label ?? "";
}
