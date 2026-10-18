import subprocess
from datetime import UTC, datetime, timedelta

import pytest
from django.contrib.auth.models import User
from django.db import connection

from relationtree.backups import (
    Backups,
    backup_keys,
    database_write_count,
    should_backup_on_start,
)
from tests.fakes import FakeBackupStore, FakeDumper

NOW = datetime(2026, 10, 16, 17, 0, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("newest", "expected"),
    [
        (None, True),
        (NOW - timedelta(hours=7), True),
        (NOW - timedelta(hours=5), False),
    ],
)
def test_start_backs_up_when_there_is_no_recent_backup(
    newest: datetime | None, expected: bool
) -> None:
    assert should_backup_on_start(newest, NOW) is expected


def test_each_backup_has_its_own_daily_key_and_overwrites_the_months_key() -> None:
    assert backup_keys(NOW) == ("daily/2026-10-16T17-00-00Z.dump", "monthly/2026-10.dump")


HEALTHCHECK = "https://hc-ping.test/abc"


class Harness:
    def __init__(self, healthcheck_url: str = HEALTHCHECK) -> None:
        self.store = FakeBackupStore()
        self.dump = FakeDumper()
        self.pings: list[str] = []
        self.fingerprint = 0
        self.backups = Backups(
            store=self.store,
            dump=self.dump,
            fingerprint=lambda: self.fingerprint,
            now=lambda: NOW,
            healthcheck_url=healthcheck_url,
            ping=self.pings.append,
        )


def test_backup_uploads_the_dump_to_both_keys_and_pings_the_healthcheck() -> None:
    h = Harness()

    assert h.backups.backup() is True

    assert h.store.uploads == [
        ("daily/2026-10-16T17-00-00Z.dump", b"dump-1"),
        ("monthly/2026-10.dump", b"dump-1"),
    ]
    assert h.pings == [HEALTHCHECK]


def test_failed_dump_uploads_nothing_and_reports_the_failure() -> None:
    h = Harness()
    h.dump.error = subprocess.CalledProcessError(1, "pg_dump")

    assert h.backups.backup() is False

    assert h.store.uploads == []
    assert h.pings == [f"{HEALTHCHECK}/fail"]


def test_failed_upload_reports_the_failure() -> None:
    h = Harness()
    h.store.error = ConnectionError("R2 unreachable")

    assert h.backups.backup() is False

    assert h.pings == [f"{HEALTHCHECK}/fail"]


def test_without_a_healthcheck_url_backups_still_run_but_nothing_is_pinged() -> None:
    h = Harness(healthcheck_url="")

    assert h.backups.backup() is True
    h.dump.error = subprocess.CalledProcessError(1, "pg_dump")
    assert h.backups.backup() is False

    assert len(h.store.uploads) == 2
    assert h.pings == []


def run(h: Harness, ticks: list[int], at_stop: int) -> None:
    """Run the backup loop: each wait sets the database fingerprint to the next tick's value
    (as if edits happened), then the last wait sets `at_stop` and reports SIGTERM."""
    remaining = iter(ticks)

    def wait(seconds: float) -> bool:
        fingerprint = next(remaining, None)
        h.fingerprint = at_stop if fingerprint is None else fingerprint
        return fingerprint is None

    h.backups.run(wait)


def daily_uploads(h: Harness) -> int:
    return sum(key.startswith("daily/") for key, _ in h.store.uploads)


@pytest.mark.parametrize(("age_hours", "expected"), [(5, 0), (7, 1)])
def test_starting_backs_up_only_when_the_newest_backup_is_stale(
    age_hours: int, expected: int
) -> None:
    h = Harness()
    h.store.newest = NOW - timedelta(hours=age_hours)

    run(h, ticks=[], at_stop=0)

    assert daily_uploads(h) == expected


def test_ticks_back_up_only_when_the_database_changed() -> None:
    h = Harness()
    h.store.newest = NOW  # fresh: no backup on start

    run(h, ticks=[0, 1, 1, 2], at_stop=2)

    assert daily_uploads(h) == 2  # 0 -> 1 and 1 -> 2


@pytest.mark.parametrize(("at_stop", "expected"), [(0, 0), (1, 1)])
def test_stopping_backs_up_once_more_if_anything_changed(at_stop: int, expected: int) -> None:
    h = Harness()
    h.store.newest = NOW

    run(h, ticks=[0], at_stop=at_stop)

    assert daily_uploads(h) == expected


def test_a_failed_backup_is_retried_on_the_next_tick() -> None:
    h = Harness()
    h.store.newest = NOW
    h.store.error = ConnectionError("R2 unreachable")

    def wait(seconds: float) -> bool:
        if h.store.error:
            h.fingerprint = 1
            if h.pings:  # first tick's backup already failed; R2 is back for the next
                h.store.error = None
            return False
        return True

    h.backups.run(wait)

    assert h.pings == [f"{HEALTHCHECK}/fail", HEALTHCHECK]


def flushed_write_count() -> int:
    # Postgres publishes each connection's counters once it goes idle; tests can't wait for that.
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_stat_force_next_flush()")
    return database_write_count()


@pytest.mark.django_db(transaction=True)
def test_write_count_moves_on_writes_and_not_on_reads() -> None:
    before = flushed_write_count()

    list(User.objects.all())
    after_read = flushed_write_count()
    User.objects.create_user("alice")
    after_write = flushed_write_count()

    assert after_read == before
    assert after_write > before
