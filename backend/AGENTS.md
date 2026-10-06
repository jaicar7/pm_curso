# Backend

FastAPI backend for the Project Management MVP. It serves the exported Next.js frontend and provides the SQLite-backed board API.

## Structure

- `app/main.py`: FastAPI app, static frontend serving, and API routes.
- `app/database.py`: SQLite schema initialization and seed data (`Database`), and board/card operations (`Board`, obtained with `with database.board() as board:`, one transaction per block).
- `app/ai_board.py`: prompt building, parsing and atomic execution of AI board actions.
- `app/schemas.py`: Pydantic request models for board mutations.
- `tests/`: API and smoke tests using temporary SQLite databases where persistence is tested.

## API

- `GET /api/health`: service health check.
- `GET /api/boards/me`: returns the demo user's board.
- `PATCH /api/columns/{column_id}`: renames a column.
- `POST /api/columns/{column_id}/cards`: creates a card.
- `PATCH /api/cards/{card_id}`: edits a card.
- `DELETE /api/cards/{card_id}`: deletes a card.
- `POST /api/cards/{card_id}/move`: moves a card and normalizes positions.
- `POST /api/ai/chat`: sends a minimal chat message to OpenRouter.
- `POST /api/ai/board`: sends the current board and a user request to OpenRouter, validates structured actions, and applies safe changes.

The MVP uses the seeded `user` account internally; login is checked only in the frontend.

OpenRouter is configured server-side with `OPENROUTER_API_KEY` and the `nvidia/nemotron-3-ultra-550b-a55b:free` model. Provider failures are returned as `502` without exposing the key.

## Development

From `backend/`, run `python -m pytest -q`. Coverage: `python -m pytest --cov=app`. Dependencies are listed in `requirements.txt` (installed with `uv` in the Dockerfile) and mirrored in `pyproject.toml`. The database path defaults to `data/project-management.sqlite3` and can be overridden with `PM_DATABASE_PATH`.