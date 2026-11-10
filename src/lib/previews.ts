// The admins' previews of the public site: its pages as visitors see them at
// each stage of the year, under /preview/<stage>/<page>, and the lab at
// /preview/lab. Shared by the site's header and the admin page.

/** The site's stages through the year. */
export type Stage = "before" | "voting" | "closed" | "results";
export const stages: { id: Stage; label: string }[] = [
  { id: "before", label: "Before voting" },
  { id: "voting", label: "Voting open" },
  { id: "closed", label: "Voting closed" },
  { id: "results", label: "Results out" },
];

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
