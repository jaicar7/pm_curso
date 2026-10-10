from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

# Same limits as the AI action schema in ai_board.py.
TITLE_MAX_LENGTH = 200
DETAILS_MAX_LENGTH = 5000
PASSWORD_MAX_LENGTH = 128

Priority = Literal["baja", "media", "alta"]


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class UserCreate(Credentials):
    is_admin: bool = False


class UserUpdate(BaseModel):
    is_admin: bool | None = None
    password: str | None = Field(default=None, max_length=PASSWORD_MAX_LENGTH)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    new_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class BoardCreate(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)


class CardCreate(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    details: str = Field(default="", max_length=DETAILS_MAX_LENGTH)
    priority: Priority = "media"
    due_date: date | None = None


class CardUpdate(BaseModel):
    """Partial update: only the fields sent are changed; due_date null clears the date."""

    title: str | None = Field(default=None, min_length=1, max_length=TITLE_MAX_LENGTH)
    details: str | None = Field(default=None, max_length=DETAILS_MAX_LENGTH)
    priority: Priority | None = None
    due_date: date | None = None


class CardMove(BaseModel):
    column_id: str
    position: int = Field(ge=0)


class ColumnUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class ChatResponse(BaseModel):
    message: str
    model: str


class BoardCommandRequest(BaseModel):
    message: str = Field(min_length=1, max_length=DETAILS_MAX_LENGTH)


class BoardCommandResponse(BaseModel):
    response: str
    actions: list[dict]
