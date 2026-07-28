<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Package manager is **npm** (`package-lock.json`). The startup update script runs `npm install`.
- Web app: `npm run dev` (Next.js 16 + Turbopack, http://localhost:3000). Lint: `npm run lint`; build: `npm run build`. Full command list is in `package.json` `scripts`.
- **Supabase is remote-hosted; there is no local Supabase stack** (no `supabase/config.toml`, `supabase start` is not applicable). The app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from env. These are not committed (`.env*` is gitignored except `.env.production`), so provide them via a `.env.local` or environment secrets to work on DB-backed routes.
- **Routes `/` (home), `/browse`, `/auth`, `/onboarding`, `/mypage`, `/matched`, `/admin/*` require Supabase env vars and throw at request time without them.** For a no-credentials smoke test, use **`/scholarships` and `/scholarships/[id]`** — they are served from committed JSON fixtures (`reports/post-phase-f0-adapter-foundation.json`, `reports/post-phase-f1-admin-review-integration.json`) via `lib/scholarships/public-scholarship-read-model.ts` and render with zero env vars. Set `POST_PHASE_O_DB_PUBLIC_READ_MODEL=true` to switch `/scholarships` to the Supabase read model.
- Tests: there is no single unified runner. The `tests/**/*.test.mjs` files are standalone `node:assert` scripts — run one directly with `node tests/post-phase-o/public-contract.test.mjs`. Many `npm run test:*` scripts also exist (mostly crawler/engine harnesses).
- The ~150 `scripts/*.mjs` crawler/ingestion jobs (`crawl:*`, `import:*`, `ingest:*`, `sync:*`) are **offline data-pipeline batch jobs** (also run via `.github/workflows/*`); they are not part of the runtime app and are not needed to boot or demo it. Many require a Supabase service-role key and network access.
- `npm run lint` reports pre-existing errors/warnings under `scripts/` that are unrelated to environment setup.
