import { Target } from "lucide-preact";
import { k, t } from "../lib/i18n";
import { focusOf, GRADE_SCALE, strategyOf, type CondKind, type Focus, type Letter, type Strategy } from "../lib/strategy";
import type { Course } from "../lib/types";

const COND_LABEL: Record<CondKind, string> = { attendance: k("出席"), submission: k("提出"), score: k("点数"), exclude: k("対象外") };

/** 重点のバッジ：出席が効く（塗り）／点数は試験・課題で決まる（枠線）。色だけでなく形と文字でも区別する */
export function FocusBadge({ f, small }: { f: Focus; small?: boolean }) {
  if (!f) return null;
  if (f.kind === "attend") return <span class={`fx fx-att ${small ? "sm" : ""}`}>{t("出席が効く")}</span>;
  return <span class={`fx fx-score ${small ? "sm" : ""}`}>{t("決め手：{label} {pct}%", { label: f.key.label, pct: f.key.percent })}</span>;
}

function focusLine(f: Focus): string {
  if (!f) return t("シラバスの配点が読み取れないため、重点は判定していません。");
  if (f.kind === "attend") {
    const why = f.reasons.map((r) => (r === "required" ? t("必修（落とすと再履修）") : r === "weight" ? (f.weight ? t("出席・平常点が {n}%", { n: f.weight }) : t("出席重視")) : t("シラバスに出席の条件あり")));
    return t("毎回出ることが大事な科目です：{why}", { why: why.join("、") });
  }
  return t("シラバスの配点に出席は入っていません。点数の決め手は「{label}」{pct}% です（出席の扱いは授業の指示に従ってください）。", { label: f.key.label, pct: f.key.percent });
}

function needText(st: Strategy, need: number | null, min: number): string {
  if (!st.complete) return t("配点が読み取れないため計算できません");
  if (need == null) return t("全項目で平均 {n} 点以上", { n: min });
  if (need <= 0) return t("試験・小テスト以外が満点なら、それだけで届く");
  return t("試験・小テスト以外が満点のとき、試験・小テストで平均 {n}% 以上", { n: need });
}

/** 科目詳細の「攻略」：シラバスからの自動計算（参考値） */
export function StrategySection({ c, required, goal, onGoal }: { c: Course; required: boolean; goal?: Letter | null; onGoal?: () => void }) {
  const st = strategyOf(c);
  const f = focusOf(c, required, st);
  return (
    <section class="strategy">
      <div class="block-title">
        {t("攻略")} <span class="fine">{t("シラバスからの自動計算・参考値")}</span>
      </div>
      <div class={`focus-card ${f ? `is-${f.kind}` : ""}`}>
        <FocusBadge f={f} />
        <p>{focusLine(f)}</p>
      </div>

      {st.conditions.length > 0 && (
        <>
          <div class="section-label">{t("必ず満たす条件（シラバス原文）")}</div>
          <ul class="conds">
            {st.conditions.map((x, i) => (
              <li key={i}>
                <span class={`cond-k ck-${x.kind}`}>{t(COND_LABEL[x.kind])}</span>
                <span lang="ja">{x.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div class="section-label">{t("評価ごとに必要なこと")}</div>
      {st.complete && (
        <p class="fine" style={{ margin: "0 0 6px" }}>
          {st.examPct > 0
            ? t("配点：試験・小テスト {e}% · それ以外 {o}%（{parts}）", { e: st.examPct, o: st.otherPct, parts: st.parts.map((p) => `${p.label} ${p.percent}%`).join(" / ") })
            : t("配点：{parts}（試験・小テストなし）", { parts: st.parts.map((p) => `${p.label} ${p.percent}%`).join(" / ") })}
        </p>
      )}
      <ul class="needs">
        {st.examNeed.map((n) => (
          <li key={n.grade} class={goal === n.grade ? "is-goal" : ""}>
            <b class="gl">{n.grade}</b>
            <span class="need-min">{n.grade === "C" ? t("合格 {n} 点〜", { n: n.min }) : t("{n} 点〜", { n: n.min })}</span>
            <span class="need-txt">{needText(st, n.need, n.min)}</span>
            {goal === n.grade && <span class="tag on">{t("目標")}</span>}
          </li>
        ))}
      </ul>
      {st.complete && st.otherPct >= 60 && st.examPct > 0 && <p class="fine">{t("試験・小テスト以外の項目だけで最大 {n} 点。ただし上の条件（出席・提出など）を満たさないと評価されないことがあります。", { n: st.otherPct })}</p>}
      {!st.complete && <p class="fine">{t("配点の割合を原文から読み取れませんでした。上の条件と、成績評価の原文を確認してください。")}</p>}
      {onGoal && (
        <button class="btn ghost block" style={{ marginTop: 10 }} onClick={onGoal}>
          <Target size={16} /> {goal ? t("目標 GPA から：この科目は {g} を目標に", { g: goal }) : t("目標 GPA を決めて、科目ごとの目標を出す")}
        </button>
      )}
      <p class="fine" style={{ marginTop: 8 }}>
        {t("日本大学の基準")}：{GRADE_SCALE.map((g) => `${g.grade} ${g.min}〜`).join(" / ")} / D {t("59 点以下（不合格）")}。{t("学則では「修学の条件を備えない者は受験資格を失うことがある」とされ、出席の条件は科目ごとにシラバスで決まります。")}
      </p>
    </section>
  );
}

