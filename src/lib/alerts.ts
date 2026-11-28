import type { Course, Session } from "./types";

/**
 * 試験・オンライン回の目印。シラバスの授業計画から推定し、利用者が回ごとに上書きできる。
 * 上書きは localStorage と JSON 保存にだけ入る（キー：科目id@日付）。
 */
export type Mark = { exam?: boolean; online?: boolean };
export type Marks = Record<string, Mark>;
export const markKey = (id: string, date: string) => `${id}@${date}`;
export const MARK_KEY_RE = /^[0-9A-Za-z]{1,12}@\d{4}-\d{2}-\d{2}$/;

const EXAM_RE = /(期末試験|中間試験|定期試験|期末テスト|中間テスト|確認テスト|小テスト|筆記試験|試験|テスト)/g;
// 直後がこれなら「その回に試験をする」ではない（解説・返却・対策・範囲の話）
const NOT_AFTER = /^(問題)?(の|と)?(解説|返却|講評|範囲|対策|勉強|形式|に向け)/;

/** 授業内容の文から試験の回かどうかを推定する。小テストは "quiz" */
export function examOf(text: string): "exam" | "quiz" | null {
  let found: "exam" | "quiz" | null = null;
  for (const m of (text || "").matchAll(EXAM_RE)) {
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 8);
    if (NOT_AFTER.test(after)) continue;
    if (/自宅/.test(text.slice(Math.max(0, (m.index ?? 0) - 4), m.index))) continue;
    if (m[0] === "小テスト") found = found ?? "quiz";
    else return "exam";
  }
  return found;
}

export interface Flags {
  exam: "exam" | "quiz" | null;
  online: boolean;
  examByUser: boolean;
  onlineByUser: boolean;
}

export function flagsOf(c: Course, s: Session, marks: Marks): Flags {
  const auto = { exam: examOf(s.content), online: s.mode !== "face" };
  const m = s.date ? marks[markKey(c.id, s.date)] : undefined;
  const examByUser = m?.exam != null;
  const onlineByUser = m?.online != null;
  return {
    exam: examByUser ? (m!.exam ? auto.exam ?? "exam" : null) : auto.exam,
    online: onlineByUser ? !!m!.online : auto.online,
    examByUser,
    onlineByUser,
  };
}

/** 利用者の上書きを付け外しする（推定と同じ値に戻したら上書きを消す） */
export function toggleMark(marks: Marks, c: Course, s: Session, what: "exam" | "online"): Marks {
  if (!s.date) return marks;
  const k = markKey(c.id, s.date);
  const cur = flagsOf(c, s, marks);
  const next = what === "exam" ? !cur.exam : !cur.online;
  const auto = what === "exam" ? !!examOf(s.content) : s.mode !== "face";
  const m: Mark = { ...marks[k] };
  if (next === auto) delete m[what];
  else m[what] = next;
  const out = { ...marks };
  if (Object.keys(m).length) out[k] = m;
  else delete out[k];
  return out;
}

export interface Alert {
  kind: "exam" | "quiz" | "online" | "cancel";
  date: string;
  byUser: boolean;
  course: Course;
}

const isoDay = (d: string) => ((new Date(d + "T00:00:00").getDay() + 6) % 7) + 1; // 1=月
export const todayIso = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const addDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00");
  x.setDate(x.getDate() + n);
  return todayIso(x);
};

/**
 * これからの目印。試験は 14 日以内のいちばん近い回、オンライン・休講は「次の回」だけ。
 * day を渡すとその曜日の回だけを見る（週 2 回の科目のマス用）。
 */
export function upcoming(c: Course, today: string, marks: Marks, day?: number, horizon = 14): Alert[] {
  const until = addDays(today, horizon);
  const ss = c.sessions
    .filter((s) => s.kind === "regular" && s.date && s.date >= today && (day == null || isoDay(s.date) === day))
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const out: Alert[] = [];
  const next = ss[0];
  if (next) {
    const f = flagsOf(c, next, marks);
    if (next.cancelled) out.push({ kind: "cancel", date: next.date!, byUser: false, course: c });
    else if (f.online) out.push({ kind: "online", date: next.date!, byUser: f.onlineByUser, course: c });
  }
  for (const s of ss) {
    if (s.date! > until) break;
    const f = flagsOf(c, s, marks);
    if (f.exam && !s.cancelled) {
      out.unshift({ kind: f.exam, date: s.date!, byUser: f.examByUser, course: c });
      break;
    }
  }
  return out;
}

export const ALERT_LABEL: Record<Alert["kind"], string> = { exam: "試験", quiz: "小テスト", online: "オンライン", cancel: "休講" };
export const md = (d: string) => {
  const x = new Date(d + "T00:00:00");
  return `${x.getMonth() + 1}/${x.getDate()}`;
};
