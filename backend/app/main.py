from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .database import SESSION_DAYS, Database
from .ai_board import answer_board_request
from .openrouter import OPENROUTER_MODEL, OpenRouterError, chat_with_openrouter
from .schemas import (
    BoardCommandRequest,
    BoardCommandResponse,
    BoardCreate,
    CardCreate,
    CardMove,
    CardUpdate,
    ChatRequest,
    ChatResponse,
    ColumnUpdate,
    Credentials,
    PasswordChange,
    UserCreate,
    UserUpdate,
)

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
database = Database()
frontend_dir = Path(__file__).resolve().parents[2] / "frontend" / "out"
SESSION_COOKIE = "pm_session"


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


def current_user(request: Request) -> dict[str, Any]:
    token = request.cookies.get(SESSION_COOKIE)
    user = None
    if token:
        with database.accounts() as accounts:
            user = accounts.user_for_session(token)
    if not user:
        raise HTTPException(status_code=401, detail="No has iniciado sesión")
    return user


def admin_user(user: Annotated[dict[str, Any], Depends(current_user)]) -> dict[str, Any]:
    if not user["is_admin"]:
        raise HTTPException(status_code=403, detail="Necesitas permisos de administrador")
    return user


User = Annotated[dict[str, Any], Depends(current_user)]
Admin = Annotated[dict[str, Any], Depends(admin_user)]


def start_session(response: Response, user_id: str) -> None:
    with database.accounts() as accounts:
        token = accounts.create_session(user_id)
    response.set_cookie(
        SESSION_COOKIE, token, max_age=SESSION_DAYS * 24 * 3600, httponly=True, samesite="lax", path="/"
    )


@app.get("/", response_class=HTMLResponse)
def root() -> str:
    if frontend_dir.exists():
        return (frontend_dir / "index.html").read_text(encoding="utf-8")

    return """
    <!doctype html>
    <html lang=\"es\">
      <head>
        <meta charset=\"utf-8\" />
        <title>Estudio Kanban</title>
      </head>
      <body>
        <h1>Estudio Kanban</h1>
      </body>
    </html>
    """


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "project-management-mvp"}


# Authentication


@app.post("/api/auth/login")
def login(payload: Credentials, response: Response) -> dict:
    with database.accounts() as accounts:
        user = accounts.authenticate(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    start_session(response, user["id"])
    return user


@app.post("/api/auth/register", status_code=201)
def register(payload: Credentials, response: Response) -> dict:
    with database.accounts() as accounts:
        user = accounts.create_user(payload.username, payload.password)
    start_session(response, user["id"])
    return user


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with database.accounts() as accounts:
            accounts.delete_session(token)
    response.delete_cookie(SESSION_COOKIE, path="/")


@app.get("/api/auth/me")
def me(user: User) -> dict:
    return user


@app.put("/api/auth/password", status_code=204)
def change_password(payload: PasswordChange, user: User, response: Response) -> None:
    with database.accounts() as accounts:
        accounts.change_password(user["id"], payload.current_password, payload.new_password)
    # The change closed every session, so open a fresh one for this browser.
    start_session(response, user["id"])


# User management (administrators)


@app.get("/api/users")
def list_users(_: Admin) -> list[dict]:
    with database.accounts() as accounts:
        return accounts.list_users()


@app.post("/api/users", status_code=201)
def create_user(payload: UserCreate, _: Admin) -> dict:
    with database.accounts() as accounts:
        return accounts.create_user(payload.username, payload.password, payload.is_admin)


@app.patch("/api/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, admin: Admin) -> dict:
    if user_id == admin["id"] and payload.is_admin is False:
        raise ValueError("No puedes quitarte los permisos de administrador")
    with database.accounts() as accounts:
        return accounts.update_user(user_id, payload.is_admin, payload.password)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: str, admin: Admin) -> None:
    if user_id == admin["id"]:
        raise ValueError("No puedes eliminar tu propio usuario")
    with database.accounts() as accounts:
        accounts.delete_user(user_id)


# Boards


@app.get("/api/boards")
def list_boards(user: User) -> list[dict]:
    with database.workspace(user["id"]) as workspace:
        return workspace.list_boards()


@app.post("/api/boards", status_code=201)
def create_board(payload: BoardCreate, user: User) -> dict:
    with database.workspace(user["id"]) as workspace:
        return workspace.create_board(payload.title)


@app.get("/api/boards/{board_id}")
def get_board(board_id: str, user: User) -> dict:
    with database.board(user["id"], board_id) as board:
        return board.get()


@app.patch("/api/boards/{board_id}")
def rename_board(board_id: str, payload: BoardCreate, user: User) -> dict:
    with database.workspace(user["id"]) as workspace:
        return workspace.rename_board(board_id, payload.title)


@app.delete("/api/boards/{board_id}", status_code=204)
def delete_board(board_id: str, user: User) -> None:
    with database.workspace(user["id"]) as workspace:
        workspace.delete_board(board_id)


@app.post("/api/boards/{board_id}/columns", status_code=201)
def add_column(board_id: str, payload: ColumnUpdate, user: User) -> dict:
    with database.board(user["id"], board_id) as board:
        return board.add_column(payload.title)


@app.patch("/api/boards/{board_id}/columns/{column_id}")
def rename_column(board_id: str, column_id: str, payload: ColumnUpdate, user: User) -> dict:
    with database.board(user["id"], board_id) as board:
        return board.rename_column(column_id, payload.title)


@app.delete("/api/boards/{board_id}/columns/{column_id}", status_code=204)
def delete_column(board_id: str, column_id: str, user: User) -> None:
    with database.board(user["id"], board_id) as board:
        board.delete_column(column_id)


@app.post("/api/boards/{board_id}/columns/{column_id}/cards", status_code=201)
def create_card(board_id: str, column_id: str, payload: CardCreate, user: User) -> dict:
    due_date = payload.due_date.isoformat() if payload.due_date else None
    with database.board(user["id"], board_id) as board:
        return board.create_card(column_id, payload.title, payload.details, payload.priority, due_date)


@app.patch("/api/boards/{board_id}/cards/{card_id}")
def update_card(board_id: str, card_id: str, payload: CardUpdate, user: User) -> dict:
    changes = payload.model_dump(exclude_unset=True)
    # Only due_date may be cleared with null; a null title, details or priority means "unchanged".
    changes = {field: value for field, value in changes.items() if value is not None or field == "due_date"}
    if changes.get("due_date"):
        changes["due_date"] = changes["due_date"].isoformat()
    with database.board(user["id"], board_id) as board:
        return board.update_card(card_id, **changes)


@app.delete("/api/boards/{board_id}/cards/{card_id}", status_code=204)
def delete_card(board_id: str, card_id: str, user: User) -> None:
    with database.board(user["id"], board_id) as board:
        board.delete_card(card_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/move")
def move_card(board_id: str, card_id: str, payload: CardMove, user: User) -> dict:
    with database.board(user["id"], board_id) as board:
        return board.move_card(card_id, payload.column_id, payload.position)


# AI


@app.post("/api/ai/chat", response_model=ChatResponse)
def ai_chat(payload: ChatRequest, _: User) -> ChatResponse:
    try:
        message = chat_with_openrouter(payload.message)
    except OpenRouterError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return ChatResponse(message=message, model=OPENROUTER_MODEL)


@app.post("/api/boards/{board_id}/ai", response_model=BoardCommandResponse)
def ai_board(board_id: str, payload: BoardCommandRequest, user: User) -> BoardCommandResponse:
    # Resolve the board first so a missing or foreign board is a 404, not an AI error.
    with database.board(user["id"], board_id):
        pass
    try:
        command = answer_board_request(database, user["id"], board_id, payload.message)
    except (ValueError, OpenRouterError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return BoardCommandResponse(response=command.response, actions=[action.model_dump() for action in command.actions])


if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
