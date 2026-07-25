import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { migrateProfileSaveEnvelope } from "./profile-save-migration.js";
import { historicalProfileSaveV0Fixture } from "./profile-save-v0.fixture.js";

const migratedChecksum =
  "ea30204f2e5898aa0bce86fc470d3691b3e203079b2e6c30ae396cf81d049121";

describe("profile save migrations", () => {
  it("migrates the reviewed schema 0 fixture without changing profile semantics", async () => {
    const result = await migrateProfileSaveEnvelope(
      structuredClone(historicalProfileSaveV0Fixture)
    );

    expect(result.migratedFromSchemaVersion).toBe(0);
    expect(result.envelope.schemaVersion).toBe(1);
    expect(result.envelope.simulationProtocolVersion).toBe(1);
    expect(result.envelope.profileRevision).toBe(
      historicalProfileSaveV0Fixture.revision
    );
    expect(result.envelope.profile).toEqual(
      historicalProfileSaveV0Fixture.profile
    );
    expect(result.envelope.payloadChecksum).toBe(
      historicalProfileSaveV0Fixture.payloadChecksum
    );
    expect(await canonicalHash(result.envelope)).toBe(migratedChecksum);
  });

  it("is idempotent after the consecutive migration reaches current", async () => {
    const first = await migrateProfileSaveEnvelope(
      structuredClone(historicalProfileSaveV0Fixture)
    );
    const second = await migrateProfileSaveEnvelope(first.envelope);

    expect(second).toEqual({
      envelope: first.envelope,
      migratedFromSchemaVersion: null
    });
  });

  it("rejects malformed historical, corrupt, unknown, and newer saves", async () => {
    const corrupt = JSON.parse(
      JSON.stringify(historicalProfileSaveV0Fixture)
    ) as { profile: { forgeOre: number } };
    corrupt.profile.forgeOre += 1;
    await expect(migrateProfileSaveEnvelope(corrupt)).rejects.toThrow(
      "payload checksum does not match"
    );

    const unknown = {
      ...structuredClone(historicalProfileSaveV0Fixture),
      unexpected: true
    };
    await expect(migrateProfileSaveEnvelope(unknown)).rejects.toThrow(
      "must contain exactly"
    );

    await expect(
      migrateProfileSaveEnvelope({ schemaVersion: 2 })
    ).rejects.toThrow("unsupported newer schemaVersion");
    await expect(
      migrateProfileSaveEnvelope({ schemaVersion: -1 })
    ).rejects.toThrow("unsupported historical schemaVersion");
  });
});
