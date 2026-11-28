import { describe, expect, it } from "vitest";
import { buildCells, clashesWith, findConflicts } from "./schedule";
import { progress } from "./credits";
import { buildIcs } from "./ics";
import { allPlans, sanitize, switchPlan, viewGradeOf } from "./store";
import { resolveTimes } from "./periods";
import { eligibleFor } from "./eligibility";
import { tracePath } from "../components/Grid";
import { normalizeTime } from "../components/Settings";
import type { Course, Requirements } from "./types";
import { resolveOptions, slotText } from "./resolve";
import { bookmarklet, codesFromHash, parseCodes } from "./importer";
import { gradeKey, groupTag, summarize } from "./grades";
import { planRequired } from "./autoplan";
import { categoryOf } from "./data";

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

describe("eligibility of common courses", () => {
  const g = (kind: any, rules: any[], extra: Partial<Course> = {}) =>
    mk("W1", "倫理学", "前期", [[1, 1]], { department: "99", campus: "船橋", grade: 1, eligibility: { kind, rules, flags: [], text: "" }, ...extra });
  it("follows graded rules", () => {
    const c = g("graded", [{ minGrade: 1, maxGrade: 1, depts: ["01", "04", "05", "09"] }, { minGrade: 2, maxGrade: null, depts: null }]);
    expect(eligibleFor(c, "09", 1, "船橋")).toBe("yes");
    expect(eligibleFor(c, "02", 1, "船橋")).toBe("no");
    expect(eligibleFor(c, "02", 3, "船橋")).toBe("yes");
  });
  it("hides other campus, other departments and special classes", () => {
    expect(eligibleFor(g("open", [{ minGrade: null, maxGrade: null, depts: null }], { campus: "駿河台" }), "09", 1, "船橋")).toBe("no");
    expect(eligibleFor(g("depts", [{ minGrade: null, maxGrade: null, depts: ["06", "07", "09"] }]), "08", 1, "船橋")).toBe("no");
    expect(eligibleFor(g("special", []), "09", 1, "船橋")).toBe("no");
  });
  it("puts other 配当年次 behind the 他学年 toggle and flags unknown text", () => {
    expect(eligibleFor(g("open", [{ minGrade: null, maxGrade: null, depts: null }]), "09", 2, "船橋")).toBe("otherGrade");
    expect(eligibleFor(g("unknown", []), "09", 1, "船橋")).toBe("maybe");
    expect(eligibleFor(g("open", [{ minGrade: null, maxGrade: null, depts: null }], { name: "教）教育原論" }), "09", 1, "船橋")).toBe("cert");
  });
});

describe("scope trace", () => {
  it("is flat for a free day and oscillates once per class", () => {
    expect(tracePath(0, 0)).toBe("M0 20 L100 20");
    const ys = tracePath(2, 9).split(/[ML]/).filter(Boolean).map((p) => Number(p.trim().split(" ")[1]));
    expect(Math.min(...ys)).toBeCloseTo(11, 0);
    expect(Math.max(...ys)).toBeCloseTo(29, 0);
  });
});

describe("conflict resolution (緋と方眼 ConflictResolve)", () => {
  const thermo = mk("T", "熱力学Ⅰ", "前期", [[3, 2]]);
  const fluid = mk("F", "流体力学Ⅰ", "前期", [[3, 2]]);
  const fluidFri = mk("F2", "流体力学Ⅰ", "前期", [[5, 4]]);
  const fluidBusy = mk("F3", "流体力学Ⅰ", "前期", [[1, 1]]);
  const mon1 = mk("M", "線形代数", "前期", [[1, 1]]);
  const all = [thermo, fluid, fluidFri, fluidBusy, mon1];
  const req = (c: Course) => c.id === "T";

  it("puts a clash-free move first and keeps the required course", () => {
    const opts = resolveOptions(thermo, fluid, all, [thermo, fluid, mon1], "前期", () => true, req);
    expect(opts[0]).toMatchObject({ kind: "move", from: fluid, to: fluidFri });
    expect(opts[1]).toMatchObject({ kind: "keep", keep: thermo, dropRequired: false });
    expect(opts[2]).toMatchObject({ kind: "keep", keep: fluid, dropRequired: true });
  });

  it("offers no move when every other section clashes or is not takeable", () => {
    const opts = resolveOptions(thermo, fluid, all, [thermo, fluid, mon1], "前期", (c) => c.id !== "F2", req);
    expect(opts.map((o) => o.kind)).toEqual(["keep", "keep"]);
  });

  it("formats slots in the design's wording", () => {
    expect(slotText([{ day: 5, period: 4 }])).toBe("金曜 4限");
    expect(slotText([{ day: 2, period: 3 }, { day: 2, period: 4 }])).toBe("火曜 3・4限");
  });

  it("categorises courses into the five design categories", () => {
    expect(categoryOf(mk("x", "英語ⅢA", "前期", []))).toBe("lang");
    expect(categoryOf(mk("x", "電子工学実験Ⅰ", "前期", []))).toBe("lab");
    expect(categoryOf(mk("x", "電子回路Ⅰ", "前期", []), { group: "major", required: true })).toBe("core");
    expect(categoryOf(mk("x", "電子物性", "前期", []), { group: "major", required: false })).toBe("elective");
    expect(categoryOf(mk("x", "倫理学", "前期", [], { syllabusDepartment: "99" }))).toBe("general");
  });
});

describe("grades / GPA (日本大学の成績評価)", () => {
  const req = {
    entryYear: 2025, department: { code: "09", name: "電子工学科" }, verified: false, source: { url: "", title: "", pages: [] }, totalCredits: 126,
    groups: [{ id: "major", label: "専門教育科目", minCredits: 86, page: 74, parent: null }, { id: "liberal", label: "教養教育科目", minCredits: 16, page: 74, parent: null }, { id: "liberal.g1", label: "多文化と社会の理解（Ⅰ群）", parent: "liberal", minCredits: 6, page: 74 }],
    courses: [
      { name: "回路理論Ⅰ", credits: 2, year: 1, required: true, group: "major", page: 75 },
      { name: "電磁気学Ⅰ", credits: 2, year: 1, required: true, group: "major", page: 75 },
      { name: "倫理学", credits: 2, year: 1, required: false, group: "liberal.g1", page: 75 },
      { name: "電子回路Ⅰ", credits: 2, year: 2, required: true, group: "major", page: 75 },
    ],
  } as unknown as Requirements;

  it("computes GPA with D/E in the denominator and N excluded", () => {
    const s = summarize({
      [gradeKey("回路理論Ⅰ")]: { name: "回路理論Ⅰ", credits: 2, grade: "S" },
      [gradeKey("電磁気学Ⅰ")]: { name: "電磁気学Ⅰ", credits: 2, grade: "D" },
      [gradeKey("倫理学")]: { name: "倫理学", credits: 2, grade: "B" },
      [gradeKey("留学認定")]: { name: "留学認定", credits: 4, grade: "N" },
    }, req);
    expect(s.gpa).toBe(2); // (4*2 + 0*2 + 2*2) / 6
    expect(s.earned).toBe(8); // S + B + N
    expect(s.earnedByGroup).toEqual({ major: 2, "liberal.g1": 2 });
    expect(s.earnedUnmatched).toBe(4);
    expect(s.failedRequired.map((r) => r.name)).toEqual(["電磁気学Ⅰ"]);
  });

  it("labels groups for tags", () => {
    expect(groupTag(req.courses[2], req)).toBe("教養 Ⅰ群");
    expect(groupTag(req.courses[0], req)).toBe("専門");
  });

  it("plans required courses for the grade plus failed ones, avoiding clashes", () => {
    const own = mk("J1", "電子回路Ⅰ", "前期", [[4, 2]]);
    const retakeBusy = mk("J2", "電磁気学Ⅰ", "前期", [[4, 2]]);
    const retakeFree = mk("J3", "電磁気学Ⅰ", "後期", [[1, 1]]);
    const plan = planRequired(req, [own, retakeBusy, retakeFree], [], 2, "09", () => true, new Set([gradeKey("回路理論Ⅰ")]), new Set([gradeKey("電磁気学Ⅰ")]));
    expect(plan.add.map((c) => c.id).sort()).toEqual(["J1", "J3"]);
    expect(plan.missing).toEqual([]);
  });

  it("does not add a required course whose every section clashes", () => {
    const busy = mk("X", "他の科目", "前期", [[4, 2]]);
    const only = mk("J1", "電子回路Ⅰ", "前期", [[4, 2]]);
    const plan = planRequired(req, [only], [busy], 2, "09", () => true, new Set(), new Set());
    expect(plan.add).toEqual([]);
    expect(plan.clashing.map((r) => r.name)).toEqual(["電子回路Ⅰ"]);
  });
});

describe("履修届確認表 import", () => {
  // 実際の表の書式をまねたダミー（個人情報は含めない）
  const sample = `履修届確認表 2026/11/28
学部:理工学部 学年:2年 学生番号:0000 氏名:TEST
(前期)J31D:電磁気学Ⅰ及び演習{2}[未来]<教員A>③【船】↓連続2時限
(後期)J31G:電磁気学Ⅱ及び演習{2}[未来]<教員A>③【船】
（前期）P41I：英語ⅡA<教員B>①【船】
(年間)J43C:電子工学実験Ⅱ{1}[未来]<教員C>④【船】↓連続2時限
(前期)J31D:電磁気学Ⅰ及び演習  重複は 1 回だけ
抽選結果 前期 月 1 X99Z 心理学`;

  it("extracts only codes that follow a term marker, once each", () => {
    expect(parseCodes(sample)).toEqual(["J31D", "J31G", "P41I", "J43C"]);
  });

  it("reads codes from the URL hash and drops junk", () => {
    expect(codesFromHash("#import=J31D,P41I,bad,J31D")).toEqual(["J31D", "P41I"]);
    expect(codesFromHash("#other")).toBeNull();
  });

  it("builds a bookmarklet that only carries codes", () => {
    const b = decodeURIComponent(bookmarklet("https://example.invalid/app/"));
    expect(b.startsWith("javascript:")).toBe(true);
    expect(b).toContain("#import=");
    expect(b).not.toMatch(/学生番号|氏名|fetch|XMLHttpRequest/);
  });
});

describe("4 年計画", () => {
  it("migrates old data: selected becomes the enrolled grade's plan", () => {
    const s = sanitize({ profile: { dept: "09", grade: 2, entryYear: 2025 }, selected: ["J22D"] });
    expect(viewGradeOf(s)).toBe(2);
    expect(allPlans(s)).toEqual({ 2: ["J22D"] });
  });

  it("switching grade keeps each year's timetable separate", () => {
    let s = sanitize({ profile: { dept: "09", grade: 2, entryYear: 2025 }, selected: ["J22D"] });
    s = switchPlan(s, 3);
    expect(s.selected).toEqual([]);
    s = { ...s, selected: ["J31D"] };
    s = switchPlan(s, 1);
    expect(s.selected).toEqual([]);
    s = switchPlan(s, 2);
    expect(s.selected).toEqual(["J22D"]);
    expect(allPlans(s)).toEqual({ 2: ["J22D"], 3: ["J31D"] });
    // 保存して読み戻しても同じ
    expect(allPlans(sanitize(JSON.parse(JSON.stringify(s))))).toEqual({ 2: ["J22D"], 3: ["J31D"] });
  });
});
