from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.database import Database


def create_user(client: TestClient, username: str, is_admin: bool = False) -> dict:
    response = client.post("/api/users", json={"username": username, "password": "password123", "is_admin": is_admin})
    assert response.status_code == 201, response.text
    return response.json()


def test_regular_users_cannot_manage_users(register: Callable[..., TestClient]) -> None:
    regular = register("ana")

    for method, path in [("get", "/api/users"), ("post", "/api/users"), ("patch", "/api/users/user-1"), ("delete", "/api/users/user-1")]:
        response = regular.request(method, path, json={"username": "x", "password": "password123"})
        assert response.status_code == 403
        assert response.json()["detail"] == "Necesitas permisos de administrador"


def test_admin_lists_users_with_board_counts(client: TestClient, register: Callable[..., TestClient]) -> None:
    register("ana")

    users = client.get("/api/users").json()

    assert [(user["username"], user["is_admin"], user["board_count"]) for user in users] == [
        ("user", True, 1),
        ("ana", False, 1),
    ]
    assert all("password_hash" not in user for user in users)


def test_admin_creates_users_who_can_sign_in(client: TestClient, make_client: Callable[..., TestClient]) -> None:
    created = create_user(client, "maria", is_admin=True)

    assert created["is_admin"] is True
    maria = make_client("maria", "password123")
    assert maria.get("/api/auth/me").json()["username"] == "maria"
    assert maria.get("/api/users").status_code == 200


def test_admin_create_user_validates(client: TestClient) -> None:
    create_user(client, "maria")

    assert client.post("/api/users", json={"username": "maria", "password": "password123"}).status_code == 400
    assert client.post("/api/users", json={"username": "x", "password": "password123"}).status_code == 400
    assert client.post("/api/users", json={"username": "pedro", "password": "123"}).status_code == 400


def test_admin_promotes_and_demotes_users(client: TestClient) -> None:
    user_id = create_user(client, "maria")["id"]

    promoted = client.patch(f"/api/users/{user_id}", json={"is_admin": True})
    demoted = client.patch(f"/api/users/{user_id}", json={"is_admin": False})

    assert promoted.status_code == 200 and promoted.json()["is_admin"] is True
    assert demoted.status_code == 200 and demoted.json()["is_admin"] is False


def test_admin_resets_password_and_signs_user_out(client: TestClient, make_client: Callable[..., TestClient]) -> None:
    user_id = create_user(client, "maria")["id"]
    maria = make_client("maria", "password123")

    response = client.patch(f"/api/users/{user_id}", json={"password": "restablecida1"})

    assert response.status_code == 200
    assert maria.get("/api/auth/me").status_code == 401
    assert make_client().post("/api/auth/login", json={"username": "maria", "password": "restablecida1"}).status_code == 200


def test_admin_cannot_demote_or_delete_themselves(client: TestClient) -> None:
    demote = client.patch("/api/users/user-1", json={"is_admin": False})
    delete = client.delete("/api/users/user-1")

    assert demote.status_code == 400
    assert demote.json()["detail"] == "No puedes quitarte los permisos de administrador"
    assert delete.status_code == 400
    assert delete.json()["detail"] == "No puedes eliminar tu propio usuario"


def test_deleting_user_removes_their_boards_and_sessions(
    client: TestClient, make_client: Callable[..., TestClient], database: Database
) -> None:
    user_id = create_user(client, "maria")["id"]
    maria = make_client("maria", "password123")
    board_id = maria.get("/api/boards").json()[0]["id"]
    column_id = maria.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]
    maria.post(f"/api/boards/{board_id}/columns/{column_id}/cards", json={"title": "Tarea"})

    assert client.delete(f"/api/users/{user_id}").status_code == 204

    assert maria.get("/api/auth/me").status_code == 401
    assert [user["username"] for user in client.get("/api/users").json()] == ["user"]
    with database.connect() as connection:
        for query, value in [
            ("SELECT COUNT(*) FROM boards WHERE user_id = ?", user_id),
            ("SELECT COUNT(*) FROM sessions WHERE user_id = ?", user_id),
            ("SELECT COUNT(*) FROM columns WHERE board_id = ?", board_id),
            ("SELECT COUNT(*) FROM cards WHERE board_id = ?", board_id),
        ]:
            assert connection.execute(query, (value,)).fetchone()[0] == 0, query


def test_unknown_users_return_404(client: TestClient) -> None:
    assert client.patch("/api/users/missing", json={"is_admin": True}).status_code == 404
    assert client.delete("/api/users/missing").status_code == 404


def test_last_admin_cannot_be_removed(database: Database) -> None:
    with database.accounts() as accounts:
        other = accounts.create_user("maria", "password123", is_admin=True)
        accounts.delete_user(other["id"])
        with pytest.raises(ValueError, match="al menos un administrador"):
            accounts.update_user("user-1", is_admin=False)
        with pytest.raises(ValueError, match="al menos un administrador"):
            accounts.delete_user("user-1")


def test_another_admin_can_demote_an_admin(client: TestClient, make_client: Callable[..., TestClient]) -> None:
    create_user(client, "maria", is_admin=True)
    maria = make_client("maria", "password123")

    response = maria.patch("/api/users/user-1", json={"is_admin": False})

    assert response.status_code == 200
    assert client.get("/api/users").status_code == 403
