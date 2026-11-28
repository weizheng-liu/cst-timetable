import type { Course, ReqCourse, ReqGroup, Requirements } from "./types";

/** Same normalisation as scripts/syllabus_lib.norm_name (NFKC + no spaces). */
export function normName(s: string): string {
  return (s || "").normalize("NFKC").replace(/\s+/g, "");
}

export function reqIndex(req: Requirements | null): Map<string, ReqCourse> {
  const m = new Map<string, ReqCourse>();
  for (const c of req?.courses ?? []) m.set(normName(c.name), c);
  return m;
}

export interface GroupProgress {
  group: ReqGroup;
  depth: number;
  planned: number; // credits from selected courses
  earned: number; // credits the user entered as already earned
  total: number;
  missing: number; // max(0, min - total)
  requiredLeft: ReqCourse[]; // 必修 courses in this group not selected
}

function descendants(groups: ReqGroup[], id: string): Set<string> {
  const out = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of groups) {
      if (g.parent && out.has(g.parent) && !out.has(g.id)) {
        out.add(g.id);
        changed = true;
      }
    }
  }
  return out;
}

function depthOf(groups: ReqGroup[], g: ReqGroup): number {
  let d = 0;
  let p = g.parent;
  while (p) {
    d++;
    p = groups.find((x) => x.id === p)?.parent ?? null;
  }
  return d;
}

/**
 * Credit progress per requirement group.
 * A selected course counts toward the group that the 授業科目配置表 assigns it to
 * (matched by name). Unmatched courses are reported separately.
 * Each 科目 counts once even if several sections were selected.
 */
export function progress(req: Requirements, selected: Course[], earned: Record<string, number> = {}, passed: Set<string> = new Set()) {
  const idx = reqIndex(req);
  const counted = new Map<string, { rc: ReqCourse; credits: number }>();
  const unmatched: Course[] = [];
  for (const c of selected) {
    const rc = idx.get(normName(c.name));
    if (!rc) {
      unmatched.push(c);
      continue;
    }
    counted.set(normName(rc.name), { rc, credits: c.credits || rc.credits });
  }
  const selectedNames = new Set(counted.keys());
  const groups: GroupProgress[] = req.groups.map((g) => {
    const ids = descendants(req.groups, g.id);
    let planned = 0;
    for (const { rc, credits } of counted.values()) if (ids.has(rc.group)) planned += credits;
    const e = [...ids].reduce((s, id) => s + (Number(earned[id]) || 0), 0);
    const total = planned + e;
    const requiredLeft = req.courses.filter((rc) => rc.required && ids.has(rc.group) && !selectedNames.has(normName(rc.name)) && !passed.has(normName(rc.name)));
    return { group: g, depth: depthOf(req.groups, g), planned, earned: e, total, missing: Math.max(0, g.minCredits - total), requiredLeft };
  });
  const plannedTotal = [...counted.values()].reduce((s, x) => s + x.credits, 0) + unmatched.reduce((s, c) => s + (c.credits || 0), 0);
  const earnedTotal = inputGroups(req).reduce((s, g) => s + (Number(earned[g.id]) || 0), 0);
  return {
    groups,
    unmatched,
    plannedTotal,
    earnedTotal,
    total: plannedTotal + earnedTotal,
    missingTotal: Math.max(0, req.totalCredits - plannedTotal - earnedTotal),
  };
}

/** Groups without children: the only ones where "already earned" credits can be entered. */
export function leafGroups(groups: ReqGroup[]): ReqGroup[] {
  return groups.filter((g) => !groups.some((x) => x.parent === g.id));
}

/**
 * 修得単位を入れられる区分：子のない区分と、子があっても科目が直接属する区分
 * （例：精密機械の「専門教育科目」は系列の子区分を持ちつつ、必修・選択の科目が直接属する）
 */
export function inputGroups(req: Requirements): ReqGroup[] {
  const direct = new Set(req.courses.map((c) => c.group));
  return req.groups.filter((g) => !req.groups.some((x) => x.parent === g.id) || direct.has(g.id));
}
