import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  createShuttergateCampaignAuthority,
  runShuttergateCampaignTransition
} from "./shuttergate-campaign.js";
import {
  createShuttergateCampaignArtifact,
  maximumShuttergateCampaignArtifactAttempts,
  restoreShuttergateCampaignArtifact,
  type ShuttergateCampaignArtifact
} from "./shuttergate-campaign-artifact.js";

async function oneAttemptArtifact() {
  const content = await compileContent(shuttergateInput);
  const initial = createShuttergateCampaignAuthority();
  const first = await runShuttergateCampaignTransition(content, initial);
  const artifact = await createShuttergateCampaignArtifact({
    schemaVersion: 1,
    content,
    authority: first.authority,
    applicationBuild: "test-build-141",
    writtenAtEpochMs: 1_721_900_000_000,
    profileId: "profile.local"
  });
  return { content, first, artifact };
}

async function rechecksumArtifact(
  artifact: ShuttergateCampaignArtifact,
  attemptChecksums: readonly string[]
) {
  const stateChecksum = await canonicalHash({
    campaignId: artifact.campaignId,
    contentManifestHash: artifact.contentManifestHash,
    profile: artifact.profileSave.profile,
    rewardLedgerChecksum: artifact.rewardLedgerChecksum,
    attemptChecksums
  });
  const payload = {
    schemaVersion: 1,
    campaignId: artifact.campaignId,
    contentManifestHash: artifact.contentManifestHash,
    profileSave: artifact.profileSave,
    rewardLedgerChecksum: artifact.rewardLedgerChecksum,
    attemptChecksums,
    stateChecksum
  };
  return { ...payload, payloadChecksum: await canonicalHash(payload) };
}

describe("durable Shuttergate campaign artifact", () => {
  it("round-trips by replay, consumes handoff authority, and continues exactly once", async () => {
    const { content, first, artifact } = await oneAttemptArtifact();

    expect(await canonicalHash(artifact)).toBe(
      "5bcf884631f0e0b9d9a8a323dc40a825de528195fc3f36fa441d43693327ac05"
    );
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.attemptChecksums)).toBe(true);
    expect(Object.isFrozen(artifact.profileSave)).toBe(true);
    expect(artifact.profileSave.contentVersion).toBe(
      content.bundle.contentVersion
    );
    await expect(
      runShuttergateCampaignTransition(content, first.authority)
    ).rejects.toThrow("already consumed or in progress");

    const restored = await restoreShuttergateCampaignArtifact(
      content,
      artifact
    );
    expect(restored).toMatchObject({
      campaignId: "campaign.shuttergate.v1",
      profile: artifact.profileSave.profile
    });
    expect(await canonicalHash(restored.rewardLedger)).toBe(
      artifact.rewardLedgerChecksum
    );
    expect(await canonicalHash(restored.attempts[0])).toBe(
      artifact.attemptChecksums[0]
    );
    const continued = await runShuttergateCampaignTransition(content, restored);
    expect(continued.transition).toMatchObject({
      attemptNumber: 2,
      attemptId: "attempt.shuttergate.campaign_000002",
      seed: "2"
    });
    await expect(
      restoreShuttergateCampaignArtifact(content, artifact)
    ).rejects.toThrow("already restored or in progress");
  }, 60_000);

  it("rejects checksummed attempt substitution after independent replay", async () => {
    const { content, artifact } = await oneAttemptArtifact();
    const substituted = await rechecksumArtifact(artifact, [
      await canonicalHash({
        schemaVersion: 1,
        substituted: "caller-authored-attempt"
      })
    ]);

    await expect(
      restoreShuttergateCampaignArtifact(content, substituted)
    ).rejects.toThrow("attempt 0 does not match authoritative replay evidence");
  }, 45_000);

  it("rejects envelope, content, shape, checksum, and bound tampering before replay", async () => {
    const { content, artifact } = await oneAttemptArtifact();
    await expect(
      restoreShuttergateCampaignArtifact(content, {
        ...artifact,
        profileSave: {
          ...artifact.profileSave,
          profile: { ...artifact.profileSave.profile, forgeOre: 999 }
        }
      })
    ).rejects.toThrow("payload checksum does not match");
    await expect(
      restoreShuttergateCampaignArtifact(content, {
        ...artifact,
        contentManifestHash: "0".repeat(64)
      })
    ).rejects.toThrow("does not match compiled content");
    await expect(
      restoreShuttergateCampaignArtifact(content, {
        ...artifact,
        payloadChecksum: "0".repeat(64)
      })
    ).rejects.toThrow("payload checksum does not match");
    await expect(
      restoreShuttergateCampaignArtifact(content, {
        ...artifact,
        unexpected: true
      })
    ).rejects.toThrow("must contain exactly");
    await expect(
      restoreShuttergateCampaignArtifact(content, {
        ...artifact,
        attemptChecksums: Array.from(
          { length: maximumShuttergateCampaignArtifactAttempts + 1 },
          () => artifact.attemptChecksums[0]
        )
      })
    ).rejects.toThrow(
      `cannot exceed ${maximumShuttergateCampaignArtifactAttempts}`
    );
    await expect(
      restoreShuttergateCampaignArtifact(content, {
        ...artifact,
        attemptChecksums: ["x".repeat(1_000_000)]
      })
    ).rejects.toThrow("lowercase SHA-256 hex digest");
  }, 45_000);

  it("validates pinned content even when the campaign has no attempts", async () => {
    const content = await compileContent(shuttergateInput);
    const authority = createShuttergateCampaignAuthority();
    const forged = {
      ...content,
      manifestHash: "0".repeat(64)
    } as never;
    await expect(
      createShuttergateCampaignArtifact({
        schemaVersion: 1,
        content: forged,
        authority,
        applicationBuild: "test-build-141",
        writtenAtEpochMs: 1_721_900_000_000,
        profileId: "profile.local"
      })
    ).rejects.toThrow("pinned reference content manifest");
    const artifact = await createShuttergateCampaignArtifact({
      schemaVersion: 1,
      content,
      authority,
      applicationBuild: "test-build-141",
      writtenAtEpochMs: 1_721_900_000_000,
      profileId: "profile.local"
    });
    expect(artifact.attemptChecksums).toEqual([]);
    await expect(
      restoreShuttergateCampaignArtifact(forged, artifact)
    ).rejects.toThrow("pinned reference content manifest");
  }, 45_000);
});
