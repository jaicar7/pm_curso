import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import * as api from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listBoards: vi.fn(),
  createBoard: vi.fn(),
  renameBoard: vi.fn(async () => undefined),
  deleteBoard: vi.fn(async () => undefined),
  fetchBoard: vi.fn(),
  listUsers: vi.fn(async () => []),
}));

const mocked = vi.mocked(api);
const admin = { id: "user-1", username: "user", is_admin: true, created_at: "2030-01-01T00:00:00Z" };
const summary = (id: string, title: string): api.BoardSummary => ({
  id,
  title,
  card_count: 0,
  created_at: "2030-01-01T00:00:00Z",
  updated_at: "2030-01-01T00:00:00Z",
});

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocked.listBoards.mockResolvedValue([summary("board-1", "Producto"), summary("board-2", "Marketing")]);
    mocked.fetchBoard.mockResolvedValue(structuredClone(initialData));
  });

  it("opens the first board and switches between boards", async () => {
    render(<AppShell user={admin} onLogout={vi.fn()} />);

    await waitFor(() => expect(mocked.fetchBoard).toHaveBeenCalledWith("board-1"));
    await userEvent.click(screen.getByRole("button", { name: /^Marketing/ }));

    await waitFor(() => expect(mocked.fetchBoard).toHaveBeenCalledWith("board-2"));
    expect(window.localStorage.getItem("pm-last-board")).toBe("board-2");
  });

  it("reopens the last used board", async () => {
    window.localStorage.setItem("pm-last-board", "board-2");

    render(<AppShell user={admin} onLogout={vi.fn()} />);

    await waitFor(() => expect(mocked.fetchBoard).toHaveBeenCalledWith("board-2"));
    expect(mocked.fetchBoard).not.toHaveBeenCalledWith("board-1");
  });

  it("creates a board and opens it", async () => {
    mocked.createBoard.mockResolvedValue(summary("board-3", "Ventas"));
    render(<AppShell user={admin} onLogout={vi.fn()} />);
    await screen.findByRole("button", { name: /^Producto/ });

    mocked.listBoards.mockResolvedValue([
      summary("board-1", "Producto"),
      summary("board-2", "Marketing"),
      summary("board-3", "Ventas"),
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo tablero" }));
    await userEvent.type(screen.getByLabelText("Nombre del nuevo tablero"), "Ventas{enter}");

    expect(mocked.createBoard).toHaveBeenCalledWith("Ventas");
    await waitFor(() => expect(mocked.fetchBoard).toHaveBeenCalledWith("board-3"));
  });

  it("deletes a board after confirmation and falls back to another", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AppShell user={admin} onLogout={vi.fn()} />);
    await screen.findByRole("button", { name: "Eliminar tablero Producto" });

    mocked.listBoards.mockResolvedValue([summary("board-2", "Marketing")]);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar tablero Producto" }));

    expect(mocked.deleteBoard).toHaveBeenCalledWith("board-1");
    await waitFor(() => expect(mocked.fetchBoard).toHaveBeenCalledWith("board-2"));
  });

  it("shows API errors from board operations", async () => {
    mocked.renameBoard.mockRejectedValueOnce(new Error("El título de el tablero no puede estar vacío"));
    render(<AppShell user={admin} onLogout={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Renombrar tablero Producto" }));
    await userEvent.type(screen.getByLabelText("Nuevo nombre del tablero"), "!{enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("no puede estar vacío");
  });

  it("signs out when the session has expired", async () => {
    mocked.listBoards.mockRejectedValue(new api.ApiError("No has iniciado sesión", 401));
    const onLogout = vi.fn();

    render(<AppShell user={admin} onLogout={onLogout} />);

    await waitFor(() => expect(onLogout).toHaveBeenCalled());
  });

  it("shows the users view only to administrators", async () => {
    const { unmount } = render(<AppShell user={admin} onLogout={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Usuarios" }));
    expect(await screen.findByRole("heading", { name: "Gestión de usuarios" })).toBeInTheDocument();
    unmount();

    render(<AppShell user={{ ...admin, is_admin: false }} onLogout={vi.fn()} />);
    await screen.findByRole("button", { name: /^Producto/ });
    expect(screen.queryByRole("button", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("opens the account view and logs out", async () => {
    const onLogout = vi.fn();
    render(<AppShell user={admin} onLogout={onLogout} />);

    await userEvent.click(await screen.findByRole("button", { name: "user" }));
    expect(screen.getByRole("heading", { name: "Cambiar contraseña" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(onLogout).toHaveBeenCalled();
  });
});
