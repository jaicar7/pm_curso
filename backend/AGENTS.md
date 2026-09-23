# Backend

FastAPI backend for the Project Management MVP. It serves the exported Next.js frontend and provides the SQLite-backed board API.

## Structure

- `app/main.py`: FastAPI app, static frontend serving, and API routes.
- `app/database.py`: SQLite schema initialization, seed data, and board/card persistence operations.
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

The MVP uses the seeded `user` account internally. API authentication and frontend synchronization are scheduled for later phases.

OpenRouter is configured server-side with `OPENROUTER_API_KEY` and the `google/gemma-4-31b-it:free` model. Provider failures are returned as `502` without exposing the key.

## Development

From `backend/`, run `python -m pytest -q`. The database path defaults to `data/project-management.sqlite3` and can be overridden with `PM_DATABASE_PATH`.