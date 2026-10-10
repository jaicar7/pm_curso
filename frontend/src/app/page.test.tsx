import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import Home from "@/app/page";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(async () => undefined),
  listBoards: vi.fn(async () => []),
}));

const mocked = vi.mocked(api);
const user = { id: "user-1", username: "user", is_admin: true, created_at: "2030-01-01T00:00:00Z" };

describe("Home", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the login form when there is no session", async () => {
    mocked.fetchMe.mockRejectedValue(new api.ApiError("No has iniciado sesión", 401));

    render(<Home />);

    expect(screen.getByText("Cargando...")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("restores an existing session and logs out through the API", async () => {
    mocked.fetchMe.mockResolvedValue(user);

    render(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

    expect(mocked.logout).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("enters the app after signing in", async () => {
    mocked.fetchMe.mockRejectedValue(new api.ApiError("No has iniciado sesión", 401));
    mocked.login.mockResolvedValue(user);
    render(<Home />);

    await userEvent.type(await screen.findByLabelText("Usuario"), "user");
    await userEvent.type(screen.getByLabelText("Contraseña"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(mocked.listBoards).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Estudio Kanban" })).toBeInTheDocument();
  });
});
