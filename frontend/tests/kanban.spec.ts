import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
};

test("loads the kanban board", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
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

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/cards/card-1/move"));
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
});

test("renames a column and keeps it after reload", async ({ page }) => {
  await signIn(page);
  const titleInput = page.getByTestId("column-col-discovery").getByLabel("Column title");
  await titleInput.fill("Research");
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/columns/col-discovery"));
  await titleInput.blur();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect(page.getByTestId("column-col-discovery").getByLabel("Column title")).toHaveValue("Research");
});

test("edits a card and keeps it after reload", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-2");
  await card.getByRole("button", { name: "Edit Gather customer signals" }).click();
  await card.getByLabel("Edit card title").fill("Customer interviews");
  await card.getByLabel("Edit card details").fill("Talk to five customers.");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Customer interviews")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("card-card-2").getByText("Talk to five customers.")).toBeVisible();
});

test("rejects invalid credentials and logs out", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("wrong");
  await page.getByLabel("Password").fill("credentials");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
