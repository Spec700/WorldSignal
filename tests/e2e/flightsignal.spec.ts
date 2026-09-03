import { expect, test } from "@playwright/test";

test("FlightSignal panels resize and preserve the compact detail overlay", async ({
  page,
}) => {
  await page.goto("/flightsignal");
  await expect(
    page.getByRole("heading", { name: "Flight stream" }),
  ).toBeVisible();

  const queue = page.getByRole("complementary", { name: "Tracked flights" });
  const timeline = page.getByLabel("Selected flight timeline");
  const queueHandle = page.getByRole("separator", {
    name: "Resize flight stream",
  });
  const timelineHandle = page.getByRole("separator", {
    name: "Resize flight timeline",
  });
  const initialQueue = await queue.boundingBox();
  const initialTimeline = await timeline.boundingBox();

  await queueHandle.press("ArrowRight");
  await timelineHandle.press("ArrowUp");

  expect((await queue.boundingBox())?.width).toBe(
    (initialQueue?.width ?? 0) + 16,
  );
  expect((await timeline.boundingBox())?.height).toBe(
    (initialTimeline?.height ?? 0) + 16,
  );

  await page.getByRole("button", { name: "Track flight" }).click();
  const editor = page.getByRole("complementary", {
    name: "Track a flight",
  });
  const detailHandle = page.getByRole("separator", {
    name: "Resize flight detail panel",
  });
  const initialEditor = await editor.boundingBox();

  await detailHandle.press("ArrowLeft");

  expect((await editor.boundingBox())?.width).toBe(
    (initialEditor?.width ?? 0) + 16,
  );
  await expect(
    editor.getByText(/aircraft and traveler still require separate/i),
  ).toBeVisible();

  await page.setViewportSize({ height: 900, width: 1200 });

  await expect(detailHandle).toBeHidden();
  await expect(editor).toBeVisible();
  expect((await editor.boundingBox())?.width).toBeLessThanOrEqual(410);
});

test("FlightSignal starts without inventing a tracked flight", async ({
  page,
}) => {
  await page.goto("/flightsignal");

  const flightRows = page
    .getByRole("complementary", { name: "Tracked flights" })
    .locator("li");
  if ((await flightRows.count()) === 0) {
    await expect(page.getByText("No tracked flights")).toBeVisible();
    await expect(
      page.getByText(/assign a dated flight to a person/i),
    ).toBeVisible();
  }

  await expect(page.getByText(/ADSB\.lol · ODbL/)).toBeVisible();
  await expect(
    page.getByText(/person presence requires operator confirmation/i),
  ).toBeVisible();
});
