import { type ReactNode, useState } from "react";
import { Section } from "@/admin/components/Section";
import { Button, ErrorText, inputClass } from "@/admin/components/editor/fields";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type VoteFilter, fetchAllVotes, fetchVoteStats } from "@/lib/queries";

const number = new Intl.NumberFormat();
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

export function VotesTab() {
  const [filter, setFilter] = useState<VoteFilter>({});
  return (
    <div className="space-y-6">
      <Stats />
      <VoteList filter={filter} setFilter={setFilter} />
    </div>
  );
}

function Stats() {
  const stats = useQuery({ queryKey: ["vote-stats"], queryFn: fetchVoteStats, refetchInterval: 30000 });
  if (stats.isPending) return <p className="text-sm">Loading…</p>;
  if (stats.isError) return <ErrorText>Couldn't load the totals: {stats.error.message}</ErrorText>;
  const s = stats.data;
  const most = Math.max(1, ...s.categories.map((c) => c.ballots));

  return (
    <>
      <p className="text-sm">
        <b>{number.format(s.voters)}</b> voters cast <b>{number.format(s.ballots)}</b> ballots.{" "}
        <span className="text-neutral-600">{number.format(s.users)} people have signed in.</span>
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <Table id="categories" title="Ballots per category" head={["Category", "Ballots"]}>
          {s.categories.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-1.5">{c.title}</td>
              <td className="w-1/2 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-right tabular-nums">{number.format(c.ballots)}</span>
                  <span className="h-2 bg-neutral-400" style={{ width: `${(c.ballots / most) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </Table>
        <div className="space-y-6">
          <Table id="days" title="Ballots per day (UTC)" head={["Day", "Voters", "Ballots"]}>
            {s.days.map((d) => (
              <tr key={d.day}>
                <td className="px-3 py-1.5">{d.day}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{number.format(d.voters)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{number.format(d.ballots)}</td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </>
  );
}

function Table({
  id,
  title,
  head,
  children,
  empty = "Nothing yet.",
}: {
  id: string;
  title: string;
  head: string[];
  children: ReactNode[];
  empty?: string;
}) {
  return (
    <Section id={`votes-${id}`} title={title} aside={children.length}>
      {children.length === 0 ? (
        <p className="px-3 py-3 text-sm text-neutral-600">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-600">
              {head.map((h, i) => (
                <th key={h} className={`px-3 py-1.5 font-medium ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">{children}</tbody>
        </table>
      )}
    </Section>
  );
}

function VoteList({ filter, setFilter }: { filter: VoteFilter; setFilter: (f: VoteFilter) => void }) {
  const [page, setPage] = useState(0);
  const [user, setUser] = useState("");
  const [shown, setShown] = useState(filter);
  // A click on a voter replaces the filter; keep the input in step.
  if (shown !== filter) {
    setShown(filter);
    setUser(filter.name ?? filter.uid?.toString() ?? "");
    setPage(0);
  }

  const votes = useQuery({
    queryKey: ["votes", page, filter],
    queryFn: () => fetchAllVotes(page, filter),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });
  const hasNext = votes.data?.length === 100;
  const filtered = Object.values(filter).some((v) => v !== undefined);

  const apply = (f: VoteFilter) => setFilter(f);
  const submit = () => {
    const u = user.trim();
    apply({
      ...(u ? (/^-?\d+$/.test(u) ? { uid: Number(u) } : { name: u }) : {}),
    });
  };

  return (
    <Section id="votes-list" title="All votes" aside={`page ${page + 1}`}>
      <div className="space-y-3 p-3">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <span className="mr-auto" />
          <input
            className={`${inputClass} w-48!`}
            placeholder="Voter name or uid"
            aria-label="Voter name or uid"
            value={user}
            onChange={(e) => setUser(e.currentTarget.value)}
          />
          <Button type="submit">Filter</Button>
          {filtered && <Button onClick={() => apply({})}>Clear</Button>}
        </form>

        {votes.isError && <ErrorText>Couldn't load the votes: {votes.error.message}</ErrorText>}

        <div className="overflow-x-auto rounded border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-600">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Voter</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Nominee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {votes.data?.map((v) => (
                <tr key={`${v.uid}-${v.categoryId}-${v.optionId}`} className="hover:bg-neutral-50">
                  <td className="px-3 py-1.5 whitespace-nowrap text-neutral-600">{dateTime.format(new Date(v.at))}</td>
                  <td className="px-3 py-1.5">
                    <button type="button" className="hover:underline" onClick={() => apply({ uid: v.uid })}>
                      {v.name}
                    </button>
                  </td>
                  <td className="px-3 py-1.5">{v.categoryTitle}</td>
                  <td className="px-3 py-1.5">
                    {v.optionTitle ?? v.optionId}
                    {v.rank > 1 && <span className="text-neutral-500"> (choice {v.rank})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {votes.data?.length === 0 && <p className="p-6 text-center text-sm text-neutral-600">No votes found.</p>}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-600">
            Page {page + 1}
            {votes.isPlaceholderData && " (loading…)"}
          </span>
          <div className="flex gap-2">
            <Button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              Previous
            </Button>
            <Button onClick={() => setPage((p) => p + 1)} disabled={!hasNext || votes.isPlaceholderData}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
