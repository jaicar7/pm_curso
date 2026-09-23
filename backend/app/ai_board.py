from __future__ import annotations

import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from .database import Database
from .openrouter import OpenRouterError, chat_with_openrouter


class CreateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["create_card"]
    column_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=5000)


class UpdateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["update_card"]
    card_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=5000)


class MoveCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["move_card"]
    card_id: str = Field(min_length=1)
    column_id: str = Field(min_length=1)
    position: int = Field(ge=0, le=1000)


class DeleteCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["delete_card"]
    card_id: str = Field(min_length=1)


class RenameColumnAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["rename_column"]
    column_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)


BoardAction = Annotated[
    CreateCardAction
    | UpdateCardAction
    | MoveCardAction
    | DeleteCardAction
    | RenameColumnAction,
    Field(discriminator="action"),
]


class BoardCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    response: str = Field(min_length=1, max_length=5000)
    actions: list[BoardAction] = Field(default_factory=list, max_length=20)


board_command_adapter = TypeAdapter(BoardCommand)


def _json_from_response(content: str) -> dict[str, Any]:
    candidate = content.strip()
    if candidate.startswith("```"):
        candidate = candidate.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError as error:
        raise ValueError("AI response was not valid JSON") from error
    if not isinstance(payload, dict):
        raise ValueError("AI response must be a JSON object")
    return payload


def parse_board_command(content: str) -> BoardCommand:
    try:
        return board_command_adapter.validate_python(_json_from_response(content))
    except ValidationError as error:
        raise ValueError("AI response did not match the board command schema") from error


def build_board_prompt(message: str, board: dict[str, Any]) -> str:
    board_json = json.dumps(board, ensure_ascii=True, separators=(",", ":"))
    return (
        "You are a project board assistant. Return ONLY valid JSON, with this exact shape: "
        '{"response":"short user-facing answer","actions":[{"action":"..."}]}. '
        "Allowed actions are create_card(column_id,title,details), "
        "update_card(card_id,title,details), move_card(card_id,column_id,position), "
        "delete_card(card_id), and rename_column(column_id,title). "
        "Use no more than 20 actions. Do not invent IDs; use only IDs in the board JSON. "
        "If no change is requested, return an empty actions array.\n"
        f"Board JSON: {board_json}\nUser request: {message}"
    )


def execute_board_command(database: Database, command: BoardCommand) -> None:
    board = database.board_for_user()
    column_ids = {column["id"] for column in board["columns"]}
    card_ids = {card["id"] for column in board["columns"] for card in column["cards"]}
    touched_cards: set[str] = set()

    for action in command.actions:
        if isinstance(action, CreateCardAction):
            if action.column_id not in column_ids:
                raise ValueError(f"Unknown column: {action.column_id}")
            if not action.title.strip():
                raise ValueError("Card title must not be empty")
        elif isinstance(action, RenameColumnAction):
            if action.column_id not in column_ids:
                raise ValueError(f"Unknown column: {action.column_id}")
            if not action.title.strip():
                raise ValueError("Column title must not be empty")
        elif isinstance(action, MoveCardAction):
            if action.card_id not in card_ids:
                raise ValueError(f"Unknown card: {action.card_id}")
            if action.column_id not in column_ids:
                raise ValueError(f"Unknown column: {action.column_id}")
            touched_cards.add(action.card_id)
        elif isinstance(action, (UpdateCardAction, DeleteCardAction)):
            if action.card_id not in card_ids:
                raise ValueError(f"Unknown card: {action.card_id}")
            if isinstance(action, UpdateCardAction) and not action.title.strip():
                raise ValueError("Card title must not be empty")
            if action.card_id in touched_cards:
                raise ValueError(f"Multiple actions for card: {action.card_id}")
            touched_cards.add(action.card_id)

    if len(touched_cards) != sum(
        isinstance(action, (MoveCardAction, UpdateCardAction, DeleteCardAction))
        for action in command.actions
    ):
        raise ValueError("Multiple actions for the same card are not allowed")

    for action in command.actions:
        if isinstance(action, CreateCardAction):
            database.create_card(action.column_id, action.title, action.details)
        elif isinstance(action, RenameColumnAction):
            database.rename_column(action.column_id, action.title)
        elif isinstance(action, UpdateCardAction):
            database.update_card(action.card_id, action.title, action.details)
        elif isinstance(action, MoveCardAction):
            database.move_card(action.card_id, action.column_id, action.position)
        elif isinstance(action, DeleteCardAction):
            database.delete_card(action.card_id)


def answer_board_request(database: Database, message: str) -> BoardCommand:
    board = database.board_for_user()
    content = chat_with_openrouter(build_board_prompt(message, board))
    command = parse_board_command(content)
    execute_board_command(database, command)
    return command
