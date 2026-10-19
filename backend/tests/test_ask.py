import json
from collections.abc import AsyncIterator
from typing import Any

import pytest
from asgiref.sync import sync_to_async
from django.contrib.auth.models import User
from django.db import connections
from django.http import StreamingHttpResponse
from django.test import AsyncClient

from relationtree.access import default_tree_for
from relationtree.ai import AIUnavailable, ToolCall
from relationtree.models import Person, TreeMembership
from tests.fakes import FakeChatModel


@pytest.fixture(autouse=True)
async def close_worker_thread_connections() -> AsyncIterator[None]:
    """Async views reach the DB from asgiref's worker thread; close that thread's connection
    so the test database can be dropped at the end of the run."""
    yield
    await sync_to_async(connections.close_all)()


@sync_to_async
def make_user_with_people(username: str, *names: str) -> tuple[User, list[Person]]:
    user = User.objects.create_user(username, password="unused")
    tree = default_tree_for(user)
    return user, [Person.objects.create(tree=tree, name=name) for name in names]


async def logged_in(user: User) -> AsyncClient:
    client = AsyncClient()
    await client.aforce_login(user)
    return client


async def ask(client: AsyncClient, question: str) -> Any:
    return await client.post("/api/ask", {"question": question}, content_type="application/json")


async def read_events(response: object) -> list[dict[str, Any]]:
    assert isinstance(response, StreamingHttpResponse)
    body = b"".join([bytes(chunk) async for chunk in response.streaming_content])  # type: ignore[union-attr]
    return [json.loads(line) for line in body.decode().splitlines()]


def tool_results(call: dict[str, Any]) -> list[Any]:
    return [json.loads(m["content"]) for m in call["messages"] if m["role"] == "tool"]


@pytest.mark.django_db(transaction=True)
async def test_answer_streams_tool_progress_then_text_then_the_people_mentioned(
    chat_model: FakeChatModel,
) -> None:
    alice, [ann, _ben] = await make_user_with_people("alice", "Ann", "Ben")
    chat_model.turns = [
        [ToolCall("find_people", {"name": "Ann"})],
        ["Ann is ", "in your tree."],
    ]
    client = await logged_in(alice)

    response = await ask(client, "Who is Ann?")

    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/x-ndjson")
    assert await read_events(response) == [
        {"tool": "Looking up Ann…"},
        {"text": "Ann is "},
        {"text": "in your tree."},
        {"people": [{"id": str(ann.id), "name": "Ann"}]},
    ]
    first, second = chat_model.calls
    assert first["think"] is True
    assert {t["function"]["name"] for t in first["tools"]} >= {"find_people", "path_between"}
    assert tool_results(second) == [[{"id": str(ann.id), "name": "Ann", "category": None}]]


@pytest.mark.django_db(transaction=True)
async def test_model_mistakes_go_back_to_the_model_as_errors(chat_model: FakeChatModel) -> None:
    alice, _ = await make_user_with_people("alice", "Ann")
    chat_model.turns = [
        [ToolCall("delete_everyone", {}), ToolCall("get_person", {"id": "not-a-uuid"})],
        ["I couldn't find that."],
    ]
    client = await logged_in(alice)

    response = await ask(client, "Who is Ann?")

    assert response.status_code == 200
    events = await read_events(response)
    assert events[-2:] == [{"text": "I couldn't find that."}, {"people": []}]
    unknown, bad_args = tool_results(chat_model.calls[1])
    assert "no tool called 'delete_everyone'" in unknown["error"]
    assert "Bad arguments for get_person" in bad_args["error"]


@pytest.mark.django_db(transaction=True)
async def test_gives_up_politely_after_too_many_rounds(chat_model: FakeChatModel) -> None:
    alice, _ = await make_user_with_people("alice", "Ann")
    chat_model.turns = [[ToolCall("find_people", {"name": "Ann"})] for _ in range(10)]
    client = await logged_in(alice)

    events = await read_events(await ask(client, "Who is Ann?"))

    assert len(chat_model.calls) == 6
    assert {"text": "Sorry, I couldn't work that out. Try asking more specifically."} in events
    assert events[-1] == {"people": []}


@pytest.mark.django_db(transaction=True)
async def test_unavailable_model_is_a_503_before_streaming(chat_model: FakeChatModel) -> None:
    alice, _ = await make_user_with_people("alice", "Ann")
    chat_model.error = AIUnavailable("connection refused")
    client = await logged_in(alice)

    response = await ask(client, "Who is Ann?")

    assert response.status_code == 503
    assert response.json() == {"detail": "AI is unavailable right now"}


@pytest.mark.django_db(transaction=True)
async def test_ask_requires_login(chat_model: FakeChatModel) -> None:
    response = await ask(AsyncClient(), "Who is Ann?")

    assert response.status_code == 401
    assert chat_model.calls == []


@sync_to_async
def mark_as_me(user: User, person: Person) -> None:
    TreeMembership.objects.filter(user=user).update(me=person)


@pytest.mark.django_db(transaction=True)
async def test_the_model_is_told_who_me_is_when_marked(chat_model: FakeChatModel) -> None:
    alice, [jordan] = await make_user_with_people("alice", "Jordan")
    client = await logged_in(alice)

    await read_events(await ask(client, "Who are my kids?"))
    await mark_as_me(alice, jordan)
    await read_events(await ask(client, "Who are my kids?"))

    unmarked, marked = (
        " ".join(m["content"] for m in call["messages"] if m["role"] == "system")
        for call in chat_model.calls
    )
    assert "Jordan" not in unmarked
    assert f"The user is Jordan (id {jordan.id})" in marked
