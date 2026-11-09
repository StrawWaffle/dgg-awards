import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import clsx from "clsx";
import { useStored } from "@/admin/useStored";

/**
 * A titled block that folds away. Whether it's open is remembered per `id`,
 * so a section you closed stays closed when you come back.
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
  /** false: no border or background of its own, for use inside a form. */
  boxed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useStored(`section.${id}`, defaultOpen);
  return (
    <section className={clsx(boxed && "rounded border border-neutral-200 bg-white")}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={clsx(
            "flex w-full items-center gap-2 text-left text-sm font-bold hover:text-neutral-600",
            boxed ? "px-3 py-2" : "py-1",
            boxed && open && "border-b border-neutral-200",
          )}
        >
          {open ? <ChevronDownIcon className="shrink-0" /> : <ChevronRightIcon className="shrink-0" />}
          <span className="grow">{title}</span>
          {aside && <span className="text-xs font-normal text-neutral-500">{aside}</span>}
        </button>
      </h2>
      {open && <div className={clsx(!boxed && "pt-3")}>{children}</div>}
    </section>
  );
}
