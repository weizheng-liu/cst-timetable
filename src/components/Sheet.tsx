import { t } from "../lib/i18n";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ChevronLeft, X } from "lucide-preact";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ComponentChildren;
  sub?: ComponentChildren;
  eyebrow?: string; // 等幅の英字ラベル（装飾）。例: SLOT TUE-2 · 10:50–12:30
  children: ComponentChildren;
  headExtra?: ComponentChildren;
  onBack?: () => void;
}

/** Bottom drawer on phones, right-side panel on wide screens. Keeps content mounted while animating out. */
export function Sheet({ open, onClose, title, sub, eyebrow, children, headExtra, onBack }: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 240);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!mounted) return null;
  return (
    <>
      <div class={`scrim ${shown ? "open" : ""}`} onClick={onClose} />
      <div
        class={`sheet ${shown ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={ref}
        onTouchStart={(e) => {
          const body = ref.current?.querySelector(".sheet-body");
          startY.current = body && body.scrollTop > 0 ? null : e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          if (startY.current != null && e.changedTouches[0].clientY - startY.current > 90) onClose();
          startY.current = null;
        }}
      >
        <div class="grabber" />
        <div class="sheet-head">
          {onBack && (
            <button class="icon-btn back" aria-label={t("戻る")} onClick={onBack}>
              <ChevronLeft size={20} />
            </button>
          )}
          <h2>
            {eyebrow && <span class="eyebrow" aria-hidden="true">{eyebrow}</span>}
            {title}
            {sub && <span class="sub">{sub}</span>}
          </h2>
          {headExtra}
          <button class="close-btn" aria-label={t("閉じる")} onClick={onClose}>
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </>
  );
}
