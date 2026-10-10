import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { BoardTabs } from "@/components/BoardTabs";
import type { BoardSummary } from "@/lib/api";

const board = (id: string, title: string, cardCount = 0): BoardSummary => ({
  id,
  title,
  card_count: cardCount,
  created_at: "2030-01-01T00:00:00Z",
  updated_at: "2030-01-01T00:00:00Z",
});

const boards = [board("board-1", "Producto", 8), board("board-2", "Marketing", 2)];

const renderTabs = (overrides: Partial<Parameters<typeof BoardTabs>[0]> = {}) => {
  const props = {
    boards,
    activeBoardId: "board-1",
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<BoardTabs {...props} />);
  return props;
};

describe("BoardTabs", () => {
  it("lists boards with card counts and marks the active one", () => {
    renderTabs();

    const active = screen.getByRole("button", { name: /^Producto/ });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveTextContent("8");
    expect(screen.getByRole("button", { name: /^Marketing/ })).not.toHaveAttribute("aria-current");
  });

  it("selects a board", async () => {
    const props = renderTabs();

    await userEvent.click(screen.getByRole("button", { name: /^Marketing/ }));

    expect(props.onSelect).toHaveBeenCalledWith("board-2");
  });

  it("creates a board", async () => {
    const props = renderTabs();

    await userEvent.click(screen.getByRole("button", { name: "Nuevo tablero" }));
    await userEvent.type(screen.getByLabelText("Nombre del nuevo tablero"), "  Ventas  {enter}");

    expect(props.onCreate).toHaveBeenCalledWith("Ventas");
    expect(screen.queryByLabelText("Nombre del nuevo tablero")).not.toBeInTheDocument();
  });

  it("ignores empty names and can cancel", async () => {
    const props = renderTabs();

    await userEvent.click(screen.getByRole("button", { name: "Nuevo tablero" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar tablero" }));
    expect(props.onCreate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Nuevo tablero" })).toBeInTheDocument();
  });

  it("renames the active board", async () => {
    const props = renderTabs();

    await userEvent.click(screen.getByRole("button", { name: "Renombrar tablero Producto" }));
    const input = screen.getByLabelText("Nuevo nombre del tablero");
    expect(input).toHaveValue("Producto");
    await userEvent.clear(input);
    await userEvent.type(input, "Producto 2026");
    await userEvent.click(screen.getByRole("button", { name: "Guardar tablero" }));

    expect(props.onRename).toHaveBeenCalledWith("board-1", "Producto 2026");
  });

  it("deletes the active board but never the only one", async () => {
    const props = renderTabs();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar tablero Producto" }));
    expect(props.onDelete).toHaveBeenCalledWith(boards[0]);
  });

  it("hides delete when there is a single board", () => {
    renderTabs({ boards: [boards[0]] });

    expect(screen.queryByRole("button", { name: /Eliminar tablero/ })).not.toBeInTheDocument();
  });
});
