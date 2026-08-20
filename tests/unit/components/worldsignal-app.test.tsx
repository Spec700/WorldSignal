import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorldSignalApp } from "@/components/worldsignal-app";
import type { PersonDto } from "@/features/people/types";
import { earthquakeFixture, eventBatchFixture } from "../../fixtures/events";
import { gdacsGeometryFixture } from "../../fixtures/gdacs-geometry";

vi.mock("@/components/globe/world-globe", () => ({
  WorldGlobe: ({
    events,
    people,
  }: {
    events: unknown[];
    people: unknown[];
  }) => (
    <div
      data-testid="mock-world-globe"
      data-event-count={events.length}
      data-person-count={people.length}
    />
  ),
}));

const personFixture: PersonDto = {
  id: "person-1",
  displayName: "Avery Chen",
  organization: "Northstar Labs",
  tier: "critical",
  status: "active",
  identities: [],
  location: {
    id: "location-current",
    label: "London, United Kingdom",
    latitude: 51.5072,
    longitude: -0.1276,
    precision: "city",
    isActive: true,
    effectiveFrom: "2026-08-18T12:00:00.000Z",
  },
  locationHistory: [
    {
      id: "location-current",
      label: "London, United Kingdom",
      latitude: 51.5072,
      longitude: -0.1276,
      precision: "city",
      isActive: true,
      effectiveFrom: "2026-08-18T12:00:00.000Z",
    },
    {
      id: "location-previous",
      label: "New York, NY",
      latitude: 40.7128,
      longitude: -74.006,
      precision: "city",
      isActive: false,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveTo: "2026-08-18T12:00:00.000Z",
    },
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-18T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function loadButton() {
  return (
    await screen.findAllByRole("button", {
      name: /load current events/i,
    })
  )[0];
}

describe("WorldSignal application shell", () => {
  it("starts idle and performs no source request until the user asks", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<WorldSignalApp />);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", {
        name: /build the current hazard picture/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not requested")).toHaveLength(3);
    expect(screen.getByText(/no polling will follow/i)).toBeInTheDocument();
  });

  it("shows people independently of hazard retrieval and resolves their location at the timeline cursor", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(eventBatchFixture),
    );

    render(<WorldSignalApp people={[personFixture]} />);

    expect(
      await screen.findByRole("button", {
        name: /avery chen.*london, united kingdom/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-world-globe")).toHaveAttribute(
      "data-person-count",
      "1",
    );

    await user.click(
      screen.getByRole("button", {
        name: /avery chen.*london, united kingdom/i,
      }),
    );
    expect(screen.getByLabelText("Selected person preview")).toHaveTextContent(
      "London, United Kingdom",
    );

    await user.click(await loadButton());
    await screen.findByRole("button", {
      name: /earthquake: m6\.4 earthquake/i,
    });

    expect(
      screen.getByRole("button", { name: /avery chen.*new york, ny/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Selected person preview")).toHaveTextContent(
      "New York, NY",
    );
  });

  it("uses a pre-load window choice on the first request without fetching early", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(eventBatchFixture));

    render(<WorldSignalApp />);
    await loadButton();
    await user.click(screen.getByRole("button", { name: "24H" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "24H" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(await loadButton());
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/events/hazards?window=24h");
  });

  it("retrieves a changed source window exactly once after data is loaded", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(eventBatchFixture));

    render(<WorldSignalApp />);
    await user.click(await loadButton());
    await screen.findByRole("button", {
      name: /earthquake: m6\.4 earthquake/i,
    });
    await user.click(screen.getByRole("button", { name: "30D" }));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/events/hazards?window=30d");
  });

  it("loads one validated batch, exposes source health, filters locally, and synchronizes selection", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(eventBatchFixture));

    render(<WorldSignalApp />);
    await user.click(await loadButton());

    const earthquakeRow = await screen.findByRole("button", {
      name: /earthquake: m6\.4 earthquake/i,
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(screen.getAllByText("Available")).toHaveLength(3);
    expect(screen.getAllByText(/attempted aug 18/i)).toHaveLength(3);
    expect(screen.getAllByText(/source updated aug 18/i)).toHaveLength(2);
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

  it("scrubs temporal visibility locally and keeps globe, stream, and counts aligned", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(eventBatchFixture));

    render(<WorldSignalApp />);
    await user.click(await loadButton());
    await screen.findByRole("button", {
      name: /earthquake: m6\.4 earthquake/i,
    });

    fireEvent.change(screen.getByRole("slider", { name: /time cursor/i }), {
      target: { value: Date.parse("2026-08-17T00:00:00.000Z") },
    });

    expect(
      screen.queryByRole("button", { name: /earthquake: m6\.4 earthquake/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tropical cyclone:/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-world-globe")).toHaveAttribute(
      "data-event-count",
      "1",
    );
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /earthquake, 0 at current time/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /tropical cyclone, 1 at current time/i,
      }),
    ).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("distinguishes time-cursor exclusions from category filters", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(eventBatchFixture),
    );

    render(<WorldSignalApp />);
    await user.click(await loadButton());
    await screen.findByRole("button", {
      name: /earthquake: m6\.4 earthquake/i,
    });

    fireEvent.change(screen.getByRole("slider", { name: /time cursor/i }), {
      target: { value: Date.parse("2026-08-17T00:00:00.000Z") },
    });
    await user.click(
      screen.getByRole("button", {
        name: /tropical cyclone, 1 at current time/i,
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: /matching events exist elsewhere in the loaded interval/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 matching event is outside/i),
    ).toBeInTheDocument();
  });

  it("clears a selection consistently when a local filter hides it", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(eventBatchFixture));

    render(<WorldSignalApp />);
    await user.click(await loadButton());
    await user.click(
      await screen.findByRole("button", {
        name: /earthquake: m6\.4 earthquake/i,
      }),
    );
    expect(
      screen.getByRole("heading", {
        name: /m6\.4 earthquake/i,
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /earthquake, 1 at current time/i,
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: /m6\.4 earthquake/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText(/selected event is hidden/i)).not.toHaveLength(
      0,
    );
    expect(screen.getByTestId("mock-world-globe")).toHaveAttribute(
      "data-event-count",
      "1",
    );
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
    await user.click(await loadButton());

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

  it("keeps last-known-good events visible and marks their source degraded", async () => {
    const user = userEvent.setup();
    const partialBatch = {
      ...eventBatchFixture,
      generatedAt: "2026-08-18T11:00:00.000Z",
      requestedRange: {
        from: "2026-08-11T11:00:00.000Z",
        to: "2026-08-18T11:00:00.000Z",
      },
      events: [earthquakeFixture],
      sources: eventBatchFixture.sources.map((source) =>
        source.source === "gdacs"
          ? {
              source: "gdacs" as const,
              state: "error" as const,
              attemptedAt: "2026-08-18T10:59:58.000Z",
              completedAt: "2026-08-18T11:00:00.000Z",
              errorCode: "timeout" as const,
              safeMessage: "GDACS page 4 timed out.",
            }
          : source,
      ),
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(eventBatchFixture))
      .mockResolvedValueOnce(Response.json(partialBatch));

    render(<WorldSignalApp />);
    await user.click(await loadButton());
    await screen.findByRole("button", { name: /tropical cyclone:/i });
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByRole("button", { name: /tropical cyclone:/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 source degraded")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(
      screen.getByText(/1 retained event · last good/i),
    ).toBeInTheDocument();
    expect(screen.getByText("GDACS page 4 timed out.")).toBeInTheDocument();
  });

  it("opens authoritative evidence and fetches detail geometry only for a selected GDACS event", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(eventBatchFixture))
      .mockResolvedValueOnce(Response.json(gdacsGeometryFixture));

    render(<WorldSignalApp />);
    await user.click(await loadButton());
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
    await user.click(await loadButton());
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
    await user.click(await loadButton());
    const earthquakeRow = await screen.findByRole("button", {
      name: /earthquake: m6\.4 earthquake/i,
    });

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(earthquakeRow).toBeInTheDocument();
    expect(
      screen.getByText("Previous retrieval displayed"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Contacting")).toHaveLength(3);
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
    await user.click(await loadButton());

    expect(
      await screen.findByRole("heading", {
        name: /no current hazard data is available/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(3);
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
    await loadButton();

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
