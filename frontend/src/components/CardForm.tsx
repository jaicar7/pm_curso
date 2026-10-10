import { useState, type FormEvent } from "react";
import type { CardFields } from "@/lib/api";
import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/kanban";

export const emptyCardFields: CardFields = { title: "", details: "", priority: "media", due_date: null };

const inputClass =
  "w-full rounded-lg border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

type CardFormProps = {
  initial: CardFields;
  submitLabel: string;
  onSubmit: (fields: CardFields) => void;
  onCancel: () => void;
};

export const CardForm = ({ initial, submitLabel, onSubmit, onCancel }: CardFormProps) => {
  const [fields, setFields] = useState(initial);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fields.title.trim()) {
      return;
    }
    onSubmit({ ...fields, title: fields.title.trim(), details: fields.details.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        value={fields.title}
        onChange={(event) => setFields((prev) => ({ ...prev, title: event.target.value }))}
        placeholder="Título de la tarjeta"
        aria-label="Título de la tarjeta"
        autoFocus
        className={`${inputClass} font-medium`}
        required
      />
      <textarea
        value={fields.details}
        onChange={(event) => setFields((prev) => ({ ...prev, details: event.target.value }))}
        placeholder="Detalles"
        aria-label="Detalles de la tarjeta"
        rows={2}
        className={`${inputClass} resize-none text-[var(--gray-text)]`}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={fields.priority}
          onChange={(event) =>
            setFields((prev) => ({ ...prev, priority: event.target.value as Priority }))
          }
          aria-label="Prioridad"
          className={inputClass}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fields.due_date ?? ""}
          onChange={(event) =>
            setFields((prev) => ({ ...prev, due_date: event.target.value || null }))
          }
          aria-label="Fecha límite"
          className={inputClass}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
};
