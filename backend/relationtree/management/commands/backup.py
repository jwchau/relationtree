import logging
import signal
import threading
from types import FrameType
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import close_old_connections

from relationtree.backups import production_backups

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Back up Postgres to R2: on start if the newest backup is over 6h old, every 2h if the "
        "database changed, and once more on SIGTERM (docker compose down)."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--once", action="store_true", help="Back up now, then exit.")

    def handle(self, *args: Any, once: bool = False, **options: Any) -> None:
        backups = production_backups()
        if once:
            if not backups.backup():
                raise SystemExit(1)
            return

        stop = threading.Event()

        def on_signal(signum: int, frame: FrameType | None) -> None:
            logger.info("Got signal %d; taking a final backup", signum)
            stop.set()

        signal.signal(signal.SIGTERM, on_signal)
        signal.signal(signal.SIGINT, on_signal)

        def wait(seconds: float) -> bool:
            stopped = stop.wait(seconds)
            # Long-running process: drop connections that died or aged out while sleeping.
            close_old_connections()
            return stopped

        backups.run(wait)
