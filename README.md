# RelationTree

A personal relationship tracker: add people (family, friends, coworkers,
acquaintances), link them to each other with typed relationships, and browse
the resulting graph.

> **Mid-migration.** The backend is moving from AWS Amplify to a self-hosted
> Django + Postgres stack. See [docs/backend-migration-plan.md](./docs/backend-migration-plan.md)
> for the agreed design and milestones. Until M8, the frontend still contains
> its old Amplify data layer and is not wired to the new API.

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
uv run python manage.py runserver

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
