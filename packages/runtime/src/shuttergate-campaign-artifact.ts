import type { CompiledContent } from "@dwarven-depths/content-runtime";
import { canonicalHash, type StableId } from "@dwarven-depths/contracts";
import {
  maximumProfileRecords,
  requireProfileArray,
  requireProfileRecord
} from "@dwarven-depths/progression";
import {
  createProfileSaveEnvelope,
  normalizeProfileSaveEnvelope,
  type ProfileSaveEnvelope
} from "@dwarven-depths/save";
import {
  createShuttergateCampaignAuthority,
  reserveShuttergateCampaignAuthority,
  runShuttergateCampaignTransition,
  type ShuttergateCampaignAttemptEvidence,
  type ShuttergateCampaignAuthority
} from "./shuttergate-campaign.js";

const campaignId = "campaign.shuttergate.v1" as StableId;
const checksumPattern = /^[a-f0-9]{64}$/;

export const maximumShuttergateCampaignArtifactAttempts = 64;

export interface ShuttergateCampaignArtifact {
  readonly schemaVersion: 1;
  readonly campaignId: StableId;
  readonly contentManifestHash: string;
  readonly profileSave: ProfileSaveEnvelope;
  readonly rewardLedger: ShuttergateCampaignAuthority["rewardLedger"];
  readonly attempts: readonly ShuttergateCampaignAttemptEvidence[];
  readonly stateChecksum: string;
  readonly payloadChecksum: string;
}

export interface CreateShuttergateCampaignArtifactRequest {
  readonly schemaVersion: 1;
  readonly content: CompiledContent;
  readonly authority: ShuttergateCampaignAuthority;
  readonly applicationBuild: string;
  readonly writtenAtEpochMs: number;
  readonly profileId: string;
}

type RestoredStateStatus = "in_progress" | "consumed";
const restoredCampaignStates = new Map<string, RestoredStateStatus>();

function requireChecksum(value: unknown, description: string): string {
  if (typeof value !== "string" || !checksumPattern.test(value))
    throw new RangeError(
      `${description} must be a lowercase SHA-256 hex digest`
    );
  return value;
}

function requireManifestHash(value: unknown): string {
  return requireChecksum(value, "campaign artifact contentManifestHash");
}

function requireBoundedAttempts(
  value: unknown
): readonly ShuttergateCampaignAttemptEvidence[] {
  const attempts = requireProfileArray(value, "campaign artifact attempts");
  if (attempts.length > maximumShuttergateCampaignArtifactAttempts)
    throw new RangeError(
      `campaign artifact attempts cannot exceed ${maximumShuttergateCampaignArtifactAttempts}`
    );
  return Object.freeze([
    ...attempts
  ]) as readonly ShuttergateCampaignAttemptEvidence[];
}

function requireBoundedLedger(
  value: unknown
): ShuttergateCampaignAuthority["rewardLedger"] {
  const source = requireProfileRecord(
    value,
    ["schemaVersion", "claims"],
    "campaign artifact rewardLedger"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "campaign artifact rewardLedger has unsupported schemaVersion"
    );
  const claims = requireProfileArray(
    source.claims,
    "campaign artifact rewardLedger claims"
  );
  if (
    claims.length > maximumShuttergateCampaignArtifactAttempts ||
    claims.length > maximumProfileRecords
  )
    throw new RangeError(
      `campaign artifact rewardLedger claims cannot exceed ${maximumShuttergateCampaignArtifactAttempts}`
    );
  return Object.freeze({
    schemaVersion: 1,
    claims: Object.freeze([...claims])
  }) as ShuttergateCampaignAuthority["rewardLedger"];
}

function statePayload(
  contentManifestHash: string,
  profileSave: ProfileSaveEnvelope,
  rewardLedger: ShuttergateCampaignAuthority["rewardLedger"],
  attempts: readonly ShuttergateCampaignAttemptEvidence[]
) {
  return Object.freeze({
    campaignId,
    contentManifestHash,
    profile: profileSave.profile,
    rewardLedger,
    attempts
  });
}

function artifactPayload(
  contentManifestHash: string,
  profileSave: ProfileSaveEnvelope,
  rewardLedger: ShuttergateCampaignAuthority["rewardLedger"],
  attempts: readonly ShuttergateCampaignAttemptEvidence[],
  stateChecksum: string
) {
  return Object.freeze({
    schemaVersion: 1 as const,
    campaignId,
    contentManifestHash,
    profileSave,
    rewardLedger,
    attempts,
    stateChecksum
  });
}

/**
 * Creates a durable handoff and consumes the in-memory authority on success.
 * A failed creation releases the authority for retry.
 */
export async function createShuttergateCampaignArtifact(
  request: CreateShuttergateCampaignArtifactRequest
): Promise<ShuttergateCampaignArtifact> {
  const source = requireProfileRecord(
    request,
    [
      "schemaVersion",
      "content",
      "authority",
      "applicationBuild",
      "writtenAtEpochMs",
      "profileId"
    ],
    "campaign artifact creation request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "campaign artifact creation request has unsupported schemaVersion"
    );
  const content = source.content as CompiledContent;
  const authority = source.authority as ShuttergateCampaignAuthority;
  const reservation = reserveShuttergateCampaignAuthority(authority);
  try {
    const attempts = requireBoundedAttempts(authority.attempts);
    const contentManifestHash = requireManifestHash(content.manifestHash);
    const profileSave = await createProfileSaveEnvelope({
      contentVersion: contentManifestHash,
      applicationBuild: source.applicationBuild as string,
      writtenAtEpochMs: source.writtenAtEpochMs as number,
      profileId: source.profileId as string,
      profile: authority.profile
    });
    const rewardLedger = requireBoundedLedger(authority.rewardLedger);
    const stateChecksum = await canonicalHash(
      statePayload(contentManifestHash, profileSave, rewardLedger, attempts)
    );
    const payload = artifactPayload(
      contentManifestHash,
      profileSave,
      rewardLedger,
      attempts,
      stateChecksum
    );
    const artifact = Object.freeze({
      ...payload,
      payloadChecksum: await canonicalHash(payload)
    });
    reservation.commit();
    return artifact;
  } catch (error) {
    reservation.release();
    throw error;
  }
}

/**
 * Restores one process-local authority only after replaying every persisted
 * attempt. The same campaign state cannot be restored twice in this process.
 */
export async function restoreShuttergateCampaignArtifact(
  content: CompiledContent,
  value: unknown
): Promise<ShuttergateCampaignAuthority> {
  const source = requireProfileRecord(
    value,
    [
      "schemaVersion",
      "campaignId",
      "contentManifestHash",
      "profileSave",
      "rewardLedger",
      "attempts",
      "stateChecksum",
      "payloadChecksum"
    ],
    "campaign artifact"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError("campaign artifact has unsupported schemaVersion");
  if (source.campaignId !== campaignId)
    throw new RangeError("campaign artifact has unsupported campaignId");
  const contentManifestHash = requireManifestHash(source.contentManifestHash);
  if (contentManifestHash !== content.manifestHash)
    throw new RangeError(
      "campaign artifact contentManifestHash does not match compiled content"
    );
  const profileSave = await normalizeProfileSaveEnvelope(source.profileSave);
  if (profileSave.contentVersion !== contentManifestHash)
    throw new RangeError(
      "campaign artifact profile save does not match compiled content"
    );
  const rewardLedger = requireBoundedLedger(source.rewardLedger);
  const attempts = requireBoundedAttempts(source.attempts);
  if (rewardLedger.claims.length !== attempts.length)
    throw new RangeError(
      "campaign artifact reward claims must match the attempt count"
    );
  const stateChecksum = requireChecksum(
    source.stateChecksum,
    "campaign artifact stateChecksum"
  );
  const actualStateChecksum = await canonicalHash(
    statePayload(contentManifestHash, profileSave, rewardLedger, attempts)
  );
  if (stateChecksum !== actualStateChecksum)
    throw new RangeError("campaign artifact state checksum does not match");
  const payloadChecksum = requireChecksum(
    source.payloadChecksum,
    "campaign artifact payloadChecksum"
  );
  const actualPayloadChecksum = await canonicalHash(
    artifactPayload(
      contentManifestHash,
      profileSave,
      rewardLedger,
      attempts,
      stateChecksum
    )
  );
  if (payloadChecksum !== actualPayloadChecksum)
    throw new RangeError("campaign artifact payload checksum does not match");
  if (restoredCampaignStates.has(stateChecksum))
    throw new RangeError(
      "campaign artifact state is already restored or in progress"
    );
  restoredCampaignStates.set(stateChecksum, "in_progress");

  try {
    let authority = createShuttergateCampaignAuthority();
    for (let index = 0; index < attempts.length; index += 1) {
      authority = (await runShuttergateCampaignTransition(content, authority))
        .authority;
    }
    const replayedStateChecksum = await canonicalHash(
      statePayload(
        contentManifestHash,
        profileSave,
        authority.rewardLedger,
        authority.attempts
      )
    );
    if (
      replayedStateChecksum !== stateChecksum ||
      (await canonicalHash(authority.profile)) !==
        (await canonicalHash(profileSave.profile))
    )
      throw new RangeError(
        "campaign artifact does not match authoritative replay evidence"
      );
    restoredCampaignStates.set(stateChecksum, "consumed");
    return authority;
  } catch (error) {
    restoredCampaignStates.delete(stateChecksum);
    throw error;
  }
}
