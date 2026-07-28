import { describe, expect, it } from "vitest";
import {
  phase6AcceptanceEntries,
  renderPhase6ReleaseReadinessMarkdown,
  requirePhase6AcceptanceEntries
} from "./release-readiness.mjs";

const identity = Object.freeze({
  scenarioId: "campaign_scenario.shuttergate.v1",
  scenarioHash: "a".repeat(64),
  contentManifestHash: "b".repeat(64),
  campaignPayloadChecksum: "c".repeat(64),
  calibrationReportChecksum: "d".repeat(64)
});

function mutableEntries(): Array<Record<string, unknown>> {
  return Array.from(phase6AcceptanceEntries, (entry) => ({
    ...entry,
    evidence: Array.from(entry.evidence)
  })) as Array<Record<string, unknown>>;
}

function entryAt(
  entries: Array<Record<string, unknown>>,
  index: number
): Record<string, unknown> {
  const candidate = entries[index];
  if (candidate === undefined) throw new Error(`missing test entry ${index}`);
  return candidate;
}

describe("Phase 6 release readiness", () => {
  it("renders canonical implemented and blocked evidence without overstating replay rewards", () => {
    const first = renderPhase6ReleaseReadinessMarkdown(
      phase6AcceptanceEntries,
      identity
    );
    const second = renderPhase6ReleaseReadinessMarkdown(
      phase6AcceptanceEntries,
      identity
    );

    expect(second).toBe(first);
    expect(
      first.match(/^\| .* \| `(?:implemented|contract-blocked)` \|/gm)
    ).toHaveLength(18);
    expect(first.match(/`contract-blocked`/g)).toHaveLength(2);
    expect(first).toContain("duplicate-claim prevention only");
    expect(first).toContain("reference human replay remains blocked");
    expect(first).toContain("Terminal client/CLI parity remains blocked");
    expect(first).toContain(identity.campaignPayloadChecksum);
    expect(first.endsWith("\n")).toBe(true);
  });

  it("rejects missing, duplicate, reordered, unknown, and falsely passing entries", () => {
    expect(() =>
      requirePhase6AcceptanceEntries(phase6AcceptanceEntries.slice(1), {
        checkFiles: false
      })
    ).toThrow("incomplete");

    const reordered = mutableEntries().reverse();
    expect(() =>
      requirePhase6AcceptanceEntries(reordered, { checkFiles: false })
    ).toThrow("canonical unique order");

    const duplicate = mutableEntries();
    duplicate.splice(1, 1, entryAt(duplicate, 0));
    expect(() =>
      requirePhase6AcceptanceEntries(duplicate, { checkFiles: false })
    ).toThrow("canonical unique order");

    const unknown = mutableEntries();
    entryAt(unknown, 0).unexpected = true;
    expect(() =>
      requirePhase6AcceptanceEntries(unknown, { checkFiles: false })
    ).toThrow("invalid fields");

    const substitutedCriterion = mutableEntries();
    entryAt(substitutedCriterion, 0).criterion = "A different criterion.";
    expect(() =>
      requirePhase6AcceptanceEntries(substitutedCriterion, {
        checkFiles: false
      })
    ).toThrow("does not match source");

    const accessor = mutableEntries();
    Object.defineProperty(entryAt(accessor, 0), "criterion", {
      enumerable: true,
      get: () => "A new profile starts with only the Iron Warden."
    });
    expect(() =>
      requirePhase6AcceptanceEntries(accessor, { checkFiles: false })
    ).toThrow("invalid fields");

    const falselyPassing = mutableEntries();
    entryAt(falselyPassing, 11).status = "implemented";
    entryAt(falselyPassing, 11).evidence = ["docs/phase-6.md"];
    expect(() =>
      requirePhase6AcceptanceEntries(falselyPassing, { checkFiles: false })
    ).toThrow("status is not approved");
  });

  it("rejects invalid evidence paths, missing files, and identity substitution", () => {
    const foreignPath = mutableEntries();
    entryAt(foreignPath, 0).evidence = ["https://example.invalid/claim"];
    expect(() =>
      requirePhase6AcceptanceEntries(foreignPath, { checkFiles: false })
    ).toThrow("evidence is invalid");

    const missingPath = mutableEntries();
    entryAt(missingPath, 0).evidence = ["packages/missing.test.ts"];
    expect(() => requirePhase6AcceptanceEntries(missingPath)).toThrow(
      "evidence is missing"
    );

    const directoryPath = mutableEntries();
    entryAt(directoryPath, 0).evidence = ["docs/."];
    expect(() =>
      requirePhase6AcceptanceEntries(directoryPath, { checkFiles: false })
    ).toThrow("evidence is invalid");

    const accessorEvidence = mutableEntries();
    const evidence = ["packages/progression/src/index.test.ts"];
    Object.defineProperty(evidence, 0, {
      enumerable: true,
      get: () => "packages/progression/src/index.test.ts"
    });
    entryAt(accessorEvidence, 0).evidence = evidence;
    expect(() =>
      requirePhase6AcceptanceEntries(accessorEvidence, { checkFiles: false })
    ).toThrow("evidence is invalid");

    expect(() =>
      renderPhase6ReleaseReadinessMarkdown(phase6AcceptanceEntries, {
        ...identity,
        unexpected: true
      })
    ).toThrow("identity is invalid");
    expect(() =>
      renderPhase6ReleaseReadinessMarkdown(phase6AcceptanceEntries, {
        ...identity,
        scenarioHash: "not-a-hash"
      })
    ).toThrow("identity is invalid");
    expect(() =>
      renderPhase6ReleaseReadinessMarkdown(phase6AcceptanceEntries, {
        ...identity,
        scenarioId: "campaign_scenario.substituted.v1"
      })
    ).toThrow("scenario is not canonical");
  });
});
