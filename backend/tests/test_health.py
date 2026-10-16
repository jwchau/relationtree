import pytest
from django.test import Client


@pytest.mark.django_db
def test_health_reports_ok_when_database_reachable(client: Client) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


@pytest.mark.django_db
def test_health_allows_frontend_origin_with_credentials(client: Client) -> None:
    response = client.get("/api/health", headers={"Origin": "http://127.0.0.1:5174"})

    assert response.headers["Access-Control-Allow-Origin"] == "http://127.0.0.1:5174"
    assert response.headers["Access-Control-Allow-Credentials"] == "true"


@pytest.mark.django_db
def test_health_rejects_unknown_origin(client: Client) -> None:
    response = client.get("/api/health", headers={"Origin": "https://evil.example"})

    assert "Access-Control-Allow-Origin" not in response.headers
