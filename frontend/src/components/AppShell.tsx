"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { AccountPanel } from "@/components/AccountPanel";
import { BoardTabs } from "@/components/BoardTabs";
import { KanbanBoard } from "@/components/KanbanBoard";
import { UsersAdmin } from "@/components/UsersAdmin";
import { BoardIcon, LogoutIcon, UserIcon, UsersIcon } from "@/components/Icons";
import {
  ApiError,
  createBoard,
  deleteBoard,
  listBoards,
  renameBoard,
  type BoardSummary,
  type User,
} from "@/lib/api";

type View = "boards" | "users" | "account";

const lastBoardKey = "pm-last-board";

// Remembering the last board is a convenience only; storage may be unavailable.
const readLastBoard = () => {
  try {
    return window.localStorage.getItem(lastBoardKey);
  } catch {
    return null;
  }
};

const writeLastBoard = (boardId: string) => {
  try {
    window.localStorage.setItem(lastBoardKey, boardId);
  } catch {
    // Ignore: the app works without remembering the board.
  }
};

type AppShellProps = {
  user: User;
  onLogout: () => void;
};

export const AppShell = ({ user, onLogout }: AppShellProps) => {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [view, setView] = useState<View>("boards");
  const [error, setError] = useState<string | null>(null);

  const refreshBoards = useCallback(
    () =>
      listBoards().then(
        (next) => {
          setBoards(next);
          setActiveBoardId((current) => {
            const preferred = current ?? readLastBoard();
            return next.some((board) => board.id === preferred) ? preferred : (next[0]?.id ?? null);
          });
        },
        (loadError) => {
          if (loadError instanceof ApiError && loadError.status === 401) {
            onLogout();
            return;
          }
          setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los tableros.");
        }
      ),
    [onLogout]
  );

  useEffect(() => {
    void refreshBoards();
  }, [refreshBoards]);

  const run = async (operation: () => Promise<void>) => {
    setError(null);
    try {
      await operation();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "No se pudo completar la operación.");
    }
  };

  const selectBoard = (boardId: string) => {
    setActiveBoardId(boardId);
    writeLastBoard(boardId);
    setView("boards");
  };

  const handleCreate = (title: string) =>
    run(async () => {
      const board = await createBoard(title);
      await refreshBoards();
      selectBoard(board.id);
    });

  const handleRename = (boardId: string, title: string) =>
    run(async () => {
      await renameBoard(boardId, title);
      await refreshBoards();
    });

  const handleDelete = (board: BoardSummary) =>
    run(async () => {
      if (!window.confirm(`¿Eliminar el tablero "${board.title}" y todas sus tarjetas?`)) return;
      await deleteBoard(board.id);
      setActiveBoardId(null);
      await refreshBoards();
    });

  const navButton = (target: View, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setView(target)}
      aria-current={view === target ? "page" : undefined}
      className={clsx(
        "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
        view === target
          ? "bg-[var(--navy-dark)] text-white"
          : "text-[var(--navy-dark)] hover:bg-[var(--surface)]"
      )}
      title={label}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex max-w-[1920px] flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-5 py-3 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex shrink-0 items-center gap-3">
            <span className="h-9 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
                Gestión de proyectos
              </p>
              <h1 className="font-display text-xl font-semibold text-[var(--navy-dark)]">Estudio Kanban</h1>
            </div>
          </div>

          <BoardTabs
            boards={boards}
            activeBoardId={view === "boards" ? activeBoardId : null}
            onSelect={selectBoard}
            onCreate={handleCreate}
            onRename={handleRename}
            onDelete={handleDelete}
          />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {navButton("boards", "Tableros", <BoardIcon />)}
            {user.is_admin ? navButton("users", "Usuarios", <UsersIcon />) : null}
            {navButton("account", user.username, <UserIcon />)}
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
              onClick={onLogout}
              type="button"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogoutIcon />
              <span className="hidden lg:inline">Cerrar sesión</span>
            </button>
          </div>
        </header>

        {error ? (
          <p
            className="rounded-xl border border-[var(--secondary-purple)]/30 bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--secondary-purple)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {view === "users" && user.is_admin ? <UsersAdmin currentUser={user} /> : null}
        {view === "account" ? <AccountPanel user={user} /> : null}
        {view === "boards" && activeBoardId ? (
          <KanbanBoard key={activeBoardId} boardId={activeBoardId} onChange={refreshBoards} />
        ) : null}
      </main>
    </div>
  );
};
