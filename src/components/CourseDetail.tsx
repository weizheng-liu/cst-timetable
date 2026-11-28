import { ExternalLink, Plus, Check, AlertTriangle, MonitorPlay } from "lucide-preact";
import { EVAL_CATEGORY, roomOf } from "../lib/data";
import { slotLabel } from "../lib/periods";
import type { Course, ReqCourse } from "../lib/types";
import type { Eligible } from "../lib/eligibility";
import { flagsOf, type Marks } from "../lib/alerts";
import type { Session } from "../lib/types";

interface Props {
  c: Course;
  on: boolean;
  req?: ReqCourse;
  clash: Course[];
  status?: Eligible;
  onToggle: (c: Course) => void;
  marks?: Marks;
  onMark?: (s: Session, what: "exam" | "online") => void;
}

const md = (d: string | null | undefined) => {
  if (!d) return "日程未定";
  const x = new Date(d + "T00:00:00");
  return `${x.getMonth() + 1}/${x.getDate()}(${"日月火水木金土"[x.getDay()]})`;
};

export function CourseDetail({ c, on, req, clash, status, onToggle, marks = {}, onMark }: Props) {
  const parts = c.evaluation.parts;
  const sum = parts.reduce((s, p) => s + p.percent, 0) || 1;
  const regular = c.sessions.filter((s) => s.kind === "regular");
  const ondemand = c.sessions.filter((s) => s.kind === "ondemand");
  const online = c.sessions.filter((s) => s.mode !== "face" && s.kind === "regular");
  const cancelled = c.sessions.filter((s) => s.cancelled);

  return (
    <>
      {clash.length > 0 && (
        <div class="note" style={{ marginTop: 0, marginBottom: 12 }}>
          <span class="note-dot" aria-hidden="true" />
          <span>
            <b>{clash.map((x) => x.name).join("、")}</b>と時間が重複
          </span>
        </div>
      )}
      {status === "maybe" && (
        <div class="banner warn">
          <AlertTriangle size={16} />
          <div>履修できる学科・学年をシラバスの記載から読み取れませんでした。下の「履修条件」を確認してください。</div>
        </div>
      )}
      {status === "no" && (
        <div class="banner warn">
          <AlertTriangle size={16} />
          <div>この科目は、選択中の学科・学年の履修対象外と判定しました（他キャンパス・他学科向け・再履修用など）。</div>
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
        {c.eligibility && (
          <>
            <dt>履修条件</dt>
            <dd>{c.eligibility.text || "記載なし（共通・教養科目）"}</dd>
          </>
        )}
        <dt>形態・教室</dt>
        <dd>
          {c.classFormat}
          {c.onlineMethod ? `（${c.onlineMethod}）` : ""}
          {c.campus ? ` · ${c.campus}` : ""}
          {roomOf(c) ? ` · 教室 ${roomOf(c)}` : " · 教室未定"}
        </dd>
        <dt>時間割CD</dt>
        <dd class="num">
          {c.id}
          {c.code ? ` / 科目コード ${c.code}` : ""}
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
      {c.sessions.length > 0 && onMark && <p class="fine" style={{ margin: "0 0 6px" }}>「試験」「オンライン」はシラバスの授業計画から推定しています。違っていたら各回のボタンで付け外しできます（この端末にだけ保存）。</p>}
      {c.sessions.length ? (
        <ol class="sessions">
          {regular.map((s, i) => {
            const f = flagsOf(c, s, marks);
            return (
              <li key={`r${i}`} class={f.exam ? "is-exam" : ""}>
                <span class="n">{s.no}</span>
                <span class="d">{md(s.date)}</span>
                <span class={s.cancelled ? "cancel" : ""}>
                  {s.content || "—"}
                  {s.date && onMark && !s.cancelled && (
                    <span class="mark-row">
                      <button class={`mk mk-exam ${f.exam ? "on" : ""}`} aria-pressed={!!f.exam} onClick={() => onMark(s, "exam")}>
                        {f.exam === "quiz" ? "小テスト" : "試験"}
                        {f.examByUser && <small>自分で</small>}
                      </button>
                      <button class={`mk mk-online ${f.online ? "on" : ""}`} aria-pressed={f.online} onClick={() => onMark(s, "online")}>
                        オンライン
                        {f.onlineByUser && <small>自分で</small>}
                      </button>
                    </span>
                  )}
                </span>
              </li>
            );
          })}
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
