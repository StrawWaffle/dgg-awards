import { Hono } from "hono";
import {
  deleteCategory,
  deleteNominee,
  backupDatabase,
  getAdmins,
  getCategoryFlags,
  getCategoryNominees,
  nomineeHasVotes,
  getCategory,
  getHistory,
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
import {
  UndoConflict,
  actorFor,
  categoryOrder as currentCategoryOrder,
  categorySnapshot,
  nomineeLabel,
  nomineeOrder as currentNomineeOrder,
  record,
  recordCategoryCreate,
  recordNomineeCreate,
  recordNomineeUpdate,
  undo,
} from "@/server/history";
import { slugify, uniqueId } from "@/lib/ids";
import { checkAwards } from "@/lib/nominee-checks";
import { effectiveStyle, withEffectiveStyles } from "@/lib/voting";
import {
  UserError,
  clipProblem,
  enqueueClip,
  enqueueUpload,
  enqueueLibrary,
  thumbnailFromClip,
  thumbnailFromUpload,
  clipFrame,
  clearClip, clearThumbnail,
  MAX_VIDEO_UPLOAD_BYTES,
  VIDEO_EXTENSIONS,
} from "@/server/clips";
import { DGG_NAME, cachedDggProfile } from "@/server/dgg-profile";
import { categoriesWithMediaUrls } from "@/server/present";
import { chatReviewKey, getChatReview, saveChatReview } from "@/server/chat-review";
import { clipFinderKey, getClipFinder, saveClipFinder } from "@/server/clip-finder";
import { AdvanceRefused, advance, advancePlan } from "@/server/advance";
import { ballotsCsv, resultsCsv } from "@/server/export-csv";
import { serveFile, storage } from "@/server/storage";
import { libraryFile, listLibrary } from "@/server/library";
import { RestoreError, restoreDatabase, snapshotDatabase } from "@/lib/data/driver";
import { decryptBackup, isEncryptedBackup, isSqlite } from "@/lib/backup-crypto";
import { backupDatabaseOffsite, backupMediaOffsite, offsiteEnabled, offsiteStatus } from "@/server/backups";
import { type SessionEnv, rejectInvalid, requireAdmin, zValidator } from "@/server/middleware";
import {
  announcerUpload,
  advanceBody,
  advanceQuery,
  roundDates,
  categoryCreate,
  categoryForm,
  chatReviewSave,
  clipFinderDoc,
  clipFinderQuery,
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
  clipFrameQuery,
  clipUpload,
  restoreForm,
  clipFromLibrary,
  libraryFileQuery,
  historyQuery,
  undoBody,
  userAdminBody,
  usersQuery,
  votesQuery,
} from "@/server/schemas";

/** Who is making this request, for the history. */
const actor = (c: { get(key: "session"): { uid: number } }) => actorFor(c.get("session").uid);

// HTML form posts redirect back to the admin page, as before.
const backToAdmin = () =>
  new Response(null, { status: 302, headers: [["Location", "/admin"]] });

// Every route here requires an admin session. Register new routes after the
// .use() line, or they won't be protected.
export const adminRoutes = new Hono<SessionEnv>()
  .use(requireAdmin)

  /**
   * Add categories (with their nominees) from the export format. Ids already
   * in use are refused up front, so nothing is half imported. The database is
   * backed up first, and the import can be undone from the history.
   */
  .post("/import", zValidator("form", importForm, rejectInvalid), async (c) => {
    const data = c.req.valid("form").data;
    const taken = new Set((await getNominees({ includeHidden: true })).map((cat) => cat.id));
    const clash = data.map((cat) => cat.id).filter((id, i, ids) => taken.has(id) || ids.indexOf(id) !== i);
    if (clash.length > 0) {
      return c.text(`These categories already exist: ${[...new Set(clash)].join(", ")}`, 409);
    }
    if (data.length > 0) await backupDatabase("before-import");
    for (const category of data) {
      await insertCategory({
        id: category.id,
        description: category.description,
        title: category.title,
        votingStyle: category.votingStyle ?? null,
        hidden: category.hidden ?? false,
      });
      for (const option of category.options) {
        await insertNominee({ ...option, categoryId: category.id });
      }
    }
    if (data.length > 0) {
      await record(await actor(c), {
        kind: "import",
        action: "create",
        label: `${data.length} categor${data.length === 1 ? "y" : "ies"}`,
        after: {
          categories: data.map((cat) => cat.id),
          nominees: data.reduce((n, cat) => n + cat.options.length, 0),
        },
      });
    }
    return backToAdmin();
  })
  /** Every category and nominee, in the format import reads: a backup to keep. */
  // Full backups: the whole database as one file (without sessions), and
  // putting one back. Off-site copies go to Google Drive (src/server/backups.ts).
  .get("/backup", async (c) => {
    const data = await snapshotDatabase();
    const name = `dgg-awards-${new Date().toISOString().slice(0, 16).replace(":", "-")}Z.db`;
    return new Response(new Blob([new Uint8Array(data)]), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  })
  .post("/backup/restore", zValidator("form", restoreForm, rejectInvalid), async (c) => {
    const { file, password } = c.req.valid("form");
    let data: Uint8Array = new Uint8Array(await file.arrayBuffer());
    try {
      if (isEncryptedBackup(data)) {
        const key = password || process.env.BACKUP_PASSWORD;
        if (!key) return c.text("That backup is encrypted: enter its password.", 400);
        data = await decryptBackup(data, key);
      } else if (!isSqlite(data)) {
        return c.text("That isn't a backup: choose a .db or .db.enc file.", 400);
      }
      const counts = await restoreDatabase(data);
      console.log(`Database restored from ${file.name} by uid ${c.get("session").uid}:`, counts);
      return c.json({ counts }, 200);
    } catch (error) {
      if (error instanceof RestoreError) return c.text(error.message, 400);
      if (error instanceof Error && error.message.startsWith("Couldn't decrypt")) return c.text(error.message, 400);
      throw error;
    }
  })
  .get("/backup/status", async (c) => c.json(await offsiteStatus(), 200))
  .post("/backup/now", async (c) => {
    if (!offsiteEnabled()) return c.text("Off-site backups aren't set up (see docs/migration.md).", 400);
    try {
      await backupDatabaseOffsite();
    } catch (error) {
      return c.text(`The backup failed: ${(error as Error).message}`, 502);
    }
    // Media can take a while; it carries on in the background.
    void backupMediaOffsite().catch((error) => console.error("Media backup failed:", error.message));
    return c.json(await offsiteStatus(), 200);
  })
  .get("/export", async (c) => {
    const flags = await getCategoryFlags();
    const categories = await getNominees({ includeHidden: true, admin: true });
    const data = await Promise.all(
      categories.map(async (cat) => ({
        id: cat.id,
        title: cat.title,
        description: cat.description,
        votingStyle: cat.votingStyle,
        hidden: flags.get(cat.id)?.hidden ?? false,
        options: (await getCategoryNominees(cat.id)).map((o) => ({
          id: o.id,
          title: o.title,
          description: o.description,
          url: o.url,
          imageId: o.imageId,
          videoId: o.videoId,
          renderType: o.renderType,
          date: o.date,
          linkType: o.linkType,
          clipStart: o.clipStart,
          clipEnd: o.clipEnd,
          // Only finished clips; a build in progress isn't worth restoring.
          clipKey: o.clipStatus === "ready" ? o.clipKey : null,
          clipStatus: o.clipStatus === "ready" ? ("ready" as const) : null,
          thumbnailKey: o.thumbnailKey,
          thumbnailAt: o.thumbnailAt,
          listNumber: o.listNumber,
          chatName: o.chatName,
          winnerLine: o.winnerLine,
        })),
      })),
    );
    const day = new Date().toISOString().slice(0, 10);
    c.header("Content-Disposition", `attachment; filename="dgg-awards-nominees-${day}.json"`);
    return c.json(data, 200);
  })

  .post("/category", zValidator("form", categoryForm, rejectInvalid), async (c) => {
    const form = c.req.valid("form");
    await insertCategory({
      id: form.category_id,
      title: form.category_title,
      description: form.category_description,
      votingStyle: form.voting_style ?? null,
    });
    await recordCategoryCreate(await actor(c), form.category_id);
    return backToAdmin();
  })
  .patch("/category", zValidator("json", categoryPatch, rejectInvalid), async (c) => {
    const patch = c.req.valid("json");
    // Once a category has votes its style is pinned: changing it would mix
    // single picks and ranked ballots.
    if (patch.votingStyle !== undefined && (await categoryHasVotes(patch.id))) {
      return c.text("This category already has votes, so its voting style can't change.", 409);
    }
    const before = await getCategory(patch.id);
    await updateCategory(patch);
    const after = await getCategory(patch.id);
    if (before && after) {
      await record(await actor(c), {
        kind: "category",
        action: "update",
        label: after.title,
        categoryId: after.id,
        before,
        after,
      });
    }
    return c.body(null, 200);
  })

  /**
   * Site settings. The default voting style applies to categories without
   * their own; categories that already have votes keep the style they had.
   */
  .patch("/settings", zValidator("json", settingsPatch, rejectInvalid), async (c) => {
    const { awardYear, defaultVotingStyle, startTime, endTime, viewingMode, recordIp, recordAgent } = c.req.valid("json");
    const before = await getConfig();
    if (awardYear !== undefined) await setSetting("awardYear", String(awardYear));
    if (startTime !== undefined) await setSetting("startTime", String(startTime));
    if (endTime !== undefined) await setSetting("endTime", String(endTime));
    if (viewingMode !== undefined) await setSetting("viewingMode", viewingMode);
    if (recordIp !== undefined) await setSetting("recordIp", recordIp ? "on" : "off");
    if (recordAgent !== undefined) await setSetting("recordAgent", recordAgent ? "on" : "off");
    if (defaultVotingStyle !== undefined) {
      await pinVotedCategoryStyles(effectiveStyle(null, (await getConfig()).defaultVotingStyle));
      await setSetting("defaultVotingStyle", defaultVotingStyle);
    }
    const after = await getConfig();
    await record(await actor(c), { kind: "settings", action: "update", label: "Settings", before, after });
    return c.json(after, 200);
  })
  .delete("/category", zValidator("query", idQuery, rejectInvalid), async (c) => {
    const { id } = c.req.valid("query");
    // Deleting would delete its votes too.
    if (await categoryHasVotes(id)) {
      return c.text("This category has votes. Hide it instead, which keeps them.", 409);
    }
    const snapshot = await categorySnapshot(id);
    const result = await deleteCategory(id);
    if (snapshot) {
      await record(await actor(c), {
        kind: "category",
        action: "delete",
        label: String(snapshot.title),
        categoryId: id,
        before: snapshot,
      });
    }
    return c.json(result, 200);
  })

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
    await recordNomineeCreate(await actor(c), form.category_id, form.nominee_id);
    return backToAdmin();
  })
  .patch("/nominee", zValidator("json", nomineePatch, rejectInvalid), async (c) => {
    const patch = c.req.valid("json");
    const before = await getNominee(patch.categoryId, patch.id);
    await updateNominee(patch);
    await recordNomineeUpdate(await actor(c), before);
    return c.body(null, 200);
  })
  .delete("/nominee", zValidator("query", nomineeQuery, rejectInvalid), async (c) => {
    const { categoryId, id } = c.req.valid("query");
    if (await nomineeHasVotes(categoryId, id)) {
      return c.text("This nominee has votes, so it can't be deleted. Hide its category instead if it must go.", 409);
    }
    const nominee = await getNominee(categoryId, id);
    await deleteNominee(categoryId, id);
    // Its clip and thumbnail files stay, so undoing the delete brings them back.
    if (nominee) {
      await record(await actor(c), {
        kind: "nominee",
        action: "delete",
        label: await nomineeLabel(categoryId, nominee.title),
        categoryId,
        nomineeId: id,
        before: nominee,
      });
    }
    return c.body(null, 200);
  })

  // Creating from the editor (JSON). The old form endpoints above stay for
  // the Management tab. Ids are made from the title and kept unique.
  .post("/categories", zValidator("json", categoryCreate, rejectInvalid), async (c) => {
    const body = c.req.valid("json");
    const taken = new Set((await getNominees({ includeHidden: true })).map((cat) => cat.id));
    const id = body.id ?? uniqueId(slugify(body.title), taken);
    if (taken.has(id)) return c.text(`A category with the id "${id}" already exists.`, 409);
    await insertCategory({
      id,
      title: body.title,
      description: body.description,
      votingStyle: body.votingStyle ?? null,
    });
    await recordCategoryCreate(await actor(c), id);
    return c.json({ id }, 201);
  })
  .post("/nominees", zValidator("json", nomineeCreate, rejectInvalid), async (c) => {
    const body = c.req.valid("json");
    const category = (await getNominees({ includeHidden: true })).find((cat) => cat.id === body.categoryId);
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
    await recordNomineeCreate(await actor(c), category.id, id);
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
  // A video the admin already has (downloaded or made), cut to the part they
  // marked. Built in the background like any clip.
  .post("/clip/upload", zValidator("form", clipUpload, rejectInvalid), async (c) => {
    const { categoryId, id, file, start, end } = c.req.valid("form");
    if (!(await getNominee(categoryId, id))) return c.body(null, 404);
    try {
      await enqueueUpload(categoryId, id, file, start ?? null, end ?? null);
    } catch (error) {
      if (error instanceof UserError) return c.text(error.message, 400);
      throw error;
    }
    return c.json({ clipStatus: "pending" as const }, 202);
  })
  // The video library (admins only): what's in it, a file to watch while
  // marking, and a clip cut from one.
  .get("/library", async (c) => c.json(await listLibrary(), 200))
  .get("/library/file", zValidator("query", libraryFileQuery, rejectInvalid), async (c) => {
    const file = await libraryFile(c.req.valid("query").path);
    if (!file) return c.body(null, 404);
    const res = await serveFile(Bun.file(file), c.req.header("Range") ?? null);
    // Private: never kept by Cloudflare or shared caches.
    res.headers.set("Cache-Control", "private, max-age=3600");
    return res;
  })
  .post("/clip/library", zValidator("json", clipFromLibrary, rejectInvalid), async (c) => {
    const { categoryId, id, path, start, end } = c.req.valid("json");
    if (!(await getNominee(categoryId, id))) return c.body(null, 404);
    const file = await libraryFile(path);
    if (!file) return c.text("That file isn't in the library.", 404);
    try {
      await enqueueLibrary(categoryId, id, file, start ?? null, end ?? null);
    } catch (error) {
      if (error instanceof UserError) return c.text(error.message, 400);
      throw error;
    }
    return c.json({ clipStatus: "pending" as const }, 202);
  })
  // Thumbnails: a frame from the clip, or an uploaded image.
  .post("/thumbnail", zValidator("json", thumbnailAt, rejectInvalid), async (c) => {
    const { categoryId, id, at } = c.req.valid("json");
    try {
      const before = await getNominee(categoryId, id);
      const key = await thumbnailFromClip(categoryId, id, at);
      await recordNomineeUpdate(await actor(c), before);
      return c.json({ thumbnailUrl: storage.url(key) }, 200);
    } catch (error) {
      if (error instanceof UserError) return c.text(error.message, 400);
      throw error;
    }
  })
  .post("/thumbnail/upload", zValidator("form", thumbnailUpload, rejectInvalid), async (c) => {
    const { categoryId, id, file, at } = c.req.valid("form");
    try {
      const before = await getNominee(categoryId, id);
      const key = await thumbnailFromUpload(categoryId, id, file, at ?? null);
      await recordNomineeUpdate(await actor(c), before);
      return c.json({ thumbnailUrl: storage.url(key) }, 200);
    } catch (error) {
      if (error instanceof UserError) return c.text(error.message, 400);
      throw error;
    }
  })
  /** A frame of the clip at full size, for the editor's cropper (nothing is stored). */
  .get("/clip/frame", zValidator("query", clipFrameQuery, rejectInvalid), async (c) => {
    const { categoryId, id, at } = c.req.valid("query");
    try {
      const bytes = await clipFrame(categoryId, id, at);
      return c.body(bytes.slice().buffer as ArrayBuffer, 200, { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" });
    } catch (error) {
      if (error instanceof UserError) return c.text(error.message, 400);
      throw error;
    }
  })
  /** Take the picture off; the old image file (if any) shows again. */
  .delete("/thumbnail", zValidator("query", nomineeQuery, rejectInvalid), async (c) => {
    const { categoryId, id } = c.req.valid("query");
    const before = await getNominee(categoryId, id);
    if (!before) return c.body(null, 404);
    await clearThumbnail(categoryId, id);
    await recordNomineeUpdate(await actor(c), before);
    return c.body(null, 200);
  })
  /** Take the clip off; the site plays the source link again. Not while one is being made. */
  .delete("/clip", zValidator("query", nomineeQuery, rejectInvalid), async (c) => {
    const { categoryId, id } = c.req.valid("query");
    const before = await getNominee(categoryId, id);
    if (!before) return c.body(null, 404);
    if (before.clipStatus === "pending" || before.clipStatus === "processing") {
      return c.text("A clip is being made. Wait for it to finish, then remove it.", 409);
    }
    if (!before.clipKey && !before.clipStatus) return c.text("This nominee has no clip.", 400);
    await clearClip(categoryId, id);
    await recordNomineeUpdate(await actor(c), before);
    return c.body(null, 200);
  })

  /**
   * An announcer video for an award, as a file. Stored as it is (browsers play
   * mp4 and webm; other formats may not play) and recorded like any category
   * change. Old files are kept, so undo can bring them back.
   */
  .post("/announcer", zValidator("form", announcerUpload, rejectInvalid), async (c) => {
    const { categoryId, file } = c.req.valid("form");
    const before = await getCategory(categoryId);
    if (!before) return c.body(null, 404);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!VIDEO_EXTENSIONS.includes(ext) && !file.type.startsWith("video/")) {
      return c.text("That isn't a video file. Use mp4 or webm.", 400);
    }
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      return c.text(`Videos can be at most ${Math.floor(MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024)} MB. Export it smaller.`, 400);
    }
    const key = `announcers/${categoryId}-${Date.now()}.${VIDEO_EXTENSIONS.includes(ext) ? ext : "mp4"}`;
    await storage.put(key, file, file.type || "video/mp4");
    await updateCategory({ id: categoryId, announcerKey: key });
    const after = await getCategory(categoryId);
    await record(await actor(c), { kind: "category", action: "update", label: before.title, categoryId, before, after });
    return c.json({ announcerFileUrl: storage.url(key) }, 200);
  })

  .get("/nominees", async (c) => {
    const config = await getConfig();
    const flags = await getCategoryFlags();
    const categories = categoriesWithMediaUrls(
      withEffectiveStyles(await getNominees({ includeHidden: true, admin: true }), config.defaultVotingStyle),
    );
    return c.json(
      categories.map((cat) => ({
        ...cat,
        hidden: flags.get(cat.id)?.hidden ?? false,
        hasVotes: flags.get(cat.id)?.hasVotes ?? false,
        announcerFileUrl: cat.announcerKey ? storage.url(cat.announcerKey) : null,
      })),
      200,
    );
  })
  // Everything wrong with the nominees, for the admin editor. Problems come
  // from src/lib/nominee-checks.ts; the year from the awardYear setting.
  .get("/checks", async (c) => {
    const config = await getConfig();
    const year = config.awardYear ? Number(config.awardYear) : undefined;
    return c.json(checkAwards(await getNominees({ admin: true }), year), 200);
  })
  // A chatter's destiny.gg membership card, for filling in a nominee.
  .get("/dgg-profile/:name", async (c) => {
    const name = c.req.param("name");
    if (!DGG_NAME.test(name)) {
      return c.body(null, 400);
    }
    try {
      const profile = await cachedDggProfile(name);
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
    const user = await getUser(uid);
    await setUserAdmin(uid, admin);
    if (user && user.admin !== admin) {
      await record(await actor(c), {
        kind: "admin",
        action: "update",
        label: user.name,
        before: { uid, admin: user.admin },
        after: { uid, admin },
      });
    }
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
    const before = await currentCategoryOrder();
    await reorderCategories(c.req.valid("json").ids);
    await record(await actor(c), {
      kind: "order",
      action: "update",
      label: "Categories",
      before: { ids: before },
      after: { ids: await currentCategoryOrder() },
    });
    return c.body(null, 200);
  })
  .put("/nominees/order", zValidator("json", nomineeOrder, rejectInvalid), async (c) => {
    const { categoryId, ids } = c.req.valid("json");
    const before = await currentNomineeOrder(categoryId);
    await reorderNominees(categoryId, ids);
    await record(await actor(c), {
      kind: "order",
      action: "update",
      label: `Nominees · ${(await getCategory(categoryId))?.title ?? categoryId}`,
      categoryId,
      before: { ids: before },
      after: { ids: await currentNomineeOrder(categoryId) },
    });
    return c.body(null, 200);
  })

  /**
   * Save the year in chat as edited on its page. The whole document is sent;
   * the history keeps the top-level parts that changed, for undo.
   */
  .put("/chat-review", zValidator("json", chatReviewSave, rejectInvalid), async (c) => {
    const { year, data } = c.req.valid("json");
    const before = await getChatReview(year);
    if (!before) return c.text("There's no year in chat for that year.", 404);
    await saveChatReview(year, data);
    await record(await actor(c), {
      kind: "page",
      action: "update",
      label: `The year in chat ${year}`,
      // The page's key; pages have no category or nominee.
      nomineeId: chatReviewKey(year),
      before,
      after: data,
    });
    return c.body(null, 200);
  })

  /** The clip finder's current upload for a year (null if none). */
  .get("/clip-finder", zValidator("query", clipFinderQuery, rejectInvalid), async (c) =>
    c.json(await getClipFinder(c.req.valid("query").year)),
  )

  /**
   * Upload the clip finder's clips.json. It's kept, and becomes the current
   * one; the history records which upload was current, so undo goes back.
   */
  .put("/clip-finder", zValidator("json", clipFinderDoc, rejectInvalid), async (c) => {
    const doc = c.req.valid("json");
    const { before, after } = await saveClipFinder(doc);
    await record(await actor(c), {
      kind: "page",
      action: "update",
      label: `Clip finder ${doc.year}`,
      nomineeId: clipFinderKey(doc.year),
      before,
      after,
    });
    return c.body(null, 200);
  })

  /**
   * A round's dates, on every award in it (src/lib/rounds.ts). Each award's
   * change is recorded, so undo works per award.
   */
  .patch("/round", zValidator("json", roundDates, rejectInvalid), async (c) => {
    const { name, opensAt, closesAt } = c.req.valid("json");
    const awards = (await getNominees({ includeHidden: true, admin: true })).filter((a) => a.round === name);
    if (!awards.length) return c.text(`No awards are in the round "${name}".`, 404);
    const who = await actor(c);
    for (const a of awards) {
      const before = await getCategory(a.id);
      await updateCategory({ id: a.id, opensAt, closesAt });
      const after = await getCategory(a.id);
      if (before && after) await record(who, { kind: "category", action: "update", label: after.title, categoryId: a.id, before, after });
    }
    return c.body(null, 200);
  })

  /** The results and the ballots as spreadsheets (src/server/export-csv.ts). */
  .get("/export/results.csv", async (c) => {
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="dgg-awards-results-${new Date().toISOString().slice(0, 10)}.csv"`);
    c.header("Cache-Control", "private, no-store");
    return c.body(await resultsCsv(), 200);
  })
  .get("/export/ballots.csv", async (c) => {
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="dgg-awards-ballots-${new Date().toISOString().slice(0, 10)}.csv"`);
    c.header("Cache-Control", "private, no-store");
    return c.body(await ballotsCsv(), 200);
  })

  /** DGGer's next round: who goes through (src/server/advance.ts). Nothing changes. */
  .get("/advance", zValidator("query", advanceQuery, rejectInvalid), async (c) => {
    try {
      return c.json(await advancePlan(c.req.valid("query").step), 200);
    } catch (error) {
      return c.text((error as Error).message, 409);
    }
  })
  /** Advance DGGer with the picks an admin confirmed. One history entry; undo removes them. */
  .post("/advance", zValidator("json", advanceBody, rejectInvalid), async (c) => {
    const { step, picks } = c.req.valid("json");
    try {
      return c.json({ added: await advance(step, picks, await actor(c)) }, 200);
    } catch (error) {
      if (error instanceof AdvanceRefused) return c.text(error.message, 409);
      throw error;
    }
  })

  /** Edit history, newest first, 50 a page. A category filter includes its nominees. */
  .get("/history", zValidator("query", historyQuery, rejectInvalid), async (c) => {
    const { page, ...filter } = c.req.valid("query");
    return c.json(await getHistory(page ?? 0, filter), 200);
  })
  /**
   * Undo an entry. 409 with { message, fields } if it can't be undone, or if
   * what it changed was edited again since (send force: true to undo anyway).
   */
  .post("/history/:id/undo", zValidator("json", undoBody, rejectInvalid), async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.body(null, 400);
    try {
      const entry = await undo(id, await actor(c), c.req.valid("json").force);
      return c.json({ id: entry }, 200);
    } catch (error) {
      if (error instanceof UndoConflict) return c.json({ message: error.message, fields: error.fields }, 409);
      throw error;
    }
  })

  .post("/config", zValidator("form", configForm, rejectInvalid), async (c) => {
    const form = c.req.valid("form");
    const before = await getConfig();
    await setConfig(form.starting_time, form.ending_time, form.viewing_config);
    await record(await actor(c), {
      kind: "settings",
      action: "update",
      label: "Settings",
      before,
      after: await getConfig(),
    });
    return backToAdmin();
  });
