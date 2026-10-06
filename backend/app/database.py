from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "project-management.sqlite3"
DEFAULT_USER_ID = "user-1"
DEFAULT_BOARD_ID = "board-1"
# Positions are moved out of the way before renumbering so UNIQUE(column_id, position) never collides mid-update.
POSITION_OFFSET = 1_000_000

SEED_COLUMNS = [
    ("col-backlog", "Backlog", 0),
    ("col-discovery", "Discovery", 1),
    ("col-progress", "In Progress", 2),
    ("col-review", "Review", 3),
    ("col-done", "Done", 4),
]

SEED_CARDS = [
    ("card-1", "col-backlog", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics.", 0),
    ("card-2", "col-backlog", "Gather customer signals", "Review support tags, sales notes, and churn feedback.", 1),
    ("card-3", "col-discovery", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs.", 0),
    ("card-4", "col-progress", "Refine status language", "Standardize column labels and tone across the board.", 0),
    ("card-5", "col-progress", "Design card layout", "Add hierarchy and spacing for scanning dense lists.", 1),
    ("card-6", "col-review", "QA micro-interactions", "Verify hover, focus, and loading states.", 0),
    ("card-7", "col-done", "Ship marketing page", "Final copy approved and asset pack delivered.", 0),
    ("card-8", "col-done", "Close onboarding sprint", "Document release notes and share internally.", 1),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
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
    position INTEGER NOT NULL CHECK(position >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(column_id, position)
);
CREATE INDEX IF NOT EXISTS idx_columns_board_position ON columns(board_id, position);
CREATE INDEX IF NOT EXISTS idx_cards_column_position ON cards(column_id, position);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2_sha256$120000${salt.hex()}${digest.hex()}"


def _clean_title(title: str, label: str) -> str:
    title = title.strip()
    if not title:
        raise ValueError(f"{label} title must not be empty")
    return title


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
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            if connection.execute("SELECT 1 FROM users WHERE id = ?", (DEFAULT_USER_ID,)).fetchone():
                return
            timestamp = _now()
            connection.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (DEFAULT_USER_ID, "user", _password_hash("password"), timestamp),
            )
            connection.execute(
                "INSERT INTO boards (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (DEFAULT_BOARD_ID, DEFAULT_USER_ID, "Kanban Studio", timestamp, timestamp),
            )
            connection.executemany(
                "INSERT INTO columns (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                [(column_id, DEFAULT_BOARD_ID, title, position, timestamp, timestamp) for column_id, title, position in SEED_COLUMNS],
            )
            connection.executemany(
                "INSERT INTO cards (id, board_id, column_id, title, details, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [(card_id, DEFAULT_BOARD_ID, column_id, title, details, position, timestamp, timestamp) for card_id, column_id, title, details, position in SEED_CARDS],
            )

    @contextmanager
    def board(self, user_id: str = DEFAULT_USER_ID) -> Iterator[Board]:
        """Yield the user's board; every operation inside the block runs in one transaction."""
        with self.connect() as connection:
            yield Board(connection, user_id)


class Board:
    def __init__(self, connection: sqlite3.Connection, user_id: str) -> None:
        self.connection = connection
        row = connection.execute("SELECT id, title FROM boards WHERE user_id = ?", (user_id,)).fetchone()
        if not row:
            raise LookupError("User or board not found")
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

    def rename_column(self, column_id: str, title: str) -> dict[str, Any]:
        title = _clean_title(title, "Column")
        self._column(column_id)
        self.connection.execute("UPDATE columns SET title = ?, updated_at = ? WHERE id = ?", (title, _now(), column_id))
        return _column_dict(self._column(column_id), [])

    def create_card(self, column_id: str, title: str, details: str = "") -> dict[str, Any]:
        title = _clean_title(title, "Card")
        self._column(column_id)
        card_id = f"card-{secrets.token_urlsafe(8)}"
        timestamp = _now()
        position = len(self._card_ids(column_id))
        self.connection.execute(
            "INSERT INTO cards (id, board_id, column_id, title, details, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (card_id, self.id, column_id, title, details.strip(), position, timestamp, timestamp),
        )
        return _card_dict(self._card(card_id))

    def update_card(self, card_id: str, title: str, details: str) -> dict[str, Any]:
        title = _clean_title(title, "Card")
        self._card(card_id)
        self.connection.execute(
            "UPDATE cards SET title = ?, details = ?, updated_at = ? WHERE id = ?",
            (title, details.strip(), _now(), card_id),
        )
        return _card_dict(self._card(card_id))

    def delete_card(self, card_id: str) -> None:
        column_id = self._card(card_id)["column_id"]
        self.connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        self._write_positions(column_id, self._card_ids(column_id))

    def move_card(self, card_id: str, column_id: str, position: int) -> dict[str, Any]:
        if position < 0:
            raise ValueError("Position must not be negative")
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
            raise LookupError("Column not found")
        return row

    def _card(self, card_id: str) -> sqlite3.Row:
        row = self.connection.execute("SELECT * FROM cards WHERE id = ? AND board_id = ?", (card_id, self.id)).fetchone()
        if not row:
            raise LookupError("Card not found")
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


def _column_dict(row: sqlite3.Row, cards: list[dict[str, Any]]) -> dict[str, Any]:
    return {"id": row["id"], "title": row["title"], "position": row["position"], "cards": cards}


def _card_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "title": row["title"], "details": row["details"], "position": row["position"], "column_id": row["column_id"]}
