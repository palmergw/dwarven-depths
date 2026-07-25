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
  attempts: readonly unknown[]
) {
  const stateChecksum = await canonicalHash({
    campaignId: artifact.campaignId,
    contentManifestHash: artifact.contentManifestHash,
    profile: artifact.profileSave.profile,
    rewardLedger: artifact.rewardLedger,
    attempts
  });
  const payload = {
    schemaVersion: 1,
    campaignId: artifact.campaignId,
    contentManifestHash: artifact.contentManifestHash,
    profileSave: artifact.profileSave,
    rewardLedger: artifact.rewardLedger,
    attempts,
    stateChecksum
  };
  return { ...payload, payloadChecksum: await canonicalHash(payload) };
}

describe("durable Shuttergate campaign artifact", () => {
  it("round-trips by replay, consumes handoff authority, and continues exactly once", async () => {
    const { content, first, artifact } = await oneAttemptArtifact();

    expect(await canonicalHash(artifact)).toBe(
      "d1d8cd088edc393086c0004aaae2017b65e773e97136c15e790c8dd9af64040f"
    );
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.attempts)).toBe(true);
    expect(Object.isFrozen(artifact.rewardLedger)).toBe(true);
    expect(Object.isFrozen(artifact.profileSave)).toBe(true);
    await expect(
      runShuttergateCampaignTransition(content, first.authority)
    ).rejects.toThrow("already consumed or in progress");

    const restored = await restoreShuttergateCampaignArtifact(
      content,
      artifact
    );
    expect(restored).toMatchObject({
      campaignId: "campaign.shuttergate.v1",
      profile: artifact.profileSave.profile,
      rewardLedger: artifact.rewardLedger
    });
    expect(restored.attempts).toEqual(artifact.attempts);
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
    const attempts = structuredClone(artifact.attempts) as unknown as Array<{
      seed: string;
    }>;
    const firstAttempt = attempts[0];
    if (firstAttempt === undefined) throw new Error("missing first attempt");
    firstAttempt.seed = "999";
    const substituted = await rechecksumArtifact(artifact, attempts);

    await expect(
      restoreShuttergateCampaignArtifact(content, substituted)
    ).rejects.toThrow("authoritative replay evidence");
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
        attempts: Array.from(
          { length: maximumShuttergateCampaignArtifactAttempts + 1 },
          () => artifact.attempts[0]
        )
      })
    ).rejects.toThrow(
      `cannot exceed ${maximumShuttergateCampaignArtifactAttempts}`
    );
  }, 45_000);
});
