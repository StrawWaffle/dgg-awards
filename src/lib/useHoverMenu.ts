import { useEffect, useRef, useState } from "react";

/**
 * A menu that opens while the mouse is over its box, or on a click (touch).
 * Leaving closes it after a moment, so the gap to the menu can be crossed.
 * A click outside or Escape closes it.
 */
export function useHoverMenu<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const box = useRef<T>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("pointerdown", outside);
    addEventListener("keydown", escape);
    return () => {
      removeEventListener("pointerdown", outside);
      removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const hover = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(closeTimer.current);
      setOpen(true);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setOpen(false), 250);
    },
  };
  return { open, setOpen, box, hover };
}
