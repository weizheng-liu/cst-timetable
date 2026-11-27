import { Check, Monitor, Moon, RotateCcw, Sun, Sunset } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { PERIOD_TIMES, validRange, type PeriodTimes } from "../lib/periods";
import type { Theme } from "../lib/store";

const THEME_OPTIONS: { id: Theme; label: string; sub: string; icon: any; swatch: [string, string, string] }[] = [
  { id: "system", label: "自動", sub: "端末の設定に合わせる", icon: Monitor, swatch: ["#f7f7f8", "#0e0e10", "#5b5bd6"] },
  { id: "light", label: "ライト", sub: "白地・ニュートラル", icon: Sun, swatch: ["#f7f7f8", "#ffffff", "#5b5bd6"] },
  { id: "dark", label: "ダーク", sub: "夜・暗い場所で", icon: Moon, swatch: ["#0e0e10", "#17171a", "#8b8bf0"] },
  { id: "sepia", label: "セピア", sub: "目にやさしい紙色・青色光少なめ", icon: Sunset, swatch: ["#f3ecdc", "#faf5ea", "#a2683a"] },
];

export function ThemePicker({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <div class="theme-grid" role="radiogroup" aria-label="テーマ">
      {THEME_OPTIONS.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} class="theme-opt" onClick={() => onChange(o.id)}>
          <span class="swatch" aria-hidden="true">
            {o.id === "system" ? (
              <span style={{ background: `linear-gradient(135deg, ${o.swatch[0]} 50%, ${o.swatch[1]} 50%)` }} />
            ) : (
              <span style={{ background: o.swatch[0] }}>
                <i style={{ background: o.swatch[1] }} />
                <b style={{ background: o.swatch[2] }} />
              </span>
            )}
          </span>
          <span class="theme-text">
            <span class="row-title">{o.label}</span>
            <span class="row-sub">{o.sub}</span>
          </span>
          {value === o.id && <Check size={16} class="theme-check" />}
        </button>
      ))}
    </div>
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
        初期値は理工学部の標準時限です。学科・校舎で違う場合はここで直せます。変更は時間割とカレンダー書き出し（.ics）に反映され、この端末にだけ保存されます。
      </p>
      <div class="ptimes">
        {Array.from({ length: periods }, (_, i) => i + 1).map((p) => {
          const t = custom[p] ?? times[p];
          const bad = custom[p] && !validRange(custom[p]);
          const changed = !!custom[p];
          return (
            <div key={p} class={`ptime ${bad ? "bad" : ""}`}>
              <span class="pno num">{p}限</span>
              <TimeInput label={`${p}限 開始`} value={t[0]} onCommit={(v) => set(p, 0, v)} />
              <span class="faint">–</span>
              <TimeInput label={`${p}限 終了`} value={t[1]} onCommit={(v) => set(p, 1, v)} />
              <span class="pmark small">{bad ? "終了は開始より後に" : changed ? "変更" : ""}</span>
            </div>
          );
        })}
      </div>
      <button class="btn ghost block" style={{ marginTop: 16 }} disabled={!edited} onClick={() => onChange({})}>
        <RotateCcw size={16} />
        標準の時間に戻す
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
