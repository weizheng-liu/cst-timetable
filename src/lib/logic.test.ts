import { describe, expect, it } from "vitest";
import { buildCells, clashesWith, findConflicts } from "./schedule";
import { progress } from "./credits";
import { buildIcs } from "./ics";
import { sanitize } from "./store";
import { resolveTimes } from "./periods";
import { normalizeTime } from "../components/Settings";
import type { Course, Requirements } from "./types";

const mk = (id: string, name: string, term: Course["term"], slots: [number, number][], extra: Partial<Course> = {}): Course => ({
  id, pageId: 1, code: id, name, subtitle: "", teachers: ["教員 太郎"], department: "09", syllabusDepartment: "09", grade: 2,
  term, slots: slots.map(([day, period]) => ({ day, period })), credits: 2, lectureType: "講義", classGroup: null, notes: [],
  campus: "船橋", room: "1431", classFormat: "対面", onlineMethod: null, objectives: "", lectureForm: "",
  evaluation: { text: "", parts: [], tags: [] }, textbooks: [], sessions: [], hasDetail: true, url: "https://example.invalid", ...extra,
});

describe("conflicts", () => {
  const a = mk("A", "回路理論Ⅱ", "前期", [[3, 1], [3, 2]]);
  const b = mk("B", "電子回路Ⅰ", "前期", [[3, 2]]);
  const c = mk("C", "電子回路Ⅱ", "後期", [[3, 2]]);
  const y = mk("Y", "電子工学実験Ⅱ", "年間", [[3, 2]]);

  it("detects same term clash", () => {
    const cs = findConflicts([a, b]);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ day: 3, period: 2, term: "前期" });
  });
  it("ignores different terms", () => {
    expect(findConflicts([a, c])).toHaveLength(0);
    expect(clashesWith(c, [a])).toHaveLength(0);
  });
  it("year-long courses clash with both terms", () => {
    expect(clashesWith(y, [a, c]).map((x) => x.id).sort()).toEqual(["A", "C"]);
  });
  it("builds cells for a term view", () => {
    const cells = buildCells([a, c], "前期");
    expect(cells.get("3-1")?.map((x) => x.id)).toEqual(["A"]);
    expect(cells.get("3-2")?.map((x) => x.id)).toEqual(["A"]);
  });
});

describe("credits", () => {
  const req: Requirements = {
    entryYear: 2025, department: { code: "09", name: "電子工学科" }, verified: false,
    source: { url: "x", pages: [74, 75] }, totalCredits: 10,
    groups: [
      { id: "basic", label: "基礎", minCredits: 4, page: 74, parent: null },
      { id: "basic.math", label: "数学系", minCredits: 2, page: 74, parent: "basic" },
      { id: "major", label: "専門", minCredits: 6, requiredCredits: 2, page: 74, parent: null },
    ],
    courses: [
      { name: "微分積分学I", credits: 2, group: "basic.math", required: false, year: 1 },
      { name: "回路理論I", credits: 2, group: "major", required: true, year: 1 },
      { name: "回路理論II", credits: 2, group: "major", required: true, year: 1 },
    ],
  };
  it("matches by normalised name and rolls up into parents", () => {
    const sel = [mk("1", "微分積分学Ⅰ", "前期", [[1, 1]]), mk("2", "回路理論Ⅰ", "前期", [[1, 2]]), mk("3", "謎の科目", "前期", [[1, 3]])];
    const p = progress(req, sel);
    const g = Object.fromEntries(p.groups.map((x) => [x.group.id, x]));
    expect(g["basic.math"].total).toBe(2);
    expect(g["basic"].total).toBe(2);
    expect(g["basic"].missing).toBe(2);
    expect(g["major"].requiredLeft.map((r) => r.name)).toEqual(["回路理論II"]);
    expect(p.unmatched.map((c) => c.name)).toEqual(["謎の科目"]);
    expect(p.plannedTotal).toBe(6);
  });
  it("counts the same subject once when two sections are picked", () => {
    const p = progress(req, [mk("1", "回路理論Ⅰ", "前期", [[1, 1]]), mk("2", "回路理論Ⅰ", "後期", [[2, 2]])]);
    expect(p.groups.find((x) => x.group.id === "major")!.planned).toBe(2);
  });
  it("adds earned credits from leaf groups", () => {
    const p = progress(req, [], { "basic.math": 4, major: 6 });
    expect(p.earnedTotal).toBe(10);
    expect(p.missingTotal).toBe(0);
  });
});

describe("ics", () => {
  const c = mk("J51A", "回路理論Ⅰ", "前期", [[5, 1]], {
    sessions: [
      { no: 1, kind: "regular", date: "2026-04-17", mode: "face", content: "オームの法則" },
      { no: 2, kind: "regular", date: "2026-04-24", mode: "online", content: "電源" },
      { no: 3, kind: "regular", date: "2026-05-01", mode: "face", content: "休講", cancelled: true },
      { no: 1, kind: "ondemand", date: "2026-07-18", endDate: "2026-07-24", mode: "ondemand", content: "解説" },
    ],
  });
  const two = mk("J31C", "電磁気学Ⅰ及び演習", "前期", [[3, 1], [3, 2]], {
    sessions: [{ no: 1, kind: "regular", date: "2026-04-15", mode: "face", content: "静電界" }],
  });
  const r = buildIcs([c, two, mk("X", "日程なし", "前期", [[1, 1]])], new Date("2026-03-01T00:00:00Z"));

  it("creates one event per session and skips cancelled ones", () => {
    expect(r.events).toBe(4);
    expect(r.skippedCancelled).toBe(1);
    expect(r.coursesWithoutDates).toEqual(["日程なし"]);
    expect(r.text.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  });
  it("uses period times in Asia/Tokyo", () => {
    expect(r.text).toContain("DTSTART;TZID=Asia/Tokyo:20260417T090000");
    expect(r.text).toContain("DTEND;TZID=Asia/Tokyo:20260417T104000");
    // 1-2限 spanning
    expect(r.text).toContain("DTSTART;TZID=Asia/Tokyo:20260415T090000");
    expect(r.text).toContain("DTEND;TZID=Asia/Tokyo:20260415T123000");
  });
  it("marks online sessions in the title", () => {
    expect(r.text).toContain("SUMMARY:【オンライン】回路理論Ⅰ");
    expect(r.text).toContain("DTSTART;VALUE=DATE:20260718");
    expect(r.text).toContain("DTEND;VALUE=DATE:20260725");
  });
  it("uses CRLF and folds long lines", () => {
    expect(r.text.includes("\r\n")).toBe(true);
    for (const line of r.text.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("custom period times", () => {
  it("are used for .ics and validated on import", () => {
    const c = mk("J1", "テスト", "前期", [[5, 1]], { sessions: [{ no: 1, kind: "regular", date: "2026-04-17", mode: "face", content: "x" }] });
    const r = buildIcs([c], new Date("2026-03-01T00:00:00Z"), resolveTimes({ "1": ["08:50", "10:30"], "2": ["11:00", "10:00"] }));
    expect(r.text).toContain("DTSTART;TZID=Asia/Tokyo:20260417T085000");
    expect(r.text).toContain("DTEND;TZID=Asia/Tokyo:20260417T103000");
    expect(resolveTimes({ "2": ["11:00", "10:00"] })[2]).toEqual(["10:50", "12:30"]);
    const s = sanitize({ periodTimes: { "1": ["08:50", "10:30"], "2": ["25:00", "26:00"], x: ["01:00", "02:00"] }, theme: "sepia" });
    expect(s.periodTimes).toEqual({ "1": ["08:50", "10:30"] });
    expect(s.theme).toBe("sepia");
    expect(sanitize({ theme: "neon" }).theme).toBe("system");
  });
});

describe("time input", () => {
  it("normalises loose input to HH:MM", () => {
    expect(normalizeTime("920")).toBe("09:20");
    expect(normalizeTime("13:20")).toBe("13:20");
    expect(normalizeTime("1320")).toBe("13:20");
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime("abc")).toBeNull();
  });
});

describe("import sanitising", () => {
  it("drops unknown fields and bad ids", () => {
    const s = sanitize({ profile: { dept: "09", grade: 2, entryYear: 2025 }, selected: ["J51A", "<script>", 3, "J51A"], view: "後期", earned: { major: 10, bad: -1 }, evil: true });
    expect(s.selected).toEqual(["J51A"]);
    expect(s.view).toBe("後期");
    expect(s.earned).toEqual({ major: 10 });
    expect((s as any).evil).toBeUndefined();
  });
  it("returns an empty state for garbage", () => {
    expect(sanitize("nope").selected).toEqual([]);
  });
});
