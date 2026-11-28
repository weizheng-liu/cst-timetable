// 他の時間割アプリの画面写真から「曜日 × 時限」の格子を見つけ、各マスの科目名を候補と照合する。
// ここは純粋な計算だけ（画像はブラウザ内の ImageData のまま。外へは出さない）。
import type { Course } from "./types";
import { inTerm } from "./schedule";

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array; // RGBA
}

export interface Band {
  start: number;
  end: number;
}

export interface GridGuess {
  cols: Band[];
  rows: Band[];
}

const EDGE = 10;
const STEP = 3; // 角の丸い・ぼかしのある境目も拾えるよう 3px 離れた画素と比べる

function diff(d: Uint8ClampedArray | Uint8Array, i: number, j: number): number {
  return Math.max(Math.abs(d[i] - d[j]), Math.abs(d[i + 1] - d[j + 1]), Math.abs(d[i + 2] - d[j + 2]));
}

/** 縦の境目（左右の色の差）が各 x にどれだけあるか */
export function colProfile(px: Pixels): Float64Array {
  const { width: W, height: H, data: d } = px;
  const v = new Float64Array(W);
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x + STEP < W; x++) if (diff(d, (y * W + x) * 4, (y * W + x + STEP) * 4) > EDGE) v[x + 1]++;
  return v;
}

/**
 * 横の境目のうち、マスの幅いっぱいに続くもの（＝マスの上下の縁）だけを数える。
 * 文字の横線は短いので入らない。値は「その y で縁が通っている列の数」。
 */
export function rowProfile(px: Pixels, cols: Band[]): Float64Array {
  const { width: W, height: H, data: d } = px;
  const h = new Float64Array(H);
  for (let y = 0; y + STEP < H; y++) {
    for (const c of cols) {
      const a = Math.round(c.start + (c.end - c.start) * 0.15);
      const b = Math.round(c.end - (c.end - c.start) * 0.15);
      let hit = 0;
      for (let x = a; x < b; x++) if (diff(d, (y * W + x) * 4, ((y + STEP) * W + x) * 4) > EDGE) hit++;
      if (hit >= (b - a) * 0.8) h[y + 1]++;
    }
  }
  return h;
}

function smooth(p: ArrayLike<number>, r = 2): Float64Array {
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += p[i + k] ?? 0;
    out[i] = s;
  }
  return out;
}

/** 等間隔に並ぶマスの並び（周期・位置・幅）を 1 次元の線の分布から推定する */
export function findBands(profile: ArrayLike<number>, minLag: number, maxLag: number, minCover = 0.5): Band[] {
  const n = profile.length;
  const p = smooth(profile);
  const mean = p.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const q = p.map((x) => Math.max(0, x - mean)); // 背景のざらつきを引く
  maxLag = Math.min(maxLag, n - 1);
  if (minLag >= maxLag) return [];
  // 自己相関で周期を出す
  const ac = new Float64Array(maxLag + 1);
  for (let l = minLag; l <= maxLag; l++) {
    let s = 0;
    for (let i = 0; i + l < n; i++) s += q[i] * q[i + l];
    ac[l] = s / (n - l);
  }
  let P = minLag;
  for (let l = minLag; l <= maxLag; l++) if (ac[l] > ac[P]) P = l;
  if (!(ac[P] > 0)) return [];
  // 位相（マスの端がどこに来るか）
  let o = 0;
  let best = -1;
  for (let s = 0; s < P; s++) {
    let t = 0;
    for (let x = s; x < n; x += P) t += q[x];
    if (t > best) {
      best = t;
      o = s;
    }
  }
  // 幅：o が左端なら o+w、右端なら o−w にもう一方の端がある
  let w = 0;
  let wScore = -1;
  let oIsRight = false;
  for (let cand = Math.round(P * 0.55); cand <= Math.round(P * 0.97); cand++) {
    let l = 0;
    let r = 0;
    for (let x = o - P * Math.ceil(n / P); x < n + P; x += P) {
      l += q[x + cand] ?? 0;
      r += q[x - cand] ?? 0;
    }
    if (l > wScore) [wScore, w, oIsRight] = [l, cand, false];
    if (r > wScore) [wScore, w, oIsRight] = [r, cand, true];
  }
  const start0 = oIsRight ? o - w : o;
  // 線の強さの基準（マスの端の値の上位）
  const peaks: number[] = [];
  for (let x = start0 - P * Math.ceil(n / P); x < n; x += P) {
    if (x >= 0) peaks.push(q[x]);
    if (x + w >= 0 && x + w < n) peaks.push(q[x + w]);
  }
  peaks.sort((a, b) => b - a);
  const ref = peaks[Math.min(2, peaks.length - 1)] ?? 0;
  const bands: Band[] = [];
  for (let s = ((start0 % P) + P) % P; s < n; s += P) {
    const e = s + w;
    if (e - n > w * (1 - minCover)) continue; // ほとんど画面の外
    const ev = Math.max(q[s] ?? 0, q[e] ?? 0);
    if (ev < ref * 0.15) continue;
    bands.push({ start: s, end: Math.min(e, n - 1) });
  }
  if (start0 < 0) {
    // 先頭が少しだけ外にはみ出したマス
    const s = start0 % P;
    if (s < 0 && s + w > w * minCover && (q[s + w] ?? 0) >= ref * 0.15) bands.unshift({ start: 0, end: s + w });
  }
  return bands;
}

export function detectGrid(px: Pixels): GridGuess | null {
  const cols = findBands(colProfile(px), Math.round(px.width / 10), Math.round(px.width / 3), 0.9);
  if (cols.length < 3) return null;
  const rows = findBands(rowProfile(px, cols), Math.round(px.height / 25), Math.round(px.height / 4), 0.5);
  if (cols.length < 3 || rows.length < 2) return null;
  return { cols, rows };
}

/** マスに文字があるか（暗い画素の割合） */
export function inkRatio(px: Pixels, x0: number, y0: number, x1: number, y1: number): number {
  const { width: W, data: d } = px;
  [x0, y0, x1, y1] = [x0, y0, x1, y1].map(Math.round);
  const lum: number[] = [];
  for (let y = Math.max(0, y0); y < Math.min(px.height, y1); y += 2)
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x += 2) {
      const i = (y * W + x) * 4;
      lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
  if (!lum.length) return 0;
  const sorted = [...lum].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  let ink = 0;
  for (const l of lum) if (Math.abs(l - med) > 60) ink++;
  return ink / lum.length;
}

// ---- 文字の読み取り結果の解釈 ----

const DAY_CHARS = "月火水木金土日";

/** 見出しの OCR から曜日（1=月 … 7=日）。読めなければ null */
export function dayOf(text: string): number | null {
  const t = text.normalize("NFKC").replace(/\s+/g, "");
  for (const ch of t) {
    const i = DAY_CHARS.indexOf(ch);
    if (i >= 0) return i + 1;
  }
  const en = t.toLowerCase().match(/^(mon|tue|wed|thu|fri|sat|sun)/);
  return en ? ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(en[1]) + 1 : null;
}

/**
 * 時限の欄の OCR（例「1 09:00 10:40」）から時限。
 * 数字が読めなくても、開始時刻がこのサイトの時限表（starts: 時限 → "09:00"）と 20 分以内で合えばそれを使う。
 */
export function periodOf(text: string, starts: Record<number, string> = {}): number | null {
  const t = text.normalize("NFKC");
  const time = t.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  const rest = t.replace(/\d{1,2}\s*[:：]\s*\d{2}/g, " ");
  const m = rest.match(/(?:^|[^\d])([1-7])(?:限)?(?![\d])/);
  if (m) return +m[1];
  if (time) {
    const min = +time[1] * 60 + +time[2];
    for (const [p, s] of Object.entries(starts)) {
      const [h, mm] = s.split(":").map(Number);
      if (Math.abs(h * 60 + mm - min) <= 20) return +p;
    }
  }
  return null;
}

/**
 * 見つかった番号（読めないところは null）を、左から順に連番として整える。
 * 一番多い「番号 − 位置」のずれを採用し、読めなければ fallback から数える。
 */
export function sequence(found: (number | null)[], fallback: number): number[] {
  const votes = new Map<number, number>();
  found.forEach((d, i) => d != null && votes.set(d - i, (votes.get(d - i) ?? 0) + 1));
  let off = fallback;
  let n = 0;
  for (const [k, c] of votes) if (c > n || (c === n && k === fallback)) [off, n] = [k, c];
  return found.map((_, i) => off + i);
}

/** 画面上部の文字から年度と学期 */
export function headerInfo(text: string): { year: number | null; term: "前期" | "後期" | null } {
  const t = text.normalize("NFKC").replace(/\s+/g, "");
  const y = t.match(/(20\d\d)年?/);
  const term = /(1学期|前期|春学期|第1学期|1st)/.test(t) ? "前期" : /(2学期|後期|秋学期|第2学期|2nd)/.test(t) ? "後期" : null;
  return { year: y ? +y[1] : null, term };
}

const ROOM_RE = /(?<![\d])\d{3,4}(?![\d])/g;

/** マスの OCR → 科目名と教室番号 */
export function parseCell(text: string): { name: string; rooms: string[] } {
  const lines = text.normalize("NFKC").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const rooms: string[] = [];
  const nameLines: string[] = [];
  for (const l of lines) {
    const r = l.match(ROOM_RE);
    if (r) rooms.push(...r);
    // 教室の札（数字だけ、未登録、両課、…）は名前に入れない
    const rest = l.replace(ROOM_RE, "").replace(/[教室実験…\.・,、\s]/g, "");
    if (r && rest.length <= 2) continue;
    if (/^(未登録|両課|未定|オンライン)$/.test(l.replace(/\s/g, ""))) continue;
    nameLines.push(l);
  }
  const name = nameLines
    .join("")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}()（）ⅠⅡⅢⅣ・]/gu, "");
  return { name, rooms: [...new Set(rooms)] };
}

/** 照合用に名前をそろえる（Ⅰ・I・l・| を 1 に、空白と記号を除く） */
export function matchKey(s: string): string {
  return s
    .replace(/[ⅠⅡⅢⅣⅤ]/g, (r) => String("ⅠⅡⅢⅣⅤ".indexOf(r) + 1))
    .normalize("NFKC")
    .replace(/[\s()（）・\-ー―‐「」]/g, "")
    .replace(/[IlＩ|｜!]/g, "1")
    .replace(/[OＯ]/g, "0")
    .toLowerCase();
}

function bigrams(s: string): string[] {
  if (s.length < 2) return s ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i + 1 < s.length; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** 文字の 2 文字組の重なり（0〜1） */
export function similarity(a: string, b: string): number {
  const x = bigrams(matchKey(a));
  const y = bigrams(matchKey(b));
  if (!x.length || !y.length) return 0;
  const pool = new Map<string, number>();
  for (const g of y) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of x) {
    const c = pool.get(g) ?? 0;
    if (c > 0) {
      hit++;
      pool.set(g, c - 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}

export interface CellRead {
  day: number;
  period: number;
  text: string;
}

export interface CellMatch {
  day: number;
  period: number;
  name: string;
  rooms: string[];
  /** 選ばれた科目（なければ null） */
  course: Course | null;
  /** 0〜1。0.6 未満は「確かめて」 */
  score: number;
  /** その時間の候補（点の高い順） */
  options: { course: Course; score: number }[];
  /** 今年のデータでは別の時間にある */
  moved: boolean;
}

function scoreCourse(c: Course, name: string, rooms: string[]): number {
  let s = similarity(name, c.name);
  if (rooms.length && c.room && rooms.some((r) => c.room!.includes(r))) s += 0.15;
  return s;
}

/** 読み取ったマスを、その曜日・時限・学期にある科目と照合する */
export function matchCells(cells: CellRead[], all: Course[], term: "前期" | "後期"): CellMatch[] {
  const pool = all.filter((c) => inTerm(c, term));
  const out: CellMatch[] = [];
  for (const cell of cells) {
    const { name, rooms } = parseCell(cell.text);
    if (matchKey(name).length < 2) continue;
    const here = pool.filter((c) => c.slots.some((s) => s.day === cell.day && s.period === cell.period));
    const ranked = here
      .map((c) => ({ course: c, score: scoreCourse(c, name, rooms) }))
      .sort((a, b) => b.score - a.score || a.course.name.length - b.course.name.length);
    let course: Course | null = null;
    let score = 0;
    let moved = false;
    if (ranked[0] && ranked[0].score >= 0.3) ({ course, score } = ranked[0]);
    else {
      // 今年は別の時間かもしれない：学期全体から名前で探す
      let best: { course: Course; score: number } | null = null;
      for (const c of pool) {
        const s = similarity(name, c.name) - (/再履修/.test(c.classGroup ?? "") ? 0.01 : 0);
        if (s >= 0.6 && (!best || s > best.score)) best = { course: c, score: s };
      }
      if (best) {
        ({ course, score } = best);
        moved = true;
      }
    }
    out.push({ day: cell.day, period: cell.period, name, rooms, course, score: Math.min(1, score), options: ranked.slice(0, 8), moved });
  }
  // 別の時間で見つけた科目と同じ名前の科目が、この画像の他のマスで時間どおりに見つかっていればそちらにまとめる
  for (const m of out) {
    if (!m.moved || !m.course) continue;
    const same = out.find((x) => !x.moved && x.course && x.course.name === m.course!.name);
    if (same) m.course = same.course;
  }
  return out;
}

/** 取り込む科目 id（同じ科目が 2 コマ続く実験などは 1 つに） */
export function chosenIds(ms: { course: Course | null }[]): string[] {
  return [...new Set(ms.map((m) => m.course?.id).filter((x): x is string => !!x))];
}

/** 画面の年度から学年を推定（入学年度 = データ年度 − 今の学年 + 1） */
export function gradeForYear(shotYear: number | null, dataYear: number | null, grade: number | null): number | null {
  if (!shotYear || !dataYear || !grade) return null;
  const g = shotYear - (dataYear - grade + 1) + 1;
  return g >= 1 && g <= 4 ? g : null;
}
