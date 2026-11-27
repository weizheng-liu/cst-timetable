import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

// ビルドごとに一意な ID。GitHub Pages は HTML を max-age=600 で配信するため、
// 古い index.html がキャッシュに残ると新しい版が最大 10 分見えない。
// 画面側で version.json（キャッシュなしで取得）と比べ、違えば 1 回だけ再読み込みする。
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 7) ?? new Date().toISOString();

const versionFile = (): Plugin => ({
  name: "version-file",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
  },
});

// GitHub Pages serves the site under /cst-timetable/
export default defineConfig({
  base: process.env.BASE_PATH ?? "/cst-timetable/",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [preact(), versionFile()],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
} as any);
