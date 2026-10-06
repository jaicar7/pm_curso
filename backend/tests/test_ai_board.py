import pytest
from fastapi.testclient import TestClient

from app.ai_board import BoardCommand, build_board_prompt, execute_board_command, parse_board_command
from app.database import Database
import app.main as main_module


def board_state(database: Database) -> dict:
    with database.board() as board:
        return board.get()


def execute(database: Database, command: dict) -> None:
    with database.board() as board:
        execute_board_command(board, BoardCommand.model_validate(command))


@pytest.mark.parametrize(
    "content",
    [
        '```json\n{"response":"Done","actions":[{"action":"move_card","card_id":"card-1","column_id":"col-done","position":0}]}\n```',
        '```{"response":"Done","actions":[{"action":"move_card","card_id":"card-1","column_id":"col-done","position":0}]}```',
        'Sure! {"response":"Done","actions":[{"action":"move_card","card_id":"card-1","column_id":"col-done","position":0}]}',
    ],
)
def test_parses_structured_command_from_wrapped_json(content: str) -> None:
    command = parse_board_command(content)

    assert command.response == "Done"
    assert command.actions[0].action == "move_card"


@pytest.mark.parametrize("content", ["no json here", "{not valid}", '{"actions": []}'])
def test_rejects_invalid_ai_responses(content: str) -> None:
    with pytest.raises(ValueError):
        parse_board_command(content)


def test_rejects_unknown_ids_and_rolls_back_earlier_actions(database: Database) -> None:
    with pytest.raises(ValueError, match="Card not found"):
        execute(
            database,
            {
                "response": "Creating it",
                "actions": [
                    {"action": "rename_column", "column_id": "col-review", "title": "Checked"},
                    {"action": "delete_card", "card_id": "invented-card"},
                ],
            },
        )

    board = board_state(database)
    assert board["columns"][3]["title"] == "Review"
    assert any(card["id"] == "card-1" for column in board["columns"] for card in column["cards"])


def test_applies_valid_move_and_create_actions(database: Database) -> None:
    execute(
        database,
        {
            "response": "Updated",
            "actions": [
                {"action": "move_card", "card_id": "card-1", "column_id": "col-review", "position": 0},
                {"action": "create_card", "column_id": "col-done", "title": "AI card", "details": "Created by AI"},
            ],
        },
    )

    board = board_state(database)
    assert board["columns"][3]["cards"][0]["id"] == "card-1"
    assert board["columns"][4]["cards"][-1]["title"] == "AI card"


def test_prompt_contains_board_and_requested_message(database: Database) -> None:
    prompt = build_board_prompt("Move card 1 to review", board_state(database))

    assert "Move card 1 to review" in prompt
    assert '"col-review"' in prompt
    assert '"card-1"' in prompt


def test_rejects_conflicting_actions_and_blank_titles(database: Database) -> None:
    with pytest.raises(ValueError, match="Multiple actions"):
        execute(
            database,
            {
                "response": "Conflicting",
                "actions": [
                    {"action": "move_card", "card_id": "card-1", "column_id": "col-review", "position": 0},
                    {"action": "delete_card", "card_id": "card-1"},
                ],
            },
        )
    with pytest.raises(ValueError, match="Column title"):
        execute(
            database,
            {"response": "Blank", "actions": [{"action": "rename_column", "column_id": "col-review", "title": "   "}]},
        )


def test_board_command_endpoint_returns_structured_result(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        main_module,
        "answer_board_request",
        lambda database, message: BoardCommand.model_validate(
            {"response": "Moved", "actions": [{"action": "move_card", "card_id": "card-1", "column_id": "col-review", "position": 0}]}
        ),
    )

    response = client.post("/api/ai/board", json={"message": "Move card 1"})

    assert response.status_code == 200
    assert response.json()["response"] == "Moved"
    assert response.json()["actions"][0]["action"] == "move_card"


def test_board_command_endpoint_returns_502_for_invalid_ai_output(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.ai_board.chat_with_openrouter", lambda prompt: "```not json```")

    response = client.post("/api/ai/board", json={"message": "Move card 1"})

    assert response.status_code == 502
    assert board_state(main_module.database)["columns"][0]["cards"][0]["id"] == "card-1"
