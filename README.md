# RelationTree

A personal relationship tracker: add people (family, friends, coworkers,
acquaintances), link them to each other with typed relationships, and browse
the resulting graph.

> **Mid-migration.** The backend is moving from AWS Amplify to a self-hosted
> Django + Postgres stack. See [docs/backend-migration-plan.md](./docs/backend-migration-plan.md)
> for the agreed design and milestones.

## Status

| Milestone | State |
|---|---|
| M7 Skeleton, Amplify torn down | ✅ |
| M8 Session auth, trees, people CRUD | ✅ |
| M9 Connections (DB-enforced, backend labels) | ✅ |
| M10 Photos on Cloudflare R2 (presigned) | ✅ |
| M11 AI catch-up summaries (local Ollama, streamed) | ✅ |
| M12 "Ask" semantic search (pgvector + qwen3-embedding, relationship summaries) | ✅ |
| M13 Production cutover on the Windows home server | ✅ (healthchecks.io ping not set up yet) |
| M14 Graph Q&A in Ask (tool-calling agent, "This is me") | ✅ |
| M15 Sharing (tree switcher, members and roles) | ✅ on `dev` |
| M16 Invite links (one-time, the only way to sign up) | ✅ on `dev` |
| M17 Free-text extraction ("Add from a note", reviewed before saving) | ✅ on `dev` |

Production runs at https://relationtree.johnchau.org since 2026-10-18. Merging `dev` to
`main` is what deploys (see [Production](#production)).

Photos live in a private Cloudflare R2 bucket. For local photo uploads, fill in the
`CLOUDFLARE_R2_*` values in `backend/.env` and allow `http://127.0.0.1:5174` in the
bucket's CORS policy (`PUT`, `GET`, `HEAD`; header `Content-Type`). Everything else works
without R2, and tests never touch it.

AI features use a local [Ollama](https://ollama.com): `ollama pull qwen3.8:27b` (catch-up
summaries, `CHAT_MODEL`) and `ollama pull qwen3-embedding:0.6b` (the "Ask" search,
`EMBED_MODEL`). Without Ollama everything else works; the AI features report that the AI is
unavailable. Tests use fakes and never call Ollama.

The API runs under uvicorn (ASGI), not `manage.py runserver`, because runserver can't stream
the AI summaries. whitenoise serves the admin's CSS/JS.

## Stack

- **frontend/** — React + Vite + TypeScript, Tailwind CSS + shadcn/ui, d3-zoom (the family map), Vitest + Testing Library (jsdom), oxlint
- **backend/** — Django + Django Ninja on ASGI, PostgreSQL (pgvector), pytest-django, ruff, mypy; managed with `uv`

## Local development

Prerequisites: Docker, Node 24, [uv](https://docs.astral.sh/uv/).

```bash
# 1. Database (Postgres + pgvector)
docker compose -f compose.dev.yml up -d

# 2. Backend → http://127.0.0.1:8001 (API docs at /api/docs)
cd backend
cp .env.example .env
uv sync
uv run python manage.py migrate
uv run python manage.py createsuperuser   # the first account; others join via invite links
uv run uvicorn config.asgi:application --reload --port 8001

# 3. Frontend → http://127.0.0.1:5174 (second terminal)
cd frontend
npm install
npm run dev

# 4. Search indexer (third terminal, optional): keeps "Ask" search up to date as people change.
#    Safe to stop any time; it catches up on whatever changed when it starts again.
cd backend
uv run python manage.py embed_worker
```

To try the map at scale, `uv run python manage.py seed_scale_tree --owner <username>` adds a
generated tree of 1,000 made-up people and 3,000 connections ("Synthetic scale (1,000)"),
the same every time; `--replace` rebuilds it. Local databases only.

### After changing the API

The frontend's API types are generated from the backend's OpenAPI schema. CI fails if either
file is stale.

```bash
cd backend && uv run python manage.py export_openapi_schema --api relationtree.api.api \
  --output ../frontend/src/api/openapi.json --indent 2
cd ../frontend && npm run gen:api
```

### Local gotchas (Windows)

- Use `127.0.0.1`, not `localhost`, for Ollama: `localhost` tries IPv6 first and adds ~2 s per
  call (`OLLAMA_URL` already defaults to this).
- Stopping a dev server's terminal/task can leave its `node`/`python` child running and holding
  port 5174/8001; check with `Get-NetTCPConnection -LocalPort 5174,8001`.
- Changing what `search.document_text()` produces needs a migration that bumps every person's
  `content_version` (see migration 0004), or existing search entries stay stale.

## Checks

```bash
# backend/
uv run ruff format --check . && uv run ruff check . && uv run mypy . && uv run pytest

# frontend/
npm run typecheck && npm run lint && npm run test && npm run build
```

Frontend tests run in node. Component tests opt into jsdom with a `// @vitest-environment jsdom`
comment on their first line (see `src/components/map/MapCanvas.test.tsx`).

CI (`.github/workflows/ci.yml`) runs both on every push to `dev`/`main` and on PRs.

## Production

Runs on the Windows home server, only while it's on:

```
Browser ─► https://relationtree.johnchau.org      Cloudflare Pages (the React build)
       └─► https://relationtree-api.johnchau.org  Cloudflare Tunnel ─► compose.yml on this machine
                                                   (api, embed_worker, backup, db, cloudflared)
                                                   └─► Ollama, native on Windows (GPU)
```

- **Deploying:** merge `dev` → `main`. After checks pass, CI pushes the API image to GHCR
  (`latest` + commit SHA) and deploys the frontend to Pages. The server picks up the new image
  on its next `start.ps1`, so API changes must stay backward-compatible with the deployed frontend.
- **Daily use:** `.\start.ps1` (starts Docker Desktop and Ollama if needed, pulls, migrates, starts
  the stack, warms the chat model) and `.\stop.ps1` (final backup, then `compose down`).
- **Admin:** http://127.0.0.1:8002/admin/ on the server only. The tunnel forwards `/api/` and
  nothing else. First account: `docker compose --env-file .env.prod run --rm api python manage.py createsuperuser`;
  everyone else joins through an invite link from a tree's settings.
- **Backups:** the `backup` service uploads a `pg_dump` to the `relationtree-backups` R2 bucket on
  start (if the newest is over 6h old), every 2h if the database changed, and on shutdown.
  `daily/<time>.dump` is bucket-locked for 30 days and expires at 35; `monthly/YYYY-MM.dump` is
  overwritten by each backup and kept. Restore drill (quarterly): `.\scripts\restore-drill.ps1`.

### One-time setup

1. `.env.prod` from `.env.prod.example` (git-ignored; all secrets live here).
2. `docker login ghcr.io` with a classic PAT that has `read:packages` (the image is private).
3. Cloudflare: tunnel `relationtree` routes `relationtree-api.johnchau.org` path `^/api/` to
   `http://api:8000`; one WAF rate-limit rule (the free plan allows only one) matching both
   `POST /api/auth/login` and paths starting with `/api/invites/` (invite sign-up isn't covered
   by axes); Pages project `relationtree`
   with custom domain `relationtree.johnchau.org`; bucket lock and lifecycle rules on the backups
   bucket use prefix `daily/` (not the whole bucket, or `monthly/` can't be overwritten or kept).
4. GitHub: secret `CLOUDFLARE_API_TOKEN` (Pages: Edit); variables `CLOUDFLARE_ACCOUNT_ID`,
   `VITE_API_URL=https://relationtree-api.johnchau.org`.

## Git workflow

- Work on `dev`; ship by opening a PR from `dev` → `main` (which deploys).

See [MANUAL_TESTS.md](./MANUAL_TESTS.md) for the manual regression checklist.
