import { useState } from "preact/hooks";
import { CATEGORY_LABEL, EVAL_TAGS, roomOf, type Category } from "../lib/data";
import { slotText, type ResolveOption } from "../lib/resolve";
import type { Course } from "../lib/types";

interface Props {
  a: Course;
  b: Course;
  options: ResolveOption[];
  planned: number; // 今年度の取得予定単位
  category: (c: Course) => Category;
  isRequired: (c: Course) => boolean;
  altOf: (c: Course) => Course | null;
  onApply: (o: ResolveOption) => void;
}

/** 重複の解決シート：2 科目を並べて比べ、代償つきの解決方法から 1 つ選ぶ */
export function ConflictResolve({ a, b, options, planned, category, isRequired, altOf, onApply }: Props) {
  const [pick, setPick] = useState(0);
  const chosen = options[pick];
  return (
    <>
      <p class="resolve-lead">どちらかを残すか、別の時限に移せます。</p>
      <div class="cmp">
        <CmpCard c={a} cat={category(a)} required={isRequired(a)} alt={altOf(a)} />
        <span class="cmp-vs" aria-hidden="true">
          ×
        </span>
        <CmpCard c={b} cat={category(b)} required={isRequired(b)} alt={altOf(b)} />
      </div>
      <div class="section-label">解決方法</div>
      <ul class="opts" role="radiogroup" aria-label="解決方法">
        {options.map((o, i) => (
          <li key={i} class={`opt ${pick === i ? "is-picked" : ""} ${o.kind === "keep" && o.dropRequired ? "is-warn" : ""}`}>
            <button role="radio" aria-checked={pick === i} class="opt-btn" onClick={() => setPick(i)}>
              <span class="radio" aria-hidden="true" />
              <span>
                <b>
                  {o.kind === "move" ? `${o.from.name}を${slotText(o.to.slots)}のクラスへ移す` : `${o.keep.name}だけを残す`}
                  {o.kind === "move" && <i class="badge">おすすめ</i>}
                </b>
                <small>
                  {o.kind === "move"
                    ? "両方とも履修できます · 単位の変化なし"
                    : o.dropRequired
                      ? `必修の${o.drop.name}が未履修になります · 取得予定 ${planned} → ${planned - o.drop.credits}`
                      : `${o.drop.name}を外す · 取得予定 ${planned} → ${planned - o.drop.credits}`}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {chosen && (
        <div class="sheet-cta">
          <button class="btn primary cta" onClick={() => onApply(chosen)}>
            <span class="cta-name">{chosen.kind === "move" ? `${slotText(chosen.to.slots)}に移して解決` : `${chosen.keep.name}だけを残して解決`}</span>
          </button>
        </div>
      )}
    </>
  );
}

function CmpCard({ c, cat, required, alt }: { c: Course; cat: Category; required: boolean; alt: Course | null }) {
  const top = [...c.evaluation.parts].sort((x, y) => y.percent - x.percent)[0];
  const tag = EVAL_TAGS.find((t) => c.evaluation.tags.includes(t.id));
  const evalText = tag ? tag.label : top ? `${top.label} ${top.percent}%` : "—";
  return (
    <div class={`cmp-card cat-${cat}`}>
      <div class="cmp-top">
        <span class="dot" />
        <span>{CATEGORY_LABEL[cat]}</span>
        <span class="cmp-tag">{required ? "必修" : "選択"}</span>
      </div>
      <b class="cmp-name">{c.name}</b>
      {roomOf(c) && (
        <div class="cmp-who">
          <span class="code">
            <small>教室</small>
            {roomOf(c)}
          </span>
        </div>
      )}
      <div class="cmp-who">
        {c.teachers[0] ?? "—"} · <em class="num">{c.credits}</em>単位
      </div>
      <dl class="cmp-dl">
        <dt>評価</dt>
        <dd>{evalText}</dd>
        <dt>別の時限</dt>
        <dd class={alt ? "is-alt" : ""}>{alt ? `${slotText(alt.slots)}（空き）` : "なし"}</dd>
      </dl>
      <p class="cmp-note">
        {required ? "必修" : "選択"}・{c.grade ? `${c.grade}年` : ""}
        {c.term}
      </p>
    </div>
  );
}
