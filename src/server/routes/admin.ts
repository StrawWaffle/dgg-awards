import { Hono } from "hono";
import {
  deleteCategory,
  deleteNominee,
  getAllUsers,
  getAllVotes,
  getAllVotesFiltered,
  categoryHasVotes,
  pinVotedCategoryStyles,
  setSetting,
  getConfig,
  getNominee,
  getNominees,
  insertCategory,
  insertNominee,
  setConfig,
  updateCategory,
  updateNominee,
  updateUserMakeAdmin,
} from "@/lib/data/driver";
import { slugify, uniqueId } from "@/lib/ids";
import { checkAwards } from "@/lib/nominee-checks";
import { effectiveStyle, withEffectiveStyles } from "@/lib/voting";
import {
  UserError,
  clipProblem,
  enqueueClip,
  thumbnailFromClip,
  thumbnailFromUpload,
} from "@/server/clips";
import { DGG_NAME, fetchDggProfile } from "@/server/dgg-profile";
import { categoriesWithMediaUrls } from "@/server/present";
import { storage } from "@/server/storage";
import { type SessionEnv, rejectInvalid, requireAdmin, zValidator } from "@/server/middleware";
import {
  categoryCreate,
  categoryForm,
  categoryPatch,
  nomineeCreate,
  configForm,
  idQuery,
  importForm,
  nomineeForm,
  nomineePatch,
  nomineeQuery,
  nomineeRef,
  settingsPatch,
  thumbnailAt,
  thumbnailUpload,
  userIdBody,
  votesQuery,
} from "@/server/schemas";

// HTML form posts redirect back to the admin page, as before.
const backToAdmin = () =>
  new Response(null, { status: 302, headers: [["Location", "/admin"]] });

// Every route here requires an admin session. Register new routes after the
// .use() line, or they won't be protected.
export const adminRoutes = new Hono<SessionEnv>()
  .use(requireAdmin)

  .post("/import", zValidator("form", importForm, rejectInvalid), async (c) => {
    for (const category of c.req.valid("form").data) {
      await insertCategory({
        id: category.id,
        description: category.description,
        title: category.title,
        votingStyle: category.votingStyle ?? null,
      });
      for (const option of category.options) {
        await insertNominee({ ...option, categoryId: category.id });
      }
    }
    return backToAdmin();
  })

  .post("/category", zValidator("form", categoryForm, rejectInvalid), async (c) => {
    const form = c.req.valid("form");
    await insertCategory({
      id: form.category_id,
      title: form.category_title,
      description: form.category_description,
      votingStyle: form.voting_style ?? null,
    });
    return backToAdmin();
  })
  .patch("/category", zValidator("json", categoryPatch, rejectInvalid), async (c) => {
    const patch = c.req.valid("json");
    // Once a category has votes its style is pinned: changing it would mix
    // single picks and ranked ballots.
    if (patch.votingStyle !== undefined && (await categoryHasVotes(patch.id))) {
      return c.text("This category already has votes, so its voting style can't change.", 409);
    }
    await updateCategory(patch);
    return c.body(null, 200);
  })

  /**
   * Site settings. The default voting style applies to categories without
   * their own; categories that already have votes keep the style they had.
   */
  .patch("/settings", zValidator("json", settingsPatch, rejectInvalid), async (c) => {
    const { awardYear, defaultVotingStyle } = c.req.valid("json");
    if (awardYear !== undefined) await setSetting("awardYear", String(awardYear));
    if (defaultVotingStyle !== undefined) {
      await pinVotedCategoryStyles(effectiveStyle(null, (await getConfig()).defaultVotingStyle));
      await setSetting("defaultVotingStyle", defaultVotingStyle);
    }
    return c.json(await getConfig(), 200);
  })
  .delete("/category", zValidator("query", idQuery, rejectInvalid), async (c) =>
    c.json(await deleteCategory(c.req.valid("query").id), 200),
  )

  .post("/nominee", zValidator("form", nomineeForm, rejectInvalid), async (c) => {
    const form = c.req.valid("form");
    await insertNominee({
      id: form.nominee_id,
      categoryId: form.category_id,
      title: form.nominee_title,
      description: form.nominee_description,
      url: form.url,
      imageId: form.image_id ?? null,
      videoId: form.video_id ?? null,
      renderType: "default",
      date: form.date ?? null,
      linkType: form.link_type ?? null,
      clipStart: form.clip_start ?? null,
      clipEnd: form.clip_end ?? null,
    });
    return backToAdmin();
  })
  .patch("/nominee", zValidator("json", nomineePatch, rejectInvalid), async (c) => {
    await updateNominee(c.req.valid("json"));
    return c.body(null, 200);
  })
  .delete("/nominee", zValidator("query", nomineeQuery, rejectInvalid), async (c) => {
    const { categoryId, id } = c.req.valid("query");
    const nominee = await getNominee(categoryId, id);
    await deleteNominee(categoryId, id);
    for (const key of [nominee?.clipKey, nominee?.thumbnailKey]) {
      if (key) await storage.delete(key).catch(() => {});
    }
    return c.body(null, 200);
  })

  // Creating from the editor (JSON). The old form endpoints above stay for
  // the Management tab. Ids are made from the title and kept unique.
  .post("/categories", zValidator("json", categoryCreate, rejectInvalid), async (c) => {
    const body = c.req.valid("json");
    const taken = new Set((await getNominees()).map((cat) => cat.id));
    const id = body.id ?? uniqueId(slugify(body.title), taken);
    if (taken.has(id)) return c.text(`A category with the id "${id}" already exists.`, 409);
    await insertCategory({
      id,
      title: body.title,
      description: body.description,
      votingStyle: body.votingStyle ?? null,
    });
    return c.json({ id }, 201);
  })
  .post("/nominees", zValidator("json", nomineeCreate, rejectInvalid), async (c) => {
    const body = c.req.valid("json");
    const category = (await getNominees()).find((cat) => cat.id === body.categoryId);
    if (!category) return c.body(null, 404);
    const taken = new Set(category.options.map((o) => o.id));
    const id = body.id ?? uniqueId(slugify(body.title), taken);
    if (taken.has(id)) return c.text(`This category already has a nominee with the id "${id}".`, 409);
    await insertNominee({
      id,
      categoryId: category.id,
      title: body.title,
      description: "",
      url: body.url ?? null,
      imageId: null,
      videoId: null,
      renderType: "default",
    });
    return c.json({ id, categoryId: category.id }, 201);
  })

  // Clips: build from the nominee's link and clip range, in the background.
  // Progress shows as clipStatus/clipError on the admin nominee list.
  .post("/clip", zValidator("json", nomineeRef, rejectInvalid), async (c) => {
    const { categoryId, id } = c.req.valid("json");
    const nominee = await getNominee(categoryId, id);
    if (!nominee) return c.body(null, 404);
    const problem = clipProblem(nominee);
    if (problem) return c.text(problem, 400);
    await enqueueClip(categoryId, id);
    return c.json({ clipStatus: "pending" as const }, 202);
  })
  // Thumbnails: a frame from the clip, or an uploaded image.
  .post("/thumbnail", zValidator("json", thumbnailAt, rejectInvalid), async (c) => {
    const { categoryId, id, at } = c.req.valid("json");
    try {
      const key = await thumbnailFromClip(categoryId, id, at);
      return c.json({ thumbnailUrl: storage.url(key) }, 200);
    } catch (error) {
      if (error instanceof UserError) return c.text(error.message, 400);
      throw error;
    }
  })
  .post("/thumbnail/upload", zValidator("form", thumbnailUpload, rejectInvalid), async (c) => {
    const { categoryId, id, file } = c.req.valid("form");
    try {
      const key = await thumbnailFromUpload(categoryId, id, file);
      return c.json({ thumbnailUrl: storage.url(key) }, 200);
    } catch (error) {
      if (error instanceof UserError) return c.text(error.message, 400);
      throw error;
    }
  })

  .get("/nominees", async (c) => {
    const config = await getConfig();
    return c.json(categoriesWithMediaUrls(withEffectiveStyles(await getNominees(), config.defaultVotingStyle)), 200);
  })
  // Everything wrong with the nominees, for the admin editor. Problems come
  // from src/lib/nominee-checks.ts; the year from the awardYear setting.
  .get("/checks", async (c) => {
    const config = await getConfig();
    const year = config.awardYear ? Number(config.awardYear) : undefined;
    return c.json(checkAwards(await getNominees(), year), 200);
  })
  // A chatter's destiny.gg membership card, for filling in a nominee.
  .get("/dgg-profile/:name", async (c) => {
    const name = c.req.param("name");
    if (!DGG_NAME.test(name)) {
      return c.body(null, 400);
    }
    try {
      const profile = await fetchDggProfile(name);
      return profile ? c.json(profile, 200) : c.body(null, 404);
    } catch (error) {
      console.error(error);
      return c.body(null, 502);
    }
  })
  .get("/users", async (c) => c.json(await getAllUsers(), 200))
  .patch("/user", zValidator("json", userIdBody, rejectInvalid), async (c) => {
    await updateUserMakeAdmin(c.req.valid("json"));
    return c.body(null, 200);
  })

  .get("/votes", zValidator("query", votesQuery, rejectInvalid), async (c) => {
    const { filter_ip, filter_uid, page } = c.req.valid("query");
    const offset = page ? parseInt(page) * 100 : 0;
    const votes =
      filter_ip || filter_uid
        ? await getAllVotesFiltered(offset, filter_ip, filter_uid)
        : await getAllVotes(offset);
    return c.json(votes, 200);
  })

  .post("/config", zValidator("form", configForm, rejectInvalid), async (c) => {
    const form = c.req.valid("form");
    await setConfig(form.starting_time, form.ending_time, form.viewing_config);
    return backToAdmin();
  });
