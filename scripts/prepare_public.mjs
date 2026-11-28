// Copies data/requirements/*.json into public/data/requirements and writes an index,
// so the web app can list which (入学年度 × 学科) requirement files exist.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const src = "data/requirements";
const dst = "public/data/requirements";
mkdirSync(dst, { recursive: true });
const index = [];
if (existsSync(src)) {
  for (const f of readdirSync(src).filter((f) => f.endsWith(".json"))) {
    const j = JSON.parse(readFileSync(join(src, f), "utf8"));
    writeFileSync(join(dst, f), JSON.stringify(j));
    index.push({ entryYear: j.entryYear, dept: j.department.code, file: f, verified: j.verified });
  }
}
writeFileSync(join(dst, "index.json"), JSON.stringify(index, null, 1));
console.log(`requirements: ${index.length} file(s)`);

// 画面写真の取り込み（OCR）用のファイルを自サイトから配る（外部の CDN に画像も通信も出さない）
import { copyFileSync } from "node:fs";
const ocr = "public/ocr";
mkdirSync(ocr, { recursive: true });
const copies = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz", "jpn.traineddata.gz"],
];
for (const [from, to] of copies) if (existsSync(from)) copyFileSync(from, join(ocr, to));
console.log(`ocr: ${copies.filter(([f]) => existsSync(f)).length} file(s)`);
