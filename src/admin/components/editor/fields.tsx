// Small form pieces for the admin editor, in the admin page's existing style
// (neutral surfaces, emerald accent, mono font).
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import clsx from "clsx";
import { formatTimestamp, parseTimestamp } from "@/lib/links";

export const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-emerald-600 focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Button({
  variant = "default",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "default" | "primary" | "danger" }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        "rounded border px-3 py-1 text-sm transition-colors",
        // One plain disabled look for every variant; a faded green read as broken.
        "disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400",
        {
          "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100": variant === "default",
          "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800": variant === "primary",
          "border-red-300 bg-white text-red-700 hover:bg-red-50": variant === "danger",
        },
        className,
      )}
    />
  );
}

/**
 * Seconds, typed as "1:23", "83" or "1m23s". Shows the parsed value back as
 * m:ss once you leave the field, and flags anything it can't read.
 */
export function TimeInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (seconds: number | null, valid: boolean) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? "" : formatTimestamp(value));
  useEffect(() => {
    setText(value == null ? "" : formatTimestamp(value));
  }, [value]);
  const parsed = text.trim() === "" ? null : parseTimestamp(text);
  const invalid = parsed === undefined;
  return (
    <input
      className={clsx(inputClass, invalid && "border-red-500")}
      value={text}
      placeholder={placeholder ?? "m:ss"}
      aria-invalid={invalid}
      onChange={(e) => {
        setText(e.currentTarget.value);
        const p = e.currentTarget.value.trim() === "" ? null : parseTimestamp(e.currentTarget.value);
        onChange(p === undefined ? value : p, p !== undefined);
      }}
      onBlur={() => {
        if (!invalid) setText(parsed == null ? "" : formatTimestamp(parsed));
      }}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-700">{children}</p>;
}
