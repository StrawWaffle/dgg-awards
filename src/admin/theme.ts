import { useEffect, useSyncExternalStore } from "react";
import { useStored } from "@/admin/useStored";

export type Theme = "system" | "light" | "dark";

const dark = window.matchMedia("(prefers-color-scheme: dark)");
const subscribe = (onChange: () => void) => {
  dark.addEventListener("change", onChange);
  return () => dark.removeEventListener("change", onChange);
};

/** The chosen theme (remembered), applied as the admin-dark class on <html>. */
export function useTheme() {
  const [theme, setTheme] = useStored<Theme>("theme", "system");
  const systemDark = useSyncExternalStore(subscribe, () => dark.matches);
  const isDark = theme === "dark" || (theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("admin-dark", isDark);
  }, [isDark]);
  return [theme, setTheme] as const;
}
