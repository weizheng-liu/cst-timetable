import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AlertTriangle, CalendarPlus, Clock, Download, GraduationCap, MoreHorizontal, Palette, Settings2, Upload, RotateCcw } from "lucide-preact";
import { PeriodEditor, ThemePicker } from "./components/Settings";
import { Grid, GridSkeleton } from "./components/Grid";
import { Sheet } from "./components/Sheet";
import { SlotPicker } from "./components/SlotPicker";
import { CourseDetail } from "./components/CourseDetail";
import { Credits } from "./components/Credits";
import { Setup } from "./components/Setup";
import { familyOf, loadCommon, loadDept, loadIndex, loadRequirements } from "./lib/data";
import { eligibleFor, homeCampusOf, type Eligible } from "./lib/eligibility";
import { normName, reqIndex } from "./lib/credits";
import { buildIcs } from "./lib/ics";
import { DAYS, resolveTimes } from "./lib/periods";
import { buildCells, cellKey, clashesWith, coursesAt, findConflicts, inTerm } from "./lib/schedule";
import { download, exportJson, sanitize, usePersistentState, type Theme } from "./lib/store";
import type { Course, DataIndex, DeptFile, Requirements } from "./lib/types";

type Panel = { kind: "slot"; day: number; period: number } | { kind: "detail"; id: string } | { kind: "credits" } | { kind: "menu" } | { kind: "profile" } | { kind: "times" } | { kind: "theme" };

export function App() {
  const [st, setSt] = usePersistentState();
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [dept, setDept] = useState<DeptFile | null>(null);
  const [req, setReq] = useState<Requirements | null>(null);
  const [common, setCommon] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stack, setStack] = useState<Panel[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2400);
  };

  useEffect(() => {
    loadIndex().then((ix) => {
      setIndex(ix);
      loadCommon(ix).then(setCommon);
    }, (e) => setError(String(e)));
  }, []);

  useTheme(st.theme);
  const times = useMemo(() => resolveTimes(st.periodTimes), [st.periodTimes]);

  const profile = st.profile;
  useEffect(() => {
    if (!index || !profile) return;
    setDept(null);
    loadDept(index.year, profile.dept).then(setDept, (e) => setError(String(e)));
    loadRequirements(profile.entryYear, profile.dept).then(setReq);
  }, [index, profile?.dept, profile?.entryYear]);

  // 学科の科目 + その学生が履修できる共通・教養科目
  const allCourses = useMemo(() => {
    const own = dept?.courses ?? [];
    const ids = new Set(own.map((c) => c.id));
    return [...own, ...common.filter((c) => !ids.has(c.id))];
  }, [dept, common]);
  const homeCampus = useMemo(() => homeCampusOf(dept?.courses ?? [], profile?.grade ?? 1), [dept, profile?.grade]);
  const statusOf = useMemo(() => {
    const m = new Map<string, Eligible>();
    for (const c of allCourses) m.set(c.id, profile ? eligibleFor(c, profile.dept, profile.grade, homeCampus) : "yes");
    return (c: Course) => m.get(c.id) ?? "no";
  }, [allCourses, profile?.dept, profile?.grade, homeCampus]);
  const byId = useMemo(() => new Map(allCourses.map((c) => [c.id, c])), [allCourses]);
  const selected = useMemo(() => st.selected.map((id) => byId.get(id)).filter(Boolean) as Course[], [st.selected, byId]);
  const rIdx = useMemo(() => reqIndex(req), [req]);
  const reqOf = (c: Course) => rIdx.get(normName(c.name));
  const family = (c: Course) => familyOf(c, (x) => reqOf(x)?.group ?? null);

  const view = st.view;
  const cells = useMemo(() => buildCells(selected, view), [selected, view]);
  const offered = useMemo(() => {
    const s = new Set<string>();
    for (const c of allCourses) {
      const st = statusOf(c);
      if (inTerm(c, view) && (st === "yes" || st === "maybe")) for (const x of c.slots) s.add(cellKey(x.day, x.period));
    }
    return s;
  }, [allCourses, view, statusOf]);
  const conflicts = useMemo(() => findConflicts(selected), [selected]);
  const termConflicts = conflicts.filter((c) => c.term === view);
  const termCredits = selected.filter((c) => inTerm(c, view)).reduce((s, c) => s + (c.credits || 0), 0);

  const maxPeriod = Math.max(6, ...(dept?.courses ?? []).flatMap((c) => c.slots.map((s) => s.period)));
  const days = 6;

  const toggle = (c: Course) => {
    const on = st.selected.includes(c.id);
    if (!on) {
      const clash = clashesWith(c, selected);
      if (clash.length) say(`${clash[0].name} と時間が重なっています`);
    }
    setSt((s) => ({ ...s, selected: on ? s.selected.filter((x) => x !== c.id) : [...s.selected, c.id], dataYear: index?.year ?? s.dataYear }));
  };

  const push = (p: Panel) => setStack((s) => [...s, p]);
  const pop = () => setStack((s) => s.slice(0, -1));
  const close = () => setStack([]);
  const top = stack[stack.length - 1];

  // ---------------------------------------------------------------- render

  if (error)
    return (
      <div class="app">
        <div class="banner coral" style={{ marginTop: 40 }}>
          <AlertTriangle size={16} />
          <div>データを読み込めませんでした。時間をおいて再読み込みしてください。（{error}）</div>
        </div>
      </div>
    );

  if (index && !profile)
    return (
      <div class="app">
        <Setup index={index} initial={null} onDone={(p) => setSt((s) => ({ ...s, profile: p }))} />
      </div>
    );

  const deptName = index?.departments.find((d) => d.code === profile?.dept)?.name ?? "";

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          時間割
          <small>
            {deptName ? `${deptName} · ${profile?.grade}年 · ${index?.year}年度` : "読み込み中…"}
          </small>
        </div>
        <button class="icon-btn" aria-label="学科・学年を変更" onClick={() => push({ kind: "profile" })}>
          <Settings2 size={20} />
        </button>
      </header>

      <div class="toolbar">
        <div class="segmented" role="group" aria-label="学期">
          {(["前期", "後期"] as const).map((t) => (
            <button key={t} aria-pressed={view === t} onClick={() => setSt((s) => ({ ...s, view: t }))}>
              {t}
            </button>
          ))}
        </div>
        <div class="summary">
          <b class="num">{termCredits}</b> 単位 · {selected.filter((c) => inTerm(c, view)).length}科目
        </div>
      </div>

      {termConflicts.length > 0 && (
        <div class="banner coral" role="status">
          <AlertTriangle size={16} />
          <div>
            {groupConflicts(termConflicts).join("、")} が重複しています。
          </div>
        </div>
      )}

      {dept ? (
        <Grid days={days} periods={maxPeriod} times={times} onPeriod={() => setStack([{ kind: "times" }])} cells={cells} offered={offered} family={family} onCell={(d, p) => setStack([{ kind: "slot", day: d, period: p }])} />
      ) : (
        <GridSkeleton days={days} periods={6} />
      )}

      {dept && selected.length === 0 && <p class="muted" style={{ textAlign: "center", marginTop: 20 }}>マスをタップすると、その時間に開講される科目が表示されます。</p>}

      <footer class="foot">
        非公式ツールです。実際の履修登録は大学のシステムで行ってください。データ出典：
        <a href="https://www.kyoumu.cst.nihon-u.ac.jp/syllabus/page/" target="_blank" rel="noopener noreferrer">
          日本大学理工学部 シラバス
        </a>
        （{index ? new Date(index.generatedAt).toLocaleDateString("ja-JP") : "—"} 取得）
      </footer>

      <nav class="dock" aria-label="メニュー">
        <button onClick={() => push({ kind: "credits" })}>
          <GraduationCap size={20} />
          <span>単位</span>
        </button>
        <button onClick={() => exportIcs()}>
          <CalendarPlus size={20} />
          <span>カレンダー</span>
        </button>
        <button onClick={() => push({ kind: "menu" })}>
          <MoreHorizontal size={20} />
          <span>その他</span>
        </button>
      </nav>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          try {
            const s = sanitize(JSON.parse(await f.text()));
            setSt(() => s);
            say(`${s.selected.length}科目を読み込みました`);
            close();
          } catch {
            say("JSONファイルを読み込めませんでした");
          }
          (e.target as HTMLInputElement).value = "";
        }}
      />

      <Sheet open={!!top} onClose={close} onBack={stack.length > 1 ? pop : undefined} {...sheetProps()}>
        {renderPanel()}
      </Sheet>

      <div class={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );

  function exportIcs() {
    if (!selected.length) {
      say("先に科目を追加してください");
      return;
    }
    const r = buildIcs(selected, new Date(), times);
    download(`cst-timetable-${index?.year ?? ""}.ics`, r.text, "text/calendar;charset=utf-8");
    say(`${r.events}件の授業を書き出しました${r.skippedCancelled ? `（休講${r.skippedCancelled}件を除外）` : ""}`);
  }

  function sheetProps(): { title: any; sub?: any } {
    if (!top) return { title: "" };
    switch (top.kind) {
      case "slot": {
        const n = coursesAt(allCourses, top.day, top.period, view).filter((c) => ["yes", "maybe"].includes(statusOf(c))).length;
        return { title: `${DAYS[top.day - 1]}曜 ${top.period}限`, sub: `${view} · 開講 ${n} 科目` };
      }
      case "detail": {
        const c = byId.get(top.id);
        return { title: c?.name, sub: c?.subtitle || (c ? `${c.term} · ${c.credits}単位` : undefined) };
      }
      case "credits":
        return { title: "単位と卒業要件", sub: `${deptName} · ${profile?.entryYear}年度入学` };
      case "menu":
        return { title: "その他" };
      case "profile":
        return { title: "学科・学年" };
      case "times":
        return { title: "授業時間", sub: "時限ごとの開始・終了" };
      case "theme":
        return { title: "テーマ" };
    }
  }

  function renderPanel() {
    if (!top) return null;
    switch (top.kind) {
      case "slot":
        return (
          <SlotPicker
            offered={coursesAt(allCourses, top.day, top.period, view).filter((c) => statusOf(c) !== "no" || st.selected.includes(c.id))}
            statusOf={statusOf}
            selected={selected}
            grade={profile?.grade ?? 1}
            reqOf={reqOf}
            onToggle={toggle}
            onOpen={(c) => push({ kind: "detail", id: c.id })}
          />
        );
      case "detail": {
        const c = byId.get(top.id);
        if (!c) return null;
        return <CourseDetail c={c} status={statusOf(c)} on={st.selected.includes(c.id)} req={reqOf(c)} clash={clashesWith(c, selected)} onToggle={toggle} />;
      }
      case "credits":
        return (
          <Credits
            req={req}
            selected={selected}
            earned={st.earned}
            onEarned={(id, v) => setSt((s) => ({ ...s, earned: { ...s.earned, [id]: v } }))}
            deptName={deptName}
            entryYear={profile?.entryYear ?? 0}
          />
        );
      case "profile":
        return index ? (
          <Setup
            inline
            index={index}
            initial={profile}
            onDone={(p) => {
              setSt((s) => ({ ...s, profile: p, selected: p.dept === s.profile?.dept ? s.selected : [] }));
              close();
            }}
          />
        ) : null;
      case "times":
        return <PeriodEditor periods={maxPeriod} times={times} custom={st.periodTimes} onChange={(pt) => setSt((s) => ({ ...s, periodTimes: pt }))} />;
      case "theme":
        return <ThemePicker value={st.theme} onChange={(t) => setSt((s) => ({ ...s, theme: t }))} />;
      case "menu":
        return (
          <div class="list" style={{ marginTop: 0 }}>
            <MenuItem icon={<Palette size={18} />} title="テーマ" sub={THEME_LABEL[st.theme]} onClick={() => push({ kind: "theme" })} />
            <MenuItem
              icon={<Clock size={18} />}
              title="授業時間を編集"
              sub={Object.keys(st.periodTimes).length ? `${Object.keys(st.periodTimes).length}つの時限を変更中` : "標準：1限 9:00–10:40 …"}
              onClick={() => push({ kind: "times" })}
            />
            <MenuItem icon={<CalendarPlus size={18} />} title="カレンダーに書き出す (.ics)" sub="各回の授業を予定として出力。休講日は除外し、オンライン回は件名に表示" onClick={exportIcs} />
            <MenuItem
              icon={<Download size={18} />}
              title="選択内容を保存 (JSON)"
              sub="別の端末へ移すときに使います"
              onClick={() => download(`cst-timetable-${new Date().toISOString().slice(0, 10)}.json`, exportJson(st), "application/json")}
            />
            <MenuItem icon={<Upload size={18} />} title="JSON を読み込む" sub="保存したファイルから復元します" onClick={() => fileRef.current?.click()} />
            <MenuItem
              icon={<RotateCcw size={18} />}
              title="時間割をリセット"
              sub={`選択中の ${selected.length} 科目をすべて外します`}
              onClick={() => {
                if (!selected.length) return;
                setSt((s) => ({ ...s, selected: [] }));
                close();
                say("リセットしました");
              }}
            />
            <p class="small faint" style={{ marginTop: 16 }}>
              データはこの端末のブラウザ（localStorage）にのみ保存され、外部へ送信されません。非公式ツールです。実際の履修登録は大学のシステムで行ってください。
            </p>
          </div>
        );
    }
  }
}

const THEME_LABEL: Record<Theme, string> = { system: "自動（端末の設定）", light: "ライト", dark: "ダーク", sepia: "セピア（目にやさしい）" };
const THEME_COLOR: Record<string, string> = { light: "#f7f7f8", dark: "#0e0e10", sepia: "#f3ecdc" };

/** Resolve the theme (following the OS for "system") and put it on <html data-theme>. */
function useTheme(theme: Theme) {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const t = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = t;
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[t]));
    };
    apply();
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

function MenuItem({ icon, title, sub, onClick }: { icon: any; title: string; sub: string; onClick: () => void }) {
  return (
    <div class="row">
      <button class="row-main" style={{ display: "flex", gap: 12, alignItems: "center" }} onClick={onClick}>
        <span class="muted">{icon}</span>
        <span>
          <div class="row-title">{title}</div>
          <div class="row-sub">{sub}</div>
        </span>
      </button>
    </div>
  );
}

/** "水1限(A/B)、水2限(A/B)" -> "水1・2限（A / B）" */
function groupConflicts(cs: { day: number; period: number; courses: Course[] }[]): string[] {
  const m = new Map<string, { day: number; periods: number[]; names: string[] }>();
  for (const c of cs) {
    const k = `${c.day}|${c.courses.map((x) => x.id).sort().join(",")}`;
    const g = m.get(k) ?? { day: c.day, periods: [], names: c.courses.map((x) => x.name) };
    g.periods.push(c.period);
    m.set(k, g);
  }
  return [...m.values()].map((g) => `${DAYS[g.day - 1]}${g.periods.sort((a, b) => a - b).join("・")}限（${g.names.join(" / ")}）`);
}
