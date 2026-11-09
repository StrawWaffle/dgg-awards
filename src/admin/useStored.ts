import { useState } from "react";

/**
 * State kept in localStorage, for per-browser conveniences (theme, collapsed
 * sections). Storage can be blocked or full; then it just isn't remembered.
 */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`admin.${key}`);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(`admin.${key}`, JSON.stringify(next));
    } catch {}
  };
  return [value, set] as const;
}
