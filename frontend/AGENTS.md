# Frontend AGENTS.md

## Overview

This folder contains the Next.js frontend for the Project Management MVP. It is a standalone front-end demo that already includes the Kanban board experience and related tests. The application is designed to evolve into a production-ready frontend served by the Python FastAPI backend, but the current code remains intentionally simple and focused.

## Stack

- Next.js 16
- React 19
- TypeScript
- Vitest for unit tests
- Testing Library for component testing
- Playwright for integration/E2E style browser tests
- @dnd-kit for drag-and-drop Kanban interactions

## Project structure

- `src/app/`: App shell and routes
  - `layout.tsx`: root layout and global styling hook
  - `page.tsx`: main page entry for the app
  - `globals.css`: global styles and design tokens
- `src/components/`: UI components
  - `KanbanBoard.tsx`: main board container and drag/drop orchestration
  - `KanbanColumn.tsx`: individual board columns
  - `KanbanCard.tsx`: editable card content
  - `KanbanCardPreview.tsx`: drag overlay preview
  - `NewCardForm.tsx`: form for adding a new card
  - `AIChatSidebar.tsx`: AI chat panel
  - `LoginForm.tsx`: dummy login form
- `src/lib/kanban.ts`: core board logic and initial seed data
- `src/lib/api.ts`: backend API client and conversion to `BoardData`
- `src/test/`: testing setup utilities
- `tests/`: Playwright or integration tests
- `*.test.tsx` and `*.test.ts`: unit tests for UI and logic

## Current implementation

The frontend is built as a static export (`output: "export"`) and served by FastAPI at `/`. It provides:

- login with dummy credentials (`user` / `password`), session kept in localStorage (`src/app/page.tsx`)
- fixed columns that can be renamed
- draggable cards between columns, card creation and deletion
- board state loaded from and saved to the backend API (`src/lib/api.ts`); failed operations show an error and reload the board
- an AI chat sidebar (`AIChatSidebar.tsx`) that sends requests to `/api/ai/board` and reloads the board after a response

In development, `next dev` rewrites `/api/*` to `http://localhost:8000`, so the backend must be running. Playwright E2E tests assume the seeded board, so run them against a fresh database (start the backend with a new `PM_DATABASE_PATH`).

## Core board data model

The board state is defined in `src/lib/kanban.ts` using a simple shape:

- `BoardData`
  - `columns`: ordered list of columns
  - `cards`: record of card objects keyed by id
- `Column`
  - `id`, `title`, `cardIds`
- `Card`
  - `id`, `title`, `details`

The initial seed data includes several example cards spread across five default columns:

- Backlog
- Discovery
- In Progress
- Review
- Done

## Functionality notes

### Drag and drop

`KanbanBoard.tsx` handles drag start and drag end events using `@dnd-kit`. The board uses pointer sensors with a minimal activation distance. The `moveCard` utility defines the movement rules for moving cards within the same column or between different columns.

### Column renaming

Columns can be renamed from the UI by passing a title update to the board state.

### Card creation

A new card is created with a generated id and appended to the selected column.

### Card deletion

Deleting a card removes it from the card registry and from the column it belongs to.

## Testing expectations

The frontend already includes tests for the board logic and component rendering. New work must maintain or improve the current test quality.

### Required testing standards

- Unit tests for board logic in `src/lib/kanban.test.ts`
- Component tests for UI rendering and interaction in `src/components/*.test.tsx`
- Coverage should remain at or above 80% for frontend logic and relevant integration flows
- Use real behavior rather than mocks wherever possible

## Important constraints for future development

- Keep the code simple and avoid unnecessary abstraction
- Do not add complex state management patterns for the MVP
- Prefer direct, readable code over over-engineering
- Maintain compatibility with the future FastAPI integration
- The frontend should eventually be served from the backend root path `/`

## Acceptance criteria for frontend changes

A feature is complete only when:

- the UI still renders correctly,
- the relevant tests pass,
- the behavior is consistent with the Kanban requirements,
- and the feature remains compatible with the final backend-driven state model.

## Notes for agents

When working in this folder:

1. Read the existing tests before changing behavior.
2. Preserve the simple structure unless a change truly requires refactoring.
3. Keep design tokens and visual language aligned with the project color scheme.
4. Prefer incremental changes over large rewrites.
5. Validate with the smallest relevant test command before concluding the task.
