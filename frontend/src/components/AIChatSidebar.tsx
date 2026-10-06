import { useState, type FormEvent } from "react";

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
    <aside className="w-full rounded-[28px] border border-[var(--stroke)] bg-white/90 p-4 shadow-[var(--shadow)] backdrop-blur xl:max-w-[360px]">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--stroke)] pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--gray-text)]">
            AI assistant
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Project chat
          </h2>
        </div>
        <span className="inline-flex h-3 w-3 rounded-full bg-[var(--primary-blue)]" aria-label="AI connected" />
      </div>

      <div className="flex max-h-[580px] min-h-[360px] flex-col gap-3 overflow-y-auto pr-1">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[85%]"}
          >
            <div
              className={
                message.role === "user"
                  ? "rounded-2xl bg-[var(--secondary-purple)] px-3 py-2 text-sm text-white"
                  : "rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)]"
              }
            >
              {message.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="mr-auto max-w-[85%] rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--gray-text)]">
            Thinking…
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-[var(--stroke)] pt-4">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--gray-text)]" htmlFor="ai-message-input">
          Message to AI
        </label>
        <textarea
          id="ai-message-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder="Ask the board assistant to add, move, or rename cards..."
          className="w-full resize-none rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isLoading || !draft.trim()}
          className="inline-flex w-full items-center justify-center rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
    </aside>
  );
};
