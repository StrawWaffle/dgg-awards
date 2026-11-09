import { EyeOpenIcon } from "@radix-ui/react-icons";
import { clsx } from "clsx";
import { SideLabel, sideItemClass } from "@/admin/components/TabTrigger";
import { previewPath, stagePages, stages } from "@/lib/previews";
import { useHoverMenu } from "@/lib/useHoverMenu";

/**
 * "Preview" in the sidebar: hovering (or clicking) opens every preview page,
 * by stage, and the lab. They open in a new tab, like the sidebar's links.
 */
export function PreviewMenu({ collapsed }: { collapsed: boolean }) {
  const { open, setOpen, box, hover } = useHoverMenu();
  const link = "block rounded px-2 py-1 text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900";
  return (
    <div ref={box} className="relative" {...hover}>
      <button
        type="button"
        className={clsx(sideItemClass(collapsed), "w-full", open && "bg-neutral-100 text-neutral-900")}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? "Preview" : undefined}
      >
        <EyeOpenIcon />
        <SideLabel collapsed={collapsed} iconOnPhones>
          Preview
        </SideLabel>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Preview pages"
          className={clsx(
            "absolute z-50 w-[min(36rem,calc(100vw-1rem))] rounded border border-neutral-200 bg-white p-3 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.1)]",
            // Beside the sidebar on wide screens; under the top bar on phones.
            "top-full left-0 mt-1 md:top-auto md:bottom-0 md:left-full md:mt-0 md:ml-2",
          )}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stages.map((s) => (
              <div key={s.id}>
                <p className="px-2 pb-1 font-bold text-neutral-900">{s.label}</p>
                <ul>
                  {stagePages.map((p) => (
                    <li key={p.page}>
                      <a role="menuitem" href={previewPath(p.page, s.id)} target="_blank" rel="noopener" className={link} onClick={() => setOpen(false)}>
                        {p.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-neutral-200 pt-2">
            <a role="menuitem" href="/preview/lab" target="_blank" rel="noopener" className={clsx(link, "inline-block")} onClick={() => setOpen(false)}>
              Lab
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
