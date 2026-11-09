import type { ReactNode } from "react";
import { Tabs } from "radix-ui";
import { clsx } from "clsx";

/** Shared look for everything in the sidebar: tabs, links and buttons. */
export const sideItemClass = (collapsed: boolean) =>
  clsx(
    "flex shrink-0 items-center gap-3 rounded px-3 py-2 text-sm text-neutral-700 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-emerald-700",
    collapsed && "md:justify-center md:px-0",
  );

/**
 * Hidden next to the icon when the sidebar is collapsed (wide screens only).
 * `iconOnPhones`: also hidden on narrow screens, where the sidebar is a bar.
 */
export function SideLabel({
  collapsed,
  iconOnPhones = false,
  children,
}: {
  collapsed: boolean;
  iconOnPhones?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={clsx("whitespace-nowrap", collapsed && "md:sr-only", iconOnPhones && "max-md:sr-only")}>
      {children}
    </span>
  );
}

export function TabTrigger({
  value,
  icon,
  collapsed,
  children,
}: {
  value: string;
  icon: ReactNode;
  collapsed: boolean;
  children: string;
}) {
  return (
    <Tabs.Trigger
      value={value}
      title={collapsed ? children : undefined}
      className={clsx(
        sideItemClass(collapsed),
        "data-[state=active]:bg-neutral-100 data-[state=active]:font-bold data-[state=active]:text-neutral-900",
      )}
    >
      {icon}
      <SideLabel collapsed={collapsed}>{children}</SideLabel>
    </Tabs.Trigger>
  );
}
