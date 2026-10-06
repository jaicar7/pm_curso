from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.database import Database
import app.main as main_module


@pytest.fixture()
def database(tmp_path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database


@pytest.fixture()
def client(database: Database, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(main_module, "database", database)
    with TestClient(main_module.app) as test_client:
        yield test_client
