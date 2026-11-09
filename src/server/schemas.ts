// Request schemas. Each one is the single definition of what a route accepts:
// the server validates with it and the client's request types come from it.
import { z } from "zod";
import { linkTypes } from "@/lib/links";
import { votingStyles } from "@/lib/voting";
import type { ImportableData, ViewingMode } from "@/lib/types";

const required = z.string().min(1);
const renderType = z.enum(["default", "compact"]);

export const viewingModes = ["idle", "locked", "reviewing", "voting"] as const;
viewingModes satisfies readonly ViewingMode[];

/**
 * A ballot. Single-pick categories take `nominee_id` (the 2025 shape);
 * ranked ones take `ranking`, best first. Which one a category needs is
 * checked against its voting style in the route.
 */
export const voteSubmit = z.union([
  z.object({ category_id: required, nominee_id: required }),
  z.object({ category_id: required, ranking: z.array(required).min(1).max(100) }),
]);

export const settingsPatch = z.object({
  awardYear: z.number().int().min(2000).max(2100).optional(),
  defaultVotingStyle: z.enum(votingStyles).optional(),
});

// Admin forms are plain HTML <form> posts, so every field arrives as a string.
/** An optional form field: blank means not given. */
const blankable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

export const categoryForm = z.object({
  category_id: required,
  category_title: required,
  category_description: required,
  voting_style: blankable(z.enum(votingStyles)),
});

// Nominee details added after 2025. The schemas check shape only; whether the
// data is good (right year, specific link…) is src/lib/nominee-checks.ts.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const seconds = z.number().int().min(0);
const nomineeDetails = {
  date: isoDate.nullable().optional(),
  linkType: z.enum(linkTypes).nullable().optional(),
  clipStart: seconds.nullable().optional(),
  clipEnd: seconds.nullable().optional(),
};

export const nomineeForm = z.object({
  nominee_id: required,
  category_id: required,
  nominee_title: required,
  nominee_description: required,
  url: required,
  image_id: z.string().optional(),
  video_id: z.string().optional(),
  date: blankable(isoDate),
  link_type: blankable(z.enum(linkTypes)),
  clip_start: blankable(z.coerce.number().pipe(seconds)),
  clip_end: blankable(z.coerce.number().pipe(seconds)),
});

/** Unix seconds; parsed the way parseInt always did ("12abc" is 12). */
const unixSeconds = required
  .transform((s) => parseInt(s))
  .refine((n) => !Number.isNaN(n));

export const configForm = z.object({
  starting_time: unixSeconds,
  ending_time: unixSeconds,
  viewing_config: z.enum(viewingModes),
});

export const categoryPatch = z.object({
  id: required,
  title: z.string().optional(),
  description: z.string().optional(),
  /** null: follow the site default. */
  votingStyle: z.enum(votingStyles).nullable().optional(),
});

export const nomineePatch = z.object({
  id: required,
  categoryId: required,
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.string().nullable().optional(),
  imageId: z.string().nullable().optional(),
  videoId: z.string().nullable().optional(),
  renderType: renderType.nullable().optional(),
  ...nomineeDetails,
});

export const userIdBody = z.number().int();

export const idQuery = z.object({ id: required });

export const nomineeQuery = z.object({ categoryId: required, id: required });

/** Which nominee (in a JSON body). */
export const nomineeRef = z.object({ categoryId: required, id: required });

export const thumbnailAt = nomineeRef.extend({ at: z.number().int().min(0) });

export const thumbnailUpload = z.object({
  categoryId: required,
  id: required,
  file: z.instanceof(File),
});

export const votesQuery = z.object({
  filter_ip: z.string().optional(),
  filter_uid: z.string().optional(),
  page: z.string().optional(),
});

export const importedData = z.array(
  z.object({
    id: required,
    title: z.string(),
    description: z.string(),
    votingStyle: z.enum(votingStyles).nullable().optional(),
    options: z.array(
      z.object({
        id: required,
        title: z.string(),
        description: z.string(),
        url: z.string().nullable(),
        imageId: z.string().nullable(),
        videoId: z.string().nullable(),
        renderType: renderType.nullable(),
        ...nomineeDetails,
      }),
    ),
  }),
) satisfies z.ZodType<ImportableData>;

/** The import form carries the data as one JSON string field. */
export const importForm = z.object({
  data: z.string().transform((raw, ctx) => {
    try {
      return importedData.parse(JSON.parse(raw));
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid import data" });
      return z.NEVER;
    }
  }),
});
