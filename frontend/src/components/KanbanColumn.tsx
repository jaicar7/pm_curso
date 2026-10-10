import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { CardFields } from "@/lib/api";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import { TrashIcon } from "@/components/Icons";

type KanbanColumnProps = {
  column: Column;
  // Cards to show, already filtered; the column count always reflects every card.
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onRenameCommit: (columnId: string) => void | Promise<void>;
  onDelete: (columnId: string) => void | Promise<void>;
  onAddCard: (columnId: string, fields: CardFields) => void | Promise<void>;
  onDeleteCard: (cardId: string) => void | Promise<void>;
  onUpdateCard: (cardId: string, fields: CardFields) => void | Promise<void>;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onRenameCommit,
  onDelete,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const total = column.cardIds.length;
  const hiddenCount = total - cards.length;

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[480px] flex-col rounded-2xl border border-t-4 border-[var(--stroke)] border-t-[var(--accent-yellow)] bg-[var(--surface-strong)]/90 p-3 shadow-[0_4px_14px_rgba(3,33,71,0.07)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="group flex items-center gap-1 px-1">
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          onBlur={() => onRenameCommit(column.id)}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 font-display text-base font-semibold text-[var(--navy-dark)] outline-none transition hover:bg-[var(--surface)] focus:bg-[var(--surface)]"
          aria-label="Título de la columna"
        />
        <span
          className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)]"
          title={total === 1 ? "1 tarjeta" : `${total} tarjetas`}
        >
          {total}
        </span>
        <button
          type="button"
          onClick={() => onDelete(column.id)}
          disabled={total > 0}
          className="icon-button danger opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-0 disabled:group-hover:opacity-40"
          aria-label={`Eliminar columna ${column.title}`}
          title={total > 0 ? "Vacía la columna para poder eliminarla" : "Eliminar columna"}
        >
          <TrashIcon />
        </button>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-2">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard key={card.id} card={card} onDelete={onDeleteCard} onUpdate={onUpdateCard} />
          ))}
        </SortableContext>
        {total === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold text-[var(--gray-text)]">
            Arrastra una tarjeta aquí
          </div>
        )}
        {hiddenCount > 0 && (
          <p className="px-1 text-center text-xs text-[var(--gray-text)]">
            {hiddenCount === 1 ? "1 tarjeta oculta por el filtro" : `${hiddenCount} tarjetas ocultas por el filtro`}
          </p>
        )}
      </div>
      <NewCardForm onAdd={(fields) => onAddCard(column.id, fields)} />
    </section>
  );
};
