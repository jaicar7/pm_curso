import pytest
from fastapi.testclient import TestClient

from app.ai_board import BoardCommand, build_board_prompt, execute_board_command, parse_board_command
from app.database import Database
import app.main as main_module


def test_parses_structured_command_from_markdown_json() -> None:
    command = parse_board_command(
        '```json\n{"response":"Done","actions":[{"action":"move_card","card_id":"card-1","column_id":"col-done","position":0}]}\n```'
    )

    assert command.response == "Done"
    assert command.actions[0].action == "move_card"


def test_rejects_unknown_ids_before_applying_actions(tmp_path) -> None:
    database = Database(tmp_path / "board.sqlite3")
    command = BoardCommand.model_validate(
        {
            "response": "Creating it",
            "actions": [{"action": "delete_card", "card_id": "invented-card"}],
        }
    )

    with pytest.raises(ValueError, match="Unknown card"):
        execute_board_command(database, command)

    board = database.board_for_user()
    assert any(card["id"] == "card-1" for column in board["columns"] for card in column["cards"])


def test_applies_valid_move_and_create_actions(tmp_path) -> None:
    database = Database(tmp_path / "board.sqlite3")
    command = BoardCommand.model_validate(
        {
            "response": "Updated",
            "actions": [
                {"action": "move_card", "card_id": "card-1", "column_id": "col-review", "position": 0},
                {"action": "create_card", "column_id": "col-done", "title": "AI card", "details": "Created by AI"},
            ],
        }
    )

    execute_board_command(database, command)
    board = database.board_for_user()
    assert board["columns"][3]["cards"][0]["id"] == "card-1"
    assert board["columns"][4]["cards"][-1]["title"] == "AI card"


def test_prompt_contains_board_and_requested_message(tmp_path) -> None:
    database = Database(tmp_path / "board.sqlite3")

    prompt = build_board_prompt("Move card 1 to review", database.board_for_user())

    assert "Move card 1 to review" in prompt
    assert '"col-review"' in prompt
    assert '"card-1"' in prompt


def test_rejects_conflicting_actions_and_blank_titles(tmp_path) -> None:
    database = Database(tmp_path / "board.sqlite3")
    conflicting = BoardCommand.model_validate(
        {
            "response": "Conflicting",
            "actions": [
                {"action": "move_card", "card_id": "card-1", "column_id": "col-review", "position": 0},
                {"action": "delete_card", "card_id": "card-1"},
            ],
        }
    )
    blank_title = BoardCommand.model_validate(
        {
            "response": "Blank",
            "actions": [{"action": "rename_column", "column_id": "col-review", "title": "   "}],
        }
    )

    with pytest.raises(ValueError, match="Multiple actions"):
        execute_board_command(database, conflicting)
    with pytest.raises(ValueError, match="Column title"):
        execute_board_command(database, blank_title)


def test_board_command_endpoint_returns_structured_result(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main_module, "database", Database(tmp_path / "board.sqlite3"))
    monkeypatch.setattr(
        main_module,
        "answer_board_request",
        lambda database, message: BoardCommand.model_validate(
            {"response": "Moved", "actions": [{"action": "move_card", "card_id": "card-1", "column_id": "col-review", "position": 0}]}
        ),
    )

    response = TestClient(main_module.app).post("/api/ai/board", json={"message": "Move card 1"})

    assert response.status_code == 200
    assert response.json()["response"] == "Moved"
    assert response.json()["actions"][0]["action"] == "move_card"
