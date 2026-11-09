import { Hono } from "hono";
import {
  deleteCategory,
  deleteNominee,
  getAdmins,
  getUser,
  getVoteStats,
  getVotesPage,
  reorderCategories,
  reorderNominees,
  searchUsers,
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
  setUserAdmin,
} from "@/lib/data/driver";
import { adminUsernames } from "@/server/routes/auth";
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
  categoryOrder,
  nomineeOrder,
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
  userAdminBody,
  usersQuery,
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
    const { awardYear, defaultVotingStyle, startTime, endTime, viewingMode } = c.req.valid("json");
    if (awardYear !== undefined) await setSetting("awardYear", String(awardYear));
    if (startTime !== undefined) await setSetting("startTime", String(startTime));
    if (endTime !== undefined) await setSetting("endTime", String(endTime));
    if (viewingMode !== undefined) await setSetting("viewingMode", viewingMode);
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
  /**
   * The admins, or with ?q= the users whose name matches. `fromEnv`: listed
   * in ADMIN_USERNAMES, so made admin again at every sign-in.
   */
  .get("/users", zValidator("query", usersQuery, rejectInvalid), async (c) => {
    const { q } = c.req.valid("query");
    const users = q ? await searchUsers(q) : await getAdmins();
    return c.json(
      users.map((u) => ({ ...u, fromEnv: adminUsernames.has(u.name.toLowerCase()) })),
      200,
    );
  })
  .patch("/user", zValidator("json", userAdminBody, rejectInvalid), async (c) => {
    const { uid, admin } = c.req.valid("json");
    if (!admin) {
      if (uid === c.get("session").uid) return c.text("You can't remove yourself.", 400);
      const user = await getUser(uid);
      if (user && adminUsernames.has(user.name.toLowerCase())) {
        return c.text(`${user.name} is in ADMIN_USERNAMES. Remove them there first.`, 409);
      }
    }
    await setUserAdmin(uid, admin);
    return c.body(null, 200);
  })

  .get("/votes", zValidator("query", votesQuery, rejectInvalid), async (c) => {
    const { filter_ip, filter_uid, filter_name, page } = c.req.valid("query");
    const offset = page ? parseInt(page) * 100 : 0;
    const votes = await getVotesPage(offset, {
      ip: filter_ip,
      uid: filter_uid === undefined ? undefined : parseInt(filter_uid),
      name: filter_name,
    });
    return c.json(votes, 200);
  })
  .get("/stats", async (c) => c.json(await getVoteStats(), 200))

  /** Drag-and-drop order from the editor. Ids not listed keep their place. */
  .put("/categories/order", zValidator("json", categoryOrder, rejectInvalid), async (c) => {
    await reorderCategories(c.req.valid("json").ids);
    return c.body(null, 200);
  })
  .put("/nominees/order", zValidator("json", nomineeOrder, rejectInvalid), async (c) => {
    const { categoryId, ids } = c.req.valid("json");
    await reorderNominees(categoryId, ids);
    return c.body(null, 200);
  })

  .post("/config", zValidator("form", configForm, rejectInvalid), async (c) => {
    const form = c.req.valid("form");
    await setConfig(form.starting_time, form.ending_time, form.viewing_config);
    return backToAdmin();
  });
