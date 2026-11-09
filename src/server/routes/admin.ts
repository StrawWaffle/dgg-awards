import { Hono } from "hono";
import {
  deleteCategory,
  deleteNominee,
  getAllUsers,
  getAllVotes,
  getAllVotesFiltered,
  getNominees,
  insertCategory,
  insertNominee,
  setConfig,
  updateCategory,
  updateNominee,
  updateUserMakeAdmin,
} from "@/lib/data/driver";
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

export const adminRoutes = new Hono<SessionEnv>()
  // KNOWN BUG, kept on purpose until fixed separately: import has no admin
  // check. It is registered before the admin middleware below.
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

  .use(requireAdmin)

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
  .get("/users", async (c) => c.json(await getAllUsers(), 200))
  .patch("/user", zValidator("json", userIdBody, rejectInvalid), async (c) => {
    await updateUserMakeAdmin(c.req.valid("json"));
    return c.body(null, 200);
  })

  .get("/votes", zValidator("query", votesQuery, rejectInvalid), async (c) => {
    // KNOWN BUG, kept on purpose: the admin UI sends `offset`, this reads `page`.
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
