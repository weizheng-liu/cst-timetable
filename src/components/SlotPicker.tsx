import { Check, Plus, AlertTriangle, SearchX, ChevronRight } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";
import { EVAL_TAGS } from "../lib/data";
import { slotLabel } from "../lib/periods";
import { clashesWith } from "../lib/schedule";
import type { Course, ReqCourse } from "../lib/types";
import type { Eligible } from "../lib/eligibility";

interface Props {
  offered: Course[]; // courses at this cell for the term
  selected: Course[]; // all selected courses
  grade: number;
  statusOf: (c: Course) => Eligible;
  reqOf: (c: Course) => ReqCourse | undefined;
  onToggle: (c: Course) => void;
  onOpen: (c: Course) => void;
}

export function SlotPicker({ offered, selected, grade, statusOf, reqOf, onToggle, onOpen }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [allGrades, setAllGrades] = useState(false);
  const [cert, setCert] = useState(false);
  const selectedIds = new Set(selected.map((c) => c.id));

  const here = offered.filter((c) => selectedIds.has(c.id));
  const filtered = useMemo(
    () =>
      offered
        .filter((c) => !selectedIds.has(c.id))
        .filter((c) => allGrades || statusOf(c) !== "otherGrade")
        .filter((c) => cert || statusOf(c) !== "cert")
        .filter((c) => tags.every((t) => c.evaluation.tags.includes(t)))
        .sort(
          (a, b) =>
            Number(!!reqOf(b)?.required) - Number(!!reqOf(a)?.required) ||
            Number(!!reqOf(b)) - Number(!!reqOf(a)) ||
            Number(statusOf(a) === "maybe") - Number(statusOf(b) === "maybe") ||
            (a.grade ?? 9) - (b.grade ?? 9) ||
            a.name.localeCompare(b.name, "ja"),
        ),
    [offered, selected, tags, allGrades, cert, grade],
  );
  const certCount = offered.filter((c) => !selectedIds.has(c.id) && statusOf(c) === "cert").length;
  const hiddenOtherGrades = offered.filter((c) => !selectedIds.has(c.id) && statusOf(c) === "otherGrade").length;

  const toggleTag = (id: string) => setTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <>
      {here.length > 0 && (
        <>
          <div class="section-label">選択中</div>
          <div class="list">
            {here.map((c) => (
              <Row key={c.id} c={c} on req={reqOf(c)} clash={clashesWith(c, selected)} onToggle={onToggle} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}

      <div class="chips" style={{ marginTop: here.length ? 18 : 4 }} role="group" aria-label="評価方法で絞り込み">
        {EVAL_TAGS.map((t) => (
          <button key={t.id} class="chip" aria-pressed={tags.includes(t.id)} onClick={() => toggleTag(t.id)}>
            {t.label}
          </button>
        ))}
        <button class="chip" aria-pressed={allGrades} onClick={() => setAllGrades((v) => !v)}>
          他学年も表示
        </button>
        {certCount > 0 && (
          <button class="chip" aria-pressed={cert} onClick={() => setCert((v) => !v)}>
            教職・学芸員 {certCount}
          </button>
        )}
      </div>

      <div class="list">
        {filtered.map((c) => (
          <Row key={c.id} c={c} on={false} req={reqOf(c)} clash={clashesWith(c, selected)} onToggle={onToggle} onOpen={onOpen} showGrade={allGrades} status={statusOf(c)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div class="empty-state">
          <SearchX size={22} />
          <div>
            {offered.length === 0
              ? "この時間に開講される科目はありません。空きコマとして使いましょう。"
              : tags.length
                ? "条件に合う科目がありません。絞り込みを外してみてください。"
                : here.length
                  ? "この時間の他の候補はありません。"
                  : `${grade}年次の科目はありません。`}
          </div>
          {!allGrades && hiddenOtherGrades > 0 && (
            <button class="btn ghost" style={{ marginTop: 14 }} onClick={() => setAllGrades(true)}>
              他学年の科目 {hiddenOtherGrades} 件を表示
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Row({ c, on, req, clash, onToggle, onOpen, showGrade, status }: { c: Course; on: boolean; req?: ReqCourse; clash: Course[]; onToggle: (c: Course) => void; onOpen: (c: Course) => void; showGrade?: boolean; status?: Eligible }) {
  const evalTags = EVAL_TAGS.filter((t) => c.evaluation.tags.includes(t.id));
  return (
    <div class={`row ${on ? "on" : ""} ${clash.length && on ? "clash" : ""}`}>
      <button class="row-main" onClick={() => onOpen(c)} aria-label={`${c.name} の詳細`}>
        <div class="row-title">
          {c.name}
          {c.classGroup && <span class="faint small"> クラス{c.classGroup}</span>}
        </div>
        <div class="row-sub">
          {c.teachers.slice(0, 2).join("・")}
          {c.teachers.length > 2 ? " 他" : ""} · <span class="num">{c.credits}</span>単位 · {c.term} · {slotLabel(c.slots)}
          {showGrade && c.grade ? ` · ${c.grade}年` : ""}
        </div>
        <div class="row-tags">
          {req?.required && <span class="tag req">必修</span>}
          {c.eligibility && <span class="tag">{status === "cert" ? "資格課程" : "共通・教養"}</span>}
          {status === "maybe" && <span class="tag amber">履修条件 要確認</span>}
          {c.notes.includes("再") && <span class="tag">再履修</span>}
          {c.classFormat === "オンライン" && <span class="tag">オンライン</span>}
          {evalTags.map((t) => (
            <span key={t.id} class="tag">
              {t.label}
            </span>
          ))}
          {clash.length > 0 && (
            <span class="tag coral">
              <AlertTriangle size={11} style={{ marginRight: 3 }} />
              {clash[0].name}と重複
            </span>
          )}
          <ChevronRight size={14} class="faint" style={{ marginLeft: "auto", alignSelf: "center" }} />
        </div>
      </button>
      <button class="toggle" aria-pressed={on} aria-label={on ? `${c.name} を外す` : `${c.name} を追加`} onClick={() => onToggle(c)}>
        {on ? <Check size={20} /> : <Plus size={20} />}
      </button>
    </div>
  );
}
