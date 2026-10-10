# Backend

FastAPI backend for the Project Management MVP. It serves the exported Next.js frontend and provides the SQLite-backed board API.

## Structure

- `app/main.py`: FastAPI app, static frontend serving, session cookie auth (`current_user`, `admin_user` dependencies) and API routes.
- `app/database.py`: SQLite schema, migration from schema v1 and seed data (`Database`). Operations live on three classes, each obtained with a context manager that is one transaction: `Accounts` (`database.accounts()`: users, passwords, sessions), `Workspace` (`database.workspace(user_id)`: a user's boards) and `Board` (`database.board(user_id, board_id)`: columns and cards of one board, raising `LookupError` for boards the user does not own).
- `app/ai_board.py`: prompt building, parsing and atomic execution of AI board actions.
- `app/schemas.py`: Pydantic request models.
- `tests/`: API, database and AI tests using temporary SQLite databases. `conftest.py` provides `client` (the seeded admin, signed in), `anonymous`, `register(username)` and `make_client(username)`.

## API

All routes except health, login, register and logout need the `pm_session` cookie (401 otherwise). Error messages are in Spanish.

- `GET /api/health`: service health check.
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PUT /api/auth/password`.
- Administrators only (403 otherwise): `GET|POST /api/users`, `PATCH|DELETE /api/users/{user_id}` (role and password reset). Admins cannot demote or delete themselves and the last admin cannot be removed.
- `GET|POST /api/boards`, `GET|PATCH|DELETE /api/boards/{board_id}` (the last board cannot be deleted).
- `POST /api/boards/{board_id}/columns`, `PATCH|DELETE /api/boards/{board_id}/columns/{column_id}` (only empty columns can be deleted).
- `POST /api/boards/{board_id}/columns/{column_id}/cards`, `PATCH|DELETE /api/boards/{board_id}/cards/{card_id}`, `POST /api/boards/{board_id}/cards/{card_id}/move`. Cards have `priority` (`baja`, `media`, `alta`) and an optional `due_date` (`YYYY-MM-DD`); PATCH changes only the fields sent.
- `POST /api/boards/{board_id}/ai`: sends the board and a request to OpenRouter, validates structured actions and applies them in one transaction.
- `POST /api/ai/chat`: sends a minimal chat message to OpenRouter.

The seeded administrator is `user` / `password`.

OpenRouter is configured server-side with `OPENROUTER_API_KEY` and the `nvidia/nemotron-3-ultra-550b-a55b:free` model. Provider failures are returned as `502` without exposing the key.

## Development

From `backend/`, run `python -m pytest -q`. Coverage: `python -m pytest --cov=app`. Dependencies are listed in `requirements.txt` (installed with `uv` in the Dockerfile) and mirrored in `pyproject.toml`. The database path defaults to `data/project-management.sqlite3` and can be overridden with `PM_DATABASE_PATH`.