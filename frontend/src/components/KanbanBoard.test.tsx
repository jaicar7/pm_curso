import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchBoard: vi.fn(),
    renameColumn: vi.fn(async () => undefined),
    addColumn: vi.fn(async (_boardId: string, title: string) => ({ id: "col-new", title, position: 5, cards: [] })),
    deleteColumn: vi.fn(async () => undefined),
    createCard: vi.fn(async (_boardId: string, _columnId: string, fields: api.CardFields) => ({
      id: "card-created",
      ...fields,
    })),
    updateCard: vi.fn(async (_boardId: string, cardId: string, fields: api.CardFields) => ({
      id: cardId,
      ...fields,
    })),
    deleteCard: vi.fn(async () => undefined),
    moveCard: vi.fn(async () => undefined),
    askBoardAssistant: vi.fn(),
  };
});

const mocked = vi.mocked(api);

const getColumn = (index: number) => screen.getAllByTestId(/^column-/)[index];

const renderBoard = async (onChange = vi.fn()) => {
  render(<KanbanBoard boardId="board-1" onChange={onChange} />);
  await waitFor(() => expect(screen.getAllByTestId(/^column-/)).toHaveLength(5));
  return onChange;
};

const sendAiMessage = async (message: string) => {
  await userEvent.type(screen.getByLabelText(/mensaje para la ia/i), message);
  await userEvent.click(screen.getByRole("button", { name: /enviar/i }));
};

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.fetchBoard.mockResolvedValue(structuredClone(initialData));
  });

  it("loads the requested board", async () => {
    await renderBoard();

    expect(mocked.fetchBoard).toHaveBeenCalledWith("board-1");
    expect(screen.getByText("Alinear los temas del roadmap")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    mocked.fetchBoard.mockRejectedValue(new Error("Tablero no encontrado"));

    render(<KanbanBoard boardId="missing" />);

    expect(await screen.findByText("Tablero no encontrado")).toBeInTheDocument();
  });

  it("sends a prompt to the board assistant, shows the response and reloads the board", async () => {
    mocked.askBoardAssistant.mockResolvedValue({ response: "Hecho. He actualizado el tablero.", actions: [] });
    const onChange = await renderBoard();

    await sendAiMessage("Crea una tarjeta llamada Revisión");

    expect(mocked.askBoardAssistant).toHaveBeenCalledWith("board-1", "Crea una tarjeta llamada Revisión");
    expect(await screen.findByText("Hecho. He actualizado el tablero.")).toBeInTheDocument();
    await waitFor(() => expect(mocked.fetchBoard).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the conversation across consecutive AI messages", async () => {
    mocked.askBoardAssistant
      .mockResolvedValueOnce({ response: "Primera respuesta", actions: [] })
      .mockResolvedValueOnce({ response: "Segunda respuesta", actions: [] });
    await renderBoard();

    await sendAiMessage("Primera pregunta");
    expect(await screen.findByText("Primera respuesta")).toBeInTheDocument();
    await sendAiMessage("Segunda pregunta");
    expect(await screen.findByText("Segunda respuesta")).toBeInTheDocument();

    for (const text of ["Primera pregunta", "Primera respuesta", "Segunda pregunta"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("shows an error when the AI request fails", async () => {
    mocked.askBoardAssistant.mockRejectedValue(new Error("La respuesta de la IA no contenía un objeto JSON"));
    await renderBoard();

    await sendAiMessage("Haz algo");

    expect(
      await screen.findByText("La IA no pudo procesar la petición. Inténtalo de nuevo.")
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("La respuesta de la IA no contenía un objeto JSON");
  });

  it("edits a card including priority and due date", async () => {
    const onChange = await renderBoard();

    await userEvent.click(screen.getByRole("button", { name: "Editar Alinear los temas del roadmap" }));
    const titleInput = screen.getByLabelText("Título de la tarjeta");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Temas del roadmap v2");
    await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
    await userEvent.type(screen.getByLabelText("Fecha límite"), "2030-05-20");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(mocked.updateCard).toHaveBeenCalledWith("board-1", "card-1", {
      title: "Temas del roadmap v2",
      details: "Redactar los temas trimestrales con su impacto esperado y sus métricas.",
      priority: "alta",
      due_date: "2030-05-20",
    });
    const card = await screen.findByTestId("card-card-1");
    expect(within(card).getByText("Temas del roadmap v2")).toBeInTheDocument();
    expect(within(card).getByText("Prioridad alta")).toBeInTheDocument();
    expect(within(card).getByText("20/05/2030")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalled();
  });

  it("cancels editing without saving", async () => {
    await renderBoard();

    await userEvent.click(screen.getByRole("button", { name: "Editar Alinear los temas del roadmap" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(mocked.updateCard).not.toHaveBeenCalled();
    expect(screen.getByText("Alinear los temas del roadmap")).toBeInTheDocument();
  });

  it("renames a column and saves it on blur", async () => {
    await renderBoard();
    const input = within(getColumn(0)).getByLabelText("Título de la columna");

    await userEvent.clear(input);
    await userEvent.type(input, "Nuevo nombre");
    await userEvent.tab();

    expect(input).toHaveValue("Nuevo nombre");
    expect(mocked.renameColumn).toHaveBeenCalledWith("board-1", "col-backlog", "Nuevo nombre");
  });

  it("adds and removes a card", async () => {
    await renderBoard();
    const column = getColumn(0);

    await userEvent.click(within(column).getByRole("button", { name: /nueva tarjeta/i }));
    await userEvent.type(within(column).getByPlaceholderText(/título de la tarjeta/i), "Tarjeta nueva");
    await userEvent.type(within(column).getByPlaceholderText(/detalles/i), "Notas");
    await userEvent.click(within(column).getByRole("button", { name: "Añadir" }));

    expect(mocked.createCard).toHaveBeenCalledWith("board-1", "col-backlog", {
      title: "Tarjeta nueva",
      details: "Notas",
      priority: "media",
      due_date: null,
    });
    expect(within(column).getByText("Tarjeta nueva")).toBeInTheDocument();

    await userEvent.click(within(column).getByRole("button", { name: /eliminar tarjeta nueva/i }));

    expect(mocked.deleteCard).toHaveBeenCalledWith("board-1", "card-created");
    expect(within(column).queryByText("Tarjeta nueva")).not.toBeInTheDocument();
  });

  it("fills empty details with a placeholder", async () => {
    await renderBoard();
    const column = getColumn(1);

    await userEvent.click(within(column).getByRole("button", { name: /nueva tarjeta/i }));
    await userEvent.type(within(column).getByPlaceholderText(/título de la tarjeta/i), "Solo título");
    await userEvent.click(within(column).getByRole("button", { name: "Añadir" }));

    expect(mocked.createCard).toHaveBeenCalledWith(
      "board-1",
      "col-discovery",
      expect.objectContaining({ details: "Sin detalles." })
    );
  });

  it("adds a column and deletes an empty one", async () => {
    await renderBoard();

    await userEvent.type(screen.getByLabelText("Título de la nueva columna"), "Bloqueado");
    await userEvent.click(screen.getByRole("button", { name: /añadir columna/i }));

    expect(mocked.addColumn).toHaveBeenCalledWith("board-1", "Bloqueado");
    const columns = await screen.findAllByTestId(/^column-/);
    expect(columns).toHaveLength(6);
    expect(within(columns[5]).getByText("Arrastra una tarjeta aquí")).toBeInTheDocument();

    await userEvent.click(within(columns[5]).getByRole("button", { name: "Eliminar columna Bloqueado" }));

    expect(mocked.deleteColumn).toHaveBeenCalledWith("board-1", "col-new");
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);
  });

  it("does not allow deleting a column that has cards", async () => {
    await renderBoard();

    expect(within(getColumn(0)).getByRole("button", { name: "Eliminar columna Pendientes" })).toBeDisabled();
  });

  it("reloads the board and shows the error when saving fails", async () => {
    mocked.deleteCard.mockRejectedValueOnce(new Error("Tarjeta no encontrada"));
    await renderBoard();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar Alinear los temas del roadmap" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tarjeta no encontrada");
    expect(mocked.fetchBoard).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Alinear los temas del roadmap")).toBeInTheDocument();
  });

  it("filters cards by text and priority", async () => {
    const board = structuredClone(initialData);
    board.cards["card-2"].priority = "alta";
    mocked.fetchBoard.mockResolvedValue(board);
    await renderBoard();

    await userEvent.type(screen.getByLabelText("Buscar tarjetas"), "roadmap");

    expect(screen.getByText("Alinear los temas del roadmap")).toBeInTheDocument();
    expect(screen.queryByText("Recoger señales de clientes")).not.toBeInTheDocument();
    expect(within(getColumn(0)).getByText("1 tarjeta oculta por el filtro")).toBeInTheDocument();
    // The count still shows every card in the column.
    expect(within(getColumn(0)).getByTitle("2 tarjetas")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    await userEvent.selectOptions(screen.getByLabelText("Filtrar por prioridad"), "alta");

    expect(screen.getByText("Recoger señales de clientes")).toBeInTheDocument();
    expect(screen.queryByText("Alinear los temas del roadmap")).not.toBeInTheDocument();
  });
});
