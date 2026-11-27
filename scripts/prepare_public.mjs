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
