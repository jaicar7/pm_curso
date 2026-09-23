from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.database import Database
from app.main import app
import app.main as main_module


@pytest.fixture()
def client(tmp_path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    database = Database(tmp_path / "test.sqlite3")
    monkeypatch.setattr(main_module, "database", database)
    with TestClient(app) as test_client:
        yield test_client


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
    board = client.get("/api/boards/me").json()
    review_cards = board["columns"][3]["cards"]
    backlog_cards = board["columns"][0]["cards"]
    assert review_cards[0]["id"] == "card-1"
    assert all(card["id"] != "card-1" for card in backlog_cards)


def test_delete_card_persists(client: TestClient) -> None:
    response = client.delete("/api/cards/card-8")

    assert response.status_code == 204
    board = client.get("/api/boards/me").json()
    assert all(card["id"] != "card-8" for column in board["columns"] for card in column["cards"])


def test_rejects_invalid_board_operations(client: TestClient) -> None:
    assert client.patch("/api/columns/missing", json={"title": "Nope"}).status_code == 404
    assert client.post("/api/columns/missing/cards", json={"title": "Nope"}).status_code == 404
    assert client.patch("/api/cards/card-1", json={"title": ""}).status_code == 422
    assert client.delete("/api/cards/missing").status_code == 404
