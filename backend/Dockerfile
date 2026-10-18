# Production image for the API, embed_worker and backup services (see ../compose.yml).
# Built and pushed to GHCR by CI on main; start.ps1 pulls it.

FROM python:3.14-slim-trixie AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Dependencies first, so code changes don't reinstall them.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev


FROM python:3.14-slim-trixie
# pg_dump for the backup service. It must match the server's major version (pgvector:pg18),
# and Debian trixie only ships 17, so it comes from the PostgreSQL apt repo.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates postgresql-common \
    && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 1000 --create-home app
WORKDIR /app
COPY --from=build --chown=app:app /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
# Admin CSS/JS for whitenoise. Settings need these two values to load; nothing connects.
RUN DJANGO_SECRET_KEY=collectstatic DATABASE_URL=postgres://unused@localhost/unused \
    python manage.py collectstatic --noinput
USER app
EXPOSE 8000
CMD ["uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000"]
