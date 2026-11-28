import type { Course } from "./types";
import { matchCells, similarity } from "./screenshot";
/**
 * 学校の「履修届確認表」（RisyuDisp.aspx）の文字から時間割CDだけを取り出す。
 * 1 コマの表記は「(前期)J31D:電磁気学Ⅰ及び演習<教員>③【船】」の形。
 * 取り出すのは「(前期|後期|年間)」の直後にある 4 文字のコードだけで、
 * 氏名・学生番号など他の文字は読まない・残さない。
 */
const CODE_RE = /[(（]\s*(?:前期|後期|年間|通年)(?:隔週)?\s*[)）]\s*([A-Z][0-9]{2}[0-9A-Z])\s*[:：]/g;

export interface Entry {
  code: string;
  term: "前期" | "後期" | "年間" | "";
  /** 表に書かれた科目名（教員・単位・校舎などは切り落とす）。年度が違うと同じコードが別の科目なので照合に使う */
  name: string;
  /** 連続する時限の数（「↓連続2時限」なら 2） */
  span?: number;
}

const ENTRY_RE = /[(（]\s*(前期|後期|年間|通年)(?:隔週)?\s*[)）]\s*([A-Z][0-9]{2}[0-9A-Z])\s*[:：]\s*([^\n<＜{［\[【★↓]{0,40})([^\n]*)/g;

/** 確認表の文字 → 時間割CD・学期・科目名（それ以外の文字は読まない） */
export function parseEntries(text: string): Entry[] {
  const out: Entry[] = [];
  for (const m of (text || "").normalize("NFKC").matchAll(ENTRY_RE)) {
    if (out.some((e) => e.code === m[2])) continue;
    const span = +(m[4].match(/連続\s*(\d)\s*時限/)?.[1] ?? 1);
    out.push({ code: m[2], term: m[1] === "通年" ? "年間" : (m[1] as Entry["term"]), name: m[3].replace(/\s+/g, "").trim(), ...(span > 1 ? { span } : {}) });
  }
  return out;
}

export function parseCodes(text: string): string[] {
  const out: string[] = [];
  for (const m of (text || "").normalize("NFKC").matchAll(CODE_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** URL の #import=J31D~電磁気学Ⅰ及び演習~前期,P41I,... から読む（ハッシュはサーバーに送られない）。名前・学期は省略可 */
export function entriesFromHash(hash: string): Entry[] | null {
  const m = /(?:^#|&)import=([^&]*)/.exec(hash || "");
  if (!m) return null;
  const out: Entry[] = [];
  for (const part of m[1].split(",")) {
    let [code, name = "", term = "", sp = ""] = part.split("~");
    try {
      name = decodeURIComponent(name);
    } catch {
      name = "";
    }
    if (!/^[A-Z][0-9]{2}[0-9A-Z]$/.test(code) || out.some((e) => e.code === code)) continue;
    const span = /^[2-4]$/.test(sp) ? +sp : 1;
    out.push({ code, name: name.slice(0, 40), ...(span > 1 ? { span } : {}), term: (["前期", "後期", "年間"].includes(decodeURIComponent(term)) ? decodeURIComponent(term) : "") as Entry["term"] });
  }
  return out;
}

export function codesFromHash(hash: string): string[] | null {
  return entriesFromHash(hash)?.map((e) => e.code) ?? null;
}

/** 時間割CD の 2・3 文字目は曜日・時限（J43B = 木 3 限）。0 は時間外 */
export function slotOfCode(code: string): { day: number; period: number } | null {
  const day = +code[1];
  const period = +code[2];
  return day >= 1 && day <= 6 && period >= 1 && period <= 7 ? { day, period } : null;
}

/**
 * ブックマークレット本体。確認表のページで実行すると、コードだけを集めて
 * このサイトを新しいタブで開く（#import=コード~科目名~学期,...）。氏名・学生番号などページの他の情報は送らない。
 */
export function bookmarklet(siteUrl: string): string {
  const js = `(()=>{var t=document.body.innerText.normalize('NFKC'),r=/[(（]\\s*(前期|後期|年間|通年)(?:隔週)?\\s*[)）]\\s*([A-Z][0-9]{2}[0-9A-Z])\\s*[:：]\\s*([^\\n<＜{［\\[【★↓]{0,40})([^\\n]*)/g,s=[],c=[],m,k;while(m=r.exec(t))c.indexOf(m[2])<0&&(c.push(m[2]),k=(m[4].match(/連続\\s*(\\d)\\s*時限/)||[])[1]||'',s.push(m[2]+'~'+encodeURIComponent(m[3].replace(/\\s+/g,''))+'~'+encodeURIComponent(m[1]=='通年'?'年間':m[1])+'~'+k));if(!s.length){alert('時間割CDが見つかりません。履修届確認表のページで実行してください。');return}var u='${siteUrl}#import='+s.join(',');window.open(u,'_blank')||(location.href=u)})()`;
  return "javascript:" + encodeURIComponent(js);
}

export interface Resolved {
  entry: Entry;
  /** 今年度のデータで当てはまる科目（無ければ null → 自分で追加） */
  course: Course | null;
  /** code: コードも名前も一致 / renamed: 今年は同じコードが別の科目なので名前で照合 / moved: 今年は別の時間 / none: 見つからない */
  how: "code" | "renamed" | "moved" | "none";
  slot: { day: number; period: number } | null;
}

/**
 * 確認表の 1 行を今年度のデータと照合する。
 * 時間割CD は毎年振り直されるので（2025 の J21A = 自主創造の基礎、2026 の J21A = 電磁波工学）、
 * 名前が読めたときは名前が合うかを必ず確かめる。
 */
export function resolveEntries(entries: Entry[], all: Course[], byId: Map<string, Course>): Resolved[] {
  return entries.map((entry) => {
    const slot = slotOfCode(entry.code);
    const byCode = byId.get(entry.code) ?? null;
    if (byCode && (!entry.name || similarity(entry.name, byCode.name) >= 0.6)) return { entry, course: byCode, how: "code", slot };
    if (!entry.name) return { entry, course: null, how: "none", slot };
    const term = entry.term === "後期" ? "後期" : "前期";
    const [m] = matchCells([{ day: slot?.day ?? 0, period: slot?.period ?? 0, text: entry.name }], all, term);
    // 名前の一致は強めに見る（同じ時間の別の科目に寄せない）
    if (m?.course && similarity(entry.name, m.course.name) >= 0.6) return { entry, course: m.course, how: m.moved ? "moved" : "renamed", slot };
    return { entry, course: null, how: "none", slot };
  });
}
