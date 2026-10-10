import { useState, type FormEvent } from "react";
import clsx from "clsx";
import type { BoardSummary } from "@/lib/api";
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/Icons";

type BoardTabsProps = {
  boards: BoardSummary[];
  activeBoardId: string | null;
  onSelect: (boardId: string) => void;
  onCreate: (title: string) => void | Promise<void>;
  onRename: (boardId: string, title: string) => void | Promise<void>;
  onDelete: (board: BoardSummary) => void | Promise<void>;
};

const inputClass =
  "w-40 rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

export const BoardTabs = ({ boards, activeBoardId, onSelect, onCreate, onRename, onDelete }: BoardTabsProps) => {
  const [editing, setEditing] = useState<{ id: string | null; title: string } | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || !editing.title.trim()) return;
    const title = editing.title.trim();
    setEditing(null);
    await (editing.id ? onRename(editing.id, title) : onCreate(title));
  };

  const editor = (label: string) => (
    <form onSubmit={handleSubmit} className="flex items-center gap-1">
      <input
        value={editing?.title ?? ""}
        onChange={(event) => setEditing((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
        aria-label={label}
        placeholder="Nombre del tablero"
        autoFocus
        className={inputClass}
      />
      <button type="submit" className="icon-button" aria-label="Guardar tablero" title="Guardar">
        <CheckIcon />
      </button>
      <button
        type="button"
        onClick={() => setEditing(null)}
        className="icon-button"
        aria-label="Cancelar"
        title="Cancelar"
      >
        <CloseIcon />
      </button>
    </form>
  );

  return (
    <nav className="order-last flex w-full min-w-0 items-center gap-1 overflow-x-auto py-1 lg:order-none lg:w-auto lg:flex-1" aria-label="Tableros">
      {boards.map((board) =>
        editing?.id === board.id ? (
          <div key={board.id}>{editor("Nuevo nombre del tablero")}</div>
        ) : (
          <div
            key={board.id}
            className={clsx(
              "group flex shrink-0 items-center rounded-xl border transition",
              board.id === activeBoardId
                ? "border-[var(--primary-blue)]/40 bg-[var(--primary-blue)]/10"
                : "border-transparent hover:bg-[var(--surface)]"
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(board.id)}
              aria-current={board.id === activeBoardId ? "page" : undefined}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 text-sm font-semibold",
                board.id === activeBoardId ? "text-[var(--navy-dark)]" : "text-[var(--gray-text)]"
              )}
            >
              {board.title}
              <span className="rounded-full bg-white px-1.5 text-[11px] text-[var(--gray-text)]">
                {board.card_count}
              </span>
            </button>
            {board.id === activeBoardId ? (
              <div className="flex items-center pr-1">
                <button
                  type="button"
                  onClick={() => setEditing({ id: board.id, title: board.title })}
                  className="icon-button"
                  aria-label={`Renombrar tablero ${board.title}`}
                  title="Renombrar tablero"
                >
                  <PencilIcon />
                </button>
                {boards.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onDelete(board)}
                    className="icon-button danger"
                    aria-label={`Eliminar tablero ${board.title}`}
                    title="Eliminar tablero"
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      )}
      {editing?.id === null ? (
        editor("Nombre del nuevo tablero")
      ) : (
        <button
          type="button"
          onClick={() => setEditing({ id: null, title: "" })}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)]"
        >
          <PlusIcon />
          Nuevo tablero
        </button>
      )}
    </nav>
  );
};
