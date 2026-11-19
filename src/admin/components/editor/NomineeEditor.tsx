import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Section } from "@/admin/components/Section";
import { AnnouncerVideo } from "@/admin/components/editor/AnnouncerVideo";
import { HistoryList } from "@/admin/components/history/HistoryList";
import { DragHandle, SortableList, useSortableRow } from "@/admin/components/Sortable";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import { NomineeForm, useRefreshEditor } from "@/admin/components/editor/NomineeForm";
import { Emote } from "@/lab/Emote";
import { slugify, uniqueId } from "@/lib/ids";
import type { VotingStyle } from "@/lib/voting";
import {
  type AdminCategory,
  type AdminNominee,
  type Issue,
  createCategory,
  createNominee,
  deleteCategory,
  fetchAdminNom,
  fetchChecks,
  saveCategory,
  saveCategoryOrder,
  saveNomineeOrder,
} from "@/lib/queries";

type Show = "all" | "errors" | "problems";

/**
 * Put a reordered part of a list back into the whole: the shown items take
 * the shown items' places, in their new order; hidden ones stay put. So
 * dragging works while a search or filter hides some rows.
 */
function mergeOrder(all: string[], shownInOrder: string[]) {
  const shown = new Set(shownInOrder);
  const next = shownInOrder[Symbol.iterator]();
  return all.map((id) => (shown.has(id) ? next.next().value! : id));
}

/**
 * The nominee editor: categories on the left with their problem counts, the
 * selected category's settings and nominees on the right. Problems come from
 * the server's checks (src/lib/nominee-checks.ts). Both lists reorder by drag.
 * Above the categories, a search (names, descriptions, ids, list numbers, in
 * every award) and a filter for nominees with problems narrow both lists.
 */
export function NomineeEditor() {
  const nominees = useQuery({
    queryKey: ["admin-nominees"],
    queryFn: fetchAdminNom,
    // Poll while a clip is being built, so its status updates by itself.
    refetchInterval: (q) =>
      q.state.data?.some((c) =>
        c.options.some((o) => o.clipStatus === "pending" || o.clipStatus === "processing"),
      )
        ? 2000
        : false,
  });
  const checks = useQuery({ queryKey: ["checks"], queryFn: fetchChecks });
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const reorder = useReorder();

  const categories = nominees.data ?? [];
  const issues = checks.data ?? [];
  const issuesFor = (categoryId: string) => issues.filter((i) => i.categoryId === categoryId);

  // What the search and filter leave: per category, the nominees shown.
  const words = query.trim().toLowerCase();
  const filtering = words !== "" || show !== "all";
  const fits = (c: AdminCategory, n: AdminNominee) => {
    if (show !== "all") {
      const own = issues.filter((i) => i.categoryId === c.id && i.nomineeId === n.id);
      if (show === "errors" ? !own.some((i) => i.severity === "error") : own.length === 0) return false;
    }
    if (!words) return true;
    const text = [n.title, n.description, n.id, n.listNumber != null ? `#${n.listNumber}` : ""].join(" ").toLowerCase();
    return text.includes(words);
  };
  const shownIn = new Map(categories.map((c) => [c.id, filtering ? c.options.filter((n) => fits(c, n)) : c.options]));
  const listed = filtering ? categories.filter((c) => shownIn.get(c.id)!.length > 0) : categories;

  // Keep a category selected, and one that the filter shows.
  useEffect(() => {
    if (listed.length && !listed.some((c) => c.id === selected)) setSelected(listed[0]!.id);
  }, [selected, listed]);

  if (nominees.isPending) return <p className="p-4 text-sm">Loading…</p>;
  if (nominees.isError) return <ErrorText>Couldn't load the nominees: {nominees.error.message}</ErrorText>;

  const category = listed.find((c) => c.id === selected);
  const errors = issues.filter((i) => i.severity === "error").length;
  const shownCount = [...shownIn.values()].reduce((n, l) => n + l.length, 0);

  return (
    // On wide screens the editor is exactly the window's height (less the
    // page padding, 3rem) and each side scrolls by itself, so the page never
    // does. A sticky, screen-tall list inside a padded page left a few pixels
    // of page scroll that cut off its top or bottom (Firefox showed it).
    <div className="flex min-h-[70vh] flex-col rounded border border-neutral-200 bg-white md:h-[calc(100dvh-3rem)] md:min-h-0 md:flex-row md:overflow-hidden">
      <nav
        className="shrink-0 border-b border-neutral-200 md:w-64 md:overflow-y-auto md:overscroll-contain md:border-b-0"
        aria-label="Categories"
      >
        <div className="space-y-2 border-b border-neutral-200 p-3">
          <input
            type="search"
            className={inputClass}
            value={query}
            placeholder="Find a nominee"
            aria-label="Find a nominee, in every category"
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          <select
            className={inputClass}
            value={show}
            aria-label="Which nominees to show"
            onChange={(e) => setShow(e.currentTarget.value as Show)}
          >
            <option value="all">All nominees</option>
            <option value="errors">Nominees with errors</option>
            <option value="problems">Nominees with errors or warnings</option>
          </select>
          <p className="text-xs text-neutral-600">
            {filtering
              ? `${shownCount} nominee${shownCount === 1 ? "" : "s"} in ${listed.length} categor${listed.length === 1 ? "y" : "ies"}`
              : checks.data && (
                  <>
                    In all: {errors > 0 && <span className="text-red-700">{errors} error{errors === 1 ? "" : "s"} · </span>}
                    {issues.length - errors} warning{issues.length - errors === 1 ? "" : "s"}
                  </>
                )}
          </p>
        </div>
        <SortableList
          ids={listed.map((c) => c.id)}
          onReorder={(ids) => reorder.mutate({ ids: mergeOrder(categories.map((c) => c.id), ids) })}
        >
          <ul>
            {listed.map((c) => (
              <CategoryItem
                key={c.id}
                category={c}
                issues={issuesFor(c.id)}
                shown={filtering ? shownIn.get(c.id)!.length : undefined}
                selected={c.id === selected}
                onSelect={() => setSelected(c.id)}
              />
            ))}
          </ul>
        </SortableList>
        {filtering && listed.length === 0 && <p className="p-3 text-sm text-neutral-600">No nominees match.</p>}
        <ErrorText>{reorder.error?.message}</ErrorText>
        <AddCategory taken={new Set(categories.map((c) => c.id))} onAdded={setSelected} />
      </nav>
      <div className="min-w-0 flex-1 p-4 md:overflow-y-auto md:overscroll-contain md:border-l md:border-neutral-200">
        {category ? (
          <CategoryPanel
            key={category.id}
            category={category}
            issues={issuesFor(category.id)}
            shown={filtering ? shownIn.get(category.id)! : undefined}
            openFirst={filtering && shownIn.get(category.id)!.length === 1}
          />
        ) : filtering ? (
          <p className="text-sm text-neutral-600">No nominees match. Clear the search or show all nominees.</p>
        ) : (
          <p className="text-sm text-neutral-600">No categories yet. Add the first one under the list.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Save a new order, showing it straight away. `categoryId` set: that
 * category's nominees; otherwise the categories.
 */
function useReorder() {
  const queryClient = useQueryClient();
  const refresh = useRefreshEditor();
  return useMutation({
    mutationFn: ({ categoryId, ids }: { categoryId?: string; ids: string[] }) =>
      categoryId ? saveNomineeOrder(categoryId, ids) : saveCategoryOrder(ids),
    onMutate: async ({ categoryId, ids }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-nominees"] });
      queryClient.setQueryData<AdminCategory[]>(["admin-nominees"], (old) => {
        if (!old) return old;
        const inOrder = <T extends { id: string }>(items: T[]) =>
          ids.map((id) => items.find((x) => x.id === id)).filter((x): x is T => !!x);
        return categoryId
          ? old.map((c) => (c.id === categoryId ? { ...c, options: inOrder(c.options) } : c))
          : inOrder(old);
      });
    },
    onSettled: refresh,
  });
}

function CategoryItem({
  category: c,
  issues,
  shown,
  selected,
  onSelect,
}: {
  category: AdminCategory;
  issues: Issue[];
  /** While searching or filtering: how many of its nominees are shown. */
  shown?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const row = useSortableRow(c.id);
  const errors = issues.filter((i) => i.severity === "error").length;
  return (
    <li
      ref={row.ref}
      style={row.style}
      className={clsx(
        "flex items-start border-b border-l-2 border-b-neutral-100 pl-1 hover:bg-neutral-50",
        selected ? "border-l-emerald-700 bg-neutral-100" : "border-l-transparent bg-white",
        row.isDragging && "shadow-md",
      )}
    >
      <span className="pt-2">
        <DragHandle label={`Move ${c.title}`} {...row.handle} />
      </span>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className={clsx(
          "min-w-0 flex-1 py-2 pr-3 pl-1 text-left text-sm",
          selected && "font-bold",
          c.hidden && "text-neutral-500 line-through decoration-neutral-400",
        )}
      >
        <span className="block">{c.title}</span>
        <span className="block text-xs font-normal text-neutral-500">
          {errors > 0 && <span className="text-red-700">{errors} error{errors === 1 ? "" : "s"}</span>}
          {errors > 0 && issues.length > errors && " · "}
          {issues.length > errors && `${issues.length - errors} warning${issues.length - errors === 1 ? "" : "s"}`}
          {issues.length === 0 && "No problems"}
          {c.hidden && " · hidden"}
          {shown !== undefined && <span className="text-neutral-700"> · {shown} shown</span>}
        </span>
      </button>
    </li>
  );
}

/** Title is all it takes; the rest is set in the category's form. */
function AddCategory({ taken, onAdded }: { taken: Set<string>; onAdded: (id: string) => void }) {
  const refresh = useRefreshEditor();
  const [title, setTitle] = useState("");
  const add = useMutation({
    mutationFn: () => createCategory({ title: title.trim() }),
    onSuccess: async ({ id }) => {
      await refresh();
      setTitle("");
      onAdded(id);
    },
  });
  const id = title.trim() ? uniqueId(slugify(title), taken) : null;

  return (
    <form
      className="space-y-2 border-t border-neutral-200 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <Field label="New category" hint={id ? `id: ${id}` : undefined}>
        <input
          className={inputClass}
          value={title}
          placeholder="e.g. Clip of the Year"
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
      </Field>
      <Button type="submit" disabled={!title.trim() || add.isPending}>
        Add category
      </Button>
      <ErrorText>{add.error?.message}</ErrorText>
    </form>
  );
}

/** Title (and optionally the link) to start; the full form opens after. */
function AddNominee({
  categoryId,
  taken,
  onAdded,
}: {
  categoryId: string;
  taken: Set<string>;
  onAdded: (id: string) => void;
}) {
  const refresh = useRefreshEditor();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const add = useMutation({
    mutationFn: () => createNominee({ categoryId, title: title.trim(), url: url.trim() || null }),
    onSuccess: async ({ id }) => {
      await refresh();
      setTitle("");
      setUrl("");
      onAdded(id);
    },
  });
  const id = title.trim() ? uniqueId(slugify(title), taken) : null;

  return (
    <form
      className="grid gap-3 rounded border border-neutral-200 p-3 md:grid-cols-[2fr_2fr_auto] md:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <Field label="New nominee" hint={id ? `id: ${id}` : undefined}>
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
      </Field>
      <Field label="Source link (optional)">
        <input
          className={inputClass}
          type="url"
          value={url}
          placeholder="https://"
          onChange={(e) => setUrl(e.currentTarget.value)}
        />
      </Field>
      <Button type="submit" disabled={!title.trim() || add.isPending} className="md:mb-5">
        Add nominee
      </Button>
      <div className="md:col-span-3">
        <ErrorText>{add.error?.message}</ErrorText>
      </div>
    </form>
  );
}

function CategoryPanel({
  category,
  issues,
  shown,
  openFirst,
}: {
  category: AdminCategory;
  issues: Issue[];
  /** While searching or filtering: the nominees to show. */
  shown?: AdminNominee[];
  /** Open the one nominee the search found. */
  openFirst?: boolean;
}) {
  const refresh = useRefreshEditor();
  const reorder = useReorder();
  const [title, setTitle] = useState(category.title);
  const [description, setDescription] = useState(category.description);
  const [style, setStyle] = useState<VotingStyle | "">(category.usesDefaultStyle ? "" : category.votingStyle);
  const [askDates, setAskDates] = useState(category.askDates);
  const [open, setOpen] = useState<string | null>(null);
  const options = shown ?? category.options;
  const only = openFirst ? options[0]?.id : undefined;
  useEffect(() => {
    if (only) setOpen(only);
  }, [only]);

  const savedStyle = category.usesDefaultStyle ? "" : category.votingStyle;
  const dirty =
    title !== category.title || description !== category.description || style !== savedStyle || askDates !== category.askDates;

  const save = useMutation({
    mutationFn: () =>
      saveCategory({
        id: category.id,
        title: title.trim(),
        description: description.trim(),
        ...(style !== savedStyle ? { votingStyle: style || null } : {}),
        ...(askDates !== category.askDates ? { askDates } : {}),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => deleteCategory(category.id),
    onSuccess: refresh,
  });
  const hide = useMutation({
    mutationFn: (hidden: boolean) => saveCategory({ id: category.id, hidden }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold">
        {category.title} <span className="font-normal text-neutral-500">({category.id})</span>
        {category.hidden && <span className="ml-2 text-sm font-normal text-neutral-500">· hidden from the site</span>}
      </h2>

      <Section id="category-settings" title="Category settings" boxed={false}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <Field label="Title">
              <input className={inputClass} value={title} required onChange={(e) => setTitle(e.currentTarget.value)} />
            </Field>
            <Field
              label="Voting style"
              hint={
                (style || category.votingStyle) === "points"
                  ? "Everyone ranks a top 10: 10 points for 1st down to 1 for 10th, shared by ties. Most points wins."
                  : category.usesDefaultStyle
                    ? `Site default is currently ${category.votingStyle}.`
                    : undefined
              }
            >
              <select
                className={inputClass}
                value={style}
                onChange={(e) => setStyle(e.currentTarget.value as VotingStyle | "")}
              >
                <option value="">Site default</option>
                <option value="single">Single pick</option>
                <option value="ranked">Ranked (instant runoff)</option>
                <option value="points">Top 10 by points</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <input
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={askDates}
              onChange={(e) => setAskDates(e.currentTarget.checked)}
            />
            <span>
              Ask for a date
              <span className="block text-xs text-neutral-500">
                Warns about nominees without one. Turn it off for awards about people, where a date means nothing.
                Dates that are filled in are still checked against the award year.
              </span>
            </span>
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={!dirty || save.isPending}>
              Save category
            </Button>
            <ErrorText>{save.error?.message}</ErrorText>
            <span className="grow" />
            <Button disabled={hide.isPending} onClick={() => hide.mutate(!category.hidden)}>
              {category.hidden ? "Show on the site" : "Hide from the site"}
            </Button>
            <Button
              variant="danger"
              disabled={remove.isPending || category.hasVotes}
              title={category.hasVotes ? "It has votes. Hide it instead, which keeps them." : undefined}
              onClick={() => {
                if (confirm(`Delete "${category.title}" and its nominees?`)) remove.mutate();
              }}
            >
              Delete category
            </Button>
          </div>
          <ErrorText>{hide.error?.message ?? remove.error?.message}</ErrorText>
          {category.hasVotes && (
            <p className="text-xs text-neutral-500">
              This category has votes, so it can be hidden but not deleted. Hiding takes it off the site and out of
              the results, and keeps its nominees and votes.
            </p>
          )}
        </form>
      </Section>

      <Section
        id="category-announcer"
        title="Announcer video"
        aside={category.announcerFileUrl || category.announcerUrl ? "Set" : "None"}
        defaultOpen={false}
        boxed={false}
      >
        <AnnouncerVideo key={category.id} category={category} />
      </Section>

      <Section id="category-history" title="History of this category" defaultOpen={false} boxed={false}>
        <div className="rounded border border-neutral-200">
          <HistoryList filter={{ categoryId: category.id }} />
        </div>
      </Section>

      <section className="space-y-2 border-t border-neutral-200 pt-4">
        <h3 className="text-sm font-bold">
          Nominees ({shown ? `${shown.length} of ${category.options.length} shown` : category.options.length})
        </h3>
        <AddNominee
          categoryId={category.id}
          taken={new Set(category.options.map((o) => o.id))}
          onAdded={setOpen}
        />
        <ErrorText>{reorder.error?.message}</ErrorText>
        <SortableList
          ids={options.map((o) => o.id)}
          onReorder={(ids) =>
            reorder.mutate({ categoryId: category.id, ids: mergeOrder(category.options.map((o) => o.id), ids) })
          }
        >
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
            {options.map((n) => (
              <NomineeRow
                key={n.id}
                nominee={n}
                issues={issues.filter((i) => i.nomineeId === n.id)}
                open={open === n.id}
                onToggle={() => setOpen(open === n.id ? null : n.id)}
              />
            ))}
          </ul>
        </SortableList>
      </section>
    </div>
  );
}

function NomineeRow({
  nominee: n,
  issues,
  open,
  onToggle,
}: {
  nominee: AdminNominee;
  issues: Issue[];
  open: boolean;
  onToggle: () => void;
}) {
  const row = useSortableRow(n.id);
  const errors = issues.filter((i) => i.severity === "error").length;
  const image = n.thumbnailUrl ?? (n.imageId ? `/Media/${n.imageId}` : null);
  return (
    <li ref={row.ref} style={row.style} className={clsx("bg-white", row.isDragging && "shadow-md")}>
      <div className="flex items-center gap-2 px-2 py-2">
        <DragHandle label={`Move ${n.title}`} {...row.handle} />
        {image ? (
          <img src={image} alt="" className="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" />
        ) : n.emote ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-100">
            <Emote name={n.emote} size={0.9} />
          </div>
        ) : (
          <div className="h-10 w-10 shrink-0 rounded bg-neutral-200" />
        )}
        <button type="button" className="min-w-0 flex-1 pl-1 text-left" aria-expanded={open} onClick={onToggle}>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-medium">{n.title}</span>
            {n.listNumber != null && (
              <span className="shrink-0 text-xs text-neutral-600" title="Its number on rinlux's list. Admins only.">
                #{n.listNumber} on the list
              </span>
            )}
          </span>
          <span className="block text-xs text-neutral-600">
            {errors > 0 && <span className="text-red-700">{errors} error{errors > 1 && "s"} </span>}
            {issues.length - errors > 0 &&
              `${issues.length - errors} warning${issues.length - errors > 1 ? "s" : ""} `}
            {issues.length === 0 && "No problems "}
            {n.clipStatus && `· clip ${n.clipStatus}`}
          </span>
        </button>
        <Button onClick={onToggle}>{open ? "Close" : "Edit"}</Button>
      </div>
      {open && (
        <div className="border-t border-neutral-200 bg-neutral-50 p-4">
          <NomineeForm nominee={n} issues={issues} />
        </div>
      )}
    </li>
  );
}
