import { Minus, Plus } from "lucide-preact";
import { useMemo } from "preact/hooks";
import { t } from "../lib/i18n";
import { effortFor, focusOf, LETTERS, PLAN_STYLES, planGrades, planSummary, strategyOf, type Letter, type PlanStyle } from "../lib/strategy";
import { k } from "../lib/i18n";
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
const STYLE_LABEL: Record<PlanStyle, string> = { steady: k("安定：まんべんなく"), focus: k("集中：S を狙う"), easy: k("省力：手間が最小") };
const STYLE_SUB: Record<PlanStyle, string> = {
  steady: k("評価をそろえる。全科目で同じくらいの点を取る"),
  focus: k("取りやすい数科目で S を取り、ほかは合格ラインで守る"),
  easy: k("試験で要る点が小さい科目・単位の大きい科目から上げる"),
};

/** 目標 GPA：今学期の科目に目標評価を割り振る（ルールで計算。手で決めた科目は固定） */
export function GoalPanel({ courses, isRequired, goal, termLabel, past, onGoal, onOpen }: Props) {
  const target = goal.gpa ?? 3.0;
  const rows = useMemo(() => courses.filter((c) => c.credits > 0).map((c) => ({ c, required: isRequired(c), st: strategyOf(c) })), [courses]);
  const fixed = Object.fromEntries(Object.entries(goal.per).filter(([id]) => rows.some((r) => r.c.id === id)));
  const pcs = rows.map((r) => ({ id: r.c.id, credits: r.c.credits, required: r.required, st: r.st }));
  // 3 つの方案。中身が同じになった方案は 1 つにまとめる
  const plans = PLAN_STYLES.map((style) => ({ style, ...planGrades(pcs, target, fixed, style) }));
  const sig = (g: Record<string, Letter>) => pcs.map((c) => g[c.id]).join("");
  const shown = plans.filter((p, i) => plans.findIndex((q) => sig(q.grades) === sig(p.grades)) === i);
  const style: PlanStyle = goal.style ?? "easy";
  const plan = plans.find((p) => p.style === style)!;
  const chosenSig = sig(plan.grades);
  const nameOf = (id: string) => rows.find((r) => r.c.id === id)?.c.name ?? "";
  const credits = rows.reduce((s, r) => s + r.c.credits, 0);
  const setTarget = (v: number) => onGoal({ ...goal, gpa: Math.min(4, Math.max(1, Math.round(v * 10) / 10)) });
  const setPer = (id: string, g: Letter | null) => {
    const per = { ...goal.per };
    if (g) per[id] = g;
    else delete per[id];
    onGoal({ ...goal, gpa: goal.gpa ?? target, per });
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
      <div class="section-label">{t("方案を選ぶ")}</div>
      <div class="plans" role="radiogroup" aria-label={t("方案を選ぶ")}>
        {shown.map((p) => {
          const sm = planSummary(pcs, p.grades);
          const same = plans.filter((q) => q.style !== p.style && sig(q.grades) === sig(p.grades)).map((q) => t(STYLE_LABEL[q.style]));
          return (
            <button key={p.style} role="radio" aria-checked={sig(p.grades) === chosenSig} class={`plan-card ${sig(p.grades) === chosenSig ? "on" : ""}`} onClick={() => onGoal({ ...goal, gpa: target, style: p.style })}>
              <span class="plan-top">
                <b>{t(STYLE_LABEL[p.style])}</b>
                {same.length > 0 && <span class="small muted">= {same.join(" / ")}</span>}
                <span class="plan-gpa num">GPA {p.gpa.toFixed(2)}</span>
              </span>
              <span class="plan-sub small muted">{t(STYLE_SUB[p.style])}</span>
              <span class="plan-counts">
                {(["S", "A", "B", "C"] as Letter[]).map((g) =>
                  sm.counts[g].n ? (
                    <span key={g} class={`pc pc-${g}`}>
                      <b>{g}</b>×{sm.counts[g].n}
                      <small>{t("{n}単位", { n: sm.counts[g].credits })}</small>
                    </span>
                  ) : null,
                )}
              </span>
              {sm.hardest && sm.hardest.need > 0 && (
                <span class="plan-hard small">{t("いちばん大変：{name}（{g}）試験・小テストで {n}%", { name: nameOf(sm.hardest.id), g: sm.hardest.grade, n: sm.hardest.need })}</span>
              )}
            </button>
          );
        })}
      </div>
      <p class="fine">{t("GPA は「評価の点（S4・A3・B2・C1）× 単位」の合計 ÷ 総単位で計算します（日本大学の方式）。単位の大きい科目ほど効きます。下の評価をタップすると手で固定でき、方案はそれ以外の科目で組み直します。シラバスからの自動計算なので参考値です。")}</p>

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
