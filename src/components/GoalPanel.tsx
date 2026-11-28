import { Minus, Plus } from "lucide-preact";
import { useMemo } from "preact/hooks";
import { t } from "../lib/i18n";
import { effortFor, focusOf, LETTERS, planGrades, strategyOf, type Letter } from "../lib/strategy";
import type { Goal } from "../lib/store";
import type { Course } from "../lib/types";
import { FocusBadge } from "./Strategy";

interface Props {
  courses: Course[]; // 今学期（表示中の学年・学期）に選んでいる科目
  isRequired: (c: Course) => boolean;
  goal: Goal;
  termLabel: string;
  past: { gpa: number | null; credits: number }; // これまでの成績（GPA 対象単位）
  onGoal: (g: Goal) => void;
  onOpen: (c: Course) => void;
}

const MIN: Record<Letter, number> = { C: 60, B: 70, A: 80, S: 90 };

/** 目標 GPA：今学期の科目に目標評価を割り振る（ルールで計算。手で決めた科目は固定） */
export function GoalPanel({ courses, isRequired, goal, termLabel, past, onGoal, onOpen }: Props) {
  const target = goal.gpa ?? 3.0;
  const rows = useMemo(() => courses.filter((c) => c.credits > 0).map((c) => ({ c, required: isRequired(c), st: strategyOf(c) })), [courses]);
  const fixed = Object.fromEntries(Object.entries(goal.per).filter(([id]) => rows.some((r) => r.c.id === id)));
  const plan = planGrades(
    rows.map((r) => ({ id: r.c.id, credits: r.c.credits, required: r.required, st: r.st })),
    target,
    fixed,
  );
  const credits = rows.reduce((s, r) => s + r.c.credits, 0);
  const setTarget = (v: number) => onGoal({ ...goal, gpa: Math.min(4, Math.max(1, Math.round(v * 10) / 10)) });
  const setPer = (id: string, g: Letter | null) => {
    const per = { ...goal.per };
    if (g) per[id] = g;
    else delete per[id];
    onGoal({ gpa: goal.gpa ?? target, per });
  };
  const cum = past.gpa != null && past.credits > 0 && credits > 0 ? (past.gpa * past.credits + plan.gpa * credits) / (past.credits + credits) : null;
  // 大事な順：必修 → 単位 → 目標の高さ
  const order = [...rows].sort((a, b) => +b.required - +a.required || b.c.credits - a.c.credits || LETTERS.indexOf(plan.grades[b.c.id]) - LETTERS.indexOf(plan.grades[a.c.id]));

  if (!rows.length) return <div class="empty-state">{t("この学期に選んだ科目がありません。先に時間割に科目を追加してください。")}</div>;

  return (
    <>
      <div class="goal-head">
        <span class="small muted">{t("{term}の目標 GPA", { term: termLabel })}</span>
        <div class="stepper">
          <button class="icon-btn" aria-label={t("下げる")} onClick={() => setTarget(target - 0.1)} disabled={target <= 1}>
            <Minus size={18} />
          </button>
          <b class="big num">{target.toFixed(1)}</b>
          <button class="icon-btn" aria-label={t("上げる")} onClick={() => setTarget(target + 0.1)} disabled={target >= 4}>
            <Plus size={18} />
          </button>
        </div>
        <span class="small">
          {plan.reachable ? t("この割り振りで GPA {g}（{n}科目 · {c}単位）", { g: plan.gpa.toFixed(2), n: rows.length, c: credits }) : t("手で決めた評価のままでは届きません（最大 GPA {g}）", { g: plan.gpa.toFixed(2) })}
        </span>
        {cum != null && <span class="small muted">{t("これまでの GPA {a}（{c}単位）と合わせると通算 {b}", { a: past.gpa!.toFixed(2), c: past.credits, b: cum.toFixed(2) })}</span>}
      </div>
      <p class="fine">{t("単位が大きい科目・必修・配点上取りやすい科目から高い評価を割り振ります。評価をタップすると手で固定でき、もう一度タップで自動に戻ります。シラバスからの自動計算なので参考値です。")}</p>

      <ul class="goal-list">
        {order.map(({ c, required, st }) => {
          const g = plan.grades[c.id];
          const f = focusOf(c, required, st);
          const need = st.complete && st.examPct > 0 ? effortFor(st, g) : null;
          const conds = st.conditions.length;
          return (
            <li key={c.id} class={`goal-row ${f?.kind === "attend" ? "is-attend" : ""}`}>
              <button class="goal-name" onClick={() => onOpen(c)}>
                <b>{c.name}</b>
                <span class="small muted">
                  {t("{n}単位", { n: c.credits })}
                  {required ? ` · ${t("必修")}` : ""}
                </span>
              </button>
              <div class="goal-meta">
                <FocusBadge f={f} small />
                {conds > 0 && <span class="cond-count">{t("条件 {n} 件", { n: conds })}</span>}
              </div>
              <div class="goal-pick" role="radiogroup" aria-label={t("{name} の目標評価", { name: c.name })}>
                {[...LETTERS].reverse().map((x) => (
                  <button key={x} role="radio" aria-checked={g === x} class={`gbtn ${g === x ? "on" : ""} ${goal.per[c.id] === x ? "fixed" : ""}`} onClick={() => setPer(c.id, goal.per[c.id] === x ? null : x)}>
                    {x}
                  </button>
                ))}
              </div>
              <span class="goal-need small">
                {!st.complete
                  ? t("{n} 点以上（配点は原文を確認）", { n: MIN[g] })
                  : need == null
                    ? t("全項目で平均 {n} 点以上", { n: MIN[g] })
                    : need <= 0
                      ? t("試験・小テスト以外が満点なら届く")
                      : t("試験・小テスト以外が満点のとき、試験・小テストで平均 {n}% 以上", { n: Math.round(need * 10) / 10 })}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
