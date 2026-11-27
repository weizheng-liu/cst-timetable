import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// GitHub Pages serves the site under /cst-timetable/
export default defineConfig({
  base: process.env.BASE_PATH ?? "/cst-timetable/",
  plugins: [preact()],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
} as any);
