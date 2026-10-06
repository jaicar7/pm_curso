import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";

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
    deleteCard: vi.fn(async () => undefined),
    moveCard: vi.fn(async () => undefined),
  };
});

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", async () => {
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));
  });

  it("sends a prompt to the AI board assistant and shows the response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        response: "Done. I updated the board.",
        actions: [],
      }),
    } as Response);

    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));

    const input = screen.getByLabelText(/message to ai/i);
    await userEvent.type(input, "Add a card called Release review");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/board",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "Add a card called Release review" }),
        })
      )
    );
    expect(await screen.findByText("Done. I updated the board.")).toBeInTheDocument();

    fetchMock.mockRestore();
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
