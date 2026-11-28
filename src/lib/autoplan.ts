import { normName } from "./credits";
import { clashesWith } from "./schedule";
import type { Course, ReqCourse, Requirements } from "./types";

export interface RequiredPlan {
  add: Course[]; // 追加するクラス
  missing: ReqCourse[]; // 今年度のシラバスに開講クラスが見つからない
  clashing: ReqCourse[]; // どのクラスも今の時間割とぶつかる
  already: number; // すでに選択済み・修得済みで飛ばした数
}

/**
 * 必修の一括追加。対象は「配当年次 = 自分の学年」の必修と、不合格（D・E）だった必修（再履修）。
 * 修得済み・選択済みの科目は飛ばす。クラスは
 *   ① 履修できる（canTake）② 自学科の開講を優先 ③ 今の時間割（と、この一括追加で先に入れた科目）とぶつからない
 * 順に選ぶ。全部ぶつかる科目は追加せず clashing に返す（勝手に重複を作らない）。
 */
export function planRequired(
  req: Requirements,
  all: Course[],
  selected: Course[],
  grade: number,
  dept: string,
  canTake: (c: Course) => boolean,
  passed: Set<string>,
  retake: Set<string>,
): RequiredPlan {
  const chosen = new Set(selected.map((c) => normName(c.name)));
  const plan: RequiredPlan = { add: [], missing: [], clashing: [], already: 0 };
  const candsOf = (k: string) =>
    all
      .filter((c) => normName(c.name) === k && c.slots.length > 0 && canTake(c))
      .sort((a, b) => Number(b.syllabusDepartment === dept) - Number(a.syllabusDepartment === dept));
  // クラスの選択肢が少ない科目から先に埋める（1 クラスしかない必修が、後から入る科目に場所を取られないように）
  const targets = req.courses
    .filter((rc) => rc.required && (rc.year === grade || retake.has(normName(rc.name))))
    .map((rc) => ({ rc, cands: candsOf(normName(rc.name)) }))
    .sort((a, b) => a.cands.length - b.cands.length);
  for (const { rc, cands } of targets) {
    const k = normName(rc.name);
    if (passed.has(k) || chosen.has(k)) {
      plan.already++;
      continue;
    }
    if (!cands.length) {
      plan.missing.push(rc);
      continue;
    }
    const pick = cands.find((c) => clashesWith(c, [...selected, ...plan.add]).length === 0);
    if (!pick) {
      plan.clashing.push(rc);
      continue;
    }
    plan.add.push(pick);
    chosen.add(k);
  }
  return plan;
}
