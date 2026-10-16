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
| **M13 Production cutover** on the Windows home server | **next** |
| v2 Sharing + invites, graph Q&A agent, free-text extraction | later |

All of M7–M12 is on `dev` with CI green; `main` still holds the old Amplify scaffold (nothing
deploys from it) until the M13 cutover is merged. M13 scope, from the plan: `start.ps1` /
`stop.ps1` (including warming the chat model and `embed_worker --once`), `cloudflared` +
`backup` + `embed_worker` services in a prod `compose.yml`, Cloudflare Pages deploy from Actions,
GHCR image pull, whitenoise for admin static files, event-based backups to R2 with a tested
restore, healthchecks.io, and a prod R2 bucket/CORS origin.

Photos live in a private Cloudflare R2 bucket. For local photo uploads, fill in the
`CLOUDFLARE_R2_*` values in `backend/.env` and allow `http://127.0.0.1:5174` in the
bucket's CORS policy (`PUT`, `GET`, `HEAD`; header `Content-Type`). Everything else works
without R2, and tests never touch it.

AI features use a local [Ollama](https://ollama.com): `ollama pull qwen3.8:27b` (catch-up
summaries, `CHAT_MODEL`) and `ollama pull qwen3-embedding:0.6b` (the "Ask" search,
`EMBED_MODEL`). Without Ollama everything else works; the AI features report that the AI is
unavailable. Tests use fakes and never call Ollama.

The API runs under uvicorn (ASGI), not `manage.py runserver`, because runserver can't stream
the AI summaries. Side effect until M13: Django admin pages load without CSS locally.

## Stack

- **frontend/** — React + Vite + TypeScript, Tailwind CSS + shadcn/ui, React Flow (`@xyflow/react`), Vitest, oxlint
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
uv run python manage.py createsuperuser   # accounts are admin-created; there is no sign-up
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

CI (`.github/workflows/ci.yml`) runs both on every push to `dev`/`main` and on PRs.

## Git workflow

- Work on `dev`; ship by opening a PR from `dev` → `main`.
- There is no deployed environment until the production cutover (M13).

See [MANUAL_TESTS.md](./MANUAL_TESTS.md) for the manual regression checklist.
