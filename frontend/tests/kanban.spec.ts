import { expect, test } from "@playwright/test";
import { signIn, unique } from "./helpers";

test("loads the seeded board", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Estudio Kanban" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Estudio Kanban/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("keeps the session after a reload", async ({ page }) => {
  await signIn(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card with priority and due date and keeps it after reload", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /nueva tarjeta/i }).click();
  await firstColumn.getByPlaceholder("Título de la tarjeta").fill("Tarjeta de Playwright");
  await firstColumn.getByPlaceholder("Detalles").fill("Añadida en e2e.");
  await firstColumn.getByLabel("Prioridad").selectOption("alta");
  await firstColumn.getByLabel("Fecha límite").fill("2020-01-15");
  const saved = page.waitForResponse((response) => response.url().endsWith("/cards") && response.request().method() === "POST");
  await firstColumn.getByRole("button", { name: "Añadir" }).click();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  const card = page.locator('[data-testid^="column-"]').first().locator("article", { hasText: "Tarjeta de Playwright" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Prioridad alta")).toBeVisible();
  await expect(card.getByText("15/01/2020 (vencida)")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, { steps: 12 });
  const saved = page.waitForResponse((response) => response.url().endsWith("/cards/card-1/move"));
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
});

test("renames a column and keeps it after reload", async ({ page }) => {
  await signIn(page);
  const titleInput = page.getByTestId("column-col-discovery").getByLabel("Título de la columna");
  await titleInput.fill("Investigación");
  const saved = page.waitForResponse((response) => response.url().endsWith("/columns/col-discovery"));
  await titleInput.blur();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect(page.getByTestId("column-col-discovery").getByLabel("Título de la columna")).toHaveValue("Investigación");
});

test("edits a card and keeps it after reload", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-2");
  await card.getByRole("button", { name: "Editar Recoger señales de clientes" }).click();
  await card.getByLabel("Título de la tarjeta").fill("Entrevistas con clientes");
  await card.getByLabel("Detalles de la tarjeta").fill("Hablar con cinco clientes.");
  await card.getByRole("button", { name: "Guardar" }).click();
  await expect(card.getByText("Entrevistas con clientes")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("card-card-2").getByText("Hablar con cinco clientes.")).toBeVisible();
});

test("searches and filters cards", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Buscar tarjetas").fill("marketing");
  await expect(page.getByText("Publicar la página de marketing")).toBeVisible();
  await expect(page.getByTestId("card-card-4")).toBeHidden();

  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.getByTestId("card-card-4")).toBeVisible();
});

test("manages several boards with their own columns and cards", async ({ page }) => {
  await signIn(page);
  const title = unique("Lanzamiento ");

  await page.getByRole("button", { name: "Nuevo tablero" }).click();
  await page.getByLabel("Nombre del nuevo tablero").fill(title);
  await page.getByLabel("Nombre del nuevo tablero").press("Enter");
  const tab = page.getByRole("button", { name: new RegExp(`^${title}`) });
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByTestId("card-card-1")).toBeHidden();

  // Add and remove a column on the new board.
  await page.getByLabel("Título de la nueva columna").fill("Bloqueado");
  await page.getByRole("button", { name: /añadir columna/i }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(6);
  await page.getByRole("button", { name: "Eliminar columna Bloqueado" }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  // A card on the new board updates the tab count and stays on this board only.
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /nueva tarjeta/i }).click();
  await firstColumn.getByPlaceholder("Título de la tarjeta").fill("Plan de lanzamiento");
  await firstColumn.getByRole("button", { name: "Añadir" }).click();
  await expect(tab).toContainText("1");

  await page.getByRole("button", { name: /^Estudio Kanban/ }).click();
  await expect(page.getByTestId("card-card-1")).toBeVisible();
  await expect(page.getByText("Plan de lanzamiento")).toBeHidden();

  // The last opened board is remembered.
  await tab.click();
  await page.reload();
  await expect(page.getByText("Plan de lanzamiento")).toBeVisible();

  // Rename and delete it.
  await page.getByRole("button", { name: `Renombrar tablero ${title}` }).click();
  await page.getByLabel("Nuevo nombre del tablero").fill(`${title} v2`);
  await page.getByLabel("Nuevo nombre del tablero").press("Enter");
  await expect(page.getByRole("button", { name: new RegExp(`^${title} v2`) })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Eliminar tablero ${title} v2` }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^${title}`) })).toBeHidden();
  await expect(page.getByTestId("card-card-1")).toBeVisible();
});
