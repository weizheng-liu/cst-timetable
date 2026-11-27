import { useEffect, useState } from "preact/hooks";
import type { Profile } from "./types";

/**
 * Everything the user does is stored only in this browser (localStorage).
 * No personal information is collected: just department / grade / entry year
 * and the list of chosen 時間割CD.
 */
export interface SavedState {
  version: 1;
  profile: Profile | null;
  dataYear: number | null;
  selected: string[];
  view: "前期" | "後期";
  earned: Record<string, number>; // already-earned credits per requirement group (optional)
}

const KEY = "cst-timetable:v1";

export const emptyState = (): SavedState => ({ version: 1, profile: null, dataYear: null, selected: [], view: defaultView(), earned: {} });

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
  const selected = Array.isArray(x.selected) ? x.selected.filter((s: unknown) => typeof s === "string" && /^[0-9A-Za-z]{1,12}$/.test(s)) : [];
  const earned: Record<string, number> = {};
  if (x.earned && typeof x.earned === "object") {
    for (const [k, v] of Object.entries(x.earned)) if (typeof v === "number" && v >= 0 && v < 400) earned[k] = v;
  }
  return {
    version: 1,
    profile,
    dataYear: Number.isInteger(x.dataYear) ? x.dataYear : null,
    selected: [...new Set<string>(selected)],
    view: x.view === "後期" ? "後期" : x.view === "前期" ? "前期" : base.view,
    earned,
  };
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
