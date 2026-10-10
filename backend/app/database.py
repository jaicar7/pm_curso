from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "project-management.sqlite3"
DEFAULT_USER_ID = "user-1"
DEFAULT_BOARD_ID = "board-1"
SCHEMA_VERSION = 2
SESSION_DAYS = 30
PASSWORD_MIN_LENGTH = 8
PRIORITIES = ("baja", "media", "alta")
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
# Positions are moved out of the way before renumbering so UNIQUE(..., position) never collides mid-update.
POSITION_OFFSET = 1_000_000

DEFAULT_COLUMN_TITLES = ["Pendientes", "Descubrimiento", "En curso", "Revisión", "Hecho"]

SEED_COLUMNS = [
    ("col-backlog", "Pendientes", 0),
    ("col-discovery", "Descubrimiento", 1),
    ("col-progress", "En curso", 2),
    ("col-review", "Revisión", 3),
    ("col-done", "Hecho", 4),
]

SEED_CARDS = [
    ("card-1", "col-backlog", "Alinear los temas del roadmap", "Redactar los temas trimestrales con su impacto esperado y sus métricas.", 0),
    ("card-2", "col-backlog", "Recoger señales de clientes", "Revisar etiquetas de soporte, notas de ventas y motivos de baja.", 1),
    ("card-3", "col-discovery", "Prototipo de vista analítica", "Esbozar el diseño inicial del panel y los desgloses clave.", 0),
    ("card-4", "col-progress", "Afinar el lenguaje de estados", "Unificar los nombres de columnas y el tono en todo el tablero.", 0),
    ("card-5", "col-progress", "Diseñar la disposición de tarjetas", "Añadir jerarquía y espaciado para leer listas densas.", 1),
    ("card-6", "col-review", "Probar las microinteracciones", "Verificar los estados de foco, carga y al pasar el ratón.", 0),
    ("card-7", "col-done", "Publicar la página de marketing", "Textos finales aprobados y recursos gráficos entregados.", 0),
    ("card-8", "col-done", "Cerrar el sprint de bienvenida", "Documentar las notas de la versión y compartirlas internamente.", 1),
]

BOARDS_TABLE = """
CREATE TABLE IF NOT EXISTS {name} (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

SCHEMA = (
    """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
"""
    + BOARDS_TABLE.format(name="boards")
    + """
CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(board_id, position),
    UNIQUE(board_id, id)
);
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'media' CHECK(priority IN ('baja', 'media', 'alta')),
    due_date TEXT,
    position INTEGER NOT NULL CHECK(position >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(column_id, position)
);
CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id);
CREATE INDEX IF NOT EXISTS idx_columns_board_position ON columns(board_id, position);
CREATE INDEX IF NOT EXISTS idx_cards_column_position ON cards(column_id, position);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""
)

# Version 1 allowed one board per user (UNIQUE(user_id)), had no sessions, admins, priorities or due dates.
# SQLite cannot drop a constraint, so the boards table is rebuilt with foreign keys disabled: create the new
# table, copy, drop the old one, then rename the new one so columns/cards keep referencing "boards".
MIGRATE_V1 = (
    """
BEGIN;
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
UPDATE users SET is_admin = 1 WHERE id = 'user-1';
"""
    + BOARDS_TABLE.format(name="boards_v2")
    + """
INSERT INTO boards_v2 (id, user_id, title, created_at, updated_at)
    SELECT id, user_id, title, created_at, updated_at FROM boards;
DROP TABLE boards;
ALTER TABLE boards_v2 RENAME TO boards;
ALTER TABLE cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'media' CHECK(priority IN ('baja', 'media', 'alta'));
ALTER TABLE cards ADD COLUMN due_date TEXT;
PRAGMA user_version = 2;
COMMIT;
"""
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_urlsafe(8)}"


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2_sha256$120000${salt.hex()}${digest.hex()}"


def _password_matches(password: str, stored: str) -> bool:
    _, iterations, salt, digest = stored.split("$")
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(candidate.hex(), digest)


def _clean_title(title: str, label: str) -> str:
    title = title.strip()
    if not title:
        raise ValueError(f"El título de {label} no puede estar vacío")
    return title


def _check_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"La contraseña debe tener al menos {PASSWORD_MIN_LENGTH} caracteres")


def _check_priority(priority: str) -> str:
    if priority not in PRIORITIES:
        raise ValueError("La prioridad debe ser baja, media o alta")
    return priority


class Database:
    def __init__(self, path: str | Path | None = None) -> None:
        configured_path = path or os.getenv("PM_DATABASE_PATH") or DEFAULT_DATABASE_PATH
        self.path = Path(configured_path)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        """Open a connection that commits on success, rolls back on error, and always closes."""
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._migrate()
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            if connection.execute("SELECT 1 FROM users LIMIT 1").fetchone():
                return
            timestamp = _now()
            connection.execute(
                "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)",
                (DEFAULT_USER_ID, "user", _password_hash("password"), timestamp),
            )
            connection.execute(
                "INSERT INTO boards (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (DEFAULT_BOARD_ID, DEFAULT_USER_ID, "Estudio Kanban", timestamp, timestamp),
            )
            connection.executemany(
                "INSERT INTO columns (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                [(column_id, DEFAULT_BOARD_ID, title, position, timestamp, timestamp) for column_id, title, position in SEED_COLUMNS],
            )
            connection.executemany(
                "INSERT INTO cards (id, board_id, column_id, title, details, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [(card_id, DEFAULT_BOARD_ID, column_id, title, details, position, timestamp, timestamp) for card_id, column_id, title, details, position in SEED_CARDS],
            )

    def _migrate(self) -> None:
        # Foreign keys must be off while the boards table is rebuilt, and that pragma cannot change inside a transaction.
        connection = sqlite3.connect(self.path, isolation_level=None)
        try:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            has_users = connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").fetchone()
            if has_users and version < 2:
                connection.execute("PRAGMA foreign_keys = OFF")
                connection.executescript(MIGRATE_V1)
        finally:
            connection.close()

    @contextmanager
    def accounts(self) -> Iterator[Accounts]:
        with self.connect() as connection:
            yield Accounts(connection)

    @contextmanager
    def workspace(self, user_id: str) -> Iterator[Workspace]:
        with self.connect() as connection:
            yield Workspace(connection, user_id)

    @contextmanager
    def board(self, user_id: str = DEFAULT_USER_ID, board_id: str = DEFAULT_BOARD_ID) -> Iterator[Board]:
        """Yield one of the user's boards; every operation inside the block runs in one transaction."""
        with self.connect() as connection:
            yield Board(connection, user_id, board_id)


class Accounts:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def create_user(self, username: str, password: str, is_admin: bool = False) -> dict[str, Any]:
        username = username.strip()
        if not USERNAME_PATTERN.match(username):
            raise ValueError("El usuario debe tener entre 3 y 32 letras, números, puntos, guiones o guiones bajos")
        _check_password(password)
        if self.connection.execute("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone():
            raise ValueError("Ese nombre de usuario ya existe")
        user_id = _new_id("user")
        self.connection.execute(
            "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, _password_hash(password), int(is_admin), _now()),
        )
        Workspace(self.connection, user_id).create_board("Mi primer tablero")
        return self.user(user_id)

    def authenticate(self, username: str, password: str) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username.strip(),)).fetchone()
        if not row or not _password_matches(password, row["password_hash"]):
            return None
        return _user_dict(row)

    def create_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        self.connection.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, _now()))
        return token

    def user_for_session(self, token: str) -> dict[str, Any] | None:
        oldest = (datetime.now(timezone.utc) - timedelta(days=SESSION_DAYS)).isoformat()
        row = self.connection.execute(
            "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ? AND sessions.created_at > ?",
            (token, oldest),
        ).fetchone()
        return _user_dict(row) if row else None

    def delete_session(self, token: str) -> None:
        self.connection.execute("DELETE FROM sessions WHERE token = ?", (token,))

    def user(self, user_id: str) -> dict[str, Any]:
        row = self.connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise LookupError("Usuario no encontrado")
        return _user_dict(row)

    def list_users(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT users.*, COUNT(boards.id) AS board_count
            FROM users LEFT JOIN boards ON boards.user_id = users.id
            GROUP BY users.id ORDER BY users.created_at, users.username
            """
        ).fetchall()
        return [{**_user_dict(row), "board_count": row["board_count"]} for row in rows]

    def update_user(self, user_id: str, is_admin: bool | None = None, password: str | None = None) -> dict[str, Any]:
        user = self.user(user_id)
        if is_admin is not None:
            if user["is_admin"] and not is_admin:
                self._keep_an_admin()
            self.connection.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(is_admin), user_id))
        if password is not None:
            self._set_password(user_id, password)
        return self.user(user_id)

    def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        row = self.connection.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row or not _password_matches(current_password, row["password_hash"]):
            raise ValueError("La contraseña actual no es correcta")
        self._set_password(user_id, new_password)

    def delete_user(self, user_id: str) -> None:
        if self.user(user_id)["is_admin"]:
            self._keep_an_admin()
        self.connection.execute("DELETE FROM users WHERE id = ?", (user_id,))

    def _set_password(self, user_id: str, password: str) -> None:
        _check_password(password)
        self.connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", (_password_hash(password), user_id))
        # Changing a password signs the user out everywhere.
        self.connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))

    def _keep_an_admin(self) -> None:
        if self.connection.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1").fetchone()[0] <= 1:
            raise ValueError("Debe quedar al menos un administrador")


class Workspace:
    """The boards owned by one user."""

    def __init__(self, connection: sqlite3.Connection, user_id: str) -> None:
        self.connection = connection
        self.user_id = user_id

    def list_boards(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT boards.*, COUNT(cards.id) AS card_count
            FROM boards LEFT JOIN cards ON cards.board_id = boards.id
            WHERE boards.user_id = ? GROUP BY boards.id ORDER BY boards.created_at, boards.rowid
            """,
            (self.user_id,),
        ).fetchall()
        return [_board_summary(row) for row in rows]

    def create_board(self, title: str) -> dict[str, Any]:
        title = _clean_title(title, "el tablero")
        board_id = _new_id("board")
        timestamp = _now()
        self.connection.execute(
            "INSERT INTO boards (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (board_id, self.user_id, title, timestamp, timestamp),
        )
        self.connection.executemany(
            "INSERT INTO columns (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            [(_new_id("col"), board_id, column_title, position, timestamp, timestamp) for position, column_title in enumerate(DEFAULT_COLUMN_TITLES)],
        )
        return self.summary(board_id)

    def rename_board(self, board_id: str, title: str) -> dict[str, Any]:
        title = _clean_title(title, "el tablero")
        self.summary(board_id)
        self.connection.execute("UPDATE boards SET title = ?, updated_at = ? WHERE id = ?", (title, _now(), board_id))
        return self.summary(board_id)

    def delete_board(self, board_id: str) -> None:
        self.summary(board_id)
        if len(self.list_boards()) <= 1:
            raise ValueError("No puedes eliminar tu único tablero")
        # Cards restrict column deletion, so remove them first.
        self.connection.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        self.connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))

    def summary(self, board_id: str) -> dict[str, Any]:
        for board in self.list_boards():
            if board["id"] == board_id:
                return board
        raise LookupError("Tablero no encontrado")


class Board:
    def __init__(self, connection: sqlite3.Connection, user_id: str, board_id: str) -> None:
        self.connection = connection
        row = connection.execute("SELECT id, title FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)).fetchone()
        if not row:
            raise LookupError("Tablero no encontrado")
        self.id: str = row["id"]
        self.title: str = row["title"]

    def get(self) -> dict[str, Any]:
        columns = self.connection.execute("SELECT * FROM columns WHERE board_id = ? ORDER BY position", (self.id,)).fetchall()
        cards = self.connection.execute("SELECT * FROM cards WHERE board_id = ? ORDER BY position", (self.id,)).fetchall()
        cards_by_column: dict[str, list[dict[str, Any]]] = {column["id"]: [] for column in columns}
        for card in cards:
            cards_by_column[card["column_id"]].append(_card_dict(card))
        return {
            "id": self.id,
            "title": self.title,
            "columns": [_column_dict(column, cards_by_column[column["id"]]) for column in columns],
        }

    def add_column(self, title: str) -> dict[str, Any]:
        title = _clean_title(title, "la columna")
        column_id = _new_id("col")
        timestamp = _now()
        position = len(self._column_ids())
        self.connection.execute(
            "INSERT INTO columns (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (column_id, self.id, title, position, timestamp, timestamp),
        )
        return _column_dict(self._column(column_id), [])

    def rename_column(self, column_id: str, title: str) -> dict[str, Any]:
        title = _clean_title(title, "la columna")
        self._column(column_id)
        self.connection.execute("UPDATE columns SET title = ?, updated_at = ? WHERE id = ?", (title, _now(), column_id))
        return _column_dict(self._column(column_id), [])

    def delete_column(self, column_id: str) -> None:
        self._column(column_id)
        if self._card_ids(column_id):
            raise ValueError("Mueve o elimina las tarjetas antes de borrar la columna")
        column_ids = self._column_ids()
        if len(column_ids) <= 1:
            raise ValueError("El tablero debe tener al menos una columna")
        self.connection.execute("DELETE FROM columns WHERE id = ?", (column_id,))
        column_ids.remove(column_id)
        self.connection.execute("UPDATE columns SET position = position + ? WHERE board_id = ?", (POSITION_OFFSET, self.id))
        self.connection.executemany(
            "UPDATE columns SET position = ? WHERE id = ?", [(position, column) for position, column in enumerate(column_ids)]
        )

    def create_card(
        self, column_id: str, title: str, details: str = "", priority: str = "media", due_date: str | None = None
    ) -> dict[str, Any]:
        title = _clean_title(title, "la tarjeta")
        self._column(column_id)
        card_id = _new_id("card")
        timestamp = _now()
        position = len(self._card_ids(column_id))
        self.connection.execute(
            "INSERT INTO cards (id, board_id, column_id, title, details, priority, due_date, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (card_id, self.id, column_id, title, details.strip(), _check_priority(priority), due_date, position, timestamp, timestamp),
        )
        return _card_dict(self._card(card_id))

    def update_card(self, card_id: str, **changes: Any) -> dict[str, Any]:
        """Change only the given fields: title, details, priority and/or due_date (None clears it)."""
        self._card(card_id)
        if "title" in changes:
            changes["title"] = _clean_title(changes["title"], "la tarjeta")
        if "details" in changes:
            changes["details"] = changes["details"].strip()
        if "priority" in changes:
            _check_priority(changes["priority"])
        unknown = set(changes) - {"title", "details", "priority", "due_date"}
        if unknown:
            raise ValueError(f"Campos desconocidos: {', '.join(sorted(unknown))}")
        if changes:
            assignments = ", ".join(f"{field} = ?" for field in changes)
            self.connection.execute(
                f"UPDATE cards SET {assignments}, updated_at = ? WHERE id = ?", (*changes.values(), _now(), card_id)
            )
        return _card_dict(self._card(card_id))

    def delete_card(self, card_id: str) -> None:
        column_id = self._card(card_id)["column_id"]
        self.connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        self._write_positions(column_id, self._card_ids(column_id))

    def move_card(self, card_id: str, column_id: str, position: int) -> dict[str, Any]:
        if position < 0:
            raise ValueError("La posición no puede ser negativa")
        source_column_id = self._card(card_id)["column_id"]
        self._column(column_id)

        source_ids = self._card_ids(source_column_id)
        source_ids.remove(card_id)
        target_ids = source_ids if column_id == source_column_id else self._card_ids(column_id)
        target_ids.insert(min(position, len(target_ids)), card_id)

        if column_id != source_column_id:
            self._write_positions(source_column_id, source_ids)
        self._write_positions(column_id, target_ids)
        self.connection.execute("UPDATE cards SET updated_at = ? WHERE id = ?", (_now(), card_id))
        return _card_dict(self._card(card_id))

    def _column(self, column_id: str) -> sqlite3.Row:
        row = self.connection.execute("SELECT * FROM columns WHERE id = ? AND board_id = ?", (column_id, self.id)).fetchone()
        if not row:
            raise LookupError("Columna no encontrada")
        return row

    def _column_ids(self) -> list[str]:
        rows = self.connection.execute("SELECT id FROM columns WHERE board_id = ? ORDER BY position", (self.id,)).fetchall()
        return [row["id"] for row in rows]

    def _card(self, card_id: str) -> sqlite3.Row:
        row = self.connection.execute("SELECT * FROM cards WHERE id = ? AND board_id = ?", (card_id, self.id)).fetchone()
        if not row:
            raise LookupError("Tarjeta no encontrada")
        return row

    def _card_ids(self, column_id: str) -> list[str]:
        rows = self.connection.execute(
            "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position", (self.id, column_id)
        ).fetchall()
        return [row["id"] for row in rows]

    def _write_positions(self, column_id: str, card_ids: list[str]) -> None:
        self.connection.execute(
            "UPDATE cards SET position = position + ? WHERE board_id = ? AND column_id = ?",
            (POSITION_OFFSET, self.id, column_id),
        )
        self.connection.executemany(
            "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
            [(column_id, position, card_id) for position, card_id in enumerate(card_ids)],
        )


def _user_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"]), "created_at": row["created_at"]}


def _board_summary(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "card_count": row["card_count"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _column_dict(row: sqlite3.Row, cards: list[dict[str, Any]]) -> dict[str, Any]:
    return {"id": row["id"], "title": row["title"], "position": row["position"], "cards": cards}


def _card_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "details": row["details"],
        "priority": row["priority"],
        "due_date": row["due_date"],
        "position": row["position"],
        "column_id": row["column_id"],
    }
