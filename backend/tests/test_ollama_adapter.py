import json

import httpx
import pytest

from relationtree.ai import AIUnavailable, OllamaChatModel, OllamaEmbedder


def ndjson(*objs: dict[str, object]) -> bytes:
    return b"".join(json.dumps(o).encode() + b"\n" for o in objs)


async def test_streams_content_and_sends_the_settings_ollama_needs() -> None:
    sent: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        body = ndjson(
            {"model": "m", "message": {"role": "assistant", "content": "Hi "}, "done": False},
            {"model": "m", "message": {"role": "assistant", "content": "there"}, "done": False},
            {"model": "m", "message": {"role": "assistant", "content": ""}, "done": True},
        )
        return httpx.Response(200, content=body, headers={"Content-Type": "application/x-ndjson"})

    model = OllamaChatModel(
        "http://ollama.test",
        connect_timeout=1,
        keep_alive="1h",
        transport=httpx.MockTransport(handler),
    )

    chunks = [
        c
        async for c in model.stream(
            [{"role": "user", "content": "x"}], model="m", options={"num_ctx": 8192}, think=False
        )
    ]

    assert chunks == ["Hi ", "there"]
    [request] = sent
    assert request["think"] is False
    assert request["options"] == {"num_ctx": 8192}
    # Without keep_alive Ollama unloads the 17 GB model after 5 idle minutes, and the next
    # summary waits ~100 s for a cold load.
    assert request["keep_alive"] == "1h"


async def test_connection_failures_become_ai_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    model = OllamaChatModel(
        "http://ollama.test",
        connect_timeout=1,
        keep_alive="1h",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(AIUnavailable):
        async for _ in model.stream([], model="m", options={}, think=False):
            pass


def test_embedder_sends_the_model_and_keep_alive_and_returns_vectors() -> None:
    sent: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={"model": "e", "embeddings": [[0.1, 0.2], [0.3, 0.4]]})

    embedder = OllamaEmbedder(
        "http://ollama.test",
        model="qwen3-embedding:0.6b",
        connect_timeout=1,
        keep_alive="1h",
        num_ctx=2048,
        transport=httpx.MockTransport(handler),
    )

    assert embedder.embed(["a", "b"]) == [[0.1, 0.2], [0.3, 0.4]]
    [request] = sent
    assert request["model"] == "qwen3-embedding:0.6b"
    assert request["input"] == ["a", "b"]
    assert request["keep_alive"] == "1h"
    # Without a cap Ollama sizes the KV cache for the model's 32K context: 4.6 GB vs ~1 GB.
    assert request["options"] == {"num_ctx": 2048}


def test_embedder_connection_failures_become_ai_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    embedder = OllamaEmbedder(
        "http://ollama.test",
        model="e",
        connect_timeout=1,
        keep_alive="1h",
        num_ctx=2048,
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(AIUnavailable):
        embedder.embed(["a"])


async def test_complete_asks_for_structured_output_and_returns_the_text() -> None:
    sent: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "model": "m",
                "message": {"role": "assistant", "content": '{"a": 1}'},
                "done": True,
            },
        )

    model = OllamaChatModel(
        "http://ollama.test",
        connect_timeout=1,
        keep_alive="1h",
        transport=httpx.MockTransport(handler),
    )
    schema = {"type": "object", "properties": {"a": {"type": "integer"}}}

    text = await model.complete(
        [{"role": "user", "content": "hi"}],
        format=schema,
        model="m",
        options={"num_ctx": 8},
        think=True,
    )

    assert text == '{"a": 1}'
    [request] = sent
    assert request["format"] == schema
    assert request["stream"] is False
    assert request["think"] is True
    assert request["keep_alive"] == "1h"


async def test_complete_connection_failures_become_ai_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    model = OllamaChatModel(
        "http://ollama.test",
        connect_timeout=1,
        keep_alive="1h",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(AIUnavailable):
        await model.complete([], format={}, model="m", options={}, think=False)
