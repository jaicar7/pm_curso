from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.database import Database
from conftest import BOARD


def card_ids(client: TestClient, column_index: int, board: str = BOARD) -> list[str]:
    return [card["id"] for card in client.get(board).json()["columns"][column_index]["cards"]]


def test_get_board_returns_seeded_demo_board(client: TestClient) -> None:
    response = client.get(BOARD)

    assert response.status_code == 200
    board = response.json()
    assert board["title"] == "Estudio Kanban"
    assert [column["title"] for column in board["columns"]] == [
        "Pendientes",
        "Descubrimiento",
        "En curso",
        "Revisión",
        "Hecho",
    ]
    assert len(board["columns"][0]["cards"]) == 2
    assert board["columns"][0]["cards"][0]["priority"] == "media"
    assert board["columns"][0]["cards"][0]["due_date"] is None


# Boards


def test_list_boards_includes_card_counts(client: TestClient) -> None:
    boards = client.get("/api/boards").json()

    assert [(board["id"], board["title"], board["card_count"]) for board in boards] == [("board-1", "Estudio Kanban", 8)]
    assert boards[0]["created_at"] and boards[0]["updated_at"]


def test_create_rename_and_delete_boards(client: TestClient) -> None:
    created = client.post("/api/boards", json={"title": "  Lanzamiento  "})

    assert created.status_code == 201
    board_id = created.json()["id"]
    assert created.json()["title"] == "Lanzamiento"
    assert created.json()["card_count"] == 0
    assert [board["title"] for board in client.get("/api/boards").json()] == ["Estudio Kanban", "Lanzamiento"]
    assert len(client.get(f"/api/boards/{board_id}").json()["columns"]) == 5

    renamed = client.patch(f"/api/boards/{board_id}", json={"title": "Lanzamiento v2"})
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Lanzamiento v2"

    column_id = client.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]
    client.post(f"/api/boards/{board_id}/columns/{column_id}/cards", json={"title": "Tarea"})
    assert client.delete(f"/api/boards/{board_id}").status_code == 204
    assert [board["id"] for board in client.get("/api/boards").json()] == ["board-1"]
    assert client.get(f"/api/boards/{board_id}").status_code == 404


def test_board_validation(client: TestClient) -> None:
    assert client.post("/api/boards", json={"title": "   "}).status_code == 400
    assert client.post("/api/boards", json={"title": ""}).status_code == 422
    assert client.patch(BOARD, json={"title": "   "}).status_code == 400
    assert client.patch("/api/boards/missing", json={"title": "X"}).status_code == 404
    assert client.delete("/api/boards/missing").status_code == 404


def test_cannot_delete_the_only_board(client: TestClient) -> None:
    response = client.delete(BOARD)

    assert response.status_code == 400
    assert response.json()["detail"] == "No puedes eliminar tu único tablero"


def test_boards_get_unique_column_ids(client: TestClient) -> None:
    first = client.post("/api/boards", json={"title": "A"}).json()["id"]
    second = client.post("/api/boards", json={"title": "B"}).json()["id"]

    first_ids = {column["id"] for column in client.get(f"/api/boards/{first}").json()["columns"]}
    second_ids = {column["id"] for column in client.get(f"/api/boards/{second}").json()["columns"]}

    assert len(first_ids) == 5
    assert first_ids.isdisjoint(second_ids)


def test_cards_cannot_move_between_boards(client: TestClient) -> None:
    other = client.post("/api/boards", json={"title": "Otro"}).json()["id"]
    other_column = client.get(f"/api/boards/{other}").json()["columns"][0]["id"]

    assert client.post(f"{BOARD}/cards/card-1/move", json={"column_id": other_column, "position": 0}).status_code == 404
    assert client.patch(f"/api/boards/{other}/cards/card-1", json={"title": "X"}).status_code == 404
    assert client.post(f"/api/boards/{other}/columns/col-backlog/cards", json={"title": "X"}).status_code == 404


def test_users_cannot_see_or_change_other_users_boards(register: Callable[..., TestClient], client: TestClient) -> None:
    intruder = register("intruso")

    assert [board["id"] for board in intruder.get("/api/boards").json()] != ["board-1"]
    for method, path, body in [
        ("get", BOARD, None),
        ("patch", BOARD, {"title": "Hackeado"}),
        ("delete", BOARD, None),
        ("post", f"{BOARD}/columns", {"title": "Hackeada"}),
        ("patch", f"{BOARD}/columns/col-backlog", {"title": "Hackeada"}),
        ("delete", f"{BOARD}/columns/col-backlog", None),
        ("post", f"{BOARD}/columns/col-backlog/cards", {"title": "Hackeada"}),
        ("patch", f"{BOARD}/cards/card-1", {"title": "Hackeada"}),
        ("delete", f"{BOARD}/cards/card-1", None),
        ("post", f"{BOARD}/cards/card-1/move", {"column_id": "col-done", "position": 0}),
        ("post", f"{BOARD}/ai", {"message": "Borra todo"}),
    ]:
        response = intruder.request(method, path, json=body)
        assert response.status_code == 404, (method, path)
        assert response.json()["detail"] == "Tablero no encontrado"

    board = client.get(BOARD).json()
    assert board["title"] == "Estudio Kanban"
    assert board["columns"][0]["title"] == "Pendientes"
    assert sum(len(column["cards"]) for column in board["columns"]) == 8


# Columns


def test_add_rename_and_delete_columns(client: TestClient) -> None:
    added = client.post(f"{BOARD}/columns", json={"title": "Bloqueado"})

    assert added.status_code == 201
    assert added.json()["position"] == 5
    column_id = added.json()["id"]

    renamed = client.patch(f"{BOARD}/columns/{column_id}", json={"title": "Bloqueadas"})
    assert renamed.json()["title"] == "Bloqueadas"

    assert client.delete(f"{BOARD}/columns/{column_id}").status_code == 204
    assert [column["id"] for column in client.get(BOARD).json()["columns"]][-1] == "col-done"


def test_deleting_a_middle_column_renumbers_positions(client: TestClient) -> None:
    client.post(f"{BOARD}/cards/card-3/move", json={"column_id": "col-backlog", "position": 0})

    assert client.delete(f"{BOARD}/columns/col-discovery").status_code == 204

    columns = client.get(BOARD).json()["columns"]
    assert [column["id"] for column in columns] == ["col-backlog", "col-progress", "col-review", "col-done"]
    assert [column["position"] for column in columns] == [0, 1, 2, 3]
    # Adding a column after a delete must not collide with an existing position.
    assert client.post(f"{BOARD}/columns", json={"title": "Nueva"}).json()["position"] == 4


def test_cannot_delete_a_column_with_cards(client: TestClient) -> None:
    response = client.delete(f"{BOARD}/columns/col-backlog")

    assert response.status_code == 400
    assert response.json()["detail"] == "Mueve o elimina las tarjetas antes de borrar la columna"


def test_cannot_delete_the_last_column(client: TestClient) -> None:
    board_id = client.post("/api/boards", json={"title": "Vacío"}).json()["id"]
    column_ids = [column["id"] for column in client.get(f"/api/boards/{board_id}").json()["columns"]]
    for column_id in column_ids[:-1]:
        assert client.delete(f"/api/boards/{board_id}/columns/{column_id}").status_code == 204

    response = client.delete(f"/api/boards/{board_id}/columns/{column_ids[-1]}")

    assert response.status_code == 400
    assert response.json()["detail"] == "El tablero debe tener al menos una columna"


def test_column_validation(client: TestClient) -> None:
    assert client.post(f"{BOARD}/columns", json={"title": "  "}).status_code == 400
    assert client.patch(f"{BOARD}/columns/missing", json={"title": "Nope"}).status_code == 404
    assert client.delete(f"{BOARD}/columns/missing").status_code == 404


# Cards


def test_rename_and_card_crud_persist(client: TestClient) -> None:
    rename_response = client.patch(f"{BOARD}/columns/col-backlog", json={"title": "Ready"})
    create_response = client.post(
        f"{BOARD}/columns/col-backlog/cards",
        json={"title": "New card", "details": "Useful details"},
    )
    card_id = create_response.json()["id"]
    update_response = client.patch(
        f"{BOARD}/cards/{card_id}",
        json={"title": "Updated card", "details": "Updated details"},
    )
    board_response = client.get(BOARD)

    assert rename_response.status_code == 200
    assert create_response.status_code == 201
    assert update_response.status_code == 200
    assert board_response.json()["columns"][0]["title"] == "Ready"
    assert board_response.json()["columns"][0]["cards"][-1]["title"] == "Updated card"


def test_card_priority_and_due_date(client: TestClient) -> None:
    created = client.post(
        f"{BOARD}/columns/col-backlog/cards",
        json={"title": "Urgente", "priority": "alta", "due_date": "2026-12-31"},
    ).json()

    assert created["priority"] == "alta"
    assert created["due_date"] == "2026-12-31"

    renamed = client.patch(f"{BOARD}/cards/{created['id']}", json={"title": "Muy urgente"}).json()
    assert renamed["title"] == "Muy urgente"
    assert renamed["priority"] == "alta"
    assert renamed["due_date"] == "2026-12-31"

    changed = client.patch(f"{BOARD}/cards/{created['id']}", json={"priority": "baja", "due_date": "2027-01-15"}).json()
    assert changed["priority"] == "baja"
    assert changed["due_date"] == "2027-01-15"
    assert changed["title"] == "Muy urgente"

    cleared = client.patch(f"{BOARD}/cards/{created['id']}", json={"due_date": None}).json()
    assert cleared["due_date"] is None
    assert cleared["priority"] == "baja"


def test_partial_update_ignores_null_title_and_keeps_details(client: TestClient) -> None:
    response = client.patch(f"{BOARD}/cards/card-1", json={"title": None, "priority": "alta"})

    assert response.status_code == 200
    assert response.json()["title"] == "Alinear los temas del roadmap"
    assert response.json()["details"].startswith("Redactar")


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "X", "priority": "urgente"},
        {"title": "X", "due_date": "31/12/2026"},
        {"title": "X", "due_date": "2026-02-30"},
    ],
)
def test_card_rejects_invalid_priority_and_dates(client: TestClient, payload: dict) -> None:
    assert client.post(f"{BOARD}/columns/col-backlog/cards", json=payload).status_code == 422
    assert client.patch(f"{BOARD}/cards/card-1", json=payload).status_code == 422


def test_move_card_persists_in_target_column(client: TestClient) -> None:
    response = client.post(f"{BOARD}/cards/card-1/move", json={"column_id": "col-review", "position": 0})

    assert response.status_code == 200
    assert response.json()["column_id"] == "col-review"
    assert card_ids(client, 3) == ["card-1", "card-6"]
    assert card_ids(client, 0) == ["card-2"]


def test_move_card_within_column_and_past_the_end(client: TestClient) -> None:
    client.post(f"{BOARD}/cards/card-2/move", json={"column_id": "col-backlog", "position": 0})
    assert card_ids(client, 0) == ["card-2", "card-1"]

    client.post(f"{BOARD}/cards/card-3/move", json={"column_id": "col-done", "position": 99})
    assert card_ids(client, 4) == ["card-7", "card-8", "card-3"]
    assert card_ids(client, 1) == []


def test_delete_card_after_reordering_renumbers_column(client: TestClient) -> None:
    created = [client.post(f"{BOARD}/columns/col-discovery/cards", json={"title": f"Card {i}"}).json()["id"] for i in range(3)]
    client.post(f"{BOARD}/cards/{created[2]}/move", json={"column_id": "col-discovery", "position": 0})
    client.post(f"{BOARD}/cards/{created[1]}/move", json={"column_id": "col-discovery", "position": 0})

    response = client.delete(f"{BOARD}/cards/{created[1]}")

    assert response.status_code == 204
    discovery = client.get(BOARD).json()["columns"][1]["cards"]
    assert [card["id"] for card in discovery] == [created[2], "card-3", created[0]]
    assert [card["position"] for card in discovery] == [0, 1, 2]


def test_delete_card_persists(client: TestClient) -> None:
    response = client.delete(f"{BOARD}/cards/card-8")

    assert response.status_code == 204
    board = client.get(BOARD).json()
    assert all(card["id"] != "card-8" for column in board["columns"] for card in column["cards"])


def test_rejects_invalid_board_operations(client: TestClient) -> None:
    assert client.patch(f"{BOARD}/columns/missing", json={"title": "Nope"}).status_code == 404
    assert client.post(f"{BOARD}/columns/missing/cards", json={"title": "Nope"}).status_code == 404
    assert client.patch(f"{BOARD}/cards/card-1", json={"title": ""}).status_code == 422
    assert client.patch(f"{BOARD}/cards/card-1", json={"title": "   "}).status_code == 400
    assert client.patch(f"{BOARD}/cards/card-1", json={"title": "x" * 201}).status_code == 422
    assert client.post(f"{BOARD}/cards/card-1/move", json={"column_id": "missing", "position": 0}).status_code == 404
    assert client.delete(f"{BOARD}/cards/missing").status_code == 404


def test_board_layer_scopes_every_operation_to_the_owner(database: Database) -> None:
    with database.accounts() as accounts:
        other = accounts.create_user("otro", "password123")

    with pytest.raises(LookupError):
        with database.board(other["id"], "board-1"):
            pass

    with database.workspace(other["id"]) as workspace:
        other_board = workspace.list_boards()[0]["id"]
        with pytest.raises(LookupError):
            workspace.rename_board("board-1", "Hackeado")

    with database.board(other["id"], other_board) as board:
        with pytest.raises(LookupError):
            board.rename_column("col-backlog", "Hacked")
        with pytest.raises(LookupError):
            board.create_card("col-backlog", "Hacked")
        with pytest.raises(LookupError):
            board.update_card("card-1", title="Hacked")
        with pytest.raises(LookupError):
            board.move_card("card-1", "col-done", 0)
        with pytest.raises(LookupError):
            board.delete_card("card-1")

    with database.board() as board:
        assert board.get()["columns"][0]["title"] == "Pendientes"


def test_board_layer_rejects_unknown_fields_and_negative_positions(database: Database) -> None:
    with database.board() as board:
        with pytest.raises(ValueError, match="Campos desconocidos"):
            board.update_card("card-1", column_id="col-done")
        with pytest.raises(ValueError, match="prioridad"):
            board.update_card("card-1", priority="urgente")
        with pytest.raises(ValueError, match="negativa"):
            board.move_card("card-1", "col-done", -1)
        assert board.update_card("card-1")["title"] == "Alinear los temas del roadmap"
