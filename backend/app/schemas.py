from pydantic import BaseModel, Field


class CardCreate(BaseModel):
    title: str = Field(min_length=1)
    details: str = ""


class CardUpdate(BaseModel):
    title: str = Field(min_length=1)
    details: str = ""


class CardMove(BaseModel):
    column_id: str
    position: int = Field(ge=0)


class ColumnUpdate(BaseModel):
    title: str = Field(min_length=1)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class ChatResponse(BaseModel):
    message: str
    model: str
