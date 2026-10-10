from __future__ import annotations

import json
from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .database import Board, Database
from .openrouter import chat_with_openrouter
from .schemas import DETAILS_MAX_LENGTH, TITLE_MAX_LENGTH, Priority


class CreateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["create_card"]
    column_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    details: str = Field(default="", max_length=DETAILS_MAX_LENGTH)
    priority: Priority = "media"
    due_date: date | None = None


class UpdateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["update_card"]
    card_id: str = Field(min_length=1)
    title: str | None = Field(default=None, min_length=1, max_length=TITLE_MAX_LENGTH)
    details: str | None = Field(default=None, max_length=DETAILS_MAX_LENGTH)
    priority: Priority | None = None
    due_date: date | None = None


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
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)


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
    response: str = Field(min_length=1, max_length=DETAILS_MAX_LENGTH)
    actions: list[BoardAction] = Field(default_factory=list, max_length=20)


def parse_board_command(content: str) -> BoardCommand:
    # Models often wrap the JSON object in code fences or prose; keep only the outermost object.
    start, end = content.find("{"), content.rfind("}")
    if start == -1 or end < start:
        raise ValueError("La respuesta de la IA no contenía un objeto JSON")
    try:
        return BoardCommand.model_validate_json(content[start : end + 1])
    except ValidationError as error:
        raise ValueError("La respuesta de la IA no cumple el formato de comandos del tablero") from error


def build_board_prompt(message: str, board: dict[str, Any]) -> str:
    board_json = json.dumps(board, ensure_ascii=True, separators=(",", ":"))
    return (
        "You are a project board assistant. Return ONLY valid JSON, with this exact shape: "
        '{"response":"short user-facing answer","actions":[{"action":"..."}]}. '
        "Allowed actions are create_card(column_id,title,details,priority,due_date), "
        "update_card(card_id, plus only the fields to change: title,details,priority,due_date), "
        "move_card(card_id,column_id,position), "
        "delete_card(card_id), and rename_column(column_id,title). "
        "priority is one of baja, media, alta; due_date is YYYY-MM-DD. "
        f"Today is {date.today().isoformat()}. "
        "Use no more than 20 actions. Do not invent IDs; use only IDs in the board JSON. "
        "If no change is requested, return an empty actions array. "
        "Always write the response field in Spanish.\n"
        f"Board JSON: {board_json}\nUser request: {message}"
    )


def execute_board_command(board: Board, command: BoardCommand) -> None:
    """Apply all actions on one board transaction; any failure rolls back every action."""
    card_actions = [action.card_id for action in command.actions if hasattr(action, "card_id")]
    if len(card_actions) != len(set(card_actions)):
        raise ValueError("No se permiten varias acciones sobre la misma tarjeta")

    try:
        for action in command.actions:
            if isinstance(action, CreateCardAction):
                due_date = action.due_date.isoformat() if action.due_date else None
                board.create_card(action.column_id, action.title, action.details, action.priority, due_date)
            elif isinstance(action, RenameColumnAction):
                board.rename_column(action.column_id, action.title)
            elif isinstance(action, UpdateCardAction):
                changes = action.model_dump(exclude={"action", "card_id"}, exclude_none=True)
                if "due_date" in changes:
                    changes["due_date"] = changes["due_date"].isoformat()
                board.update_card(action.card_id, **changes)
            elif isinstance(action, MoveCardAction):
                board.move_card(action.card_id, action.column_id, action.position)
            elif isinstance(action, DeleteCardAction):
                board.delete_card(action.card_id)
    except LookupError as error:
        raise ValueError(f"Acción de la IA rechazada: {error}") from error


def answer_board_request(database: Database, user_id: str, board_id: str, message: str) -> BoardCommand:
    with database.board(user_id, board_id) as board:
        snapshot = board.get()
    command = parse_board_command(chat_with_openrouter(build_board_prompt(message, snapshot)))
    with database.board(user_id, board_id) as board:
        execute_board_command(board, command)
    return command
