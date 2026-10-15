from collections.abc import Callable

import pytest
from django.contrib.auth.models import User
from django.test import Client


@pytest.fixture
def login_as(db: None) -> Callable[[str], Client]:
    """Create a user and return a client with a session for them."""

    def _login_as(username: str) -> Client:
        user = User.objects.create_user(username, password="unused-in-these-tests")
        client = Client()
        client.force_login(user)
        return client

    return _login_as
