import asyncio
from collections.abc import AsyncGenerator, Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from relationtree.ai import ToolCall


class FakePhotoStorage:
    """Stands in for R2 in tests: no network, records what was deleted."""

    def __init__(self) -> None:
        self.deleted: list[str] = []

    def presign_upload(self, key: str, content_type: str, size: int) -> str:
        return f"https://r2.test/{key}?op=put&type={content_type}&size={size}"

    def presign_download(self, key: str) -> str:
        return f"https://r2.test/{key}?op=get"

    def delete(self, key: str) -> None:
        self.deleted.append(key)


class FakeChatModel:
    """Stands in for Ollama in tests: scripted chunks, records every call."""

    def __init__(self, chunks: list[str] | None = None) -> None:
        self.chunks = chunks if chunks is not None else ["A summary."]
        self.calls: list[dict[str, Any]] = []
        self.error: Exception | None = None
        self.first_chunk_delay = 0.0
        # Scripted assistant turns for stream_turn: answer text and ToolCalls, in order.
        self.turns: list[list[str | ToolCall]] = []

    async def stream(
        self, messages: list[dict[str, str]], *, model: str, options: dict[str, Any], think: bool
    ) -> AsyncGenerator[str]:
        self.calls.append(
            {"messages": messages, "model": model, "options": options, "think": think}
        )
        if self.error is not None:
            raise self.error
        if self.first_chunk_delay:
            await asyncio.sleep(self.first_chunk_delay)
        for chunk in self.chunks:
            yield chunk

    async def stream_turn(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]],
        model: str,
        options: dict[str, Any],
        think: bool,
    ) -> AsyncGenerator[str | ToolCall]:
        """Plays the next scripted turn from `turns`; with none left, answers "Done."."""
        self.calls.append(
            {
                "messages": list(messages),
                "tools": tools,
                "model": model,
                "options": options,
                "think": think,
            }
        )
        if self.error is not None:
            raise self.error
        for event in self.turns.pop(0) if self.turns else ["Done."]:
            yield event


# Topics the fake embedder "understands": text mentioning any keyword lands on that topic's axis.
FAKE_TOPICS = {
    "finance": ["finance", "bank", "investment", "accountant"],
    "climbing": ["climbing", "boulder", "gym"],
    "music": ["music", "guitar", "band"],
    "children": ["child", "kids"],
}


class FakeEmbedder:
    """Stands in for Ollama embeddings: one axis per topic, so similarity is predictable."""

    dimensions = 1024

    def __init__(self) -> None:
        self.inputs: list[str] = []
        self.error: Exception | None = None
        self.during_embed: Callable[[], None] | None = None

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self.error is not None:
            raise self.error
        self.inputs.extend(texts)
        if self.during_embed is not None:
            hook, self.during_embed = self.during_embed, None
            hook()
        return [self._vector(text) for text in texts]

    def _vector(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        lowered = text.lower()
        for axis, keywords in enumerate(FAKE_TOPICS.values()):
            vector[axis] = float(sum(lowered.count(k) for k in keywords))
        vector[-1] = 0.01  # never all-zero: cosine distance is undefined for a zero vector
        return vector


class FakeBackupStore:
    """Stands in for the R2 backups bucket: records each upload's key and contents."""

    def __init__(self, newest: datetime | None = None) -> None:
        self.newest = newest
        self.uploads: list[tuple[str, bytes]] = []
        self.error: Exception | None = None

    def newest_backup_time(self) -> datetime | None:
        return self.newest

    def upload(self, path: Path, key: str) -> None:
        if self.error:
            raise self.error
        self.uploads.append((key, path.read_bytes()))


class FakeDumper:
    """Stands in for pg_dump: writes a recognizable dump, or fails like pg_dump would."""

    def __init__(self) -> None:
        self.error: Exception | None = None
        self.calls = 0

    def __call__(self, path: Path) -> None:
        self.calls += 1
        if self.error:
            raise self.error
        path.write_bytes(b"dump-%d" % self.calls)
