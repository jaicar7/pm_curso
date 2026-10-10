import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { UsersAdmin } from "@/components/UsersAdmin";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listUsers: vi.fn(),
  createUser: vi.fn(async () => undefined),
  updateUser: vi.fn(async () => undefined),
  deleteUser: vi.fn(async () => undefined),
}));

const mocked = vi.mocked(api);
const admin = { id: "user-1", username: "user", is_admin: true, created_at: "2030-01-01T00:00:00Z", board_count: 2 };
const ana = { id: "user-2", username: "ana", is_admin: false, created_at: "2030-02-01T00:00:00Z", board_count: 1 };

const renderAdmin = async () => {
  render(<UsersAdmin currentUser={admin} />);
  await screen.findByTestId("user-ana");
};

describe("UsersAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.listUsers.mockResolvedValue([admin, ana]);
  });

  it("lists users with role and board count", async () => {
    await renderAdmin();

    const row = screen.getByTestId("user-ana");
    expect(within(row).getByText("Usuario")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("user-user")).getByText("(tú)")).toBeInTheDocument();
  });

  it("does not let the admin demote or delete themselves", async () => {
    await renderAdmin();

    const self = screen.getByTestId("user-user");
    expect(within(self).getByRole("button", { name: "Quitar administrador a user" })).toBeDisabled();
    expect(within(self).getByRole("button", { name: "Eliminar a user" })).toBeDisabled();
  });

  it("creates a user and refreshes the list", async () => {
    await renderAdmin();

    await userEvent.type(screen.getByLabelText("Nombre del nuevo usuario"), " pedro ");
    await userEvent.type(screen.getByLabelText("Contraseña del nuevo usuario"), "secreto123");
    await userEvent.click(screen.getByLabelText("Administrador"));
    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(mocked.createUser).toHaveBeenCalledWith("pedro", "secreto123", true);
    expect(await screen.findByRole("status")).toHaveTextContent("Usuario creado.");
    expect(mocked.listUsers).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Nombre del nuevo usuario")).toHaveValue("");
  });

  it("shows server errors", async () => {
    mocked.createUser.mockRejectedValueOnce(new Error("Ese nombre de usuario ya existe"));
    await renderAdmin();

    await userEvent.type(screen.getByLabelText("Nombre del nuevo usuario"), "ana");
    await userEvent.type(screen.getByLabelText("Contraseña del nuevo usuario"), "secreto123");
    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ese nombre de usuario ya existe");
  });

  it("toggles administrator permissions", async () => {
    await renderAdmin();

    await userEvent.click(screen.getByRole("button", { name: "Hacer administrador a ana" }));

    expect(mocked.updateUser).toHaveBeenCalledWith("user-2", { is_admin: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Permisos concedidos.");
  });

  it("resets a password", async () => {
    await renderAdmin();

    await userEvent.click(screen.getByRole("button", { name: "Restablecer contraseña de ana" }));
    await userEvent.type(screen.getByLabelText("Nueva contraseña para ana"), "nuevaclave1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(mocked.updateUser).toHaveBeenCalledWith("user-2", { password: "nuevaclave1" });
    expect(await screen.findByRole("status")).toHaveTextContent("Contraseña restablecida.");
    expect(screen.queryByLabelText("Nueva contraseña para ana")).not.toBeInTheDocument();
  });

  it("cancels a password reset", async () => {
    await renderAdmin();

    await userEvent.click(screen.getByRole("button", { name: "Restablecer contraseña de ana" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Nueva contraseña para ana")).not.toBeInTheDocument();
    expect(mocked.updateUser).not.toHaveBeenCalled();
  });

  it("deletes a user only after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await renderAdmin();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar a ana" }));
    expect(mocked.deleteUser).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar a ana" }));
    await waitFor(() => expect(mocked.deleteUser).toHaveBeenCalledWith("user-2"));
    expect(confirm).toHaveBeenCalledWith("¿Eliminar a ana y todos sus tableros?");
    confirm.mockRestore();
  });
});
