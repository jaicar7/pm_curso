import { vi } from "vitest";
import * as api from "@/lib/api";

const respond = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  }) as Response;

const mockFetch = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(status, body));

const lastCall = (fetchMock: ReturnType<typeof mockFetch>) => {
  const [path, options] = fetchMock.mock.calls.at(-1)!;
  return {
    path,
    method: options?.method ?? "GET",
    body: options?.body ? JSON.parse(options.body as string) : undefined,
  };
};

const apiCard = {
  id: "card-1",
  title: "Tarea",
  details: "Detalle",
  priority: "alta",
  due_date: "2030-01-01",
  position: 0,
  column_id: "col-1",
};

describe("api", () => {
  afterEach(() => vi.restoreAllMocks());

  it("converts the nested API board into board data", () => {
    const board = api.boardFromApi({
      id: "board-1",
      title: "Tablero",
      columns: [
        { id: "col-1", title: "Uno", position: 0, cards: [apiCard as never] },
        { id: "col-2", title: "Dos", position: 1, cards: [] },
      ],
    });

    expect(board.columns).toEqual([
      { id: "col-1", title: "Uno", cardIds: ["card-1"] },
      { id: "col-2", title: "Dos", cardIds: [] },
    ]);
    expect(board.cards["card-1"]).toEqual({
      id: "card-1",
      title: "Tarea",
      details: "Detalle",
      priority: "alta",
      due_date: "2030-01-01",
    });
  });

  it("raises ApiError with the server message and status", async () => {
    mockFetch(401, { detail: "No has iniciado sesión" });

    const error = await api.fetchMe().catch((caught) => caught);

    expect(error).toBeInstanceOf(api.ApiError);
    expect(error.message).toBe("No has iniciado sesión");
    expect(error.status).toBe(401);
  });

  it("uses a generic message for validation errors and empty bodies", async () => {
    mockFetch(422, { detail: [{ loc: ["body", "title"], msg: "too short" }] });
    await expect(api.createBoard("")).rejects.toThrow("No se pudo completar la operación.");

    mockFetch(500);
    await expect(api.listBoards()).rejects.toThrow("No se pudo completar la operación.");
  });

  it("returns undefined for 204 responses", async () => {
    mockFetch(204);

    await expect(api.deleteBoard("board-1")).resolves.toBeUndefined();
  });

  it.each([
    ["login", () => api.login("ana", "secreto123"), "/api/auth/login", "POST", { username: "ana", password: "secreto123" }],
    ["register", () => api.register("ana", "secreto123"), "/api/auth/register", "POST", { username: "ana", password: "secreto123" }],
    ["logout", () => api.logout(), "/api/auth/logout", "POST", undefined],
    ["fetchMe", () => api.fetchMe(), "/api/auth/me", "GET", undefined],
    [
      "changePassword",
      () => api.changePassword("vieja1234", "nueva1234"),
      "/api/auth/password",
      "PUT",
      { current_password: "vieja1234", new_password: "nueva1234" },
    ],
    ["listUsers", () => api.listUsers(), "/api/users", "GET", undefined],
    ["createUser", () => api.createUser("ana", "secreto123", true), "/api/users", "POST", { username: "ana", password: "secreto123", is_admin: true }],
    ["updateUser", () => api.updateUser("user-2", { is_admin: false }), "/api/users/user-2", "PATCH", { is_admin: false }],
    ["deleteUser", () => api.deleteUser("user-2"), "/api/users/user-2", "DELETE", undefined],
    ["listBoards", () => api.listBoards(), "/api/boards", "GET", undefined],
    ["createBoard", () => api.createBoard("Nuevo"), "/api/boards", "POST", { title: "Nuevo" }],
    ["renameBoard", () => api.renameBoard("board-1", "Otro"), "/api/boards/board-1", "PATCH", { title: "Otro" }],
    ["deleteBoard", () => api.deleteBoard("board-1"), "/api/boards/board-1", "DELETE", undefined],
    ["addColumn", () => api.addColumn("board-1", "Col"), "/api/boards/board-1/columns", "POST", { title: "Col" }],
    ["renameColumn", () => api.renameColumn("board-1", "col-1", "Col"), "/api/boards/board-1/columns/col-1", "PATCH", { title: "Col" }],
    ["deleteColumn", () => api.deleteColumn("board-1", "col-1"), "/api/boards/board-1/columns/col-1", "DELETE", undefined],
    ["deleteCard", () => api.deleteCard("board-1", "card-1"), "/api/boards/board-1/cards/card-1", "DELETE", undefined],
    [
      "moveCard",
      () => api.moveCard("board-1", "card-1", "col-2", 3),
      "/api/boards/board-1/cards/card-1/move",
      "POST",
      { column_id: "col-2", position: 3 },
    ],
    ["askBoardAssistant", () => api.askBoardAssistant("board-1", "Hola"), "/api/boards/board-1/ai", "POST", { message: "Hola" }],
  ])("%s calls the right endpoint", async (_name, call, path, method, body) => {
    const fetchMock = mockFetch(method === "DELETE" ? 204 : 200, {});

    await call();

    expect(lastCall(fetchMock)).toEqual({ path, method, body });
  });

  it("creates and updates cards, returning only card fields", async () => {
    const fetchMock = mockFetch(200, apiCard);
    const fields = { title: "Tarea", details: "Detalle", priority: "alta" as const, due_date: "2030-01-01" };

    const created = await api.createCard("board-1", "col-1", fields);
    expect(lastCall(fetchMock)).toEqual({ path: "/api/boards/board-1/columns/col-1/cards", method: "POST", body: fields });
    expect(created).toEqual({ id: "card-1", ...fields });

    const updated = await api.updateCard("board-1", "card-1", { priority: "alta" });
    expect(lastCall(fetchMock)).toEqual({ path: "/api/boards/board-1/cards/card-1", method: "PATCH", body: { priority: "alta" } });
    expect(updated).toEqual({ id: "card-1", ...fields });
  });

  it("fetches a board and converts it", async () => {
    mockFetch(200, { id: "board-1", title: "T", columns: [{ id: "col-1", title: "Uno", position: 0, cards: [apiCard] }] });

    const board = await api.fetchBoard("board-1");

    expect(board.columns[0].cardIds).toEqual(["card-1"]);
  });
});
