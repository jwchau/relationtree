import asyncio
from collections.abc import AsyncGenerator
from typing import Any


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
