from collections.abc import Callable
from typing import Any

import pytest
from django.contrib.auth.models import User
from django.test import Client

from relationtree.models import TreeMembership
from tests.fakes import FakePhotoStorage


def add_person(client: Client, name: str = "Sam") -> dict[str, Any]:
    response = client.post("/api/people", {"name": name}, content_type="application/json")
    assert response.status_code == 201
    person: dict[str, Any] = response.json()
    return person


def request_upload(
    client: Client, person_id: str, content_type: str = "image/jpeg", size: int = 200_000
) -> Any:
    return client.post(
        f"/api/people/{person_id}/photo/upload-url",
        {"content_type": content_type, "size": size},
        content_type="application/json",
    )


def test_upload_url_targets_a_key_in_that_persons_folder(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    sam = add_person(alice)

    response = request_upload(alice, sam["id"], "image/png", 123_456)

    assert response.status_code == 200
    body = response.json()
    assert f"/people/{sam['id']}/" in body["key"]
    assert body["key"].startswith("trees/")
    assert body["key"].endswith(".png")
    assert body["upload_url"] == f"https://r2.test/{body['key']}?op=put&type=image/png&size=123456"


@pytest.mark.parametrize(
    ("content_type", "size"),
    [
        ("application/pdf", 1_000),
        ("image/svg+xml", 1_000),  # SVG can carry scripts
        ("image/jpeg", 5 * 1024 * 1024 + 1),
        ("image/jpeg", 0),
    ],
)
def test_upload_url_rejects_non_images_and_oversized_files(
    login_as: Callable[[str], Client], content_type: str, size: int
) -> None:
    alice = login_as("alice")
    sam = add_person(alice)

    assert request_upload(alice, sam["id"], content_type, size).status_code == 422


def confirm(client: Client, person_id: str, key: str) -> Any:
    return client.put(
        f"/api/people/{person_id}/photo", {"key": key}, content_type="application/json"
    )


def test_confirmed_photo_is_served_as_a_download_url(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    sam, ann = add_person(alice, "Sam"), add_person(alice, "Ann")
    key = request_upload(alice, sam["id"]).json()["key"]

    confirmed = confirm(alice, sam["id"], key)

    assert confirmed.status_code == 200
    expected_url = f"https://r2.test/{key}?op=get"
    assert confirmed.json()["photo_url"] == expected_url
    assert alice.get(f"/api/people/{sam['id']}").json()["photo_url"] == expected_url
    by_name = {p["name"]: p for p in alice.get("/api/people").json()}
    assert by_name["Sam"]["photo_url"] == expected_url
    assert by_name["Ann"]["photo_url"] is None
    assert ann["photo_url"] is None


def test_confirming_a_key_outside_the_persons_folder_is_rejected(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    sam, ann = add_person(alice, "Sam"), add_person(alice, "Ann")
    dee = add_person(bob, "Dee")
    anns_key = request_upload(alice, ann["id"]).json()["key"]
    bobs_key = request_upload(bob, dee["id"]).json()["key"]

    for key in [anns_key, bobs_key, f"{anns_key}/../../../x.jpg", "anything.jpg"]:
        assert confirm(alice, sam["id"], key).status_code == 422, key

    assert alice.get(f"/api/people/{sam['id']}").json()["photo_url"] is None


def test_old_photos_are_deleted_from_storage(
    login_as: Callable[[str], Client], photo_storage: FakePhotoStorage
) -> None:
    alice = login_as("alice")
    sam = add_person(alice)
    first = request_upload(alice, sam["id"]).json()["key"]
    confirm(alice, sam["id"], first)

    second = request_upload(alice, sam["id"]).json()["key"]
    confirm(alice, sam["id"], second)
    assert photo_storage.deleted == [first]

    assert alice.delete(f"/api/people/{sam['id']}/photo").status_code == 204
    assert photo_storage.deleted == [first, second]
    assert alice.get(f"/api/people/{sam['id']}").json()["photo_url"] is None

    third = request_upload(alice, sam["id"]).json()["key"]
    confirm(alice, sam["id"], third)
    alice.delete(f"/api/people/{sam['id']}")
    assert photo_storage.deleted == [first, second, third]


def test_photo_key_cannot_be_set_through_person_create_or_update(
    login_as: Callable[[str], Client],
) -> None:
    """Otherwise a client could point a person at another tree's photo and get a URL for it."""
    alice, bob = login_as("alice"), login_as("bob")
    dee = add_person(bob, "Dee")
    bobs_key = request_upload(bob, dee["id"]).json()["key"]

    created = alice.post(
        "/api/people", {"name": "Sam", "photo_key": bobs_key}, content_type="application/json"
    ).json()
    patched = alice.patch(
        f"/api/people/{created['id']}", {"photo_key": bobs_key}, content_type="application/json"
    ).json()

    assert created["photo_url"] is None
    assert patched["photo_url"] is None


def test_photo_endpoints_respect_tree_permissions(
    login_as: Callable[[str], Client], photo_storage: FakePhotoStorage
) -> None:
    alice, bob, cat = login_as("alice"), login_as("bob"), login_as("cat")
    sam = add_person(alice)
    key = request_upload(alice, sam["id"]).json()["key"]
    confirm(alice, sam["id"], key)
    TreeMembership.objects.create(
        tree=TreeMembership.objects.get(user__username="alice").tree,
        user=User.objects.get(username="cat"),
        role=TreeMembership.Role.VIEWER,
    )
    photo_url = f"/api/people/{sam['id']}/photo"

    # Outsider: can't tell the person exists.
    assert request_upload(bob, sam["id"]).status_code == 404
    assert confirm(bob, sam["id"], key).status_code == 404
    assert bob.delete(photo_url).status_code == 404
    # Viewer: can see the photo, can't change it.
    assert cat.get(f"/api/people/{sam['id']}").json()["photo_url"] is not None
    assert request_upload(cat, sam["id"]).status_code == 403
    assert confirm(cat, sam["id"], key).status_code == 403
    assert cat.delete(photo_url).status_code == 403

    assert photo_storage.deleted == []
