import { expect, test } from "@playwright/test";
import { registerUser, signIn, unique } from "./helpers";

test("rejects invalid credentials and logs out", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Usuario").fill("wrong");
  await page.getByLabel("Contraseña").fill("credentials");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByText("Usuario o contraseña incorrectos.")).toBeVisible();

  await signIn(page);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();

  // The session is gone on the server too, not just in the page.
  await page.reload();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});

test("a new user registers, gets a private starter board and no admin tools", async ({ page }) => {
  const username = unique("ana");
  await registerUser(page, username);

  await expect(page.getByRole("button", { name: /^Mi primer tablero/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.locator("article")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Usuarios" })).toBeHidden();
  await expect(page.getByRole("button", { name: /^Estudio Kanban/ })).toBeHidden();
  expect((await page.request.get("/api/boards/board-1")).status()).toBe(404);
});

test("registration validates the password length", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Regístrate" }).click();
  await page.getByLabel("Usuario").fill(unique("corta"));
  await page.getByLabel("Contraseña").fill("123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("La contraseña debe tener al menos 8 caracteres")).toBeVisible();
});

test("a user changes their password", async ({ page, browser }) => {
  const username = unique("pablo");
  await registerUser(page, username);

  await page.getByRole("button", { name: username }).click();
  await page.getByLabel("Contraseña actual").fill("secreto123");
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("nuevaclave1");
  await page.getByLabel("Repite la nueva contraseña").fill("nuevaclave1");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.getByRole("status")).toContainText("Contraseña actualizada");

  const other = await browser.newPage();
  await other.goto("/");
  await other.getByLabel("Usuario").fill(username);
  await other.getByLabel("Contraseña").fill("secreto123");
  await other.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(other.getByText("Usuario o contraseña incorrectos.")).toBeVisible();
  await signIn(other, username, "nuevaclave1");
  await other.close();
});

test("an administrator creates, promotes, resets and deletes users", async ({ page, browser }) => {
  const username = unique("maria");
  await signIn(page);
  await page.getByRole("button", { name: "Usuarios" }).click();
  await expect(page.getByRole("heading", { name: "Gestión de usuarios" })).toBeVisible();

  await page.getByLabel("Nombre del nuevo usuario").fill(username);
  await page.getByLabel("Contraseña del nuevo usuario").fill("password123");
  await page.getByRole("button", { name: "Crear usuario" }).click();
  const row = page.getByTestId(`user-${username}`);
  await expect(row).toContainText("Usuario");

  await row.getByRole("button", { name: `Hacer administrador a ${username}` }).click();
  await expect(row).toContainText("Administrador");

  await row.getByRole("button", { name: `Restablecer contraseña de ${username}` }).click();
  await row.getByLabel(`Nueva contraseña para ${username}`).fill("restablecida1");
  await row.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByRole("status")).toHaveText("Contraseña restablecida.");

  // The new admin can sign in with the reset password and sees the user tools.
  const other = await browser.newPage();
  await signIn(other, username, "restablecida1");
  await expect(other.getByRole("button", { name: "Usuarios" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: `Eliminar a ${username}` }).click();
  await expect(row).toBeHidden();

  // Deleting the user ended their session.
  await other.reload();
  await expect(other.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  await other.close();
});
