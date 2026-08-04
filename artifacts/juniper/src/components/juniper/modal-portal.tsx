import { type ReactNode } from "react";
import { createPortal } from "react-dom";

// Modals opened from the app bar were rendering pinned to the top-left of the
// bar instead of centered on screen: the `.appbar` sets `backdrop-filter`, and
// any ancestor with a filter/backdrop-filter becomes the containing block for
// `position: fixed` descendants — so the full-screen `.modal-bg` (inset:0)
// resolved to the thin app-bar box, not the viewport.
//
// Rendering the backdrop through a portal to <body> escapes that containing
// block so `position: fixed` resolves to the viewport again. The wrapper keeps
// the `.jnpr` class (for scoped tokens + `.jnpr .modal-bg` styles) but uses
// `display: contents` so it adds no box of its own (no stray full-height
// background from the `.jnpr` block rule).
export function ModalBackdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const content = (
    <div className="jnpr" style={{ display: "contents" }}>
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>
  );
  if (typeof document === "undefined") return content; // SSR fallback
  return createPortal(content, document.body);
}
