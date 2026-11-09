import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAuthSession,
  fetchNominees,
  fetchUserVotes,
} from "@/lib/queries";

const SUMMARY_CATEGORY_IDS = ["dgger", "ally", "antagonist", "brainlet"];
const SUMMARY_TITLE = "DGGA25 key votes";

type CopyState = "idle" | "copied" | "error";

export function VoteSummary() {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchAuthSession });
  const nomineesQuery = useQuery({
    queryKey: ["nominees"],
    queryFn: fetchNominees,
  });
  const userVotesQuery = useQuery({
    queryKey: ["userVotes"],
    queryFn: fetchUserVotes,
    staleTime: 1 * 60 * 1000,
    enabled: meQuery.status === "success",
  });

  const summary = useMemo(() => {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}`
        : "";

    if (!nomineesQuery.data || !userVotesQuery.data) {
      return {
        lines: [] as string[],
        text: "",
        preview: "Pick some nominees to build a share summary.",
      };
    }

    const categoriesById = new Map(
      nomineesQuery.data.map((category) => [category.id, category]),
    );
    const lines: string[] = [];

    for (const categoryId of SUMMARY_CATEGORY_IDS) {
      const category = categoriesById.get(categoryId);
      if (!category) continue;
      const optionId = userVotesQuery.data[categoryId];
      if (!optionId) continue;
      const optionTitle = category.options.find(
        (option) => option.id === optionId,
      )?.title;
      if (!optionTitle) continue;
      lines.push(`${category.title}: ${optionTitle}`);
    }

    const text =
      lines.length > 0
        ? [SUMMARY_TITLE, ...lines, shareUrl].filter(Boolean).join("\n")
        : "";
    const preview =
      lines.length > 0 ? text : "Pick some nominees to build a share summary.";

    return { lines, text, preview };
  }, [nomineesQuery.data, userVotesQuery.data]);

  if (meQuery.status !== "success") {
    return null;
  }

  if (nomineesQuery.status !== "success" || userVotesQuery.status !== "success") {
    return null;
  }

  // handle copying
  const canCopy = summary.text.length > 0;
  const buttonLabel =
    copyState === "copied"
      ? "Copied!"
      : copyState === "error"
        ? "Copy failed"
        : "Copy summary";

  const handleCopy = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(summary.text);
      setCopyState("copied");
    } catch (error) {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  };

  return (
    <div className="bg-black-1/60 border-blue-1/40 w-full max-w-md rounded-md border p-3 text-left shadow-sm">
      <p className="text-orange-1 text-sm font-bold">Share your key votes</p>
      <p className="text-xs opacity-70">
        Copy a short summary to share after voting.
      </p>
      <pre className="bg-black-1/80 mt-2 whitespace-pre-wrap rounded p-2 text-[11px] leading-snug font-mono text-white-1/90">
        {summary.preview}
      </pre>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!canCopy}
          className="bg-blue-1 text-white-1 rounded px-3 py-1 text-xs font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel}
        </button>
        {copyState === "error" && (
          <span className="text-red-300 text-[11px]">
            Clipboard unavailable.
          </span>
        )}
      </div>
    </div>
  );
}
