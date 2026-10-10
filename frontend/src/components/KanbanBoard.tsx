"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AIChatSidebar, type ChatMessage } from "@/components/AIChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { PlusIcon, SearchIcon } from "@/components/Icons";
import {
  addColumn,
  askBoardAssistant,
  createCard,
  deleteCard,
  deleteColumn,
  fetchBoard,
  moveCard as moveCardApi,
  renameColumn,
  updateCard,
  type CardFields,
} from "@/lib/api";
import {
  matchesFilter,
  moveCard,
  PRIORITIES,
  PRIORITY_LABELS,
  type BoardData,
  type CardFilter,
} from "@/lib/kanban";

const buildMessage = (role: "user" | "assistant", content: string): ChatMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content,
});

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

type KanbanBoardProps = {
  boardId: string;
  // Called after any change so the parent can refresh board summaries (card counts).
  onChange?: () => void;
};

export const KanbanBoard = ({ boardId, onChange }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CardFilter>({ query: "", priority: "todas" });
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([
    buildMessage("assistant", "Pídeme que cree, mueva o renombre tarjetas del tablero."),
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const loadBoard = useCallback(async () => {
    try {
      setBoard(await fetchBoard(boardId));
    } catch (loadError) {
      setError(errorMessage(loadError, "No se pudo cargar el tablero."));
    }
  }, [boardId]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  if (!board) {
    return (
      <p className="py-20 text-center text-sm font-semibold text-[var(--gray-text)]">
        {error ?? "Cargando tu tablero..."}
      </p>
    );
  }

  // Runs a change against the API; on failure the board is reloaded so the screen matches the server.
  const persist = async (operation: () => Promise<void>) => {
    try {
      setError(null);
      await operation();
      onChange?.();
    } catch (saveError) {
      await loadBoard();
      setError(errorMessage(saveError, "No se pudo actualizar el tablero."));
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const nextColumns = moveCard(board.columns, active.id as string, over.id as string);
    const targetColumn = nextColumns.find((column) =>
      column.cardIds.includes(active.id as string)
    );
    const nextPosition = targetColumn?.cardIds.indexOf(active.id as string) ?? -1;
    if (!targetColumn || nextPosition < 0) return;

    setBoard((prev) => (prev ? { ...prev, columns: nextColumns } : prev));
    await persist(async () => {
      await moveCardApi(boardId, active.id as string, targetColumn.id, nextPosition);
    });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((column) =>
              column.id === columnId ? { ...column, title } : column
            ),
          }
        : prev
    );
  };

  const handleColumnBlur = async (columnId: string) => {
    const title = board.columns.find((column) => column.id === columnId)?.title ?? "";
    await persist(async () => {
      await renameColumn(boardId, columnId, title);
    });
  };

  const handleAddColumn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) return;
    await persist(async () => {
      const column = await addColumn(boardId, title);
      setNewColumnTitle("");
      setBoard((prev) =>
        prev
          ? { ...prev, columns: [...prev.columns, { id: column.id, title: column.title, cardIds: [] }] }
          : prev
      );
    });
  };

  const handleDeleteColumn = async (columnId: string) => {
    await persist(async () => {
      await deleteColumn(boardId, columnId);
      setBoard((prev) =>
        prev ? { ...prev, columns: prev.columns.filter((column) => column.id !== columnId) } : prev
      );
    });
  };

  const handleAddCard = async (columnId: string, fields: CardFields) => {
    await persist(async () => {
      const card = await createCard(boardId, columnId, {
        ...fields,
        details: fields.details || "Sin detalles.",
      });
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              cards: { ...prev.cards, [card.id]: card },
              columns: prev.columns.map((column) =>
                column.id === columnId
                  ? { ...column, cardIds: [...column.cardIds, card.id] }
                  : column
              ),
            }
          : prev
      );
    });
  };

  const handleUpdateCard = async (cardId: string, fields: CardFields) => {
    await persist(async () => {
      const card = await updateCard(boardId, cardId, fields);
      setBoard((prev) =>
        prev ? { ...prev, cards: { ...prev.cards, [card.id]: card } } : prev
      );
    });
  };

  const handleDeleteCard = async (cardId: string) => {
    await persist(async () => {
      await deleteCard(boardId, cardId);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              cards: Object.fromEntries(
                Object.entries(prev.cards).filter(([id]) => id !== cardId)
              ),
              columns: prev.columns.map((column) => ({
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              })),
            }
          : prev
      );
    });
  };

  const handleAiSend = async (message: string) => {
    setAiMessages((prev) => [...prev, buildMessage("user", message)]);
    setIsAiLoading(true);
    setError(null);

    try {
      const payload = await askBoardAssistant(boardId, message);
      setAiMessages((prev) => [...prev, buildMessage("assistant", payload.response)]);
      await loadBoard();
      onChange?.();
    } catch (aiError) {
      setAiMessages((prev) => [
        ...prev,
        buildMessage("assistant", "La IA no pudo procesar la petición. Inténtalo de nuevo."),
      ]);
      setError(errorMessage(aiError, "La IA no pudo procesar la petición."));
    } finally {
      setIsAiLoading(false);
    }
  };

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const isFiltering = filter.query.trim() !== "" || filter.priority !== "todas";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 shadow-[0_4px_14px_rgba(3,33,71,0.05)]">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-[var(--gray-text)] focus-within:border-[var(--primary-blue)]">
          <SearchIcon />
          <input
            value={filter.query}
            onChange={(event) => setFilter((prev) => ({ ...prev, query: event.target.value }))}
            placeholder="Buscar tarjetas..."
            aria-label="Buscar tarjetas"
            className="w-full bg-transparent text-sm text-[var(--navy-dark)] outline-none"
          />
        </label>
        <select
          value={filter.priority}
          onChange={(event) =>
            setFilter((prev) => ({ ...prev, priority: event.target.value as CardFilter["priority"] }))
          }
          aria-label="Filtrar por prioridad"
          className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
        >
          <option value="todas">Todas las prioridades</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              Prioridad {PRIORITY_LABELS[priority].toLowerCase()}
            </option>
          ))}
        </select>
        {isFiltering ? (
          <button
            type="button"
            onClick={() => setFilter({ query: "", priority: "todas" })}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)]"
          >
            Limpiar filtros
          </button>
        ) : null}
        <form onSubmit={handleAddColumn} className="ml-auto flex items-center gap-2">
          <input
            value={newColumnTitle}
            onChange={(event) => setNewColumnTitle(event.target.value)}
            placeholder="Nueva columna"
            aria-label="Título de la nueva columna"
            className="w-40 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            disabled={!newColumnTitle.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon />
            Añadir columna
          </button>
        </form>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-[var(--secondary-purple)]/30 bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--secondary-purple)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="min-w-0 flex-1 overflow-x-auto px-1 pb-4">
            <section className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds
                    .map((cardId) => board.cards[cardId])
                    .filter((card) => matchesFilter(card, filter))}
                  onRename={handleRenameColumn}
                  onRenameCommit={handleColumnBlur}
                  onDelete={handleDeleteColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onUpdateCard={handleUpdateCard}
                />
              ))}
            </section>
          </div>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[250px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <div className="w-full 2xl:sticky 2xl:top-4 2xl:w-[340px] 2xl:shrink-0">
          <AIChatSidebar messages={aiMessages} isLoading={isAiLoading} onSend={handleAiSend} />
        </div>
      </div>
    </div>
  );
};
