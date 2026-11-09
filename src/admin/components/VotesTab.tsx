import { useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Cross1Icon,
  MagnifyingGlassIcon,
  ReloadIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import * as Tabs from "@radix-ui/react-tabs";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAllVotes } from "@/lib/queries";

export function VotesTab() {
  const [page, setPage] = useState(0);
  const [uidInput, setUidInput] = useState("");
  const [ipInput, setIpInput] = useState("");

  const [filters, setFilters] = useState<{ uid?: number; ip?: string }>({});

  const query = useQuery({
    queryKey: ["votes", page, filters],
    queryFn: () => fetchAllVotes(page, filters),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });

  const hasNextPage = (query.data?.length || 0) === 100;

  const handleSearch = () => {
    // Reset page to 0 when filtering
    setPage(0);
    setFilters({
      uid: uidInput ? parseInt(uidInput, 10) : undefined,
      ip: ipInput.trim() || undefined,
    });
  };

  const handleClear = () => {
    setUidInput("");
    setIpInput("");
    setPage(0);
    setFilters({});
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <Tabs.Content value="votes" className="space-y-4 pt-4 outline-none">
      <div className="flex flex-col gap-3 p-1 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="number"
            placeholder="Filter by UID..."
            value={uidInput}
            onChange={(e) => setUidInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 focus:outline-none"
          />
        </div>
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Filter by IP..."
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSearch}
            className="flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 focus:ring-2 focus:ring-neutral-500 focus:ring-offset-1 focus:outline-none"
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
            Search
          </button>
          {(filters.uid !== undefined || filters.ip !== undefined) && (
            <button
              onClick={handleClear}
              className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:ring-2 focus:ring-neutral-500 focus:ring-offset-1 focus:outline-none"
            >
              <Cross1Icon className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {query.status === "pending" && (
        <div className="flex h-40 items-center justify-center text-neutral-500">
          <ReloadIcon className="h-6 w-6 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {query.status === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-500">
          Error loading votes.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="flex justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-medium tracking-wider text-neutral-500 uppercase">
          <span>User / IP</span>
          <span>Decision</span>
        </div>

        <div className="divide-y divide-neutral-100">
          {query.data?.map((vote) => (
            <div
              key={`${vote.uid}-${vote.categoryId}`}
              className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-neutral-50"
            >
              <div className="flex flex-col">
                <span className="max-w-37.5 truncate font-medium text-neutral-900 sm:max-w-xs">
                  {vote.uid}
                </span>
                <span className="text-xs text-neutral-500">
                  {vote.sessionSnapshot.ip}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">
                <span>{vote.categoryId}</span>
                <span className="text-neutral-400">→</span>
                <span>{vote.optionId}</span>
              </div>
            </div>
          ))}

          {(!query.data || query.data.length === 0) && (
            <div className="p-8 text-center text-sm text-neutral-500">
              No votes found on this page.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-neutral-500">
          Page {page + 1}
          {query.isPlaceholderData && " (Loading...)"}
        </span>

        <div className="flex gap-2">
          <button
            onClick={() => setPage((old) => Math.max(0, old - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 focus:ring-2 focus:ring-neutral-400 focus:ring-offset-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Previous
          </button>

          <button
            onClick={() => {
              if (hasNextPage) {
                setPage((old) => old + 1);
              }
            }}
            disabled={!hasNextPage || query.isPlaceholderData}
            className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 focus:ring-2 focus:ring-neutral-400 focus:ring-offset-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Tabs.Content>
  );
}
