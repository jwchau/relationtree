import uuid
from collections.abc import Callable
from typing import Any

import pytest
from django.contrib.auth.models import User
from django.test import Client

from relationtree.models import Tree, TreeMembership

SOME_ID = uuid.uuid4()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/people"),
        ("post", "/api/people"),
        ("get", f"/api/people/{SOME_ID}"),
        ("patch", f"/api/people/{SOME_ID}"),
        ("delete", f"/api/people/{SOME_ID}"),
    ],
)
def test_people_endpoints_require_a_session(client: Client, method: str, path: str) -> None:
    response = getattr(client, method)(path, content_type="application/json")

    assert response.status_code == 401


def test_new_user_can_create_a_person_straight_away(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")

    response = alice.post(
        "/api/people",
        {"name": "Sam Rivera", "relationship_category": "FRIEND"},
        content_type="application/json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Sam Rivera"
    assert body["relationship_category"] == "FRIEND"
    assert uuid.UUID(body["id"])


def test_person_round_trip(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    created = alice.post(
        "/api/people", {"name": "Sam Rivera"}, content_type="application/json"
    ).json()
    url = f"/api/people/{created['id']}"

    assert alice.get(url).json()["name"] == "Sam Rivera"
    assert [p["id"] for p in alice.get("/api/people").json()] == [created["id"]]

    updated = alice.patch(
        url,
        {"notes": "Met at the climbing gym", "last_contacted_date": "2026-10-01"},
        content_type="application/json",
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Sam Rivera"  # untouched fields survive a PATCH
    assert updated.json()["notes"] == "Met at the climbing gym"
    assert updated.json()["last_contacted_date"] == "2026-10-01"

    assert alice.delete(url).status_code == 204
    assert alice.get(url).status_code == 404
    assert alice.get("/api/people").json() == []


def test_people_in_someone_elses_tree_are_invisible(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    sam = alice.post("/api/people", {"name": "Sam"}, content_type="application/json").json()
    url = f"/api/people/{sam['id']}"

    assert bob.get("/api/people").json() == []
    assert bob.get(url).status_code == 404
    assert bob.patch(url, {"name": "Hacked"}, content_type="application/json").status_code == 404
    assert bob.delete(url).status_code == 404

    # Alice's data is untouched by Bob's attempts.
    assert alice.get(url).json()["name"] == "Sam"


def test_viewer_of_a_shared_tree_can_read_but_not_write(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    sam = alice.post("/api/people", {"name": "Sam"}, content_type="application/json").json()
    url = f"/api/people/{sam['id']}"
    alices_tree = TreeMembership.objects.get(user__username="alice").tree
    TreeMembership.objects.create(
        tree=alices_tree, user=User.objects.get(username="bob"), role=TreeMembership.Role.VIEWER
    )

    assert [p["name"] for p in bob.get("/api/people", {"tree": str(alices_tree.id)}).json()] == [
        "Sam"
    ]
    assert bob.get(url).status_code == 200
    assert bob.patch(url, {"name": "Hacked"}, content_type="application/json").status_code == 403
    assert bob.delete(url).status_code == 403
    assert alice.get(url).json()["name"] == "Sam"


@pytest.mark.parametrize("blank", ["", "   ", None])
def test_a_person_must_have_a_name(login_as: Callable[[str], Client], blank: str | None) -> None:
    alice = login_as("alice")
    sam = alice.post("/api/people", {"name": "Sam"}, content_type="application/json").json()

    create = alice.post("/api/people", {"name": blank}, content_type="application/json")
    update = alice.patch(
        f"/api/people/{sam['id']}", {"name": blank}, content_type="application/json"
    )

    assert create.status_code == 422
    assert update.status_code == 422
    assert alice.get(f"/api/people/{sam['id']}").json()["name"] == "Sam"


@pytest.mark.parametrize("field", ["context", "phone", "email", "address", "notes"])
def test_text_fields_reject_null_but_accept_empty(
    login_as: Callable[[str], Client], field: str
) -> None:
    alice = login_as("alice")
    sam = alice.post("/api/people", {"name": "Sam"}, content_type="application/json").json()
    url = f"/api/people/{sam['id']}"

    assert alice.patch(url, {field: None}, content_type="application/json").status_code == 422
    assert alice.patch(url, {field: ""}, content_type="application/json").status_code == 200


def share(owner: str, member: str, role: TreeMembership.Role) -> Tree:
    tree = TreeMembership.objects.get(user__username=owner, role=TreeMembership.Role.OWNER).tree
    TreeMembership.objects.create(tree=tree, user=User.objects.get(username=member), role=role)
    return tree


def test_listing_people_covers_one_tree_defaulting_to_my_own(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    alice.post("/api/people", {"name": "Ann"}, content_type="application/json")
    bob.post("/api/people", {"name": "Bea"}, content_type="application/json")
    alices = share("alice", "bob", TreeMembership.Role.VIEWER)

    assert [p["name"] for p in bob.get("/api/people").json()] == ["Bea"]
    assert [p["name"] for p in bob.get("/api/people", {"tree": str(alices.id)}).json()] == ["Ann"]
    assert alice.get("/api/people", {"tree": str(uuid.uuid4())}).status_code == 404
    bobs = TreeMembership.objects.get(user__username="bob", role=TreeMembership.Role.OWNER).tree
    assert alice.get("/api/people", {"tree": str(bobs.id)}).status_code == 404


def test_creating_a_person_goes_into_the_given_tree(login_as: Callable[[str], Client]) -> None:
    alice, bob, carol = login_as("alice"), login_as("bob"), login_as("carol")
    alices = share("alice", "bob", TreeMembership.Role.EDITOR)
    TreeMembership.objects.create(
        tree=alices, user=User.objects.get(username="carol"), role=TreeMembership.Role.VIEWER
    )

    def create(client: Client, tree: object) -> Any:
        return client.post(
            "/api/people",
            {"name": "Dana"},
            QUERY_STRING=f"tree={tree}",
            content_type="application/json",
        )

    created = create(bob, alices.id)
    assert created.status_code == 201
    assert created.json()["tree_id"] == str(alices.id)
    assert create(carol, alices.id).status_code == 403
    assert create(carol, uuid.uuid4()).status_code == 404
    assert [p["name"] for p in alice.get("/api/people").json()] == ["Dana"]


def test_people_say_which_tree_they_are_in(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    tree = TreeMembership.objects.get(user__username="alice").tree

    sam = alice.post("/api/people", {"name": "Sam"}, content_type="application/json").json()

    assert sam["tree_id"] == str(tree.id)
    assert alice.get(f"/api/people/{sam['id']}").json()["tree_id"] == str(tree.id)
