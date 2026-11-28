// 自分で追加した科目（シラバスのデータに無い・写真から読めたが照合できなかった科目）。
// この端末と JSON 保存にだけ入る。id は "my:" で始まり、学校の時間割CDとは重ならない。
import type { Course, Slot } from "./types";

export interface CustomCourse {
  id: string;
  name: string;
  term: "前期" | "後期" | "年間";
  slots: Slot[];
  room: string | null;
  credits: number;
}

export const CUSTOM_MAX = 60;
export const isCustomId = (id: string) => id.startsWith("my:");

export function newCustomId(): string {
  return "my:" + Math.random().toString(36).slice(2, 10);
}

export function sanitizeCustom(x: unknown): CustomCourse[] {
  if (!Array.isArray(x)) return [];
  const out: CustomCourse[] = [];
  for (const v of x) {
    if (out.length >= CUSTOM_MAX) break;
    if (!v || typeof v !== "object") continue;
    const c = v as Record<string, any>;
    if (typeof c.id !== "string" || !/^my:[a-z0-9]{1,16}$/.test(c.id)) continue;
    if (typeof c.name !== "string" || !c.name.trim()) continue;
    const slots = Array.isArray(c.slots)
      ? c.slots.filter((s: any) => s && Number.isInteger(s.day) && s.day >= 1 && s.day <= 6 && Number.isInteger(s.period) && s.period >= 1 && s.period <= 7).slice(0, 14).map((s: any) => ({ day: s.day, period: s.period }))
      : [];
    out.push({
      id: c.id,
      name: c.name.trim().slice(0, 60),
      term: c.term === "後期" ? "後期" : c.term === "年間" ? "年間" : "前期",
      slots,
      room: typeof c.room === "string" && c.room.length <= 20 ? c.room : null,
      credits: typeof c.credits === "number" && c.credits >= 0 && c.credits <= 20 ? c.credits : 0,
    });
  }
  return out;
}

export function customToCourse(c: CustomCourse): Course {
  return {
    id: c.id, pageId: null, code: null, name: c.name, subtitle: "", teachers: ["自分で追加"], department: null, syllabusDepartment: null,
    grade: null, term: c.term, slots: c.slots, credits: c.credits, lectureType: null, classGroup: null, notes: [],
    campus: null, room: c.room, classFormat: "対面", onlineMethod: null, objectives: "", lectureForm: "",
    evaluation: { text: "", parts: [], tags: [] }, textbooks: [], sessions: [], hasDetail: false, url: "",
  };
}
