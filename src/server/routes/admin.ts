import { Hono } from "hono";
import {
  deleteCategory,
  deleteNominee,
  getAllUsers,
  getAllVotes,
  getAllVotesFiltered,
  getConfig,
  getNominees,
  insertCategory,
  insertNominee,
  setConfig,
  updateCategory,
  updateNominee,
  updateUserMakeAdmin,
} from "@/lib/data/driver";
import { checkAwards } from "@/lib/nominee-checks";
import { DGG_NAME, fetchDggProfile } from "@/server/dgg-profile";
import { type SessionEnv, rejectInvalid, requireAdmin, zValidator } from "@/server/middleware";
import {
  categoryForm,
  categoryPatch,
  configForm,
  idQuery,
  importForm,
  nomineeForm,
  nomineePatch,
  nomineeQuery,
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
    });
    return backToAdmin();
  })
  .patch("/category", zValidator("json", categoryPatch, rejectInvalid), async (c) => {
    await updateCategory(c.req.valid("json"));
    return c.body(null, 200);
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
    await deleteNominee(categoryId, id);
    return c.body(null, 200);
  })

  .get("/nominees", async (c) => c.json(await getNominees(), 200))
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
