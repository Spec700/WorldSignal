import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventDossier } from "@/components/dossier/event-dossier";
import { earthquakeFixture, eventBatchFixture } from "../../fixtures/events";

afterEach(cleanup);

describe("EventDossier", () => {
  it("presents native evidence, explicit local/UTC times, provenance, and priority basis", () => {
    render(
      <EventDossier
        change="updated"
        event={earthquakeFixture}
        geometryState="idle"
        onClose={vi.fn()}
        onRetryGeometry={vi.fn()}
        sourceHealth={eventBatchFixture.sources}
      />,
    );

    expect(
      screen.getByRole("heading", { name: earthquakeFixture.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("Magnitude 6.4")).toBeInTheDocument();
    expect(screen.getByText("Depth")).toBeInTheDocument();
    expect(screen.getByText("35 km")).toBeInTheDocument();
    expect(screen.getAllByText(/\(UTC\)/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(earthquakeFixture.priorityBasis),
    ).toBeInTheDocument();

    const report = screen.getByRole("link", { name: /open original report/i });
    expect(report).toHaveAttribute("href", earthquakeFixture.sources[0].url);
    expect(report).toHaveAttribute("target", "_blank");
    expect(report).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders source summary as inert text rather than HTML", () => {
    const { container } = render(
      <EventDossier
        event={{
          ...earthquakeFixture,
          summary: '<img src=x onerror="alert(1)">Source text',
        }}
        geometryState="idle"
        onClose={vi.fn()}
        onRetryGeometry={vi.fn()}
        sourceHealth={eventBatchFixture.sources}
      />,
    );

    expect(
      screen.getByText('<img src=x onerror="alert(1)">Source text'),
    ).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
