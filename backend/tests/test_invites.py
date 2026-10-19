from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

import pytest
from django.contrib.auth.models import User
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from relationtree.models import Invite, TreeMembership

STRONG_PASSWORD = "correct-horse-battery-staple-42"


def tree_of(username: str) -> str:
    membership = TreeMembership.objects.get(user__username=username, role="owner")
    return str(membership.tree_id)


def invite(client: Client, tree_id: str, role: str = "editor") -> Any:
    return client.post(
        f"/api/trees/{tree_id}/invites", {"role": role}, content_type="application/json"
    )


def make_invite(client: Client, tree_id: str, role: str = "editor") -> str:
    response = invite(client, tree_id, role)
    assert response.status_code == 201
    token: str = response.json()["token"]
    return token


def accept(client: Client, token: str) -> Any:
    return client.post(f"/api/invites/{token}/accept")


def signup(client: Client, token: str, username: str, password: str = STRONG_PASSWORD) -> Any:
    return client.post(
        f"/api/invites/{token}/signup",
        {"username": username, "password": password},
        content_type="application/json",
    )


def roles_in(tree_id: str) -> dict[str, str]:
    return dict(
        TreeMembership.objects.filter(tree_id=tree_id).values_list("user__username", "role")
    )


def test_only_owners_create_invites_which_last_a_week(login_as: Callable[[str], Client]) -> None:
    alice, bob, carol = login_as("alice"), login_as("bob"), login_as("carol")
    tree = tree_of("alice")
    TreeMembership.objects.create(
        tree_id=tree, user=User.objects.get(username="bob"), role="editor"
    )

    created = invite(alice, tree, "viewer")

    assert created.status_code == 201
    body = created.json()
    assert len(body["token"]) >= 40
    assert body["role"] == "viewer"
    expires = datetime.fromisoformat(body["expires_at"])
    assert timedelta(days=6, hours=23) < expires - timezone.now() <= timedelta(days=7)
    assert invite(bob, tree).status_code == 403
    assert invite(carol, tree).status_code == 404


def test_only_a_hash_of_the_token_is_stored(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    token = make_invite(alice, tree_of("alice"))

    stored = Invite.objects.get()

    assert token not in str(Invite.objects.values().get())
    assert stored.token_hash != token
    assert len(stored.token_hash) == 64


def test_owners_list_pending_invites_without_tokens(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    tree = tree_of("alice")
    pending = make_invite(alice, tree, "viewer")
    used = make_invite(alice, tree, "editor")
    accept(bob, used)
    expired = make_invite(alice, tree, "owner")
    Invite.objects.filter(role="owner").update(expires_at=timezone.now() - timedelta(seconds=1))

    listed = alice.get(f"/api/trees/{tree}/invites").json()

    assert [i["role"] for i in listed] == ["viewer"]
    assert set(listed[0]) == {"id", "role", "expires_at", "created_by"}
    assert listed[0]["created_by"] == "alice"
    assert pending not in str(listed) and expired not in str(listed)
    assert bob.get(f"/api/trees/{tree}/invites").status_code == 403  # bob is an editor now


def test_owners_revoke_invites(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    tree = tree_of("alice")
    token = make_invite(alice, tree)
    invite_id = Invite.objects.get().id

    assert bob.delete(f"/api/trees/{tree}/invites/{invite_id}").status_code == 404
    # Bob owns his own tree, but can't reach alice's invite through it.
    assert bob.delete(f"/api/trees/{tree_of('bob')}/invites/{invite_id}").status_code == 204
    assert Client().get(f"/api/invites/{token}").status_code == 200
    assert alice.delete(f"/api/trees/{tree}/invites/{invite_id}").status_code == 204

    assert Client().get(f"/api/invites/{token}").status_code == 404
    assert alice.get(f"/api/trees/{tree}/invites").json() == []


def test_anyone_with_the_link_sees_what_it_is_for(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    token = make_invite(alice, tree_of("alice"), "viewer")

    response = Client().get(f"/api/invites/{token}")

    assert response.status_code == 200
    assert response.json()["tree_name"] == "alice's tree"
    assert response.json()["role"] == "viewer"
    assert response.json()["invited_by"] == "alice"
    assert "expires_at" in response.json()


@pytest.mark.parametrize("state", ["unknown", "expired", "used", "revoked"])
def test_dead_links_all_look_the_same(login_as: Callable[[str], Client], state: str) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    token = make_invite(alice, tree_of("alice"))
    match state:
        case "unknown":
            token = token[:-4] + "AAAA"
        case "expired":
            Invite.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        case "used":
            accept(bob, token)
        case "revoked":
            Invite.objects.all().delete()

    response = Client().get(f"/api/invites/{token}")

    assert response.status_code == 404
    assert response.json() == {"detail": "This invite link is invalid or has expired"}


def test_accepting_adds_me_with_the_invites_role_once(login_as: Callable[[str], Client]) -> None:
    alice, bob, carol = login_as("alice"), login_as("bob"), login_as("carol")
    tree = tree_of("alice")
    token = make_invite(alice, tree, "viewer")

    accepted = accept(bob, token)

    assert accepted.status_code == 200
    assert accepted.json()["id"] == tree
    assert accepted.json()["role"] == "viewer"
    assert roles_in(tree) == {"alice": "owner", "bob": "viewer"}
    assert Invite.objects.get().used_by.username == "bob"  # type: ignore[union-attr]
    assert accept(carol, token).status_code == 404


def test_accepting_a_tree_im_already_in_keeps_the_invite(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    tree = tree_of("alice")
    token = make_invite(alice, tree, "viewer")

    assert accept(alice, token).status_code == 409
    assert roles_in(tree) == {"alice": "owner"}
    assert accept(bob, token).status_code == 200


@pytest.mark.django_db
def test_accepting_needs_a_session() -> None:
    assert Client().post("/api/invites/anything/accept").status_code == 401


def test_signing_up_creates_my_account_logs_me_in_and_joins(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    tree = tree_of("alice")
    token = make_invite(alice, tree, "editor")
    dana = Client()

    response = signup(dana, token, "dana")

    assert response.status_code == 201
    assert response.json()["id"] == tree
    assert dana.get("/api/auth/me").json()["username"] == "dana"
    assert roles_in(tree) == {"alice": "owner", "dana": "editor"}
    assert User.objects.get(username="dana").check_password(STRONG_PASSWORD)
    assert Client().get(f"/api/invites/{token}").status_code == 404


@pytest.mark.parametrize(
    ("username", "password", "status"),
    [
        ("bob", STRONG_PASSWORD, 409),  # taken
        ("BOB", STRONG_PASSWORD, 409),  # taken, ignoring case
        ("dana", "password", 422),  # too common
        ("dana", "12345678901", 422),  # all numbers
        ("has space", STRONG_PASSWORD, 422),
        ("  ", STRONG_PASSWORD, 422),
    ],
)
def test_bad_signups_create_nothing_and_keep_the_invite(
    login_as: Callable[[str], Client], username: str, password: str, status: int
) -> None:
    alice = login_as("alice")
    login_as("bob")
    token = make_invite(alice, tree_of("alice"))
    users_before = User.objects.count()

    response = signup(Client(), token, username, password)

    assert response.status_code == status
    assert isinstance(response.json()["detail"], str | list)
    assert User.objects.count() == users_before
    assert Client().get(f"/api/invites/{token}").status_code == 200


def test_signing_up_checks_csrf(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    token = make_invite(alice, tree_of("alice"))

    response = signup(Client(enforce_csrf_checks=True), token, "dana")

    assert response.status_code == 403
    assert not User.objects.filter(username="dana").exists()


def test_expired_invites_cant_be_used(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    token = make_invite(alice, tree_of("alice"))
    Invite.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    assert accept(bob, token).status_code == 404
    assert signup(Client(), token, "dana").status_code == 404
    assert not User.objects.filter(username="dana").exists()


def test_using_an_invite_locks_it(login_as: Callable[[str], Client]) -> None:
    """Two people using one link at the same moment: the row lock makes the second wait and
    then find the invite used."""
    alice, bob = login_as("alice"), login_as("bob")
    token = make_invite(alice, tree_of("alice"))

    with CaptureQueriesContext(connection) as ctx:
        accept(bob, token)

    invite_queries = [q["sql"] for q in ctx.captured_queries if "relationtree_invite" in q["sql"]]
    assert any("FOR UPDATE" in sql for sql in invite_queries)


def test_a_new_person_joins_through_an_invite_link(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    tree = tree_of("alice")
    alice.post("/api/people", {"name": "Grandma"}, content_type="application/json")
    token = make_invite(alice, tree, "viewer")
    dana = Client()

    assert signup(dana, token, "dana").status_code == 201

    shared = dana.get("/api/people", {"tree": tree}).json()
    assert [p["name"] for p in shared] == ["Grandma"]
    patch = dana.patch(
        f"/api/people/{shared[0]['id']}", {"name": "X"}, content_type="application/json"
    )
    assert patch.status_code == 403
    trees = {t["name"]: t["role"] for t in dana.get("/api/trees").json()}
    assert trees == {"alice's tree": "viewer", "dana's tree": "owner"}
