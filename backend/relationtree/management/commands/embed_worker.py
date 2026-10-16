import logging
import time
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import close_old_connections

from relationtree.ai import AIUnavailable
from relationtree.search import embed_pending

logger = logging.getLogger(__name__)

IDLE_SECONDS = 5
AI_DOWN_BACKOFF_SECONDS = 30


class Command(BaseCommand):
    help = (
        "Keep semantic-search embeddings up to date. The rows themselves record what's stale "
        "(content_version vs embedded_version), so stopping this at any point loses nothing."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--once", action="store_true", help="Catch up on the backlog, then exit."
        )

    def handle(self, *args: Any, once: bool = False, **options: Any) -> None:
        while True:
            try:
                done = self._drain()
                pause = IDLE_SECONDS
                if done:
                    logger.info("Embedded %d people", done)
            except AIUnavailable as err:
                logger.warning("Embedding model unavailable (%s); will retry", err)
                pause = AI_DOWN_BACKOFF_SECONDS
            if once:
                return
            time.sleep(pause)
            # Long-running process: drop connections that died or aged out while sleeping.
            close_old_connections()

    def _drain(self) -> int:
        total = 0
        while batch := embed_pending():
            total += batch
        return total
