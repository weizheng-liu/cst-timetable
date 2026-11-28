import { AlertTriangle, Info } from "lucide-preact";
import { leafGroups, normName, progress } from "../lib/credits";
import type { Course, Requirements } from "../lib/types";
import type { GradeSummary } from "../lib/grades";

interface Props {
  req: Requirements | null;
  selected: Course[];
  earned: Record<string, number>; // 手入力分（成績未入力の修得分）
  earnedAll: Record<string, number>; // 手入力分 + 成績から出した分
  passed: Set<string>;
  summary: GradeSummary;
  onGrades: () => void;
  onEarned: (id: string, v: number) => void;
  deptName: string;
  entryYear: number;
}

export function Credits({ req, selected, earned, earnedAll, passed, summary, onGrades, onEarned, deptName, entryYear }: Props) {
  const planned = selected.reduce((s, c) => s + (c.credits || 0), 0);
  if (!req) {
    return (
      <>
        <div class="big">
          {planned}
          <span class="small muted"> 単位（全学年の計画）</span>
        </div>
        <div class="banner" style={{ marginTop: 16 }}>
          <Info size={16} />
          <div>
            {deptName}・{entryYear}年度入学の卒業要件データはまだ登録されていません。現在は電子工学科（2025年度入学）のみ対応しています。
          </div>
        </div>
      </>
    );
  }
  const counted = selected.filter((c) => !passed.has(normName(c.name)));
  const pr = progress(req, counted, earnedAll, passed);
  const earnedTotal = pr.earnedTotal + summary.earnedUnmatched;
  const total = pr.plannedTotal + earnedTotal;
  const missingTotal = Math.max(0, req.totalCredits - total);
  const leaves = new Set(leafGroups(req.groups).map((g) => g.id));
  return (
    <>
      {!req.verified && (
        <div class="banner warn">
          <AlertTriangle size={16} />
          <div>
            <b>未確認</b>：この卒業要件は学部要覧PDFから自動抽出したもので、まだ人の目で確認されていません。必ず
            <a href={req.source.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
              学部要覧（p.{req.source.pages.join(", ")}）
            </a>
            と照合してください。
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div class="big">{total}</div>
        <div class="muted">/ {req.totalCredits} 単位</div>
        <div class="small" style={{ marginLeft: "auto", color: missingTotal ? "var(--ink-2)" : "var(--cat-elective-ink)" }}>
          {missingTotal ? `あと ${missingTotal} 単位` : "合計は充足"}
        </div>
      </div>
      <div class="meter">
        <i style={{ width: `${Math.min(100, (earnedTotal / req.totalCredits) * 100)}%` }} />
        <i class="plan" style={{ width: `${Math.min(100, (pr.plannedTotal / req.totalCredits) * 100)}%` }} />
      </div>
      <p class="small muted" style={{ margin: "8px 0 4px" }}>
        全学年の計画 {pr.plannedTotal} 単位 + 修得済み {earnedTotal} 単位。
      </p>
      <button class="gpa-link" onClick={onGrades}>
        <span>
          <span class="eyebrow">GPA</span>
          <b class="num">{summary.gpa != null ? summary.gpa.toFixed(2) : "—"}</b>
        </span>
        <span class="gpa-link-text">
          {summary.gpa != null ? `成績から 修得 ${summary.earned} 単位` : "成績を入力すると GPA と修得単位を自動で計算します"}
          {summary.failedRequired.length > 0 && <b class="fail-text"> · 必修 {summary.failedRequired.length} 科目が不合格</b>}
        </span>
        <span class="cb-more">成績</span>
      </button>

      <div class="block-title">区分別</div>
      {pr.groups.map((g) => (
        <div key={g.group.id} class={`greq ${g.depth ? "sub" : ""}`}>
          <div class="top">
            <span class="label">{g.group.label}</span>
            <span class="val">
              {g.total}
              <span class="faint"> / {g.group.minCredits}</span>
            </span>
          </div>
          <div class="meter">
            <i class={g.missing ? "" : "done"} style={{ width: `${g.group.minCredits ? Math.min(100, (g.total / g.group.minCredits) * 100) : 100}%` }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <span class={`gap ${g.missing ? "" : "ok"}`}>{g.missing ? `不足 ${g.missing} 単位` : "充足"}</span>
            <span class="faint small" style={{ marginLeft: "auto" }}>
              p.{g.group.page}
            </span>
          </div>
          {g.group.note && <div class="small muted" style={{ marginTop: 2 }}>{g.group.note}</div>}
          {g.requiredLeft.length > 0 && leaves.has(g.group.id) && (
            <div class="small" style={{ marginTop: 4, color: "var(--ink-2)" }}>
              未選択の必修：{g.requiredLeft.map((r) => r.name).join("、")}
            </div>
          )}
          {leaves.has(g.group.id) && (
            <label class="earned">
              成績未入力の修得分
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={200}
                value={earned[g.group.id] ?? ""}
                onInput={(e) => onEarned(g.group.id, Math.max(0, Number((e.target as HTMLInputElement).value) || 0))}
              />
              単位
            </label>
          )}
        </div>
      ))}

      {(req.choiceRules ?? []).length > 0 && (
        <>
          <div class="block-title">選択必修</div>
          {req.choiceRules!.map((ch) => {
            const names = new Set(ch.courses.map(normName));
            const seen = new Set<string>();
            let got = 0;
            for (const c of selected) {
              const n = normName(c.name);
              if (names.has(n) && !seen.has(n)) {
                seen.add(n);
                got += c.credits;
              }
            }
            return (
              <div key={ch.id} class="greq">
                <div class="top">
                  <span class="label">{ch.courses.join("・")}</span>
                  <span class="val">
                    {got}
                    <span class="faint"> / {ch.minCredits}</span>
                  </span>
                </div>
                <div class="small muted">全学年の計画で判定 · p.{ch.page}</div>
              </div>
            );
          })}
        </>
      )}

      {pr.unmatched.length > 0 && (
        <>
          <div class="block-title">区分を判定できなかった科目</div>
          <p class="small muted" style={{ marginTop: 0 }}>
            授業科目配置表に名前が見つからない科目です（共通科目配置表の科目など）。合計には含めていますが、区分別には含めていません。
          </p>
          {pr.unmatched.map((c) => (
            <div key={c.id} class="small">
              {c.name}（{c.credits}単位）
            </div>
          ))}
        </>
      )}
    </>
  );
}
