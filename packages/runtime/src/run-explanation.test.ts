import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { runExplanationFixture } from "./run-explanation.fixture.js";
import {
  createRunExplanation,
  renderRunExplanationMarkdown
} from "./run-explanation.js";

describe("run explanation", () => {
  it("creates stable causal evidence independent of input order", async () => {
    const report = createRunExplanation(runExplanationFixture);
    expect(report.events.map((event) => event.eventId)).toEqual([
      "event.000000",
      "event.000001"
    ]);
    expect(report.events[0]).toMatchObject({
      eventType: "round.started",
      reasonCode: "SIM-LIFECYCLE-001",
      causes: [{ kind: "command", commandType: "confirmPreparation" }]
    });
    expect(await canonicalHash(report)).toBe(
      "a0190c4ad18684a217162e359c403437303c8b47fe47e447566d959ceb5a53b3"
    );
    expect(() =>
      createRunExplanation({
        ...runExplanationFixture,
        diagnostics: runExplanationFixture.diagnostics.slice(1)
      })
    ).toThrow("missing diagnostic for event: event.000001");
  });

  it("renders deterministic Markdown from the versioned report", () => {
    const markdown = renderRunExplanationMarkdown(
      createRunExplanation(runExplanationFixture)
    );
    expect(markdown).toContain(
      "`event.000000` emitted `round.started` under `SIM-LIFECYCLE-001`; caused by command #0 (confirmPreparation) at tick 0."
    );
    expect(markdown).toContain(
      "`event.000001` emitted `round.victory` under `SIM-VICTORY-001`; caused by event event.000000."
    );
    expect(markdown.endsWith("\n")).toBe(true);
  });
});
