import { useState } from "react";
import type { CardFields } from "@/lib/api";
import { CardForm, emptyCardFields } from "@/components/CardForm";
import { PlusIcon } from "@/components/Icons";

type NewCardFormProps = {
  onAdd: (fields: CardFields) => void;
};

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-3">
      {isOpen ? (
        <div className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] p-2">
          <CardForm
            initial={emptyCardFields}
            submitLabel="Añadir"
            onSubmit={(fields) => {
              onAdd(fields);
              setIsOpen(false);
            }}
            onCancel={() => setIsOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)] hover:bg-[var(--surface)]"
        >
          <PlusIcon />
          Nueva tarjeta
        </button>
      )}
    </div>
  );
};
