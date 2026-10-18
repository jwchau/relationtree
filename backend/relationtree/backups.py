"""Event-driven Postgres backups to R2. The server isn't on at night, so instead of a nightly
cron: back up on start if the newest backup is stale, every couple of hours if the database
changed, and once more on shutdown. See docs/backend-migration-plan.md -> Backups."""

import logging
import os
import subprocess
import tempfile
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

import boto3
import httpx
from botocore.config import Config
from django.conf import settings
from django.db import connection

logger = logging.getLogger(__name__)

MAX_AGE = timedelta(hours=6)
INTERVAL = timedelta(hours=2)


def should_backup_on_start(newest: datetime | None, now: datetime) -> bool:
    return newest is None or now - newest > MAX_AGE


def backup_keys(now: datetime) -> tuple[str, str]:
    """daily/ keys are unique (an R2 bucket lock keeps them 30 days, a lifecycle rule expires
    them at 35); monthly/ is overwritten by every backup, so the newest backup always survives
    however long the server stays off."""
    return f"daily/{now:%Y-%m-%dT%H-%M-%SZ}.dump", f"monthly/{now:%Y-%m}.dump"


def database_write_count() -> int:
    """Rows inserted, updated or deleted since Postgres started: a change detector that ignores
    reads (unlike xact_commit, which pg_dump itself bumps) and sees deletes (unlike
    max(updated_at))."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_stat_clear_snapshot()")
        cursor.execute(
            "SELECT tup_inserted + tup_updated + tup_deleted FROM pg_stat_database"
            " WHERE datname = current_database()"
        )
        row = cursor.fetchone()
    assert row is not None
    return int(row[0])


class BackupStore(Protocol):
    def newest_backup_time(self) -> datetime | None: ...

    def upload(self, path: Path, key: str) -> None: ...


class Backups:
    def __init__(
        self,
        *,
        store: BackupStore,
        dump: Callable[[Path], None],
        fingerprint: Callable[[], int],
        now: Callable[[], datetime],
        healthcheck_url: str,
        ping: Callable[[str], None],
    ) -> None:
        self._store = store
        self._dump = dump
        self._fingerprint = fingerprint
        self._now = now
        self._healthcheck_url = healthcheck_url
        self._ping = ping

    def run(self, wait: Callable[[float], bool]) -> None:
        """Back up on start if stale, then every INTERVAL if the database changed, and once
        more on shutdown. `wait` sleeps for the interval and returns True when it's time to
        stop (SIGTERM)."""
        last: int | None = self._fingerprint()
        try:
            newest = self._store.newest_backup_time()
        except Exception:
            logger.exception("Couldn't list existing backups; backing up to be safe")
            newest = None
        if should_backup_on_start(newest, self._now()) and not self.backup():
            last = None  # nothing safely stored yet: the next tick must try again
        while not wait(INTERVAL.total_seconds()):
            last = self._backup_if_changed(last)
        self._backup_if_changed(last)

    def _backup_if_changed(self, last: int | None) -> int | None:
        current = self._fingerprint()
        if current == last:
            return last
        return current if self.backup() else last

    def backup(self) -> bool:
        """Dump and upload once. Never raises: a failed backup is reported, not fatal."""
        try:
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "relationtree.dump"
                self._dump(path)
                for key in backup_keys(self._now()):
                    self._store.upload(path, key)
        except Exception:
            logger.exception("Backup failed")
            self._report("/fail")
            return False
        logger.info("Backup uploaded")
        self._report("")
        return True

    def _report(self, suffix: str) -> None:
        # healthchecks.io alerts when pings stop arriving; unset means nobody is watching.
        if self._healthcheck_url:
            self._ping(self._healthcheck_url + suffix)


class R2BackupStore:
    def __init__(
        self, *, account_id: str, access_key_id: str, secret_access_key: str, bucket: str
    ) -> None:
        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )

    def newest_backup_time(self) -> datetime | None:
        # Every backup also lands in monthly/, a short listing that always holds the newest.
        newest: datetime | None = None
        pages = self._client.get_paginator("list_objects_v2")
        for page in pages.paginate(Bucket=self._bucket, Prefix="monthly/"):
            for obj in page.get("Contents", []):
                if newest is None or obj["LastModified"] > newest:
                    newest = obj["LastModified"]
        return newest

    def upload(self, path: Path, key: str) -> None:
        self._client.upload_file(str(path), self._bucket, key)

    def download_newest(self, path: Path) -> str | None:
        """For the restore drill: fetch the newest backup, returning its key."""
        newest: tuple[datetime, str] | None = None
        pages = self._client.get_paginator("list_objects_v2")
        for page in pages.paginate(Bucket=self._bucket, Prefix="monthly/"):
            for obj in page.get("Contents", []):
                if newest is None or obj["LastModified"] > newest[0]:
                    newest = (obj["LastModified"], obj["Key"])
        if newest is None:
            return None
        self._client.download_file(self._bucket, newest[1], str(path))
        return newest[1]


def pg_dump(path: Path) -> None:
    db = settings.DATABASES["default"]
    env = {
        **os.environ,
        "PGHOST": str(db["HOST"]),
        "PGPORT": str(db["PORT"] or 5432),
        "PGUSER": str(db["USER"]),
        "PGPASSWORD": str(db["PASSWORD"]),
        "PGDATABASE": str(db["NAME"]),
    }
    result = subprocess.run(
        ["pg_dump", "--format=custom", "--no-password", f"--file={path}"],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump exited {result.returncode}: {result.stderr.strip()}")


def http_ping(url: str) -> None:
    try:
        httpx.get(url, timeout=10)
    except httpx.HTTPError:
        logger.warning("Healthcheck ping failed", exc_info=True)


def r2_backup_store() -> R2BackupStore:
    return R2BackupStore(
        account_id=settings.CLOUDFLARE_R2_ACCOUNT_ID,
        access_key_id=settings.CLOUDFLARE_R2_BACKUP_ACCESS_KEY_ID,
        secret_access_key=settings.CLOUDFLARE_R2_BACKUP_SECRET_ACCESS_KEY,
        bucket=settings.CLOUDFLARE_R2_BACKUP_BUCKET_NAME,
    )


def production_backups() -> Backups:
    return Backups(
        store=r2_backup_store(),
        dump=pg_dump,
        fingerprint=database_write_count,
        now=lambda: datetime.now(UTC),
        healthcheck_url=settings.HEALTHCHECK_URL,
        ping=http_ping,
    )
