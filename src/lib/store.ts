import { useEffect, useState } from "preact/hooks";
import type { Profile } from "./types";
import { validRange } from "./periods";
import { GRADE_LIST, type Grades } from "./grades";
import { MARK_KEY_RE, NOTE_MAX, type Marks } from "./alerts";
import { sanitizeCustom, type CustomCourse } from "./custom";
import { detectLang, isLang, type Lang } from "./i18n";

/**
 * Everything the user does is stored only in this browser (localStorage).
 * No personal information is collected: just department / grade / entry year
 * and the list of chosen 時間割CD.
 */
export interface SavedState {
  version: 1;
  profile: Profile | null;
  dataYear: number | null;
  selected: string[]; // いま表示している学年（planGrade）の時間割
  plans: Record<string, string[]>; // 4 年計画：表示していない学年の時間割（"1"〜"6"）
  planGrade: number | null; // 表示中の学年。null なら在籍学年（profile.grade）
  view: "前期" | "後期";
  earned: Record<string, number>; // already-earned credits per requirement group (optional)
  periodTimes: Record<string, [string, string]>; // user overrides of 時限の開始・終了 ("1": ["09:00","10:40"])
  theme: Theme;
  showSat: boolean; // 土曜の列を常に出す（土曜に授業があれば自動で出る）
  marks: Marks; // 試験・オンライン回の手動の目印（科目id@日付）。この端末と JSON 保存のみ
  grades: Grades; // 自分で入力した成績（この端末にのみ保存。サーバーへは送らない）
  lang: Lang; // 画面の言語（日本語・简体中文・English）。初回はブラウザの言語から
  rotation: Record<string, boolean>; // 班ごとにテーマが違う実験か（自動判定の上書き。科目id → true/false）
  custom: CustomCourse[]; // 自分で追加した科目（id は "my:…"）。この端末と JSON 保存のみ
  goal: Goal; // 目標 GPA（今学期）と、手で決めた科目ごとの目標評価
  photoDim: number; // 写真テーマの暗さ (0.3–0.85)。写真そのものは別キー（BG_KEY）に保存し JSON には含めない
}

export type Goal = { gpa: number | null; per: Record<string, "S" | "A" | "B" | "C">; style?: "steady" | "focus" | "easy" };

export type Theme = "system" | "light" | "dark" | "sepia" | "blueprint" | "scope" | "photo";
export const THEMES: Theme[] = ["system", "light", "dark", "sepia", "blueprint", "scope", "photo"];

const KEY = "cst-timetable:v1";

export const emptyState = (): SavedState => ({ version: 1, profile: null, dataYear: null, selected: [], plans: {}, planGrade: null, view: defaultView(), earned: {}, periodTimes: {}, theme: "system", showSat: false, marks: {}, grades: {}, lang: detectLang(), rotation: {}, custom: [], goal: { gpa: null, per: {} }, photoDim: 0.55 });

export function defaultView(d = new Date()): "前期" | "後期" {
  const m = d.getMonth() + 1;
  return m >= 9 || m <= 2 ? "後期" : "前期";
}

export function load(): SavedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return sanitize(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export function save(s: SavedState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. – the app still works for this session */
  }
}

/** Accept only the fields we know, with the right types (used for JSON import too). */
export function sanitize(x: any): SavedState {
  const base = emptyState();
  if (!x || typeof x !== "object") return base;
  const p = x.profile;
  const profile: Profile | null =
    p && typeof p.dept === "string" && Number.isInteger(p.grade) && Number.isInteger(p.entryYear)
      ? { dept: p.dept.slice(0, 4), grade: Math.min(6, Math.max(1, p.grade)), entryYear: p.entryYear }
      : null;
  const selected = Array.isArray(x.selected) ? x.selected.filter((s: unknown) => typeof s === "string" && /^(?:[0-9A-Za-z]{1,12}|my:[a-z0-9]{1,16})$/.test(s)) : [];
  const okId = (v: unknown) => typeof v === "string" && /^(?:[0-9A-Za-z]{1,12}|my:[a-z0-9]{1,16})$/.test(v);
  const plans: Record<string, string[]> = {};
  if (x.plans && typeof x.plans === "object") {
    for (const [k, v] of Object.entries<any>(x.plans)) if (/^[1-6]$/.test(k) && Array.isArray(v)) plans[k] = [...new Set<string>(v.filter(okId))].slice(0, 120);
  }
  // 旧データ（plans なし）の selected は、そのまま在籍学年の時間割になる
  const planGrade = Number.isInteger(x.planGrade) && x.planGrade >= 1 && x.planGrade <= 6 ? x.planGrade : null;
  const earned: Record<string, number> = {};
  if (x.earned && typeof x.earned === "object") {
    for (const [k, v] of Object.entries(x.earned)) if (typeof v === "number" && v >= 0 && v < 400) earned[k] = v;
  }
  const periodTimes: Record<string, [string, string]> = {};
  if (x.periodTimes && typeof x.periodTimes === "object") {
    for (const [k, v] of Object.entries(x.periodTimes)) if (/^[1-7]$/.test(k) && validRange(v)) periodTimes[k] = [v[0], v[1]];
  }
  const marks: Marks = {};
  if (x.marks && typeof x.marks === "object") {
    for (const [k, v] of Object.entries<any>(x.marks)) {
      if (Object.keys(marks).length >= 500) break;
      if (!MARK_KEY_RE.test(k) || !v || typeof v !== "object") continue;
      const m: Marks[string] = {};
      for (const f of ["exam", "online", "cancel", "task"] as const) if (typeof v[f] === "boolean") m[f] = v[f];
      if (typeof v.note === "string" && v.note.trim()) m.note = v.note.trim().slice(0, NOTE_MAX);
      if (Object.keys(m).length) marks[k] = m;
    }
  }
  const grades: Grades = {};
  if (x.grades && typeof x.grades === "object") {
    for (const [k, v] of Object.entries<any>(x.grades)) {
      if (Object.keys(grades).length >= 400) break;
      if (typeof k === "string" && k.length <= 80 && v && typeof v.name === "string" && v.name.length <= 80 && GRADE_LIST.includes(v.grade) && typeof v.credits === "number" && v.credits >= 0 && v.credits <= 20)
        grades[k] = { name: v.name, credits: v.credits, grade: v.grade };
    }
  }
  return {
    version: 1,
    profile,
    dataYear: Number.isInteger(x.dataYear) ? x.dataYear : null,
    selected: [...new Set<string>(selected)],
    plans,
    planGrade,
    view: x.view === "後期" ? "後期" : x.view === "前期" ? "前期" : base.view,
    earned,
    periodTimes,
    theme: THEMES.includes(x.theme) ? x.theme : "system",
    showSat: x.showSat === true,
    marks,
    grades,
    lang: isLang(x.lang) ? x.lang : detectLang(),
    rotation: Object.fromEntries(
      Object.entries<any>(x.rotation && typeof x.rotation === "object" ? x.rotation : {})
        .filter(([k, v]) => /^(?:[0-9A-Za-z]{1,12}|my:[a-z0-9]{1,16})$/.test(k) && typeof v === "boolean")
        .slice(0, 200),
    ),
    custom: sanitizeCustom(x.custom),
    goal: sanitizeGoal(x.goal),
    photoDim: typeof x.photoDim === "number" && x.photoDim >= 0.3 && x.photoDim <= 0.85 ? x.photoDim : 0.55,
  };
}

function sanitizeGoal(g: any): Goal {
  const gpa = g && typeof g.gpa === "number" && g.gpa >= 1 && g.gpa <= 4 ? Math.round(g.gpa * 10) / 10 : null;
  const per: Goal["per"] = {};
  if (g && g.per && typeof g.per === "object")
    for (const [k, v] of Object.entries<any>(g.per).slice(0, 200))
      if (/^(?:[0-9A-Za-z]{1,12}|my:[a-z0-9]{1,16})$/.test(k) && ["S", "A", "B", "C"].includes(v)) per[k] = v;
  const style = g && ["steady", "focus", "easy"].includes(g.style) ? g.style : undefined;
  return { gpa, per, ...(style ? { style } : {}) };
}

export function usePersistentState(): [SavedState, (f: (s: SavedState) => SavedState) => void] {
  const [s, setS] = useState<SavedState>(load);
  useEffect(() => save(s), [s]);
  return [s, (f) => setS((prev) => f(prev))];
}

export function exportJson(s: SavedState): string {
  return JSON.stringify({ app: "cst-timetable", exportedAt: new Date().toISOString(), ...s }, null, 2);
}

export function download(filename: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

/** 写真テーマの背景画像（端末内のみ。縮小した JPEG の data URL） */
const BG_KEY = "cst-timetable:photo";

export function loadPhoto(): string | null {
  try {
    const v = localStorage.getItem(BG_KEY);
    return v && v.startsWith("data:image/") ? v : null;
  } catch {
    return null;
  }
}

export function savePhoto(dataUrl: string | null): boolean {
  try {
    if (dataUrl) localStorage.setItem(BG_KEY, dataUrl);
    else localStorage.removeItem(BG_KEY);
    return true;
  } catch {
    return false; // 容量オーバーなど
  }
}

/** Downscale a picked image to <= maxSide px and re-encode as JPEG so it fits in localStorage. */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.8): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 表示中の学年 */
export const viewGradeOf = (s: SavedState): number => s.planGrade ?? s.profile?.grade ?? 1;

/** 学年を切り替える。今の時間割を plans にしまい、行き先の時間割を selected に出す */
export function switchPlan(s: SavedState, g: number): SavedState {
  const cur = viewGradeOf(s);
  if (g === cur) return s;
  const plans: Record<string, string[]> = { ...s.plans, [cur]: s.selected };
  const selected = plans[g] ?? [];
  delete plans[g];
  return { ...s, plans, selected, planGrade: g };
}

/** 全学年の時間割（学年 → 科目 id） */
export function allPlans(s: SavedState): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const [k, v] of Object.entries(s.plans)) if (v.length) out[+k] = v;
  out[viewGradeOf(s)] = s.selected;
  return out;
}
