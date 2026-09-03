import { expect, test } from "@playwright/test";

test("Home person panels resize and preserve the responsive overlay", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();

  await page
    .getByRole("button", { name: /^View / })
    .first()
    .click();

  const dossier = page.getByRole("complementary", {
    name: /person dossier/i,
  });
  const detailHandle = page.getByRole("separator", {
    name: "Resize person detail panel",
  });
  const initialDossier = await dossier.boundingBox();

  await detailHandle.press("ArrowLeft");

  expect((await dossier.boundingBox())?.width).toBe(
    (initialDossier?.width ?? 0) + 16,
  );

  await page.setViewportSize({ height: 900, width: 1200 });

  await expect(detailHandle).toBeHidden();
  await expect(dossier).toBeVisible();
  expect((await dossier.boundingBox())?.width).toBe(410);
});

test("Home globe roster resizes and returns to its compact split", async ({
  page,
}) => {
  await page.goto("/home/globe");
  await expect(
    page.getByRole("heading", { name: "People globe" }),
  ).toBeVisible();

  const roster = page.getByLabel(
    "People with approved locations and confirmed travel",
  );
  const rosterHandle = page.getByRole("separator", {
    name: "Resize people globe roster",
  });
  const initialRoster = await roster.boundingBox();

  await rosterHandle.press("ArrowRight");

  expect((await roster.boundingBox())?.width).toBe(
    (initialRoster?.width ?? 0) + 16,
  );

  await page.setViewportSize({ height: 900, width: 900 });

  await expect(rosterHandle).toBeHidden();
  await expect(roster).toBeVisible();
  expect((await roster.boundingBox())?.width).toBe(250);
});
