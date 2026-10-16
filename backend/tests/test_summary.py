import time
from collections.abc import AsyncIterator
from datetime import date, timedelta

import pytest
from asgiref.sync import sync_to_async
from django.contrib.auth.models import User
from django.db import connections
from django.http import StreamingHttpResponse
from django.test import AsyncClient
from pytest_django.fixtures import Settings

from relationtree.access import default_tree_for
from relationtree.ai import AIUnavailable
from relationtree.models import Connection, Person, TreeMembership
from tests.fakes import FakeChatModel


@pytest.fixture(autouse=True)
async def close_worker_thread_connections() -> AsyncIterator[None]:
    """Async views reach the DB from asgiref's worker thread; close that thread's connection
    so the test database can be dropped at the end of the run."""
    yield
    await sync_to_async(connections.close_all)()


@sync_to_async
def make_user_with_person(username: str, person_name: str = "Sam") -> tuple[User, Person]:
    user = User.objects.create_user(username, password="unused")
    return user, Person.objects.create(tree=default_tree_for(user), name=person_name)


async def read_stream(response: object) -> list[bytes]:
    assert isinstance(response, StreamingHttpResponse)
    return [bytes(chunk) async for chunk in response.streaming_content]  # type: ignore[union-attr]


async def logged_in(user: User) -> AsyncClient:
    client = AsyncClient()
    await client.aforce_login(user)
    return client


@pytest.mark.django_db(transaction=True)
async def test_summary_streams_the_models_text_as_it_arrives(chat_model: FakeChatModel) -> None:
    chat_model.chunks = ["Sam is ", "an old ", "friend."]
    user, sam = await make_user_with_person("alice")
    client = await logged_in(user)

    response = await client.post(f"/api/people/{sam.id}/summary")

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/plain")
    chunks = await read_stream(response)
    assert chunks == [b"Sam is ", b"an old ", b"friend."]


@sync_to_async
def give_sam_details(sam: Person) -> None:
    sam.relationship_category = Person.RelationshipCategory.FRIEND
    sam.context = "Climbing gym regular"
    sam.notes = "Training for a marathon in March."
    sam.birthday = date(1990, 4, 2)
    sam.last_contacted_date = date.today() - timedelta(days=45)
    sam.phone = "555-0100"
    sam.email = "sam@private.example"
    sam.address = "1 Hidden Lane"
    sam.save()
    ann = Person.objects.create(tree=sam.tree, name="Ann Rivera")
    Connection.objects.create(
        tree=sam.tree, person_a=sam, person_b=ann, type=Connection.RelationshipType.PARENT
    )


@pytest.mark.django_db(transaction=True)
async def test_prompt_includes_the_persons_story_but_not_contact_details(
    chat_model: FakeChatModel,
) -> None:
    user, sam = await make_user_with_person("alice")
    await give_sam_details(sam)
    client = await logged_in(user)

    response = await client.post(f"/api/people/{sam.id}/summary")
    await read_stream(response)

    prompt = "\n".join(m["content"] for m in chat_model.calls[0]["messages"])
    for expected in [
        "Sam",
        "Friend",
        "Climbing gym regular",
        "Training for a marathon in March.",
        "1990-04-02",
        "45 days ago",
        "Ann Rivera (Child)",
    ]:
        assert expected in prompt, expected
    for private in ["555-0100", "sam@private.example", "1 Hidden Lane"]:
        assert private not in prompt, private


@pytest.mark.django_db(transaction=True)
async def test_model_settings_are_passed_to_ollama(
    chat_model: FakeChatModel, settings: Settings
) -> None:
    settings.CHAT_MODEL = "some-model:7b"
    user, sam = await make_user_with_person("alice")
    client = await logged_in(user)

    response = await client.post(f"/api/people/{sam.id}/summary")
    await read_stream(response)

    [call] = chat_model.calls
    assert call["model"] == "some-model:7b"
    # Ollama's default context silently truncates long notes; thinking would stall the stream.
    assert call["options"]["num_ctx"] == 8192
    assert call["think"] is False


@pytest.mark.parametrize("failure", ["unreachable", "slow"])
@pytest.mark.django_db(transaction=True)
async def test_unavailable_ai_returns_503_without_hanging(
    chat_model: FakeChatModel, settings: Settings, failure: str
) -> None:
    if failure == "unreachable":
        chat_model.error = AIUnavailable("connection refused")
    else:
        settings.AI_FIRST_TOKEN_TIMEOUT = 0.05
        chat_model.first_chunk_delay = 5
    user, sam = await make_user_with_person("alice")
    client = await logged_in(user)

    started = time.monotonic()
    response = await client.post(f"/api/people/{sam.id}/summary")

    assert time.monotonic() - started < 2
    assert response.status_code == 503
    assert response.json() == {"detail": "AI is unavailable right now"}


@sync_to_async
def share_tree(owner: User, viewer: User) -> None:
    TreeMembership.objects.create(
        tree=default_tree_for(owner), user=viewer, role=TreeMembership.Role.VIEWER
    )


@pytest.mark.django_db(transaction=True)
async def test_summary_permissions(chat_model: FakeChatModel) -> None:
    alice, sam = await make_user_with_person("alice")
    bob, _ = await make_user_with_person("bob", "Dee")
    cat, _ = await make_user_with_person("cat", "Eve")
    await share_tree(alice, cat)
    url = f"/api/people/{sam.id}/summary"

    assert (await AsyncClient().post(url)).status_code == 401
    assert (await (await logged_in(bob)).post(url)).status_code == 404
    as_viewer = await (await logged_in(cat)).post(url)
    assert as_viewer.status_code == 200
    await read_stream(as_viewer)
    # Neither the anonymous nor the outsider request reached the model.
    assert len(chat_model.calls) == 1
