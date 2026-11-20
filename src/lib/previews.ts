// The admins' previews of the public site: its pages as visitors see them at
// each stage of the year, under /preview/<stage>/<page>, and the lab at
// /preview/lab. Shared by the site's header and the admin page.

/**
 * The site's stages through the year. Voting comes in three (rinlux,
 * 2026-11-20): the first round (the DGGer wildcards), the second (the group
 * stage), then the main vote with the DGGer final. The rounds are taken in
 * award order (src/lib/rounds.ts), with or without dates.
 */
export type Stage = "before" | "wildcards" | "groups" | "voting" | "closed" | "results";
export const stages: { id: Stage; label: string }[] = [
  { id: "before", label: "Before voting" },
  { id: "wildcards", label: "Wildcards" },
  { id: "groups", label: "Group stage" },
  { id: "voting", label: "Final + awards" },
  { id: "closed", label: "Voting closed" },
  { id: "results", label: "Results out" },
];
/** The voting stages, and which round each previews (its place in award order; null for the main vote). */
export const votingStages: Partial<Record<Stage, number | null>> = { wildcards: 0, groups: 1, voting: null };

/** The pages a stage can be previewed on. */
export type StagePage = "home" | "vote" | "results" | "chat" | "chat-all" | "2025";
export const stagePages: { page: StagePage; label: string }[] = [
  { page: "home", label: "Front page" },
  { page: "vote", label: "Vote" },
  { page: "results", label: "Results" },
  { page: "chat", label: "Year in chat" },
  { page: "chat-all", label: "Year in chat: every number" },
  { page: "2025", label: "2025 results" },
];

/** A preview's address. */
export const previewPath = (page: StagePage | "lab", stage: Stage) =>
  page === "lab" ? "/preview/lab" : `/preview/${stage}${page === "home" ? "" : `/${page}`}`;
