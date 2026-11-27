import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ChevronLeft, X } from "lucide-preact";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ComponentChildren;
  sub?: ComponentChildren;
  children: ComponentChildren;
  headExtra?: ComponentChildren;
  onBack?: () => void;
}

/** Bottom drawer on phones, right-side panel on wide screens. Keeps content mounted while animating out. */
export function Sheet({ open, onClose, title, sub, children, headExtra, onBack }: Props) {
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
            <button class="icon-btn back" aria-label="戻る" onClick={onBack}>
              <ChevronLeft size={20} />
            </button>
          )}
          <h2>
            {title}
            {sub && <span class="sub">{sub}</span>}
          </h2>
          {headExtra}
          <button class="icon-btn" aria-label="閉じる" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </>
  );
}
