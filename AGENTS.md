# DGG Awards — agent guide

Voting and results site for the yearly destiny.gg community awards (DGG Awards). Live preview: https://dgg-awards.strawwaffle.dev (StrawWaffle's PC, Cloudflare tunnel). Private repo: https://github.com/StrawWaffle/dgg-awards.

**Read `docs/handoff.md` first.** It has the current state, the people involved, decisions, open questions, the planned features in order and the backlog of problems from the 2025 awards stream. Update it at the end of every session.

## Working agreements (from StrawWaffle)

- **Check with StrawWaffle before building a feature or changing behaviour or looks.** Infrastructure, tests and fixes he has approved are fine. When unsure, ask.
- **Git:** commit with short, sentence-case, past-tense messages ("Added …"). Push `main` only to the private repo (`origin`). Never push anywhere else, and never make it public: the nominee data names real people and is unreviewed for privacy.
- **Work in a git worktree** for anything bigger than a docs edit. Test it, then fast-forward `main` and deploy once StrawWaffle agrees.
- **Writing:** apply the `unslop` skill to prose. **UI:** apply the `uncodixify` skill, and match the existing look rather than inventing one.
- **Secrets** live only in the live `.env` (gitignored). Never print them or put them in commits, chat or command output. Ask StrawWaffle for new ones through T3's `request_secret` cards.
- **Keep the test containers running** (see Testing) until StrawWaffle says otherwise.
- StrawWaffle uses voice-to-text; ask when something reads oddly.

## Environment

- **Windows host, Docker Desktop. Bun is not installed on the host:** run everything in containers. Shell is Git Bash. Prefix `docker` commands that contain `/paths` with `MSYS_NO_PATHCONV=1`, or Git Bash rewrites `/data/...` into a Windows path.
- **Run project commands** (type check, unit tests, drizzle-kit) in a Bun container with the repo mounted and `node_modules` in a volume:
  ```bash
  MSYS_NO_PATHCONV=1 docker run --rm -v "C:\\Users\\<user>\\.t3\\projects\\dgg-awards:/w" \
    -v dgga-nm:/w/node_modules -w /w oven/bun:1.4 \
    sh -c "bun install --frozen-lockfile >/dev/null && bun run typecheck && bun test tests/links.test.ts tests/checks.test.ts tests/data.test.ts tests/dgg-profile.test.ts tests/voting.test.ts tests/storage.test.ts tests/ids.test.ts tests/backup.test.ts"
  ```
  For a worktree, mount its folder instead (`.claude\\worktrees\\<name>`).
- **Worktree sessions refuse complex one-liners** they can't prove stay inside the worktree. Write the commands to a script file (e.g. in the scratchpad) and run `bash <file>`.

## Architecture

- **Runtime:** Bun 1.4, React 19, Tailwind 4 (Tailwind 4.1's font stack is pinned in `src/index.css`), radix-ui, TanStack Query. SQLite via Drizzle. Hono + Zod for the API, with a typed client (`hc`). TypeScript 7.
- `src/index.tsx`: Bun serves two HTML pages, `site.html` (the public site at `/`, `/vote`, `/results`, `/chat`, `/2025`, and the admins' previews under `/preview/<stage>/<page>`, with the lab at `/preview/lab`; `/lab` leads there) and `admin.html` (`/admin`), and passes everything else to the Hono app. The admin page and the lab check for an admin themselves, and the server refuses every `/api/admin` request from anyone else. It also resumes interrupted clip jobs at start.
- `src/server/`
  - `app.tsx` assembles the API, `/robots.txt`, `/Media/*` (bundled images in `src/media`), `/files/*` (locally stored clips) and `/error`.
  - `routes/auth.ts` (destiny.gg OAuth, `/api/me`), `routes/public.ts` (nominees, voting, results) and `routes/admin.ts` (everything under `/api/admin`, admin-only via `.use(requireAdmin)`: register new routes **after** that line).
  - `schemas.ts`: Zod schemas for every input. They check shape only; data quality is `src/lib/nominee-checks.ts`.
  - `clips.ts`: the clip pipeline (yt-dlp section download, ffmpeg, thumbnails; a one-at-a-time background queue whose state lives on the nominee).
  - `storage.ts`: R2 when all five `R2_*` settings are set, otherwise local `MEDIA_DIR`.
  - `dgg-profile.ts` reads destiny.gg membership cards, and rebuilds the signature SVG from its path data only.
  - `present.ts` turns storage keys into URLs.
- `src/lib/`
  - `client.ts` and `queries.ts`: the typed API client. Don't hand-write API response types; infer them. Editor calls throw the server's error message.
  - `links.ts` (link types, timestamps, labels), `nominee-checks.ts` (data checks), `voting.ts` (single or ranked, instant runoff), `ids.ts` (ids from titles).
  - `data/schema.ts` and `data/driver.ts`: Drizzle schema and queries. Votes join nominees on **(optionId, categoryId)**; ids are only unique within a category.
- `src/admin/`: the admin page. `Admin.tsx` is the sidebar shell (sections are tabs, kept in the URL hash), `components/editor/` the nominee editor, `components/Section.tsx` the collapsible block and `components/Sortable.tsx` drag-to-reorder (dnd-kit). The dark theme is `admin.css`: it remaps Tailwind's neutral scale under `.admin-dark`, so build admin UI from `neutral-*`, `white` and the existing accents, and it works in both themes without `dark:` classes.
- **Edit history:** every admin route that changes data records it through `src/server/history.ts` (`record`, `recordNomineeUpdate`, …), and `undo()` there knows how to reverse each kind. A new admin write needs both. Clip and thumbnail files are never deleted, so history can restore them.
- Categories and nominees are ordered by their `position` column (drag order). Queries that list them must order by it. It isn't sent in API responses.
- `src/site/`: **the public site, one page** (`Site.tsx`: header, routing, page slides). `Countdown.tsx` (the front page), `VotePage.tsx` (voting), `ResultsPage.tsx` (this year's results and tally), `ChatReviewPage.tsx` (the year in DGG chat, from `src/archive/chat-<year>.json`, built by `scripts/build-chat-review.py`), `LabPage.tsx` (the lab). The look and the shared pieces are in `src/lab/` (`lab.css`, `HeaderTools`, `Summary`, `ClipPlayer`, `Emote`, `Bursts`, `sketch`, music…), despite the folder's name. **What's agreed lives in the site; the lab (`/preview/lab`, admins) holds only experiments** (the big screen, the sound check, ranking the DGGer wildcards), built from the same pieces, so trying something there doesn't touch the real pages. `src/server/lab/` is the big screen's chat relay. Unit test: `tests/lab-chat.test.ts`.
- `drizzle/`: migrations, applied at container start by `scripts/migrate.ts`. **Always read a generated migration before committing.** drizzle-kit once generated a copy step that selected a column which didn't exist yet (0003, fixed by hand).
- `src/data.ts`: last year's (2025) nominees, used as sample data by `scripts/seed.ts`.

## Deploying (live preview)

From the repo root on `main`: `docker compose --profile tunnel up -d --build app`. Migrations run on start. Then check:
- `https://dgg-awards.strawwaffle.dev` and `/api/config` answer 200
- `/admin` answers 200 (the page checks for an admin itself) and `/api/admin/checks` answers 401 when signed out
- `/signin` redirects to www.destiny.gg

The live `.env` holds the real DGG OAuth app, `AUTH_SECRET`, the tunnel token, `ADMIN_USERNAMES` and the five `R2_*` settings (see `.env.example` for names). Its database is the `dgg-awards_awards_data` volume.

## Testing

- `bun run typecheck` must pass.
- **Unit tests** (no server): `tests/{links,checks,data,dgg-profile,voting,storage,ids,lab-chat,backup,rank}.test.ts`. Run on Linux, since `data.test.ts` checks filename case.
- **API tests:** `bash tests/run.sh <app-container> --ci`. 36 characterization tests with snapshots, run over HTTP against a running app on the Docker network `dgga-test`. `tests/reset.sh` reseeds first.
- **Screenshots:** `bash tests/visual/run.sh capture <container> <name>`, then `… compare <a> <b>`. These are full-page Playwright screenshots, pinned so two runs of the same code are pixel-identical (except the admin Votes tab, which shows vote times). They land in `tests/visual/out/` (gitignored): capture a "before" from `main` and an "after" from your branch, then compare.
- **Data score:** `bun scripts/check-nominees.ts` (exits 1 while there are errors).
- **Test containers** (network `dgga-test`):

  | Name | Port | What it is |
  |---|---|---|
  | `dgga-mock` | 8790 | `dev/dgg-oauth/server.mjs`, a destiny.gg login stand-in |
  | `dgga-files` | – | nginx serving the main repo's `tests/fixtures`; needs byte ranges |
  | `dgga-base` | 3100 | the original 2025 code |
  | `dgga-main` | 3400 | an old live image (from before the editor) |
  | `dgga-new` | 3200 | an older build under test |
  | `dgga-review` | 3500 | used for the admin work |
  | `dgga-lab` | 3600 | the latest lab build |

  App containers need `ADMIN_USERNAMES=Tester`, `DGG_CLIENT_ID=dev-client`, `DGG_CLIENT_SECRET=dev-secret`, `DGG_ORIGIN=http://dgga-mock:8789`, `DGG_AUTHORIZE_ORIGIN=http://localhost:8790`, `DGG_REDIRECT=http://localhost:<port>/oauth` and an `AUTH_SECRET`. The exact `docker run` lines are in `docs/handoff.md` ("Stack upgrade" section).
- Snapshots change only on purpose. When one changes, check the diff is exactly what you expected before `--update-snapshots`.
- In the browser (T3 preview tools), sign in as an admin at `http://localhost:<port>/signin` with username `Tester`. If the preview hangs, use Playwright in Docker on `dgga-test` (see the handoff's "At a glance"). Its Chromium has no H.264, so check clip playback in its Firefox.
- **Before every deploy**, back up the live database (`VACUUM INTO` under `/data/backups/`, see the handoff).
- **Backups and moving the site:** `docs/migration.md`. Full backups download and restore in Settings → Backups. The live site also backs up hourly to Google Drive as plain `.db` files (`src/server/backups.ts`; older encrypted `.db.enc` ones open with `BACKUP_PASSWORD`, `src/lib/backup-crypto.ts`). **Voters' IP addresses and browsers are kept only when switched on** in Settings → Privacy (`recordIp`, `recordAgent`; both off since 2026-11-09). Anything new that stores either must follow those switches. A new admin write needs no backup work, but a new table is included automatically: restores copy every table except `sessions` and `states`.

## Pitfalls already hit

- **Filename case:** Windows ignores it and Linux doesn't. `tests/data.test.ts` guards image names.
- **Hono client generics:** if a response type comes out wrong, give the helper an explicit return type (see `src/server/present.ts`).
- **React Query** calls `queryFn(context)`, so wrap functions that take optional arguments: `queryFn: () => f()`.
- **`defaultValue` only applies on mount:** key a form on its loaded data.
- **Byte ranges:** ffmpeg needs them on the source server, and browsers need them on ours to seek video.
- **Cloudflare:** the free CDN restricts video, so clips are served from R2 (free bandwidth). See the cost notes in the handoff.
