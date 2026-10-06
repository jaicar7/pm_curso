# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` (root) first: it holds the business requirements, color scheme, and coding standards (keep it simple, no over-engineering, no emojis, prove root cause before fixing). `backend/AGENTS.md` and `frontend/AGENTS.md` document each side in more detail. `docs/PLAN.md` (Spanish) is the phased execution plan; `docs/DATA_MODEL.json` describes the DB schema.

## Commands

Backend (run from `backend/`):
- Install deps: `python -m pip install -r requirements.txt` (the Dockerfile installs the same file with `uv pip install`)
- Run server: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
- All tests: `python -m pytest -q` (coverage: `python -m pytest --cov=app`)
- Single test: `python -m pytest tests/test_board_api.py::test_name -q`

Frontend (run from `frontend/`):
- Dev server: `npm run dev` (port 3000; `/api/*` is rewritten to `localhost:8000`, so the backend must be running)
- Build static export: `npm run build` (outputs `frontend/out/`)
- Lint: `npm run lint`
- Unit tests (Vitest): `npm run test:unit`; single file: `npx vitest run src/lib/kanban.test.ts`; by name: `npx vitest run -t "name"`
- E2E (Playwright): `npm run test:e2e`. It starts the Next dev server and the backend on port 8000 with a new temporary database each run (port 8000 must be free). First time: `npx playwright install chromium`.

Whole app:
- `scripts/start.sh` / `scripts/start.bat` build the Docker image and run container `pm-mvp` on port 8000 with `.env` and `data/` mounted; `stop.sh` / `stop.bat` remove it

## Architecture

- Single FastAPI process (`backend/app/main.py`) serves both the JSON API under `/api/*` and the Next.js static export from `frontend/out/` at `/`. The frontend uses `output: "export"`, so no Next.js server runs in production; the Dockerfile builds the frontend in a Node stage and copies `out/` into the Python image.
- Persistence: `backend/app/database.py` `Database` wraps raw `sqlite3` (no ORM). `initialize()` runs once in the FastAPI lifespan and creates the schema and seeds the default user (`user-1`), board (`board-1`), five columns and sample cards if missing. All board operations live on `Board`, obtained with `with database.board() as board:`; everything inside the block is one transaction (the AI applies all its actions this way, so a failure rolls them all back). Positions are renumbered through an offset to avoid `UNIQUE(column_id, position)` collisions. DB path defaults to `data/project-management.sqlite3`; override with `PM_DATABASE_PATH` (tests use temp files).
- Auth: login is client-side only (`frontend/src/components/LoginForm.tsx`, hardcoded `user`/`password`). The API always operates on the seeded default user's board (`GET /api/boards/me`).
- Frontend state: `src/lib/kanban.ts` defines `BoardData` (`columns` with ordered `cardIds`, plus a `cards` record). `src/lib/api.ts` converts the nested API board shape (columns containing cards with positions) into `BoardData` and wraps fetch calls. `KanbanBoard.tsx` orchestrates drag-and-drop via `@dnd-kit` and calls the API.
- AI: `backend/app/openrouter.py` makes a single `httpx` call to OpenRouter (key from `.env` via `python-dotenv`, loaded in `main.py`). `backend/app/ai_board.py` sends the board JSON plus the user's request, expects a strict JSON `{response, actions[]}` reply (Pydantic discriminated union of `create_card`, `update_card`, `move_card`, `delete_card`, `rename_column`), rejects multiple actions on the same card, then applies all actions in one transaction (an unknown ID rolls everything back). The JSON is taken from the first `{` to the last `}`, so fenced or prose-wrapped replies parse. Invalid AI output or provider errors return HTTP 502. `AIChatSidebar.tsx` is presentational; `KanbanBoard.tsx` (`handleAiSend`) posts to `/api/ai/board` and refreshes the board.
