import pytest
from fastapi.testclient import TestClient

from app.database import Database


def card_ids(client: TestClient, column_index: int) -> list[str]:
    return [card["id"] for card in client.get("/api/boards/me").json()["columns"][column_index]["cards"]]


def test_get_board_seeds_demo_board(client: TestClient) -> None:
    response = client.get("/api/boards/me")

    assert response.status_code == 200
    board = response.json()
    assert board["title"] == "Kanban Studio"
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert len(board["columns"][0]["cards"]) == 2


def test_rename_and_card_crud_persist(client: TestClient) -> None:
    rename_response = client.patch(
        "/api/columns/col-backlog",
        json={"title": "Ready"},
    )
    create_response = client.post(
        "/api/columns/col-backlog/cards",
        json={"title": "New card", "details": "Useful details"},
    )
    card_id = create_response.json()["id"]
    update_response = client.patch(
        f"/api/cards/{card_id}",
        json={"title": "Updated card", "details": "Updated details"},
    )
    board_response = client.get("/api/boards/me")

    assert rename_response.status_code == 200
    assert create_response.status_code == 201
    assert update_response.status_code == 200
    assert board_response.json()["columns"][0]["title"] == "Ready"
    assert board_response.json()["columns"][0]["cards"][-1]["title"] == "Updated card"


def test_move_card_persists_in_target_column(client: TestClient) -> None:
    response = client.post(
        "/api/cards/card-1/move",
        json={"column_id": "col-review", "position": 0},
    )

    assert response.status_code == 200
    assert response.json()["column_id"] == "col-review"
    assert card_ids(client, 3) == ["card-1", "card-6"]
    assert card_ids(client, 0) == ["card-2"]


def test_move_card_within_column_and_past_the_end(client: TestClient) -> None:
    client.post("/api/cards/card-2/move", json={"column_id": "col-backlog", "position": 0})
    assert card_ids(client, 0) == ["card-2", "card-1"]

    client.post("/api/cards/card-3/move", json={"column_id": "col-done", "position": 99})
    assert card_ids(client, 4) == ["card-7", "card-8", "card-3"]
    assert card_ids(client, 1) == []


def test_delete_card_after_reordering_renumbers_column(client: TestClient) -> None:
    created = [client.post("/api/columns/col-discovery/cards", json={"title": f"Card {i}"}).json()["id"] for i in range(3)]
    client.post(f"/api/cards/{created[2]}/move", json={"column_id": "col-discovery", "position": 0})
    client.post(f"/api/cards/{created[1]}/move", json={"column_id": "col-discovery", "position": 0})

    response = client.delete(f"/api/cards/{created[1]}")

    assert response.status_code == 204
    board = client.get("/api/boards/me").json()
    discovery = board["columns"][1]["cards"]
    assert [card["id"] for card in discovery] == [created[2], "card-3", created[0]]
    assert [card["position"] for card in discovery] == [0, 1, 2]


def test_delete_card_persists(client: TestClient) -> None:
    response = client.delete("/api/cards/card-8")

    assert response.status_code == 204
    board = client.get("/api/boards/me").json()
    assert all(card["id"] != "card-8" for column in board["columns"] for card in column["cards"])


def test_rejects_invalid_board_operations(client: TestClient) -> None:
    assert client.patch("/api/columns/missing", json={"title": "Nope"}).status_code == 404
    assert client.post("/api/columns/missing/cards", json={"title": "Nope"}).status_code == 404
    assert client.patch("/api/cards/card-1", json={"title": ""}).status_code == 422
    assert client.patch("/api/cards/card-1", json={"title": "   "}).status_code == 400
    assert client.patch("/api/cards/card-1", json={"title": "x" * 201}).status_code == 422
    assert client.post("/api/cards/card-1/move", json={"column_id": "missing", "position": 0}).status_code == 404
    assert client.delete("/api/cards/missing").status_code == 404


def test_users_cannot_touch_other_boards(database: Database) -> None:
    with database.connect() as connection:
        connection.execute("INSERT INTO users (id, username, password_hash, created_at) VALUES ('user-2', 'other', 'x', 'now')")
        connection.execute("INSERT INTO boards (id, user_id, title, created_at, updated_at) VALUES ('board-2', 'user-2', 'Other', 'now', 'now')")

    with database.board("user-2") as board:
        assert board.get()["columns"] == []
        with pytest.raises(LookupError):
            board.rename_column("col-backlog", "Hacked")
        with pytest.raises(LookupError):
            board.create_card("col-backlog", "Hacked")
        with pytest.raises(LookupError):
            board.update_card("card-1", "Hacked", "")
        with pytest.raises(LookupError):
            board.move_card("card-1", "col-done", 0)
        with pytest.raises(LookupError):
            board.delete_card("card-1")

    with database.board() as board:
        assert board.get()["columns"][0]["title"] == "Backlog"
