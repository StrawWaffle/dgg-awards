import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import clsx from "clsx";
import { useStored } from "@/admin/useStored";

/**
 * A titled block that folds away. The title is a shaded bar that says
 * Show or Hide, so it reads as the toggle; when open, the content sits
 * under it (boxed) or hangs off a line from it (unboxed), so it's clear
 * what the bar folds. Open or closed is remembered per `id`.
 */
export function Section({
  id,
  title,
  aside,
  defaultOpen = true,
  boxed = true,
  children,
}: {
  id: string;
  title: ReactNode;
  /** Shown at the right of the title, e.g. a count. */
  aside?: ReactNode;
  defaultOpen?: boolean;
  /** false: no box of its own, for use inside a form or panel. */
  boxed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useStored(`section.${id}`, defaultOpen);
  const contentId = `section-${id}`;
  return (
    <section className={clsx(boxed && "overflow-hidden rounded border border-neutral-200 bg-white")}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen(!open)}
          className={clsx(
            "flex w-full items-center gap-2 bg-neutral-50 px-3 py-2 text-left text-sm font-bold transition-colors hover:bg-neutral-100",
            boxed ? open && "border-b border-neutral-200" : "rounded border border-neutral-200",
          )}
        >
          {open ? <ChevronDownIcon className="shrink-0" /> : <ChevronRightIcon className="shrink-0" />}
          <span className="grow">{title}</span>
          {aside !== undefined && <span className="text-xs font-normal text-neutral-500">{aside}</span>}
          <span className="w-9 text-right text-xs font-normal text-neutral-500">{open ? "Hide" : "Show"}</span>
        </button>
      </h2>
      {open && (
        <div id={contentId} className={clsx(!boxed && "ml-3 border-l-2 border-neutral-200 pt-3 pl-4")}>
          {children}
        </div>
      )}
    </section>
  );
}
