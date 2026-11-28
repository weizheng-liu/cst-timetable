// 画面の言語（日本語・简体中文）。英語などを足すときは Lang と辞書を 1 つ増やすだけ。
// 日本語の文がそのまま「鍵」になる：t("時間割") は日本語ならそのまま、ほかの言語なら辞書の訳を返す。
// 科目名・シラバス本文・教室など学校のデータは訳さない（日本語の原文のまま）。
import { ZH } from "./i18n-dict";

export type Lang = "ja" | "zh";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "ja", label: "日本語" },
  { id: "zh", label: "简体中文" },
];

let cur: Lang = "ja";
const DICT: Record<Exclude<Lang, "ja">, Record<string, string>> = { zh: ZH };

export function setLang(l: Lang) {
  cur = l;
  if (typeof document !== "undefined") document.documentElement.lang = l === "zh" ? "zh-Hans" : "ja";
}
export const getLang = (): Lang => cur;

/** 初回はブラウザの言語から選ぶ */
export function detectLang(langs: readonly string[] = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : []): Lang {
  for (const l of langs) {
    const x = (l || "").toLowerCase();
    if (x.startsWith("ja")) return "ja";
    if (x.startsWith("zh")) return "zh";
  }
  return "ja";
}

export function isLang(x: unknown): x is Lang {
  return x === "ja" || x === "zh";
}

/** 画面の文。{name} の形の差し込みに vars を入れる */
export function t(ja: string, vars?: Record<string, string | number>): string {
  const s = cur === "ja" ? ja : (DICT[cur][ja] ?? ja);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/**
 * 学校のデータに由来するが、画面では訳したい短い語（前期・必修・試験…）。
 * 空白で区切った語ごとに辞書にあれば訳す（「選択必修 電子回路系」→「选修必修 电子电路系」）。
 */
export function tv(value: string | null | undefined): string {
  if (!value) return "";
  if (cur === "ja") return value;
  const d = DICT[cur];
  if (d[value]) return d[value];
  return value
    .split(" ")
    .map((w) => d[w] ?? w)
    .join(" ");
}

const DAY_NAMES: Record<Lang, string[]> = {
  ja: ["月", "火", "水", "木", "金", "土", "日"],
  zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
};

/** 曜日（1=月 … 7=日）の表示名 */
export const dayName = (d: number): string => DAY_NAMES[cur][d - 1] ?? "?";

/** 「月2」「周一 2」 */
export const slotName = (day: number, period: number): string => (cur === "ja" ? `${dayName(day)}${period}` : `${dayName(day)} ${period}`);

/** 日付 2026-12-01 → 「12/1(火)」「12/1 周二」 */
export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return t("日程未定");
  const x = new Date(iso + "T00:00:00");
  const md = `${x.getMonth() + 1}/${x.getDate()}`;
  const wd = DAY_NAMES[cur][(x.getDay() + 6) % 7];
  return cur === "ja" ? `${md}(${wd})` : `${md} ${wd}`;
}

export const locale = (): string => (cur === "ja" ? "ja-JP" : "zh-CN");

/** 訳す語の印（値はそのまま）。表示するときに t() を通す。テストはこの印と t("…") を集めて辞書を確かめる */
export const k = (ja: string): string => ja;
