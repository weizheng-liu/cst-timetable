import { Check, ImagePlus, RotateCcw } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { PERIOD_TIMES, validRange, type PeriodTimes } from "../lib/periods";
import type { Theme } from "../lib/store";
import { k, t } from "../lib/i18n";

type ThemeOpt = { id: Theme; label: string; sub: string };
const SIMPLE: ThemeOpt[] = [
  { id: "system", label: k("自動"), sub: k("端末の設定に合わせる") },
  { id: "light", label: k("方眼紙"), sub: k("緋と方眼・ライト（標準）") },
  { id: "dark", label: k("墨"), sub: k("緋と方眼・ダーク") },
  { id: "sepia", label: k("セピア"), sub: k("方眼紙をさらに黄ばませた目にやさしい版") },
];
const ART: ThemeOpt[] = [
  { id: "scope", label: k("オシロスコープ"), sub: k("曜日ごとの負荷を波形で表示・蛍光グリーン") },
  { id: "blueprint", label: k("設計図"), sub: k("青焼きの製図用紙・方眼・寸法線") },
  { id: "photo", label: k("写真"), sub: k("好きな写真を背景に（端末内のみ保存）") },
];

interface ThemeProps {
  value: Theme;
  onChange: (t: Theme) => void;
  hasPhoto: boolean;
  onPhoto: (f: File | null) => void;
  dim: number;
  onDim: (v: number) => void;
}

export function ThemePicker({ value, onChange, hasPhoto, onPhoto, dim, onDim }: ThemeProps) {
  const opt = (o: ThemeOpt) => (
    <button key={o.id} role="radio" aria-checked={value === o.id} class="theme-opt" onClick={() => onChange(o.id)}>
      <span class={`swatch sw-${o.id}`} aria-hidden="true">
        <span>
          <i />
          <b />
        </span>
      </span>
      <span class="theme-text">
        <span class="row-title">{t(o.label)}</span>
        <span class="row-sub">{t(o.sub)}</span>
      </span>
      {value === o.id && <Check size={16} class="theme-check" />}
    </button>
  );
  return (
    <>
      <div class="section-label" style={{ marginTop: 0 }}>{t("シンプル")}</div>
      <div class="theme-grid" role="radiogroup" aria-label={t("シンプルなテーマ")}>
        {SIMPLE.map(opt)}
      </div>
      <div class="section-label">{t("理工系アート")}</div>
      <div class="theme-grid" role="radiogroup" aria-label={t("アートテーマ")}>
        {ART.map(opt)}
      </div>
      {value === "photo" && (
        <div class="photo-tools">
          <label class="btn ghost block">
            <ImagePlus size={16} />
            {t(hasPhoto ? "写真を変更" : "写真を選ぶ")}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) onPhoto(f);
                (e.target as HTMLInputElement).value = "";
              }}
            />
          </label>
          {hasPhoto && (
            <button class="btn ghost block" onClick={() => onPhoto(null)}>
              <RotateCcw size={16} />
              {t("既定の背景に戻す")}
            </button>
          )}
          <label class="dim">
            <span class="small muted">{t("背景の暗さ")}</span>
            <input type="range" min={0.3} max={0.85} step={0.05} value={dim} onInput={(e) => onDim(Number((e.target as HTMLInputElement).value))} aria-label={t("背景の暗さ")} />
          </label>
          <p class="small faint" style={{ margin: 0 }}>
            {t("写真はこの端末のブラウザにだけ保存され、どこにも送信されません。文字が読みにくいときは暗さを上げてください。")}
          </p>
        </div>
      )}
    </>
  );
}

interface PeriodProps {
  periods: number;
  times: PeriodTimes;
  custom: Record<string, [string, string]>;
  onChange: (custom: Record<string, [string, string]>) => void;
}

/** 時限ごとの開始・終了時刻。変更は時間割の表示と .ics 書き出しの両方に使われる。 */
export function PeriodEditor({ periods, times, custom, onChange }: PeriodProps) {
  const set = (p: number, i: 0 | 1, v: string) => {
    const next: [string, string] = [...(custom[p] ?? times[p])] as [string, string];
    next[i] = v;
    const out = { ...custom };
    if (next[0] === PERIOD_TIMES[p][0] && next[1] === PERIOD_TIMES[p][1]) delete out[p];
    else out[p] = next;
    onChange(out);
  };
  const edited = Object.keys(custom).length > 0;
  return (
    <>
      <p class="small muted" style={{ margin: "0 0 12px" }}>
        {t("初期値は理工学部の標準時限です。学科・校舎で違う場合はここで直せます。変更は時間割とカレンダー書き出し（.ics）に反映され、この端末にだけ保存されます。")}
      </p>
      <div class="ptimes">
        {Array.from({ length: periods }, (_, i) => i + 1).map((p) => {
          const tm = custom[p] ?? times[p];
          const bad = custom[p] && !validRange(custom[p]);
          const changed = !!custom[p];
          return (
            <div key={p} class={`ptime ${bad ? "bad" : ""}`}>
              <span class="pno num">{t("{p}限", { p })}</span>
              <TimeInput label={t("{p}限 開始", { p })} value={tm[0]} onCommit={(v) => set(p, 0, v)} />
              <span class="faint">–</span>
              <TimeInput label={t("{p}限 終了", { p })} value={tm[1]} onCommit={(v) => set(p, 1, v)} />
              <span class="pmark small">{bad ? t("終了は開始より後に") : changed ? t("変更") : ""}</span>
            </div>
          );
        })}
      </div>
      <button class="btn ghost block" style={{ marginTop: 16 }} disabled={!edited} onClick={() => onChange({})}>
        <RotateCcw size={16} />
        {t("標準の時間に戻す")}
      </button>
    </>
  );
}

/** "920" / "9:20" / "0920" -> "09:20"; anything else -> null */
export function normalizeTime(raw: string): string | null {
  const d = raw.replace(/[^0-9]/g, "");
  const m = raw.includes(":") ? raw.trim().match(/^(\d{1,2}):(\d{2})$/) : d.length >= 3 && d.length <= 4 ? [d, d.slice(0, -2), d.slice(-2)] : null;
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/**
 * 24時間表記のテキスト入力。<input type="time"> は端末のロケールで 12 時間表記（AM/PM）になり
 * 「01:20」のように見えてしまうことがあるため使わない。
 */
function TimeInput({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [bad, setBad] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = normalizeTime(draft);
    if (v) {
      setBad(false);
      setDraft(v);
      if (v !== value) onCommit(v);
    } else {
      setBad(true);
    }
  };
  return (
    <input
      class={`num ${bad ? "invalid" : ""}`}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      placeholder="09:00"
      aria-label={label}
      aria-invalid={bad}
      value={draft}
      onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
