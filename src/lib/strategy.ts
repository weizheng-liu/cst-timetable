// 「攻略」：シラバスの成績評価から、合格（C）・A・S に何が必要かを計算する。
// AI では作らない。決まった規則だけで出す：
//   1. 日本大学共通の成績基準（S 90〜 / A 80〜 / B 70〜 / C 60〜 / D 59 以下は不合格）
//   2. 内訳の割合（合計 100% のときだけ）から「試験以外を満点にしたとき試験で何 % 要るか」
//   3. シラバス原文から、出席・提出・最低点・評価対象外などの条件の文をそのまま抜き出す
// 原文に書いていないことは言わない。割合が取れない科目は条件の文だけを出す。
import { evalParts } from "./data";
import { k } from "./i18n";
import type { Course, EvalPart } from "./types";

/** 日本大学の成績基準（全学部共通、GPA 制度） */
export const GRADE_SCALE = [
  { grade: "S", min: 90 },
  { grade: "A", min: 80 },
  { grade: "B", min: 70 },
  { grade: "C", min: 60 },
] as const;

export type Target = { grade: "C" | "A" | "S"; min: number };
export const TARGETS: Target[] = [
  { grade: "C", min: 60 },
  { grade: "A", min: 80 },
  { grade: "S", min: 90 },
];

export type CondKind = "attendance" | "submission" | "score" | "exclude";
export type Condition = { kind: CondKind; text: string };

export type Strategy = {
  /** 内訳が合計 100% で取れたか */
  complete: boolean;
  parts: EvalPart[];
  /** 試験・小テスト（定期・中間・期末・小テストなど、点を取りに行く項目）の割合の合計 */
  examPct: number;
  /** 試験以外の割合の合計（試験以外を満点にしたときの点） */
  otherPct: number;
  /** 目標ごと：試験以外を満点にしたとき、試験で取る必要がある得点率（%、0 なら試験なしでも届く）。試験がない科目は null */
  examNeed: { grade: Target["grade"]; min: number; need: number | null }[];
  /** 原文から抜き出した条件の文 */
  conditions: Condition[];
};

const ATT = /出席|欠席|遅刻|出欠/;
// 「出席 30%」のような内訳だけの文は条件ではない。割合は「〜に満たない」「〜以上」と組のときだけ
const ATT_RULE = /\d+\s*\/\s*\d+|\d+分の\d+|\d+\s*回|\d+\s*割|(出席|欠席)率|(出席|欠席)[^、,。]{0,12}\d+\s*[%％][^、,。]{0,6}(未満|満たない|以上|以下|超)|対象外|対象と(し|な)|認めない|評価しない|資格|不可|不合格|できない|扱/;
const SUB = /提出|受理|レポート|課題/;
const SUB_RULE = /全て|すべて|全部|全回|毎回|未提出|未受理|でも|いずれか|ない場合|なければ|ないもの|必須|必ず/;
const SCORE = /(未満|満たない|以上|以下)/;
const SCORE_RULE = /\d+\s*(点|%|％|割)/;
const SCORE_PASS = /合格|不合格|不可|単位|評価|認定|[DＤEＥ]/;
const EXCLUDE = /評価(の)?対象(と|に)?(しない|ならない|外)|対象外|単位を?(認め|与え)ない|不可とする|不合格とする|不合格になる|評価しない|受験(でき|資格)|成績評価を行わない/;

/** 原文の文ごとに、合否に関わる条件かどうかを見る */
export function conditionsOf(text: string): Condition[] {
  const out: Condition[] = [];
  const seen = new Set<string>();
  for (const raw of text.normalize("NFKC").split(/[。\n]|\.(?!\d)|．/)) {
    const s = raw.replace(/^[\s・●○■□◆◇※\-－*]+/, "").trim();
    if (s.length < 6 || seen.has(s)) continue;
    let kind: CondKind | null = null;
    if (ATT.test(s) && ATT_RULE.test(s)) kind = "attendance";
    else if (SUB.test(s) && SUB_RULE.test(s) && (EXCLUDE.test(s) || /必須|必ず|全て|すべて|全部|未提出|未受理/.test(s))) kind = "submission";
    else if (SCORE.test(s) && SCORE_RULE.test(s) && SCORE_PASS.test(s) && !(/60\s*点以上/.test(s) && !/未満|満たない|割|率|以下/.test(s))) kind = "score";
    else if (EXCLUDE.test(s)) kind = "exclude";
    if (!kind) continue;
    seen.add(s);
    out.push({ kind, text: s });
  }
  return out;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function strategyOf(c: Course): Strategy {
  const { parts, complete } = evalParts(c);
  const examPct = complete ? parts.filter((p) => p.category === "exam" || p.category === "quiz").reduce((s, p) => s + p.percent, 0) : 0;
  const otherPct = complete ? 100 - examPct : 0;
  const examNeed = TARGETS.map((tg) => ({
    grade: tg.grade,
    min: tg.min,
    need: complete && examPct > 0 ? Math.max(0, round1(((tg.min - otherPct) / examPct) * 100)) : null,
  }));
  return { complete, parts, examPct, otherPct, examNeed, conditions: conditionsOf(c.evaluation.text || "") };
}

// ── 重点の種類 ───────────────────────────────────────────────
// attend：出席が成績・合否に効く（必修、出席・平常点の割合が大きい、出席の条件がある）
// score ：出席・平常点が配点の 20% 未満（0 なら「配点に出席なし」）。点数の決め手（試験・小テスト合計、レポート・課題合計、または最大の 1 項目）を示す
export type Decider = { by: "test" | "report" | "part"; pct: number; label: string };
export type Focus =
  | { kind: "attend"; reasons: ("required" | "weight" | "rule")[]; weight: number; decider: Decider | null }
  | { kind: "score"; decider: Decider; weight: number }
  | null;

/** 点数の決め手：試験・小テストの合計が半分以上なら「試験」、レポート・課題・発表が半分以上なら「課題」、ほかは最大の項目 */
export function deciderOf(st: Strategy): Decider | null {
  if (!st.complete || !st.parts.length) return null;
  const sum = (cats: string[]) => st.parts.filter((p) => cats.includes(p.category)).reduce((a, p) => a + p.percent, 0);
  const test = sum(["exam", "quiz"]);
  const rep = sum(["report", "presentation"]);
  if (test >= 50) return { by: "test", pct: test, label: "" };
  if (rep >= 50) return { by: "report", pct: rep, label: "" };
  const key = [...st.parts].sort((a, b) => b.percent - a.percent)[0];
  return { by: "part", pct: key.percent, label: key.label };
}

export function focusOf(c: Course, required: boolean, st: Strategy = strategyOf(c)): Focus {
  const weight = st.complete ? st.parts.filter((p) => p.category === "attendance").reduce((s, p) => s + p.percent, 0) : 0;
  const reasons: ("required" | "weight" | "rule")[] = [];
  if (required) reasons.push("required");
  if (weight >= 20 || (!st.complete && c.evaluation.tags.includes("attendance-heavy"))) reasons.push("weight");
  if (st.conditions.some((x) => x.kind === "attendance")) reasons.push("rule");
  const decider = deciderOf(st);
  if (reasons.length) return { kind: "attend", reasons, weight, decider };
  if (decider) return { kind: "score", decider, weight };
  return null;
}

/** 配点が読み取れない科目：原文が評価に使うと書いているもの（出てくる順） */
export const MENTIONS: { id: string; label: string; re: RegExp }[] = [
  { id: "exam", label: k("試験"), re: /試験|考査|(?<!小|ミニ)テスト/ },
  { id: "quiz", label: k("小テスト"), re: /小テスト|ミニテスト|小試験|クイズ|確認問題/ },
  { id: "report", label: k("レポート・課題"), re: /レポート|課題|提出物|宿題|報告書/ },
  { id: "attendance", label: k("出席・平常点"), re: /出席|平常点|授業態度|参加|取り組み|取組/ },
  { id: "presentation", label: k("発表"), re: /発表|プレゼン/ },
  { id: "practical", label: k("実験・実技"), re: /実験|実技|口頭試問|実習/ },
  { id: "toeic", label: k("TOEIC のスコア"), re: /TOEIC/i },
];
export function mentionsOf(text: string): string[] {
  const x = text.normalize("NFKC");
  return MENTIONS.map((m) => ({ m, at: x.search(m.re) }))
    .filter((v) => v.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((v) => v.m.label);
}

// ── 目標 GPA から各科目の目標評価を割り振る ──────────────────────
export type Letter = "S" | "A" | "B" | "C";
export const LETTERS: Letter[] = ["C", "B", "A", "S"]; // GP 1〜4
export const GP: Record<Letter, number> = { C: 1, B: 2, A: 3, S: 4 };
const MIN: Record<Letter, number> = { C: 60, B: 70, A: 80, S: 90 };

export type PlanCourse = { id: string; credits: number; required: boolean; st: Strategy };
export type PlanResult = {
  grades: Record<string, Letter>;
  gpa: number; // 割り振ったときの GPA
  reachable: boolean;
};

/**
 * その評価を取る「手間」（0〜100+）。試験の割合が分かれば、試験以外を満点にしたときに試験で要る得点率。
 * 分からなければ目標の点そのもの（全項目で平均その点）に少し上乗せする。
 */
export function effortFor(st: Strategy, g: Letter): number {
  const min = MIN[g];
  if (st.complete && st.examPct > 0) return Math.max(0, ((min - st.otherPct) / st.examPct) * 100);
  if (st.complete) return min; // 試験なし：レポート・平常点などで平均 min 点
  return min + 5;
}

export type PlanStyle = "steady" | "focus" | "easy";
export const PLAN_STYLES: PlanStyle[] = ["steady", "focus", "easy"];

const stepScore = (c: PlanCourse, cur: number) => (c.credits * (c.required ? 1.15 : 1)) / (effortFor(c.st, LETTERS[cur + 1]) + 10 * (cur + 1) + 10);

/**
 * 目標 GPA（単位で重み付け：Σ GP×単位 ÷ Σ単位）に届くよう、各科目の目標評価を割り振る。全科目 C から始める。手で決めた科目（fixed）は動かさない。
 * - easy（省力）：「単位あたりの手間がいちばん小さい 1 段」を上げていく（取りやすい配点・単位が大きい・必修から上がる）
 * - steady（稳・平均）：いちばん低い評価の科目から 1 段ずつ上げ、評価をなるべくそろえる
 * - focus（冲・集中）：S を取りやすい科目から順に S にし、ほかは C のまま。最後に上げた科目は届くぎりぎりまで下げる
 */
export function planGrades(courses: PlanCourse[], target: number, fixed: Record<string, Letter> = {}, style: PlanStyle = "easy"): PlanResult {
  const list = courses.filter((c) => c.credits > 0);
  const total = list.reduce((s, c) => s + c.credits, 0);
  const grades: Record<string, Letter> = {};
  for (const c of list) grades[c.id] = fixed[c.id] ?? "C";
  const sum = () => list.reduce((s, c) => s + GP[grades[c.id]] * c.credits, 0);
  const need = target * total - 1e-9;
  const free = list.filter((c) => !fixed[c.id]);
  const lv = (c: PlanCourse) => LETTERS.indexOf(grades[c.id]);

  if (style === "focus") {
    const order = [...free].sort((a, b) => stepScoreS(b) - stepScoreS(a));
    for (const c of order) {
      if (sum() >= need) break;
      grades[c.id] = "S";
      // 届いたら、この科目は届くぎりぎりの評価まで下げる
      while (lv(c) > 0) {
        grades[c.id] = LETTERS[lv(c) - 1];
        if (sum() < need) {
          grades[c.id] = LETTERS[lv(c) + 1];
          break;
        }
      }
    }
  } else {
    while (sum() < need) {
      let best: PlanCourse | null = null;
      let bestKey = -Infinity;
      for (const c of free) {
        const cur = lv(c);
        if (cur >= LETTERS.length - 1) continue;
        // steady：低い評価ほど優先（同じ段なら手間の小さい方）
        const key = style === "steady" ? (LETTERS.length - cur) * 1000 + stepScore(c, cur) : stepScore(c, cur);
        if (key > bestKey) (best = c), (bestKey = key);
      }
      if (!best) break;
      grades[best.id] = LETTERS[lv(best) + 1];
    }
  }
  const s = sum();
  return { grades, gpa: total ? Math.round((s / total) * 100) / 100 : 0, reachable: s >= need };
}

const stepScoreS = (c: PlanCourse) => (c.credits * (c.required ? 1.15 : 1)) / (effortFor(c.st, "S") + 10);

/** 方案の要約：評価ごとの科目数と単位、いちばん高い試験の要求 */
export function planSummary(courses: PlanCourse[], grades: Record<string, Letter>) {
  const counts: Record<Letter, { n: number; credits: number }> = { S: { n: 0, credits: 0 }, A: { n: 0, credits: 0 }, B: { n: 0, credits: 0 }, C: { n: 0, credits: 0 } };
  let hardest: { id: string; grade: Letter; need: number } | null = null;
  for (const c of courses) {
    const g = grades[c.id];
    if (!g) continue;
    counts[g].n++;
    counts[g].credits += c.credits;
    if (c.st.complete && c.st.examPct > 0) {
      const need = Math.round(effortFor(c.st, g) * 10) / 10;
      if (!hardest || need > hardest.need) hardest = { id: c.id, grade: g, need };
    }
  }
  return { counts, hardest };
}
