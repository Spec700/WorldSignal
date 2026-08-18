import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorldSignalApp } from "@/components/worldsignal-app";
import { eventBatchFixture } from "../../fixtures/events";
import { gdacsGeometryFixture } from "../../fixtures/gdacs-geometry";

vi.mock("@/components/globe/world-globe", () => ({
  WorldGlobe: ({ events }: { events: unknown[] }) => (
    <div data-testid="mock-world-globe" data-event-count={events.length} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function loadButton() {
  return screen.getAllByRole("button", { name: /load current events/i })[0];
}

describe("WorldSignal application shell", () => {
  it("starts idle and performs no source request until the user asks", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<WorldSignalApp />);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: /build the current hazard picture/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not requested")).toHaveLength(2);
    expect(screen.getByText(/no polling will follow/i)).toBeInTheDocument();
  });

  it("loads one validated batch, exposes source health, filters locally, and synchronizes selection", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(eventBatchFixture));

    render(<WorldSignalApp />);
    await user.click(loadButton());

    const earthquakeRow = await screen.findByRole("button", {
      name: /earthquake: m6\.4 earthquake/i,
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(screen.getAllByText("Available")).toHaveLength(2);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tropical cyclone:/i }),
    ).toBeInTheDocument();

    await user.click(earthquakeRow);
    expect(earthquakeRow).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Selected event preview")).toHaveTextContent(
      "38.32°N",
    );

    const search = screen.getByRole("searchbox", {
      name: /search loaded events/i,
    });
    await user.type(search, "cyclone");

    expect(
      screen.queryByRole("button", { name: /earthquake: m6\.4 earthquake/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tropical cyclone:/i }),
    ).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("reports a partial source failure without hiding successful events", async () => {
    const user = userEvent.setup();
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(partialBatch),
    );

    render(<WorldSignalApp />);
    await user.click(loadButton());

    expect(
      await screen.findByRole("button", {
        name: /earthquake: m6\.4 earthquake/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 source unavailable")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("GDACS did not respond before the source deadline."),
    ).toBeInTheDocument();
  });

  it("opens authoritative evidence and fetches detail geometry only for a selected GDACS event", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(eventBatchFixture))
      .mockResolvedValueOnce(Response.json(gdacsGeometryFixture));

    render(<WorldSignalApp />);
    await user.click(loadButton());
    await user.click(
      await screen.findByRole("button", { name: /tropical cyclone:/i }),
    );

    expect(
      await screen.findByRole("heading", { name: "Tropical Cyclone Example" }),
    ).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe(
      "/api/geometry/gdacs/1001234?eventType=TC&episodeId=7",
    );
    expect(
      await screen.findByText(/3 validated geometry features rendered/i),
    ).toBeInTheDocument();

    const reportLink = screen.getByRole("link", {
      name: /open original report/i,
    });
    expect(reportLink).toHaveAttribute("target", "_blank");
    expect(reportLink).toHaveAttribute("rel", "noopener noreferrer");

    await user.click(
      screen.getByRole("button", { name: /close event dossier/i }),
    );
    expect(
      screen.queryByRole("heading", { name: "Tropical Cyclone Example" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the centroid and supports an explicit geometry retry after a route failure", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(eventBatchFixture))
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message:
                "Detailed geometry is unavailable for this event. The source centroid and report remain available.",
            },
          },
          { status: 502 },
        ),
      )
      .mockResolvedValueOnce(Response.json(gdacsGeometryFixture));

    render(<WorldSignalApp />);
    await user.click(loadButton());
    await user.click(
      await screen.findByRole("button", { name: /tropical cyclone:/i }),
    );

    expect(
      await screen.findByText(/detailed geometry is unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Selected event preview")).toHaveTextContent(
      "Tropical Cyclone Example",
    );

    await user.click(screen.getByRole("button", { name: /retry geometry/i }));
    expect(
      await screen.findByText(/3 validated geometry features rendered/i),
    ).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("marks retained events as previous while a manual refresh is active", async () => {
    const user = userEvent.setup();
    let resolveRefresh: ((response: Response) => void) | undefined;
    const pendingRefresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(eventBatchFixture))
      .mockReturnValueOnce(pendingRefresh);

    render(<WorldSignalApp />);
    await user.click(loadButton());
    const earthquakeRow = await screen.findByRole("button", {
      name: /earthquake: m6\.4 earthquake/i,
    });

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(earthquakeRow).toBeInTheDocument();
    expect(
      screen.getByText("Previous retrieval displayed"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Contacting")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /refreshing/i })).toBeDisabled();

    resolveRefresh?.(Response.json(eventBatchFixture));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled(),
    );
  });

  it("shows a blocking state and structured source failures when all sources fail", async () => {
    const user = userEvent.setup();
    const failedSources = eventBatchFixture.sources.map((source) => ({
      source: source.source,
      state: "error" as const,
      attemptedAt: "2026-08-18T10:00:00.000Z",
      completedAt: "2026-08-18T10:00:03.000Z",
      errorCode: "network" as const,
      safeMessage: `${source.source.toUpperCase()} could not be reached.`,
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          error: {
            code: "all_sources_unavailable",
            message: "WorldSignal could not retrieve any hazard source.",
            sources: failedSources,
          },
        },
        { status: 502 },
      ),
    );

    render(<WorldSignalApp />);
    await user.click(loadButton());

    expect(
      await screen.findByRole("heading", {
        name: /no current hazard data is available/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(
      screen.getAllByText("WorldSignal could not retrieve any hazard source."),
    ).toHaveLength(2);
  });

  it("supports search, refresh, row navigation, and selection keyboard commands", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(eventBatchFixture));

    render(<WorldSignalApp />);

    await user.keyboard("/");
    const search = screen.getByRole("searchbox", {
      name: /search loaded events/i,
    });
    expect(search).toHaveFocus();

    await user.keyboard("{Escape}");
    await user.click(document.body);
    await user.keyboard("r");
    const firstRow = await screen.findByRole("button", {
      name: /tropical cyclone:/i,
    });
    const secondRow = screen.getByRole("button", {
      name: /earthquake: m6\.4 earthquake/i,
    });
    expect(fetchSpy).toHaveBeenCalledOnce();

    firstRow.focus();
    await user.keyboard("{ArrowDown}");
    expect(secondRow).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(secondRow).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(secondRow).toHaveAttribute("aria-pressed", "false"),
    );
  });
});
