import * as React from "react";
import { Tabs } from "radix-ui";
import { clsx } from "clsx";

interface TabTriggerProps {
  children: React.ReactNode;
  value: string;
  icon: React.ReactNode;
}

export function TabTrigger({ children, value, icon }: TabTriggerProps) {
  return (
    <Tabs.Trigger
      value={value}
      className={clsx(
        // No focus outline: tabs activate on focus, so the focused tab is
        // always the selected one, which the underline already marks.
        "-mb-px flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm text-neutral-600 outline-none transition-colors",
        "hover:text-neutral-900",
        "data-[state=active]:border-emerald-700 data-[state=active]:text-neutral-900",
      )}
    >
      {icon}
      {children}
    </Tabs.Trigger>
  );
}
