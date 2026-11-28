import { ExternalLink, Plus, Check, AlertTriangle, MonitorPlay, LayoutList } from "lucide-preact";
import { EVAL_CATEGORY, evalParts, roomOf } from "../lib/data";
import { slotLabel } from "../lib/periods";
import type { Course, ReqCourse } from "../lib/types";
import type { Eligible } from "../lib/eligibility";
import { currentSession, flagsOf, isRotation, NOTE_MAX, tokyoToday, type Flag, type Flags, type Marks } from "../lib/alerts";
import { useState } from "preact/hooks";
import type { Session } from "../lib/types";
import { dateLabel, t, tv } from "../lib/i18n";

interface Props {
  c: Course;
  on: boolean;
  req?: ReqCourse;
  clash: Course[];
  status?: Eligible;
  onToggle: (c: Course) => void;
  marks?: Marks;
  onMark?: (s: Session, what: Flag) => void;
  onNote?: (s: Session, text: string) => void;
  /** 時間割のマスから開いたとき：今回の授業と評価を先頭に出す */
  focus?: boolean;
  /** 同じ時間の他の科目を見る */
  onOthers?: () => void;
  rotation?: Record<string, boolean>;
  onRotation?: (v: boolean) => void;
}

const md = dateLabel;

export function CourseDetail({ c, on, req, clash, status, onToggle, marks = {}, onMark, onNote, focus, onOthers, rotation, onRotation }: Props) {
  const { parts, complete } = evalParts(c);
  const sum = parts.reduce((s, p) => s + p.percent, 0) || 1;
  const regular = c.sessions.filter((s) => s.kind === "regular");
  const ondemand = c.sessions.filter((s) => s.kind === "ondemand");
  const online = c.sessions.filter((s) => s.mode !== "face" && s.kind === "regular");
  const cancelled = c.sessions.filter((s) => s.cancelled);

  const cur = focus ? currentSession(c, tokyoToday()) : null;
  const curFlags = cur ? flagsOf(c, cur.s, marks) : null;
  const rot = isRotation(c, rotation);

  return (
    <>
      {focus && (
        <section class="now-card">
          {cur && curFlags ? (
            <>
              <div class="now-head">
                <span class={`now-when ${cur.when}`}>{t(cur.when === "today" ? "今日" : cur.when === "next" ? "次回" : "最終回（終了）")}</span>
                <b>{t("第{n}回", { n: cur.s.no ?? "?" })}</b>
                <span class="now-date">{md(cur.s.date)}</span>
                {cur.s.mode !== "face" && <span class="tag">{tv("オンライン")}</span>}
                {curFlags.exam && <span class="tag amber">{tv(curFlags.exam === "quiz" ? "小テスト" : "試験")}</span>}
                {curFlags.cancel && <span class="tag coral">{tv("休講")}</span>}
              </div>
              {rot ? (
                <p class="now-content muted small">{t("班ごとにテーマが入れ替わる科目なので、回ごとの内容は出していません（自分の班の予定で確認してください）。")}</p>
              ) : (
                <p class={`now-content ${curFlags.cancel ? "cancel" : ""}`}>{cur.s.content || t("（内容の記載なし）")}</p>
              )}
              {onRotation && (
                <button class="now-rot" onClick={() => onRotation(!rot)}>
                  {t(rot ? "この回の内容を表示する" : "班ごとに内容が違う科目として隠す")}
                </button>
              )}
              {onMark && onNote && <SessionMarks f={curFlags} onMark={(w) => onMark(cur.s, w)} onNote={(x) => onNote(cur.s, x)} />}
            </>
          ) : (
            <p class="now-content muted">{t("授業の日程がシラバスに掲載されていません。下の授業計画を見てください。")}</p>
          )}
          <div class="now-eval">
            <span class="now-eval-h">{t("成績評価")}</span>
            {parts.length > 0 && complete && (
              <>
                <div class="evalbar" aria-hidden="true">
                  {parts.map((p, i) => (
                    <i key={i} style={{ width: `${(p.percent / sum) * 100}%`, background: EVAL_CATEGORY[p.category]?.color }} />
                  ))}
                </div>
                <span class="now-eval-list">
                  {parts.map((p, i) => (
                    <span key={i}>
                      <span class="dot" style={{ background: EVAL_CATEGORY[p.category]?.color }} />
                      {p.label} <b class="num">{p.percent}%</b>
                    </span>
                  ))}
                </span>
              </>
            )}
            {/* 内訳の読み取りは間違うことがあるので、シラバスの原文は省略せず全部出す */}
            <p class="now-eval-text">{c.evaluation.text || t("シラバスに記載なし")}</p>
          </div>
          {onOthers && (
            <button class="now-others" onClick={onOthers}>
              <LayoutList size={14} /> {t("この時間の他の科目を見る")}
            </button>
          )}
        </section>
      )}
      {clash.length > 0 && (
        <div class="note" style={{ marginTop: 0, marginBottom: 12 }}>
          <span class="note-dot" aria-hidden="true" />
          <span>
            <b>{clash.map((x) => x.name).join("、")}</b>{t("と時間が重複")}
          </span>
        </div>
      )}
      {status === "maybe" && (
        <div class="banner warn">
          <AlertTriangle size={16} />
          <div>{t("履修できる学科・学年をシラバスの記載から読み取れませんでした。下の「履修条件」を確認してください。")}</div>
        </div>
      )}
      {status === "no" && (
        <div class="banner warn">
          <AlertTriangle size={16} />
          <div>{t("この科目は、選択中の学科・学年の履修対象外と判定しました（他キャンパス・他学科向け・再履修用など）。")}</div>
        </div>
      )}
      <dl class="kv">
        <dt>{t("担当教員")}</dt>
        <dd>{c.teachers.map(tv).join("、") || "—"}</dd>
        <dt>{t("曜日・時限")}</dt>
        <dd>
          {tv(c.term)} {slotLabel(c.slots)}
        </dd>
        <dt>{t("単位")}</dt>
        <dd>
          <span class="num">{c.credits}</span>{t("単位")}{req ? ` · ${tv(req.required ? "必修" : "選択")}` : ""}
          {c.lectureType ? ` · ${c.lectureType}` : ""}
        </dd>
        <dt>{t("対象")}</dt>
        <dd>
          {c.grade ? t("{n}年次", { n: c.grade }) : "—"}
          {c.classGroup ? ` · ${t("クラス{g}", { g: c.classGroup })}` : ""}
          {c.notes.length ? ` · ${c.notes.join("・")}` : ""}
        </dd>
        {c.eligibility && (
          <>
            <dt>{t("履修条件")}</dt>
            <dd>{c.eligibility.text || t("記載なし（共通・教養科目）")}</dd>
          </>
        )}
        <dt>{t("形態・教室")}</dt>
        <dd>
          {tv(c.classFormat)}
          {c.onlineMethod ? `（${c.onlineMethod}）` : ""}
          {c.campus ? ` · ${c.campus}` : ""}
          {roomOf(c) ? ` · ${t("教室")} ${roomOf(c)}` : ` · ${t("教室未定")}`}
        </dd>
        <dt>{t("時間割CD")}</dt>
        <dd class="num">
          {c.id}
          {c.code ? ` / ${t("科目コード")} ${c.code}` : ""}
        </dd>
      </dl>

      <div class="actions">
        <button class={`btn ${on ? "ghost" : "primary"}`} onClick={() => onToggle(c)}>
          {on ? <Check size={18} /> : <Plus size={18} />}
          {t(on ? "時間割から外す" : "時間割に追加")}
        </button>
      </div>

      <div class="block-title">{t("成績評価")}</div>
      {parts.length > 0 && complete ? (
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
                <span class="faint small">{tv(EVAL_CATEGORY[p.category]?.label)}</span>
                <span class="pct">{p.percent}%</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {c.evaluation.text && (
        <details style={{ marginTop: 10 }} open={!parts.length || !complete}>
          <summary class="small muted" style={{ cursor: "pointer" }}>
            {t("シラバス原文")}
          </summary>
          <p class="prose small muted">{c.evaluation.text}</p>
        </details>
      )}

      {c.objectives && (
        <>
          <div class="block-title">{t("到達目標")}</div>
          <p class="prose" style={{ margin: 0 }}>
            {c.objectives}
          </p>
        </>
      )}

      <div class="block-title">
        {t("授業計画")} {regular.length > 0 && <span class="num">{t("（{n}回）", { n: regular.length })}</span>}
      </div>
      {(online.length > 0 || ondemand.length > 0 || cancelled.length > 0) && (
        <div class="row-tags" style={{ marginBottom: 8 }}>
          {online.length > 0 && <span class="tag">{t("オンライン {n}回", { n: online.length })}</span>}
          {ondemand.length > 0 && <span class="tag">{t("オンデマンド {n}回", { n: ondemand.length })}</span>}
          {cancelled.length > 0 && <span class="tag coral">{t("休講 {n}回", { n: cancelled.length })}</span>}
        </div>
      )}
      {c.sessions.length > 0 && onMark && <p class="fine" style={{ margin: "0 0 6px" }}>{t("「試験」「オンライン」はシラバスの授業計画から推定しています。違っていたら各回のボタンで付け外しできます（この端末にだけ保存）。")}</p>}
      {c.sessions.length ? (
        <ol class="sessions">
          {regular.map((s, i) => {
            const f = flagsOf(c, s, marks);
            return (
              <li key={`r${i}`} class={`${f.exam ? "is-exam" : ""} ${f.task ? "is-task" : ""}`}>
                <span class="n">{s.no}</span>
                <span class="d">{md(s.date)}</span>
                <span>
                  <span class={f.cancel ? "cancel" : ""}>{s.content || "—"}</span>
                  {s.date && onMark && onNote && <SessionMarks f={f} onMark={(w) => onMark(s, w)} onNote={(x) => onNote(s, x)} />}
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
                  {tv("オンデマンド")}
                </span>
                {s.content}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p class="muted">{t("授業計画はシラバスに掲載されていません。")}</p>
      )}

      {c.textbooks.length > 0 && (
        <>
          <div class="block-title">{t("教科書")}</div>
          {c.textbooks.map((b, i) => (
            <p key={i} style={{ margin: "0 0 6px" }}>
              {b.name}
              <span class="small muted">
                {" "}
                {[b.author, b.publisher, b.publicationYear].filter(Boolean).join(" / ")}
              </span>
            </p>
          ))}
        </>
      )}

      <a class="btn ghost block" style={{ marginTop: 24, textDecoration: "none" }} href={c.url} target="_blank" rel="noopener noreferrer">
        {t("公式シラバスで見る")} <ExternalLink size={16} />
      </a>
    </>
  );
}

/** 1 回分の目印（試験・課題・オンライン・休講）と自分のメモ */
function SessionMarks({ f, onMark, onNote }: { f: Flags; onMark: (w: Flag) => void; onNote: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(f.note);
  const btn = (w: Flag, label: string, on: boolean) => (
    <button class={`mk mk-${w} ${on ? "on" : ""}`} aria-pressed={on} onClick={() => onMark(w)}>
      {tv(label)}
      {f.byUser[w] && <small>{t("自分で")}</small>}
    </button>
  );
  const save = () => {
    onNote(draft);
    setEditing(false);
  };
  return (
    <>
      <span class="mark-row">
        {btn("exam", f.exam === "quiz" ? "小テスト" : "試験", !!f.exam)}
        {btn("task", "課題", f.task)}
        {btn("online", "オンライン", f.online)}
        {btn("cancel", "休講", f.cancel)}
        {!editing && !f.note && (
          <button class="mk mk-note" onClick={() => (setDraft(""), setEditing(true))}>
            {t("＋メモ")}
          </button>
        )}
      </span>
      {editing ? (
        <span class="note-edit">
          <textarea
            rows={2}
            maxLength={NOTE_MAX}
            placeholder={t("例：レポート第3回を提出、教科書p.40まで読む")}
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), save())}
            autoFocus
          />
          <span class="note-acts">
            <button class="mk on-ink" onClick={save}>{t("保存")}</button>
            <button class="mk" onClick={() => setEditing(false)}>{t("やめる")}</button>
          </span>
        </span>
      ) : (
        f.note && (
          <button class="note-view" onClick={() => (setDraft(f.note), setEditing(true))} aria-label={t("メモ：{note}（編集）", { note: f.note })}>
            <b>{t("メモ")}</b>
            {f.note}
          </button>
        )
      )}
    </>
  );
}
