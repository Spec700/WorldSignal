import { expect, test } from "@playwright/test";

test("CredSignal workspace panels resize and return to stacked behavior", async ({
  page,
}) => {
  await page.goto("/credsignal");
  await expect(
    page.getByRole("heading", { name: "People credential operations" }),
  ).toBeVisible();

  const activity = page.getByLabel("CredSignal activity timeline");
  const activityHandle = page.getByRole("separator", {
    name: "Resize case activity",
  });
  const initialActivity = await activity.boundingBox();

  await activityHandle.press("ArrowUp");

  expect((await activity.boundingBox())?.height).toBe(
    (initialActivity?.height ?? 0) + 16,
  );

  await page
    .getByRole("button", { name: /open credential operations for/i })
    .first()
    .click();

  const dossier = page.getByRole("complementary", {
    name: /credential dossier/i,
  });
  const detailHandle = page.getByRole("separator", {
    name: "Resize credential detail panel",
  });
  const initialDossier = await dossier.boundingBox();

  await detailHandle.press("ArrowLeft");

  expect((await dossier.boundingBox())?.width).toBe(
    (initialDossier?.width ?? 0) + 16,
  );

  await page.setViewportSize({ height: 900, width: 900 });

  await expect(activityHandle).toBeHidden();
  await expect(detailHandle).toBeHidden();
  await expect(dossier).toBeVisible();
  expect((await dossier.boundingBox())?.width).toBe(900);
});
