// Request schemas. Each one is the single definition of what a route accepts:
// the server validates with it and the client's request types come from it.
import { z } from "zod";
import type { ImportableData, ViewingMode } from "@/lib/types";

const required = z.string().min(1);
const renderType = z.enum(["default", "compact"]);

export const viewingModes = ["idle", "locked", "reviewing", "voting"] as const;
viewingModes satisfies readonly ViewingMode[];

export const voteSubmit = z.object({
  category_id: required,
  nominee_id: required,
});

// Admin forms are plain HTML <form> posts, so every field arrives as a string.
export const categoryForm = z.object({
  category_id: required,
  category_title: required,
  category_description: required,
});

export const nomineeForm = z.object({
  nominee_id: required,
  category_id: required,
  nominee_title: required,
  nominee_description: required,
  url: required,
  image_id: z.string().optional(),
  video_id: z.string().optional(),
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
});

export const userIdBody = z.number().int();

export const idQuery = z.object({ id: required });

export const nomineeQuery = z.object({ categoryId: required, id: required });

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
    options: z.array(
      z.object({
        id: required,
        title: z.string(),
        description: z.string(),
        url: z.string().nullable(),
        imageId: z.string().nullable(),
        videoId: z.string().nullable(),
        renderType: renderType.nullable(),
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
