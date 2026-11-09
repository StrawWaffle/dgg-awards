import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import { NomineeForm, useRefreshEditor } from "@/admin/components/editor/NomineeForm";
import { slugify, uniqueId } from "@/lib/ids";
import type { VotingStyle } from "@/lib/voting";
import {
  type AdminCategory,
  type Issue,
  createCategory,
  createNominee,
  deleteCategory,
  fetchAdminNom,
  fetchChecks,
  saveCategory,
} from "@/lib/queries";

/**
 * The nominee editor: categories on the left with their problem counts, the
 * selected category's settings and nominees on the right. Problems come from
 * the server's checks (src/lib/nominee-checks.ts).
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

  const categories = nominees.data ?? [];
  useEffect(() => {
    if (!selected && categories[0]) setSelected(categories[0].id);
  }, [selected, categories]);

  if (nominees.isPending) return <p className="p-4 text-sm">Loading…</p>;
  if (nominees.isError) return <ErrorText>Couldn't load the nominees: {nominees.error.message}</ErrorText>;

  const issuesFor = (categoryId: string) => (checks.data ?? []).filter((i) => i.categoryId === categoryId);
  const category = categories.find((c) => c.id === selected);

  return (
    <div className="flex min-h-[70vh] flex-col rounded border border-neutral-200 bg-white md:flex-row">
      <nav
        className="shrink-0 border-b border-neutral-200 md:w-64 md:border-r md:border-b-0"
        aria-label="Categories"
      >
        <ul>
          {categories.map((c) => {
            const issues = issuesFor(c.id);
            const errors = issues.filter((i) => i.severity === "error").length;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={clsx(
                    "block w-full border-b border-l-2 border-b-neutral-100 px-3 py-2 text-left text-sm hover:bg-neutral-50",
                    c.id === selected ? "border-l-emerald-700 bg-neutral-100 font-bold" : "border-l-transparent",
                  )}
                >
                  <span className="block">{c.title}</span>
                  <span className="block text-xs font-normal text-neutral-500">
                    {errors > 0 && <span className="text-red-700">{errors} error{errors === 1 ? "" : "s"}</span>}
                    {errors > 0 && issues.length > errors && " · "}
                    {issues.length > errors &&
                      `${issues.length - errors} warning${issues.length - errors === 1 ? "" : "s"}`}
                    {issues.length === 0 && "No problems"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <AddCategory taken={new Set(categories.map((c) => c.id))} onAdded={setSelected} />
      </nav>
      <div className="min-w-0 flex-1 p-4">
        {category ? (
          <CategoryPanel key={category.id} category={category} issues={issuesFor(category.id)} />
        ) : (
          <p className="text-sm text-neutral-600">No categories yet. Add the first one under the list.</p>
        )}
      </div>
    </div>
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
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="text-base font-bold">
          {category.title} <span className="font-normal text-neutral-500">({category.id})</span>
        </h2>
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
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
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

      <section className="space-y-2">
        <h3 className="text-sm font-bold">
          Nominees ({category.options.length})
        </h3>
        <AddNominee
          categoryId={category.id}
          taken={new Set(category.options.map((o) => o.id))}
          onAdded={setOpen}
        />
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
          {category.options.map((n) => {
            const mine = issues.filter((i) => i.nomineeId === n.id);
            const errors = mine.filter((i) => i.severity === "error").length;
            const isOpen = open === n.id;
            const image = n.thumbnailUrl ?? (n.imageId ? `/Media/${n.imageId}` : null);
            return (
              <li key={n.id}>
                <div className="flex items-center gap-3 px-3 py-2">
                  {image ? (
                    <img src={image} alt="" className="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded bg-neutral-200" />
                  )}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : n.id)}
                  >
                    <span className="block truncate text-sm font-medium">{n.title}</span>
                    <span className="block text-xs text-neutral-600">
                      {errors > 0 && <span className="text-red-700">{errors} error{errors > 1 && "s"} </span>}
                      {mine.length - errors > 0 && `${mine.length - errors} warning${mine.length - errors > 1 ? "s" : ""} `}
                      {mine.length === 0 && "No problems "}
                      {n.clipStatus && `· clip ${n.clipStatus}`}
                    </span>
                  </button>
                  <Button onClick={() => setOpen(isOpen ? null : n.id)}>{isOpen ? "Close" : "Edit"}</Button>
                </div>
                {isOpen && (
                  <div className="border-t border-neutral-200 bg-neutral-50 p-4">
                    <NomineeForm nominee={n} issues={mine} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
