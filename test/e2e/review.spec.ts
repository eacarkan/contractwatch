import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

function database(...args: string[]) {
  return execFileSync(
    "pnpm",
    ["exec", "tsx", "test/e2e/fixtures.ts", ...args],
    { encoding: "utf8" },
  ).trim();
}

let contractId: string;

test.beforeAll(() => {
  contractId = database("seed");
});

test.afterAll(() => {
  database("remove", contractId);
});

test("reviewing feeds the register, with every decision audited", async ({
  page,
}) => {
  const heading = page.getByRole("heading", { level: 2 }).first();
  const status = page.getByRole("status");
  const keysReady = page.locator("[data-keys-ready]");

  await page.goto(`/en/contracts/${contractId}/review`);
  await expect(page.getByRole("note")).toContainText(
    "Demonstration data — not a live contract.",
  );
  await expect(status).toHaveText("0 of 3 reviewed");
  await expect(heading).toHaveText("Première");
  await expect(page.locator("mark")).toHaveText(
    /^sous peine de forclusion, les présenter dans un délai$/,
  );

  await expect(keysReady).toBeVisible();
  await page.keyboard.press("c");
  await expect(status).toHaveText("1 of 3 reviewed");
  await expect(heading).toHaveText("Deuxième");

  await expect(keysReady).toBeVisible();
  await page.keyboard.press("e");
  await page.getByLabel("Title").fill("Deuxième, corrigée");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(status).toHaveText("2 of 3 reviewed");
  await expect(heading).toHaveText("Troisième");

  await expect(keysReady).toBeVisible();
  await page.keyboard.press("r");
  await expect(status).toHaveText("3 of 3 reviewed");
  await page.getByRole("link", { name: "Open the register" }).click();

  await expect(page.getByRole("status")).toHaveText("2 obligations");
  await expect(page.getByRole("link", { name: "Première" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Deuxième, corrigée" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Troisième" })).toHaveCount(0);

  await page.getByLabel("Status").selectOption("EDITED");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("status")).toHaveText("1 obligation");
  await expect(page.getByRole("link", { name: "Première" })).toHaveCount(0);

  const csv = await page.request.get(
    `/api/contracts/${contractId}/register/export?format=csv&locale=en&status=EDITED`,
  );
  const text = await csv.text();
  expect(csv.ok()).toBe(true);
  expect(text).toContain("Demonstration data — not a live contract.");
  expect(text).toContain("Deuxième, corrigée");
  expect(text).not.toContain("Première");

  const statuses = JSON.parse(database("revisions", contractId)) as string[];
  expect(statuses.sort()).toEqual(["CONFIRMED", "EDITED", "REJECTED"]);
});
