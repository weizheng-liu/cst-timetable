import { ExternalLink, Plus, Check, AlertTriangle, MonitorPlay } from "lucide-preact";
import { EVAL_CATEGORY } from "../lib/data";
import { slotLabel } from "../lib/periods";
import type { Course, ReqCourse } from "../lib/types";

interface Props {
  c: Course;
  on: boolean;
  req?: ReqCourse;
  clash: Course[];
  onToggle: (c: Course) => void;
}

const md = (d: string | null | undefined) => {
  if (!d) return "日程未定";
  const x = new Date(d + "T00:00:00");
  return `${x.getMonth() + 1}/${x.getDate()}(${"日月火水木金土"[x.getDay()]})`;
};

export function CourseDetail({ c, on, req, clash, onToggle }: Props) {
  const parts = c.evaluation.parts;
  const sum = parts.reduce((s, p) => s + p.percent, 0) || 1;
  const regular = c.sessions.filter((s) => s.kind === "regular");
  const ondemand = c.sessions.filter((s) => s.kind === "ondemand");
  const online = c.sessions.filter((s) => s.mode !== "face" && s.kind === "regular");
  const cancelled = c.sessions.filter((s) => s.cancelled);

  return (
    <>
      {clash.length > 0 && (
        <div class="banner coral">
          <AlertTriangle size={16} />
          <div>{clash.map((x) => x.name).join("、")} と時間が重なっています。</div>
        </div>
      )}
      <dl class="kv">
        <dt>担当教員</dt>
        <dd>{c.teachers.join("、") || "—"}</dd>
        <dt>曜日・時限</dt>
        <dd>
          {c.term} {slotLabel(c.slots)}
        </dd>
        <dt>単位</dt>
        <dd>
          <span class="num">{c.credits}</span>単位{req ? (req.required ? " · 必修" : " · 選択") : ""}
          {c.lectureType ? ` · ${c.lectureType}` : ""}
        </dd>
        <dt>対象</dt>
        <dd>
          {c.grade ? `${c.grade}年次` : "—"}
          {c.classGroup ? ` · クラス${c.classGroup}` : ""}
          {c.notes.length ? ` · ${c.notes.join("・")}` : ""}
        </dd>
        <dt>形態・教室</dt>
        <dd>
          {c.classFormat}
          {c.onlineMethod ? `（${c.onlineMethod}）` : ""}
          {c.campus ? ` · ${c.campus}` : ""}
          {c.room ? ` ${c.room}` : ""}
        </dd>
        <dt>時間割CD</dt>
        <dd class="num">
          {c.id}
          {c.code ? ` / 科目 ${c.code}` : ""}
        </dd>
      </dl>

      <div class="actions">
        <button class={`btn ${on ? "ghost" : "primary"}`} onClick={() => onToggle(c)}>
          {on ? <Check size={18} /> : <Plus size={18} />}
          {on ? "時間割から外す" : "時間割に追加"}
        </button>
      </div>

      <div class="block-title">成績評価</div>
      {parts.length > 0 ? (
        <>
          <div class="evalbar" aria-hidden="true">
            {parts.map((p, i) => (
              <i key={i} style={{ width: `${(p.percent / sum) * 100}%`, background: EVAL_CATEGORY[p.category]?.color }} />
            ))}
          </div>
          <div class="evalrows">
            {parts.map((p, i) => (
              <div key={i}>
                <span class="dot" style={{ background: EVAL_CATEGORY[p.category]?.color }} />
                <span>{p.label}</span>
                <span class="faint small">{EVAL_CATEGORY[p.category]?.label}</span>
                <span class="pct">{p.percent}%</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {c.evaluation.text && (
        <details style={{ marginTop: 10 }} open={!parts.length}>
          <summary class="small muted" style={{ cursor: "pointer" }}>
            シラバス原文
          </summary>
          <p class="prose small muted">{c.evaluation.text}</p>
        </details>
      )}

      {c.objectives && (
        <>
          <div class="block-title">到達目標</div>
          <p class="prose" style={{ margin: 0 }}>
            {c.objectives}
          </p>
        </>
      )}

      <div class="block-title">
        授業計画 {regular.length > 0 && <span class="num">（{regular.length}回）</span>}
      </div>
      {(online.length > 0 || ondemand.length > 0 || cancelled.length > 0) && (
        <div class="row-tags" style={{ marginBottom: 8 }}>
          {online.length > 0 && <span class="tag">オンライン {online.length}回</span>}
          {ondemand.length > 0 && <span class="tag">オンデマンド {ondemand.length}回</span>}
          {cancelled.length > 0 && <span class="tag coral">休講 {cancelled.length}回</span>}
        </div>
      )}
      {c.sessions.length ? (
        <ol class="sessions">
          {regular.map((s, i) => (
            <li key={`r${i}`}>
              <span class="n">{s.no}</span>
              <span class="d">{md(s.date)}</span>
              <span class={s.cancelled ? "cancel" : ""}>
                {s.mode !== "face" && <span class="tag" style={{ marginRight: 6 }}>オンライン</span>}
                {s.content || "—"}
              </span>
            </li>
          ))}
          {ondemand.map((s, i) => (
            <li key={`o${i}`}>
              <span class="n">
                <MonitorPlay size={14} />
              </span>
              <span class="d">
                {md(s.date)}
                {s.endDate && s.endDate !== s.date ? `〜${md(s.endDate)}` : ""}
              </span>
              <span>
                <span class="tag" style={{ marginRight: 6 }}>
                  オンデマンド
                </span>
                {s.content}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p class="muted">授業計画はシラバスに掲載されていません。</p>
      )}

      {c.textbooks.length > 0 && (
        <>
          <div class="block-title">教科書</div>
          {c.textbooks.map((t, i) => (
            <p key={i} style={{ margin: "0 0 6px" }}>
              {t.name}
              <span class="small muted">
                {" "}
                {[t.author, t.publisher, t.publicationYear].filter(Boolean).join(" / ")}
              </span>
            </p>
          ))}
        </>
      )}

      <a class="btn ghost block" style={{ marginTop: 24, textDecoration: "none" }} href={c.url} target="_blank" rel="noopener noreferrer">
        公式シラバスで見る <ExternalLink size={16} />
      </a>
    </>
  );
}
