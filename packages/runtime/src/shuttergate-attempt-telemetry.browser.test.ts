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
      "9fa6c4b07b5fdd77e2bc93aa5d99219dda26665ac28b98a3c3a618d52d2c86fc"
    );
  }, 45_000);
});
