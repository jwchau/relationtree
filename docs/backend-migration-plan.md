# Backend migration plan: Amplify → Django + Postgres (self-hosted)

Status: agreed 2026-10-15. Replaces AWS Amplify Gen 2 (Cognito, AppSync/DynamoDB, S3, Hosting).
The React frontend stays.

## Why

- **Self-host + cost control** — run on a home server with Docker instead of AWS.
- **AI features** — local LLM via Ollama; Postgres + pgvector for semantic search.
- **Sharing with others (v2)** — needs a relational permission model that Amplify's owner-only auth fights.

Not a goal: preserving existing data. Nobody uses the Amplify app; we start fresh.

## Decisions

### Backend framework
- **Django + Django Ninja** (not Django *and* FastAPI). Ninja gives Pydantic schemas, type hints,
  OpenAPI and async views; Django gives auth, sessions, admin, ORM, migrations.
- Served via ASGI (uvicorn). CRUD views are **sync**; AI views are **async** (I/O-bound, streaming).
- Watch for N+1 queries (`select_related`/`prefetch_related`, `django_assert_num_queries` in tests).
  Graph traversal ("friends of friends") uses recursive CTEs via raw SQL or `django-cte`.

### Data model
```
User (Django built-in)
Tree(id, name)
TreeMembership(tree, user, role: owner|editor|viewer) # sole source of truth for access;
                                                      # every user gets an owned default tree
Person(id UUID, tree → Tree, name, relationship_category, context, phone, email, address,
       birthday, photo_key, notes, last_contacted_date, created_at, updated_at)
Connection(id UUID, tree → Tree, person_a → Person, person_b → Person, type)
```
- **Tree-level sharing** (Google-Drive-folder model). Every query is scoped through `TreeMembership`.
  The MVP UI hides trees entirely (one default tree per user, no switcher).
- **Connection integrity enforced by Postgres:**
  - `on_delete=CASCADE` on both person FKs (replaces client-side delete loop).
  - `CheckConstraint`: `person_a != person_b`.
  - `UniqueConstraint(person_a, person_b, type)`. Multiple types per pair are allowed (coworker + friend).
  - Symmetric types (SPOUSE, SIBLING, FRIEND, COWORKER, ACQUAINTANCE) are stored canonically
    (lower UUID = `person_a`) so B–A duplicates also collide. Directional types (PARENT, MANAGER) keep order.
  - Same-tree invariant checked in the save path + tested (no composite FK).
- **Inverse labels live on the backend.** `GET /api/people/{id}/connections` returns each edge from that
  person's perspective (`{other_person, label}`, e.g. PARENT stored A→B shows "Child" from B's side).
  `relationshipTypes.ts` shrinks to dropdown labels.

### Auth
- **Django session cookies** (username + password). No JWTs.
- Accounts: **admin-created now** (`createsuperuser` / Django admin), **invite links in v2**
  (`Invite(token, tree, role, expires_at)`, one-time), **never open sign-up**.
- No email infra initially; password resets via Django admin.
- Brute-force: `django-axes` (client IP from `CF-Connecting-IP`) + a Cloudflare WAF rate-limit rule on
  `/api/auth/login`.
- **`/admin` is not exposed through the tunnel** — tunnel ingress routes `/api/*` only; admin is LAN-only.

### Topology
```
Browser ──► app.example.com (Cloudflare Pages: React build)
        └─► api.example.com ──Cloudflare Tunnel──► Django (home server) ──► Postgres
                                                          └──(private)──► Ollama
```
- Cross-origin, same-site. `django-cors-headers` with `CORS_ALLOWED_ORIGINS=[app origin]`,
  `CORS_ALLOW_CREDENTIALS=True`; `CSRF_TRUSTED_ORIGINS=[app origin]`.
- Session cookie host-only on `api.`; `SameSite=Lax`. Frontend gets the CSRF token from
  `GET /api/auth/csrf` and sends `X-CSRFToken`. All fetches use `credentials: "include"`.
- Local dev mirrors this: Vite `:5173` → Django `:8000` directly (no Vite proxy), so CORS/CSRF is
  exercised daily.

### Frontend data layer
- `openapi-typescript` generates types from Ninja's `/api/openapi.json`; `openapi-fetch` makes typed calls.
  `npm run gen:api` regenerates; CI fails if the generated file is stale.
- **TanStack Query** replaces the hand-rolled `useState`/`useEffect`/`refresh` hooks (hook names kept).
- Thin fetch wrapper: credentials, CSRF header, 401 → `/login` (network errors must *not* redirect).
- Custom `LoginPage` + `AuthProvider` (`GET /api/auth/me`) + protected routes replace `<Authenticator>`.
- Global **"Server offline"** banner — Pages is always up, the API often isn't.
- List endpoints return everything (no pagination for now); `filterAndSortPeople` stays client-side.
  (Fixes the current silent truncation bug: Amplify `list()` ignores `nextToken`.)

### Photos
- **Cloudflare R2**, private bucket, via plain `boto3` (Django only signs URLs and deletes
  objects; it never stores or serves bytes, so `django-storages` adds nothing).
- Upload: `POST /api/people/{id}/photo/upload-url` returns a ~5-minute presigned PUT signed
  for the exact content type (jpeg/png/webp/gif) and size (max 5 MB), so R2 enforces both.
  Browser uploads directly, then `PUT /api/people/{id}/photo {key}` confirms.
- `photo_key` is **server-managed**: not writable via person create/PATCH, and confirm only
  accepts keys matching this person's folder exactly (otherwise a client could point a person
  at another tree's object and receive a presigned URL for it).
- Download: `PersonOut.photo_url` is a ~1-hour presigned GET (signed locally, no round trip).
- Old objects are deleted on replace, remove, and person delete (`post_delete` signal, so admin
  and tree cascades are covered). Deletes are best-effort; failures only orphan an object.
- Keys: `trees/{tree_id}/people/{person_id}/{uuid}.{ext}`.
- Known gap: an upload URL that's requested but never confirmed leaves an orphan; a 1-day R2
  lifecycle rule can clean those up later.

### Host
- **Windows** machine, **RTX 3090 Ti (24 GB VRAM)**. Runs in ~8-hour bursts, not 24/7.
- **Ollama runs natively** on Windows (GPU just works). Django reaches it at
  `http://host.docker.internal:11434`. If containers can't connect, set `OLLAMA_HOST=0.0.0.0` and
  firewall 11434 from inbound. **Never expose Ollama publicly** (it has no auth).
- **Docker Desktop (WSL2)** runs Django, Postgres, `cloudflared` and the backup job.
  `cloudflared` is a compose service so the tunnel lives and dies with the API.
- Postgres data in a **named volume**, not a bind mount on `C:\`.
- `start.ps1`: start Docker Desktop if needed → wait for engine → ping/start Ollama → `compose pull` →
  `compose run --rm api migrate` → `compose up -d`. `stop.ps1`: `compose down` (triggers shutdown backup).
- Set Windows Update active hours so it doesn't reboot mid-session.

### AI
- **Ollama only** (no hosted LLM APIs). Python `ollama` package `AsyncClient` in async Ninja views.
- Settings: `OLLAMA_URL` (default `http://127.0.0.1:11434`; **not** `localhost`, which on Windows
  tries IPv6 first and adds ~2 s to every call), `CHAT_MODEL` (`qwen3.8:27b`), `EMBED_MODEL`
  (`qwen3-embedding:0.6b`, with `EMBED_NUM_CTX=2048`: its default 32K context costs 4.6 GB of VRAM
  vs ~1 GB).
- Always pass `num_ctx` explicitly (e.g. 8192) — Ollama's default context silently truncates.
- `think=False` for summaries (thinking models otherwise stall before the first streamed token).
- Django sends `keep_alive` (`OLLAMA_KEEP_ALIVE`, default `1h`) with every request: Ollama's
  default unloads after 5 idle minutes, and a cold load of qwen3.8:27b takes ~100 s (warm: first
  token <1 s, ~35 tok/s on the 3090 Ti). Not `-1`, so VRAM frees up for games after an hour.
  Ollama's default `OLLAMA_MAX_LOADED_MODELS` (auto: 3 per GPU, VRAM permitting) already keeps
  the chat and embed models resident together (17.3 + ~1 GB of 24 GB); no change needed.
- First-token timeout is 180 s (covers a cold load); connect timeout 3 s (dead Ollama fails fast).
- M13's `start.ps1` should warm the model after starting the stack, so the first summary of a
  session doesn't wait for the cold load.
- Summaries stream as `text/plain` from `POST /api/people/{id}/summary`. Local dev and prod both
  run under uvicorn, since `runserver` can't stream async responses.
- When Ollama is down/unreachable, endpoints return a clear "AI unavailable" error, never hang.
- A single `build_summary_context(person)` controls what goes into prompts.
- **MVP:** (2) catch-up summaries ("catch me up on Sam"), streamed; then (1) natural-language search
  over `context` + `notes` via embeddings in a pgvector column.
- **v2:** (3) graph Q&A via tool-calling agent ("how am I connected to Priya?");
  (4) free-text extraction ("Met Jordan at Alex's wedding…" → proposed people/connections to confirm).

### Semantic search (M12)
- `GET /api/people/search?q=` embeds the question and ranks the user's people by cosine
  similarity (pgvector, HNSW index, `VectorField(1024)`). Returns the best match plus anything
  within `MATCH_WINDOW` (0.06) of it, and `pending` (people not yet indexed). 503 if Ollama is down.
- Embedded text: name, category, context, notes. Never phone, email, address or birthday.
- **Model choice, measured** on 7 people x 10 natural questions: `nomic-embed-text` and
  `qwen3-embedding:0.6b` both got 9/10 top-1, but qwen3 (with its `Instruct: ...\nQuery: ` query
  format) separates the right answer about twice as clearly (median top-1 lead 0.098 vs 0.057),
  which is what makes a relevance cutoff possible. nomic tied or lost on "finance" questions.
- Known gap: connections aren't part of the searchable text yet ("who has a family member?").

### Background jobs
- **No job queue.** Each `Person` tracks `content_version` (bumped in SQL when a searchable field
  changes, including admin edits) and `embedded_version`. `manage.py embed_worker` embeds rows
  where they differ, recording the version it read, so an edit mid-embed stays pending. Stopping
  the worker, a crash, or Ollama being down loses nothing: the rows are the queue.
  `embed_worker --once` drains the backlog and exits (for `start.ps1`).
- A model with a different vector size fails loudly (`ImproperlyConfigured`) instead of writing.

### Backups (event-driven — the server isn't on at night)
- `backup` container in the prod compose stack:
  - **on start:** if newest backup in R2 is older than 6h → dump + upload;
  - **every 2h while running:** dump + upload only if the DB changed (compare `xact_commit` or `max(updated_at)`);
  - **on SIGTERM:** final dump + upload (`stop_grace_period: 60s`). Best-effort — power loss skips it.
  - Worst-case loss: ~2h of edits.
- Separate R2 bucket `relationtree-backups`, **write-only token**.
- Retention: last 50 + one per calendar month.
- healthchecks.io ping with a **7-day** grace period. No uptime monitoring (would alert constantly).
- Restore drill: a script loads the latest dump into a throwaway local Postgres. Run quarterly.

### CI/CD
- **No deployed dev environment.** Laptop = dev, `main` = prod. Keep `dev` → PR → `main`.
- GitHub Actions on every PR/push:
  - frontend: typecheck, lint, test, build;
  - backend: ruff, mypy, pytest against a Postgres (pgvector) service container;
  - generated API types are up to date.
- On `main` after checks pass: build Django image → push to GHCR (`latest` + SHA);
  `wrangler pages deploy` from Actions (not Cloudflare's git integration, so the CI gate holds).
- Server pulls on startup (`start.ps1`). Nothing connects inbound. No self-hosted runner, no Watchtower.
- Backend changes must be backward-compatible (expand → deploy → contract), since the frontend can ship
  before the server next restarts.

### Repo & tooling
```
relationtree/
├── frontend/          # React app (Vite, Tailwind, shadcn, React Flow)
├── backend/           # Django project (uv)
│   ├── config/        # settings, urls, asgi
│   └── relationtree/  # apps
├── compose.dev.yml    # dev: Postgres only
├── compose.yml        # prod (M13)
├── docs/
└── .github/workflows/
```
- Python: `uv`, `ruff` (lint + format), `mypy` + `django-stubs`, `pytest-django`.
- Secrets: `django-environ` reading a git-ignored `.env`; CI secrets in GitHub Actions secrets.

### Testing
- **pytest-django against real Postgres** (never SQLite — constraints, pgvector, CTEs are Postgres-only).
- Priority: (1) permission tests — non-member gets 404 on every endpoint; (2) connection invariants;
  (3) query-count assertions on list endpoints; (4) AI layer with a fake Ollama client — CI never
  calls a real model.
- Frontend: Vitest for pure logic; MSW only if hooks/components get tests; no E2E yet.
  `MANUAL_TESTS.md` before cutover and releases.
- TDD (red → green) for permission and connection-rule tests in M8/M9.

## Milestones

| # | Milestone | Done when |
|---|---|---|
| M7 | **Skeleton + Amplify teardown.** `frontend/` + `backend/` restructure, dev compose (pgvector), Django + Ninja + Postgres, `/api/health`, CI for both halves. Delete `amplify.yml`; tear down the Amplify app + both branch backends (verify no retained DynamoDB tables / S3 buckets in CloudFormation). | `/api/health` green in CI |
| M8 | **Auth + trees + people CRUD.** Sessions, CSRF endpoint, `django-axes`, default tree per user, generated TS client, TanStack Query, `LoginPage`. Remove the Amplify frontend code (`frontend/amplify/`, `aws-amplify` packages) and restore frontend typecheck + build in CI. | Log in and manage people locally |
| M9 | **Connections.** Constraints + backend inverse labels. | Detail page + graph work locally |
| M10 | **Photos via R2** (dev bucket). | Uploads work |
| M11 | **AI summaries** against local Ollama (`OLLAMA_URL=http://127.0.0.1:11434`), streamed. | "Catch me up on Sam" works |
| M12 | **Semantic search.** pgvector, `embed_worker` (version-tracked, no queue), qwen3-embedding. | "Who works in finance?" works |
| M13 | **Prod cutover.** `start.ps1`/`stop.ps1`, `cloudflared` in compose, Pages deploy, GHCR pull, event-based backups + **tested restore**, healthchecks.io. | Prod runs from home; real data only after backups work |
| v2 | Sharing + invites, graph Q&A agent, free-text extraction. | — |
