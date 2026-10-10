import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AccountPanel } from "@/components/AccountPanel";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  changePassword: vi.fn(async () => undefined),
}));

const mocked = vi.mocked(api);
const user = { id: "user-2", username: "ana", is_admin: false, created_at: "2030-02-01T00:00:00Z" };

const fill = async (current: string, next: string, confirm: string) => {
  await userEvent.type(screen.getByLabelText("Contraseña actual"), current);
  await userEvent.type(screen.getByLabelText("Nueva contraseña"), next);
  await userEvent.type(screen.getByLabelText("Repite la nueva contraseña"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
};

describe("AccountPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the account details", () => {
    render(<AccountPanel user={user} />);

    expect(screen.getByRole("heading", { name: "ana" })).toBeInTheDocument();
    expect(screen.getByText("Usuario")).toBeInTheDocument();
    expect(screen.getByText(new Date(user.created_at).toLocaleDateString("es-ES"))).toBeInTheDocument();
  });

  it("changes the password", async () => {
    render(<AccountPanel user={user} />);

    await fill("vieja1234", "nueva1234", "nueva1234");

    expect(mocked.changePassword).toHaveBeenCalledWith("vieja1234", "nueva1234");
    expect(await screen.findByRole("status")).toHaveTextContent("Contraseña actualizada.");
    expect(screen.getByLabelText("Contraseña actual")).toHaveValue("");
  });

  it("checks that both new passwords match", async () => {
    render(<AccountPanel user={user} />);

    await fill("vieja1234", "nueva1234", "otra12345");

    expect(screen.getByRole("alert")).toHaveTextContent("Las contraseñas nuevas no coinciden.");
    expect(mocked.changePassword).not.toHaveBeenCalled();
  });

  it("shows server errors", async () => {
    mocked.changePassword.mockRejectedValueOnce(new Error("La contraseña actual no es correcta"));
    render(<AccountPanel user={user} />);

    await fill("mala", "nueva1234", "nueva1234");

    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña actual no es correcta");
  });
});
