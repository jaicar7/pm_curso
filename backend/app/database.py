from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "project-management.sqlite3"
DEFAULT_USER_ID = "user-1"
DEFAULT_BOARD_ID = "board-1"

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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2_sha256$120000${salt.hex()}${digest.hex()}"


class Database:
    def __init__(self, path: str | Path | None = None) -> None:
        configured_path = path or os.getenv("PM_DATABASE_PATH") or DEFAULT_DATABASE_PATH
        self.path = Path(configured_path)

    def connect(self) -> sqlite3.Connection:
        if self.path != Path(":memory:"):
            self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
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
            )
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

    def board_for_user(self, user_id: str = DEFAULT_USER_ID) -> dict[str, Any]:
        self.initialize()
        with self.connect() as connection:
            board = connection.execute("SELECT * FROM boards WHERE user_id = ?", (user_id,)).fetchone()
            if not board:
                raise LookupError("User or board not found")
            columns = connection.execute("SELECT * FROM columns WHERE board_id = ? ORDER BY position", (board["id"],)).fetchall()
            cards = connection.execute("SELECT * FROM cards WHERE board_id = ? ORDER BY column_id, position", (board["id"],)).fetchall()
        cards_by_column: dict[str, list[dict[str, Any]]] = {column["id"]: [] for column in columns}
        for card in cards:
            cards_by_column[card["column_id"]].append(self._card_dict(card))
        return {
            "id": board["id"],
            "title": board["title"],
            "columns": [self._column_dict(column, cards_by_column[column["id"]]) for column in columns],
        }

    def rename_column(self, column_id: str, title: str, user_id: str = DEFAULT_USER_ID) -> dict[str, Any]:
        title = title.strip()
        if not title:
            raise ValueError("Column title must not be empty")
        self.initialize()
        with self.connect() as connection:
            result = connection.execute(
                "UPDATE columns SET title = ?, updated_at = ? WHERE id = ? AND board_id = (SELECT id FROM boards WHERE user_id = ?)",
                (title, _now(), column_id, user_id),
            )
            if result.rowcount == 0:
                raise LookupError("Column not found")
            row = connection.execute("SELECT * FROM columns WHERE id = ?", (column_id,)).fetchone()
        return self._column_dict(row, [])

    def create_card(self, column_id: str, title: str, details: str = "", user_id: str = DEFAULT_USER_ID) -> dict[str, Any]:
        title = title.strip()
        if not title:
            raise ValueError("Card title must not be empty")
        self.initialize()
        card_id = f"card-{secrets.token_urlsafe(8)}"
        timestamp = _now()
        with self.connect() as connection:
            column = connection.execute(
                "SELECT c.*, b.id AS board_id FROM columns c JOIN boards b ON b.id = c.board_id WHERE c.id = ? AND b.user_id = ?",
                (column_id, user_id),
            ).fetchone()
            if not column:
                raise LookupError("Column not found")
            position = connection.execute("SELECT COALESCE(MAX(position) + 1, 0) FROM cards WHERE column_id = ?", (column_id,)).fetchone()[0]
            connection.execute(
                "INSERT INTO cards (id, board_id, column_id, title, details, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (card_id, column["board_id"], column_id, title, details.strip(), position, timestamp, timestamp),
            )
            row = connection.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        return self._card_dict(row)

    def update_card(self, card_id: str, title: str, details: str, user_id: str = DEFAULT_USER_ID) -> dict[str, Any]:
        title = title.strip()
        if not title:
            raise ValueError("Card title must not be empty")
        self.initialize()
        with self.connect() as connection:
            result = connection.execute(
                "UPDATE cards SET title = ?, details = ?, updated_at = ? WHERE id = ? AND board_id IN (SELECT id FROM boards WHERE user_id = ?)",
                (title, details.strip(), _now(), card_id, user_id),
            )
            if result.rowcount == 0:
                raise LookupError("Card not found")
            row = connection.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        return self._card_dict(row)

    def delete_card(self, card_id: str, user_id: str = DEFAULT_USER_ID) -> None:
        self.initialize()
        with self.connect() as connection:
            card = connection.execute(
                "SELECT cards.column_id, cards.position FROM cards JOIN boards ON boards.id = cards.board_id WHERE cards.id = ? AND boards.user_id = ?",
                (card_id, user_id),
            ).fetchone()
            if not card:
                raise LookupError("Card not found")
            connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
            connection.execute(
                "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
                (card["column_id"], card["position"]),
            )

    def move_card(self, card_id: str, column_id: str, position: int, user_id: str = DEFAULT_USER_ID) -> dict[str, Any]:
        if position < 0:
            raise ValueError("Position must not be negative")
        self.initialize()
        with self.connect() as connection:
            card = connection.execute(
                "SELECT cards.* FROM cards JOIN boards ON boards.id = cards.board_id WHERE cards.id = ? AND boards.user_id = ?",
                (card_id, user_id),
            ).fetchone()
            target = connection.execute(
                "SELECT columns.* FROM columns JOIN boards ON boards.id = columns.board_id WHERE columns.id = ? AND boards.user_id = ?",
                (column_id, user_id),
            ).fetchone()
            if not card or not target or card["board_id"] != target["board_id"]:
                raise LookupError("Card or target column not found")
            cards = connection.execute(
                "SELECT id, column_id FROM cards WHERE board_id = ? ORDER BY column_id, position",
                (card["board_id"],),
            ).fetchall()
            ordered_cards: dict[str, list[str]] = {}
            for board_card in cards:
                ordered_cards.setdefault(board_card["column_id"], []).append(board_card["id"])
            ordered_cards[card["column_id"]].remove(card_id)
            target_cards = ordered_cards.setdefault(column_id, [])
            target_cards.insert(min(position, len(target_cards)), card_id)

            connection.execute("UPDATE cards SET position = position + 100000 WHERE board_id = ?", (card["board_id"],))
            timestamp = _now()
            for target_column_id, card_ids in ordered_cards.items():
                for next_position, next_card_id in enumerate(card_ids):
                    connection.execute(
                        "UPDATE cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?",
                        (target_column_id, next_position, timestamp, next_card_id),
                    )
            row = connection.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        return self._card_dict(row)

    @staticmethod
    def _column_dict(row: sqlite3.Row, cards: list[dict[str, Any]]) -> dict[str, Any]:
        return {"id": row["id"], "title": row["title"], "position": row["position"], "cards": cards}

    @staticmethod
    def _card_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {"id": row["id"], "title": row["title"], "details": row["details"], "position": row["position"], "column_id": row["column_id"]}
