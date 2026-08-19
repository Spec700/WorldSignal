import { expect, test, type Page } from "@playwright/test";

import { eventBatchFixture } from "../fixtures/events";
import { gdacsGeometryFixture } from "../fixtures/gdacs-geometry";

function createStressBatch(eventCount = 600) {
  return {
    ...eventBatchFixture,
    events: Array.from({ length: eventCount }, (_, index) => {
      const longitude = -170 + (index % 68) * 5;
      const latitude = -60 + (index % 9) * 15;
      return {
        ...eventBatchFixture.events[0],
        id: `usgs:stress-${index}`,
        title: `M6.4 earthquake — deterministic stress event ${index}`,
        locationLabel: `Stress location ${index}`,
        centroid: { latitude, longitude },
        geometry: {
          type: "Point" as const,
          coordinates: [longitude, latitude] as [number, number],
        },
        sources: [
          {
            ...eventBatchFixture.events[0].sources[0],
            sourceEventId: `stress-${index}`,
          },
        ],
        revisionFingerprint: `stress-revision-${index}`,
      };
    }),
    sources: eventBatchFixture.sources.map((source) => ({
      ...source,
      eventCount: source.source === "usgs" ? eventCount : 0,
    })),
  };
}

async function mockSuccessfulSources(page: Page) {
  await page.route("**/api/events/hazards?*", async (route) => {
    await route.fulfill({
      body: JSON.stringify(eventBatchFixture),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/geometry/gdacs/**", async (route) => {
    await route.fulfill({
      body: JSON.stringify(gdacsGeometryFixture),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function loadFixtureBatch(page: Page) {
  const shellResponse = await page.goto("/");
  expect(shellResponse?.headers()["content-security-policy"]).toContain(
    "default-src 'self'",
  );
  await page
    .getByRole("button", { name: /load current events/i })
    .first()
    .click();
  await expect(page.locator("[data-event-row]")).toHaveCount(2);
  await expect(
    page.getByRole("img", { name: /interactive 3d earth/i }),
  ).toBeVisible();
}

test("manual retrieval, filters, range changes, and time scrubbing stay synchronized", async ({
  page,
}) => {
  await mockSuccessfulSources(page);
  const hazardRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/events/hazards")) {
      hazardRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /build the current hazard picture/i }),
  ).toBeVisible();
  await expect(page.getByText("Not requested")).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: /imagery: nasa/i }),
  ).toHaveAttribute("href", /earthobservatory\.nasa\.gov/);
  await expect(page.getByRole("link", { name: "USGS" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await expect(page.getByRole("link", { name: "GDACS" })).toHaveAttribute(
    "target",
    "_blank",
  );
  expect(hazardRequests).toHaveLength(0);

  await page.getByRole("button", { name: "24H" }).click();
  expect(hazardRequests).toHaveLength(0);
  await page
    .getByRole("button", { name: /load current events/i })
    .first()
    .click();

  await expect(page.locator("[data-event-row]")).toHaveCount(2);
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-event-count",
    "2",
  );
  await expect(page.locator(".timeline-tick")).toHaveCount(2);
  await expect(page.getByLabel("Event query summary")).toContainText("2 / 2");
  expect(hazardRequests).toHaveLength(1);
  expect(hazardRequests[0]).toContain("window=24h");

  await page
    .getByRole("button", { name: /earthquake, 1 at current time/i })
    .click();
  await expect(page.locator("[data-event-row]")).toHaveCount(1);
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-event-count",
    "1",
  );
  await expect(page.locator(".timeline-tick")).toHaveCount(1);
  await expect(page.getByLabel("Event query summary")).toContainText("1 / 2");
  expect(hazardRequests).toHaveLength(1);

  await page
    .getByRole("button", { name: /earthquake, 1 at current time/i })
    .click();
  const slider = page.getByRole("slider", { name: /time cursor/i });
  await slider.fill(String(Date.parse("2026-08-17T00:00:00.000Z")));
  await expect(page.locator("[data-event-row]")).toHaveCount(1);
  await expect(page.locator(".timeline-tick")).toHaveCount(2);
  await expect(page.locator(".timeline-tick.is-visible")).toHaveCount(1);
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-event-count",
    "1",
  );
  expect(hazardRequests).toHaveLength(1);

  await page.getByRole("button", { name: "Now" }).click();
  await expect(page.locator("[data-event-row]")).toHaveCount(2);

  await page.getByRole("button", { name: "30D" }).click();
  await expect.poll(() => hazardRequests.length).toBe(2);
  expect(hazardRequests[1]).toContain("window=30d");
  await page.waitForTimeout(350);
  expect(hazardRequests).toHaveLength(2);
});

test("browser snapshots survive reloads and only explicit refresh retrieves again", async ({
  page,
}) => {
  await mockSuccessfulSources(page);
  const hazardRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/events/hazards")) {
      hazardRequests.push(request.url());
    }
  });

  await page.goto("/worldsignal");
  await page
    .getByRole("button", { name: /load current events/i })
    .first()
    .click();
  await expect(page.locator("[data-event-row]")).toHaveCount(2);
  await expect(page.getByLabel("Browser snapshot status")).toContainText(
    "7D · Stored locally",
  );
  expect(hazardRequests).toHaveLength(1);

  await page.reload();
  await expect(page.locator("[data-event-row]")).toHaveCount(2);
  await expect(page.getByLabel("Browser snapshot status")).toContainText(
    "7D · Restored locally",
  );
  expect(hazardRequests).toHaveLength(1);

  await page.goto("about:blank");
  await page.goto("/worldsignal");
  await expect(page.locator("[data-event-row]")).toHaveCount(2);
  expect(hazardRequests).toHaveLength(1);

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => hazardRequests.length).toBe(2);
  await expect(page.getByLabel("Browser snapshot status")).toContainText(
    "7D · Stored locally",
  );
});

test("list selection opens authoritative evidence and validated detail geometry", async ({
  page,
}) => {
  await mockSuccessfulSources(page);
  await loadFixtureBatch(page);

  const cycloneRow = page.getByRole("button", {
    name: /tropical cyclone: tropical cyclone example/i,
  });
  await cycloneRow.click();

  await expect(cycloneRow).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Tropical Cyclone Example" }),
  ).toBeVisible();
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-focused-event-id",
    eventBatchFixture.events[1].id,
  );
  await expect(
    page.getByText(/3 validated geometry features rendered/i),
  ).toBeVisible();
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-detail-path-count",
    "1",
  );
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-detail-polygon-count",
    "1",
  );

  const reportLink = page.getByRole("link", { name: /open original report/i });
  await expect(reportLink).toHaveAttribute("target", "_blank");
  await expect(reportLink).toHaveAttribute("rel", "noopener noreferrer");
});

test("a real globe marker reselects the matching keyboard stream row", async ({
  page,
}) => {
  await mockSuccessfulSources(page);
  await loadFixtureBatch(page);

  const earthquakeRow = page.getByRole("button", {
    name: /earthquake: m6\.4 earthquake/i,
  });
  await earthquakeRow.click();
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-focused-event-id",
    eventBatchFixture.events[0].id,
  );
  await page.waitForTimeout(950);

  await page.keyboard.press("Escape");
  await expect(earthquakeRow).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".globe-shell")).not.toHaveAttribute(
    "data-focused-event-id",
    /.+/,
  );

  const canvas = page.getByRole("img", { name: /interactive 3d earth/i });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    Math.round((bounds?.x ?? 0) + (bounds?.width ?? 2) / 2),
    Math.round((bounds?.y ?? 0) + (bounds?.height ?? 2) / 2),
  );
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.mouse.up();

  await expect(earthquakeRow).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-focused-event-id",
    eventBatchFixture.events[0].id,
  );
});

test("partial source failure remains explicit while successful data stays usable", async ({
  page,
}) => {
  const partialBatch = {
    ...eventBatchFixture,
    events: [eventBatchFixture.events[0]],
    sources: [
      eventBatchFixture.sources[0],
      {
        source: "gdacs" as const,
        state: "error" as const,
        attemptedAt: "2026-08-18T10:00:00.000Z",
        completedAt: "2026-08-18T10:00:03.000Z",
        errorCode: "timeout" as const,
        safeMessage: "GDACS did not respond before the source deadline.",
      },
    ],
  };
  await page.route("**/api/events/hazards?*", async (route) => {
    await route.fulfill({
      body: JSON.stringify(partialBatch),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/");
  await page
    .getByRole("button", { name: /load current events/i })
    .first()
    .click();

  await expect(page.locator("[data-event-row]")).toHaveCount(1);
  await expect(
    page.getByText("1 source unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(
    page.getByText("GDACS did not respond before the source deadline."),
  ).toBeVisible();
});

test("keyboard selection and reduced-motion mode remove nonessential animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let releaseSource: (() => void) | undefined;
  let observeSourceRequest: (() => void) | undefined;
  const sourceRelease = new Promise<void>((resolve) => {
    releaseSource = resolve;
  });
  const sourceRequested = new Promise<void>((resolve) => {
    observeSourceRequest = resolve;
  });
  await page.route("**/api/events/hazards?*", async (route) => {
    observeSourceRequest?.();
    await sourceRelease;
    await route.fulfill({
      body: JSON.stringify(eventBatchFixture),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto("/");

  await page
    .getByRole("button", { name: /load current events/i })
    .first()
    .click();
  await sourceRequested;
  await expect(page.locator(".operational-stage")).toHaveClass(/is-refreshing/);
  const sweepDisplay = await page
    .locator(".operational-stage")
    .evaluate((element) => window.getComputedStyle(element, "::after").display);
  expect(sweepDisplay).toBe("none");
  releaseSource?.();

  const rows = page.locator("[data-event-row]");
  await expect(rows).toHaveCount(2);
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.getByRole("searchbox").press("Escape");
  await rows.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-focused-event-id",
    eventBatchFixture.events[0].id,
  );
  await page.keyboard.press("Escape");
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "false");
});

test("hundreds of events remain responsive during globe rotation and selection", async ({
  page,
}) => {
  const stressBatch = createStressBatch();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/events/hazards?*", async (route) => {
    await route.fulfill({
      body: JSON.stringify(stressBatch),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/");
  const loadStartedAt = Date.now();
  await page
    .getByRole("button", { name: /load current events/i })
    .first()
    .click();
  await expect(page.locator("[data-event-row]")).toHaveCount(600);
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-event-count",
    "600",
  );
  expect(Date.now() - loadStartedAt).toBeLessThan(6_000);

  const canvas = page.getByRole("img", { name: /interactive 3d earth/i });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const centerX = (bounds?.x ?? 0) + (bounds?.width ?? 2) / 2;
  const centerY = (bounds?.y ?? 0) + (bounds?.height ?? 2) / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 180, centerY + 35, { steps: 8 });
  await page.mouse.up();

  const firstRow = page.locator("[data-event-row]").first();
  const selectedId = await firstRow.getAttribute("data-event-id");
  const selectionStartedAt = Date.now();
  await firstRow.click();
  await expect(firstRow).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".globe-shell")).toHaveAttribute(
    "data-focused-event-id",
    selectedId ?? "",
  );
  expect(Date.now() - selectionStartedAt).toBeLessThan(2_000);
  expect(pageErrors).toEqual([]);
});
