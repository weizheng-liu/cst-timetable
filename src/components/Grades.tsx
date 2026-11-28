import { Search } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";
import { normName } from "../lib/credits";
import { GRADE_LIST, gradeKey, groupTag, isPass, type Grade, type GradeEntry, type GradeSummary, type Grades } from "../lib/grades";
import type { Course, Requirements } from "../lib/types";

interface Props {
  req: Requirements | null;
  grades: Grades;
  summary: GradeSummary;
  grade: number; // 今の学年
  allCourses: Course[]; // 配置表にない科目を探す用
  onSet: (key: string, entry: GradeEntry | null) => void;
  onRetake: (name: string) => void;
  onClear: () => void;
}

type Item = { key: string; name: string; credits: number; year: number | null; required: boolean; tag: string };

/**
 * 成績の入力。配置表（学部要覧）の科目を学年ごとに並べ、S〜E・N をタップで付ける。
 * 配置表にない科目は検索して追加できる。成績はこの端末の localStorage にだけ保存する。
 */
export function GradesPanel({ req, grades, summary, grade, allCourses, onSet, onRetake, onClear }: Props) {
  const [mode, setMode] = useState<"required" | "all">("required");
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    const out: Item[] = (req?.courses ?? []).map((rc) => ({ key: gradeKey(rc.name), name: rc.name, credits: rc.credits, year: rc.year, required: rc.required, tag: groupTag(rc, req) }));
    const known = new Set(out.map((i) => i.key));
    for (const [k, e] of Object.entries(grades)) if (!known.has(k)) out.push({ key: k, name: e.name, credits: e.credits, year: null, required: false, tag: "配置表外" });
    return out;
  }, [req, grades]);

  const query = normName(q);
  const visible = items.filter((i) =>
    query ? normName(i.name).includes(query) : grades[i.key] || ((i.year ?? 99) <= grade && (mode === "all" || i.required)),
  );
  const byYear = new Map<string, Item[]>();
  for (const i of visible) {
    const y = i.year ? `${i.year}年次` : "配置表にない科目";
    byYear.set(y, [...(byYear.get(y) ?? []), i]);
  }
  // 検索語に合う、配置表にない科目（共通科目など）。同名はまとめる
  const extra = useMemo(() => {
    if (!query) return [];
    const known = new Set(items.map((i) => i.key));
    const seen = new Map<string, Course>();
    for (const c of allCourses) {
      const k = gradeKey(c.name);
      if (!known.has(k) && !seen.has(k) && normName(c.name).includes(query)) seen.set(k, c);
    }
    return [...seen.values()].slice(0, 20);
  }, [query, allCourses, items]);

  const row = (i: Item) => {
    const g = grades[i.key]?.grade;
    const fail = g && !isPass(g);
    return (
      <li key={i.key} class={`grade-row ${fail && i.required ? "is-fail" : ""}`}>
        <div class="grade-top">
          <b>{i.name}</b>
          <span class="cr">
            <em class="num">{i.credits}</em>単位
          </span>
        </div>
        <div class="grade-meta">
          {i.required && <span class="tag must">必修</span>}
          {i.tag && <span class="tag">{i.tag}</span>}
          {fail && i.required && (
            <button class="tag fail" onClick={() => onRetake(i.name)}>
              再履修が必要 · クラスを探す
            </button>
          )}
        </div>
        <div class="grade-pick" role="radiogroup" aria-label={`${i.name} の評価`}>
          {GRADE_LIST.map((x) => (
            <button
              key={x}
              role="radio"
              aria-checked={g === x}
              class={`gbtn ${g === x ? "on" : ""} ${!isPass(x) ? "bad" : ""}`}
              onClick={() => onSet(i.key, g === x ? null : { name: i.name, credits: i.credits, grade: x as Grade })}
            >
              {x}
            </button>
          ))}
        </div>
      </li>
    );
  };

  return (
    <>
      <div class="gpa-card">
        <div>
          <span class="eyebrow">GPA</span>
          <b class="big">{summary.gpa != null ? summary.gpa.toFixed(2) : "—"}</b>
          <small class="muted">対象 {summary.gpaCredits} 単位</small>
        </div>
        <div>
          <span class="eyebrow">EARNED</span>
          <b class="big">{summary.earned}</b>
          <small class="muted">修得単位</small>
        </div>
        <div>
          <span class="eyebrow">FAILED</span>
          <b class={`big ${summary.failedRequired.length ? "is-fail" : ""}`}>{summary.failed.length}</b>
          <small class="muted">うち必修 {summary.failedRequired.length}</small>
        </div>
      </div>
      <p class="small muted" style={{ margin: "8px 0 12px" }}>
        S=4・A=3・B=2・C=1・D/E=0（不合格）で計算し、D・E も分母に入れます。N（認定）は単位だけ数えて GPA には入れません（日本大学の成績評価に準拠）。もう一度タップすると取り消せます。
      </p>

      <label class="search">
        <Search size={15} />
        <input type="search" placeholder="科目名で探す（配置表にない科目も）" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      {!query && (
        <div class="chips" role="group" aria-label="表示する科目">
          <button class="chip" aria-pressed={mode === "required"} onClick={() => setMode("required")}>
            必修と入力済み
          </button>
          <button class="chip" aria-pressed={mode === "all"} onClick={() => setMode("all")}>
            {grade}年次までの全科目
          </button>
        </div>
      )}

      {[...byYear.entries()].map(([y, list]) => (
        <section key={y}>
          <div class="section-label">{y}</div>
          <ul class="grade-list">{list.map(row)}</ul>
        </section>
      ))}
      {extra.length > 0 && (
        <section>
          <div class="section-label">配置表にない科目（共通科目など）</div>
          <ul class="grade-list">{extra.map((c) => row({ key: gradeKey(c.name), name: c.name, credits: c.credits, year: null, required: false, tag: "配置表外" }))}</ul>
        </section>
      )}
      {visible.length === 0 && extra.length === 0 && <div class="empty-state">該当する科目がありません。</div>}

      <p class="small faint" style={{ marginTop: 20 }}>
        成績はこの端末のブラウザにだけ保存され、どこにも送信されません。JSON 保存には含まれるので、ファイルの扱いに注意してください。
      </p>
      {Object.keys(grades).length > 0 && (
        <button class="btn danger block" onClick={onClear}>
          入力した成績をすべて消す
        </button>
      )}
    </>
  );
}
