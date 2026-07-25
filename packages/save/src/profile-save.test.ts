import { canonicalHash } from "@dwarven-depths/contracts";
import { createInitialProfile } from "@dwarven-depths/progression";
import { describe, expect, it } from "vitest";
import { profileSaveParityEvidence } from "./profile-save.fixture.js";
import {
  createProfileSaveEnvelope,
  normalizeProfileSaveEnvelope
} from "./profile-save.js";

const checksum =
  "ea30204f2e5898aa0bce86fc470d3691b3e203079b2e6c30ae396cf81d049121";

describe("profile save envelope", () => {
  it("creates a canonical detached envelope and validates its checksum", async () => {
    const evidence = await profileSaveParityEvidence();
    expect(evidence.roundTrip).toEqual(evidence.envelope);
    expect(evidence.checksum).toBe(checksum);
    expect(await canonicalHash(evidence.envelope)).toBe(checksum);
    expect(Object.isFrozen(evidence.envelope)).toBe(true);
    expect(Object.isFrozen(evidence.envelope.profile)).toBe(true);
  });

  it("rejects checksum, revision, schema, protocol, and unknown-field tampering", async () => {
    const { envelope } = await profileSaveParityEvidence();
    const copy = () =>
      JSON.parse(JSON.stringify(envelope)) as {
        profile: { forgeOre: number };
        profileRevision: number;
        schemaVersion: number;
        simulationProtocolVersion: number;
        unexpected?: boolean;
      };

    const checksumTamper = copy();
    checksumTamper.profile.forgeOre += 1;
    await expect(normalizeProfileSaveEnvelope(checksumTamper)).rejects.toThrow(
      "payload checksum does not match"
    );

    const revisionTamper = copy();
    revisionTamper.profileRevision = 3;
    await expect(normalizeProfileSaveEnvelope(revisionTamper)).rejects.toThrow(
      "must match the profile payload revision"
    );

    const schemaTamper = copy();
    schemaTamper.schemaVersion = 2;
    await expect(normalizeProfileSaveEnvelope(schemaTamper)).rejects.toThrow(
      "unsupported schemaVersion"
    );

    const protocolTamper = copy();
    protocolTamper.simulationProtocolVersion = 2;
    await expect(normalizeProfileSaveEnvelope(protocolTamper)).rejects.toThrow(
      "unsupported simulationProtocolVersion"
    );

    const unknownField = copy();
    unknownField.unexpected = true;
    await expect(normalizeProfileSaveEnvelope(unknownField)).rejects.toThrow(
      "must contain exactly"
    );
  });

  it("validates creation metadata before producing an envelope", async () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    await expect(
      createProfileSaveEnvelope({
        contentVersion: "bad version",
        applicationBuild: "build-1",
        writtenAtEpochMs: 0,
        profileId: "profile.local",
        profile
      })
    ).rejects.toThrow("portable version characters");
    await expect(
      createProfileSaveEnvelope({
        contentVersion: "content.v1",
        applicationBuild: "build-1",
        writtenAtEpochMs: 0,
        profileId: "local",
        profile
      })
    ).rejects.toThrow("stable profile ID");
  });
});
