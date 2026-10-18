import pytest
from django.contrib.auth.models import User
from django.test import Client
from pytest_django.fixtures import Settings

PASSWORD = "correct-horse-battery"


@pytest.fixture
def alice() -> User:
    return User.objects.create_user("alice", password=PASSWORD)


@pytest.mark.django_db
def test_login_with_valid_credentials_then_me_returns_user(client: Client, alice: User) -> None:
    login = client.post(
        "/api/auth/login",
        {"username": "alice", "password": PASSWORD},
        content_type="application/json",
    )

    assert login.status_code == 200
    assert login.json() == {"id": alice.id, "username": "alice"}

    me = client.get("/api/auth/me")

    assert me.status_code == 200
    assert me.json() == {"id": alice.id, "username": "alice"}


@pytest.mark.django_db
def test_login_with_wrong_password_is_rejected_and_no_session_starts(
    client: Client, alice: User
) -> None:
    login = client.post(
        "/api/auth/login",
        {"username": "alice", "password": "wrong"},
        content_type="application/json",
    )

    assert login.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.django_db
def test_logout_ends_the_session(client: Client, alice: User) -> None:
    client.post(
        "/api/auth/login",
        {"username": "alice", "password": PASSWORD},
        content_type="application/json",
    )

    logout = client.post("/api/auth/logout")

    assert logout.status_code == 204
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.django_db
def test_login_requires_the_csrf_token_from_the_csrf_endpoint(alice: User) -> None:
    browser = Client(enforce_csrf_checks=True)
    credentials = {"username": "alice", "password": PASSWORD}

    without_token = browser.post("/api/auth/login", credentials, content_type="application/json")
    assert without_token.status_code == 403

    token = browser.get("/api/auth/csrf").json()["csrf_token"]
    with_token = browser.post(
        "/api/auth/login",
        credentials,
        content_type="application/json",
        headers={"X-CSRFToken": token},
    )
    assert with_token.status_code == 200


@pytest.mark.django_db
def test_repeated_failed_logins_lock_out_even_the_correct_password(
    client: Client, alice: User
) -> None:
    for _ in range(5):
        client.post(
            "/api/auth/login",
            {"username": "alice", "password": "wrong"},
            content_type="application/json",
        )

    login = client.post(
        "/api/auth/login",
        {"username": "alice", "password": PASSWORD},
        content_type="application/json",
    )

    assert login.status_code == 429
    assert client.get("/api/auth/me").status_code == 401


APP_ORIGIN = "https://relationtree.johnchau.org"
API_HOST = "relationtree-api.johnchau.org"


@pytest.mark.django_db
@pytest.mark.parametrize(("origin", "expected"), [(APP_ORIGIN, 200), ("https://evil.example", 403)])
def test_login_through_the_tunnel_is_csrf_checked_against_the_app_origin(
    settings: Settings, alice: User, origin: str, expected: int
) -> None:
    # Prod values from .env.prod: the app on Pages calls the API through the tunnel.
    settings.ALLOWED_HOSTS = [API_HOST]
    settings.CSRF_TRUSTED_ORIGINS = [APP_ORIGIN]
    browser = Client(enforce_csrf_checks=True)
    tunnel = {"Host": API_HOST, "X-Forwarded-Proto": "https", "Origin": origin}

    token = browser.get("/api/auth/csrf", headers=tunnel).json()["csrf_token"]
    login = browser.post(
        "/api/auth/login",
        {"username": "alice", "password": PASSWORD},
        content_type="application/json",
        headers={**tunnel, "X-CSRFToken": token},
    )

    assert login.status_code == expected
