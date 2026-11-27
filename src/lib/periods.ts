// 理工学部の時限 (公式シラバスサイトの時間割表に準拠, 100分授業)
export const PERIOD_TIMES: Record<number, [string, string]> = {
  1: ["09:00", "10:40"],
  2: ["10:50", "12:30"],
  3: ["13:20", "15:00"],
  4: ["15:10", "16:50"],
  5: ["17:00", "18:40"],
  6: ["18:50", "20:30"],
  7: ["20:40", "22:20"], // 公式表に記載なし。データに7限が現れた場合のみ表示 (docs/DECISIONS.md)
};

export type PeriodTimes = Record<number, [string, string]>;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Default times merged with the user's overrides (only valid HH:MM pairs with start < end are kept). */
export function resolveTimes(custom?: Record<string, [string, string]> | null): PeriodTimes {
  const out: PeriodTimes = { ...PERIOD_TIMES };
  for (const [k, v] of Object.entries(custom ?? {})) {
    const p = Number(k);
    if (out[p] && validRange(v)) out[p] = [v[0], v[1]];
  }
  return out;
}

export function validRange(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && HM.test(String(v[0])) && HM.test(String(v[1])) && v[0] < v[1];
}

export const DAYS = ["月", "火", "水", "木", "金", "土"] as const;

export const dayLabel = (d: number) => DAYS[d - 1] ?? "?";

export function slotLabel(slots: { day: number; period: number }[]): string {
  if (!slots.length) return "時間割なし";
  const byDay = new Map<number, number[]>();
  for (const s of slots) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.period]);
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, ps]) => `${dayLabel(d)}${ps.sort((a, b) => a - b).join("・")}`)
    .join(" ");
}
