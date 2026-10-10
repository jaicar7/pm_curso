import {
  formatDueDate,
  isOverdue,
  matchesFilter,
  moveCard,
  todayIso,
  type Card,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves a card to the end of its own column when dropped on the column", () => {
    const result = moveCard(baseColumns, "card-1", "col-a");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
    expect(result[1]).toBe(baseColumns[1]);
  });

  it("ignores unknown ids and drops onto itself", () => {
    expect(moveCard(baseColumns, "missing", "card-1")).toBe(baseColumns);
    expect(moveCard(baseColumns, "card-1", "missing")).toBe(baseColumns);
    expect(moveCard(baseColumns, "card-1", "card-1")).toBe(baseColumns);
  });

  it("leaves other columns untouched when moving between two columns", () => {
    const columns: Column[] = [...baseColumns, { id: "col-c", title: "C", cardIds: ["card-4"] }];
    const result = moveCard(columns, "card-3", "card-1");
    expect(result[0].cardIds).toEqual(["card-3", "card-1", "card-2"]);
    expect(result[1].cardIds).toEqual([]);
    expect(result[2]).toBe(columns[2]);
  });
});

describe("due dates", () => {
  it("formats dates in Spanish order", () => {
    expect(formatDueDate("2030-05-09")).toBe("09/05/2030");
  });

  it("detects overdue dates against today", () => {
    expect(isOverdue("2030-01-01", "2030-01-02")).toBe(true);
    expect(isOverdue("2030-01-02", "2030-01-02")).toBe(false);
    expect(isOverdue(null, "2030-01-02")).toBe(false);
  });

  it("computes today in the local time zone", () => {
    expect(todayIso(new Date(2030, 0, 31, 23, 30))).toBe("2030-01-31");
  });
});

describe("matchesFilter", () => {
  const card: Card = {
    id: "card-1",
    title: "Diseñar Logotipo",
    details: "Versión para móvil",
    priority: "alta",
    due_date: null,
  };

  it("matches everything with an empty filter", () => {
    expect(matchesFilter(card, { query: "  ", priority: "todas" })).toBe(true);
  });

  it("matches title and details ignoring case", () => {
    expect(matchesFilter(card, { query: "logotipo", priority: "todas" })).toBe(true);
    expect(matchesFilter(card, { query: "MÓVIL", priority: "todas" })).toBe(true);
    expect(matchesFilter(card, { query: "factura", priority: "todas" })).toBe(false);
  });

  it("filters by priority", () => {
    expect(matchesFilter(card, { query: "", priority: "alta" })).toBe(true);
    expect(matchesFilter(card, { query: "", priority: "baja" })).toBe(false);
    expect(matchesFilter(card, { query: "logo", priority: "baja" })).toBe(false);
  });
});
