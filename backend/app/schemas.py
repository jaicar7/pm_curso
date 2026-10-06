from pydantic import BaseModel, Field

# Same limits as the AI action schema in ai_board.py.
TITLE_MAX_LENGTH = 200
DETAILS_MAX_LENGTH = 5000


class CardCreate(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    details: str = Field(default="", max_length=DETAILS_MAX_LENGTH)


class CardUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    details: str = Field(default="", max_length=DETAILS_MAX_LENGTH)


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
