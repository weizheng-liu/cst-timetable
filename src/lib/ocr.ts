// 画面写真の読み取り（ブラウザ内の Tesseract）。画像も文字も端末の外へは出さない。
// OCR のプログラムと日本語データはこのサイト自身（public/ocr）から読み込む。
import { dayOf, detectGrid, headerInfo, inkRatio, periodOf, sequence, type CellRead, type GridGuess } from "./screenshot";

export interface ShotRead {
  width: number;
  height: number;
  grid: GridGuess;
  days: number[]; // 列 → 曜日
  periods: number[]; // 行 → 時限
  /** 各マス（列 ci・行 ri）に文字があったか */
  filled: { ci: number; ri: number }[];
  cells: CellRead[];
  year: number | null;
  term: "前期" | "後期" | null;
}

export type Progress = (done: number, total: number) => void;

const MAX_W = 1400;

async function loadBitmap(file: Blob): Promise<HTMLCanvasElement> {
  let w: number;
  let h: number;
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  if ("createImageBitmap" in window) {
    const bmp = await createImageBitmap(file);
    [w, h] = [bmp.width, bmp.height];
    draw = (ctx, W, H) => ctx.drawImage(bmp, 0, 0, W, H);
  } else {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    [w, h] = [img.naturalWidth, img.naturalHeight];
    draw = (ctx, W, H) => ctx.drawImage(img, 0, 0, W, H);
  }
  // 小さすぎる画像は文字が潰れるので拡大、大きすぎる画像は縮小
  const k = w > MAX_W ? MAX_W / w : w < 900 ? Math.min(2, 900 / w) : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  draw(ctx, c.width, c.height);
  return c;
}

function crop(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  x = Math.max(0, Math.round(x));
  y = Math.max(0, Math.round(y));
  w = Math.max(1, Math.min(src.width - x, Math.round(w)));
  h = Math.max(1, Math.min(src.height - y, Math.round(h)));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

export async function readScreenshot(file: Blob, starts: Record<number, string>, onProgress: Progress): Promise<ShotRead | null> {
  const canvas = await loadBitmap(file);
  const px = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  const grid = detectGrid(px);
  if (!grid) return null;
  const { cols, rows } = grid;

  const filled: { ci: number; ri: number }[] = [];
  rows.forEach((r, ri) =>
    cols.forEach((c, ci) => {
      const ix = (c.end - c.start) * 0.05;
      const iy = (r.end - r.start) * 0.03;
      if (inkRatio(px, c.start + ix, r.start + iy, c.end - ix, r.end - iy) >= 0.01) filled.push({ ci, ri });
    }),
  );
  const hasLabels = cols[0].start > 24;
  const total = 1 + cols.length + (hasLabels ? rows.length : 0) + filled.length;
  let done = 0;
  onProgress(done, total);

  const base = new URL(import.meta.env.BASE_URL + "ocr/", location.href).href;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("jpn", 1, { workerPath: base + "worker.min.js", corePath: base, langPath: base, gzip: true, workerBlobURL: false });
  const read = async (c: HTMLCanvasElement, psm: "6" | "11") => {
    await worker.setParameters({ tessedit_pageseg_mode: psm as never });
    const { data } = await worker.recognize(c);
    onProgress(++done, total);
    return data.text;
  };
  try {
    const top = rows[0].start;
    const rh = rows[0].end - rows[0].start;
    // 画面上部（「2025年 1学期」など）
    const head = top > 8 ? await read(crop(canvas, 0, 0, canvas.width, top), "11") : (onProgress(++done, total), "");
    const { year, term } = headerInfo(head);
    // 曜日の見出し（各列の真上）
    const hTop = Math.max(0, top - Math.min(rh * 0.45, top));
    const dayFound: (number | null)[] = [];
    for (const c of cols) dayFound.push(top - hTop > 8 ? dayOf(await read(crop(canvas, c.start, hTop, c.end - c.start, top - hTop), "6")) : (onProgress(++done, total), null));
    // 時限の欄（左端）
    const perFound: (number | null)[] = [];
    if (hasLabels) for (const r of rows) perFound.push(periodOf(await read(crop(canvas, 0, r.start, cols[0].start, r.end - r.start), "6"), starts));
    else rows.forEach(() => perFound.push(null));
    const days = sequence(dayFound, 1);
    const periods = sequence(perFound, 1);
    // 各マス
    const cells: CellRead[] = [];
    for (const { ci, ri } of filled) {
      const c = cols[ci];
      const r = rows[ri];
      const ix = (c.end - c.start) * 0.05;
      const iy = (r.end - r.start) * 0.03;
      const text = await read(crop(canvas, c.start + ix, r.start + iy, c.end - c.start - 2 * ix, r.end - r.start - 2 * iy), "6");
      if (days[ci] >= 1 && days[ci] <= 6 && periods[ri] >= 1 && periods[ri] <= 7) cells.push({ day: days[ci], period: periods[ri], text });
    }
    return { width: canvas.width, height: canvas.height, grid, days, periods, filled, cells, year, term };
  } finally {
    await worker.terminate();
  }
}
