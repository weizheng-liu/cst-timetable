import { describe, expect, it } from "vitest";
import electronics from "../../data/requirements/2025_electronics.json";
import precision from "../../data/requirements/2025_precision.json";
import { VOCAB_ZH, ZH } from "./i18n-dict";
import { dateLabel, detectLang, setLang, slotName, t, tv } from "./i18n";
import { groupTag } from "./grades";
import type { Requirements } from "./types";

// ソース全体を文字列で読む（vite の import.meta.glob）。辞書と i18n 自身・テストは除く
const SOURCES = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!./i18n-dict.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** t( / tv( / k( の最初の引数に出てくる文字列リテラル（三項演算子の両側も） */
function keysIn(src: string): string[] {
  const out: string[] = [];
  const re = /(?<![\w.])(?:t|tv|k)\(/g;
  while (re.exec(src)) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '"') {
        let j = i + 1;
        let s = "";
        while (j < src.length && src[j] !== '"') {
          if (src[j] === "\\") j++;
          s += src[j++];
        }
        if (depth === 1) out.push(s);
        i = j + 1;
        continue;
      }
      if (ch === "`" || ch === "'") {
        i = src.indexOf(ch, i + 1) + 1;
        continue;
      }
      if ("({[".includes(ch)) depth++;
      else if (")}]".includes(ch)) depth--;
      else if (ch === "," && depth === 1) break;
      i++;
    }
  }
  return out;
}

const JP = /[ぁ-んァ-ヶ一-龥（「]/;
const USED = new Set(Object.values(SOURCES).flatMap(keysIn).filter((k) => JP.test(k)));
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("中文辞書", () => {
  it("ソースが使う文はすべて訳がある", () => {
    expect(USED.size).toBeGreaterThan(300);
    const missing = [...USED].filter((k) => !(k in ZH));
    expect(missing).toEqual([]);
  });

  it("使われていない訳がない（VOCAB はデータ由来なので除く）", () => {
    const unused = Object.keys(ZH).filter((k) => !(k in VOCAB_ZH) && !USED.has(k));
    expect(unused).toEqual([]);
  });

  it("差し込み {x} が原文と同じ", () => {
    const bad = Object.entries(ZH).filter(([k, v]) => vars(k).join() !== vars(v).join());
    expect(bad).toEqual([]);
  });

  it("訳に日本語のひらがなが残っていない（例文・学校の画面名は除く）", () => {
    const left = Object.entries(ZH).filter(([k, v]) => /[ぁ-ん]/.test(v) && !k.includes("及び"));
    expect(left).toEqual([]);
  });

  it("卒業要件の区分名・区分タグは語ごとに訳せる", () => {
    for (const req of [electronics, precision] as unknown as Requirements[]) {
      for (const g of req.groups) {
        expect(VOCAB_ZH[g.label], g.label).toBeTruthy();
        if (g.note) expect(VOCAB_ZH[g.note], g.note).toBeTruthy();
      }
      setLang("zh");
      for (const rc of req.courses) {
        const tag = groupTag(rc, req);
        // 「選択必修 基礎系列」「教養 Ⅰ群」：記号と群番号以外に日本語が残らない
        expect(tv(tag).replace(/[ⅠⅡⅢⅣ]群|[②③]/g, ""), tag).not.toMatch(/[ぁ-んァ-ヶ]/);
      }
      setLang("ja");
    }
  });
});

describe("言語の切り替え", () => {
  it("ブラウザの言語から選ぶ（中国語なら中文、それ以外は日本語）", () => {
    expect(detectLang(["zh-CN", "ja"])).toBe("zh");
    expect(detectLang(["zh-TW"])).toBe("zh");
    expect(detectLang(["ja-JP"])).toBe("ja");
    expect(detectLang(["en-US", "zh-CN"])).toBe("zh");
    expect(detectLang(["fr-FR"])).toBe("ja");
    expect(detectLang([])).toBe("ja");
  });

  it("日本語はそのまま、中文は訳して差し込む", () => {
    setLang("ja");
    expect(t("{n}単位", { n: 2 })).toBe("2単位");
    expect(dateLabel("2026-12-01")).toBe("12/1(火)");
    expect(slotName(1, 2)).toBe("月2");
    expect(tv("前期")).toBe("前期");
    setLang("zh");
    expect(t("{n}単位", { n: 2 })).toBe("2 学分");
    expect(t("{day}曜 {p}限", { day: "周一", p: 2 })).toBe("周一 第2节");
    expect(dateLabel("2026-12-01")).toBe("12/1 周二");
    expect(dateLabel(null)).toBe("日期未定");
    expect(slotName(1, 2)).toBe("周一 2");
    expect(tv("後期")).toBe("后期");
    expect(tv("選択必修 基礎系列")).toBe("选择必修 基础系列");
    // 辞書にない学校のデータ（科目名など）は原文のまま
    expect(tv("電磁気学Ⅰ及び演習")).toBe("電磁気学Ⅰ及び演習");
    expect(t("辞書にない文")).toBe("辞書にない文");
    setLang("ja");
  });
});
