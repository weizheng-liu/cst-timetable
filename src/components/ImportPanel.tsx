import { ClipboardPaste, Bookmark, Copy } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";
import { bookmarklet, parseCodes } from "../lib/importer";
import { slotLabel } from "../lib/periods";
import type { Course } from "../lib/types";

interface Props {
  initialCodes: string[] | null;
  byId: Map<string, Course>;
  selectedIds: Set<string>;
  siteUrl: string;
  onApply: (ids: string[], mode: "replace" | "append") => void;
  onCopied: (msg: string) => void;
}

/**
 * 学校の「履修届確認表」から時間割CDだけを読み取って時間割に並べる。
 * 貼り付けた文字はこの画面の中だけで使い、保存も送信もしない。
 */
export function ImportPanel({ initialCodes, byId, selectedIds, siteUrl, onApply, onCopied }: Props) {
  const [text, setText] = useState("");
  const codes = useMemo(() => (text ? parseCodes(text) : initialCodes ?? []), [text, initialCodes]);
  const found = codes.map((c) => byId.get(c)).filter(Boolean) as Course[];
  const missing = codes.filter((c) => !byId.has(c));
  const fresh = found.filter((c) => !selectedIds.has(c.id)).length;
  const bm = useMemo(() => bookmarklet(siteUrl), [siteUrl]);

  const copy = (s: string, msg: string) =>
    navigator.clipboard?.writeText(s).then(() => onCopied(msg), () => onCopied("コピーできませんでした。長押しで選択してください"));

  return (
    <>
      {!initialCodes && (
        <>
          <ol class="steps">
            <li>学校の履修登録システムで「履修届確認表」を開く</li>
            <li>ページ全体を選択してコピー（PC：Ctrl+A → Ctrl+C／スマホ：長押し →「すべて選択」→ コピー）</li>
            <li>下の欄に貼り付ける</li>
          </ol>
          <label class="paste-box">
            <ClipboardPaste size={15} />
            <textarea
              rows={4}
              placeholder="ここに貼り付け（例：(前期)J31D:電磁気学Ⅰ及び演習…）"
              value={text}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            />
          </label>
          <p class="fine">読み取るのは「(前期)J31D:」のような時間割CDだけです。氏名・学生番号などは読まず、保存も送信もしません。</p>
        </>
      )}

      {codes.length > 0 && (
        <>
          <h3 class="sec-label">
            見つかった科目 <span class="num">{found.length}</span>
            {missing.length > 0 && <span class="dim"> ／ 該当なし {missing.length}</span>}
          </h3>
          <ul class="pick-list">
            {found.map((c) => (
              <li key={c.id} class="pick">
                <div class="pick-btn plain static">
                  <span class="pick-main">
                    <span class="pick-top">
                      <b>{c.name}</b>
                      <span class="cr">
                        <em class="num">{c.credits}</em>単位
                      </span>
                    </span>
                    <span class="pick-meta">
                      <span class="pick-meta-text">
                        <span class="mono">{c.id}</span> · {c.term} · {slotLabel(c.slots)} · {c.teachers[0] ?? ""}
                      </span>
                    </span>
                    {selectedIds.has(c.id) && (
                      <span class="tags">
                        <span class="tag on">選択中</span>
                      </span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <div class="note miss">
              <b>このサイトのデータにない時間割CD</b>
              <span class="mono">{missing.join("  ")}</span>
              <span>他学科の科目や、年度の違うデータかもしれません。必要なら「科目を探す」から手で追加してください。</span>
            </div>
          )}
          {found.length > 0 && (
            <div class="sheet-cta col">
              <button class="btn primary cta" onClick={() => onApply(found.map((c) => c.id), "replace")}>
                <span class="cta-name">今の時間割を置き換えて取り込む</span>
                <span class="cta-cr">{found.length}科目</span>
              </button>
              <button class="btn ghost block" disabled={!fresh} onClick={() => onApply(found.map((c) => c.id), "append")}>
                今の時間割に追加（新しく {fresh} 科目）
              </button>
            </div>
          )}
        </>
      )}
      {text && codes.length === 0 && <div class="note miss">時間割CDが見つかりません。「履修届確認表」のページ全体をコピーしたか確認してください。</div>}

      {!initialCodes && (
        <details class="bm">
          <summary>
            <Bookmark size={15} /> PC なら「ブックマークレット」でワンクリック
          </summary>
          <ol class="steps">
            <li>
              下のボタンをブックマークバーへドラッグ（または URL をコピーして新しいブックマークの URL 欄に貼る）
            </li>
            <li>「履修届確認表」を開いた状態でそのブックマークをクリック</li>
            <li>このサイトが新しいタブで開き、そのまま取り込み画面になります</li>
          </ol>
          <div class="bm-row">
            <a class="btn ghost" href={bm} onClick={(e) => { e.preventDefault(); onCopied("ブックマークバーへドラッグして登録してください"); }}>
              <Bookmark size={15} /> 時間割に取り込む
            </a>
            <button class="btn ghost" onClick={() => copy(bm, "ブックマークレットをコピーしました")}>
              <Copy size={15} /> URL をコピー
            </button>
          </div>
          <p class="fine">ページ上で時間割CDを集めて、URL の「#」以降に付けてこのサイトを開くだけです。「#」以降はサーバーに送られません。学校のシステムへの操作や送信はしません。</p>
        </details>
      )}
    </>
  );
}
