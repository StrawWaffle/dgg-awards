# Handoff

Last updated 2026-11-09. Read this first in a new session.

## What this is

A voting and results site for the yearly DGG Awards (the destiny.gg community). People sign in with destiny.gg, vote per category on nominees (clips, people, emotes, memes), and at the end the results are revealed live on Destiny's stream.

- **StrawWaffle** runs this rebuild. He is the user in these sessions.
- **rinlux (`RiN_LuX` on DGG)** is the collaborator and co-ran the 2025 site. They want a "cuter" and more condensed voting flow.
- **defeten** wrote the 2025 site and is no longer reachable.

The goal is the 2026 awards. Last year's nominees (`src/data.ts`) are sample data that will be replaced.

## Working agreements

- **Check with StrawWaffle before any fix or feature.** Infrastructure needed to run the site is fine to do. Changes to how the site behaves or looks are not, until he agrees.
- **Remote:** private repo https://github.com/StrawWaffle/dgg-awards (created 2026-11-09). Push `main` there. Keep it private and push nowhere else until privacy questions are settled with rinlux.
- **Test containers** on network `dgga-test` stay running until StrawWaffle says otherwise (the list is under "At a glance"). `dgga-base` runs the original code as the before baseline for screenshot comparisons.
- **Privacy is deferred.** The site is shared only as a private link for now. Don't spend time on it until StrawWaffle says so.
- **Old data doesn't need to keep working** (StrawWaffle, 2026-11-09). 2025 only needs to survive as the static archive. Keep using migrations for schema changes, since that's how the live database updates, but don't spend effort on compatibility with old data or import files. 2026 setup can start from a fresh database.
- **Writing:** apply the `unslop` skill to prose. **UI:** apply the `uncodixify` skill (installed at `~/.claude/skills/uncodixify`, from StrawWaffle's private skills repo).
- **Commit style:** short, sentence-case, past tense ("Added …"), per `AGENTS.md`.
- StrawWaffle uses voice-to-text, so ask when something reads oddly.

## Current state

### At a glance (end of session 2, 2026-11-09)

**Live** (`main` at `6ce6277` plus docs, deployed and pushed):
- **Infrastructure:** the Docker preview behind a Cloudflare tunnel, real destiny.gg sign-in, the stack upgrade (Bun 1.4, Hono, Zod, TS 7), and clips into Cloudflare R2 at 1080p.
- **Admin page:**
  - a left sidebar, dark theme, drag to reorder, and collapsible sections
  - the nominee editor with picture uploads (crop and resize in the browser), clips, data checks and DGG profile cards
  - one Settings form, admin management, vote stats with shared IPs
  - edit history with undo
  - Settings → Backups: download a full backup, restore one, and the status of the hourly backups to Google Drive (see `docs/migration.md`)
  - hiding categories that have votes; export, and import with an automatic database backup
  - links at the bottom left to preview the site (`/preview`), voting and results, and to open the site and the lab
  - at plain `/admin` (the page checks for an admin; the API refuses everyone else), and signing in returns you to the page you came from
  - in the clip section: a preview of the picked window, uploading a video and marking the part to keep, and the library for clips and pictures (rinlux's Drive folder: 46 videos and 11 pictures, 1.5 GB in `/data/library` on the live volume)
- **Voting model:** single pick or ranked per category, ranked counted by instant runoff, and the 2025 double-count bug fixed.
- **The lab** (`/lab`, admins only), where the 2026 voting page and presentation are being tried out:
  - a cozy look after a community destiny.gg skin, light and dark, the hand-drawn look (always on since 2026-11-09), and drifting emote silhouettes in the background
  - music ("black lover", with permission) and a beat map
  - emote reactions, and the big screen with chat characters (a live relay or the simulator)
  - clips, and the results reveal: drawn by hand, rows starting scrambled, and a race for the winner
  - a calmer stage cast, combos in the chat column, and the beat as a shared gust on the background emotes
  - the music button shows the volume while it changes (MMMM, OOOO at a speed that follows the volume, OverRustle at full), on a perceptual volume curve
  - the Results tab is a summary to scroll through after the show: overview, highlights, standings and runoff rounds per award
  - first and second place are revealed together on the big screen, trading the lead before the winner pulls ahead
  - nominees without a built clip play from the source (YouTube, Twitch, Streamable embeds, or a video file)
  - the big screen fills the window and presents in scenes per award: title, a DVD-style nominee menu, the results reveal, and the winner. Clips are lowered in and the music fades out for them. Tabs slide, and background emotes show their colours on hover.

**The live site is set up for the 2026 awards** (2026-11-09). The 2025 test setup was cleared after a backup (Drive `dgg-awards-2026-11-09T20-37Z.db.enc`, and `/data/backups/…-before-2026-setup.db`): its 22 awards, 174 nominees, 9,328 generated votes and 500 generated voters.
- Settings: award year 2026, mode **locked** (the public sees only the front page's countdown and `/2025`; admins preview), voting from **15 December 2026 00:00 UTC** to **26 December 2026 23:59:59 UTC** (both "for now", StrawWaffle).
- **The 22 awards** are 2025's, with their descriptions, in the same order. **159 draft nominees** came from rinlux's per-award Google Docs in the Drive folder: Ally 4, Antagonist 5, Brainlet 3, Buddy 4, DGGer 123, Drama 6, Employee 5, Frenemy 4, Meme Phrase 3, Yikestiny 2. Each is described as "Draft from rinlux's list". It's in the history as one import, which can be undone.
- **DGGer** is planned in groups: "5 groups of 12, 5 wildcard spots" (Groups A–E, plus "Wildcards, 67 to choose from, top 5 advance"). Each draft's description names its group. The site has no grouped or multi-round voting yet: ask rinlux how it should work.
- The Drive folder's top-level "new links" doc holds two links, not used yet: an r/LivestreamFail post, "Destiny summarizes pro-AI guy's argument" (`reddit.com/r/LivestreamFail/comments/1trj92f/…`), and "Aura edits", a gofile.io folder (`gofile.io/d/kAolxa6X`). Most likely candidates for a meme or clip award, and edits like the "fraze aura edit" already in the library. Ask rinlux what they're for.

**rinlux's answers (2026-11-09):**
- The lab is the direction for 2026. Not much is missing compared with 2025.
- They keep nominees in assorted docs and as clips. They want an import "for backup and restoration": the full backup and restore covers that.
- **No 2025 production data.** Their 2025 recap is a compilation video. The 2025 page stays on the wiki's percentages.
- **The public results may show a tally:** voters and votes per day. No location lookup. Idea: check the results against the DGG census for inconsistencies (backlogged by StrawWaffle, 2026-11-09).
- **Access:** JaydrVernanda and `bing` (StrawWaffle confirmed the name), both in `ADMIN_USERNAMES` since 2026-11-09.
- **Locking the site before voting:** yes, so they can test, touch up and preview. Done with "locked" plus the countdown.
- **The code is never to be public.**

**Still open:**
- How DGGer's groups and wildcards should vote.
- ~~**Simulated results**~~: on the results preview and the big screen (see "Previews by stage").
- ~~The new voting page~~: done, the site is one page now (see "One site").
- ~~The public tally~~: done, on the results page.

**Ideas from StrawWaffle, not built (some need rinlux's say):**
- **Roles:** presentation mode for an allowlist (the stream screen, admins included; the lab's chat relay is admins-only for now), moderators or editors with fewer rights, and letting chosen people preview pages.
- **Site lock:** the site behind sign-in, with a countdown to voting.
- **Where voters are:** an IP lookup, asking, or browser location. A privacy question for rinlux.
- **The drawn look:** drawn outlines on buttons, scribbled icons, an arrow at the winner, and "boiling" only at moments if the constant boil is too busy.
- **Archive:** wait for the full 2025 votes; the wiki has only percentages.

**Next, roughly in StrawWaffle's order:**
1. Bring the lab's voting page and presentation into the real site, once rinlux approves.
   - Voting: the one-award-at-a-time flow with ballot progress, and a ranked-voting interface.
   - Presentation: the big screen and the results reveal. Room for the stream camera, and showing the instant-runoff rounds, are still open.
2. Re-check the double-count fix against the original code (`dgga-base`), and against the real 2025 votes if they turn up.
3. Smaller items:
   - re-pull emotes from the DGG CDN
   - a privacy page (deferred until StrawWaffle lifts it)
   - a bot-vote comparison
   - precompute results when voting closes (scale)
   - a "Remove clip" button in the editor (pictures can be removed; clips can't yet)

**Deploying (what was done each time):**
- Back up the live database first: `VACUUM INTO /data/backups/<time>-before-deploy.db` inside `dgg-awards-app-1`. Imports also make their own backups there, and the newest 20 are kept.
- Fast-forward `main`, run `docker compose --profile tunnel up -d --build app`, then check `/`, `/api/config`, `/lab`, `/admin` (200), `/api/admin/checks` and `/api/lab/emotes` (401), and `/signin` (to destiny.gg).
- Push `main`.

**Worktrees:** none; all merged ones were removed on 2026-11-09.

**Test containers**, on network `dgga-test`, all kept running:

| Name | Port | What it is |
|---|---|---|
| `dgga-mock` | 8790 | the destiny.gg login stand-in |
| `dgga-files` | – | nginx serving `tests/fixtures` (`sample.mp4` for clip builds) |
| `dgga-base` | 3100 | the original 2025 code |
| `dgga-new` | 3200 | an older build under test |
| `dgga-main` | 3400 | an old live image, from before the editor. Rebuild it, or ignore it. |
| `dgga-review` | 3500 | used for the admin work (`dgga:review`) |
| `dgga-lab` | 3600 | the latest lab build (`dgga:lab`, same as live) |

**Browser testing without the T3 preview** (it hung this session): Playwright in Docker (`mcr.microsoft.com/playwright:v1.56.1-noble`) on network `dgga-test`, signing in through the mock as in `tests/visual/capture.mjs`.
- Plain Chromium there has no H.264, so test clip playback in Playwright's Firefox.
- To build a test clip, PATCH a nominee to `url: http://dgga-files/sample.mp4`, `linkType: video-file`, `clipStart: 0`, `clipEnd: 3`, then POST `/api/admin/clip`.

### Running preview

| | |
|---|---|
| Site | https://dgg-awards.strawwaffle.dev |
| Clips | https://dgg-awards-media.strawwaffle.dev (R2 bucket `dgg-awards-media`) |
| Local | http://localhost:3000 (pages load, but sign-in only works on the tunnel URL) |

- **Clips are 1080p** (since 2026-11-09). yt-dlp's precise cut encodes once, and the result is only repackaged if it's already H.264/AAC, ≤1080p and ≤~4 Mbps. Otherwise it's re-encoded once (CRF 21, capped at 4 Mbps). A typical 15 s clip is ~4 MB at ~2.1 Mbps. Peter Miller (Ally) has a test clip from StrawWaffle, built at the old 720p setting; press **Rebuild clip** to get 1080p.
- **R2 cost:** StrawWaffle wants to stay on the free tier. As of 2026-11, the free tier is 10 GB storage, 1M writes and 10M reads a month, and bandwidth is always free. The estimate for 2026 is ~1–2 GB and ~2M reads at worst, before Cloudflare's cache. Quality doesn't affect cost. A payment method is on file, so StrawWaffle was advised to set up a Cloudflare usage notification. Separate presenter-only or mobile versions were considered and not needed. Revisit only if usage grows.

- **Sign-in is real destiny.gg OAuth** (switched 2026-11-09, verified by StrawWaffle signing in and reaching `/admin`). The app is registered on the DGG account StrawWaffle set up for this, with the redirect `https://dgg-awards.strawwaffle.dev/oauth`. The credentials are only in `.env` (gitignored). `DGG_CLIENT_SECRET` contains `$`, so it's wrapped in single quotes there, which stops Compose from expanding it.
- Docker Compose runs `app` (Bun, with SQLite in the `awards_data` volume) and `tunnel` (cloudflared, profile `tunnel`). The `dgg-oauth` stand-in (profile `mock-auth`) is no longer run on the live stack. It's kept for local and test use, see `tests/`. Its `dgg-awards-login` Cloudflare route has been deleted.
- Cloudflare dashboard route: `dgg-awards` → `http://app:3000`.
- It's set up for 2026 and **locked** (see "At a glance"). Admins switch modes under Settings in `/admin`.
- `ADMIN_USERNAMES` in `.env` has StrawWaffle, RiN_LuX, JaydrVernanda and bing. Anyone on that list becomes admin when they sign in.
- Crawlers and AI indexing are blocked through `robots.txt` (with 25 AI bots named), a meta robots tag and an `X-Robots-Tag` header on images. Cloudflare's "Block AI bots" toggle was suggested but not confirmed as turned on.
- The live site is shared with rinlux for review (the lab included).

### Commands

```bash
docker compose --profile tunnel up -d --build
docker compose exec app bun scripts/seed.ts --mode voting                          # replaces nominees and ALL votes
docker compose exec app bun scripts/seed.ts --mode reviewing --fake-votes 500
MSYS_NO_PATHCONV=1 docker compose exec app bun scripts/make-admin.ts --db /data/sqlite.db --username <name>
```

In Git Bash, `MSYS_NO_PATHCONV=1` is needed or `/data/...` gets rewritten into a Windows path. Bun isn't installed on the host, so everything runs in Docker.

### Git history

- The first commit after "Initial commit" is `Imported dgga25 source from recovered zip`: the original code, unchanged. Diff against it to see everything we changed. The zip itself is archived on Google Drive (`DGG Awards backups/archive/dgga25-original-source.zip`, see "The original 2025 zip").
- Everything since is on `main` (`git log --oneline`). Each feature step is one or a few commits with detailed messages.

### First infrastructure changes to the original

These were the first changes. The routes have since moved to `src/server/` (Hono).

- `src/routes/signin.ts`: sends `code_challenge_method=S256`, which destiny.gg's guide lists as required. Not yet tested against the real destiny.gg. Also adds the optional `DGG_AUTHORIZE_ORIGIN` for when the browser and server reach the login provider at different addresses.
- `src/routes/oauth.ts`: the `ADMIN_USERNAMES` allowlist.
- `src/index.tsx`: `/Media/*` serves `src/media` first, then falls back to `MEDIA_URL`. Also adds `/robots.txt`.
- `src/index.html` and `src/admin.html`: meta robots tag.
- New: `scripts/migrate.ts`, `scripts/seed.ts`, `Dockerfile`, `.dockerignore`, `compose.yaml`, `.gitattributes` and `dev/dgg-oauth/server.mjs` (copied from DGG-Radio).

## How the old site works (findings)

- **Stack:** Bun (server and bundler), React 19, Tailwind 4, Radix UI, TanStack Query, Drizzle ORM on SQLite. About 8 route files in `src/routes`. StrawWaffle wants to keep this stack.
- **Login:** destiny.gg's custom OAuth. It isn't standard PKCE: the challenge is `base64(sha256hex(verifier + sha256hex(secret)))`. DGG-Radio's `docs/research/dgg-oauth-netlify.md` documents the protocol. Sessions are signed cookies that last a week.
- **Bot defense already in place:** every vote stores a snapshot of the session (`CF-Connecting-IP`, user agent). The admin Votes tab filters by voter or IP and lists addresses shared by several voters. Users' DGG account creation dates are stored.
- **Modes:** `locked`, `voting`, `idle`, `reviewing`, plus start and end times in the `configuration` table.
- **The zip is older than the version used on stream.** On stream there was click-to-reveal per nominee and a "Reveal all but last three" button (transcript 4:39). The zip has neither, only a single per-category "Reveal" that unblurs nominees one by one. Those features have to be rebuilt. Newest file in the zip: 2026-01-03.
- **Dead hosts:** `cdn.dgg.events`, `dgg.events` and `git.defeten.com` (the original repo). No Wayback Machine copies exist. All 88 images in `data.ts` are in `src/media`.
- The sidebar that tracks your position was never finished (`todo.md`).
- `PossibleLink` (`src/components/util.tsx`) already sets `target="_blank"`, yet on stream the ↗ arrow didn't open a new tab on left click. Not investigated.
- Results bars are drawn at `percentage / 1.6` height, which doesn't match the visualization principles below.

## Admin pass (2026-11-09, deployed)

StrawWaffle asked for a visual pass over the admin page and whether everything there was needed, then approved steps 1–5:

1. **Management tab removed.** Its add-category and add-nominee forms duplicated the editor, and its nominee form still asked for a "Video ID". The JSON import box went with it.
   - **The server routes stay:** `POST /api/admin/import`, `/category` and `/nominee` (form posts). The API tests use the last two for setup.
   - **Import is pending rinlux:** StrawWaffle will ask what format they use now, and whether they need an import. Either keep the route or build a new one for that format, then drop the old routes.
2. **Settings** (was Configuration) is one form: mode, voting opens and closes (`datetime-local` in the browser's time zone, no more Unix seconds), award year and default voting style. `PATCH /api/admin/settings` now also takes `startTime`, `endTime` and `viewingMode`. `POST /api/admin/config` stays because the screenshot script and `dgga-base` use it.
3. **Editor and layout:**
   - The tabs are underlined instead of pills, the padding matches the header, and the header shows the award year from settings instead of a hard-coded 2025.
   - The category list shows full titles, with the error and warning counts on a second line.
   - Delete nominee moved from each row into the open form. The disabled button is plain grey (the faded green looked broken), and the thumbnail upload is a button.
   - The editor stacks on narrow screens.
4. **Votes:**
   - Totals: voters, ballots, people signed in; ballots per category and per day (UTC); addresses shared by several voters.
   - The vote list is a table with names and titles. Clicking a voter or an IP filters by it, and the voter filter takes a name or a uid.
   - Endpoints: `GET /api/admin/stats`, and `GET /api/admin/votes` now returns `name`, `categoryTitle`, `optionTitle` and `ip` instead of the session snapshot. It also takes `filter_name`.
5. **Admins** (was Users): lists the admins only, with a name search to add more and a Remove button.
   - You can't remove yourself or anyone in `ADMIN_USERNAMES`, because sign-in would make them admin again.
   - `GET /api/admin/users` returns the admins, or with `?q=` up to 20 name matches. Each comes with `fromEnv`. `PATCH /api/admin/user` takes `{uid, admin}`; a bare uid still makes someone admin.

Tests: typecheck, 78 unit tests and 38 API tests pass, with both snapshots unchanged. New API tests cover user search, vote names and filters, the stats and the settings window. Screenshots were checked at 1440, 1024 and 390 px wide. Built and running as `dgga-review` (port 3500, image `dgga:review`), a container just for this branch.

### Second round: quality-of-life (StrawWaffle asked for these after the first round)

- **Sidebar instead of the header and tabs.** The page sections, the preview links, the theme switch and the signed-in name are all in a left sidebar that collapses to an icon rail (remembered). On narrow screens it turns into a bar at the top. The open section is kept in the address (`#votes`), so a reload stays on it.
- **Dark theme:** system, light or dark, switched in the sidebar and remembered per browser. `src/admin/admin.css` turns Tailwind's neutral scale around under the `admin-dark` class on `<html>` and moves the accents to lighter shades, so the components need no `dark:` classes. This affects the admin page only.
- **Drag to reorder** categories and nominees, by the dotted handle (or from the keyboard: focus the handle, Space, arrow keys, Space). It uses `@dnd-kit`.
  - Migration 0005 adds `position` to categories and options, backfilled from the old insertion order. It was checked on a copy of an existing database, and the order was unchanged.
  - New items go last. The public site, the results and the editor all follow the order.
  - `PUT /api/admin/categories/order` and `/nominees/order`.
  - `position` isn't sent in the API, so the public JSON and both snapshots are unchanged.
- **Collapsible sections, remembered per browser:** Category settings; a nominee's Details, Clip and destiny.gg profile; and every table on the Votes tab. On wide screens the category list stays in view while the nominees scroll, with its own scrollbar.
- `useStored` (`src/admin/useStored.ts`) is the localStorage hook behind all of this. It is wrapped so that blocked storage just means nothing is remembered.
- Tested: typecheck, 78 unit tests and 39 API tests (a new one covers reordering) pass. Screenshots were checked in light, dark, collapsed and phone width. A real mouse drag and a keyboard drag in Playwright both saved and survived a reload.

### Third round: edit history and clearer sections (StrawWaffle asked 2026-11-09)

- **Sections read as toggles now.** The title is a shaded bar that says Show or Hide. Open content sits under the bar, or hangs off a line from it inside forms, so it's clear what each bar folds.
- **Edit history** (`src/server/history.ts`, table `history`, migration 0006):
  - **What's recorded:** every admin change, with who, when, and before and after:
    - nominees and categories: add, edit, delete
    - settings, including the old config form
    - admin granted or removed
    - drag reorders
    - thumbnail picks and uploads
    - finished clip builds (by "Server")
    - imports
  - Edits keep only the fields that changed. Deletes keep the whole row (a category with its nominees). Each entry also has a label ("Zee · Ally of the Year") that still reads right after a rename or delete.
  - **Undo:** `POST /api/admin/history/:id/undo`. It puts the old values back, restores a delete or removes a create, and is itself an entry (`revertOf`), so it can be undone too.
    - It refuses with 409 and the fields if they were edited again since; `force: true` undoes anyway. It also refuses a second undo of the same entry.
    - Admin undo follows the same rules as the Admins tab: not yourself, and not anyone in ADMIN_USERNAMES.
    - Imports can't be undone. A restored category comes back without its votes, because votes are deleted with it.
  - **Files are kept now.** Replaced and deleted clip and thumbnail files are no longer deleted, so undo can bring them back. Their names are versioned, so nothing is overwritten. Unused files could be swept up after the awards; at ~4 MB a clip this is far inside the R2 free tier.
  - **Where it shows:** a History section in the sidebar (filter by kind, 50 a page), "History of this category" under category settings, and History in each nominee's form. Every entry opens to a before/after table.
  - **Not atomic.** The entry is written just after the change. A crash between the two would lose the entry but not the change.
  - **Already true before this work:** a nominee with votes can't be deleted, because the database refuses. The editor shows the server error.
- Tests: typecheck, 78 unit tests and 40 API tests pass, with both snapshots unchanged. A new test covers recording, undo, conflicts, forced undo, restoring a delete and settings. The clip test now checks that undoing a thumbnail pick brings the old one back. In the browser, Undo on a reorder put the old order back.

### 2025 results from the wiki

StrawWaffle pointed out that the wiki has the confirmed 2025 results: https://wiki.destiny.gg/view/Destiny_Awards. They are copied into `docs/2025-results-wiki.md`. It has winners and percentages, but **no vote counts**.
- Every category read word for word adds to 100%, including those with nominees in two categories. That argues against the live site having double-counted.
- **Except Omegalul, which adds to 125.02% on the page.** Its winner shows Godstiny's 45.98%, so it's most likely a copy slip on the wiki; the real figure would be 20.96%. Ask RiN_LuX. Details are in the doc.
- **For the archive (feature 8):** this is enough for winners and percentages, but not counts. Whether to build the archive from it is StrawWaffle's call.

### Fourth round: StrawWaffle's follow-ups on the history (2026-11-09, deployed)

- **Hiding categories** (migration 0007, `categories.hidden`):
  - A category with votes can't be deleted (409). Hide it instead. Hidden categories leave the public site, the results and the nominee checks, and votes for them are refused. Their nominees and votes are kept.
  - A nominee with votes can't be deleted either. That used to fail with a database error; it now answers 409 with a message.
  - In the editor, the button reads "Hide from the site" or "Show on the site". A hidden category is crossed out in the list, and Delete is disabled with an explanation. Hiding is in the history, so it can be undone.
- **Export:** `GET /api/admin/export` downloads every category and nominee, hidden ones included, with finished clip and thumbnail keys. It's in Settings → Data.
- **Import** reads the export format (Settings → Data, or `POST /api/admin/import`).
  - Ids that already exist are refused up front, so nothing is half imported.
  - Before each import the whole database is copied to `/data/backups/<time>-before-import.db`, keeping the newest 20. It uses `VACUUM INTO`, which gives a consistent copy while the site is in use.
  - **Imports can be undone now:** undo removes the imported categories (unless they've been voted on), and undoing that puts them back.
- **Archive: wait for the full 2025 data** (StrawWaffle). Don't build it from the wiki percentages.
- Tests: 42 API tests pass, with both snapshots unchanged. New ones cover hiding, the delete guards, and an export → import → undo → redo round trip.

### Nominee pictures (deployed 2026-11-09)

StrawWaffle asked for image uploads where relevant, kept at full size, with optional cropping and resizing in the browser.
- **One picture per nominee:** `thumbnailKey`, shown on the card and as the clip's thumbnail.
  - The public card (`Option.tsx`) now shows it even without a clip, falling back to the old `imageId` file. Until now an uploaded picture only showed with a clip.
  - The old "Image file" box moved under the picture, as "Image file from the code (older nominees)".
- **Editor:** a Picture section with a preview, where it came from (an upload or a clip frame), "Upload a (new) picture" and "Remove picture". The Clip section keeps "Use this frame as the picture" and lost its own upload button.
- **Cropping** (`PictureCropper.tsx`, browser only) is offered for stills:
  - shape: square (as on the site's cards), 4:3, 16:9 or no crop
  - drag to position, zoom 1–4×
  - size: full, 1200, 800 or 400 px on the longest side
  - "Upload as it is" skips it. JPEG stays JPEG (quality 0.92); anything else becomes PNG to keep transparency. Animated GIF, PNG and WebP skip the dialog.
- **Server** (`thumbnailFromUpload` in `src/server/clips.ts`):
  - The type is sniffed from the bytes (the browser's label can lie). Files must be at most 5 MB and 8000 px a side, and ffprobe must be able to read them.
  - JPEG is re-saved at full quality without metadata, which drops phone photos' location. Still PNG and WebP become lossless PNG. Animated files are kept byte for byte.
  - It used to turn everything into a 640 px JPEG.
  - `DELETE /api/admin/thumbnail` removes the picture. That's in the history and can be undone, and the file is kept.
- **Tests:**
  - New API checks: a fake PNG is refused, a GIF is stored byte for byte with the right type, and remove plus undo work.
  - In Chromium and Firefox, a dragged and zoomed square crop was stored at exactly the size the dialog showed, and a GIF went up without the dialog.
  - 42 API tests pass, with both snapshots unchanged.

### The drawn look (lab, deployed 2026-11-09)

StrawWaffle: part of what makes the skin cute is its drawn buttons and details. Could the presentation get a scribbly look (results, drawn frames around videos)? Researched, then prototyped in the lab.
- **Research: what exists.**
  - **Rough.js** 4.6.6 (MIT, under 9 kB) draws sketchy shapes and paths in SVG or canvas, with hatched fills and a seed for repeatable wobble. Excalidraw's look comes from it.
  - **Rough Notation** 0.5.1 (MIT, about 3 kB) draws animated hand-drawn underlines, circles, boxes and highlights around page elements, and can sequence them.
  - **roughViz** and **chart.xkcd** are complete sketchy chart libraries. They're quicker to start with but less control; roughViz's author says they're "not for absolute precision". Drawing bars ourselves with Rough.js keeps the article's rules (sorted, from zero, labelled).
  - **perfect-freehand** gives pen-pressure strokes. It's for real drawing, so not needed here.
  - **SVG filters** (`feTurbulence` plus `feDisplacementMap`) make anything wobble, and shuffling the filter's seed gives "boiling" lines. The lab does the boil with Rough.js seeds instead, so only the frame wobbles, never the video or text inside.
  - **Handwriting fonts** (OFL, through Fontsource): Gaegu (chosen), Patrick Hand, Kalam.
- **Prototype** (`src/lab/sketch.tsx`, `Results.tsx`):
  - A pencil button in the header switched the drawn look on and off. **Removed 2026-11-09 (StrawWaffle): the drawn look is always on.**
  - `Sketch` draws a wobbly, doubled, rounded hand-drawn frame around anything. It can boil (redrawn at 8 fps with 3 seeds; off for reduced motion) and draw itself in. It's used round the big-screen stage and its award sign.
  - **The Results tab** (new) uses the admin results preview.
    - The bars are hatched by hand, sorted, from zero, labelled with name, count and share, with the total shown. The winner is cross-hatched in coral.
    - Revealing goes from last place up ("Reveal next", **"Reveal all but the last three"**, "Reveal everything"). Each bar draws itself in, its numbers count up in Gaegu, and unrevealed rows are pencilled dashes.
    - The winner's name gets circled by hand, with a CHEERSTINY and Klappa burst. The title is underlined by hand.
    - With the drawn look off, the bars are plain and the winner is highlighted.
  - **Voting:** the picked nominee gets a box drawn round it.
  - Checked in light and dark with no console errors.
- **Ideas not built yet:** drawn outlines on buttons (the skin's own detail); scribbled hand-drawn icons in place of the radix ones; a drawn arrow pointing at the winner; "boiling" only at moments (the winner) and still otherwise, if the constant boil is too busy.

### Lab polish (2026-11-09, deployed)

StrawWaffle's notes after trying the lab:
- **Bars draw like a pen, slowly.** Each draws its outline first (0.9 s), then scribbles its hatching in from left to right; Rough.js draws the fill as one path of strokes in order. Longer bars take longer (up to 3.2 s). Bars revealed together draw one after another from the bottom, 1.6 s apart. Numbers count up as their bar starts, the rows still waiting keep their pencilled dashes, and the winner's circle and cheer wait for their bar.
- **One music button.** It shows Listening while the music is audible and MMMM when muted, with a speaker icon on hover. The volume slider stays. Muting keeps the track playing silently, so the visuals keep dancing.
- **4/4 beats.** The analysis now finds which beat is the "one" by bass on each of the four positions (147 against 98 to 127, so beat 0) and stores `downbeat` in the beat map. On the stage and the sound check, characters jump on the one and do a small squash-bob on the other beats. The live analyser counts its beats in fours, but can't know which is the one.
- **Transitions.** Characters walk on from a side edge, fading in, and walk off the nearest edge, fading out, when they leave (making room, after a minute of silence, or on a feed change). The award sign and clips pop in with a small overshoot. All of it is off for reduced motion.
- **Clips are in the lab now** (`ClipPlayer.tsx`). The clip sits in a boiling hand-drawn frame, plays once without looping, and links to the full source at the start time. The music ducks to a fifth while it plays.
  - Voting cards with a built clip get a "▶ Clip" button over the picture (a separate button, not nested in the card), which opens it in a dialog.
  - The big screen has "Play a clip", which shows a random built clip on the stage with the characters in front. It closes itself after the clip ends.
- **Checked:** clips play in Firefox. Plain Chromium (the test browser) has no H.264 (error 4), unlike real Chrome and Edge.
- **Drifting silhouettes.** The backdrop emotes float slowly right and up like leaves on a breeze, swaying and turning, and wrap round at the edges. They sway up to half again more with the bass, and stay still for reduced motion. Also fixed: they were bunched on the right, because the `.emote` base rule (`position: relative`, later in the file) overrode their `position: absolute`. Measured: evenly spread across the window, and 38 of 40 moved within 3 s.

### Lab polish, round 2 (2026-11-09, deployed)

StrawWaffle's notes after the last deploy, built:
- **Results drawn like a person would** (`Results.tsx`, rewritten).
  - Each bar's hatching is scribbled in from left to right through a growing clip; the hatching is drawn once at full width. Then the box is drawn round it with a pen stroke.
  - **The longest bar so far fills the width**, so earlier bars squish as bigger ones arrive, live, while the bigger one is still being drawn. The box follows its bar.
  - **The winner's race:** it shoots to 90% of the runner-up (1.1 s), creeps to 104% (2.8 s), then finishes quickly (0.9 s). Measured on the sample: 73, 91 … 98, 103 (the runner-up starts shrinking), 105, 108, 134, 135.
  - **Scrambled start:** the rows begin in a shuffled order, seeded by the award id, so the preview and the stream match. Reveals still go from last place up. A finished row slides (0.7 s) into its ranked place among the finished ones at the top, ending fully sorted.
  - Reveals queue one at a time: about 1.1–2 s of scribble, 0.65 s of box, 0.9 s pause. "Start over" replaces the board.
- **Stage cast changes gently.**
  - Arrivals are paced at 2 a second (a token bucket). Each new character walks from an edge to a random spot, then wanders.
  - Nobody is sent off within 12 s of arriving. If the stage is full and nobody has been there long enough, a new chatter isn't shown.
  - Measured: 7 of 49 characters near an edge, instead of most of them.
- **Combos in the chat column**, as destiny.gg shows them: the emote, "N×", and "HITS", or "C-C-C-COMBO" from 5. A running combo counts up in place.
  - The aggregator now also reports combos that ended within a window (`ended`), which were lost before.
  - The simulator makes combos real runs of back-to-back messages.
  - The column shows 2 character lines per quarter second (8 a second) and keeps 60 lines, so it can be read.
- **Volume:** while the volume changes (held slider, and 1.2 s after), the music button shows MMMM under 10%, otherwise OOOO animating at 0–150% speed with the slider (`Emote` takes a `rate`). The slider is now loudness as heard: gain = slider³ (−18 dB at half, −60 dB at 10%; sources suggested powers of 3–4, a square was too gentle at the low end). Saved volumes from before are moved so the music stays as loud (`curve` in the saved prefs).
- **Background emotes:** the beat is now one shared gust in screen directions (right and a little up, harder on the one) with a spring back, applied before each emote's own turn. Each one keeps a gentle sway of its own.

### Lab polish, round 3 (2026-11-09, deployed)

StrawWaffle's notes, built:
- **Music button:** OverRustle at full volume, OOOO at 0–200% speed. The emotes slide up in and out as they change (`SwapEmote` in `MusicBar.tsx`).
- **Background emotes:** the one under the pointer fades to its colours and back. The backdrop takes no pointer events, so it's a distance check each frame.
- **Voting:** the Klappa burst draws above the cards (`z-40` on the burst layer).
- **Tabs** slide sideways in the direction of the tab. The old page stays mounted while it slides out.
- **Big screen fills the window** below the top bar. The presenter's controls are a panel over its bottom edge, and the chat column is a toggle in the top bar (remembered, `lab.chat`).
- **Clips on the big screen:**
  - lowered in from the top to just above the controls, and raised away after
  - the cast walks out of its way, left or right, and sits still: no hops, no newcomers, no leaving and no speech bubbles
  - characters already out still change emote when they send a new one
  - the music now fades out completely during a clip (it used to drop to a fifth)
- **Presenting in scenes** (`Scenes.tsx`, driven from the big screen's controls). Each award goes through four scenes, and after the winner comes the next award's title:
  1. **Title:** the award's name and description, big; the cast roams.
  2. **Nominees:** a DVD-style menu. The highlighted nominee (arrow keys or the pointer) plays its clip silently in its tile, and Enter or a click plays it properly, lowered in.
  3. **Results:** the results tab's reveal (`Board`, now exported from `Results.tsx` with `onFinished`), with Reveal next and Reveal all.
  4. **Winner:** their picture, votes, "Play it again" and "Cheer again". Everyone claps as it opens.
  - From the Nominees scene on, the cast keeps to the sides of what's in the middle, and newcomers walk straight to the sides. Back and Next step through, the numbered steps jump, and a dropdown picks the award. The data is the admin results preview joined to `/api/nominees`.
- **Later change (deployed): the cast roams around a scene instead of parking.** Outside clips, characters keep wandering anywhere the scene's box doesn't cover: beside it, and in the rows below it. Anyone in a covered row who walks into its band turns back, and newcomers in those rows stay on the side they came in from. The box is measured each frame from layout offsets (`boxIn`, which ignores the lowering animation), so the areas follow the scene's size and the chat column opening or closing. Each character's own size (scaled, plus a hop) counts. Only a clip still sends everyone to the sides to sit still.
- **Fixed: the "Characters at most" limit.** A verified message gave its sender a character past the limit, and lowering the limit didn't send anyone off. Now both respect it, and extras leave a few at a time.
- **Clip controls** are our own in the lab look: play, a seek bar, the time, sound and full screen. They hide 2 s after the pointer stops while playing.

### The Results tab as a summary (2026-11-09, deployed)

The big screen does the live reveal now, so the lab's Results tab became a page to read through after the show (`Summary.tsx`). It's built from `/api/vote/results` alone (no server change):
- **Overview:** awards, ballots cast, the closest race and the biggest win (in points of the votes counted), and a top three of closest races, biggest wins and most votes. Each links down to its award.
- **A side list** of every award with its winner, sticky, marking the one on screen.
- **Each award:** the winner with picture, votes, share of first choices and how far they won by, and their clip; the full standings with bars that grow as the award scrolls into view, and a clip button per nominee.
- **Ranked awards:** the margin is from the final runoff round, and a collapsible table shows every round's counts, who went out, and ballots with no choices left.
- The old reveal page (`Results()`) is gone; `Results.tsx` keeps the `Board` the big screen uses.
- Not included, since it needs rinlux's say: overall unique voters and votes per day (the admin stats have them). Ballots cast is the sum over awards.

### First and second revealed together (2026-11-09, deployed)

On the big screen's results scene, the last two rows go together (`duelPlan` in `Results.tsx`). One "Reveal next" starts both once only they are left. Their bars grow side by side and swap the lead five times over about 5 s (six lead changes measured), level at the end of the race. Then the runner-up stops at its count while the winner pulls ahead to its own. The sway is small enough that neither bar shrinks. Both bars keep the plain colour and hatching until the race is over, and only then does the winner turn coral and cross-hatched and get circled. This replaced the winner's solo race against the runner-up.

### Clips that haven't been built play from the source (2026-11-09, deployed)

In the lab (voting, big screen, results summary), a nominee without a built clip now plays its source link in the platform's own player:
- **YouTube** (`youtube-nocookie.com`) starts and ends at the clip's times, from `clipStart`/`clipEnd` or the link's own timestamp.
- **Twitch** clips and VODs (a VOD starts at the clip's start). Twitch requires the page's hostname as `parent`, so that's passed in.
- **Streamable** plays from the start.
- A **direct video file** plays in our own player, limited to the clip's part with a media fragment (`#t=start,end`).
- Kick, X, Reddit and YouTube "clip" links have no embeddable player, so they still need a built clip.
- `embedUrl()` in `src/lib/links.ts` (unit-tested) builds the URLs, and `nomineeClip()` in `src/lab/ClipPlayer.tsx` picks a built clip first, then an embed. Embeds use the platform's own controls. We can't tell when one ends, so the music stays faded out while it's open, and on the big screen it's closed by hand.
- With the sample data, 68 nominees now have something to play on the summary.
- **For rinlux, before this reaches the real site:** an embed loads YouTube or Twitch in visitors' browsers (the no-cookie YouTube domain is used), which is a privacy point.

### The admin page at plain /admin (2026-11-09, deployed)

StrawWaffle saw what looked like being signed out after every deploy. Sessions were never the problem: they live in the database and are signed with the fixed `AUTH_SECRET`, and a session from 06:33 was still valid after about ten deploys. The admin page lived at a random `/admin/<code>` address made fresh at each start (from the 2025 code, security through obscurity), so open tabs and bookmarks got a 404 after a deploy. StrawWaffle chose plain `/admin`:
- Bun serves the admin page at `/admin` to anyone, like the lab. The page asks `/api/me` and shows the admin UI only to admins. Others get a short sign-in or "not an admin" note. That's a courtesy: the protection is the server, which refuses every `/api/admin` request from non-admins, as it always did.
- Old `/admin/<code>` addresses redirect to `/admin`.
- The only thing given up is that anyone can download the admin page's JavaScript (labels and route names, no data).
- The API tests now check the admin API instead of the old redirect (42 pass).
- **Signing in returns you to where you were:** `/signin?next=/admin` (the admin page and the lab use it) keeps the path in a short-lived cookie and redirects there after destiny.gg. `safeNext()` in `routes/auth.ts` only allows paths on this site (`//…`, `https://…`, backslashes and control characters go to `/`), so it can't be used as an open redirect. Covered by an API test (43 now).

### Clip preview, video upload and the video library (2026-11-09, deployed)

rinlux asked to preview the window they pick before building, to check the timecodes. Under the clip start and end in the nominee editor (`ClipPreview.tsx`):
- **"Preview the clip"** plays the source from the start to the end, using the times as typed, before saving. **"Check the ending"** plays the last 5 s, to check the cut.
- It uses `embedUrl()` for YouTube (stops at the end) and Twitch VODs (start only, so it says to watch for the cut), and a media fragment for direct video files (stops at the end).
- Twitch clips and Streamable are already cut, so the times don't apply to them.
- Kick, X and Reddit can't be embedded: it says to build the clip and check that, as before. Channels, profiles and pages show nothing.
- If the times change while it's open, it says so, and "Play the clip again" plays the new window.
- Tested in the browser: YouTube 30–45 s and its ending 40–45 s, a Twitch VOD's ending at 45 s, the Kick note, and a video file in Firefox.

**Uploading a video you already have** (same branch). rinlux keeps clips in a Google Drive folder, one subfolder per award: MP4s of about 7–39 MB, most needing some trimming. In the clip section, "Or upload a video you have" (`ClipUpload.tsx`):
- Pick a file and it plays right there, from the computer (nothing is sent yet). Pause and press "Start here" and "End here" (0.1 s steps). "Preview the clip" plays the marked part and stops at the end, and "Check the ending" plays its last 5 s.
- "Upload and make the clip" sends it in one request with a progress bar. The limit is 95 MB, since the tunnel refuses requests over 100 MB, so chunking wasn't needed for these files. MP4, MOV, MKV and WebM are accepted.
- `POST /api/admin/clip/upload`, then `enqueueUpload()` in `clips.ts`. The file waits in `uploads/` next to the database (on its volume) with a small job file, so a restart picks it up again. The usual queue builds it: cut with an encode when trimmed (frame-exact), repackaged when whole and already fitting, then stored, thumbnailed and recorded in the history like a built clip. The upload is deleted afterwards. At most 180 s.
- **Also changed for all clips:** a failed new clip no longer hides a working one. Status goes back to ready with the error beside it ("The new clip failed: … The previous clip is still in use."). It used to switch to failed and the old clip vanished from the site.
- Tested: an API test (whole file, cut 1–3 s is smaller, refusals, a mark past the end keeps the working clip; 44 pass) and in Firefox (marks 0:01–0:03.5, the preview stopped at 3.5, the upload built a 2.52 s H.264 clip, and `uploads/` was empty after).
- **The video library** (same branch). StrawWaffle asked to bring rinlux's whole Drive folder in, so they can work from the admin page:
  - `scripts/import-drive.py <folder-id> <library-dir>` copies a public Drive folder, keeping its folders and skipping Google Docs and files already there (so it can be run again). It's run in a `python:3.12-slim` container with gdown, against the data volume (`/data/library`).
  - **Imported to live 2026-11-09:** all 57 files (46 videos in 13 folders, 11 pictures). Drive refused some downloads at first ("too many accesses"). The script now pauses and retries, and a later run picked up the rest. The copy is also in the session scratchpad. To add new files later, run the script against the live volume (`dgg-awards_awards_data`).
  - The 2025 folder is `1EtYiAUl7ifEwLDlDncTTheA2c9uGqpiU`: 46 videos and 11 pictures in folders mostly named after awards, plus 11 "new links" Google Docs that weren't copied.
  - `src/server/library.ts` lists the library and resolves paths, refusing anything outside it. Admin routes: `GET /api/admin/library`, `GET /api/admin/library/file?path=` (byte ranges, `Cache-Control: private`), and `POST /api/admin/clip/library` (`{categoryId, id, path, start, end}`).
  - In the editor's clip section, "From the library…" lists the videos by folder, with the award's own folder first (matched loosely on the award's title). A picked video goes into the same mark, preview and make steps. The job is marked `keep`, so the library copy stays after the build.
  - The library is on the server's data volume only, never in the public bucket. Files are not matched to nominees automatically, because their names describe moments, not nominees.
  - Tested by an API test (`tests/run.sh` copies the sample video into the container's library first): the listing, private ranged serving, traversal refused, non-admins refused, a 1–3 s clip, and the file kept.
- Not done: picking straight from Google Drive in the browser (use the import script instead). The site still loses its clip briefly while a rebuild is pending, as before.

### Pictures from the library (2026-11-09, deployed)

The Picture section has "From the library…" too: the library's pictures by folder, with the award's own folder first (`useLibrary()` and `sameAward()` are shared in `editor/library.ts`).
- Animated ones (GIF, animated WebP or PNG, up to 5 MB) go up as they are. Stills open in the cropper.
- The cropper now hides "Upload as it is" when the server wouldn't take the file unchanged: AVIF (3 in the library), or over 5 MB (one 7.8 MB JPEG). Instead it converts: AVIF and JPEG come out as JPEG, others as PNG. If the result is still over 5 MB, it says to pick a smaller size.
- Tested in the browser on the live library's files: an AVIF converted and set as the picture, the 7.8 MB JPEG converted at full size under 5 MB, and the GIF went straight up.

### Full backups, restore and Google Drive (2026-11-09, deployed)

StrawWaffle wanted the live database safe, a proper full export and import, and off-site backups to Google Drive (easier to share than R2, and a next maintainer won't have his R2). The guide is `docs/migration.md`.
- **Settings → Backups** in the admin page:
  - "Download a full backup": the whole database as a `.db` file (`GET /api/admin/backup`, from `snapshotDatabase()`: a `VACUUM INTO` copy without `sessions` and `states`).
  - "Restore from a backup": a `.db`, or an encrypted `.db.enc` with an optional password (`POST /api/admin/backup/restore`, `restoreDatabase()`). The backup's migrations must match the site's; an older one is refused with a pointer to the guide. The current database is copied to `/data/backups/` first. Every table but `sessions`/`states` is replaced in one transaction. Sessions stay, minus any whose account isn't in the backup.
  - The off-site status (last database and media runs) and "Back up now".
- **Off-site, hourly** (`src/server/backups.ts`, started in `src/index.tsx`): it encrypts (`src/lib/backup-crypto.ts`: gzip, then AES-256-GCM with a PBKDF2-SHA256 key from `BACKUP_PASSWORD`, 600k rounds) and uploads with rclone to `gdrive:DGG Awards backups/database/`.
  - Kept: every copy for 2 days, then one a day for 60 days (`src/lib/backup-names.ts`).
  - Once a day it copies media (R2, or the local media folder) to `…/media/`, unencrypted, since it's public anyway.
  - Status is in `/data/backups/offsite.json`.
- rclone 1.68.2 is in the image (pinned, checksum-checked). Its Drive remote comes from `RCLONE_CONFIG_GDRIVE_*` in `.env`, with scope `drive.file`, so it only sees its own files.
- **Set up 2026-11-09** with StrawWaffle's Google account (15 GB). The token and `BACKUP_PASSWORD` are in the live `.env` only. StrawWaffle keeps the password in his password manager. Backups can't be restored without it.
- `scripts/backup-decrypt.ts` decrypts a Drive backup without the site.
- **Live since 2026-11-09 18:54 UTC.** The first database backup (268 KB) and media copy (2 files) are on Drive.
- **Migration tested** by following `docs/migration.md` from the Drive folder alone. A new volume got the newest backup (decrypted with the script) and the media copied from Drive, then ran with local storage and no R2. It came back with the same 22 awards and 174 nominees as live, 9,328 votes and 502 users, and the clip played from local files. The test copy and volume were deleted.
- `idleTimeout: 120` on the server: Bun's 10 s default cut off "Back up now".
- Tested:
  - unit tests (`tests/backup.test.ts`: encryption round trip, wrong password, damage, the keeping rule)
  - an API test (download, restore plain and encrypted, refusals)
  - end to end against Drive in a test folder, since deleted: the backup uploaded, then was fetched back, decrypted with the script and opened (22 awards, 174 nominees, 9,328 votes, 501 users, 0 sessions)

### The new front page and 2025's results (2026-11-09, deployed)

StrawWaffle got approval for the lab's look ("the lab is the official version now"). In that look:
- **`/`: the front page** (`src/home/Home.tsx`, `home.html`, `react-home.tsx`). A countdown to the voting start set in Settings (`startTime`), titled with `awardYear`, then "Voting is open!" with a Vote button and a countdown to the close, then "Voting has closed". With no start set, "Voting dates are coming soon". It switches by itself at the start, with a cheer. "Meanwhile, check out last year's results" goes to `/2025`. It has the lab's extras: music (starts only from its button, not on any first click as in the lab), drawn look, theme, and the drifting emotes. The lab's header controls are now `src/lab/HeaderTools.tsx`, shared.
- **`/2025`: last year's results**, the lab's results summary (`Summary`) fed from `src/archive/2025.json`. `Summary` takes a `load` now, and works without counts: percentages, margins in points, "Nominees" in place of ballots, a link to each award's reveal on stream, a note where a category doesn't add to 100%, and emotes as pictures for New Emote.
  - **The data**: the wiki's percentages for all 22 awards, parsed from the page source (all 22 verbatim now; the 7 "from the summary" categories matched exactly). Joined to `src/data.ts` for pictures and links (91 of 173 nominees have a picture). gpt71 and "MISSING SEGMENT" aren't in the site's data; Ukrainian Ana and Andrew Wilson matched under their spellings there.
  - **The wiki itself is off for two awards**, shown as printed with a note: Omegalul 125.02% and DGG Chatter 101.57%. To use real data later, replace the file (the same shape with counts filled in; `count` per award is there for that).
- **`/vote`: the old voting and results page**, until the lab's voting page replaces it (next). The admin's preview links, "Leave preview" and its sign-in now go there.
- Tests: the API test checks `/`, `/2025` and `/vote` (46 pass). The screenshot tests open `/vote`. In the browser: the countdown in light and dark, the switch at zero, the 2025 page, back and forward.
- The `dgga-mock` container had been mounting `server.mjs` from the deleted `stack-upgrade` worktree, so it couldn't start. It's recreated from the main checkout.

**Next (StrawWaffle's order): the lab's voting page as the real one.** `VoteDemo` saves nothing and shows 3 awards. It needs real ballots (`/api/vote`), sign-in, the voter's existing picks, every award, ranked awards, and the voting window. Then `VOTE_PATH` in `Home.tsx` points at it and the old page can go.

### No IP addresses, and plain backups (2026-11-09, deployed)

StrawWaffle: "remove the ip tracking, and we don't need the encryption thing anymore".
- **IPs:** sign-ins no longer store the visitor's address (it came from Cloudflare's `CF-Connecting-IP`). Migration `0008_no_ip` drops `sessions.ip` and strips `ip` from every vote's `sessionSnapshot`. Tested on a copy of live's pre-2026 backup: 9,328 votes, all stripped, all kept. The admin Votes tab lost its IP column, IP filter and "addresses shared by several voters" table. That table was the only bot signal; there's none now. `/api/me` and the votes list no longer return `ip`. The user agent is still kept with each session and vote.
- **Backups:** off-site backups are plain `.db` files now (they show who voted for what, so share the Drive folder only with organisers). They need only the rclone token. The older encrypted `.db.enc` files still restore with `BACKUP_PASSWORD` (kept in `.env` for that) and are deleted by the keeping rule within 60 days.
- **Still holding IPs, until they age out:** the local backups in `/data/backups/` from before this (they keep the newest 20) and the encrypted Drive backups (60 days). They hold the test voters' fake "seed" addresses and the admins' sign-in addresses.

### IP and browser recording as switches (2026-11-09, deployed)

StrawWaffle wasn't happy with removing them outright: the collaborator who'll host it later might want them. So both are now switches in **Settings → Privacy**, off for now:
- `recordIp` keeps the visitor's address (Cloudflare's `CF-Connecting-IP`) with each new sign-in, and through it with each vote.
- `recordAgent` keeps the user agent.
- When off, `sessions.ip` is null and `agent` is "". Switching off doesn't delete what was kept while it was on. Changes go in the history as settings.
- Migration `0009_optional_ip` adds `sessions.ip` back, nullable. It was tested on a copy of the live database (0008 had already dropped it there).
- The Votes tab shows the IP column, filter and shared-address table when `recordIp` is on, or when there are addresses to show. The shared-address table now ignores votes without one.
- **The original 2025 code did record both** (`src/routes/oauth.ts` in the recovered source): the IP and user agent at sign-in, copied into every vote. The real 2025 database would have held voters' IPs. Ours only ever held fake test addresses and the admins' own.
- API test: off by default, on keeps both, off again. 47 pass.

### The original 2025 zip, checked and archived (2026-11-09)

StrawWaffle downloaded the original `dgga25.zip` again (7.9 MB, 167 files, code only: no database, exports or secrets; `node_modules` empty).
- **Compared with the import commit `6b884f8`:** 166 files are byte-for-byte identical. The only file not imported is `scripts/data-to-json.out.json`, the output of `scripts/data-to-json.ts` (the nominees as JSON). It's an **older** export than the zip's `src/data.ts`, despite its later file date (2 January against 31 December): `data.ts` has the typo fixes ("podcast", "continuously", "malicious"…) and JohnHentai's link that the JSON lacks. So nothing is missing.
- **Archived** on Google Drive as `DGG Awards backups/archive/dgga25-original-source.zip`, uploaded with rclone and checked by MD5 against the original. Not encrypted (code only).

### Hover pass and the results side list (2026-11-09, deployed)

StrawWaffle noticed missing hover effects and a side list that didn't follow the page.
- **Hover:**
  - `.cozy-btn.primary` had none: the plain hover rule lost to its colour rule. The plain button hover is stronger now.
  - New classes in `lab.css`, colour or background only, 150 ms: `.cozy-row` (list rows, the scene steps, small icon buttons), `.cozy-card` (nominee cards), linked `.cozy-chip`s, `.cozy-logo`, and text links (`a.underline`). Tabs got one too.
  - Checked in the browser: all 10 sampled elements change on hover.
- **Results / 2025 side list:** the highlighted award is now worked out on scroll: the last one whose heading has passed the upper third, the last one at the very bottom (the short final awards never reached the old observer's band), and none above the first. The list scrolls itself to keep it in view: a third of the way down when it nears an edge, back to the top at the overview.

### One site: the real voting and results pages (2026-11-09, deployed)

StrawWaffle: `/vote?preview=voting` and `?preview=results` should show the new look, and "lab and non-lab should not be two different web pages; the lab is a slightly more experimental place, without touching what's agreed upon".
- **One page, `site.html` → `src/site/Site.tsx`**, at `/`, `/vote`, `/results`, `/2025` and `/lab`, with one header.
  - Tabs: Home, Vote (in voting mode, and for admins), Results (in reviewing mode, and for admins), 2025 results, and Lab (admins).
  - Pages slide like the lab's tabs did, and the music keeps playing.
  - `/vote?preview=results` opens the results, matching the admin page's link.
- **Removed:** the old 2025-style page (`App.tsx`, `index.html`, `src/components/`), `lab.html` and the lab's own shell, and the lab's voting demo and results tab, which the real pages replace.
- **`/vote` (`VotePage.tsx`)**, the lab's voting flow made real:
  - One award at a time, with the ballot on the side (it keeps the current award in view).
  - Pick one, or for ranked awards click in order (numbers on the cards; click again to take one out; Clear).
  - "Cast my vote" posts to `/api/vote`. **Votes are final**, as the server allows one ballot per award, and the page says so (the demo's "you can change your votes" was wrong). Voted awards show "Your vote", with their cards locked. It starts at the first award not voted on, and has a finish screen.
  - Signed out: a banner and "Sign in to vote", returning to `/vote`.
  - Outside voting: "Voting opens …", "Voting has closed" or "the results are out". The check matches the server's: voting mode, between both dates.
  - **Admins always get a preview** when voting isn't open, or with `?preview=voting`. It loads nominees from `/api/admin/nominees`, so it works while locked, and nothing is saved.
- **`/results` (`ResultsPage.tsx`)**, this year's results with the results summary: public in reviewing mode, an admin preview otherwise.
  - **"Simulated votes"** (admins, in preview) uses `loadSimulated()` in `Summary.tsx`: a few hundred made-up voters per award, the same each time, built in the browser and never saved. It starts on when there are no votes yet.
  - **The tally** rinlux approved: `GET /api/vote/tally` (voters, ballots and per day), public with the results and for admins with `?preview=1`. It shows in the overview.
- **`/lab` (`LabPage.tsx`):** the Big screen and the Sound check, in the site's header (a second row with the lab's tabs, and the chat toggle).
- Tests:
  - API: the five addresses and the tally's access (48 pass).
  - Browser: the admin preview while locked (22 awards, a vote not saved), the results preview (real with tally, then simulated), the lab, locked and signed-out visitors, a real vote kept after reload, and a ranked ballot saved in order.
  - The screenshot script now captures the front page, voting and results of the new site; its old baselines are out of date.

### Previews only on request, and a user menu (2026-11-09, deployed)

StrawWaffle, after the one-site deploy:
- **The admin preview showed whenever voting wasn't open.** It should only show with the preview address: `/vote?preview=voting`, and `/vote?preview=results` or `/results?preview=1`. Without it, admins see what visitors see. No "preview it" link on the visitor notice (StrawWaffle: not wanted).
- **A user menu in the header**, as the old page had. It shows your destiny.gg picture (if you have one) and your name. Hovering or clicking opens a menu with your subscriber tier, team, member-since date, Admin (if you are one), a link to your destiny.gg profile, the admin page (admins) and Sign out. Signed out, it shows a Sign in button.
  - `GET /api/me/profile` returns your own destiny.gg profile (`fetchDggProfile`), kept 10 minutes per name. The menu is `src/site/UserMenu.tsx`.
- The Vote and Results tabs now follow what visitors see (voting / reviewing mode), plus the page being previewed. Lab stays admins-only.
- Tested in the browser:
  - `/vote` and `/results` without the address show the visitor notices; with it, the previews.
  - Tester's menu (no destiny.gg profile: a letter, plus Admin and the admin page).
  - Destiny's menu (picture, member since, team, profile link).
  - Hover open and close, signing out, and the Sign in button returning to the page. 49 API tests pass.

### Previews by stage, simulated votes on the big screen, and the music start (2026-11-09, deployed)

StrawWaffle: the Lab tab shouldn't be in an admin's header outside a preview, and the previews should all live under `/preview/<stage>/<page>`, with a stage per part of the year, and the front page previewable too.
- **Addresses:** `/preview/<stage>` is the front page, then `/vote`, `/results` and `/2025` under it. The stages are `before` (Before voting), `voting` (Voting open), `closed` (Voting closed) and `results` (Results out).
  - **The lab is `/preview/lab`**, with no stage (StrawWaffle). There, no stage is marked, the stage buttons go to that stage's front page, and the tabs lead to the stage the site is in now. `/lab` and `/preview/<stage>/lab` lead there.
  - `/preview` alone goes to the stage the site is in now.
  - The old `/vote?preview=voting`, `/vote?preview=results` and `/results?preview=1` lead to their new addresses. The address bar is updated to the full one.
- **In a preview** the header has a second row: a Preview chip, the four stages (switching keeps the page) and "Leave preview" (back to the same page as visitors have it; from the lab, to the front page).
  - The pages get the settings as visitors would have them at that stage (`stageConfig()` in `Site.tsx`). The real dates are kept where they fit, otherwise made-up ones that do: before voting, a start a week out; voting open, a close 11 days out; closed, an hour ago; results out, reviewing mode.
  - The tabs are the visitors' at that stage, plus Lab.
  - **Voting open → Vote** is the voting preview (nothing saved). **Results out → Results** is the results preview with the simulated-votes switch. At other stages these pages show the notices visitors would see.
  - Non-admins on a preview address get "Previews are for admins" and a sign-in.
- **Outside a preview, admins see the site as visitors do:** no Lab tab and no preview rows.
- **Jumping between previews** (StrawWaffle): in a preview, hovering the "DGG Awards" logo (or tapping it on touch) opens a menu of every preview page: the four stages, each with Front page, Vote, Results and 2025 results, then Lab, Admin page and Leave preview. The page you're on is marked. Clicking the logo still goes to the stage's front page.
- **The admin sidebar** has one "Preview" item instead of separate links. Hovering or clicking it opens the same list, beside the sidebar (under the top bar on phones), opening in a new tab. "Open the site" stays.
- The list lives in `src/lib/previews.ts` (stages, pages, `previewPath()`), and the hover menus share `src/lib/useHoverMenu.ts` (the user menu uses it too).
- **Simulated votes on the big screen:** the settings (gear) have "Votes: Real / Simulated". It starts on simulated when there are no real votes, using the same made-up numbers as the results preview (`loadSimulated()`), and a "Simulated votes" chip shows in the controls. The big screen's nominees now come from `/api/admin/nominees`, so pictures and clips show while the site is locked.
- **The music started slowly.** The track opens with 2 s of silence and a 4 s fade-in (measured: silent to 2 s, −62 dB rising to −17 dB at 6 s). Loading wasn't the cause: the file is 2.5 MB with its index up front. Now:
  - The first start jumps to 6.02 s (a bar line on the beat map's grid), where the music is in fully, with a 0.4 s fade-in of our own.
  - Looping is by hand: at the end it goes back to 2 s, skipping the silence, and keeps the song's own fade-out and fade-in as the way round. The loop doesn't count as a pause, so the music button stays as it is (not tested in a browser: a full loop takes two minutes).
- **The drawn look is always on** (StrawWaffle): the pencil button is gone from the header, and so are the plain-look versions (`useDrawnLook`, `setDrawnLook` and the `lab.drawn` setting). Frames, hatched bars, the circled winner and the box round a pick always show.
- **Deployed** 2026-11-09 after a backup (`/data/backups/2026-11-09T22-19-17-280Z-before-deploy.db`). Live checks: every page and preview address 200, `/api/admin/checks`, `/api/me/profile` and `/api/lab/emotes` 401 signed out, `/signin` to destiny.gg.
- **Housekeeping:** the 23 merged worktrees were removed. The screenshot script now also captures the four stage previews. Its pictures aren't in git: two runs of this build match pixel for pixel, except the admin Votes tab (vote times).
- Tested:
  - typecheck and 92 unit tests; 49 API tests, with the preview addresses added
  - in the browser: both preview menus (hover, jump, close, current page marked, the admin one on a phone), every stage and page, a preview vote not saved, the old addresses rewritten, `/lab#sound` kept, non-admin and signed-out refusals, the big screen switched to simulated votes with the reveal running, and the music's first play starting at 6.02 s

### The year in DGG chat (branch `worktree-chat-review`, 2026-11-09)

StrawWaffle asked for a page from dgg-scs's report (`C:\Users\<user>\Desktop\dgg\dgg-scs\data\report-cache\year-in-review-2026.html`, data in `yir-2026.json` beside it), with a funny spin per entry, shown once the results are out, in the site's look.
- **`/chat` (`src/site/ChatReviewPage.tsx`)**, tab "Year in chat": a cover with the year in numbers, then emotes, combos, saying the streamers' names, who tagged whom, greentext, links, and law and order. Each section has highlight cards (an emote, a big handwritten number, a caption), bars that grow in, and lists or tables. Clicking any big emote fires a burst of it. The fine print lists the nicks not counted as tags (everyday words), as StrawWaffle asked; the rest of the report's method is left out.
- **Shown with the results:** `GET /api/chat-review` answers only in reviewing mode, or to admins with `?preview=1`, like the tally. The data isn't in the page's bundle, so it can't be read early. Visitors before then see "The year in chat comes out with the results". Admins see it in the "Results out" preview (`/preview/results/chat`, also in the preview menus). The front page's results panel has a "The year in DGG chat" button.
- **The data** is `src/archive/chat-2026.json`, made by `python scripts/build-chat-review.py <yir-2026.json> src/archive/chat-2026.json`. The numbers come straight from the report; what's shown and the captions are picked by hand in the script. **Left out on purpose:**
  - raw messages that are NSFW, NSFL, about real-world harm, or slurs: several "longest greentexts" (an explicit fanfic, a suicide joke, one naming RiN_LuX in a made-up abuse story), combo-breaking messages and ban reasons with slurs
  - Discord links (they expire: shown as "[self-destructed Discord image]"), NSFW links, and a link about an assault
  - artefacts: "@moderation" tagging "muted", and "Emote" as a tagged nick
- **Also on this branch (StrawWaffle):** the Lab tab is gone from the header, even in a preview; the lab is in the logo's preview menu and keeps its own row of tabs. The "Admin" chip in the user menu is now a link to the admin page.
- **For rinlux to look at:** the "Law and order" section names people mods punished (only light ones: RiN_LuX and JaydrVernanda muted by Bing, the most throttled, the most duels lost), and the page lists real nicks throughout.
- Tested: typecheck, 92 unit tests, 50 API tests (a new one: the year in chat is refused while voting and to non-admins in preview, and has no Discord links), and in the browser in light, dark and at phone width (no sideways scroll, every emote drawn, the bursts, and the locked notice for visitors).

### Next: the lab page (StrawWaffle's answers, 2026-11-09)

StrawWaffle wants the front page and the presentation to feel fun, quirky and wholesome. It gets built on an experimental page first (`/lab`, admins only) until rinlux approves. Order: the follow-ups above, merge and deploy, then the lab.
- **Music:** the dgg-karaoke menu track, "black lover (instrumental only)" by Tiny Ghost Studios. **StrawWaffle has approval to use it.**
  - Do both approaches: host our own copy and analyse it live in the browser (Web Audio AnalyserNode), and also precompute a beat and energy map from it.
  - Start on the first click at a low volume, with a volume bar and a mute button, remembered per browser, like dgg-karaoke.
  - Credit the track the way dgg-karaoke's menu footer does.
  - **Needed from StrawWaffle:** the audio file.
- **Emotes instead of icons** where they're clear, reacting to what you do. StrawWaffle suggests:
  - Klappa for clapping (the usual applause)
  - PepoG (taking notes) for survey-type parts
  - dgg-radio's music emotes for the music
  - Render them the way dgg-radio does (`emotes.md`): CDN `emotes.css`, emotes as background elements, sized with `zoom` or `scale`.
- **Chat characters in presentation mode:** chatters shown as emote "NPCs" walking around, clapping and doing emote combos.
  - **Only on the stream screen.** Presentation mode is for an allowlist of users, admins included, not the public.
  - **Names are shown.** Messages that aren't pure emotes are mostly dropped. People with a verifiable DGG connection (orbiters, friends of the stream, notable chatters, perhaps via flairs; see dgg-radio's `flairs.md`) could get their message shown briefly at the right moment, such as when they win an award.
  - **Built for a flood:** chat gets extremely busy during the awards. The server holds one connection to `wss://chat.destiny.gg/ws` (browsers are refused, so it's a relay, as in dgg-radio's `src/server/dgg-socket.ts` and `dgg-chat.ts`) and sends the page a small summary a few times a second. The page draws a capped number of characters on a canvas. Stress test it by replaying recorded chat at many times the speed.
- **Music-reactive animation** from the analysis: things on the page move to the track.

### The lab, first version (2026-11-09, deployed)

`/lab`, admins only: the page checks `/api/me`, and the chat socket and emote list check the session on the server. Test container `dgga-lab` (port 3600, image `dgga:lab`).
- **Music** (`src/lab/music.ts`, `MusicBar.tsx`):
  - The track is in `src/lab/assets/`, served at `/lab/black-lover.m4a` with byte ranges. An MP3 copy is used where the browser has no AAC (`canPlayType`).
  - It starts on the first click or key press at 25%. Volume, mute and "switched off" are remembered in localStorage.
  - The credit links the SoundCloud page. Visuals read the music before the volume, so they keep moving when muted.
- **Beat map:** `scripts/analyze-track.ts` (needs ffmpeg, so run it in the app image) works out per-band energy from an FFT, onsets from spectral flux, and the tempo. The result is `black-lover.beats.json` (26 KB, bundled into the page).
  - Autocorrelation alone favoured 80.7 bpm, with 117.5 and 123 close behind: a triplet feel at a coarse step. Fitting a beat grid to the onsets settles it at **120.0 bpm**, with 209 of 249 beats landing on an onset.
  - The page can animate from the map or the live analyser (`AnalyserNode`). Both are shown side by side to compare.
- **Emotes** come from destiny.gg's own `emotes.css` (linked from the CDN), as `<span class="emote NAME">` with dgg-radio's base rule and looping fix (`Emote.tsx`). All the names used exist in the catalogue.
- **Reactions** (`VoteDemo.tsx`, `Bursts.tsx`): a mock voting flow. Klappa bursts when you pick, Skip when you skip, PepoG heads the survey question, and CHEERSTINY plus Klappa when you finish. A row of dancing emotes (catJAM, AlienPls, pepeJAM, RainbowPls, GatoPls, RaveDoge, YAM, Listening) hops on the beat and swells with the bass.
- **Chat relay** (`src/server/lab/`):
  - One server connection to `wss://chat.destiny.gg/ws` with no Origin header (Bun's WebSocket client). It's opened only while a stage listens, closed a minute after the last one leaves, and reconnects with jittered backoff and a 30 s silence check.
  - `ChatAggregator` turns each quarter second into a fixed-size summary: message count, emote-only count, a reservoir sample of 40 emote-only messages (nick, emote, flair), the top 8 emotes, the running combo, and up to 3 messages from verified people.
  - Emote matching follows chat's rules (whole words, case-sensitive, the author's sub tier). Bots (`bot`, `flair11`) are ignored.
  - "Verified" = destiny.gg's **Verified** flair (`flair20`), Notable (`flair2`), Broadcaster (`flair12`), moderators, admins and the head mod (`VERIFIED_FLAIRS`).
- **Stage** (`Stage.tsx`, `chatFeed.ts`): chatters as their emotes with names in their flair colour. They walk at different depths, hop on the beat, and jump with combos ("×N C-C-C-COMBO").
  - "Winner moment" turns everyone into Klappa for 4 seconds. Verified messages show as speech bubbles when that option is on.
  - Characters are plain DOM elements moved per frame, never React state, capped (default 150). Whoever has been quiet longest makes room, and characters leave after a minute of silence.
  - The simulator floods the same aggregator in the browser at up to 5,000 messages a second, with combos and the odd verified message.
- **Measured:** the aggregator handles 100,000 messages in 171 ms (`tests/lab-chat.test.ts`, about 580k a second). In Chromium the stage holds **60 fps at 3,000 messages a second** with 150 characters, and the aggregator takes about 1 ms per quarter second. The live relay connected to the real chat.
- **Still to do:** presentation mode for an allowlist (not just admins); deciding which emotes go where on the real pages; the real front page and presentation design (rinlux).

### The lab, cozy redesign (2026-11-09, deployed)

StrawWaffle's visual reference: screenshots of destiny.gg with a **community-made skin** (not the official design; StrawWaffle asked to treat it as a skin). Only the admin page keeps its own look.
- **Look** (`src/lab/lab.css`): cream (light) or navy (dark), colours sampled from the screenshots. Soft panels have 22 px corners, a 2 px border and a solid 5 px shadow underneath. Chunky rounded buttons sit on a 4 px shadow and press down when clicked; the primary is teal. Small rounded chips (coral, green, cream), and the bundled Nunito font (`@fontsource-variable/nunito`, no Google request).
  - **No leaf pattern** (StrawWaffle): faint emote silhouettes sit behind the page instead (`EmoteBackdrop.tsx`). They're real emotes from destiny.gg's stylesheet, flattened to one colour by a CSS filter, very faint, and frozen. Only transparent emotes are used; photo emotes would show as rectangles.
- **Theme:** system, light or dark, remembered (`theme.ts`). The button cycles through them.
- **Layout** (`Lab.tsx`): a blue header bar with a "DGG Awards" wordmark pill, tabs (Voting, Big screen, Sound check, kept in the URL hash), round music controls and the theme button. The music credit sits in the footer.
- **Voting:** the real (sample) nominees with pictures, one award at a time, with "Your ballot" progress on the left (Klappa for voted, "skipped").
- **Big screen:** laid out like the reference's stream and chat.
  - The stage is framed and theme-aware: day sky and green hill in light, purple night in dark, with the award on a cream sign.
  - Under it, an info card with chips (Presenting, msg/s, emote-only/s, feed, aggregator time), the award title, "Winner moment" and folding stage settings.
  - On the right, a chat column: sampled characters as "nick: emote", verified messages highlighted, and the combo in coral italics.
  - Names use per-theme flair colours. The stage starts at 60 characters, because 150 with names was a wall of text.

**Ideas from StrawWaffle, not built.** Several need rinlux's say first, since they are in charge of these decisions:
- **More roles** than admin, e.g. moderators or editors who can only edit nominees.
- **Lock the site behind sign-in** before voting, with a countdown to the voting date.
- **Let chosen people preview** the reveal page or other pages.
- **Where voters are:** an IP lookup for regions, asking voters directly, or asking permission before a lookup or browser location. Privacy matters here, and it ties in with the privacy page (feature 6).

## Open questions

- ~~**R2 bucket for clips.**~~ **Set up 2026-11-09:**
  - Bucket `dgg-awards-media`, location hint Eastern North America, Standard class.
  - Public at `https://dgg-awards-media.strawwaffle.dev`, a custom domain cached by Cloudflare. It isn't on `r2.dev`.
  - Account API token with Object Read & Write on that bucket only. The key ID and secret are only in the live `.env`, and all five `R2_*` settings are set there.
  - **Verified:** a real clip built into R2 played on the visitor page from the custom domain, with seeking. The test files were deleted afterwards, so the bucket is empty.
  - The Cloudflare "token value" and the jurisdiction endpoints aren't used: the S3 API only needs the key ID and secret, and the bucket has no jurisdiction.
- **Real 2025 results for the archive:** ask rinlux whether they have the 2025 production database, an export or the final numbers. The zip had none, and the live site shows fake votes. Fallbacks are rebuilding from the stream (incomplete, with garbled captions) or archiving the nominees and winners only.
  - **The 2025 code double-counted** (found 2026-11-09). A nominee in several categories got the votes from all of them, because votes joined nominees on id only. On the stream that would have affected Hasan Piker, Asmongold, Legal Mindset and "Destiny Uses his Premonition Powers". With seeded data it inflated Brainlet's total by 46% and changed its winner.
  - The zip predates the stream version, so the live 2025 site may or may not have had the bug. With rinlux's raw votes, the archive can show the **correct** results. Ask whether the announced winners match a correct count.
  - **Follow-up, StrawWaffle wants to come back to this once the current work is done:** double-check the bug and the fix.
    - Reproduce it on the original code (`dgga-base`, port 3100) against the fixed code.
    - If the 2025 votes turn up, recount them both ways and compare with the winners announced on stream.
    - The fix is the composite join in `votesRelations` in `src/lib/data/schema.ts`, covered by the results snapshot in `tests/api.test.ts`.
- **What rinlux thinks is missing** compared with the live 2025 version.

## Stack upgrade (branch `stack-upgrade`, merged into `main` 2026-11-09)

Branched from `main` at `13eb653`. The worktree `.claude/worktrees/stack-upgrade` can be removed once merged.

What it contains, one commit per step:
1. **Tests.** `tests/api.test.ts` (29 HTTP characterization tests with 2 snapshots) and `tests/visual/` (12 full-page Playwright screenshots, pixel-compared). Both were written against the original code first, and they recorded its behavior, including 2 bugs that were then fixed in step 5.
2. **Dependencies to latest, and Bun 1.3 → 1.4.** React 19.3, Tailwind 4.3, radix-ui 1.8, TanStack Query 5.107. Tailwind 4.3 changed its default font list, so the 4.1 list is pinned in `src/index.css`.
3. **TypeScript 7 type checking** (`bun run typecheck`). Also fixed the `build` script, which pointed to `build.tsx`.
4. **Hono, Zod and a typed client.**
   - The API lives in `src/server/`: `app.tsx`, `routes/{auth,public,admin}.ts`, `schemas.ts` and `middleware.ts`.
   - Bun still serves the two HTML pages, and everything else goes to `app.fetch`.
   - The frontend calls the API through `hc<AppType>` (`src/lib/client.ts`, `src/lib/queries.ts`), so request and response types are inferred from the server, not written by hand.
   - The compiler then caught wrong types: config times are strings, and session dates arrive as strings.
   - `submitVote` now waits for its request to finish.
5. **Fixes StrawWaffle approved:**
   - `/api/admin/import` now requires admin.
   - Admin vote paging works.
   - Five emote filenames now match DGG's current emote names: EatFresh, GAGAGA, mhm, peepoHug, PepoTurtle. They only matched before on case-insensitive Windows.
   - The results page shows the DGGer banner. It used to check the wrong field and point at a missing `.png`.
   - The admin tabs have no focus outline. Tabs activate on focus, so the focused tab is always the selected one.
   - New `tests/data.test.ts` checks that every referenced image exists with exact case.

Results:
- Through steps 1–4, all 29 API tests passed unchanged, and pages were pixel-identical to the original, except a focus outline on the admin tabs.
- After step 5, the only visual changes are the fixed emotes and the banner.
- `tsc` is clean.
- Dev mode (`bun --hot`) works.

Run `bun test tests/data.test.ts` on Linux, for example through the oven/bun image.

How to test (Docker only, network `dgga-test`):
- Run `dgga-mock` (the stand-in) and the app containers with `ADMIN_USERNAMES=Tester` and the `dev-client`/`dev-secret` credentials. See `tests/run.sh` for the expected setup.
- `bash tests/run.sh <app-container> --ci` runs the API tests.
- `bash tests/visual/run.sh capture <app-container> <name>`, then `bash tests/visual/run.sh compare <a> <b>`, compares screenshots.
- `tests/reset.sh` wipes users, sessions and votes and reseeds, so every run starts from the same state.
- The screenshot script pins everything else that would vary: external requests are stubbed, animated images are swapped for a still, the clock is frozen, and the app is always reached as `app.test`.

Test container commands, from Git Bash. Recreate any that are missing, and run the build from the folder under test (the repo or a worktree):

```bash
export MSYS_NO_PATHCONV=1
docker network create dgga-test
REPO='C:\Users\<user>\.t3\projects\dgg-awards'
# Login stand-in and fixture server (nginx, because ffmpeg needs byte ranges)
docker run -d --name dgga-mock --network dgga-test -p 127.0.0.1:8790:8789 -e PORT=8789 \
  -e DGG_CLIENT_ID=dev-client -e DGG_CLIENT_SECRET=dev-secret \
  -v "$REPO\dev\dgg-oauth\server.mjs:/srv/server.mjs:ro" node:22-alpine node /srv/server.mjs
docker run -d --name dgga-files --network dgga-test \
  -v "$REPO\tests\fixtures:/usr/share/nginx/html:ro" nginx:1.27-alpine
# An app under test: build an image, then run it with a name and port
docker build -t dgga:new "$REPO"   # or the worktree folder
docker run -d --name dgga-new --network dgga-test -p 127.0.0.1:3200:3000 \
  -e DGG_CLIENT_ID=dev-client -e DGG_CLIENT_SECRET=dev-secret \
  -e DGG_ORIGIN=http://dgga-mock:8789 -e DGG_AUTHORIZE_ORIGIN=http://localhost:8790 \
  -e DGG_REDIRECT=http://localhost:3200/oauth -e AUTH_SECRET=test-secret-test-secret \
  -e ADMIN_USERNAMES=Tester -e MEDIA_URL=https://cdn.dgg.events/ dgga:new
```

`dgga-main` (port 3400) is the same with the live image `dgg-awards-app`, and `dgga-base` (3100) is the original code (`dgga:baseline`). Tests must never use the real R2 settings: without them, test containers store clips locally.

## Planned features (1–4 done; see each item)

Order StrawWaffle gave: preview to rinlux first, then discuss, then these.

1. ~~**Switch to real DGG login.**~~ Done 2026-11-09 (see Current state).
2. ~~**Dependency upgrades.**~~ Done on `stack-upgrade`.
3. ~~**Regression tests, then end-to-end type safety.**~~ Done on `stack-upgrade`.
4. **Admin editing with preview**, for an allowlist of DGG accounts. It should cover editing nominees and categories, previewing how the site looks, and previewing the results reveal. StrawWaffle wants this to make setup easy for the organizers. Build it on a reworked nominee model that adds a date, a link type and clip start and end times, plus checks that reject bad links, wrong-year dates and duplicates. This is the first hill-climbing step.
   - **Editor built in step 4** (merged and deployed 2026-11-09 with step 3):
     - **Nominees tab:** `src/admin/components/editor/` has categories on the left with error and warning counts. A category shows its title, description and voting style (or the site default), then its nominees. Each nominee opens a form with an explicit Save. The old tab saved on every keystroke.
     - **Nominee form fields:** title, date, description, source link (detected type shown, with an override), clip start and end in m:ss, layout and image. That nominee's check results show in the form, and a "Viewers get: YouTube video at 1:00" preview shows the link visitors will see.
     - **Clip section in the form:** build or rebuild with live status (the list polls every 2 s while a clip builds), preview the clip and "Use this frame as the thumbnail", or upload a thumbnail.
     - **DGG profile cards:** for `dgg-profile` links, load the card (photo, tier, team, member since, bio, signature), with "Use bio as the description".
     - **Configuration tab:** now has the award year and default voting style. Also fixed: the timing fields could stay empty, because their `defaultValue` was set before the config had loaded.
     - **Preview:** the admin header links to `/?preview=voting` and `/?preview=results`. Signed-in admins see that page with a banner, and everyone else sees the real mode. `GET /api/vote/results?preview=1` is admin-only, and `/api/me` now includes `admin`.
     - **Verified in the browser:** editing Peter Miller (clip 1:00–1:15 and a date) cleared his warnings, building the clip went to Ready on its own, picking the 9 s frame updated the thumbnail, and the results preview worked while public results stayed 401.
     - **Adding:** "New category" under the category list and "New nominee" in each category take just a title (plus an optional link). The id comes from the title (`src/lib/ids.ts`, with `_2`, `_3`… if taken), and the full form opens next. Endpoints: `POST /api/admin/categories` and `/api/admin/nominees` (JSON). The Management tab that had the old forms was removed in the admin pass (see below); its server routes remain.
   - **Nominee model and checks: done on branch `worktree-nominee-model`** (step 1). The new columns are `date`, `linkType`, `clipStart` and `clipEnd`. `src/lib/links.ts` and `src/lib/nominee-checks.ts` hold the logic, `GET /api/admin/checks` and `bun scripts/check-nominees.ts` report problems, and the config gains `awardYear`. The 2025 data scores 0 of 174 clean, with 25 errors and 317 warnings. When deploying, also set `awardYear` to 2025 in the live database, because the seed only sets it for fresh databases.
   - **DGG profiles for chatter nominees** (step 1, StrawWaffle's idea).
     - `destiny.gg/u/<name>` is the "membership card". The `dgg-profile` link type is not a bare link.
     - `src/server/dgg-profile.ts` reads name, photo, sub tier, team, member since, bio and the hand-drawn **signature**. There's no API, so it parses the `id-card__*` classes. Nationality, gender and age are deliberately not read.
     - The signature is rebuilt from its path data only, because SVG can carry scripts.
     - `GET /api/admin/dgg-profile/:name` returns 404 for unknown users and 502 if destiny.gg fails.
     - Photos are one of 8 presets, so they say little about the person. The signature and bio are the personal parts. Use them in the chatter card design.
     - Not stored yet: storing needs the media storage from step 3.
   - **4a. Voting style, decided 2026-11-09.** Single pick or ranked, set **per category**, with a **site-wide default** for new categories. Ranked votes are counted by **instant runoff**, and the results page can show the rounds. This needs a schema change: votes get a rank, and the primary key becomes (uid, categoryId, optionId). Lock a category's style once it has votes.
     - **Done on the branch (step 2):**
       - `src/lib/voting.ts` does the instant-runoff counting. Ties for last place are broken by earlier rounds, nominees with no votes are dropped together, and ballots that run out of choices are counted as exhausted.
       - Migration 0003 had to be fixed by hand. drizzle-kit copied a `rank` column that doesn't exist yet, which SQLite would have filled with the text "rank".
       - `POST /api/vote` takes `{category_id, ranking}` for ranked categories, `GET /api/vote/ballots` returns a voter's ballots, and `PATCH /api/admin/settings` sets `defaultVotingStyle` and `awardYear`.
       - A category's style is locked after its first vote. Before the default changes, every category that already has votes gets its current style locked in.
       - Results for ranked categories include `runoff.rounds`, and nominees are ordered by when they were eliminated.
       - `seed.ts --ranked <ids>` generates fake ranked ballots.
       - **There's no ranked-voting interface yet.** That comes with the voting page redesign.
   - **4b. Downloaded clips, decided 2026-11-09.**
     - Use **yt-dlp**, not Cobalt. An admin enters the source URL plus start and end times, and the server downloads just that segment (`--download-sections`) and converts it to an mp4.
     - **Admins can choose the thumbnail**, either a frame from the clip or an uploaded image.
     - The site plays clips in its own `<video>`: no looping, and it stops at the end.
     - **Always link the original source at the clip's start time** (e.g. `&t=83`), so viewers can get the full context.
     - The 2025 site never did this. It embedded YouTube and Streamable by id.
     - **Built in step 3** (merged and deployed 2026-11-09):
       - **Image:** ffmpeg and yt-dlp, which is pinned and checksum-verified in the Dockerfile. Bump `YT_DLP_VERSION`/`YT_DLP_SHA256` when sites break it. yt-dlp uses Bun as its JavaScript runtime for YouTube.
       - **`src/server/clips.ts`:** a one-at-a-time background queue. Each job downloads the section with yt-dlp, converts it with ffmpeg (≤720p, H.264/AAC, fast start) and takes a thumbnail at 1/3 of the clip. Its status lives on the nominee, and unfinished jobs resume on restart.
       - **`src/server/storage.ts`:** local storage under `MEDIA_DIR=/data/media`, served at `/files/...` with byte ranges. Setting `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_PUBLIC_URL` switches to R2, which uses Bun's S3 client but hasn't been tested against a real bucket yet.
       - **Admin endpoints:** `POST /api/admin/clip`, `/thumbnail` (a frame at a given second) and `/thumbnail/upload` (re-encoded to JPEG, so only our own output is served).
       - **`ClipEmbed`:** the thumbnail opens a player that doesn't loop, with "↗ Full context: YouTube video at 1:00" linking to the source at the start time.
       - **Verified:** a real YouTube clip, 15 s, built in 16 s. It plays in the browser, stops at the end, and the link goes to `&t=60s`.
       - **No admin form for clips yet.** That's step 4.
       - **Tests** need the `dgga-files` container (nginx serving `tests/fixtures`, with byte ranges). See `tests/run.sh`.
   - **Scale.** 2025 had about 67,000 votes in 3.5 days (stream at 3:53, the caption is garbled as "67,44"), so roughly 3,000 voters.
     - Serve clips from **Cloudflare R2**, not the home tunnel. Cloudflare's free CDN terms restrict video, and the home upload couldn't handle hundreds of GB.
     - Compute results once when voting closes and serve that copy. Today every request recounts all votes.
     - Stored thumbnails also remove the per-visitor YouTube oEmbed calls, which get rate-limited.
   - Nomination timing isn't urgent (StrawWaffle, 2026-11-09).
5. **Re-pull emotes from the DGG CDN:** `https://cdn.destiny.gg/emotes/emotes.json` and `emotes.css`. Some emotes are sprite sheets or animated by CSS transforms, so a plain `<img>` won't show them correctly. DGG-Radio's `emotes.md` explains this and has a working approach to reuse.
6. **Privacy page** saying exactly what's collected (DGG id and name, IP and user agent per vote) and why, with a retention plan. Do this when StrawWaffle lifts the privacy deferral.
7. **Cloudflare bot signals:** compare results with and without suspected bot votes (shared IPs, new DGG accounts) and show both.
8. **Archive of past years** (StrawWaffle's idea, 2026-11-09). **Backlogged until the complete 2025 vote data is found.** Without full, correct counts there's nothing trustworthy to publish: the zip had no votes, the stream captions are incomplete, and the 2025 code double-counted (see Open questions).
   - Serve `/archive/<year>` from a frozen file in the repo holding that year's nominees, images, final counts and winners. Render it with the results view, fully revealed.
   - No live database or voting code is involved, so it keeps working as the site changes.
   - Start with 2025 only once its raw votes are in hand, recounted with the fixed code.

## Backlog: fixes from the 2025 stream

Source: StrawWaffle's brief, based on the awards stream transcript. Each fix needs StrawWaffle's go-ahead before work starts.

Timestamps are for the stream video, accurate to about 45 s: https://youtu.be/OXG1hRWTAf0 (append `?t=SECONDS`).
- Transcript: `C:\Users\<user>\Desktop\Workshop\results\youtube-transcript-search\20261109-022658-transcript-the-2025-destiny-dgg-awards\transcript.txt`
- Method video transcript (Theo, "Agents Sucked At UI"): `...\20261109-022933-transcript-agents-sucked-at-ui-until-today\transcript.txt`

Problems, most common first:

1. **Links open a whole VOD, channel or subreddit instead of the moment** (15:41, 18:48, 22:04, 40:06, 41:46). Many of the 97 URLs in `data.ts` are channel or profile links. This is mostly a data problem.
2. **Unclear what's clickable or what a click does.** The ↗ arrow didn't open a new tab (8:53). He didn't know there were clips (10:10, 37:45). A click played an unexpected sound (1:02:53). The heart in the acknowledgements looks clickable but isn't (2:23:25).
3. **Video playback.** Clips are about a minute each (12:29). A winner video restarted (34:32–36:53) and another looped from the start instead of showing the ending (1:07:31). Too much time spent on videos (46:47). Fullscreen would cover his stream camera (1:05:56).
4. **Nominees from the wrong year, missing or duplicated.** "Was this this year?" (1:14:18, 1:20:57, 1:42:55, 2:07:31). The Destiny–Duza debate is missing (1:17:24). The new-emote winner is from 2024 (1:53:07). Two categories have nearly identical titles (1:35:04).
5. **Controls and layout.** "Reveal all but last three" did nothing (1:32:39); that code isn't in the zip. Layout and zoom trouble at the start (7:14). Too much empty space at the bottom (2:22:36).
6. **Missing content and small mistakes.** A nominee with no video (29:53). A missing image (56:25). A percentage with no readable label (1:30:19). "DG" vs "DGG" capitalization (34:32). Emote nominees have no explanation (1:50:51).

Fix priorities from the brief:
1. Link to the exact moment: timestamped YouTube links, or embedded clips with start and end times.
2. Label every link with what it is ("▶ clip 0:45", "↗ Reddit post"). External links open in a new tab, nothing clickable-looking is dead, and there are no surprise sounds.
3. Clips stop at the end instead of looping, include the ending and are short. Add a presenter mode that leaves room for a stream camera.
4. Rebuild a working "Reveal all but last three".
5. Show each nominee's date and add an eligibility check (no events or emotes from previous years).
6. Clean-up: images, labels, duplicate titles, scroll space, DGG capitalization, emote explanations.

Method (from the Theo video): hill climbing.
- Turn the problems above into automated checks that fail until each one is fixed. For example: no bare channel or subreddit links, reveal-all reveals N−3, clips have an end time, every nominee has a date, image and label.
- For visual polish, have 2–3 reviewers from different model providers score screenshots against a before shot and a reference site. Don't tell them the target score, and use a fresh context for each review.
- Watch for drift (for example, the design going grey) and stack the work in PRs.

## Reference material

- **jadseya.com/2025/vote/released/**, the site rinlux likes (screenshotted 2026-11-09):
  - **Look:** dark, with gold foil lettering and ornate frames. Each award title is a big tilted sign hanging on ropes, pulled up by a hand-drawn character of the streamer.
  - **Flow:** a start page with a playful welcome, then one award per page with Back/Next. A collapsible left sidebar groups awards into sections with progress counters ("Games 0/6", "Moments 0/10"), and it ends with survey questions and "Done".
  - **Nominees** are tall poster cards in a row, image filling the card, title in heavy italic at the bottom. A rank badge ("1st") sits on the card.
  - **Voting:** ranked, counted with a **Condorcet** method, not instant runoff. You can rank one or all nominees and skip whole awards, and change votes any time until voting closes. Settings offer a "simpler ranker" where you type numbers instead of dragging.
  - **Extras:** achievement popups (gamification), a time-zone setting ("Joe time"), personal results and an optional public ballot after the stream, and a survey section.
  - Clip awards say "Click nominees to see the clip!" on the card row.
- **StrawWaffle's visualization article:** (not public yet) (work in progress). For the results page:
  - Use sorted horizontal bars starting at zero, with name, count and percentage labelled on each bar.
  - Show the vote total per category, and use one visual emphasis for the winner.
  - Put "with" and "without" suspected bots side by side, and explain how bots were identified.
  - Keep the colours safe for colourblind viewers, and offer a data table.
- **DGG-Radio:** `C:\Users\<user>\Desktop\dgg\dggradio`. Source of `dev/dgg-oauth`, the OAuth research and the emote notes. It also has a compose and tunnel setup like this one.
