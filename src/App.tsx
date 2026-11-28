import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AlertTriangle, Award, ClipboardList, ImagePlus, LayoutList, Smartphone, CalendarPlus, ChevronDown, Clock, Download, MoreHorizontal, Palette, Search, Upload, RotateCcw } from "lucide-preact";
import { ConflictResolve } from "./components/ConflictResolve";
import { GradesPanel } from "./components/Grades";
import { SearchPanel } from "./components/SearchPanel";
import { ImportPanel } from "./components/ImportPanel";
import { CatalogPanel } from "./components/CatalogPanel";
import { InstallPanel } from "./components/InstallPanel";
import { CustomDetail } from "./components/CustomDetail";
import { ShotImportPanel } from "./components/ShotImportPanel";
import { useInstall } from "./lib/pwa";
import { customToCourse, isCustomId, newCustomId, type CustomCourse } from "./lib/custom";
import { entriesFromHash, type Entry } from "./lib/importer";
import { ALERT_LABEL, md as mdShort, setNote, todayIso, tokyoToday, toggleMark, upcoming, type Alert } from "./lib/alerts";
import { gradeKey, groupTag, mergeEarned, summarize } from "./lib/grades";
import { planRequired } from "./lib/autoplan";
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
import { buildCells, cellKey, clashesWith, coursesAt, findConflicts, inTerm, isUnscheduled } from "./lib/schedule";
import { allPlans, download, exportJson, loadPhoto, sanitize, switchPlan, viewGradeOf, savePhoto, shrinkImage, usePersistentState, type Theme } from "./lib/store";
import type { Course, DataIndex, DeptFile, Requirements } from "./lib/types";

type Panel = { kind: "slot"; day: number; period: number } | { kind: "detail"; id: string; focus?: { day: number; period: number } } | { kind: "credits" } | { kind: "menu" } | { kind: "profile" } | { kind: "times" } | { kind: "theme" } | { kind: "resolve"; day: number; period: number } | { kind: "grades" } | { kind: "search"; q: string } | { kind: "import"; codes: Entry[] | null } | { kind: "catalog" } | { kind: "install" } | { kind: "shot" };

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
  const install = useInstall();

  const say = (msg: string, extra: Omit<Toast, "msg"> = {}) => {
    const t: Toast = { msg, ...extra };
    setToast(t);
    setTimeout(() => setToast((x) => (x === t ? null : x)), extra.undo ? 5000 : 2400);
  };

  // ブックマークレットから #import=J31D,... で開かれたとき。読んだらすぐ URL から消す
  const [pendingImport, setPendingImport] = useState<Entry[] | null>(() => entriesFromHash(location.hash));
  useEffect(() => {
    if (pendingImport) history.replaceState(null, "", location.pathname + location.search);
  }, []);

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
    return [...own, ...common.filter((c) => !ids.has(c.id)), ...st.custom.map(customToCourse)];
  }, [dept, common, st.custom]);
  // 4 年計画：表示中の学年（在籍学年とは別に 1〜4 年を切り替えられる）
  const viewGrade = viewGradeOf(st);
  const nowGrade = profile?.grade ?? 1;
  const maxGrade = Math.max(4, nowGrade);
  const homeCampus = useMemo(() => homeCampusOf(dept?.courses ?? [], viewGrade), [dept, viewGrade]);
  const statusOf = useMemo(() => {
    const m = new Map<string, Eligible>();
    for (const c of allCourses) m.set(c.id, profile && !isCustomId(c.id) ? eligibleFor(c, profile.dept, viewGrade, homeCampus) : "yes");
    return (c: Course) => m.get(c.id) ?? "no";
  }, [allCourses, profile?.dept, viewGrade, homeCampus]);
  const byId = useMemo(() => new Map(allCourses.map((c) => [c.id, c])), [allCourses]);
  // 今学期の科目一覧：取れる科目＋別キャンパスで開講される同じ条件の科目
  const catalogCourses = useMemo(
    () =>
      profile
        ? allCourses.filter((c) => {
            if (!inTerm(c, st.view)) return false;
            const s = statusOf(c);
            if (s === "yes" || s === "maybe") return true;
            if (s !== "no" || !c.campus || c.campus === homeCampus) return false;
            const e = eligibleFor(c, profile.dept, viewGrade, null);
            return e === "yes" || e === "maybe";
          })
        : [],
    [allCourses, st.view, statusOf, profile?.dept, viewGrade, homeCampus],
  );
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
  // 成績（端末内のみ）。合格済みの科目は「取得予定」から外し、区分別の修得単位に足す
  const gs = useMemo(() => summarize(st.grades, req), [st.grades, req]);
  const retake = useMemo(() => new Set(gs.failedRequired.map((r) => gradeKey(r.name))), [gs]);
  const isRetake = (c: Course) => retake.has(gradeKey(c.name));
  // 単位・卒業要件は全学年の計画を合算する（同じ科目名は 1 回だけ数える）
  const plans = useMemo(() => allPlans(st), [st.plans, st.selected, st.planGrade, profile?.grade]);
  const plannedAll = useMemo(() => {
    const seen = new Set<string>();
    const out: Course[] = [];
    for (const ids of Object.values(plans))
      for (const id of ids) {
        const c = byId.get(id);
        if (c && !seen.has(gradeKey(c.name))) seen.add(gradeKey(c.name)), out.push(c);
      }
    return out;
  }, [plans, byId]);
  const creditsOfYear = (g: number) => (plans[g] ?? []).reduce((n, id) => n + (byId.get(id)?.credits ?? 0), 0);
  const countSelected = plannedAll.filter((c) => !gs.passed.has(gradeKey(c.name)));
  const earnedAll = useMemo(() => mergeEarned(st.earned, gs.earnedByGroup), [st.earned, gs]);
  const plannedYear = countSelected.reduce((s, c) => s + (c.credits || 0), 0);
  const pr = req ? progress(req, countSelected, earnedAll, gs.passed) : null;
  const earnedTotal = (pr?.earnedTotal ?? 0) + gs.earnedUnmatched;
  const groupOf = (c: Course) => {
    const rc = reqOf(c);
    return rc ? groupTag(rc, req) : null;
  };
  // 必修の一括追加（卒業要件データがある学科だけ。現在は電子工学科・精密機械工学科の 2025 年度入学）
  const reqPlan = useMemo(
    () =>
      req && profile
        ? planRequired(req, allCourses, selected, viewGrade, profile.dept, (c) => statusOf(c) === "yes" || (statusOf(c) === "otherGrade" && retake.has(gradeKey(c.name))), gs.passed, retake)
        : null,
    [req, viewGrade, allCourses, selected, statusOf, gs, retake],
  );
  // 試験・次回オンラインの目印（在籍学年の時間割だけ。先の学年は日付が合わない）
  const today = tokyoToday();
  const showAlerts = viewGrade === nowGrade;
  const alertsOf = (c: Course, d: number): Alert[] => (showAlerts ? upcoming(c, today, st.marks, c.slots.some((s) => s.day !== d) ? d : undefined) : []);
  const agenda = useMemo(() => {
    if (!showAlerts) return [];
    const soon = todayIso(new Date(Date.now() + 7 * 864e5));
    return selected
      .flatMap((c) => upcoming(c, today, st.marks))
      .filter((a) => a.kind === "exam" || a.kind === "quiz" || a.kind === "task" || a.kind === "note" || a.date <= soon)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [selected, st.marks, today, showAlerts]);
  const failedOpen = gs.failedRequired.filter((r) => !selected.some((c) => gradeKey(c.name) === gradeKey(r.name)));

  const maxPeriod = Math.max(6, ...(dept?.courses ?? []).flatMap((c) => c.slots.map((s) => s.period)));
  // 土曜は授業を入れていなければ畳んで、平日の列を広くする（ボタンで出せる）
  const satUsed = selected.some((c) => inTerm(c, view) && !isUnscheduled(c) && c.slots.some((x) => x.day === 6));
  const floating = selected.filter((c) => inTerm(c, view) && isUnscheduled(c));
  const days = satUsed || st.showSat ? 6 : 5;

  const toggle = (c: Course) => {
    const on = st.selected.includes(c.id);
    if (!on) {
      const clash = clashesWith(c, selected);
      if (clash.length) say(`${clash[0].name} と時間が重なっています`);
    }
    setSt((s) => ({ ...s, selected: on ? s.selected.filter((x) => x !== c.id) : [...s.selected, c.id], dataYear: index?.year ?? s.dataYear }));
  };

  const dataReady = !!profile && !!dept && common.length > 0;
  useEffect(() => {
    if (pendingImport && dataReady) {
      setStack([{ kind: "import", codes: pendingImport }]);
      setPendingImport(null);
    }
  }, [pendingImport, dataReady]);

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
          <button class="sel" onClick={() => push({ kind: "profile" })} aria-label={`在籍学年：${profile?.grade}年（変更）`}>
            <small>在籍</small>
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

      <div class="years" role="tablist" aria-label="学年ごとの時間割">
        {Array.from({ length: maxGrade }, (_, i) => i + 1).map((g) => (
          <button
            key={g}
            role="tab"
            aria-selected={g === viewGrade}
            class={`year ${g === viewGrade ? "on" : ""} ${g < nowGrade ? "past" : ""}`}
            onClick={() => {
              setSt((s) => switchPlan(s, g));
              setStack([]);
            }}
          >
            <b>{g}年</b>
            <small class="num">{g === nowGrade ? "在籍" : creditsOfYear(g) ? `${creditsOfYear(g)}cr` : g < nowGrade ? "履修済" : "計画"}</small>
          </button>
        ))}
      </div>
      {viewGrade > nowGrade && (
        <p class="plan-note">
          {viewGrade}年の計画は {index?.year ?? ""} 年度の開講表で組んでいます。実際の年度には曜日・時限・担当が変わることがあります。単位は卒業要件の集計に入ります。
        </p>
      )}

      {dept && !satUsed && (
        <button class="sat-btn" onClick={() => setSt((s) => ({ ...s, showSat: !s.showSat }))}>
          {st.showSat ? "土曜日をたたむ" : "土曜日も表示"}
        </button>
      )}

      {agenda.length > 0 && (
        <ul class="agenda" aria-label="近いうちの試験・オンライン授業">
          {agenda.map((a) => (
            <li key={a.course.id + a.kind + a.date}>
              <button class="agenda-row" onClick={() => setStack([{ kind: "detail", id: a.course.id }])}>
                <i class={`al al-${a.kind}`}>{ALERT_LABEL[a.kind]}</i>
                <span class="num">
                  {mdShort(a.date)}({"日月火水木金土"[new Date(a.date + "T00:00:00").getDay()]})
                </span>
                <b>
                  {a.course.name}
                  {a.text && <span class="agenda-note">{a.text}</span>}
                </b>
                <small>{a.kind === "note" ? "メモ" : a.byUser ? "自分で設定" : "シラバスより"}</small>
              </button>
            </li>
          ))}
        </ul>
      )}

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
          isRequired={isRequired}
          alertsOf={alertsOf}
          target={top?.kind === "slot" && !(cells.get(cellKey(top.day, top.period)) ?? []).length ? top : null}
          moved={toast?.moved ?? null}
          onCell={(d, p) => {
            const here = cells.get(cellKey(d, p)) ?? [];
            // 選んだ科目が 1 つあるマスは、その科目の「今回」の内容と評価を開く（他の科目はそこから見られる）
            setStack([here.length > 1 ? { kind: "resolve", day: d, period: p } : here.length === 1 ? { kind: "detail", id: here[0].id, focus: { day: d, period: p } } : { kind: "slot", day: d, period: p }]);
          }}
        />
      ) : (
        <GridSkeleton days={days} periods={6} />
      )}

      {floating.length > 0 && (
        <div class="floating">
          <span class="floating-h">時間外・オンデマンド</span>
          {floating.map((c) => (
            <button key={c.id} class="floating-chip" onClick={() => push({ kind: "detail", id: c.id })}>
              {c.name}
              <small>{c.onlineMethod ?? (c.classFormat === "オンライン" ? "オンライン" : "時間割外")} · {c.credits}単位</small>
            </button>
          ))}
        </div>
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

      {failedOpen.map((r) => (
        <div key={r.name} class="note fail" role="status">
          <span class="note-dot" aria-hidden="true" />
          <span>
            必修の<b>{r.name}</b>が不合格（{st.grades[gradeKey(r.name)]?.grade}）· 再履修が必要
          </span>
          <button class="note-act" onClick={() => setStack([{ kind: "search", q: r.name }])}>
            クラスを探す
          </button>
        </div>
      ))}

      {dept && (
        <button class="bulk-btn cat-btn" onClick={() => setStack([{ kind: "catalog" }])}>
          <span class="bulk-plus" aria-hidden="true">
            <LayoutList size={16} />
          </span>
          <span>
            <b>
              {viewGrade}年・{view}に取れる科目の一覧
            </b>
            <small>必修・選択必修・教養などの区分別 · 曜日時限とキャンパス付き</small>
          </span>
        </button>
      )}

      {dept && reqPlan && reqPlan.add.length > 0 && (
        <button class="bulk-btn" onClick={addRequired}>
          <span class="bulk-plus" aria-hidden="true">
            ＋
          </span>
          <span>
            <b>{viewGrade}年の必修をまとめて追加</b>
            <small>
              {reqPlan.add.length}科目 · 学部要覧の授業科目配置表より{retake.size ? `（再履修 ${[...retake].filter((k) => reqPlan.add.some((c) => gradeKey(c.name) === k)).length}科目を含む）` : ""}
            </small>
          </span>
        </button>
      )}

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
          <b class="num">{viewGrade}</b>
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
      <CreditBar planned={plannedYear} earned={earnedTotal} total={req?.totalCredits ?? null} onOpen={() => push({ kind: "credits" })} />

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

  function addRequired() {
    if (!reqPlan || !reqPlan.add.length) return;
    const before = st.selected;
    const ids = reqPlan.add.map((c) => c.id);
    setSt((s) => ({ ...s, selected: [...new Set([...s.selected, ...ids])], dataYear: index?.year ?? s.dataYear }));
    const rest = [reqPlan.clashing.length ? `重複のため未追加 ${reqPlan.clashing.length}` : "", reqPlan.missing.length ? `開講なし ${reqPlan.missing.length}` : ""].filter(Boolean).join("・");
    say(`必修 ${ids.length} 科目を追加しました${rest ? `（${rest}）` : ""}`, { undo: () => setSt((s) => ({ ...s, selected: before })) });
  }

  /** 自分で追加する科目を作る（同じ名前・学期・時間のものがあれば使い回す） */
  function makeCustoms(extra: Omit<CustomCourse, "id">[]): { ids: string[]; made: CustomCourse[] } {
    const made: CustomCourse[] = [];
    const ids: string[] = [];
    for (const e of extra) {
      const old = st.custom.find((c) => c.name === e.name && c.term === e.term && JSON.stringify(c.slots) === JSON.stringify(e.slots));
      if (old) ids.push(old.id);
      else {
        const c = { ...e, id: newCustomId() };
        made.push(c);
        ids.push(c.id);
      }
    }
    return { ids, made };
  }

  function applyImport(ids: string[], extra: Omit<CustomCourse, "id">[], mode: "replace" | "append") {
    const before = st;
    const my = makeCustoms(extra);
    const all = [...ids, ...my.ids];
    const next = mode === "replace" ? all : [...new Set([...st.selected, ...all])];
    setSt((s) => ({ ...s, custom: [...s.custom, ...my.made].slice(-60), selected: next, dataYear: index?.year ?? s.dataYear }));
    close();
    const added = next.filter((id) => !before.selected.includes(id)).length;
    const mine = extra.length ? `（自分で追加 ${extra.length}）` : "";
    say(mode === "replace" ? `確認表の ${all.length} 科目で時間割を置き換えました${mine}` : `${added} 科目を追加しました${mine}`, { undo: () => setSt(() => before) });
  }

  function applyShot(ids: string[], extra: Omit<CustomCourse, "id">[], g: number, term: "前期" | "後期", mode: "replace" | "append") {
    const before = st;
    // 照合できなかったマスは「自分で追加した科目」として作る
    const { ids: myIds, made } = makeCustoms(extra);
    const all = [...ids, ...myIds];
    setSt((s) => {
      const n = switchPlan(s, g);
      // 置き換えはその学年・その学期の科目だけ（通年や反対の学期は残す）
      const termOf = (id: string) => byId.get(id)?.term ?? s.custom.find((c) => c.id === id)?.term;
      const keep = mode === "replace" ? n.selected.filter((id) => termOf(id) !== term) : n.selected;
      return { ...n, custom: [...n.custom, ...made].slice(-60), selected: [...new Set([...keep, ...all])], view: term, dataYear: index?.year ?? n.dataYear };
    });
    close();
    say(`${g}年の${term}に ${all.length} 科目を取り込みました${extra.length ? `（自分で追加 ${extra.length}）` : ""}`, { undo: () => setSt(() => before) });
  }

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
        if (c && isCustomId(c.id)) return { eyebrow: "MY COURSE", title: c.name, sub: `自分で追加 · ${c.term} · ${c.credits}単位` };
        return { eyebrow: c?.code ? `COURSE ${c.code}` : undefined, title: c?.name, sub: c?.subtitle || (c ? `${c.term} · ${c.credits}単位` : undefined) };
      }
      case "credits":
        return { eyebrow: "CREDITS", title: "単位と卒業要件", sub: `${deptName} · ${profile?.entryYear}年度入学` };
      case "menu":
        return { title: "その他" };
      case "grades":
        return { eyebrow: "GRADES · GPA", title: "成績と GPA", sub: "修得した科目に評価を付けると、GPA と単位を計算します" };
      case "install":
        return { eyebrow: "INSTALL", title: "ホーム画面に追加", sub: "アプリのようにアイコンからすぐ開けます" };
      case "catalog":
        return { eyebrow: `CATALOG · ${viewGrade}年 ${view}`, title: "今学期の科目一覧", sub: `取れる科目 ${new Set(catalogCourses.map((c) => normName(c.name))).size}件 · 時間のボタンで追加` };
      case "shot":
        return { eyebrow: "IMPORT", title: "画面写真から取り込む", sub: "他の時間割アプリのスクリーンショットを読み取って、学年ごとの計画に並べます" };
      case "import":
        return { eyebrow: "IMPORT", title: "履修届確認表から取り込む", sub: top.codes ? "ブックマークレットで読み取った時間割CD" : "学校の確認表を貼り付けると、登録済みの科目を時間割に並べます" };
      case "search":
        return { eyebrow: "SEARCH", title: "科目を探す", sub: "全学年・全時限から（再履修のクラス探しなど）" };
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
            grade={viewGrade}
            reqOf={reqOf}
            category={category}
            groupOf={groupOf}
            isRetake={isRetake}
            passedGrade={(c) => (gs.passed.has(gradeKey(c.name)) ? st.grades[gradeKey(c.name)]?.grade ?? null : null)}
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
        const my = st.custom.find((x) => x.id === c.id);
        if (my)
          return (
            <CustomDetail
              c={my}
              on={st.selected.includes(c.id)}
              onToggle={() => toggle(c)}
              onChange={(n) => setSt((s) => ({ ...s, custom: s.custom.map((x) => (x.id === n.id ? n : x)) }))}
              onDelete={() => {
                const before = st;
                const drop = (ids: string[]) => ids.filter((id) => id !== c.id);
                setSt((s) => ({ ...s, custom: s.custom.filter((x) => x.id !== c.id), selected: drop(s.selected), plans: Object.fromEntries(Object.entries(s.plans).map(([k, v]) => [k, drop(v)])) }));
                close();
                say(`${c.name}を消しました`, { undo: () => setSt(() => before) });
              }}
            />
          );
        const fc = top.focus;
        return <CourseDetail rotation={st.rotation} onRotation={(v) => setSt((x) => ({ ...x, rotation: { ...x.rotation, [c.id]: v } }))} focus={!!fc && viewGrade === nowGrade} onOthers={fc ? () => push({ kind: "slot", day: fc.day, period: fc.period }) : undefined} c={c} status={statusOf(c)} on={st.selected.includes(c.id)} req={reqOf(c)} clash={clashesWith(c, selected)} onToggle={toggle} marks={st.marks} onMark={(s, what) => setSt((x) => ({ ...x, marks: toggleMark(x.marks, c, s, what) }))} onNote={(s, t) => setSt((x) => ({ ...x, marks: setNote(x.marks, c, s, t) }))} />;
      }
      case "credits":
        return (
          <Credits
            req={req}
            selected={plannedAll}
            earned={st.earned}
            earnedAll={earnedAll}
            passed={gs.passed}
            summary={gs}
            onGrades={() => push({ kind: "grades" })}
            onEarned={(id, v) => setSt((s) => ({ ...s, earned: { ...s.earned, [id]: v } }))}
            deptName={deptName}
            entryYear={profile?.entryYear ?? 0}
          />
        );
      case "grades":
        return (
          <GradesPanel
            req={req}
            grades={st.grades}
            summary={gs}
            grade={profile?.grade ?? 1}
            allCourses={allCourses}
            onSet={(k, e) =>
              setSt((s) => {
                const g = { ...s.grades };
                if (e) g[k] = e;
                else delete g[k];
                return { ...s, grades: g };
              })
            }
            onRetake={(name) => push({ kind: "search", q: name })}
            onClear={() => {
              const before = st.grades;
              setSt((s) => ({ ...s, grades: {} }));
              say("成績を消しました", { undo: () => setSt((s) => ({ ...s, grades: before })) });
            }}
          />
        );
      case "install":
        return <InstallPanel ios={install.ios} />;
      case "catalog":
        return (
          <CatalogPanel
            courses={catalogCourses}
            req={req}
            reqOf={reqOf}
            selectedIds={new Set(st.selected)}
            isPassed={(c) => gs.passed.has(gradeKey(c.name))}
            onToggle={toggle}
            onOpen={(c) => push({ kind: "detail", id: c.id })}
            homeCampus={homeCampus}
          />
        );
      case "shot":
        return (
          <ShotImportPanel
            all={allCourses}
            starts={Object.fromEntries(Object.entries(times).map(([p, t]) => [p, t[0]]))}
            viewGrade={viewGrade}
            view={view}
            dataYear={index?.year ?? null}
            nowGrade={profile?.grade ?? null}
            onApply={applyShot}
          />
        );
      case "import":
        return (
          <ImportPanel
            initialCodes={top.codes}
            all={allCourses}
            byId={byId}
            past={viewGrade < nowGrade}
            selectedIds={new Set(st.selected)}
            siteUrl={location.origin + location.pathname}
            onApply={applyImport}
            onCopied={(m) => say(m)}
          />
        );
      case "search":
        return (
          <SearchPanel
            key={top.q}
            initial={top.q}
            all={allCourses}
            selectedIds={new Set(st.selected)}
            canShow={(c) => statusOf(c) !== "no" || st.selected.includes(c.id)}
            onOpen={(c) => push({ kind: "detail", id: c.id })}
          />
        );
      case "profile":
        return index ? (
          <Setup
            inline
            index={index}
            initial={profile}
            onDone={(p) => {
              setSt((s) =>
                p.dept !== s.profile?.dept
                  ? { ...s, profile: p, selected: [], plans: {}, planGrade: null }
                  : { ...switchPlan(s, p.grade), profile: p, planGrade: null },
              );
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
            {!install.installed && (
              <MenuItem
                icon={<Smartphone size={18} />}
                title="ホーム画面に追加"
                sub={install.canPrompt ? "ワンタップでアプリとしてインストール" : install.ios ? "iPhone・iPad：共有ボタンから追加（手順を表示）" : "アイコンからすぐ開けるようにする"}
                onClick={async () => {
                  if (install.canPrompt) {
                    close();
                    if (await install.prompt()) say("ホーム画面に追加しました");
                  } else push({ kind: "install" });
                }}
              />
            )}
            <MenuItem icon={<LayoutList size={18} />} title="今学期の科目一覧" sub="区分別・曜日時限・キャンパス付き" onClick={() => push({ kind: "catalog" })} />
            <MenuItem icon={<ClipboardList size={18} />} title="履修届確認表から取り込む" sub="学校で登録した科目を貼り付けて一括で時間割に" onClick={() => push({ kind: "import", codes: null })} />
            <MenuItem icon={<ImagePlus size={18} />} title="他のアプリの時間割を写真から取り込む" sub="スクリーンショットを端末の中で読み取り、学年を選んで並べる" onClick={() => push({ kind: "shot" })} />
            <MenuItem icon={<Award size={18} />} title="成績と GPA" sub={gs.gpa != null ? `GPA ${gs.gpa.toFixed(2)} · 修得 ${gs.earned} 単位` : "修得した科目に S〜E を付けて GPA を計算"} onClick={() => push({ kind: "grades" })} />
            <MenuItem icon={<Search size={18} />} title="科目を探す" sub="全学年・全時限から（再履修など）" onClick={() => push({ kind: "search", q: "" })} />
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

/** 下部の学分栏：1 目盛 = 10 単位の物差し。修得済は墨、全学年の計画は緋 */
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
            <span class="ruler" style={{ "--tick": `${(10 / T) * 100}%` }} role="img" aria-label={`修得済${earned}単位、4年計画${planned}単位、残り${left}単位`}>
              <i class="ruler-done" style={{ width: `${e}%` }} />
              <i class="ruler-plan" style={{ width: `${p}%` }} />
            </span>
            <span class="scale num" aria-hidden="true">
              {/* 修得済の段が短いと注記どうしが重なるので、そのときは左端に 1 つにまとめる */}
              {e >= 22 ? (
                <>
                  <span style={{ left: 0 }}>0</span>
                  <span style={{ right: `${100 - e}%`, paddingRight: 4 }}>修得済 {earned}</span>
                  <span class="is-plan" style={{ left: `${e}%`, paddingLeft: 4 }}>計画 {planned}</span>
                </>
              ) : (
                <span style={{ left: 0 }}>
                  {earned > 0 && `修得済 ${earned} · `}
                  <span class="is-plan" style={{ position: "static" }}>計画 {planned}</span>
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
