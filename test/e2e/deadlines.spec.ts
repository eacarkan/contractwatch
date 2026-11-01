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
let waiting: string;

test.beforeAll(() => {
  ({ contractId, waiting } = JSON.parse(database("seed-deadlines")));
});

test.afterAll(() => {
  database("remove", contractId);
});

test("an event sets a due date, and a letter on time meets it", async ({
  page,
}) => {
  await page.goto(`/en/contracts/${contractId}/events`);
  await expect(page.getByRole("note")).toContainText(
    "Demonstration data — not a live contract.",
  );

  await page.getByLabel("What happened").fill("Instruction received");
  await page.getByLabel("Date", { exact: true }).first().fill("2025-03-04");
  await page.getByLabel(/8\.3 Give notice/).check();
  await page.getByRole("button", { name: "Record event" }).click();

  // 25 days from 4 March is Saturday 29 March, so CCAG art. 38.3 moves it to Monday.
  await expect(page.getByText("Mar 31, 2025")).toBeVisible();
  await expect(page.getByText(/Moved to the next working day/)).toBeVisible();
  await expect(page.getByText("Overdue")).toBeVisible();

  await page.getByRole("link", { name: "Correspondence" }).click();
  await page.getByLabel("Date sent").fill("2025-03-20");
  await page.getByLabel("Subject").fill("Notice of instruction");
  await page.getByRole("button", { name: "Log letter" }).click();
  await expect(
    page.getByRole("heading", { name: "Notice of instruction" }),
  ).toBeVisible();

  await page
    .getByLabel("Link to an obligation or due date")
    .selectOption({ label: "8.3 Give notice, due Mar 31, 2025" });
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByText("Deadline of Mar 31, 2025 met")).toBeVisible();

  await page.getByRole("link", { name: "Timeline" }).click();
  await page
    .getByLabel("Obligation")
    .selectOption({ label: "8.3 Give notice" });
  await page.getByRole("button", { name: "Show" }).click();
  const steps = page.getByRole("listitem").filter({ hasText: "2025" });
  await expect(steps.nth(0)).toContainText("Instruction received");
  await expect(steps.nth(1)).toContainText("Notice of instruction");
  await expect(steps.nth(2)).toContainText("Met");

  // Moving the event earlier makes the letter late, so the deadline reopens.
  await page.goto(`/en/contracts/${contractId}/events`);
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit this event" }),
  ).toBeVisible();
  await page.getByLabel("Date", { exact: true }).first().fill("2025-02-10");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Mar 7, 2025")).toBeVisible();
  await expect(page.getByText("Overdue")).toBeVisible();

  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(
    page.getByRole("heading", { name: "Overdue (1)" }),
  ).toBeVisible();
});

test("an outside reviewer's file decides under its own name", async ({
  page,
}) => {
  await page.goto(`/en/contracts/${contractId}/review`);

  const reviewPackage = await page.request.get(
    `/api/contracts/${contractId}/review/package`,
  );
  const { items } = (await reviewPackage.json()) as {
    items: { id: string; clause_text: string }[];
  };
  expect(items.map(({ id }) => id)).toEqual([waiting]);
  expect(items[0]!.clause_text).toContain("within 25 days");

  await page.getByLabel("Reviewer's file").setInputFiles({
    name: "reply.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        reviewer: "ChatGPT",
        decisions: [
          { id: waiting, decision: "EDITED", edit: { periodValue: 30 } },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "Import decisions" }).click();

  await expect(page.getByRole("status").first()).toContainText("2 of 2", {
    timeout: 15_000,
  });
  expect(JSON.parse(database("reviewed-by", waiting))).toEqual({
    status: "EDITED",
    by: "ChatGPT",
  });

  await page.goto(`/en/contracts/${contractId}/register`);
  await expect(page.getByRole("cell", { name: "ChatGPT" })).toBeVisible();
});
