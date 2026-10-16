from collections.abc import Callable, Iterator

import pytest
from django.contrib.auth.models import User
from django.test import Client

from relationtree import photos
from tests.fakes import FakePhotoStorage


@pytest.fixture
def login_as(db: None) -> Callable[[str], Client]:
    """Create a user and return a client with a session for them."""

    def _login_as(username: str) -> Client:
        user = User.objects.create_user(username, password="unused-in-these-tests")
        client = Client()
        client.force_login(user)
        return client

    return _login_as


@pytest.fixture(autouse=True)
def photo_storage() -> Iterator[FakePhotoStorage]:
    """Every test gets a fake R2 so nothing ever talks to the real bucket."""
    fake = FakePhotoStorage()
    photos.set_photo_storage(fake)
    yield fake
    photos.set_photo_storage(None)
