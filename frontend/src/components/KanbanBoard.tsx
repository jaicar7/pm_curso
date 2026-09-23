"use client";

import { useEffect, useMemo, useState } from "react";
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
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { fetchBoard, createCard, deleteCard, moveCard as moveCardApi, renameColumn } from "@/lib/api";
import { moveCard, type BoardData } from "@/lib/kanban";

export const KanbanBoard = ({ onLogout }: { onLogout?: () => void }) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadBoard = async () => {
    try {
      setError(null);
      setBoard(await fetchBoard());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The board could not be loaded.");
    }
  };

  useEffect(() => {
    void loadBoard();
  }, []);

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm font-semibold text-[var(--gray-text)]">
          {error ?? "Loading your board..."}
        </p>
      </main>
    );
  }

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
      await moveCardApi(active.id as string, targetColumn.id, nextPosition);
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
      await renameColumn(columnId, title);
    });
  };

  const handleAddCard = async (columnId: string, title: string, details: string) => {
    await persist(async () => {
      const card = await createCard(columnId, title, details || "No details yet.");
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

  const handleDeleteCard = async (_columnId: string, cardId: string) => {
    await persist(async () => {
      await deleteCard(cardId);
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

  const persist = async (operation: () => Promise<void>) => {
    try {
      setIsSaving(true);
      setError(null);
      await operation();
    } catch (saveError) {
      await loadBoard();
      setError(saveError instanceof Error ? saveError.message : "The board could not be updated.");
    } finally {
      setIsSaving(false);
    }
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
              </div>
              {onLogout ? (
                <button
                  className="rounded-xl border border-[var(--stroke)] px-4 py-3 text-sm font-semibold text-[var(--navy-dark)]"
                  onClick={onLogout}
                  type="button"
                >
                  Log out
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onRenameCommit={handleColumnBlur}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
