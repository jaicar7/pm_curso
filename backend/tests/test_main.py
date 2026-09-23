from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_serves_hello_world_html() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Kanban Studio" in response.text


def test_api_health_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "project-management-mvp"}
