import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { CardFields } from "@/lib/api";
import { formatDueDate, isOverdue, PRIORITY_LABELS, type Card } from "@/lib/kanban";
import { CardForm } from "@/components/CardForm";
import { CalendarIcon, PencilIcon, TrashIcon } from "@/components/Icons";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onUpdate: (cardId: string, fields: CardFields) => void;
};

const priorityClass: Record<"alta" | "baja", string> = {
  alta: "bg-[var(--secondary-purple)]/10 text-[var(--secondary-purple)]",
  baja: "bg-[var(--surface)] text-[var(--gray-text)]",
};

export const CardMeta = ({ card }: { card: Card }) => {
  const overdue = isOverdue(card.due_date);
  if (card.priority === "media" && !card.due_date) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      {/* Medium is the default, so only the priorities that stand out get a badge. */}
      {card.priority !== "media" ? (
        <span className={clsx("rounded-full px-2 py-0.5", priorityClass[card.priority])}>
          Prioridad {PRIORITY_LABELS[card.priority].toLowerCase()}
        </span>
      ) : null}
      {card.due_date ? (
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 [&_svg]:h-3 [&_svg]:w-3",
            overdue
              ? "bg-[var(--secondary-purple)] text-white"
              : "bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]"
          )}
          title={overdue ? "Fecha límite vencida" : "Fecha límite"}
        >
          <CalendarIcon />
          {formatDueDate(card.due_date)}
          {overdue ? " (vencida)" : ""}
        </span>
      ) : null}
    </div>
  );
};

export const KanbanCard = ({ card, onDelete, onUpdate }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 shadow-[0_4px_12px_rgba(3,33,71,0.06)]",
        "transition-all duration-150 hover:border-[var(--primary-blue)]/40",
        !isEditing && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...(isEditing ? {} : { ...attributes, ...listeners })}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <CardForm
          initial={{
            title: card.title,
            details: card.details,
            priority: card.priority,
            due_date: card.due_date,
          }}
          submitLabel="Guardar"
          onSubmit={(fields) => {
            onUpdate(card.id, fields);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <>
          <div className="flex items-start gap-2">
            <h4 className="min-w-0 flex-1 break-words pt-1 font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
              {card.title}
            </h4>
            <div className="-mr-1 -mt-0.5 flex shrink-0 items-center opacity-70 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="icon-button"
                aria-label={`Editar ${card.title}`}
                title="Editar"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                onClick={() => onDelete(card.id)}
                className="icon-button danger"
                aria-label={`Eliminar ${card.title}`}
                title="Eliminar"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
          {card.details ? (
            <p className="mt-1 break-words text-[13px] leading-5 text-[var(--gray-text)]">
              {card.details}
            </p>
          ) : null}
          <CardMeta card={card} />
        </>
      )}
    </article>
  );
};
