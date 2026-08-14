import { compileContent } from "@dwarven-depths/content-runtime";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  createShuttergateAttemptTelemetry,
  requireShuttergateAttemptTelemetry,
  serializeShuttergateAttemptTelemetry
} from "./shuttergate-attempt-telemetry.js";
import {
  createShuttergateCampaignAuthority,
  runShuttergateCampaignTransition
} from "./shuttergate-campaign.js";

describe("local Shuttergate telemetry browser parity", () => {
  it("creates and verifies canonical local telemetry", async () => {
    const content = await compileContent(shuttergateInput);
    const attempt = await runShuttergateCampaignTransition(
      content,
      createShuttergateCampaignAuthority()
    );
    const telemetry = await createShuttergateAttemptTelemetry(
      attempt.transition
    );
    const serialized = serializeShuttergateAttemptTelemetry(telemetry);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(
      await requireShuttergateAttemptTelemetry(JSON.parse(serialized))
    ).toEqual(telemetry);
    expect(telemetry.payloadChecksum).toBe(
      "1cda6edd4b98d1bf1b8aa0e812408319832fb4058f6387fcef8cedcb44d65a46"
    );
  }, 180_000);
});
