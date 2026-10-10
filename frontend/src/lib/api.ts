import type { BoardData, Card, Priority } from "@/lib/kanban";

export type User = {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
};

export type ManagedUser = User & { board_count: number };

export type BoardSummary = {
  id: string;
  title: string;
  card_count: number;
  created_at: string;
  updated_at: string;
};

export type CardFields = {
  title: string;
  details: string;
  priority: Priority;
  due_date: string | null;
};

type ApiCard = Card & {
  position: number;
  column_id: string;
};

type ApiColumn = {
  id: string;
  title: string;
  position: number;
  cards: ApiCard[];
};

type ApiBoard = {
  id: string;
  title: string;
  columns: ApiColumn[];
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // FastAPI validation errors (422) return a list; only plain messages are shown to the user.
    const message = typeof body?.detail === "string" ? body.detail : "No se pudo completar la operación.";
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const boardFromApi = (board: ApiBoard): BoardData => ({
  columns: board.columns.map(({ id, title, cards }) => ({
    id,
    title,
    cardIds: cards.map((card) => card.id),
  })),
  cards: Object.fromEntries(
    board.columns.flatMap((column) =>
      column.cards.map(({ id, title, details, priority, due_date }) => [
        id,
        { id, title, details, priority, due_date },
      ])
    )
  ),
});

const cardFromApi = ({ id, title, details, priority, due_date }: ApiCard): Card => ({
  id,
  title,
  details,
  priority,
  due_date,
});

// Authentication

export const fetchMe = () => request<User>("/api/auth/me");

export const login = (username: string, password: string) =>
  request<User>("/api/auth/login", send("POST", { username, password }));

export const register = (username: string, password: string) =>
  request<User>("/api/auth/register", send("POST", { username, password }));

export const logout = () => request<void>("/api/auth/logout", send("POST"));

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>(
    "/api/auth/password",
    send("PUT", { current_password: currentPassword, new_password: newPassword })
  );

// User management

export const listUsers = () => request<ManagedUser[]>("/api/users");

export const createUser = (username: string, password: string, isAdmin: boolean) =>
  request<User>("/api/users", send("POST", { username, password, is_admin: isAdmin }));

export const updateUser = (userId: string, changes: { is_admin?: boolean; password?: string }) =>
  request<User>(`/api/users/${userId}`, send("PATCH", changes));

export const deleteUser = (userId: string) =>
  request<void>(`/api/users/${userId}`, send("DELETE"));

// Boards

export const listBoards = () => request<BoardSummary[]>("/api/boards");

export const createBoard = (title: string) =>
  request<BoardSummary>("/api/boards", send("POST", { title }));

export const renameBoard = (boardId: string, title: string) =>
  request<BoardSummary>(`/api/boards/${boardId}`, send("PATCH", { title }));

export const deleteBoard = (boardId: string) =>
  request<void>(`/api/boards/${boardId}`, send("DELETE"));

export const fetchBoard = (boardId: string) =>
  request<ApiBoard>(`/api/boards/${boardId}`).then(boardFromApi);

// Columns

export const addColumn = (boardId: string, title: string) =>
  request<ApiColumn>(`/api/boards/${boardId}/columns`, send("POST", { title }));

export const renameColumn = (boardId: string, columnId: string, title: string) =>
  request(`/api/boards/${boardId}/columns/${columnId}`, send("PATCH", { title }));

export const deleteColumn = (boardId: string, columnId: string) =>
  request<void>(`/api/boards/${boardId}/columns/${columnId}`, send("DELETE"));

// Cards

export const createCard = (boardId: string, columnId: string, fields: CardFields) =>
  request<ApiCard>(`/api/boards/${boardId}/columns/${columnId}/cards`, send("POST", fields)).then(
    cardFromApi
  );

export const updateCard = (boardId: string, cardId: string, fields: Partial<CardFields>) =>
  request<ApiCard>(`/api/boards/${boardId}/cards/${cardId}`, send("PATCH", fields)).then(cardFromApi);

export const deleteCard = (boardId: string, cardId: string) =>
  request<void>(`/api/boards/${boardId}/cards/${cardId}`, send("DELETE"));

export const moveCard = (boardId: string, cardId: string, columnId: string, position: number) =>
  request(
    `/api/boards/${boardId}/cards/${cardId}/move`,
    send("POST", { column_id: columnId, position })
  );

// AI

export const askBoardAssistant = (boardId: string, message: string) =>
  request<{ response: string; actions: unknown[] }>(
    `/api/boards/${boardId}/ai`,
    send("POST", { message })
  );
