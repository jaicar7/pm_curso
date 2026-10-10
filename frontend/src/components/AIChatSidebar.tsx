import { useState, type FormEvent } from "react";
import { SendIcon } from "@/components/Icons";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AIChatSidebarProps = {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (message: string) => Promise<void> | void;
};

export const AIChatSidebar = ({
  messages,
  isLoading,
  onSend,
}: AIChatSidebarProps) => {
  const [draft, setDraft] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isLoading) {
      return;
    }

    setDraft("");
    await onSend(trimmed);
  };

  return (
    <aside className="flex w-full flex-col rounded-2xl lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-6 2xl:flex border border-[var(--stroke)] bg-white/90 p-4 shadow-[var(--shadow)] backdrop-blur 2xl:h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--stroke)] pb-3 lg:col-span-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--gray-text)]">
            Asistente IA
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-[var(--navy-dark)]">
            Chat del proyecto
          </h2>
        </div>
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[var(--primary-blue)]" title="IA conectada" />
      </div>

      <div className="flex max-h-[420px] min-h-[240px] flex-1 lg:max-h-[300px] flex-col gap-2 overflow-y-auto py-3 pr-1 2xl:max-h-none">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[85%]"}
          >
            <div
              className={
                message.role === "user"
                  ? "whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--secondary-purple)] px-3 py-2 text-sm text-white"
                  : "whitespace-pre-wrap rounded-2xl rounded-bl-md border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)]"
              }
            >
              {message.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="mr-auto max-w-[85%] rounded-2xl rounded-bl-md border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--gray-text)]">
            Pensando…
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2 border-t border-[var(--stroke)] pt-3 lg:self-end lg:border-t-0 lg:pb-3 2xl:self-auto 2xl:border-t 2xl:pb-0">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--gray-text)]" htmlFor="ai-message-input">
          Mensaje para la IA
        </label>
        <textarea
          id="ai-message-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder="Pide al asistente que cree, mueva o renombre tarjetas..."
          className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isLoading || !draft.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <SendIcon />
          {isLoading ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </aside>
  );
};
