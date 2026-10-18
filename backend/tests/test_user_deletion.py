from collections.abc import Callable
from typing import Any

from django.contrib.auth.models import User
from django.test import Client

from relationtree.models import Connection, Person, Tree, TreeMembership
from tests.fakes import FakePhotoStorage


def add_person(client: Client, name: str) -> dict[str, Any]:
    response = client.post("/api/people", {"name": name}, content_type="application/json")
    assert response.status_code == 201
    person: dict[str, Any] = response.json()
    return person


def connect(client: Client, a: dict[str, Any], b: dict[str, Any]) -> None:
    response = client.post(
        "/api/connections",
        {"person_a_id": a["id"], "person_b_id": b["id"], "type": "FRIEND"},
        content_type="application/json",
    )
    assert response.status_code == 201


def test_deleting_a_user_deletes_their_tree_with_its_people_and_connections(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    connect(alice, add_person(alice, "Sam"), add_person(alice, "Ann"))

    User.objects.get(username="alice").delete()

    assert not Tree.objects.exists()
    assert not Person.objects.exists()
    assert not Connection.objects.exists()


def test_deleting_a_user_deletes_their_peoples_photos(
    login_as: Callable[[str], Client], photo_storage: FakePhotoStorage
) -> None:
    alice = login_as("alice")
    sam = add_person(alice, "Sam")
    Person.objects.filter(id=sam["id"]).update(photo_key="trees/t/people/sam/photo.jpg")

    User.objects.get(username="alice").delete()

    assert photo_storage.deleted == ["trees/t/people/sam/photo.jpg"]


def test_deleting_a_user_leaves_other_users_trees_alone(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    add_person(alice, "Sam")
    add_person(bob, "Ann")

    User.objects.get(username="alice").delete()

    assert [p["name"] for p in bob.get("/api/people").json()] == ["Ann"]


def test_a_tree_with_another_owner_survives_without_the_deleted_user(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    add_person(alice, "Sam")
    alices_tree = TreeMembership.objects.get(user__username="alice").tree
    TreeMembership.objects.create(
        tree=alices_tree, user=User.objects.get(username="bob"), role=TreeMembership.Role.OWNER
    )

    User.objects.get(username="alice").delete()

    assert sorted(p["name"] for p in bob.get("/api/people").json()) == ["Sam"]
    assert list(alices_tree.memberships.values_list("user__username", flat=True)) == ["bob"]


def test_bulk_deleting_users_in_the_admin_deletes_their_trees(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    add_person(alice, "Sam")
    add_person(bob, "Ann")
    admin = Client()
    admin.force_login(User.objects.create_superuser("admin", password="unused-in-these-tests"))

    response = admin.post(
        "/admin/auth/user/",
        {
            "action": "delete_selected",
            "_selected_action": list(
                User.objects.filter(username__in=["alice", "bob"]).values_list("pk", flat=True)
            ),
            "post": "yes",
        },
    )

    assert response.status_code == 302
    assert not User.objects.filter(username__in=["alice", "bob"]).exists()
    assert list(Tree.objects.values_list("name", flat=True)) == ["admin's tree"]
    assert not Person.objects.exists()
