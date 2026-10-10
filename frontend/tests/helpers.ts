import { expect, type Page } from "@playwright/test";

export const signIn = async (page: Page, username = "user", password = "password") => {
  await page.goto("/");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
};

export const registerUser = async (page: Page, username: string, password = "secreto123") => {
  await page.goto("/");
  await page.getByRole("button", { name: "Regístrate" }).click();
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
};

// Tests in a run share one database, so names must be unique.
export const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
