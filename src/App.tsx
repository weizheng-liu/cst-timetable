import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AlertTriangle, CalendarPlus, ChevronDown, Clock, Download, MoreHorizontal, Palette, Upload, RotateCcw } from "lucide-preact";
import { ConflictResolve } from "./components/ConflictResolve";
import { PeriodEditor, ThemePicker } from "./components/Settings";
import { Grid, GridSkeleton, ScopeTrace } from "./components/Grid";
import { Sheet } from "./components/Sheet";
import { SlotPicker } from "./components/SlotPicker";
import { CourseDetail } from "./components/CourseDetail";
import { Credits } from "./components/Credits";
import { Setup } from "./components/Setup";
import { categoryOf, loadCommon, loadDept, loadIndex, loadRequirements } from "./lib/data";
import { eligibleFor, homeCampusOf, type Eligible } from "./lib/eligibility";
import { normName, progress, reqIndex } from "./lib/credits";
import { alternativesFor, resolveOptions, slotText, type ResolveOption } from "./lib/resolve";
import { buildIcs } from "./lib/ics";
import { DAYS, resolveTimes } from "./lib/periods";
import { buildCells, cellKey, clashesWith, coursesAt, findConflicts, inTerm } from "./lib/schedule";
import { download, exportJson, loadPhoto, sanitize, savePhoto, shrinkImage, usePersistentState, type Theme } from "./lib/store";
import type { Course, DataIndex, DeptFile, Requirements } from "./lib/types";

type Panel = { kind: "slot"; day: number; period: number } | { kind: "detail"; id: string } | { kind: "credits" } | { kind: "menu" } | { kind: "profile" } | { kind: "times" } | { kind: "theme" } | { kind: "resolve"; day: number; period: number };

export function App() {
  const [st, setSt] = usePersistentState();
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [dept, setDept] = useState<DeptFile | null>(null);
  const [req, setReq] = useState<Requirements | null>(null);
  const [common, setCommon] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stack, setStack] = useState<Panel[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const say = (msg: string, extra: Omit<Toast, "msg"> = {}) => {
    const t: Toast = { msg, ...extra };
    setToast(t);
    setTimeout(() => setToast((x) => (x === t ? null : x)), extra.undo ? 5000 : 2400);
  };

  useEffect(() => {
    loadIndex().then((ix) => {
      setIndex(ix);
      loadCommon(ix).then(setCommon);
    }, (e) => setError(String(e)));
  }, []);

  const [photo, setPhoto] = useState<string | null>(loadPhoto);
  useTheme(st.theme, photo, st.photoDim);
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
  const category = (c: Course) => categoryOf(c, reqOf(c));
  const isRequired = (c: Course) => !!reqOf(c)?.required;
  // 「移す」先として勧めるのは履修条件を満たすと判定できたクラスだけ（要確認は勧めない）
  const canTake = (c: Course) => statusOf(c) === "yes";

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
  const plannedYear = selected.reduce((s, c) => s + (c.credits || 0), 0);
  const pr = req ? progress(req, selected, st.earned) : null;

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
          <span class="brand-mark" aria-hidden="true" />
          <span class="brand-ja">日大理工 履修アシスタント</span>
          <span class="eyebrow" aria-hidden="true">CST · NIHON UNIV.</span>
        </div>
        <div class="titlerow">
          <h1 class="title">時間割</h1>
          <span class="term num">
            {index?.year ?? "—"} · {view}
          </span>
        </div>
        <div class="selects">
          <button class="sel" onClick={() => push({ kind: "profile" })} aria-label={`学科：${deptName}（変更）`}>
            <small>学科</small>
            <span class="sel-v">{deptName || "—"}</span>
            <ChevronDown size={11} class="chev" />
          </button>
          <button class="sel" onClick={() => push({ kind: "profile" })} aria-label={`学年：${profile?.grade}年（変更）`}>
            <small>学年</small>
            {profile?.grade ?? "-"}年
            <ChevronDown size={11} class="chev" />
          </button>
          <label class="sel">
            <small>学期</small>
            <span class="sel-v">{view}</span>
            <select class="sel-native" value={view} aria-label="学期" onChange={(e) => setSt((s) => ({ ...s, view: (e.target as HTMLSelectElement).value as "前期" | "後期" }))}>
              <option value="前期">前期</option>
              <option value="後期">後期</option>
            </select>
            <ChevronDown size={11} class="chev" />
          </label>
          <span class="sel-gap" />
          <button class="icon-btn sm" aria-label="その他" onClick={() => push({ kind: "menu" })}>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      <div class="deco-scope" aria-hidden="true">
        <div class="readout num">
          <span>CH1 {termCredits}単位</span>
          <span>CH2 {selected.filter((c) => inTerm(c, view)).length}科目</span>
          <span>{times[1]?.[0]}–{times[maxPeriod]?.[1] ?? times[6][1]}</span>
          <span class={termConflicts.length ? "warn" : ""}>{termConflicts.length ? `TRIG ×${groupConflicts(termConflicts).length}` : "TRIG OK"}</span>
        </div>
      </div>

      {dept && <ScopeTrace days={days} cells={cells} />}
      {dept ? (
        <Grid
          days={days}
          periods={maxPeriod}
          times={times}
          onPeriod={() => setStack([{ kind: "times" }])}
          cells={cells}
          offered={offered}
          category={category}
          target={top?.kind === "slot" && !(cells.get(cellKey(top.day, top.period)) ?? []).length ? top : null}
          moved={toast?.moved ?? null}
          onCell={(d, p) => setStack([(cells.get(cellKey(d, p)) ?? []).length > 1 ? { kind: "resolve", day: d, period: p } : { kind: "slot", day: d, period: p }])}
        />
      ) : (
        <GridSkeleton days={days} periods={6} />
      )}

      {groupConflicts(termConflicts).map((g) => (
        <div key={g.key} class="note" role="status">
          <span class="note-dot" aria-hidden="true" />
          <span>
            {DAYS[g.day - 1]}曜 {g.periods.join("・")}限：
            {g.courses.map((c, i) => (
              <>
                {i > 0 && "と"}
                <b>{c.name}</b>
              </>
            ))}
            が重複
          </span>
          <button class="note-act" onClick={() => setStack([{ kind: "resolve", day: g.day, period: g.periods[0] }])}>
            解決する
          </button>
        </div>
      ))}

      {dept && selected.length === 0 && <p class="muted" style={{ textAlign: "center", marginTop: 20 }}>マスをタップすると、その時間に開講される科目が表示されます。</p>}

      <footer class="foot">
        非公式ツールです。実際の履修登録は大学のシステムで行ってください。データ出典：
        <a href="https://www.kyoumu.cst.nihon-u.ac.jp/syllabus/page/" target="_blank" rel="noopener noreferrer">
          日本大学理工学部 シラバス
        </a>
        （{index ? new Date(index.generatedAt).toLocaleDateString("ja-JP") : "—"} 取得）
      </footer>

      {/* アートテーマ用の装飾（設計図の表題欄 / オシロの測定値表示）。シンプルなテーマでは非表示 */}
      <div class="deco-title" aria-hidden="true">
        <div class="tb-cell tb-wide">
          <span>TITLE</span>
          <b>{deptName || "—"} 時間割</b>
        </div>
        <div class="tb-cell">
          <span>DWG NO.</span>
          <b class="num">CST-{index?.year ?? ""}-{profile?.dept ?? ""}{view === "前期" ? "A" : "B"}</b>
        </div>
        <div class="tb-cell">
          <span>GRADE</span>
          <b class="num">{profile?.grade ?? "-"}</b>
        </div>
        <div class="tb-cell">
          <span>LOAD</span>
          <b class="num">{termCredits} cr</b>
        </div>
        <div class="tb-cell">
          <span>SCALE</span>
          <b class="num">1 : 1</b>
        </div>
      </div>
      <CreditBar planned={plannedYear} earned={pr?.earnedTotal ?? 0} total={req?.totalCredits ?? null} onOpen={() => push({ kind: "credits" })} />

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

      <div class={`toast ${toast ? "show" : ""} ${toast?.undo ? "has-act" : ""}`} role="status" aria-live="polite">
        {toast?.undo && <span class="toast-mark" aria-hidden="true" />}
        <span>{toast?.msg}</span>
        {toast?.undo && (
          <button
            class="toast-act"
            onClick={() => {
              toast.undo!();
              setToast(null);
            }}
          >
            元に戻す
          </button>
        )}
      </div>
    </div>
  );

  function applyResolve(o: ResolveOption) {
    const before = st.selected;
    const undo = () => setSt((s) => ({ ...s, selected: before }));
    if (o.kind === "move") {
      setSt((s) => ({ ...s, selected: s.selected.map((id) => (id === o.from.id ? o.to.id : id)) }));
      say(`${o.from.name}を${slotText(o.to.slots)}に移しました`, { undo, moved: o.to.id });
    } else {
      setSt((s) => ({ ...s, selected: s.selected.filter((id) => id !== o.drop.id) }));
      say(`${o.drop.name}を外しました`, { undo });
    }
    close();
  }

  function exportIcs() {
    if (!selected.length) {
      say("先に科目を追加してください");
      return;
    }
    const r = buildIcs(selected, new Date(), times);
    download(`cst-timetable-${index?.year ?? ""}.ics`, r.text, "text/calendar;charset=utf-8");
    say(`${r.events}件の授業を書き出しました${r.skippedCancelled ? `（休講${r.skippedCancelled}件を除外）` : ""}`);
  }

  function sheetProps(): { title: any; sub?: any; eyebrow?: string } {
    if (!top) return { title: "" };
    switch (top.kind) {
      case "slot": {
        const n = coursesAt(allCourses, top.day, top.period, view).filter((c) => ["yes", "maybe"].includes(statusOf(c))).length;
        return { eyebrow: `SLOT ${EN_DAY[top.day - 1]}-${top.period} · ${times[top.period]?.[0]}–${times[top.period]?.[1]}`, title: `${DAYS[top.day - 1]}曜 ${top.period}限`, sub: `この時限の開講科目 ${n}件 · ${view}` };
      }
      case "resolve":
        return { eyebrow: `CONFLICT ${EN_DAY[top.day - 1]}-${top.period} · ${times[top.period]?.[0]}–${times[top.period]?.[1]}`, title: `${DAYS[top.day - 1]}曜 ${top.period}限が重複しています` };
      case "detail": {
        const c = byId.get(top.id);
        return { eyebrow: c?.code ? `COURSE ${c.code}` : undefined, title: c?.name, sub: c?.subtitle || (c ? `${c.term} · ${c.credits}単位` : undefined) };
      }
      case "credits":
        return { eyebrow: "CREDITS", title: "単位と卒業要件", sub: `${deptName} · ${profile?.entryYear}年度入学` };
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
            category={category}
            onToggle={(c) => {
              const adding = !st.selected.includes(c.id);
              toggle(c);
              if (adding) close();
            }}
            onOpen={(c) => push({ kind: "detail", id: c.id })}
          />
        );
      case "resolve": {
        const cs = cells.get(cellKey(top.day, top.period)) ?? [];
        if (cs.length < 2) return <p class="muted">重複は解消されています。</p>;
        const [a, b] = cs;
        const altOf = (x: Course) => alternativesFor(x, allCourses, selected, view, canTake)[0] ?? null;
        return (
          <ConflictResolve
            key={`${a.id}|${b.id}`}
            a={a}
            b={b}
            options={resolveOptions(a, b, allCourses, selected, view, canTake, isRequired)}
            planned={plannedYear}
            category={category}
            isRequired={isRequired}
            altOf={altOf}
            onApply={applyResolve}
          />
        );
      }
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
        return (
          <ThemePicker
            value={st.theme}
            onChange={(t) => setSt((s) => ({ ...s, theme: t }))}
            hasPhoto={!!photo}
            onPhoto={async (f) => {
              if (!f) {
                savePhoto(null);
                setPhoto(null);
                return;
              }
              try {
                const url = await shrinkImage(f);
                if (!savePhoto(url)) say("写真が大きすぎて保存できませんでした（この表示中のみ反映）");
                setPhoto(url);
              } catch {
                say("この画像は読み込めませんでした");
              }
            }}
            dim={st.photoDim}
            onDim={(v) => setSt((s) => ({ ...s, photoDim: v }))}
          />
        );
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

const THEME_LABEL: Record<Theme, string> = {
  system: "自動（端末の設定）",
  light: "方眼紙（ライト）",
  dark: "墨（ダーク）",
  sepia: "セピア（目にやさしい）",
  blueprint: "設計図",
  scope: "オシロスコープ",
  photo: "写真",
};
const THEME_COLOR: Record<string, string> = { light: "#f8f6f1", dark: "#151412", sepia: "#f3ecdc", blueprint: "#0d2b4e", scope: "#050d09", photo: "#0b0d12" };

/** Resolve the theme (following the OS for "system") and put it on <html data-theme>. */
function useTheme(theme: Theme, photo: string | null, dim: number) {
  useEffect(() => {
    const st = document.documentElement.style;
    if (theme === "photo" && photo) st.setProperty("--photo", `url("${photo}")`);
    else st.removeProperty("--photo");
    st.setProperty("--photo-dim", String(dim));
  }, [theme, photo, dim]);
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

/** 同じ組み合わせで連続する重複を 1 件にまとめる（水 1・2 限 A と B → 1 件） */
function groupConflicts(cs: { day: number; period: number; courses: Course[] }[]) {
  const m = new Map<string, { key: string; day: number; periods: number[]; courses: Course[] }>();
  for (const c of cs) {
    const k = `${c.day}|${c.courses.map((x) => x.id).sort().join(",")}`;
    const g = m.get(k) ?? { key: k, day: c.day, periods: [], courses: c.courses };
    g.periods.push(c.period);
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, periods: g.periods.sort((a, b) => a - b) }));
}

type Toast = { msg: string; undo?: () => void; moved?: string };
const EN_DAY = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** 下部の学分栏：1 目盛 = 10 単位の物差し。修得済は墨、今年度の予定は緋 */
function CreditBar({ planned, earned, total, onOpen }: { planned: number; earned: number; total: number | null; onOpen: () => void }) {
  const T = total ?? 0;
  const left = T ? Math.max(0, T - earned - planned) : 0;
  const pct = (v: number) => (T ? Math.min(100, (v / T) * 100) : 0);
  const e = pct(earned);
  const p = Math.min(100 - e, pct(planned));
  return (
    <footer class="creditbar">
      <button class="creditbar-in" onClick={onOpen} aria-label="単位と卒業要件を開く">
        <span class="cb-line">
          <span>
            取得予定 <b class="num is-plan">{planned}</b>
            {T ? (
              <>
                {" "}/ 卒業まで残り <b class="num">{left}</b> 単位
              </>
            ) : (
              " 単位"
            )}
          </span>
          <span class="cb-more">詳細</span>
        </span>
        {T > 0 && (
          <>
            <span class="ruler" style={{ "--tick": `${(10 / T) * 100}%` }} role="img" aria-label={`修得済${earned}単位、今年度予定${planned}単位、残り${left}単位`}>
              <i class="ruler-done" style={{ width: `${e}%` }} />
              <i class="ruler-plan" style={{ width: `${p}%` }} />
            </span>
            <span class="scale num" aria-hidden="true">
              {/* 修得済の段が短いと注記どうしが重なるので、そのときは左端に 1 つにまとめる */}
              {e >= 22 ? (
                <>
                  <span style={{ left: 0 }}>0</span>
                  <span style={{ right: `${100 - e}%`, paddingRight: 4 }}>修得済 {earned}</span>
                  <span class="is-plan" style={{ left: `${e}%`, paddingLeft: 4 }}>今年度 {planned}</span>
                </>
              ) : (
                <span style={{ left: 0 }}>
                  {earned > 0 && `修得済 ${earned} · `}
                  <span class="is-plan" style={{ position: "static" }}>今年度 {planned}</span>
                </span>
              )}
              <span style={{ right: 0 }}>卒業 {T}</span>
            </span>
          </>
        )}
      </button>
    </footer>
  );
}
