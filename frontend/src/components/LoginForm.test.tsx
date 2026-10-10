import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LoginForm } from "@/components/LoginForm";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  login: vi.fn(),
  register: vi.fn(),
}));

const mocked = vi.mocked(api);
const user = { id: "user-1", username: "user", is_admin: true, created_at: "2030-01-01T00:00:00Z" };

const fill = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Usuario"), username);
  await userEvent.type(screen.getByLabelText("Contraseña"), password);
};

describe("LoginForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signs in with the API", async () => {
    mocked.login.mockResolvedValue(user);
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await fill("user", "password");
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(mocked.login).toHaveBeenCalledWith("user", "password");
    expect(onLogin).toHaveBeenCalledWith(user);
  });

  it("shows the server error on bad credentials", async () => {
    mocked.login.mockRejectedValue(new api.ApiError("Usuario o contraseña incorrectos.", 401));
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await fill("user", "mala");
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos.");
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("switches to registration and creates an account", async () => {
    mocked.register.mockResolvedValue({ ...user, username: "ana", is_admin: false });
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await userEvent.click(screen.getByRole("button", { name: "Regístrate" }));
    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeInTheDocument();
    expect(screen.getByText("Al menos 8 caracteres.")).toBeInTheDocument();

    await fill("ana", "secreto123");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(mocked.register).toHaveBeenCalledWith("ana", "secreto123");
    expect(mocked.login).not.toHaveBeenCalled();
    expect(onLogin).toHaveBeenCalled();
  });

  it("clears the error when switching mode", async () => {
    mocked.register.mockRejectedValue(new Error("Ese nombre de usuario ya existe"));
    render(<LoginForm onLogin={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Regístrate" }));
    await fill("user", "secreto123");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese nombre de usuario ya existe");

    await userEvent.click(screen.getByRole("button", { name: "Inicia sesión" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeInTheDocument();
  });
});
