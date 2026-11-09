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
- **Test containers** `dgga-base` (original code, port 3100), `dgga-new` (port 3200) and `dgga-mock` (port 8790), on network `dgga-test`, stay running until StrawWaffle says otherwise. `dgga-base` runs the original code as the before baseline for screenshot comparisons.
- **Privacy is deferred.** The site is shared only as a private link for now. Don't spend time on it until StrawWaffle says so.
- **Old data doesn't need to keep working** (StrawWaffle, 2026-11-09). 2025 only needs to survive as the static archive. Keep using migrations for schema changes, since that's how the live database updates, but don't spend effort on compatibility with old data or import files. 2026 setup can start from a fresh database.
- **Writing:** apply the `unslop` skill to prose. **UI:** apply the `uncodixify` skill (installed at `~/.claude/skills/uncodixify`, from StrawWaffle's private skills repo).
- **Commit style:** short, sentence-case, past tense ("Added …"), per `AGENTS.md`.
- StrawWaffle uses voice-to-text, so ask when something reads oddly.

## Current state

### At a glance (end of session 1, 2026-11-09)

**Done and live:**
- Docker preview behind a Cloudflare tunnel, with real destiny.gg sign-in.
- Stack upgrade (Bun 1.4, Hono, Zod, TS 7).
- Fixes: admin import auth, vote paging, emote names, results banner and the **double-count bug**.
- Nominee model and data checks, DGG profile cards, ranked voting with instant runoff, the clip pipeline into **Cloudflare R2** (1080p, single encode), and the admin editor with add, edit, clips, thumbnails and previews.

**Repo:** `main` = deployed, pushed to the private repo. The tests and pitfalls are documented in `AGENTS.md`.

**Waiting on others:**
- rinlux's feedback on the preview.
- The voting-style decision for 2026 is made (per category, instant runoff), but the UI waits for the redesign.
- The real 2025 votes, for the archive and the double-count re-check.

**Next, in StrawWaffle's order** (see "Planned features" and "Backlog"):
1. **Voting page redesign:** ranked-voting UI, one category per page with progress (like jadseya.com), cuter. The hill-climbing method applies.
2. **Results reveal and presenter mode:** reveal-all-but-last-three, clips that stop, room for the stream camera, charts per StrawWaffle's visualization article, and the runoff rounds.
3. **Re-check the double-count fix** against the original code, and against the real 2025 votes if they turn up.
4. **Admin pass** (branch `worktree-admin-pass`, waiting for StrawWaffle's review, not merged; three rounds: the cleanup; then the sidebar, dark theme, drag to reorder and collapsible sections; then edit history with undo). See "Admin pass" below.
5. Smaller items:
   - Re-pull emotes from the DGG CDN.
   - Privacy page.
   - Bot-vote comparison.
   - Precompute results when voting closes (scale).
   - A "Remove clip" button: there's no way to remove a clip in the editor yet.

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
- It currently shows the **results** page with 500 fake voters (negative uids, ip `seed`). Admins can switch to voting under Settings in `/admin`.
- `ADMIN_USERNAMES=StrawWaffle,RiN_LuX` in `.env`. Anyone on that list becomes admin when they sign in.
- Crawlers and AI indexing are blocked through `robots.txt` (with 25 AI bots named), a meta robots tag and an `X-Robots-Tag` header on images. Cloudflare's "Block AI bots" toggle was suggested but not confirmed as turned on.
- The first version is being sent to rinlux for review. **Wait for their feedback before doing the backlog.**

### Commands

```bash
docker compose --profile tunnel up -d --build
docker compose exec app bun scripts/seed.ts --mode voting                          # replaces nominees and ALL votes
docker compose exec app bun scripts/seed.ts --mode reviewing --fake-votes 500
MSYS_NO_PATHCONV=1 docker compose exec app bun scripts/make-admin.ts --db /data/sqlite.db --username <name>
```

In Git Bash, `MSYS_NO_PATHCONV=1` is needed or `/data/...` gets rewritten into a Windows path. Bun isn't installed on the host, so everything runs in Docker.

### Git history

- The first commit after "Initial commit" is `Imported dgga25 source from recovered zip`: the original code, unchanged. Diff against it to see everything we changed. The source zip was deleted at StrawWaffle's request, so that commit is the only copy.
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

## Admin pass (branch `worktree-admin-pass`, 2026-11-09)

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

### Fourth round: StrawWaffle's follow-ups on the history (2026-11-09, built)

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
