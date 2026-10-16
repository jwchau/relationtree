# RelationTree

A personal relationship tracker: add people (family, friends, coworkers,
acquaintances), link them to each other with typed relationships, and browse
the resulting graph.

> **Mid-migration.** The backend is moving from AWS Amplify to a self-hosted
> Django + Postgres stack. See [docs/backend-migration-plan.md](./docs/backend-migration-plan.md)
> for the agreed design and milestones.

Photos live in a private Cloudflare R2 bucket. For local photo uploads, fill in the
`CLOUDFLARE_R2_*` values in `backend/.env` and allow `http://localhost:5173` in the
bucket's CORS policy (`PUT`, `GET`, `HEAD`; header `Content-Type`). Everything else works
without R2, and tests never touch it.

AI catch-ups use a local [Ollama](https://ollama.com) (`ollama pull qwen3.8:27b`, or set
`CHAT_MODEL`). Without it, everything works except the "Catch me up" card, which reports that
the AI is unavailable. Tests use a fake model and never call Ollama.

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

# 2. Backend → http://localhost:8000 (API docs at /api/docs)
cd backend
cp .env.example .env
uv sync
uv run python manage.py migrate
uv run python manage.py createsuperuser   # accounts are admin-created; there is no sign-up
uv run uvicorn config.asgi:application --reload --port 8000

# 3. Frontend → http://localhost:5173 (second terminal)
cd frontend
npm install
npm run dev
```

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
