import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.openrouter import OpenRouterError


def test_root_serves_the_frontend_html(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Estudio Kanban" in response.text


def test_root_falls_back_to_placeholder_without_frontend_build(client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr(main_module, "frontend_dir", tmp_path / "missing")

    response = client.get("/")

    assert response.status_code == 200
    assert '<html lang="es">' in response.text
    assert "<h1>Estudio Kanban</h1>" in response.text


def test_api_health_returns_ok(anonymous: TestClient) -> None:
    response = anonymous.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "project-management-mvp"}


def test_ai_chat_returns_model_answer(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main_module, "chat_with_openrouter", lambda message: f"eco: {message}")

    response = client.post("/api/ai/chat", json={"message": "hola"})

    assert response.status_code == 200
    assert response.json() == {"message": "eco: hola", "model": main_module.OPENROUTER_MODEL}


def test_ai_chat_maps_provider_errors_to_502(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def failing(message: str) -> str:
        raise OpenRouterError("No se pudo conectar con OpenRouter")

    monkeypatch.setattr(main_module, "chat_with_openrouter", failing)

    response = client.post("/api/ai/chat", json={"message": "hola"})

    assert response.status_code == 502
    assert response.json()["detail"] == "No se pudo conectar con OpenRouter"
