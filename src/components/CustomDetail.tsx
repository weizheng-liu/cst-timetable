import { Trash2 } from "lucide-preact";
import type { CustomCourse } from "../lib/custom";
import { slotLabel } from "../lib/periods";

interface Props {
  c: CustomCourse;
  on: boolean;
  onToggle: () => void;
  onChange: (c: CustomCourse) => void;
  onDelete: () => void;
}

/** 自分で追加した科目：名前・単位・教室を直す、外す、消す */
export function CustomDetail({ c, on, onToggle, onChange, onDelete }: Props) {
  return (
    <>
      <p class="fine" style={{ marginTop: 0 }}>
        シラバスのデータに無い科目として、この端末にだけ保存しています。{c.term} · {c.slots.length ? slotLabel(c.slots) : "時間なし"}
      </p>
      <label class="field">
        <span>科目名</span>
        <input class="shot-name" value={c.name} maxLength={60} onChange={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) onChange({ ...c, name: v }); }} />
      </label>
      <label class="field">
        <span>単位（卒業要件の合計に入ります）</span>
        <select value={c.credits} onChange={(e) => onChange({ ...c, credits: +(e.target as HTMLSelectElement).value })}>
          {[0, 1, 2, 3, 4, 6, 8].map((n) => (
            <option value={n}>{n} 単位</option>
          ))}
        </select>
      </label>
      <label class="field">
        <span>教室</span>
        <input class="shot-name" value={c.room ?? ""} maxLength={20} onChange={(e) => onChange({ ...c, room: (e.target as HTMLInputElement).value.trim() || null })} />
      </label>
      <div class="sheet-cta col">
        <button class={`btn ${on ? "ghost" : "primary"} block`} onClick={onToggle}>
          {on ? "この学年の時間割から外す" : "この学年の時間割に入れる"}
        </button>
        <button class="btn ghost block" onClick={onDelete}>
          <Trash2 size={14} /> この科目を消す（全学年から）
        </button>
      </div>
    </>
  );
}
