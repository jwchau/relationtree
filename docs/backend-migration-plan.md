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
  Graph traversal ("friends of friends") loads the visible connections in one query and searches
  in Python (`graph.py`): a recursive CTE enumerates every path, which grows exponentially in a
  dense tree (a team of coworkers who all know each other).

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
  The UI shows one tree at a time, picked in the header (see Sharing (M15)).
- **Deleting a user deletes the trees they solely own** (a `pre_delete` signal), with their
  people, connections and photos. A tree with another owner survives; editors and viewers
  alone don't keep it alive.
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
- **`/admin` is not exposed through the tunnel** — tunnel ingress routes `/api/*` only; admin is
  reachable only from the server itself (`127.0.0.1:8002`).

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
- Local dev mirrors this: Vite `:5174` → Django `:8001` directly (no Vite proxy), so CORS/CSRF is
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
- Measured in M13: containers reach Ollama via `host.docker.internal` (~40 ms) even with Ollama
  bound to `127.0.0.1`, because Docker Desktop proxies to the host. No `OLLAMA_HOST` change needed.
- `start.ps1`: start Docker Desktop if needed → wait for engine → ping/start Ollama → `compose pull` →
  `compose run --rm api migrate` → `compose up -d` → warm the chat model. `stop.ps1`: stop
  `backup` first (final backup, prints its log), then `compose down`.
- `compose.yml` sets `name: relationtree-prod`; otherwise it shares the `relationtree` project
  name with `compose.dev.yml` and mounts the dev database volume.
- Admin is published on `127.0.0.1:8002` (8000 is taken by another app on this machine), so
  it's reachable from this machine only, not the LAN.
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
- **Graph Q&A (M14):** (3) tool-calling agent ("how am I connected to Priya?"), see below.
- **v2:** (4) free-text extraction ("Met Jordan at Alex's wedding…" → proposed people/connections
  to confirm).

### Semantic search (M12)
- `GET /api/people/search?q=` embeds the question and ranks the user's people by cosine
  similarity (pgvector, HNSW index, `VectorField(1024)`). Returns the best match plus anything
  within `MATCH_WINDOW` (0.06) of it, and `pending` (people not yet indexed). 503 if Ollama is down.
- Embedded text: name, category, context, notes. Never phone, email, address or birthday.
- **Model choice, measured** on 7 people x 10 natural questions: `nomic-embed-text` and
  `qwen3-embedding:0.6b` both got 9/10 top-1, but qwen3 (with its `Instruct: ...\nQuery: ` query
  format) separates the right answer about twice as clearly (median top-1 lead 0.098 vs 0.057),
  which is what makes a relevance cutoff possible. nomic tied or lost on "finance" questions.
- Connections are included as a **relationship summary** in plain sentences from the person's
  point of view ("Is married. Has 2 children. Manages 4 people. Has 12 coworkers."), never as a
  list of names. Measured: a list of 1000 names is ~6800 tokens (silently cut at the 2048 context)
  and 10 names already pulled the vector to 0.83 similarity with the person's own description; the
  summary is ~40 tokens at any size (0.94). Natural sentences beat labels ("who is married?").
- Summaries change only when a connection is added/removed (signals on Connection bump both
  people, including cascades from deleting a person). Renames affect no one else. Changing
  `document_text()` requires a migration that marks everyone stale (see migration 0004).
- **Known limitation:** embeddings don't capture the *direction* of parent/child ("who has kids?"
  vs "who has a parent?"); four wordings each got 2-3 of 4 test questions. Directional questions
  belong to the v2 graph Q&A (tool calls over connections), not to embedding search.

### Graph Q&A (M14)
- The Ask box does two things at once: semantic search cards appear straight away, and
  `POST /api/ask` streams an answer above them. Single questions only (no follow-ups).
- `ask.py` runs a tool loop on `CHAT_MODEL` (at most 6 rounds; then a polite give-up). Tools
  (`graph.py`, read-only, scoped to one tree, never contact details): `find_people`,
  `get_person`, `people_with_relationship` (role-based: "Child" lists parents), `path_between`
  (shortest chain, max 6 steps, 2 queries at any size), `semantic_search`. Unknown tools and bad
  arguments go back to the model as errors.
- Streams newline-delimited JSON: `{"tool": progress}`, `{"text": delta}`, `{"error": …}` if the
  AI stops mid-answer, then `{"people": [{id, name}]}` (tool-result people named in the answer,
  shown as links). 503 before streaming when Ollama is down, as for summaries.
- **"This is me":** `TreeMembership.me` (per user per tree, `SET_NULL`), set with
  `PUT/DELETE /api/people/{id}/me` (viewers too: it's about the user, not the tree's data);
  `PersonOut.is_me`. When set, the model is told who "I/me/my" is.
- **Measured** (`tests/eval_ask.py`, 15 people, 12 graph questions, qwen3.8:27b): thinking on
  11/12, median 3.8 s, max 8.7 s; thinking off 8/12 with confident wrong answers ("your kids are
  Maya and Ava" for a spouse and a child). So `think=True`. The miss: an aunt by marriage
  (the model named the blood uncle only). Re-run the eval when changing the model or prompt.

### Sharing (M15)
- **One tree at a time.** List, create, search and Ask take `?tree=<id>` (404 unless a member);
  without it they use the default tree: the user's oldest owned tree, else the oldest they're in.
  The default keeps an older frontend working against a newer API. Graph tools, search and the
  "me" marker are all per tree, so answers never mix trees. `PersonOut.tree_id` lets the UI
  work out the role for any person.
- **Trees:** `GET/POST /api/trees` (my trees with my role and member count; creating makes me
  owner), `PATCH /api/trees/{id}` (rename, owners).
- **Members:** `GET /api/trees/{id}/members` (any member; usernames and roles only),
  `POST` by username (owners; 404 unknown, 409 already a member), `PATCH …/{user_id}` role
  (owners), `DELETE …/{user_id}` (owners remove anyone; anyone can leave). A tree always keeps
  an owner: demoting or removing the last one is a 409, checked under a row lock.
- **Frontend:** the header switcher remembers the tree per browser (`localStorage`, falling back
  to an owned tree); opening a person from another tree switches to it. `/trees/:id` has rename,
  members and leave. Viewers don't see add, edit, delete, photo or connection controls; the API
  enforces the same rules. Deleting a tree isn't offered yet.

### Invites (M16)
- `Invite(tree, role, token_hash, created_by, expires_at, used_at, used_by)`. The token
  (`secrets.token_urlsafe(32)`) is returned once, when made; only its SHA-256 is stored, so a
  leaked database or backup can't be used to join. Links last 7 days and work once.
- Owners: `POST/GET /api/trees/{id}/invites` (create; list pending, never tokens),
  `DELETE …/{invite_id}` (revoke). Public: `GET /api/invites/{token}` (tree, role, inviter,
  expiry). Unknown, expired, used and revoked links all get the same 404.
- `POST /api/invites/{token}/accept` (logged in; 409 and the invite stays usable if already a
  member) and `POST /api/invites/{token}/signup {username, password}` (explicit CSRF check like
  login; Django's username and password validators; usernames unique ignoring case). Both lock
  the invite row (`select_for_update`), so one link can't be used twice at once. Sign-up logs
  the new user in; like every account they also get their own empty tree.
- This is the only way to sign up. axes doesn't cover sign-up, so prod's Cloudflare rate-limit
  rule covers `/api/invites/` as well as login (one rule on the free plan).
- Frontend: the owner's settings page makes a link (shown once, with Copy) and lists or revokes
  pending ones; `/invite/:token` is public: join with one click, sign up, or sign in and come
  back; it then opens the joined tree.

### Free-text extraction (M17)
- `POST /api/extract?tree= {text}` (editors and owners, up to 2,000 characters) returns a proposal
  and saves nothing: people `{ref, name, match_id, category, context, note}` and connections
  `{a, b, type}` between refs. `POST /api/extract/apply?tree=` takes the reviewed proposal back
  and saves it in one transaction: new people (with category and context), a dated line
  appended to matched people's notes, connections (existing ones skipped). A match outside the
  tree or a dangling ref is a 422 and nothing is written.
- One non-streamed `CHAT_MODEL` call with Ollama structured output (`EXTRACT_FORMAT`) and
  thinking on. The prompt gets the note, the tree's ids and names (no contact details) and who
  "me" is. `extract.clean` re-checks everything the model says: ids must be in the tree (else an
  exact name match, else new), names are merged, unknown types, dangling ends and self-links
  are dropped. Unreadable output is a 502, Ollama down a 503.
- **Measured** (`tests/eval_extract.py`, 8 people, 10 notes): 10/10 with the final prompt
  (median 13.6 s); thinking off scored 8/10 and invented links from shared surnames. Telling
  the model that being at the same event isn't a connection fixed made-up friendships.
- Frontend: "Add from a note" on the People page (editors and owners). The review lets you
  skip people, edit new people's names and categories, re-match or un-match, edit or untick
  each note line, and untick connections; connections to skipped people drop out.

### Background jobs
- **No job queue.** Each `Person` tracks `content_version` (bumped in SQL when a searchable field
  changes, including admin edits) and `embedded_version`. `manage.py embed_worker` embeds rows
  where they differ, recording the version it read, so an edit mid-embed stays pending. Stopping
  the worker, a crash, or Ollama being down loses nothing: the rows are the queue.
  `embed_worker --once` drains the backlog and exits (for `start.ps1`).
- A model with a different vector size fails loudly (`ImproperlyConfigured`) instead of writing.

### Backups (event-driven — the server isn't on at night)
- `backup` service (`manage.py backup`, same image as the API) in the prod compose stack:
  - **on start:** if newest backup in R2 is older than 6h → dump + upload;
  - **every 2h while running:** dump + upload only if the DB changed;
  - **on SIGTERM:** final dump + upload if anything changed since the last one
    (`stop_grace_period: 60s`). Best-effort — power loss skips it.
  - A failed backup is retried on the next tick. Worst-case loss: ~2h of edits.
- "Changed" = `tup_inserted + tup_updated + tup_deleted` from `pg_stat_database`: `xact_commit`
  moves on reads (pg_dump itself bumps it) and `max(updated_at)` misses deletes.
- Separate R2 bucket `relationtree-backups`. R2 has no write-only tokens, so the token is
  Object Read & Write scoped to that bucket, and a **bucket lock on `daily/` (30 days)** stops a
  compromised server from deleting recent backups.
- Retention (no pruning code): each backup goes to `daily/<time>.dump` (lifecycle rule expires
  them at 35 days) **and** overwrites `monthly/YYYY-MM.dump` (kept). The newest backup therefore
  survives however long the server stays off. Both bucket rules must use prefix `daily/`:
  unprefixed, the lock blocks the `monthly/` overwrite (`ObjectLockedByBucketPolicy`, found in
  M13) and the lifecycle rule would delete the monthly backups.
- healthchecks.io pings (`/fail` on failure), period 7 days + 1 day grace. No uptime monitoring
  (would alert constantly).
- Restore drill: `scripts/restore-drill.ps1` restores the newest dump into a throwaway Postgres
  and compares row counts with the live database. Run quarterly.

### CI/CD
- **No deployed dev environment.** Laptop = dev, `main` = prod. Keep `dev` → PR → `main`.
- GitHub Actions on every PR/push:
  - frontend: typecheck, lint, test, build;
  - backend: ruff, mypy, pytest against a Postgres (pgvector) service container;
  - generated API types are up to date.
- On `main` after checks pass: build Django image → push to GHCR (`latest` + SHA);
  `wrangler pages deploy` from Actions (not Cloudflare's git integration, so the CI gate holds).
  `VITE_API_URL` and `CLOUDFLARE_ACCOUNT_ID` are repo variables; `CLOUDFLARE_API_TOKEN` a secret.
- Hostnames: app `relationtree.johnchau.org` (Pages), API `relationtree-api.johnchau.org` (tunnel).
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
| M13 | **Prod cutover.** `start.ps1`/`stop.ps1`, `cloudflared` in compose, Pages deploy, GHCR pull, event-based backups + **tested restore**, healthchecks.io. Done 2026-10-18; healthchecks.io deferred (`HEALTHCHECK_URL` empty). | Prod runs from home; real data only after backups work |
| M14 | **Graph Q&A** in the Ask box: tool-calling agent over connections, streamed answer with progress, "This is me" marker. | "How is Leo connected to Priya?" works |
| M15 | **Sharing.** Tree switcher (one tree at a time); owners manage members and roles; role-aware UI. Owners add existing users by username. | Two users share a tree |
| M16 | **Invites.** One-time `Invite(token, tree, role, expires_at)` links the owner copies; creates an account or adds the tree for a logged-in user. Only the token's hash is stored. | Invite a new person end to end |
| M17 | **Free-text extraction.** Paste a note → proposed people/connections (matched to existing people) to confirm. | "Met Jordan at Alex's wedding" adds Jordan |
