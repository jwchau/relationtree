import uuid
from collections.abc import Callable
from typing import Any

import pytest
from django.db import connection as db_connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from relationtree.models import Person
from tests.test_connections import add_person, connect
from tests.test_trees import add_member, default_tree_id


def graph_of(client: Client, tree_id: str) -> Any:
    return client.get(f"/api/trees/{tree_id}/graph")


def test_member_gets_the_trees_people_and_connections(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    link = connect(alice, ann, ben, "PARENT").json()

    response = graph_of(alice, default_tree_id(alice))

    assert response.status_code == 200
    graph = response.json()
    assert {p["name"] for p in graph["people"]} == {"Ann", "Ben"}
    assert graph["connections"] == [
        {"id": link["id"], "person_a_id": ann, "person_b_id": ben, "type": "PARENT"}
    ]


@pytest.mark.parametrize("tree_id", ["someone-elses", str(uuid.uuid4())])
def test_non_members_and_missing_trees_get_404(
    login_as: Callable[[str], Client], tree_id: str
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    add_person(alice, "Ann")
    if tree_id == "someone-elses":
        tree_id = default_tree_id(alice)

    assert graph_of(bob, tree_id).status_code == 404


def test_people_carry_no_contact_details_context_or_notes(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    alice.post(
        "/api/people",
        {
            "name": "Ann",
            "phone": "555",
            "email": "ann@example.com",
            "address": "1 Road",
            "context": "school",
            "notes": "private",
            "birthday": "1990-04-02",
            "relationship_category": "FRIEND",
        },
        content_type="application/json",
    )

    [ann] = graph_of(alice, default_tree_id(alice)).json()["people"]

    assert set(ann) == {"id", "name", "photo_url", "birthday", "relationship_category", "is_me"}
    assert ann["birthday"] == "1990-04-02"
    assert ann["relationship_category"] == "FRIEND"


def test_is_me_is_only_the_callers_own_me(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    tree_id = default_tree_id(alice)
    assert add_member(alice, tree_id, "bob", "viewer").status_code == 201
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    alice.put(f"/api/people/{ann}/me")
    bob.put(f"/api/people/{ben}/me")

    def me_flags(client: Client) -> dict[str, bool]:
        return {p["name"]: p["is_me"] for p in graph_of(client, tree_id).json()["people"]}

    assert me_flags(alice) == {"Ann": True, "Ben": False}
    assert me_flags(bob) == {"Ann": False, "Ben": True}


def _tree_with(client: Client, size: int) -> str:
    ids = [add_person(client, f"P{i}") for i in range(size)]
    for a, b in zip(ids, ids[1:], strict=False):
        connect(client, a, b, "FRIEND")
    for person_id in ids:
        Person.objects.filter(id=person_id).update(photo_key=f"photos/{person_id}.jpg")
    return default_tree_id(client)


def test_query_count_does_not_grow_with_the_tree(login_as: Callable[[str], Client]) -> None:
    def queries_for(client: Client, size: int) -> int:
        tree_id = _tree_with(client, size)
        with CaptureQueriesContext(db_connection) as captured:
            assert graph_of(client, tree_id).status_code == 200
        return len(captured)

    assert queries_for(login_as("alice"), 2) == queries_for(login_as("bob"), 20)


def test_only_this_trees_people_and_connections(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    add_person(alice, "Ann")
    tree_id = default_tree_id(alice)
    other = alice.post("/api/trees", {"name": "Work"}, content_type="application/json").json()
    cat, dan = (
        alice.post(
            f"/api/people?tree={other['id']}", {"name": n}, content_type="application/json"
        ).json()["id"]
        for n in ("Cat", "Dan")
    )
    connect(alice, cat, dan, "COWORKER")

    graph = graph_of(alice, tree_id).json()

    assert [p["name"] for p in graph["people"]] == ["Ann"]
    assert graph["connections"] == []


def test_photo_storage_is_only_needed_for_people_with_photos(
    login_as: Callable[[str], Client], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Like the People list: a tree without photos works when R2 isn't configured."""
    alice = login_as("alice")
    add_person(alice, "Ann")

    def unconfigured() -> None:
        raise RuntimeError("R2 isn't configured")

    monkeypatch.setattr("relationtree.trees_api.get_photo_storage", unconfigured)

    assert graph_of(alice, default_tree_id(alice)).status_code == 200
