from collections.abc import Callable, Iterator
from contextlib import ExitStack

import pytest
from fastapi.testclient import TestClient

from app.database import Database
import app.main as main_module

BOARD = "/api/boards/board-1"


@pytest.fixture()
def database(tmp_path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database


@pytest.fixture()
def make_client(database: Database, monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[..., TestClient]]:
    """Build independent clients (separate cookie jars), optionally signed in."""
    monkeypatch.setattr(main_module, "database", database)
    with ExitStack() as stack:

        def build(username: str | None = None, password: str = "password") -> TestClient:
            client = stack.enter_context(TestClient(main_module.app))
            if username:
                response = client.post("/api/auth/login", json={"username": username, "password": password})
                assert response.status_code == 200, response.text
            return client

        yield build


@pytest.fixture()
def anonymous(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


@pytest.fixture()
def client(make_client: Callable[..., TestClient]) -> TestClient:
    """The seeded administrator 'user', signed in."""
    return make_client("user")


@pytest.fixture()
def register(make_client: Callable[..., TestClient]) -> Callable[..., TestClient]:
    """Register a new regular user and return a client signed in as them."""

    def build(username: str, password: str = "password123") -> TestClient:
        client = make_client()
        response = client.post("/api/auth/register", json={"username": username, "password": password})
        assert response.status_code == 201, response.text
        return client

    return build
