from collections.abc import Callable, Iterator

import pytest
from django.contrib.auth.models import User
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client

from relationtree import ai, photos
from tests.fakes import FakeChatModel, FakeEmbedder, FakePhotoStorage


@pytest.fixture
def migrator(transactional_db: None) -> Iterator[None]:
    """For tests that migrate back to check a data migration: puts the database back on the
    latest migrations afterwards, or every later test would run against the old schema."""
    yield
    executor = MigrationExecutor(connection)
    executor.migrate(executor.loader.graph.leaf_nodes())


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


@pytest.fixture(autouse=True)
def chat_model() -> Iterator[FakeChatModel]:
    """Every test gets a fake LLM so nothing ever calls Ollama."""
    fake = FakeChatModel()
    ai.set_chat_model(fake)
    yield fake
    ai.set_chat_model(None)


@pytest.fixture(autouse=True)
def embedder() -> Iterator[FakeEmbedder]:
    """Every test gets a fake embedding model so nothing ever calls Ollama."""
    fake = FakeEmbedder()
    ai.set_embedder(fake)
    yield fake
    ai.set_embedder(None)
