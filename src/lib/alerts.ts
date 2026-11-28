import type { Course, Session } from "./types";

/**
 * 試験・オンライン回の目印。シラバスの授業計画から推定し、利用者が回ごとに上書きできる。
 * 上書きは localStorage と JSON 保存にだけ入る（キー：科目id@日付）。
 */
export type Flag = "exam" | "online" | "cancel" | "task";
export type Mark = { exam?: boolean; online?: boolean; cancel?: boolean; task?: boolean; note?: string };
export type Marks = Record<string, Mark>;
export const markKey = (id: string, date: string) => `${id}@${date}`;
export const MARK_KEY_RE = /^[0-9A-Za-z]{1,12}@\d{4}-\d{2}-\d{2}$/;
export const NOTE_MAX = 200;

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
  cancel: boolean;
  task: boolean; // 課題・提出物（利用者が付ける）
  note: string; // 自分のメモ
  byUser: Record<Flag, boolean>;
}

const autoOf = (s: Session): Record<Flag, boolean> => ({ exam: !!examOf(s.content), online: s.mode !== "face", cancel: !!s.cancelled, task: false });

export function flagsOf(c: Course, s: Session, marks: Marks): Flags {
  const auto = autoOf(s);
  const m = (s.date ? marks[markKey(c.id, s.date)] : undefined) ?? {};
  const pick = (f: Flag) => (m[f] != null ? !!m[f] : auto[f]);
  return {
    exam: pick("exam") ? examOf(s.content) ?? "exam" : null,
    online: pick("online"),
    cancel: pick("cancel"),
    task: pick("task"),
    note: m.note ?? "",
    byUser: { exam: m.exam != null, online: m.online != null, cancel: m.cancel != null, task: m.task != null },
  };
}

const put = (marks: Marks, k: string, m: Mark): Marks => {
  const out = { ...marks };
  if (Object.keys(m).length) out[k] = m;
  else delete out[k];
  return out;
};

/** 利用者の上書きを付け外しする（推定と同じ値に戻したら上書きを消す） */
export function toggleMark(marks: Marks, c: Course, s: Session, what: Flag): Marks {
  if (!s.date) return marks;
  const k = markKey(c.id, s.date);
  const cur = flagsOf(c, s, marks);
  const next = !(what === "exam" ? !!cur.exam : cur[what]);
  const m: Mark = { ...marks[k] };
  if (next === autoOf(s)[what]) delete m[what];
  else m[what] = next;
  return put(marks, k, m);
}

/** その回のメモを書く（空なら消す） */
export function setNote(marks: Marks, c: Course, s: Session, text: string): Marks {
  if (!s.date) return marks;
  const k = markKey(c.id, s.date);
  const m: Mark = { ...marks[k] };
  const t = text.trim().slice(0, NOTE_MAX);
  if (t) m.note = t;
  else delete m.note;
  return put(marks, k, m);
}

export interface Alert {
  kind: "exam" | "quiz" | "task" | "online" | "cancel" | "note";
  date: string;
  byUser: boolean;
  course: Course;
  text?: string; // メモの本文
}

const isoDay = (d: string) => ((new Date(d + "T00:00:00").getDay() + 6) % 7) + 1; // 1=月
/** 日本時間の今日（YYYY-MM-DD） */
export const tokyoToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
/** 日本時間の曜日 1=月 … 7=日 */
export const tokyoWeekday = (now = new Date()) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", weekday: "short" }).format(now)) + 1;
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
    if (f.cancel) out.push({ kind: "cancel", date: next.date!, byUser: f.byUser.cancel, course: c });
    else if (f.online) out.push({ kind: "online", date: next.date!, byUser: f.byUser.online, course: c });
  }
  let exam = false, task = false;
  for (const s of ss) {
    if (s.date! > until) break;
    const f = flagsOf(c, s, marks);
    if (!exam && f.exam && !f.cancel) (exam = true), out.push({ kind: f.exam, date: s.date!, byUser: f.byUser.exam, course: c });
    if (!task && f.task) (task = true), out.push({ kind: "task", date: s.date!, byUser: true, course: c });
    if (f.note) out.push({ kind: "note", date: s.date!, byUser: true, course: c, text: f.note });
  }
  const order: Alert["kind"][] = ["exam", "quiz", "task", "cancel", "online", "note"];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export const ALERT_LABEL: Record<Alert["kind"], string> = { exam: "試験", quiz: "小テスト", task: "課題", online: "オンライン", cancel: "休講", note: "メモ" };
export const md = (d: string) => {
  const x = new Date(d + "T00:00:00");
  return `${x.getMonth() + 1}/${x.getDate()}`;
};

/**
 * 「今回」の授業：今日あれば今日の回、なければ次の回。学期が終わっていれば最後の回。
 * 日付のない計画（シラバスに日程なし）なら null。
 */
export function currentSession(c: Course, today: string): { s: Session; when: "today" | "next" | "last" } | null {
  const dated = c.sessions.filter((s) => s.kind === "regular" && s.date).sort((a, b) => (a.date! < b.date! ? -1 : 1));
  if (!dated.length) return null;
  const next = dated.find((s) => s.date! >= today);
  if (next) return { s: next, when: next.date === today ? "today" : "next" };
  return { s: dated[dated.length - 1], when: "last" };
}
