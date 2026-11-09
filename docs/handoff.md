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
- **Writing:** apply the `unslop` skill to prose. **UI:** apply the `uncodixify` skill (installed at `~/.claude/skills/uncodixify`, from StrawWaffle's private skills repo).
- **Commit style:** short, sentence-case, past tense ("Added …"), per `AGENTS.md`.
- StrawWaffle uses voice-to-text, so ask when something reads oddly.

## Current state

### Running preview

| | |
|---|---|
| Site | https://dgg-awards.strawwaffle.dev |
| Local | http://localhost:3000 (pages load, but sign-in only works on the tunnel URL) |

- **Sign-in is real destiny.gg OAuth** (switched 2026-11-09, verified by StrawWaffle signing in and reaching `/admin`). The app is registered on the DGG account StrawWaffle set up for this, with the redirect `https://dgg-awards.strawwaffle.dev/oauth`. The credentials are only in `.env` (gitignored). `DGG_CLIENT_SECRET` contains `$`, so it's wrapped in single quotes there, which stops Compose from expanding it.
- Docker Compose runs `app` (Bun, with SQLite in the `awards_data` volume) and `tunnel` (cloudflared, profile `tunnel`). The `dgg-oauth` stand-in (profile `mock-auth`) is no longer run on the live stack. It's kept for local and test use, see `tests/`. Its `dgg-awards-login` Cloudflare route has been deleted.
- Cloudflare dashboard route: `dgg-awards` → `http://app:3000`.
- It currently shows the **results** page with 500 fake voters (negative uids, ip `seed`). Admins can switch to voting under Configuration in `/admin`.
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

1. `Imported dgga25 source from recovered zip`: the original code, unchanged. Diff against this to see everything we changed.
2. `Added Docker preview stack with mock destiny.gg login`
3. `Added open questions list` (now merged into this file)
4. `Added ADMIN_USERNAMES allowlist applied at sign-in`
5. `Blocked crawlers and AI indexing`

The source zip (`dgga25.zip`) was deleted at StrawWaffle's request, so commit 1 is the only copy.

### Code changes made to the original (all infrastructure)

- `src/routes/signin.ts`: sends `code_challenge_method=S256`, which destiny.gg's guide lists as required. Not yet tested against the real destiny.gg. Also adds the optional `DGG_AUTHORIZE_ORIGIN` for when the browser and server reach the login provider at different addresses.
- `src/routes/oauth.ts`: the `ADMIN_USERNAMES` allowlist.
- `src/index.tsx`: `/Media/*` serves `src/media` first, then falls back to `MEDIA_URL`. Also adds `/robots.txt`.
- `src/index.html` and `src/admin.html`: meta robots tag.
- New: `scripts/migrate.ts`, `scripts/seed.ts`, `Dockerfile`, `.dockerignore`, `compose.yaml`, `.gitattributes` and `dev/dgg-oauth/server.mjs` (copied from DGG-Radio).

## How the old site works (findings)

- **Stack:** Bun (server and bundler), React 19, Tailwind 4, Radix UI, TanStack Query, Drizzle ORM on SQLite. About 8 route files in `src/routes`. StrawWaffle wants to keep this stack.
- **Login:** destiny.gg's custom OAuth. It isn't standard PKCE: the challenge is `base64(sha256hex(verifier + sha256hex(secret)))`. DGG-Radio's `docs/research/dgg-oauth-netlify.md` documents the protocol. Sessions are signed cookies that last a week.
- **Bot defense already in place:** every vote stores a snapshot of the session (`CF-Connecting-IP`, user agent). The admin Votes tab filters by IP. Users' DGG account creation dates are stored.
- **Modes:** `locked`, `voting`, `idle`, `reviewing`, plus start and end times in the `configuration` table.
- **The zip is older than the version used on stream.** On stream there was click-to-reveal per nominee and a "Reveal all but last three" button (transcript 4:39). The zip has neither, only a single per-category "Reveal" that unblurs nominees one by one. Those features have to be rebuilt. Newest file in the zip: 2026-01-03.
- **Dead hosts:** `cdn.dgg.events`, `dgg.events` and `git.defeten.com` (the original repo). No Wayback Machine copies exist. All 88 images in `data.ts` are in `src/media`.
- The sidebar that tracks your position was never finished (`todo.md`).
- `PossibleLink` (`src/components/util.tsx`) already sets `target="_blank"`, yet on stream the ↗ arrow didn't open a new tab on left click. Not investigated.
- Results bars are drawn at `percentage / 1.6` height, which doesn't match the visualization principles below.

## Open questions

- **Voting style:** one pick per category (as in 2025), or ranked like jadseya.com? StrawWaffle wants it as an **admin setting**. Still open: per category or site-wide, and the counting method for ranked votes (instant runoff vs. Borda).
- **Clip downloads:** see planned feature 4b. Still open: where clips are stored and served from, given the home connection and Cloudflare's rules on video.
- **When nominations for 2026 open.** This decides how to order the planned features.
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

## Planned features (agreed, not started)

Order StrawWaffle gave: preview to rinlux first, then discuss, then these.

1. ~~**Switch to real DGG login.**~~ Done 2026-11-09 (see Current state).
2. ~~**Dependency upgrades.**~~ Done on `stack-upgrade`.
3. ~~**Regression tests, then end-to-end type safety.**~~ Done on `stack-upgrade`.
4. **Admin editing with preview**, for an allowlist of DGG accounts. It should cover editing nominees and categories, previewing how the site looks, and previewing the results reveal. StrawWaffle wants this to make setup easy for the organizers. Build it on a reworked nominee model that adds a date, a link type and clip start and end times, plus checks that reject bad links, wrong-year dates and duplicates. This is the first hill-climbing step.
   - **4a. Voting style as an admin setting:** single pick or ranked. Needs a schema change: votes get a rank, and the primary key becomes (uid, categoryId, optionId). Lock the setting once a category has votes.
   - **4b. Downloaded clips.** An admin enters the source URL plus start and end times. The server downloads just that segment, with yt-dlp (`--download-sections`) or StrawWaffle's Cobalt instance, turns it into an mp4 with a thumbnail, and the site plays it in its own `<video>`. That means no looping, the right segment, and nothing breaks if the source is deleted. Keep the original link as "source". The 2025 site never did this: it embedded YouTube and Streamable by id.
5. **Re-pull emotes from the DGG CDN:** `https://cdn.destiny.gg/emotes/emotes.json` and `emotes.css`. Some emotes are sprite sheets or animated by CSS transforms, so a plain `<img>` won't show them correctly. DGG-Radio's `emotes.md` explains this and has a working approach to reuse.
6. **Privacy page** saying exactly what's collected (DGG id and name, IP and user agent per vote) and why, with a retention plan. Do this when StrawWaffle lifts the privacy deferral.
7. **Cloudflare bot signals:** compare results with and without suspected bot votes (shared IPs, new DGG accounts) and show both.

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

- **jadseya.com/2025/vote/released/**, the site rinlux likes:
  - One category per page, with Back/Next buttons.
  - A sidebar with progress per section ("Games 0/6").
  - Ranked voting by drag, plus a simpler type-a-number mode.
  - Twitch login and playful copy.
  - The text fetch didn't capture the visual style, so get screenshots for that.
- **StrawWaffle's visualization article:** (not public yet) (work in progress). For the results page:
  - Use sorted horizontal bars starting at zero, with name, count and percentage labelled on each bar.
  - Show the vote total per category, and use one visual emphasis for the winner.
  - Put "with" and "without" suspected bots side by side, and explain how bots were identified.
  - Keep the colours safe for colourblind viewers, and offer a data table.
- **DGG-Radio:** `C:\Users\<user>\Desktop\dgg\dggradio`. Source of `dev/dgg-oauth`, the OAuth research and the emote notes. It also has a compose and tunnel setup like this one.
