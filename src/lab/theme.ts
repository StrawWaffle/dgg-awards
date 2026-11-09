import { useEffect, useState, useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";
const KEY = "lab.theme";
const dark = window.matchMedia("(prefers-color-scheme: dark)");

/** Light, dark or the system's, remembered; sets `lab` / `lab-dark` on <html>. */
export function useLabTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(KEY) as Theme | null) ?? "system";
    } catch {
      return "system";
    }
  });
  const systemDark = useSyncExternalStore(
    (onChange) => {
      dark.addEventListener("change", onChange);
      return () => dark.removeEventListener("change", onChange);
    },
    () => dark.matches,
  );
  const isDark = theme === "dark" || (theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.add("lab");
    document.documentElement.classList.toggle("lab-dark", isDark);
  }, [isDark]);
  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  };
  return { theme, isDark, setTheme };
}
