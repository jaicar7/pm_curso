import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { fetchBoard, updateCard } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const { initialData } = await import("@/lib/kanban");
  return {
    fetchBoard: vi.fn(async () => initialData),
    renameColumn: vi.fn(async () => undefined),
    createCard: vi.fn(async (_columnId: string, title: string, details: string) => ({
      id: "card-created",
      title,
      details,
    })),
    updateCard: vi.fn(async (cardId: string, title: string, details: string) => ({
      id: cardId,
      title,
      details,
    })),
    deleteCard: vi.fn(async () => undefined),
    moveCard: vi.fn(async () => undefined),
  };
});

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const mockAiResponses = (...responses: Array<{ ok: boolean; body: unknown }>) => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  for (const { ok, body } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, json: async () => body } as Response);
  }
  return fetchMock;
};

const sendAiMessage = async (message: string) => {
  await userEvent.type(screen.getByLabelText(/message to ai/i), message);
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
};

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("renders five columns", async () => {
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));
  });

  it("sends a prompt to the AI board assistant, shows the response and reloads the board", async () => {
    const fetchMock = mockAiResponses({
      ok: true,
      body: { response: "Done. I updated the board.", actions: [] },
    });

    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));
    expect(fetchBoard).toHaveBeenCalledTimes(1);

    await sendAiMessage("Add a card called Release review");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/board",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Add a card called Release review" }),
      })
    );
    expect(await screen.findByText("Done. I updated the board.")).toBeInTheDocument();
    await waitFor(() => expect(fetchBoard).toHaveBeenCalledTimes(2));
  });

  it("keeps the conversation across consecutive AI messages", async () => {
    mockAiResponses(
      { ok: true, body: { response: "First answer", actions: [] } },
      { ok: true, body: { response: "Second answer", actions: [] } }
    );

    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));

    await sendAiMessage("First question");
    expect(await screen.findByText("First answer")).toBeInTheDocument();
    await sendAiMessage("Second question");
    expect(await screen.findByText("Second answer")).toBeInTheDocument();

    for (const text of ["First question", "First answer", "Second question"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("shows an error when the AI request fails", async () => {
    mockAiResponses({ ok: false, body: { detail: "AI response did not contain a JSON object" } });

    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));

    await sendAiMessage("Do something");

    expect(
      await screen.findByText("The AI could not process that request. Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("AI response did not contain a JSON object");
  });

  it("edits a card", async () => {
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));

    await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
    const titleInput = screen.getByLabelText("Edit card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Roadmap themes v2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateCard).toHaveBeenCalledWith(
      "card-1",
      "Roadmap themes v2",
      "Draft quarterly themes with impact statements and metrics."
    );
    expect(await screen.findByText("Roadmap themes v2")).toBeInTheDocument();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });
});
