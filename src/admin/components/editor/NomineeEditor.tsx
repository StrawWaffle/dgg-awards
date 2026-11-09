import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Section } from "@/admin/components/Section";
import { DragHandle, SortableList, useSortableRow } from "@/admin/components/Sortable";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import { NomineeForm, useRefreshEditor } from "@/admin/components/editor/NomineeForm";
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

/**
 * The nominee editor: categories on the left with their problem counts, the
 * selected category's settings and nominees on the right. Problems come from
 * the server's checks (src/lib/nominee-checks.ts). Both lists reorder by drag.
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
  const reorder = useReorder();

  const categories = nominees.data ?? [];
  useEffect(() => {
    if (!selected && categories[0]) setSelected(categories[0].id);
  }, [selected, categories]);

  if (nominees.isPending) return <p className="p-4 text-sm">Loading…</p>;
  if (nominees.isError) return <ErrorText>Couldn't load the nominees: {nominees.error.message}</ErrorText>;

  const issuesFor = (categoryId: string) => (checks.data ?? []).filter((i) => i.categoryId === categoryId);
  const category = categories.find((c) => c.id === selected);

  return (
    <div className="flex min-h-[70vh] flex-col rounded border border-neutral-200 bg-white md:flex-row md:items-start">
      {/* Sticks while the nominees scroll, with its own scrollbar if long. */}
      <nav
        className="shrink-0 border-b border-neutral-200 md:sticky md:top-0 md:max-h-screen md:w-64 md:overflow-y-auto md:border-b-0"
        aria-label="Categories"
      >
        <SortableList ids={categories.map((c) => c.id)} onReorder={(ids) => reorder.mutate({ ids })}>
          <ul>
            {categories.map((c) => (
              <CategoryItem
                key={c.id}
                category={c}
                issues={issuesFor(c.id)}
                selected={c.id === selected}
                onSelect={() => setSelected(c.id)}
              />
            ))}
          </ul>
        </SortableList>
        <ErrorText>{reorder.error?.message}</ErrorText>
        <AddCategory taken={new Set(categories.map((c) => c.id))} onAdded={setSelected} />
      </nav>
      <div className="min-h-[70vh] min-w-0 flex-1 self-stretch p-4 md:border-l md:border-neutral-200">
        {category ? (
          <CategoryPanel key={category.id} category={category} issues={issuesFor(category.id)} />
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
  selected,
  onSelect,
}: {
  category: AdminCategory;
  issues: Issue[];
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
        className={clsx("min-w-0 flex-1 py-2 pr-3 pl-1 text-left text-sm", selected && "font-bold")}
      >
        <span className="block">{c.title}</span>
        <span className="block text-xs font-normal text-neutral-500">
          {errors > 0 && <span className="text-red-700">{errors} error{errors === 1 ? "" : "s"}</span>}
          {errors > 0 && issues.length > errors && " · "}
          {issues.length > errors && `${issues.length - errors} warning${issues.length - errors === 1 ? "" : "s"}`}
          {issues.length === 0 && "No problems"}
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

function CategoryPanel({ category, issues }: { category: AdminCategory; issues: Issue[] }) {
  const refresh = useRefreshEditor();
  const reorder = useReorder();
  const [title, setTitle] = useState(category.title);
  const [description, setDescription] = useState(category.description);
  const [style, setStyle] = useState<VotingStyle | "">(category.usesDefaultStyle ? "" : category.votingStyle);
  const [open, setOpen] = useState<string | null>(null);

  const savedStyle = category.usesDefaultStyle ? "" : category.votingStyle;
  const dirty = title !== category.title || description !== category.description || style !== savedStyle;

  const save = useMutation({
    mutationFn: () =>
      saveCategory({
        id: category.id,
        title: title.trim(),
        description: description.trim(),
        ...(style !== savedStyle ? { votingStyle: style || null } : {}),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => deleteCategory(category.id),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold">
        {category.title} <span className="font-normal text-neutral-500">({category.id})</span>
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
              hint={category.usesDefaultStyle ? `Site default is currently ${category.votingStyle}.` : undefined}
            >
              <select
                className={inputClass}
                value={style}
                onChange={(e) => setStyle(e.currentTarget.value as VotingStyle | "")}
              >
                <option value="">Site default</option>
                <option value="single">Single pick</option>
                <option value="ranked">Ranked (instant runoff)</option>
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
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={!dirty || save.isPending}>
              Save category
            </Button>
            <ErrorText>{save.error?.message}</ErrorText>
            <span className="grow" />
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(`Delete "${category.title}" with all its nominees and votes?`)) remove.mutate();
              }}
            >
              Delete category
            </Button>
          </div>
        </form>
      </Section>

      <section className="space-y-2 border-t border-neutral-200 pt-4">
        <h3 className="text-sm font-bold">Nominees ({category.options.length})</h3>
        <AddNominee
          categoryId={category.id}
          taken={new Set(category.options.map((o) => o.id))}
          onAdded={setOpen}
        />
        <ErrorText>{reorder.error?.message}</ErrorText>
        <SortableList
          ids={category.options.map((o) => o.id)}
          onReorder={(ids) => reorder.mutate({ categoryId: category.id, ids })}
        >
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
            {category.options.map((n) => (
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
        ) : (
          <div className="h-10 w-10 shrink-0 rounded bg-neutral-200" />
        )}
        <button type="button" className="min-w-0 flex-1 pl-1 text-left" aria-expanded={open} onClick={onToggle}>
          <span className="block truncate text-sm font-medium">{n.title}</span>
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
