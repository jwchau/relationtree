from pathlib import Path

import django_stubs_ext
import environ

# Lets admin.ModelAdmin[Model] etc. be subscripted at runtime for type checking.
django_stubs_ext.monkeypatch()

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "corsheaders",
    "axes",
    "ninja",
    "relationtree",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Serves the admin's CSS/JS: uvicorn doesn't serve static files and prod has no web server.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Must be last: turns an axes lockout into the 429 response.
    "axes.middleware.AxesMiddleware",
]

AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

ASGI_APPLICATION = "config.asgi.application"

DATABASES = {"default": env.db("DATABASE_URL")}
# Two checkouts sharing one Postgres need different test databases, or their test runs collide.
if test_db_name := env.str("DATABASE_TEST_NAME", default=""):
    DATABASES["default"]["TEST"] = {"NAME": test_db_name}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"  # filled by collectstatic in the Docker build
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
# Locally there's no collectstatic step; serve straight from the installed apps instead.
WHITENOISE_USE_FINDERS = DEBUG
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# The frontend (Cloudflare Pages, or Vite on :5174 locally) is a different origin from the API,
# so session-cookie auth needs credentialed CORS plus a trusted CSRF origin.
# See docs/backend-migration-plan.md → Topology.
FRONTEND_ORIGINS = env.list("FRONTEND_ORIGINS", default=["http://127.0.0.1:5174"])
CORS_ALLOWED_ORIGINS = FRONTEND_ORIGINS
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = FRONTEND_ORIGINS

# In prod, cloudflared forwards to Django over plain HTTP and sets X-Forwarded-Proto. Trusting
# it is safe for the same reason as CF-Connecting-IP below: only the tunnel (and this machine,
# for admin) can reach Django.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

# Brute-force protection: lock a username+IP pair after repeated failed logins.
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = 1  # hours
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]
AXES_RESET_ON_SUCCESS = True
# Behind the Cloudflare Tunnel every request arrives from cloudflared, so the real client IP
# comes from CF-Connecting-IP. Safe to trust only because Django is not reachable except
# through the tunnel.
AXES_CLIENT_IP_CALLABLE = "relationtree.client_ip.client_ip"

# Cloudflare R2 (S3-compatible) for person photos. Empty in CI: tests use a fake storage.
CLOUDFLARE_R2_ACCOUNT_ID = env("CLOUDFLARE_R2_ACCOUNT_ID", default="")
CLOUDFLARE_R2_ACCESS_KEY_ID = env("CLOUDFLARE_R2_ACCESS_KEY_ID", default="")
CLOUDFLARE_R2_SECRET_ACCESS_KEY = env("CLOUDFLARE_R2_SECRET_ACCESS_KEY", default="")
CLOUDFLARE_R2_BUCKET_NAME = env("CLOUDFLARE_R2_BUCKET_NAME", default="")

# Database backups (prod `backup` service). A separate bucket and token from the photos.
CLOUDFLARE_R2_BACKUP_ACCESS_KEY_ID = env("CLOUDFLARE_R2_BACKUP_ACCESS_KEY_ID", default="")
CLOUDFLARE_R2_BACKUP_SECRET_ACCESS_KEY = env("CLOUDFLARE_R2_BACKUP_SECRET_ACCESS_KEY", default="")
CLOUDFLARE_R2_BACKUP_BUCKET_NAME = env("CLOUDFLARE_R2_BACKUP_BUCKET_NAME", default="")
# healthchecks.io ping URL; alerts when backups stop arriving. Empty: no pings.
HEALTHCHECK_URL = env("HEALTHCHECK_URL", default="")

# Local LLM (Ollama). See docs/backend-migration-plan.md -> AI.
# 127.0.0.1, not localhost: on Windows "localhost" tries IPv6 first and adds ~2 s per call.
OLLAMA_URL = env("OLLAMA_URL", default="http://127.0.0.1:11434")
CHAT_MODEL = env("CHAT_MODEL", default="qwen3.8:27b")
# Changing the embedding model means re-embedding everyone (and maybe a new vector size).
EMBED_MODEL = env("EMBED_MODEL", default="qwen3-embedding:0.6b")
# Caps the embed model's KV cache: its default 32K context costs ~4.6 GB of VRAM vs ~1 GB.
EMBED_NUM_CTX = env.int("EMBED_NUM_CTX", default=2048)
OLLAMA_NUM_CTX = env.int("OLLAMA_NUM_CTX", default=8192)
OLLAMA_CONNECT_TIMEOUT = env.float("OLLAMA_CONNECT_TIMEOUT", default=3.0)
# How long Ollama keeps the model in VRAM after a request. Not forever, so the GPU frees up
# for other things (games) when the app isn't in use.
OLLAMA_KEEP_ALIVE = env("OLLAMA_KEEP_ALIVE", default="1h")
# Must cover a cold model load: ~100 s to get qwen3.8:27b (~17 GB) into VRAM.
AI_FIRST_TOKEN_TIMEOUT = env.float("AI_FIRST_TOKEN_TIMEOUT", default=180.0)

# Without this Django drops INFO logs, so the embed_worker and backup services would run silently.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "loggers": {"relationtree": {"handlers": ["console"], "level": "INFO"}},
}
