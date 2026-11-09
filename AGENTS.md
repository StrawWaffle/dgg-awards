# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the Bun + React app; entry point is `src/index.tsx`.
- `src/routes/` contains route components; `src/admin/` contains admin UI pages.
- `src/components/` is shared UI; `src/lib/` is utilities and types; `src/context/` is providers.
- `src/media/` stores bundled static assets; `src/index.css` is Tailwind styling.
- `drizzle/` stores SQL migrations; see `drizzle.config.ts` and `drizzle-prod.config.ts`.
- `scripts/` contains utilities like `make-admin.ts` and `data-to-json.ts`.
- `dist/` is the production build output; `sqlite.db` is the local dev database.

## Build, Test, and Development Commands
- `bun install` installs dependencies.
- `bun dev` starts the hot-reload dev server.
- `bun start` runs the production server (`NODE_ENV=production`).
- `bun run build.ts` builds the production bundle into `dist/`.
- `bunx --bun drizzle-kit generate` and `bunx --bun drizzle-kit push` manage migrations.
- `bun run scripts/make-admin.ts --db ./sqlite.db --username <name>` grants admin access.
- `bun run scripts/data-to-json.ts` outputs `scripts/data-to-json.out.json`.

## Coding Style & Naming Conventions
- Use Prettier (`.prettierrc`) with import sorting and Tailwind class ordering; run `bunx prettier --write .` when needed.
- Keep 2-space indentation and let Prettier format.
- Use absolute imports via the `@/` alias from `tsconfig.json`; do not use relative imports.
- Component filenames are PascalCase (e.g., `src/components/AuthButton.tsx`).

## Testing Guidelines
- No automated test runner is configured yet.
- If you add tests, document the runner and command here and keep test names descriptive.

## Commit & Pull Request Guidelines
- Follow existing commit style: short, sentence-case, past-tense summaries (e.g., “Added …”).
- PRs should include a clear description, linked issues if applicable, and screenshots for UI changes.
- Call out migration or data changes explicitly.

## Configuration & Security Notes
- Use `.env` (copy from `.env.example`) for OAuth and secrets; do not commit real credentials.
- Escape `$` characters in secrets for Bun env parsing.
- Prefer migrations over manual edits to `sqlite.db`.
