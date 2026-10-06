from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .database import Database
from .ai_board import answer_board_request
from .openrouter import OPENROUTER_MODEL, OpenRouterError, chat_with_openrouter
from .schemas import BoardCommandRequest, BoardCommandResponse, CardCreate, CardMove, CardUpdate, ChatRequest, ChatResponse, ColumnUpdate

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
database = Database()
frontend_dir = Path(__file__).resolve().parents[2] / "frontend" / "out"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    database.initialize()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LookupError)
def not_found(_: Request, error: LookupError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.exception_handler(ValueError)
def bad_request(_: Request, error: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(error)})


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


@app.post("/api/ai/board", response_model=BoardCommandResponse)
def ai_board(payload: BoardCommandRequest) -> BoardCommandResponse:
    try:
        command = answer_board_request(database, payload.message)
    except (ValueError, OpenRouterError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return BoardCommandResponse(response=command.response, actions=[action.model_dump() for action in command.actions])


@app.get("/api/boards/me")
def get_board() -> dict:
    with database.board() as board:
        return board.get()


@app.patch("/api/columns/{column_id}")
def rename_column(column_id: str, payload: ColumnUpdate) -> dict:
    with database.board() as board:
        return board.rename_column(column_id, payload.title)


@app.post("/api/columns/{column_id}/cards", status_code=201)
def create_card(column_id: str, payload: CardCreate) -> dict:
    with database.board() as board:
        return board.create_card(column_id, payload.title, payload.details)


@app.patch("/api/cards/{card_id}")
def update_card(card_id: str, payload: CardUpdate) -> dict:
    with database.board() as board:
        return board.update_card(card_id, payload.title, payload.details)


@app.delete("/api/cards/{card_id}", status_code=204)
def delete_card(card_id: str) -> None:
    with database.board() as board:
        board.delete_card(card_id)


@app.post("/api/cards/{card_id}/move")
def move_card(card_id: str, payload: CardMove) -> dict:
    with database.board() as board:
        return board.move_card(card_id, payload.column_id, payload.position)


if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
