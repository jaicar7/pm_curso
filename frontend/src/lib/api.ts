import type { BoardData, Card } from "@/lib/kanban";

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

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "The board could not be updated.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export const boardFromApi = (board: ApiBoard): BoardData => ({
  columns: board.columns.map(({ id, title, cards }) => ({
    id,
    title,
    cardIds: cards.map((card) => card.id),
  })),
  cards: Object.fromEntries(
    board.columns.flatMap((column) =>
      column.cards.map(({ id, title, details }) => [id, { id, title, details }])
    )
  ),
});

export const fetchBoard = () =>
  request<ApiBoard>("/api/boards/me").then(boardFromApi);

export const renameColumn = (columnId: string, title: string) =>
  request(`/api/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const createCard = (columnId: string, title: string, details: string) =>
  request<Card>(`/api/columns/${columnId}/cards`, {
    method: "POST",
    body: JSON.stringify({ title, details }),
  });

export const updateCard = (cardId: string, card: Card) =>
  request(`/api/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: card.title, details: card.details }),
  });

export const deleteCard = (cardId: string) =>
  request<void>(`/api/cards/${cardId}`, { method: "DELETE" });

export const moveCard = (cardId: string, columnId: string, position: number) =>
  request(`/api/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, position }),
  });
