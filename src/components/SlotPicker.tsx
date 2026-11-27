import { SearchX } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";
import { CATEGORY_LABEL, EVAL_TAGS, type Category } from "../lib/data";
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
  category: (c: Course) => Category;
  onToggle: (c: Course) => void;
  onOpen: (c: Course) => void;
}

const EASY = new Set(["no-exam", "report-heavy"]);
// デザインの 4 つ（すべて / 試験なし / レポート中心 / 専門のみ）を先頭に、残りの評価タグを後ろに並べる
const TAG_ORDER = ["no-exam", "report-heavy", "attendance-heavy", "exam-heavy"];

/**
 * 科目選択シート。行をタップで選び（単選）、下の主ボタンで追加する。
 * 選択中の科目を選ぶと主ボタンは「外す」になる。詳細は主ボタン横の「詳細」から。
 */
export function SlotPicker({ offered, selected, grade, statusOf, reqOf, category, onToggle, onOpen }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [majorOnly, setMajorOnly] = useState(false);
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
        .filter((c) => !majorOnly || ["core", "elective", "lab"].includes(category(c)) && c.syllabusDepartment !== "99")
        .sort(
          (a, b) =>
            Number(!!reqOf(b)?.required) - Number(!!reqOf(a)?.required) ||
            Number(!!reqOf(b)) - Number(!!reqOf(a)) ||
            Number(statusOf(a) === "maybe") - Number(statusOf(b) === "maybe") ||
            (a.grade ?? 9) - (b.grade ?? 9) ||
            a.name.localeCompare(b.name, "ja"),
        ),
    [offered, selected, tags, majorOnly, allGrades, cert, grade],
  );
  const [pickedId, setPicked] = useState<string | null>(() => (here.length ? null : filtered[0]?.id ?? null));
  const picked = [...here, ...filtered].find((c) => c.id === pickedId) ?? null;
  const pickedOn = !!picked && selectedIds.has(picked.id);

  const certCount = offered.filter((c) => !selectedIds.has(c.id) && statusOf(c) === "cert").length;
  const hiddenOtherGrades = offered.filter((c) => !selectedIds.has(c.id) && statusOf(c) === "otherGrade").length;
  const toggleTag = (id: string) => setTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const tagList = TAG_ORDER.map((id) => EVAL_TAGS.find((t) => t.id === id)!).filter(Boolean);
  const all = !tags.length && !majorOnly;

  const row = (c: Course) => (
    <Row
      key={c.id}
      c={c}
      on={selectedIds.has(c.id)}
      picked={pickedId === c.id}
      cat={category(c)}
      clash={clashesWith(c, selected)}
      showGrade={allGrades}
      status={statusOf(c)}
      onPick={() => setPicked(c.id)}
    />
  );

  return (
    <>
      {here.length > 0 && (
        <>
          <div class="section-label">選択中</div>
          <ul class="pick-list" role="radiogroup" aria-label="選択中の科目">
            {here.map(row)}
          </ul>
        </>
      )}

      <div class="chips" style={{ marginTop: here.length ? 16 : 0 }} role="group" aria-label="絞り込み">
        <button
          class="chip"
          aria-pressed={all}
          onClick={() => {
            setTags([]);
            setMajorOnly(false);
          }}
        >
          すべて
        </button>
        {tagList.slice(0, 2).map((t) => (
          <button key={t.id} class="chip" aria-pressed={tags.includes(t.id)} onClick={() => toggleTag(t.id)}>
            {t.label}
          </button>
        ))}
        <button class="chip" aria-pressed={majorOnly} onClick={() => setMajorOnly((v) => !v)}>
          専門のみ
        </button>
        {tagList.slice(2).map((t) => (
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

      <ul class="pick-list" role="radiogroup" aria-label="この時限の開講科目">
        {filtered.map(row)}
      </ul>

      {filtered.length === 0 && (
        <div class="empty-state">
          <SearchX size={22} />
          <div>
            {offered.length === 0
              ? "この時間に開講される科目はありません。空きコマとして使いましょう。"
              : tags.length || majorOnly
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

      {picked && (
        <div class="sheet-cta">
          <button class="btn ghost" onClick={() => onOpen(picked)}>
            詳細
          </button>
          <button
            class={`btn ${pickedOn ? "ghost" : "primary"} cta`}
            onClick={() => {
              onToggle(picked);
              if (pickedOn) setPicked(null);
            }}
          >
            <span class="cta-name">
              {picked.name}を{pickedOn ? "外す" : "追加"}
            </span>
            <span class="cta-cr">
              {pickedOn ? "−" : "+"}
              {picked.credits}単位
            </span>
          </button>
        </div>
      )}
    </>
  );
}

function Row({ c, on, picked, cat, clash, showGrade, status, onPick }: { c: Course; on: boolean; picked: boolean; cat: Category; clash: Course[]; showGrade?: boolean; status?: Eligible; onPick: () => void }) {
  const evalTags = EVAL_TAGS.filter((t) => c.evaluation.tags.includes(t.id));
  const others = clash.filter((x) => x.id !== c.id);
  return (
    <li class={`pick cat-${cat} ${picked ? "is-picked" : ""}`}>
      <button role="radio" aria-checked={picked} class="pick-btn" onClick={onPick}>
        <span class="dot" aria-hidden="true" />
        <span class="pick-main">
          <span class="pick-top">
            <b>
              {c.name}
              {c.classGroup && <span class="faint small"> クラス{c.classGroup}</span>}
            </b>
            <span class="cr">
              <em class="num">{c.credits}</em>単位
            </span>
          </span>
          <span class="pick-meta">
            {c.code && <span class="code">{c.code}</span>}
            <span class="pick-meta-text">
              {c.teachers.slice(0, 2).join("・")}
              {c.teachers.length > 2 ? " 他" : ""} · {CATEGORY_LABEL[cat]}
              {showGrade && c.grade ? ` · ${c.grade}年` : ""}
              {c.slots.length > 1 ? ` · ${slotLabel(c.slots)}` : ""}
            </span>
          </span>
          <span class="tags">
            {on && <span class="tag on">選択中</span>}
            {c.eligibility && <span class="tag">{status === "cert" ? "資格課程" : "共通・教養"}</span>}
            {status === "maybe" && <span class="tag amber">履修条件 要確認</span>}
            {c.notes.includes("再") && <span class="tag">再履修</span>}
            {c.classFormat === "オンライン" && <span class="tag">オンライン</span>}
            {evalTags.map((t) => (
              <span key={t.id} class={`tag ${EASY.has(t.id) ? "easy" : ""}`}>
                {t.label}
              </span>
            ))}
            {others.length > 0 && <span class="tag coral">{others[0].name}と重複</span>}
          </span>
        </span>
        <span class="radio" aria-hidden="true" />
      </button>
    </li>
  );
}
