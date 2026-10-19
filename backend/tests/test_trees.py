import uuid
from collections.abc import Callable
from typing import Any

import pytest
from django.test import Client

from relationtree.models import TreeMembership


def my_trees(client: Client) -> list[dict[str, Any]]:
    response = client.get("/api/trees")
    assert response.status_code == 200
    trees: list[dict[str, Any]] = response.json()
    return trees


def default_tree_id(client: Client) -> str:
    [tree] = my_trees(client)
    tree_id: str = tree["id"]
    return tree_id


def add_member(client: Client, tree_id: str, username: str, role: str) -> Any:
    return client.post(
        f"/api/trees/{tree_id}/members",
        {"username": username, "role": role},
        content_type="application/json",
    )


def members(client: Client, tree_id: str) -> dict[str, str]:
    response = client.get(f"/api/trees/{tree_id}/members")
    assert response.status_code == 200
    return {m["username"]: m["role"] for m in response.json()}


def user_id(username: str) -> int:
    return TreeMembership.objects.filter(user__username=username).values_list("user_id", flat=True)[
        0
    ]


def set_role(client: Client, tree_id: str, username: str, role: str) -> Any:
    return client.patch(
        f"/api/trees/{tree_id}/members/{user_id(username)}",
        {"role": role},
        content_type="application/json",
    )


def remove(client: Client, tree_id: str, username: str) -> Any:
    return client.delete(f"/api/trees/{tree_id}/members/{user_id(username)}")


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/trees"),
        ("post", "/api/trees"),
        ("patch", f"/api/trees/{uuid.uuid4()}"),
        ("get", f"/api/trees/{uuid.uuid4()}/members"),
        ("post", f"/api/trees/{uuid.uuid4()}/members"),
        ("patch", f"/api/trees/{uuid.uuid4()}/members/1"),
        ("delete", f"/api/trees/{uuid.uuid4()}/members/1"),
    ],
)
def test_tree_endpoints_require_a_session(client: Client, method: str, path: str) -> None:
    assert getattr(client, method)(path, content_type="application/json").status_code == 401


def test_lists_only_my_trees_with_my_role_and_member_count(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    alices = default_tree_id(alice)
    add_member(alice, alices, "bob", "viewer")

    assert my_trees(alice) == [
        {"id": alices, "name": "alice's tree", "role": "owner", "member_count": 2}
    ]
    assert sorted((t["name"], t["role"], t["member_count"]) for t in my_trees(bob)) == [
        ("alice's tree", "viewer", 2),
        ("bob's tree", "owner", 1),
    ]


def test_creating_a_tree_makes_me_its_owner(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")

    response = alice.post("/api/trees", {"name": "  Work  "}, content_type="application/json")

    assert response.status_code == 201
    assert response.json()["name"] == "Work"
    assert response.json()["role"] == "owner"
    assert sorted(t["name"] for t in my_trees(alice)) == ["Work", "alice's tree"]
    assert alice.post("/api/trees", {"name": " "}, content_type="application/json").status_code == (
        422
    )


def test_only_owners_can_rename_a_tree(login_as: Callable[[str], Client]) -> None:
    alice, bob, carol = login_as("alice"), login_as("bob"), login_as("carol")
    tree = default_tree_id(alice)
    add_member(alice, tree, "bob", "editor")

    def rename(client: Client, name: str) -> Any:
        return client.patch(f"/api/trees/{tree}", {"name": name}, content_type="application/json")

    assert rename(alice, "Family").status_code == 200
    assert rename(bob, "Bob's now").status_code == 403
    assert rename(carol, "Carol's now").status_code == 404
    assert my_trees(alice)[0]["name"] == "Family"


def test_members_are_visible_to_members_only_without_contact_details(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob, carol = login_as("alice"), login_as("bob"), login_as("carol")
    tree = default_tree_id(alice)
    add_member(alice, tree, "bob", "viewer")

    listed = bob.get(f"/api/trees/{tree}/members").json()

    assert sorted((m["username"], m["role"], m["is_me"]) for m in listed) == [
        ("alice", "owner", False),
        ("bob", "viewer", True),
    ]
    assert all(set(m) == {"user_id", "username", "role", "is_me"} for m in listed)
    assert carol.get(f"/api/trees/{tree}/members").status_code == 404


def test_owner_adds_members_by_username(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    login_as("carol")
    tree = default_tree_id(alice)

    added = add_member(alice, tree, "bob", "editor")

    assert added.status_code == 201
    assert added.json()["username"] == "bob"
    assert members(alice, tree) == {"alice": "owner", "bob": "editor"}
    assert add_member(alice, tree, "bob", "viewer").status_code == 409
    assert add_member(alice, tree, "nobody", "viewer").status_code == 404
    assert add_member(bob, tree, "carol", "viewer").status_code == 403  # editors can't


def test_only_owners_change_roles_and_the_last_owner_cant_be_demoted(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    tree = default_tree_id(alice)
    add_member(alice, tree, "bob", "viewer")

    assert set_role(bob, tree, "bob", "owner").status_code == 403
    assert set_role(alice, tree, "alice", "editor").status_code == 409
    assert set_role(alice, tree, "bob", "editor").status_code == 200
    assert members(alice, tree) == {"alice": "owner", "bob": "editor"}

    assert set_role(alice, tree, "bob", "owner").status_code == 200
    assert set_role(bob, tree, "alice", "viewer").status_code == 200  # bob is an owner now
    assert members(bob, tree) == {"alice": "viewer", "bob": "owner"}


def test_owner_removes_a_member_who_then_loses_access(login_as: Callable[[str], Client]) -> None:
    alice, bob, carol = login_as("alice"), login_as("bob"), login_as("carol")
    tree = default_tree_id(alice)
    add_member(alice, tree, "bob", "editor")
    add_member(alice, tree, "carol", "editor")
    ann = alice.post("/api/people", {"name": "Ann"}, content_type="application/json").json()

    assert remove(carol, tree, "bob").status_code == 403  # editors can't remove others
    assert remove(alice, tree, "bob").status_code == 204

    assert bob.get(f"/api/people/{ann['id']}").status_code == 404
    assert bob.get("/api/people", {"tree": tree}).status_code == 404
    assert [t["name"] for t in my_trees(bob)] == ["bob's tree"]


def test_members_can_leave_unless_they_are_the_last_owner(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    tree = default_tree_id(alice)
    add_member(alice, tree, "bob", "viewer")

    assert remove(alice, tree, "alice").status_code == 409
    assert remove(bob, tree, "bob").status_code == 204
    assert members(alice, tree) == {"alice": "owner"}

    add_member(alice, tree, "bob", "owner")
    assert remove(alice, tree, "alice").status_code == 204
    assert members(bob, tree) == {"bob": "owner"}


def test_leaving_drops_my_this_is_me_marker(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    tree = default_tree_id(alice)
    add_member(alice, tree, "bob", "viewer")
    ann = alice.post("/api/people", {"name": "Ann"}, content_type="application/json").json()
    assert bob.put(f"/api/people/{ann['id']}/me").status_code == 200

    remove(bob, tree, "bob")
    add_member(alice, tree, "bob", "viewer")

    assert bob.get(f"/api/people/{ann['id']}").json()["is_me"] is False


def test_two_users_share_a_tree(login_as: Callable[[str], Client]) -> None:
    alice, bob, carol = login_as("alice"), login_as("bob"), login_as("carol")
    tree = default_tree_id(alice)
    add_member(alice, tree, "bob", "editor")
    add_member(alice, tree, "carol", "viewer")

    added = bob.post(
        "/api/people",
        {"name": "Dana"},
        QUERY_STRING=f"tree={tree}",
        content_type="application/json",
    )
    assert added.status_code == 201
    dana = added.json()["id"]

    assert [p["name"] for p in alice.get("/api/people").json()] == ["Dana"]
    assert [p["name"] for p in carol.get("/api/people", {"tree": tree}).json()] == ["Dana"]
    patch = carol.patch(f"/api/people/{dana}", {"name": "X"}, content_type="application/json")
    assert patch.status_code == 403
    assert bob.get("/api/people").json() == []  # bob's own default tree is still his


def test_without_a_tree_of_my_own_the_default_is_one_im_in(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    login_as("carol")
    alices, bobs = default_tree_id(alice), default_tree_id(bob)
    bob.post("/api/people", {"name": "Bea"}, content_type="application/json")
    add_member(bob, bobs, "alice", "viewer")
    add_member(alice, alices, "carol", "owner")
    remove(alice, alices, "alice")

    assert [p["name"] for p in alice.get("/api/people").json()] == ["Bea"]
    remove(alice, bobs, "alice")
    assert alice.get("/api/people").status_code == 404
    assert my_trees(alice) == []
