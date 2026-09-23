from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .database import Database
from .openrouter import OPENROUTER_MODEL, OpenRouterError, chat_with_openrouter
from .schemas import CardCreate, CardMove, CardUpdate, ChatRequest, ChatResponse, ColumnUpdate

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
app = FastAPI(title="Project Management MVP")
database = Database()
frontend_dir = Path(__file__).resolve().parents[2] / "frontend" / "out"


@app.get("/", response_class=HTMLResponse)
def root() -> str:
    if frontend_dir.exists():
        return (frontend_dir / "index.html").read_text(encoding="utf-8")

    return """
    <!doctype html>
    <html lang=\"en\">
      <head>
        <meta charset=\"utf-8\" />
        <title>Kanban Studio</title>
      </head>
      <body>
        <h1>Kanban Studio</h1>
      </body>
    </html>
    """


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "project-management-mvp"}


@app.post("/api/ai/chat", response_model=ChatResponse)
def ai_chat(payload: ChatRequest) -> ChatResponse:
  try:
    message = chat_with_openrouter(payload.message)
  except OpenRouterError as error:
    raise HTTPException(status_code=502, detail=str(error)) from error
  return ChatResponse(message=message, model=OPENROUTER_MODEL)


@app.get("/api/boards/me")
def get_board() -> dict:
  try:
    return database.board_for_user()
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@app.patch("/api/columns/{column_id}")
def rename_column(column_id: str, payload: ColumnUpdate) -> dict:
  try:
    return database.rename_column(column_id, payload.title)
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  except ValueError as error:
    raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/columns/{column_id}/cards", status_code=201)
def create_card(column_id: str, payload: CardCreate) -> dict:
  try:
    return database.create_card(column_id, payload.title, payload.details)
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  except ValueError as error:
    raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/cards/{card_id}")
def update_card(card_id: str, payload: CardUpdate) -> dict:
  try:
    return database.update_card(card_id, payload.title, payload.details)
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  except ValueError as error:
    raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/cards/{card_id}", status_code=204)
def delete_card(card_id: str) -> None:
  try:
    database.delete_card(card_id)
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/cards/{card_id}/move")
def move_card(card_id: str, payload: CardMove) -> dict:
  try:
    return database.move_card(card_id, payload.column_id, payload.position)
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  except ValueError as error:
    raise HTTPException(status_code=400, detail=str(error)) from error


if frontend_dir.exists():
  app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
