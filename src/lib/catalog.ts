import { categoryOf } from "./data";
import { normName } from "./credits";
import { groupTag } from "./grades";
import type { Course, ReqCourse, Requirements } from "./types";

/** 一覧の区分。色は既存の --cat-* トークンを使い、文字ラベルと頭文字でも区別する（色だけに頼らない） */
export type Kind = "must" | "choice" | "major" | "liberal" | "basic" | "other";
export const KINDS: { id: Kind; label: string; mark: string; tone: string }[] = [
  { id: "must", label: "必修", mark: "必", tone: "core" },
  { id: "choice", label: "選択必修", mark: "択", tone: "lang" },
  { id: "major", label: "専門選択", mark: "専", tone: "elective" },
  { id: "liberal", label: "教養・全学共通", mark: "教", tone: "general" },
  { id: "basic", label: "基礎・外国語", mark: "基", tone: "lab" },
  { id: "other", label: "卒業要件の区分不明", mark: "他", tone: "none" },
];

export function kindOf(c: Course, rc: ReqCourse | undefined, req: Requirements | null): Kind {
  if (rc) {
    const tag = groupTag(rc, req);
    if (tag === "選択必修") return "choice";
    if (rc.required) return "must";
    if (rc.group.startsWith("major")) return "major";
    if (rc.group.startsWith("liberal") || rc.group === "common") return "liberal";
    if (rc.group.startsWith("basic")) return "basic";
    return "other";
  }
  // 卒業要件データにない科目は名前・開講学科から推定
  const cat = categoryOf(c, null);
  if (cat === "lang") return "basic";
  if (cat === "elective" || cat === "lab") return c.syllabusDepartment === c.department ? "major" : "other";
  return "other";
}

export interface Entry {
  key: string; // normName
  name: string;
  kind: Kind;
  tag: string | null; // 「教養 Ⅰ群」など
  credits: number;
  sections: Course[]; // 開講クラス（時間順）
  distinctTimes: number; // 時間の違うクラスの数
}

const firstSlot = (c: Course) => (c.slots.length ? Math.min(...c.slots.map((s) => s.day * 10 + s.period)) : 999);

/** 同じ科目名のクラスをまとめ、区分ごとに並べる */
export function buildCatalog(courses: Course[], reqOf: (c: Course) => ReqCourse | undefined, req: Requirements | null): Map<Kind, Entry[]> {
  const by = new Map<string, Entry>();
  for (const c of courses) {
    const key = normName(c.name);
    let e = by.get(key);
    if (!e) {
      const rc = reqOf(c);
      e = { key, name: c.name, kind: kindOf(c, rc, req), tag: rc ? groupTag(rc, req) : null, credits: c.credits, sections: [], distinctTimes: 0 };
      by.set(key, e);
    }
    e.sections.push(c);
  }
  const out = new Map<Kind, Entry[]>(KINDS.map((k) => [k.id, []]));
  for (const e of by.values()) {
    e.sections.sort((a, b) => firstSlot(a) - firstSlot(b) || a.id.localeCompare(b.id));
    e.distinctTimes = new Set(e.sections.map((c) => c.slots.map((s) => `${s.day}-${s.period}`).sort().join(","))).size;
    out.get(e.kind)!.push(e);
  }
  for (const list of out.values()) list.sort((a, b) => firstSlot(a.sections[0]) - firstSlot(b.sections[0]) || a.name.localeCompare(b.name, "ja"));
  return out;
}
