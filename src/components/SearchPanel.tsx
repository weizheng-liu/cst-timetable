import { Search } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";
import { normName } from "../lib/credits";
import { slotLabel } from "../lib/periods";
import type { Course } from "../lib/types";

interface Props {
  initial: string;
  all: Course[];
  selectedIds: Set<string>;
  canShow: (c: Course) => boolean;
  onOpen: (c: Course) => void;
}

/** 全学年・全時限から科目を探す（再履修のクラス探し用）。タップで詳細を開き、そこで追加する */
export function SearchPanel({ initial, all, selectedIds, canShow, onOpen }: Props) {
  const [q, setQ] = useState(initial);
  const query = normName(q);
  const hits = useMemo(
    () =>
      query
        ? all
            .filter((c) => canShow(c) && normName(c.name + c.teachers.join("") + c.id).includes(query))
            .sort((a, b) => (a.grade ?? 9) - (b.grade ?? 9) || a.name.localeCompare(b.name, "ja"))
            .slice(0, 80)
        : [],
    [query, all],
  );
  return (
    <>
      <label class="search">
        <Search size={15} />
        <input type="search" placeholder="科目名・教員名・時間割CD" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} autoFocus />
      </label>
      <ul class="pick-list">
        {hits.map((c) => (
          <li key={c.id} class="pick">
            <button class="pick-btn plain" onClick={() => onOpen(c)}>
              <span class="pick-main">
                <span class="pick-top">
                  <b>{c.name}</b>
                  <span class="cr">
                    <em class="num">{c.credits}</em>単位
                  </span>
                </span>
                <span class="pick-meta">
                  <span class="pick-meta-text">
                    {c.term} · {slotLabel(c.slots)} · {c.grade ? `${c.grade}年` : "学年なし"} · {c.teachers[0] ?? ""}
                  </span>
                </span>
                {selectedIds.has(c.id) && (
                  <span class="tags">
                    <span class="tag on">選択中</span>
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {query && hits.length === 0 && <div class="empty-state">見つかりませんでした。</div>}
      {!query && <p class="small muted">自分の学科と共通・教養の科目を、全学年・全時限から探せます。再履修のクラス探しに使ってください。</p>}
    </>
  );
}
