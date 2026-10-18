from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from relationtree.backups import r2_backup_store


class Command(BaseCommand):
    help = "Download the newest database backup from R2 (used by scripts/restore-drill.ps1)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("path", type=Path, help="Where to write the dump.")

    def handle(self, *args: Any, path: Path, **options: Any) -> None:
        key = r2_backup_store().download_newest(path)
        if key is None:
            raise CommandError("No backups in the bucket yet.")
        self.stdout.write(f"Downloaded {key} ({path.stat().st_size} bytes)")
