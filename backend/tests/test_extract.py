import json
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import date
from typing import Any

import pytest
from asgiref.sync import sync_to_async
from django.contrib.auth.models import User
from django.db import connections
from django.test import AsyncClient, Client

from relationtree.access import default_tree_for
from relationtree.ai import AIUnavailable, OutOfRoom
from relationtree.models import Connection, Person, Tree, TreeMembership
from relationtree.relationships import canonical_pair
from relationtree.search import pending_count
from tests.fakes import FakeChatModel


@pytest.fixture(autouse=True)
async def close_worker_thread_connections() -> AsyncIterator[None]:
    """Async views reach the DB from asgiref's worker thread; close that thread's connection
    so the test database can be dropped at the end of the run."""
    yield
    await sync_to_async(connections.close_all)()


def model_says(
    chat_model: FakeChatModel, people: list[Any], links: list[Any] | None = None
) -> None:
    chat_model.completions = [json.dumps({"people": people, "connections": links or []})]


@sync_to_async
def make_user(username: str, *names: str, **contacts: str) -> tuple[User, Tree, list[Person]]:
    user = User.objects.create_user(username, password="unused")
    tree = default_tree_for(user)
    return user, tree, [Person.objects.create(tree=tree, name=n, **contacts) for n in names]


async def logged_in(user: User) -> AsyncClient:
    client = AsyncClient()
    await client.aforce_login(user)
    return client


async def extract(client: AsyncClient, text: str, tree: Tree | None = None) -> Any:
    query = f"?tree={tree.id}" if tree else ""
    return await client.post(
        f"/api/extract{query}", {"text": text}, content_type="application/json"
    )


# --- Proposing ---------------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
async def test_extracting_checks_access(chat_model: FakeChatModel) -> None:
    alice, tree, _ = await make_user("alice")
    bob, _, _ = await make_user("bob")
    await sync_to_async(TreeMembership.objects.create)(tree=tree, user=bob, role="viewer")
    carol, _, _ = await make_user("carol")

    assert (await extract(AsyncClient(), "Met Jordan")).status_code == 401
    assert (await extract(await logged_in(bob), "Met Jordan", tree)).status_code == 403
    assert (await extract(await logged_in(carol), "Met Jordan", tree)).status_code == 404
    client = await logged_in(alice)
    assert (await extract(client, "   ")).status_code == 422
    assert (await extract(client, "x" * 2001)).status_code == 422
    assert chat_model.calls == []


@pytest.mark.django_db(transaction=True)
async def test_unavailable_or_unreadable_model_output(chat_model: FakeChatModel) -> None:
    alice, _, _ = await make_user("alice")
    client = await logged_in(alice)

    chat_model.error = AIUnavailable("down")
    assert (await extract(client, "Met Jordan")).status_code == 503

    chat_model.error = None
    for garbage in ["not json", json.dumps({"people": "nope"}), json.dumps([1, 2])]:
        chat_model.completions = [garbage]
        response = await extract(client, "Met Jordan")
        assert response.status_code == 502
        assert response.json()["detail"] == "Couldn't read that note. Try rephrasing it."


@pytest.mark.django_db(transaction=True)
async def test_a_note_too_big_for_the_model_says_so(
    chat_model: FakeChatModel, settings: Any
) -> None:
    alice, _, _ = await make_user("alice", "Alex Rivera")
    client = await logged_in(alice)
    too_much = "That's too much to read in one go. Try splitting it into shorter notes."

    # The model ran out of context while thinking or writing its answer.
    chat_model.error = OutOfRoom("8192 tokens")
    response = await extract(client, "Met Jordan")
    assert (response.status_code, response.json()["detail"]) == (413, too_much)

    # A prompt over the context isn't sent at all: Ollama would cut it and answer anyway.
    chat_model.error = None
    chat_model.calls.clear()
    settings.OLLAMA_NUM_CTX = 100
    response = await extract(client, "Met Jordan")
    assert (response.status_code, response.json()["detail"]) == (413, too_much)
    assert chat_model.calls == []


@pytest.mark.django_db(transaction=True)
async def test_the_model_sees_the_note_this_trees_names_and_me_only(
    chat_model: FakeChatModel,
) -> None:
    alice, tree, [alex, _sam] = await make_user(
        "alice", "Alex Rivera", "Sam Lee", phone="555-0199", email="secret@example.com"
    )
    await make_user("bob", "Bob's friend Zed")
    await sync_to_async(TreeMembership.objects.filter(tree=tree).update)(me=alex)
    model_says(chat_model, [])

    await extract(await logged_in(alice), "Met Jordan at the wedding")

    [call] = chat_model.calls
    prompt = json.dumps(call["messages"])
    assert "Met Jordan at the wedding" in prompt
    # Short refs, not ids: every person in the tree is in the prompt, and ids cost context.
    assert "k1: Alex Rivera" in prompt and "k2: Sam Lee" in prompt
    assert str(alex.id) not in prompt and str(_sam.id) not in prompt
    assert "Zed" not in prompt
    assert "555-0199" not in prompt and "secret@example.com" not in prompt
    assert "The user is Alex Rivera (id k1)" in prompt
    assert call["format"]["type"] == "object"  # structured output, not free text


@pytest.mark.django_db(transaction=True)
async def test_proposal_matches_existing_people_and_cleans_up_the_rest(
    chat_model: FakeChatModel,
) -> None:
    alice, _, [alex, _sam] = await make_user("alice", "Alex Rivera", "Sam Lee")
    _, _, [zed] = await make_user("bob", "Zed")
    model_says(
        chat_model,
        [
            {
                "name": "Jordan Park",
                "existing_id": None,
                "category": "FRIEND",
                "about": "Met at Alex's wedding",
            },
            {
                "name": "Alex Rivera",
                "existing_id": "k1",
                "category": "FAMILY",
                "about": "Got married",
            },
            {"name": "Sam Lee", "existing_id": str(zed.id), "category": None, "about": None},
            {"name": "Zed", "existing_id": str(zed.id), "category": None, "about": None},
            {"name": "jordan park", "existing_id": None, "category": None, "about": None},
        ],
        [
            {"from": "Jordan Park", "to": "Alex Rivera", "type": "FRIEND"},
            {"from": "Jordan Park", "to": "Nobody", "type": "FRIEND"},
            {"from": "Alex Rivera", "to": "Alex Rivera", "type": "FRIEND"},
            {"from": "Alex Rivera", "to": "Sam Lee", "type": "BESTIE"},
        ],
    )

    response = await extract(await logged_in(alice), "Met Jordan at Alex's wedding")

    assert response.status_code == 200
    body = response.json()
    people = {p["name"]: p for p in body["people"]}
    # Refs map back to ids. Zed (another user's) becomes new: the model never sees other
    # trees, and ids aren't refs. Sam's wrong ref is fixed by the exact name match;
    # "jordan park" merges into Jordan Park.
    assert sorted(people) == ["Alex Rivera", "Jordan Park", "Sam Lee", "Zed"]
    assert people["Jordan Park"]["match_id"] is None
    assert people["Jordan Park"]["context"] == "Met at Alex's wedding"
    assert people["Jordan Park"]["note"] is None
    assert people["Jordan Park"]["category"] == "FRIEND"
    assert people["Alex Rivera"]["match_id"] == str(alex.id)
    assert people["Alex Rivera"]["note"] == "Got married"
    assert people["Alex Rivera"]["context"] is None
    assert people["Alex Rivera"]["category"] is None  # existing people keep their category
    assert people["Sam Lee"]["match_id"] == str(_sam.id)
    assert people["Zed"]["match_id"] is None
    assert body["connections"] == [
        {"a": people["Jordan Park"]["ref"], "b": people["Alex Rivera"]["ref"], "type": "FRIEND"}
    ]


@pytest.mark.django_db(transaction=True)
async def test_direction_and_me_survive_the_round_trip(chat_model: FakeChatModel) -> None:
    alice, tree, [me, alex] = await make_user("alice", "Alice Chen", "Alex Rivera")
    await sync_to_async(TreeMembership.objects.filter(tree=tree).update)(me=me)
    model_says(
        chat_model,
        [{"name": "Jordan Park", "existing_id": None, "category": "COWORKER", "about": None}],
        [
            {"from": "Alex Rivera", "to": "Jordan Park", "type": "MANAGER"},
            {"from": "Alice Chen", "to": "Jordan Park", "type": "COWORKER"},
        ],
    )

    body = (await extract(await logged_in(alice), "Alex manages Jordan, my coworker")).json()

    refs = {p["name"]: p["ref"] for p in body["people"]}
    matched = {p["name"]: p["match_id"] for p in body["people"]}
    # Connected existing people are listed even when the model only named them in a link.
    assert matched == {"Jordan Park": None, "Alex Rivera": str(alex.id), "Alice Chen": str(me.id)}
    assert {(c["a"], c["b"], c["type"]) for c in body["connections"]} == {
        (refs["Alex Rivera"], refs["Jordan Park"], "MANAGER"),
        (refs["Alice Chen"], refs["Jordan Park"], "COWORKER"),
    }


# --- Applying ----------------------------------------------------------------------------------


def apply(client: Client, payload: dict[str, Any], tree: Tree | None = None) -> Any:
    query = f"tree={tree.id}" if tree else ""
    return client.post(
        "/api/extract/apply", payload, QUERY_STRING=query, content_type="application/json"
    )


def owner_tree(username: str) -> Tree:
    return TreeMembership.objects.get(user__username=username, role="owner").tree


def test_apply_creates_people_appends_notes_and_links_them(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    tree = owner_tree("alice")
    alex = Person.objects.create(tree=tree, name="Alex Rivera", notes="Old note")
    me = Person.objects.create(tree=tree, name="Alice Chen")
    sam = Person.objects.create(tree=tree, name="Sam Lee")
    sibling = Connection.RelationshipType.SIBLING
    first, second = canonical_pair(sibling, alex.id, sam.id)
    by_id = {alex.id: alex, sam.id: sam}
    Connection.objects.create(
        tree=tree, person_a=by_id[first], person_b=by_id[second], type=sibling
    )

    response = apply(
        alice,
        {
            "people": [
                {
                    "ref": "p1",
                    "name": "Jordan Park",
                    "match_id": None,
                    "category": "FRIEND",
                    "context": "Met at Alex's wedding",
                },
                {
                    "ref": "p2",
                    "name": "Alex Rivera",
                    "match_id": str(alex.id),
                    "note": "Got married",
                },
                {"ref": "p3", "name": "Alice Chen", "match_id": str(me.id)},
                {"ref": "p4", "name": "Sam Lee", "match_id": str(sam.id)},
            ],
            "connections": [
                {"a": "p1", "b": "p2", "type": "FRIEND"},
                {"a": "p2", "b": "p1", "type": "MANAGER"},
                {"a": "p3", "b": "p1", "type": "ACQUAINTANCE"},
                {"a": "p4", "b": "p2", "type": "SIBLING"},  # already there (other direction)
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [p["name"] for p in body["created"]] == ["Jordan Park"]
    assert [p["name"] for p in body["updated"]] == ["Alex Rivera"]
    assert body["connections_added"] == 3
    assert body["connections_skipped"] == 1
    jordan = Person.objects.get(name="Jordan Park")
    assert (jordan.tree_id, jordan.relationship_category, jordan.context) == (
        tree.id,
        "FRIEND",
        "Met at Alex's wedding",
    )
    alex.refresh_from_db()
    assert alex.notes == f"Old note\n{date.today().isoformat()}: Got married"
    manager = Connection.objects.get(type="MANAGER")
    assert (manager.person_a_id, manager.person_b_id) == (alex.id, jordan.id)
    assert Connection.objects.filter(tree=tree).count() == 4


@pytest.mark.parametrize(
    "problem",
    ["match outside the tree", "unknown match", "dangling ref", "duplicate ref", "self link"],
)
def test_apply_is_all_or_nothing(login_as: Callable[[str], Client], problem: str) -> None:
    alice = login_as("alice")
    login_as("bob")
    tree = owner_tree("alice")
    alex = Person.objects.create(tree=tree, name="Alex Rivera")
    bobs = Person.objects.create(tree=owner_tree("bob"), name="Bob's person")
    people: list[dict[str, Any]] = [
        {"ref": "p1", "name": "Jordan Park", "match_id": None},
        {"ref": "p2", "name": "Alex Rivera", "match_id": str(alex.id), "note": "Hi"},
    ]
    links: list[dict[str, Any]] = [{"a": "p1", "b": "p2", "type": "FRIEND"}]
    match problem:
        case "match outside the tree":
            people.append({"ref": "p3", "name": "Bob's person", "match_id": str(bobs.id)})
        case "unknown match":
            people.append({"ref": "p3", "name": "Ghost", "match_id": str(uuid.uuid4())})
        case "dangling ref":
            links.append({"a": "p1", "b": "p9", "type": "FRIEND"})
        case "duplicate ref":
            people.append({"ref": "p1", "name": "Again", "match_id": None})
        case "self link":
            people.append({"ref": "p3", "name": "Alex again", "match_id": str(alex.id)})
            links.append({"a": "p2", "b": "p3", "type": "FRIEND"})

    response = apply(alice, {"people": people, "connections": links})

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert not Person.objects.filter(name="Jordan Park").exists()
    alex.refresh_from_db()
    assert alex.notes == ""
    assert Connection.objects.count() == 0


def test_apply_checks_access(login_as: Callable[[str], Client]) -> None:
    login_as("alice")
    bob, carol = login_as("bob"), login_as("carol")
    tree = owner_tree("alice")
    TreeMembership.objects.create(tree=tree, user=User.objects.get(username="bob"), role="viewer")
    payload = {"people": [{"ref": "p1", "name": "Jordan", "match_id": None}], "connections": []}

    assert apply(Client(), payload).status_code == 401
    assert apply(bob, payload, tree).status_code == 403
    assert apply(carol, payload, tree).status_code == 404
    assert not Person.objects.filter(name="Jordan").exists()


def test_applied_people_are_queued_for_search(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    tree = owner_tree("alice")
    alex = Person.objects.create(tree=tree, name="Alex Rivera")
    Person.objects.filter(id=alex.id).update(embedded_version=1)  # pretend it's indexed
    assert pending_count(tree) == 0

    apply(
        alice,
        {
            "people": [
                {"ref": "p1", "name": "Jordan Park", "match_id": None},
                {"ref": "p2", "name": "Alex Rivera", "match_id": str(alex.id), "note": "New job"},
            ],
            "connections": [],
        },
    )

    assert pending_count(tree) == 2


@pytest.mark.django_db(transaction=True)
async def test_a_pasted_note_adds_a_linked_person(chat_model: FakeChatModel) -> None:
    alice, _, [alex] = await make_user("alice", "Alex Rivera")
    client = await logged_in(alice)
    model_says(
        chat_model,
        [
            {
                "name": "Jordan Park",
                "existing_id": None,
                "category": "FRIEND",
                "about": "Alex's college roommate",
            }
        ],
        [{"from": "Jordan Park", "to": "Alex Rivera", "type": "FRIEND"}],
    )

    proposal = (await extract(client, "Met Jordan, Alex's college roommate")).json()
    applied = await client.post("/api/extract/apply", proposal, content_type="application/json")

    assert applied.status_code == 200
    [jordan] = applied.json()["created"]
    alex_links = (await client.get(f"/api/people/{alex.id}/connections")).json()
    jordan_links = (await client.get(f"/api/people/{jordan['id']}/connections")).json()
    assert [(c["other_person"]["name"], c["label"]) for c in alex_links] == [
        ("Jordan Park", "Friend")
    ]
    assert [(c["other_person"]["name"], c["label"]) for c in jordan_links] == [
        ("Alex Rivera", "Friend")
    ]
