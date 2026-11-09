// Checks that score the nominee data. Each one comes from a problem on the
// 2025 awards stream (see docs/handoff.md, "Backlog"). Errors should block
// voting from opening; warnings are for an admin to look at.
import {
  type LinkType,
  bareLinkTypes,
  classifyLink,
  linkLabel,
  longVideoTypes,
  videoLinkTypes,
} from "@/lib/links";

/** Clips longer than this get a warning ("every clip is a minute long"). */
export const MAX_CLIP_SECONDS = 60;

export type NomineeInput = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  imageId: string | null;
  videoId: string | null;
  date?: string | null;
  linkType?: LinkType | null;
  clipStart?: number | null;
  clipEnd?: number | null;
};

export type CategoryInput = {
  id: string;
  title: string;
  options: NomineeInput[];
};

export type IssueCode =
  | "bare-link"
  | "whole-video"
  | "unrecognized-link"
  | "missing-media"
  | "missing-date"
  | "invalid-date"
  | "wrong-year"
  | "clip-range"
  | "clip-without-end"
  | "clip-not-video"
  | "long-clip"
  | "missing-description"
  | "duplicate-title";

export type Issue = {
  code: IssueCode;
  severity: "error" | "warning";
  categoryId: string;
  nomineeId: string;
  message: string;
};

const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Lowercase words, without anything in parentheses or punctuation. */
function titleWords(title: string) {
  return new Set(
    title
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

/**
 * Share of the shorter title's words found in the other. Titles under three
 * words are names (people, emotes), and the same person in several person
 * categories is normal, so they never match. The 2025 problem was the same
 * moment ("Destiny Uses his Premonition Powers") in two categories.
 */
function similarity(a: Set<string>, b: Set<string>) {
  const small = a.size <= b.size ? a : b;
  const large = small === a ? b : a;
  if (small.size < 3) return 0;
  let shared = 0;
  for (const w of small) if (large.has(w)) shared++;
  return shared / small.size;
}

export function checkNominee(
  category: Pick<CategoryInput, "id">,
  n: NomineeInput,
  year: number | undefined,
): Issue[] {
  const issues: Issue[] = [];
  const add = (code: IssueCode, severity: Issue["severity"], message: string) =>
    issues.push({ code, severity, categoryId: category.id, nomineeId: n.id, message });

  const link = n.url ? classifyLink(n.url) : undefined;
  const type = n.linkType ?? link?.type;
  const start = n.clipStart ?? link?.start;

  if (type && bareLinkTypes.has(type)) {
    add("bare-link", "error", `Links to a whole ${linkLabel(type)}, not the moment itself.`);
  }
  if (type && longVideoTypes.has(type) && start === undefined) {
    add("whole-video", "warning", "Links to a whole video without a start time.");
  }
  if (type === "web") {
    add("unrecognized-link", "warning", "Unrecognized link. Check what it points to and set its type.");
  }

  if (!n.imageId && !n.videoId && n.clipStart == null) {
    add("missing-media", "error", "No image, video or clip.");
  }

  if (!n.date) {
    add("missing-date", "warning", "No date. Add when it happened, so viewers know it's from this year.");
  } else {
    const m = n.date.match(isoDate);
    if (!m || Number.isNaN(Date.parse(n.date))) {
      add("invalid-date", "error", `Date "${n.date}" isn't YYYY-MM-DD.`);
    } else if (year !== undefined && Number(m[1]) !== year) {
      add("wrong-year", "error", `Dated ${n.date}, outside ${year}.`);
    }
  }

  if (n.clipStart != null || n.clipEnd != null) {
    if (type && !videoLinkTypes.has(type)) {
      add("clip-not-video", "error", `Has clip times, but the link is a ${linkLabel(type)}.`);
    }
    if (n.clipStart != null && n.clipEnd == null) {
      add("clip-without-end", "warning", "Clip has a start but no end.");
    } else if (n.clipStart == null || n.clipEnd == null || n.clipEnd <= n.clipStart || n.clipStart < 0) {
      add("clip-range", "error", "Clip end must come after its start.");
    } else if (n.clipEnd - n.clipStart > MAX_CLIP_SECONDS) {
      add(
        "long-clip",
        "warning",
        `Clip is ${n.clipEnd - n.clipStart}s long; keep clips under ${MAX_CLIP_SECONDS}s.`,
      );
    }
  }

  if (!n.description.trim()) {
    add("missing-description", "warning", "No description. Say what this is and why it's nominated.");
  }

  return issues;
}

/** Near-identical titles anywhere in the awards (see `similarity`). */
export function duplicateTitles(categories: CategoryInput[]): Issue[] {
  const all = categories.flatMap((c) =>
    c.options.map((o) => ({ c, o, words: titleWords(o.title) })),
  );
  const issues: Issue[] = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!;
      const b = all[j]!;
      if (similarity(a.words, b.words) < 0.8) continue;
      for (const [x, y] of [[a, b], [b, a]] as const) {
        issues.push({
          code: "duplicate-title",
          severity: "warning",
          categoryId: x.c.id,
          nomineeId: x.o.id,
          message: `Title is nearly the same as "${y.o.title}" in ${y.c.title}.`,
        });
      }
    }
  }
  return issues;
}

/** Every issue in the awards. `year` is the award year, if set. */
export function checkAwards(categories: CategoryInput[], year?: number): Issue[] {
  return [
    ...categories.flatMap((c) => c.options.flatMap((o) => checkNominee(c, o, year))),
    ...duplicateTitles(categories),
  ];
}
