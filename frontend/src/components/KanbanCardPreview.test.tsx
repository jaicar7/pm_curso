import { render, screen } from "@testing-library/react";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";

describe("KanbanCardPreview", () => {
  it("shows title, details and metadata while dragging", () => {
    render(
      <KanbanCardPreview
        card={{ id: "card-1", title: "Arrastrada", details: "En movimiento", priority: "baja", due_date: "2999-01-01" }}
      />
    );

    expect(screen.getByText("Arrastrada")).toBeInTheDocument();
    expect(screen.getByText("En movimiento")).toBeInTheDocument();
    expect(screen.getByText("Prioridad baja")).toBeInTheDocument();
    expect(screen.getByTitle("Fecha límite")).toHaveTextContent("01/01/2999");
  });

  it("omits empty details", () => {
    const { container } = render(
      <KanbanCardPreview card={{ id: "card-1", title: "Sola", details: "", priority: "media", due_date: null }} />
    );

    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
