from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import Database
from conftest import BOARD


def test_login_sets_http_only_session_cookie(anonymous: TestClient) -> None:
    response = anonymous.post("/api/auth/login", json={"username": "user", "password": "password"})

    assert response.status_code == 200
    assert response.json()["username"] == "user"
    assert response.json()["is_admin"] is True
    assert "password_hash" not in response.json()
    cookie = response.headers["set-cookie"]
    assert "pm_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert anonymous.get("/api/auth/me").json()["username"] == "user"


def test_login_is_case_insensitive_for_username(anonymous: TestClient) -> None:
    assert anonymous.post("/api/auth/login", json={"username": "USER", "password": "password"}).status_code == 200


@pytest.mark.parametrize(
    "credentials",
    [
        {"username": "user", "password": "wrong-password"},
        {"username": "nobody", "password": "password"},
    ],
)
def test_login_rejects_bad_credentials(anonymous: TestClient, credentials: dict) -> None:
    response = anonymous.post("/api/auth/login", json=credentials)

    assert response.status_code == 401
    assert response.json()["detail"] == "Usuario o contraseña incorrectos."
    assert anonymous.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/auth/me"),
        ("put", "/api/auth/password"),
        ("get", "/api/boards"),
        ("post", "/api/boards"),
        ("get", BOARD),
        ("patch", BOARD),
        ("delete", BOARD),
        ("post", f"{BOARD}/columns"),
        ("patch", f"{BOARD}/columns/col-backlog"),
        ("delete", f"{BOARD}/columns/col-backlog"),
        ("post", f"{BOARD}/columns/col-backlog/cards"),
        ("patch", f"{BOARD}/cards/card-1"),
        ("delete", f"{BOARD}/cards/card-1"),
        ("post", f"{BOARD}/cards/card-1/move"),
        ("post", f"{BOARD}/ai"),
        ("post", "/api/ai/chat"),
        ("get", "/api/users"),
        ("post", "/api/users"),
        ("patch", "/api/users/user-1"),
        ("delete", "/api/users/user-1"),
    ],
)
def test_protected_endpoints_require_a_session(anonymous: TestClient, method: str, path: str) -> None:
    response = anonymous.request(method, path, json={})

    assert response.status_code == 401
    assert response.json()["detail"] == "No has iniciado sesión"


def test_invalid_session_cookie_is_rejected(anonymous: TestClient) -> None:
    anonymous.cookies.set("pm_session", "forged-token")

    assert anonymous.get("/api/auth/me").status_code == 401


def test_logout_invalidates_the_session(client: TestClient) -> None:
    token = client.cookies.get("pm_session")

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401

    # Reusing the old token after logout must not work either.
    client.cookies.set("pm_session", token)
    assert client.get("/api/auth/me").status_code == 401


def test_logout_without_session_is_harmless(anonymous: TestClient) -> None:
    assert anonymous.post("/api/auth/logout").status_code == 204


def test_expired_sessions_are_rejected(client: TestClient, database: Database) -> None:
    old = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    with database.connect() as connection:
        connection.execute("UPDATE sessions SET created_at = ?", (old,))

    assert client.get("/api/auth/me").status_code == 401


def test_register_creates_user_with_starter_board_and_signs_in(anonymous: TestClient) -> None:
    response = anonymous.post("/api/auth/register", json={"username": "ana", "password": "secreto123"})

    assert response.status_code == 201
    assert response.json()["username"] == "ana"
    assert response.json()["is_admin"] is False
    boards = anonymous.get("/api/boards").json()
    assert [board["title"] for board in boards] == ["Mi primer tablero"]
    columns = anonymous.get(f"/api/boards/{boards[0]['id']}").json()["columns"]
    assert [column["title"] for column in columns] == ["Pendientes", "Descubrimiento", "En curso", "Revisión", "Hecho"]
    assert all(column["cards"] == [] for column in columns)


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"username": "user", "password": "password123"}, "Ese nombre de usuario ya existe"),
        ({"username": "USER", "password": "password123"}, "Ese nombre de usuario ya existe"),
        ({"username": "ab", "password": "password123"}, "El usuario debe tener entre 3 y 32"),
        ({"username": "con espacio", "password": "password123"}, "El usuario debe tener entre 3 y 32"),
        ({"username": "valido", "password": "corta"}, "al menos 8 caracteres"),
    ],
)
def test_register_validates_input(anonymous: TestClient, payload: dict, message: str) -> None:
    response = anonymous.post("/api/auth/register", json=payload)

    assert response.status_code == 400
    assert message in response.json()["detail"]
    assert anonymous.get("/api/auth/me").status_code == 401


def test_change_password_requires_current_password(client: TestClient) -> None:
    response = client.put("/api/auth/password", json={"current_password": "wrong", "new_password": "nuevaclave1"})

    assert response.status_code == 400
    assert response.json()["detail"] == "La contraseña actual no es correcta"


def test_change_password_rejects_short_password(client: TestClient) -> None:
    response = client.put("/api/auth/password", json={"current_password": "password", "new_password": "corta"})

    assert response.status_code == 400


def test_change_password_signs_out_other_sessions(make_client: Callable[..., TestClient]) -> None:
    browser = make_client("user")
    other_device = make_client("user")

    response = browser.put("/api/auth/password", json={"current_password": "password", "new_password": "nuevaclave1"})

    assert response.status_code == 204
    assert browser.get("/api/auth/me").status_code == 200
    assert other_device.get("/api/auth/me").status_code == 401
    fresh = make_client()
    assert fresh.post("/api/auth/login", json={"username": "user", "password": "password"}).status_code == 401
    assert fresh.post("/api/auth/login", json={"username": "user", "password": "nuevaclave1"}).status_code == 200
