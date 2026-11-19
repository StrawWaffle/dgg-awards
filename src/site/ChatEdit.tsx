import { type CSSProperties, type ElementType, type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { saveChatReview } from "@/lib/queries";
import type { Card, Review } from "@/site/ChatReviewPage";

/**
 * Editing the year in chat on the page itself (admins). "Edit page" turns
 * every bit of text into something you can click and type in, and every list
 * gets buttons to move, remove and add. Nothing is saved until "Save", which
 * sends the whole page (recorded in the history, with undo).
 *
 * Text the page writes itself (headings, notes) lives in `copy`, by key, once
 * it's been rewritten; sections added here live in `extra`.
 */
export type Extra = { id: string; title: string; emote: string; intro: string; cards: Card[] };
export type ReviewDoc = Review & { copy?: Record<string, string>; extra?: Extra[] };
export type Path = (string | number)[];

type Edit = { editing: boolean; data: ReviewDoc; change: (f: (d: ReviewDoc) => ReviewDoc) => void };
const EditContext = createContext<Edit | null>(null);
const useEdit = () => useContext(EditContext)!;

export const getIn = (v: unknown, at: Path): unknown => at.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k as string]), v);

export function setIn<T>(v: T, at: Path, value: unknown): T {
  if (at.length === 0) return value as T;
  const [k, ...rest] = at;
  const copy = (Array.isArray(v) ? [...v] : { ...(v as object) }) as Record<string | number, unknown>;
  copy[k!] = setIn(copy[k!], rest, value);
  return copy as T;
}

/** A blank copy of a list's item: the same fields, with no words and zeros. */
function blank(v: unknown): unknown {
  if (typeof v === "string") return "";
  if (typeof v === "number") return 0;
  if (Array.isArray(v)) return [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)]));
  return v;
}

/**
 * The page, with the edit bar for admins. `children` draws the page from the
 * data it's given, which is the draft while editing.
 */
export function ReviewEditor({
  data,
  admin,
  year,
  floating = false,
  children,
}: {
  data: ReviewDoc;
  admin: boolean;
  year: string;
  /** Float the bar over the page's bottom corner (the story, which fills the screen). */
  floating?: boolean;
  children: (data: ReviewDoc) => ReactNode;
}) {
  const [saved, setSaved] = useState(data);
  // `#edit` (the admin sidebar's "Year in chat" link) opens it with editing on.
  const [draft, setDraft] = useState<ReviewDoc | null>(() => (admin && location.hash === "#edit" ? data : null));
  useEffect(() => {
    if (location.hash === "#edit") history.replaceState(null, "", location.pathname + location.search);
  }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSaved(data), [data]);
  const dirty = draft !== null && draft !== saved;

  // Don't lose unsaved writing to a closed tab.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await saveChatReview({ year, data: draft as never });
      setSaved(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const shown = draft ?? saved;
  const edit: Edit = { editing: draft !== null, data: shown, change: (f) => setDraft((d) => f(d ?? saved)) };

  return (
    <EditContext.Provider value={edit}>
      {admin && (
        <div
          className={`cozy-panel z-30 flex flex-wrap items-center gap-3 px-4 py-2.5 ${
            floating ? "fixed bottom-3 left-3 max-w-[calc(100%-1.5rem)]" : "sticky top-[calc(var(--lab-header,64px)+0.5rem)] mb-4"
          }`}
          style={draft ? { background: "var(--highlight)" } : undefined}
        >
          {draft === null ? (
            <>
              <button type="button" className="cozy-btn" onClick={() => setDraft(saved)}>
                Edit page
              </button>
              <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                Admins only: change any text, and add, move or remove things.
              </span>
            </>
          ) : (
            <>
              <button type="button" className="cozy-btn primary" disabled={!dirty || saving} onClick={save}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="cozy-btn"
                disabled={saving}
                onClick={() => {
                  if (dirty && !confirm("Throw away your changes?")) return;
                  setDraft(null);
                  setError(null);
                }}
              >
                {dirty ? "Discard changes" : "Done"}
              </button>
              <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                {dirty ? "Unsaved changes." : "Saved. Click any text to change it."} Saves show in the admin History, with undo.
              </span>
            </>
          )}
          {error && (
            <span className="text-sm font-semibold" style={{ color: "var(--coral)" }}>
              {error}
            </span>
          )}
        </div>
      )}
      {children(shown)}
    </EditContext.Provider>
  );
}

export const useEditing = () => useEdit().editing;

const editStyle: CSSProperties = { outline: "2px dashed var(--panel-border)", outlineOffset: 2, borderRadius: 6, cursor: "text", minWidth: "2ch" };

/** Typed-in text, kept as a number if it was one ("1,234" works). */
function TextField({
  value,
  onChange,
  as: Tag = "span",
  className,
  style,
  placeholder,
}: {
  value: string | number;
  onChange: (v: string | number) => void;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
}) {
  const commit = (text: string) => {
    if (typeof value === "number") {
      const n = Number(text.replace(/[,\s]/g, ""));
      if (text.trim() !== "" && Number.isFinite(n)) onChange(n);
      return;
    }
    onChange(text.trim());
  };
  return (
    <Tag
      // Keyed on the value, so the browser's own text is replaced when it changes from elsewhere.
      key={String(value)}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      className={`edit-text ${className ?? ""}`}
      style={{ ...style, ...editStyle }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.textContent = String(value);
          e.currentTarget.blur();
        }
      }}
      onBlur={(e: React.FocusEvent<HTMLElement>) => commit(e.currentTarget.innerText)}
    >
      {String(value)}
    </Tag>
  );
}

/**
 * A bit of the data's text at `at`. Numbers show through `format` and are
 * typed in plain. With `optional`, an empty one shows only while editing.
 */
export function T({
  at,
  format,
  as: Tag = "span",
  className,
  style,
  placeholder = "Type here",
  optional = false,
}: {
  at: Path;
  format?: (v: never) => ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  optional?: boolean;
}) {
  const { editing, data, change } = useEdit();
  const raw = getIn(data, at);
  const value = typeof raw === "number" ? raw : raw == null ? "" : String(raw);
  if (editing) {
    return <TextField value={value} onChange={(v) => change((d) => setIn(d, at, v))} as={Tag} className={className} style={style} placeholder={placeholder} />;
  }
  if (optional && value === "") return null;
  return (
    <Tag className={className} style={style}>
      {format ? format(value as never) : value}
    </Tag>
  );
}

/**
 * The page's own words, under `k` in `copy`: `d` until someone rewrites it.
 * With `optional`, it starts empty and shows only once written (or while
 * editing, as a place to write).
 */
export function C({
  k,
  d = "",
  as: Tag = "span",
  className,
  style,
  optional = false,
  placeholder,
}: {
  k: string;
  d?: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  optional?: boolean;
  placeholder?: string;
}) {
  const { editing, data, change } = useEdit();
  const value = data.copy?.[k] ?? d;
  if (editing) {
    return (
      <TextField
        value={value}
        as={Tag}
        className={className}
        style={style}
        placeholder={placeholder ?? (optional ? "Add some words here, or leave it empty" : "Type here")}
        onChange={(v) =>
          change((doc) => {
            const copy = { ...doc.copy };
            if (v === d) delete copy[k];
            else copy[k] = String(v);
            return { ...doc, copy };
          })
        }
      />
    );
  }
  if (optional && value === "") return null;
  return (
    <Tag className={className} style={style}>
      {value}
    </Tag>
  );
}

/** Move, remove: for item `i` of the list at `at`, while editing. Place it in a `relative` item. */
export function ItemTools({ at, i }: { at: Path; i: number }) {
  const { editing, data, change } = useEdit();
  if (!editing) return null;
  const list = (getIn(data, at) as unknown[]) ?? [];
  const move = (to: number) =>
    change((d) => {
      const next = [...list];
      [next[i], next[to]] = [next[to], next[i]];
      return setIn(d, at, next);
    });
  return (
    <span className="absolute -top-3 right-2 z-10 flex gap-1" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="cozy-chip" disabled={i === 0} onClick={() => move(i - 1)} aria-label="Move up" title="Move up">
        ↑
      </button>
      <button type="button" className="cozy-chip" disabled={i === list.length - 1} onClick={() => move(i + 1)} aria-label="Move down" title="Move down">
        ↓
      </button>
      <button
        type="button"
        className="cozy-chip coral"
        onClick={() => change((d) => setIn(d, at, list.filter((_, j) => j !== i)))}
        aria-label="Remove"
        title="Remove"
      >
        ✕
      </button>
    </span>
  );
}

/** Add an item to the end of the list at `at`: a blank copy of its last one, or `template`. */
export function AddItem({ at, label, template }: { at: Path; label: string; template?: unknown }) {
  const { editing, data, change } = useEdit();
  if (!editing) return null;
  const list = (getIn(data, at) as unknown[] | undefined) ?? [];
  const item = list.length > 0 ? blank(list[list.length - 1]) : template;
  if (item === undefined) return null;
  return (
    <button type="button" className="cozy-btn mt-2" onClick={() => change((d) => setIn(d, at, [...list, item]))}>
      + {label}
    </button>
  );
}

/** While editing, the name of an emote shown as a picture, to change it. */
export function EmoteName({ at }: { at: Path }) {
  const { editing } = useEdit();
  if (!editing) return null;
  return <T at={at} className="text-xs font-bold" style={{ color: "var(--muted)" }} placeholder="Emote name" />;
}

/** Add a section of cards of your own, after the built ones. */
export function AddSection() {
  const { editing, change } = useEdit();
  if (!editing) return null;
  return (
    <button
      type="button"
      className="cozy-btn"
      onClick={() =>
        change((d) => ({
          ...d,
          extra: [
            ...(d.extra ?? []),
            {
              id: `extra-${Date.now().toString(36)}`,
              title: "A new section",
              emote: "PepoG",
              intro: "",
              cards: [{ emote: "PepoG", big: "", title: "", text: "" }],
            },
          ],
        }))
      }
    >
      + Add a section
    </button>
  );
}

/** A list of words at `at`, shown and typed as "a, b, c". */
export function WordList({ at, className }: { at: Path; className?: string }) {
  const { editing, data, change } = useEdit();
  const list = ((getIn(data, at) as string[] | undefined) ?? []).join(", ");
  if (!editing) return <span className={className}>{list}</span>;
  return (
    <TextField
      value={list}
      className={className}
      onChange={(v) =>
        change((d) =>
          setIn(
            d,
            at,
            String(v)
              .split(",")
              .map((w) => w.trim())
              .filter(Boolean),
          ),
        )
      }
    />
  );
}

/** What's at `at` in the page as shown (the draft while editing). */
export const useReviewAt = (at: Path) => getIn(useEdit().data, at);
