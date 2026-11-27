import { useState } from "preact/hooks";
import type { DataIndex, Profile } from "../lib/types";

interface Props {
  index: DataIndex;
  initial: Profile | null;
  onDone: (p: Profile) => void;
  inline?: boolean;
}

export function Setup({ index, initial, onDone, inline }: Props) {
  const thisYear = index.year;
  const [dept, setDept] = useState(initial?.dept ?? "09");
  const [grade, setGrade] = useState(initial?.grade ?? 1);
  const [entryYear, setEntryYear] = useState(initial?.entryYear ?? thisYear - (initial?.grade ?? 1) + 1);
  const years = Array.from({ length: 8 }, (_, i) => thisYear - i);

  const form = (
    <>
      <label class="field">
        <span>学科</span>
        <select value={dept} onChange={(e) => setDept((e.target as HTMLSelectElement).value)}>
          {index.departments.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label class="field">
        <span>学年（{thisYear}年度）</span>
        <select
          value={grade}
          onChange={(e) => {
            const g = Number((e.target as HTMLSelectElement).value);
            setGrade(g);
            setEntryYear(thisYear - g + 1);
          }}
        >
          {[1, 2, 3, 4].map((g) => (
            <option key={g} value={g}>
              {g}年
            </option>
          ))}
        </select>
      </label>
      <label class="field">
        <span>入学年度（卒業要件の判定に使います）</span>
        <select value={entryYear} onChange={(e) => setEntryYear(Number((e.target as HTMLSelectElement).value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}年度
            </option>
          ))}
        </select>
      </label>
      <button class="btn primary block" style={{ marginTop: 8 }} onClick={() => onDone({ dept, grade, entryYear })}>
        {inline ? "保存" : "時間割をつくる"}
      </button>
    </>
  );
  if (inline) return form;
  return (
    <div class="setup">
      <h1>理工 時間割プランナー</h1>
      <p>日本大学理工学部の公開シラバスから、自分の時間割を組み立てるための非公式ツールです。データはこの端末の中だけに保存されます。</p>
      {form}
      <p class="small faint" style={{ marginTop: 20 }}>
        非公式ツールです。実際の履修登録は大学のシステムで行ってください。
      </p>
    </div>
  );
}
