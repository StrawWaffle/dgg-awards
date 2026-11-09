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
        // always the selected one, which the active styles already mark.
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-neutral-600 outline-none transition-all",
        "hover:bg-white hover:text-neutral-900",
        "data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm",
      )}
    >
      {icon}
      {children}
    </Tabs.Trigger>
  );
}
