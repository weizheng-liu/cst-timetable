import { PERIOD_TIMES } from "./periods";
import type { Course, Session } from "./types";

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Asia/Tokyo",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0900",
  "TZOFFSETTO:+0900",
  "TZNAME:JST",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding (75 octets). */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const ymd = (d: string) => d.replace(/-/g, "");
const hm = (t: string) => t.replace(":", "") + "00";

function addDays(d: string, n: number): string {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** ISO weekday of a date: 1=Mon … 7=Sun */
function weekday(d: string): number {
  const w = new Date(d + "T00:00:00Z").getUTCDay();
  return w === 0 ? 7 : w;
}

/** First..last period the course occupies on a given weekday (falls back to its first day). */
function periodsOn(c: Course, day: number): [number, number] | null {
  let ps = c.slots.filter((s) => s.day === day).map((s) => s.period);
  if (!ps.length) {
    const first = c.slots[0];
    if (!first) return null;
    ps = c.slots.filter((s) => s.day === first.day).map((s) => s.period);
  }
  return [Math.min(...ps), Math.max(...ps)];
}

export interface IcsResult {
  text: string;
  events: number;
  skippedCancelled: number;
  coursesWithoutDates: string[];
}

export function buildIcs(courses: Course[], stamp = new Date()): IcsResult {
  const now = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cst-timetable//JA",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:理工 時間割",
    "X-WR-TIMEZONE:Asia/Tokyo",
    ...VTIMEZONE,
  ];
  let events = 0;
  let skippedCancelled = 0;
  const noDates: string[] = [];

  for (const c of courses) {
    const dated = c.sessions.filter((s) => s.date);
    if (!dated.length) {
      noDates.push(c.name);
      continue;
    }
    const where = [c.campus, c.room ? `${c.room}教室` : ""].filter(Boolean).join(" ");
    for (const s of dated) {
      if (s.cancelled) {
        skippedCancelled++;
        continue;
      }
      lines.push(...eventFor(c, s, where, now));
      events++;
    }
  }
  lines.push("END:VCALENDAR");
  return { text: lines.map(fold).join("\r\n") + "\r\n", events, skippedCancelled, coursesWithoutDates: noDates };
}

function eventFor(c: Course, s: Session, where: string, now: string): string[] {
  const online = s.mode !== "face";
  const no = s.no ? `第${s.no}回 ` : "";
  const prefix = online ? "【オンライン】" : "";
  const summary = `${prefix}${c.name}`;
  const desc = [
    `${no}${s.content}`.trim(),
    s.mode === "ondemand" ? "オンデマンド授業" : "",
    c.teachers.join("、"),
    c.url,
  ]
    .filter(Boolean)
    .join("\n");
  const uid = `${c.id}-${s.kind}-${s.no ?? "x"}-${s.date}@cst-timetable`;
  const head = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${now}`, `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(desc)}`];
  if (where && !online) head.push(`LOCATION:${esc(where)}`);

  const date = s.date!;
  if (s.kind === "ondemand") {
    // オンデマンド: 視聴期間を終日イベントで表す
    const end = s.endDate && s.endDate >= date ? s.endDate : date;
    head.push(`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(addDays(end, 1))}`, "TRANSP:TRANSPARENT");
  } else {
    const range = periodsOn(c, weekday(date));
    if (!range) {
      head.push(`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(addDays(date, 1))}`);
    } else {
      const [a, b] = range;
      head.push(
        `DTSTART;TZID=Asia/Tokyo:${ymd(date)}T${hm(PERIOD_TIMES[a][0])}`,
        `DTEND;TZID=Asia/Tokyo:${ymd(date)}T${hm(PERIOD_TIMES[b][1])}`,
      );
    }
  }
  head.push("END:VEVENT");
  return head;
}
