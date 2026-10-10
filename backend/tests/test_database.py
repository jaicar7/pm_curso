import sqlite3

from app.database import Database, _password_hash, _password_matches

# The schema shipped before multiple boards, sessions, admins, priorities and due dates.
V1_SCHEMA = """
CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE boards (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE columns (
    id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, title TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position >= 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(board_id, position), UNIQUE(board_id, id)
);
CREATE TABLE cards (
    id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE RESTRICT, title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL CHECK(position >= 0),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(column_id, position)
);
"""


def build_v1_database(path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(V1_SCHEMA)
    connection.execute("INSERT INTO users VALUES ('user-1', 'user', ?, 'now')", (_password_hash("password"),))
    connection.execute("INSERT INTO boards VALUES ('board-1', 'user-1', 'Kanban Studio', 'now', 'now')")
    connection.execute("INSERT INTO columns VALUES ('col-a', 'board-1', 'Backlog', 0, 'now', 'now')")
    connection.execute("INSERT INTO columns VALUES ('col-b', 'board-1', 'Done', 1, 'now', 'now')")
    connection.execute("INSERT INTO cards VALUES ('card-a', 'board-1', 'col-a', 'Old card', 'Kept', 0, 'now', 'now')")
    connection.commit()
    connection.close()


def test_initialize_migrates_a_version_1_database_keeping_data(tmp_path) -> None:
    path = tmp_path / "v1.sqlite3"
    build_v1_database(path)

    database = Database(path)
    database.initialize()

    with database.board() as board:
        snapshot = board.get()
    assert snapshot["title"] == "Kanban Studio"
    assert [column["title"] for column in snapshot["columns"]] == ["Backlog", "Done"]
    assert snapshot["columns"][0]["cards"][0] | {"position": 0} == {
        "id": "card-a",
        "title": "Old card",
        "details": "Kept",
        "priority": "media",
        "due_date": None,
        "position": 0,
        "column_id": "col-a",
    }
    with database.accounts() as accounts:
        assert accounts.authenticate("user", "password")["is_admin"] is True

    # The one-board-per-user constraint is gone and foreign keys still point at "boards".
    with database.workspace("user-1") as workspace:
        workspace.create_board("Segundo")
        assert len(workspace.list_boards()) == 2
    connection = sqlite3.connect(path)
    assert connection.execute("PRAGMA user_version").fetchone()[0] == 2
    assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    references = connection.execute("SELECT sql FROM sqlite_master WHERE name IN ('columns', 'cards')").fetchall()
    assert all("boards_v" not in sql for (sql,) in references)
    connection.close()

    # Deleting the user still cascades through the rebuilt boards table.
    with database.connect() as connection:
        connection.execute("DELETE FROM cards")
        connection.execute("DELETE FROM users")
        assert connection.execute("SELECT COUNT(*) FROM columns").fetchone()[0] == 0


def test_initialize_is_idempotent(tmp_path) -> None:
    database = Database(tmp_path / "db.sqlite3")
    database.initialize()
    with database.board() as board:
        board.rename_column("col-backlog", "Cambiada")

    database.initialize()

    with database.board() as board:
        assert board.get()["columns"][0]["title"] == "Cambiada"
    with database.accounts() as accounts:
        assert len(accounts.list_users()) == 1


def test_database_path_comes_from_environment(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DATABASE_PATH", str(tmp_path / "env.sqlite3"))

    assert Database().path == tmp_path / "env.sqlite3"


def test_password_hashes_are_salted_and_verifiable() -> None:
    first, second = _password_hash("secreto123"), _password_hash("secreto123")

    assert first != second
    assert _password_matches("secreto123", first)
    assert not _password_matches("otra", first)
