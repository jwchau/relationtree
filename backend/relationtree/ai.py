"""Local LLM access through Ollama. Prompts never leave the home server."""

from collections.abc import AsyncGenerator
from typing import Any, Protocol

import httpx
from django.conf import settings
from ollama import AsyncClient, Client, ResponseError


class AIUnavailable(Exception):
    """Ollama is down, unreachable, or didn't start answering in time."""


class ChatModel(Protocol):
    def stream(
        self, messages: list[dict[str, str]], *, model: str, options: dict[str, Any], think: bool
    ) -> AsyncGenerator[str]: ...


class OllamaChatModel:
    def __init__(
        self,
        host: str,
        *,
        connect_timeout: float,
        keep_alive: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        # Ollama unloads idle models after 5 minutes by default, and reloading ~17 GB into VRAM
        # takes ~100 s, so every request asks it to keep the model warm for a while.
        self._keep_alive = keep_alive
        # Fail fast if Ollama isn't there, but allow long gaps between tokens on a busy GPU.
        self._client = AsyncClient(
            host=host,
            timeout=httpx.Timeout(connect=connect_timeout, read=180, write=10, pool=10),
            transport=transport,
        )

    async def stream(
        self, messages: list[dict[str, str]], *, model: str, options: dict[str, Any], think: bool
    ) -> AsyncGenerator[str]:
        try:
            response = await self._client.chat(
                model=model,
                messages=messages,
                stream=True,
                think=think,
                options=options,
                keep_alive=self._keep_alive,
            )
            async for part in response:
                if part.message.content:
                    yield part.message.content
        except (httpx.HTTPError, ResponseError, ConnectionError) as err:
            raise AIUnavailable(str(err)) from err


_chat_model: ChatModel | None = None


def get_chat_model() -> ChatModel:
    global _chat_model
    if _chat_model is None:
        _chat_model = OllamaChatModel(
            settings.OLLAMA_URL,
            connect_timeout=settings.OLLAMA_CONNECT_TIMEOUT,
            keep_alive=settings.OLLAMA_KEEP_ALIVE,
        )
    return _chat_model


def set_chat_model(model: ChatModel | None) -> None:
    """Swap the model backend (tests use a scripted fake)."""
    global _chat_model
    _chat_model = model


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class OllamaEmbedder:
    def __init__(
        self,
        host: str,
        *,
        model: str,
        connect_timeout: float,
        keep_alive: str,
        num_ctx: int,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._model = model
        self._keep_alive = keep_alive
        self._options = {"num_ctx": num_ctx}
        self._client = Client(
            host=host,
            timeout=httpx.Timeout(connect=connect_timeout, read=60, write=10, pool=10),
            transport=transport,
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            response = self._client.embed(
                model=self._model, input=texts, keep_alive=self._keep_alive, options=self._options
            )
        except (httpx.HTTPError, ResponseError, ConnectionError) as err:
            raise AIUnavailable(str(err)) from err
        return [list(vector) for vector in response.embeddings]


_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = OllamaEmbedder(
            settings.OLLAMA_URL,
            model=settings.EMBED_MODEL,
            connect_timeout=settings.OLLAMA_CONNECT_TIMEOUT,
            keep_alive=settings.OLLAMA_KEEP_ALIVE,
            num_ctx=settings.EMBED_NUM_CTX,
        )
    return _embedder


def set_embedder(embedder: Embedder | None) -> None:
    """Swap the embedding backend (tests use a deterministic fake)."""
    global _embedder
    _embedder = embedder
