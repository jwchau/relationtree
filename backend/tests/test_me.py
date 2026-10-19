from collections.abc import Callable
from typing import Any

from django.test import Client

from relationtree.models import TreeMembership


def add_person(client: Client, name: str) -> str:
    response = client.post("/api/people", {"name": name}, content_type="application/json")
    assert response.status_code == 201
    person_id: str = response.json()["id"]
    return person_id


def who_is_me(client: Client) -> list[str]:
    people: list[dict[str, Any]] = client.get("/api/people").json()
    return [p["name"] for p in people if p["is_me"]]


def test_marking_a_person_as_me_moves_the_marker_and_is_per_user(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    add_person(bob, "Bob himself")

    marked = alice.put(f"/api/people/{ann}/me")

    assert marked.status_code == 200
    assert marked.json()["is_me"] is True
    assert who_is_me(alice) == ["Ann"]
    assert who_is_me(bob) == []

    assert alice.put(f"/api/people/{ben}/me").status_code == 200
    assert who_is_me(alice) == ["Ben"]
    assert alice.get(f"/api/people/{ann}").json()["is_me"] is False

    assert alice.delete(f"/api/people/{ben}/me").status_code == 204
    assert who_is_me(alice) == []


def test_deleting_the_person_clears_the_marker(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    ann = add_person(alice, "Ann")
    alice.put(f"/api/people/{ann}/me")

    assert alice.delete(f"/api/people/{ann}").status_code == 204

    assert TreeMembership.objects.get(user__username="alice").me is None


def test_cannot_mark_or_unmark_someone_you_cannot_see(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    ann = add_person(alice, "Ann")
    alice.put(f"/api/people/{ann}/me")

    assert bob.put(f"/api/people/{ann}/me").status_code == 404
    assert bob.delete(f"/api/people/{ann}/me").status_code == 404
    assert who_is_me(alice) == ["Ann"]
    assert TreeMembership.objects.get(user__username="bob").me is None
