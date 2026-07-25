import { describe, expect, it } from "vitest";
import { profileSaveParityEvidence } from "./profile-save.fixture.js";
import { normalizeProfileSaveEnvelope } from "./profile-save.js";

const checksum =
  "ea30204f2e5898aa0bce86fc470d3691b3e203079b2e6c30ae396cf81d049121";

describe("profile save browser parity", () => {
  it("matches the Node envelope and checksum evidence", async () => {
    const evidence = await profileSaveParityEvidence();
    expect(evidence.checksum).toBe(checksum);
    expect(await normalizeProfileSaveEnvelope(evidence.envelope)).toEqual(
      evidence.envelope
    );
  });
});
