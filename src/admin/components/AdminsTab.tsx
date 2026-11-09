import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import { type AdminUser, fetchAuthSession, fetchUsers, setAdmin } from "@/lib/queries";

/** Who can use this page: the current admins, and a search to add more. */
export function AdminsTab() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchAuthSession });
  const admins = useQuery({ queryKey: ["users"], queryFn: () => fetchUsers() });
  const [q, setQ] = useState("");
  const search = useQuery({
    queryKey: ["users", q.trim()],
    queryFn: () => fetchUsers(q.trim()),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });
  const change = useMutation({
    mutationFn: ({ uid, admin }: { uid: number; admin: boolean }) => setAdmin(uid, admin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-bold">
          Admins ({admins.data?.length ?? "…"})
        </h2>
        <ul className="divide-y divide-neutral-100">
          {admins.data?.map((u) => (
            <li key={u.uid} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="font-medium">{u.name}</span>
              <span className="text-xs text-neutral-500">uid {u.uid}</span>
              <span className="grow" />
              {u.fromEnv ? (
                <span className="text-xs text-neutral-500">Set in ADMIN_USERNAMES</span>
              ) : u.uid === me.data?.uid ? (
                <span className="text-xs text-neutral-500">You</span>
              ) : (
                <Button
                  variant="danger"
                  disabled={change.isPending}
                  onClick={() => {
                    if (confirm(`Remove ${u.name} as admin?`)) change.mutate({ uid: u.uid, admin: false });
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500">
          People listed in ADMIN_USERNAMES (in the server's .env) become admin every time they sign in, so they can
          only be removed there.
        </p>
      </section>

      <section className="space-y-3 rounded border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-bold">Add an admin</h2>
        <Field label="destiny.gg name" hint="They have to have signed in to this site once.">
          <input className={inputClass} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
        </Field>
        {q.trim() && search.data && (
          <SearchResults users={search.data} busy={change.isPending} onAdd={(uid) => change.mutate({ uid, admin: true })} />
        )}
        <ErrorText>{change.error?.message}</ErrorText>
      </section>
    </div>
  );
}

function SearchResults({ users, busy, onAdd }: { users: AdminUser[]; busy: boolean; onAdd: (uid: number) => void }) {
  if (users.length === 0) return <p className="text-sm text-neutral-600">Nobody with that name has signed in.</p>;
  return (
    <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
      {users.map((u) => (
        <li key={u.uid} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span>{u.name}</span>
          <span className="text-xs text-neutral-500">uid {u.uid}</span>
          <span className="grow" />
          {u.admin ? (
            <span className="text-xs text-neutral-500">Admin</span>
          ) : (
            <Button disabled={busy} onClick={() => onAdd(u.uid)}>
              Make admin
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
