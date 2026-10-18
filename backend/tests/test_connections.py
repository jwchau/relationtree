from collections.abc import Callable
from typing import Any

import pytest
from django.contrib.auth.models import User
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from relationtree.models import TreeMembership


def add_person(client: Client, name: str) -> str:
    response = client.post("/api/people", {"name": name}, content_type="application/json")
    assert response.status_code == 201
    person_id: str = response.json()["id"]
    return person_id


def connect(client: Client, a: str, b: str, type_: str) -> Any:
    return client.post(
        "/api/connections",
        {"person_a_id": a, "person_b_id": b, "type": type_},
        content_type="application/json",
    )


def connections_of(client: Client, person_id: str) -> list[dict[str, Any]]:
    response = client.get(f"/api/people/{person_id}/connections")
    assert response.status_code == 200
    result: list[dict[str, Any]] = response.json()
    return result


def test_connection_appears_on_both_peoples_lists(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")

    created = connect(alice, ann, ben, "FRIEND")

    assert created.status_code == 201
    [from_ann] = connections_of(alice, ann)
    [from_ben] = connections_of(alice, ben)
    assert from_ann["other_person"]["name"] == "Ben"
    assert from_ben["other_person"]["name"] == "Ann"
    assert from_ann["label"] == from_ben["label"] == "Friend"
    assert from_ann["id"] == from_ben["id"] == created.json()["id"]


@pytest.mark.parametrize(
    ("type_", "label_on_a_page", "label_on_b_page"),
    [("PARENT", "Child", "Parent"), ("MANAGER", "Report", "Manager")],
)
def test_directional_labels_describe_the_other_persons_role(
    login_as: Callable[[str], Client], type_: str, label_on_a_page: str, label_on_b_page: str
) -> None:
    """Ann PARENT Ben means Ann is Ben's parent: Ann's page lists Ben as her child."""
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")

    connect(alice, ann, ben, type_)

    assert connections_of(alice, ann)[0]["label"] == label_on_a_page
    assert connections_of(alice, ben)[0]["label"] == label_on_b_page


def test_duplicate_connections_are_rejected_in_either_direction(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    connect(alice, ann, ben, "FRIEND")

    assert connect(alice, ann, ben, "FRIEND").status_code == 409
    assert connect(alice, ben, ann, "FRIEND").status_code == 409
    assert len(connections_of(alice, ann)) == 1


def test_a_pair_can_have_several_relationship_types(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")

    assert connect(alice, ann, ben, "COWORKER").status_code == 201
    assert connect(alice, ann, ben, "FRIEND").status_code == 201

    assert sorted(c["label"] for c in connections_of(alice, ann)) == ["Coworker", "Friend"]


def test_a_person_cannot_be_connected_to_themselves(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    ann = add_person(alice, "Ann")

    assert connect(alice, ann, ann, "FRIEND").status_code == 422
    assert connections_of(alice, ann) == []


def test_deleting_a_person_removes_their_connections(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    ann, ben, cat = add_person(alice, "Ann"), add_person(alice, "Ben"), add_person(alice, "Cat")
    connect(alice, ann, ben, "FRIEND")
    connect(alice, ann, cat, "SIBLING")

    assert alice.delete(f"/api/people/{ben}").status_code == 204

    assert [c["other_person"]["name"] for c in connections_of(alice, ann)] == ["Cat"]


def test_deleting_a_connection_removes_it_from_both_lists(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    connection = connect(alice, ann, ben, "FRIEND").json()

    assert alice.delete(f"/api/connections/{connection['id']}").status_code == 204

    assert connections_of(alice, ann) == []
    assert connections_of(alice, ben) == []


def test_connections_outside_your_trees_are_invisible(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    connection = connect(alice, ann, ben, "FRIEND").json()
    bobs_friend = add_person(bob, "Dee")

    assert bob.get(f"/api/people/{ann}/connections").status_code == 404
    assert connect(bob, ann, ben, "SIBLING").status_code == 404
    assert connect(bob, bobs_friend, ann, "FRIEND").status_code == 404
    assert bob.delete(f"/api/connections/{connection['id']}").status_code == 404

    assert len(connections_of(alice, ann)) == 1


def test_viewer_of_a_shared_tree_can_read_but_not_change_connections(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    ann, ben, cat = add_person(alice, "Ann"), add_person(alice, "Ben"), add_person(alice, "Cat")
    connection = connect(alice, ann, ben, "FRIEND").json()
    TreeMembership.objects.create(
        tree=TreeMembership.objects.get(user__username="alice").tree,
        user=User.objects.get(username="bob"),
        role=TreeMembership.Role.VIEWER,
    )

    assert len(connections_of(bob, ann)) == 1
    assert connect(bob, ann, cat, "FRIEND").status_code == 403
    assert bob.delete(f"/api/connections/{connection['id']}").status_code == 403
    assert len(connections_of(alice, ann)) == 1


def test_people_in_different_trees_cannot_be_connected(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    ann = add_person(alice, "Ann")
    dee = add_person(bob, "Dee")
    # Bob can edit both trees, but a connection lives in exactly one.
    TreeMembership.objects.create(
        tree=TreeMembership.objects.get(user__username="alice").tree,
        user=User.objects.get(username="bob"),
        role=TreeMembership.Role.EDITOR,
    )

    assert connect(bob, dee, ann, "FRIEND").status_code == 422
    assert connections_of(bob, dee) == []


def test_listing_connections_uses_a_fixed_number_of_queries(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    ann = add_person(alice, "Ann")

    def queries_to_list() -> int:
        with CaptureQueriesContext(connection) as ctx:
            connections_of(alice, ann)
        return len(ctx.captured_queries)

    connect(alice, ann, add_person(alice, "Friend 0"), "FRIEND")
    with_one = queries_to_list()
    for i in range(1, 6):
        connect(alice, add_person(alice, f"Parent {i}"), ann, "PARENT")

    assert queries_to_list() == with_one
