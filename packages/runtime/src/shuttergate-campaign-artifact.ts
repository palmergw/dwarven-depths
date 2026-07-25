import type { CompiledContent } from "@dwarven-depths/content-runtime";
import { canonicalHash, type StableId } from "@dwarven-depths/contracts";
import {
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
  type ShuttergateCampaignAuthority
} from "./shuttergate-campaign.js";
import { requireShuttergateReferenceContent } from "./shuttergate-reference-calibration.js";

const campaignId = "campaign.shuttergate.v1" as StableId;
const checksumPattern = /^[a-f0-9]{64}$/;

export const maximumShuttergateCampaignArtifactAttempts = 64;

export interface ShuttergateCampaignArtifact {
  readonly schemaVersion: 1;
  readonly campaignId: StableId;
  readonly contentManifestHash: string;
  readonly profileSave: ProfileSaveEnvelope;
  readonly rewardLedgerChecksum: string;
  readonly attemptChecksums: readonly string[];
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

function requireBoundedAttemptChecksums(value: unknown): readonly string[] {
  const checksums = requireProfileArray(
    value,
    "campaign artifact attemptChecksums"
  );
  if (checksums.length > maximumShuttergateCampaignArtifactAttempts)
    throw new RangeError(
      `campaign artifact attemptChecksums cannot exceed ${maximumShuttergateCampaignArtifactAttempts}`
    );
  return Object.freeze(
    checksums.map((checksum, index) =>
      requireChecksum(checksum, `campaign artifact attemptChecksums[${index}]`)
    )
  );
}

function statePayload(
  contentManifestHash: string,
  profileSave: ProfileSaveEnvelope,
  rewardLedgerChecksum: string,
  attemptChecksums: readonly string[]
) {
  return Object.freeze({
    campaignId,
    contentManifestHash,
    profile: profileSave.profile,
    rewardLedgerChecksum,
    attemptChecksums
  });
}

function artifactPayload(
  contentManifestHash: string,
  profileSave: ProfileSaveEnvelope,
  rewardLedgerChecksum: string,
  attemptChecksums: readonly string[],
  stateChecksum: string
) {
  return Object.freeze({
    schemaVersion: 1 as const,
    campaignId,
    contentManifestHash,
    profileSave,
    rewardLedgerChecksum,
    attemptChecksums,
    stateChecksum
  });
}

/**
 * Creates a compact durable handoff and consumes the in-memory authority on
 * success. Full ledger and attempt records are bound by checksums and are
 * reconstructed by authoritative replay rather than trusted from storage.
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
  const authority = source.authority as ShuttergateCampaignAuthority;
  const reservation = reserveShuttergateCampaignAuthority(authority);
  try {
    if (authority.attempts.length > maximumShuttergateCampaignArtifactAttempts)
      throw new RangeError(
        `campaign artifact attempts cannot exceed ${maximumShuttergateCampaignArtifactAttempts}`
      );
    const content = await requireShuttergateReferenceContent(
      source.content as CompiledContent
    );
    const profileSave = await createProfileSaveEnvelope({
      contentVersion: content.bundle.contentVersion,
      applicationBuild: source.applicationBuild as string,
      writtenAtEpochMs: source.writtenAtEpochMs as number,
      profileId: source.profileId as string,
      profile: authority.profile
    });
    const rewardLedgerChecksum = await canonicalHash(authority.rewardLedger);
    const attemptChecksums = Object.freeze(
      await Promise.all(
        authority.attempts.map((attempt) => canonicalHash(attempt))
      )
    );
    const stateChecksum = await canonicalHash(
      statePayload(
        content.manifestHash,
        profileSave,
        rewardLedgerChecksum,
        attemptChecksums
      )
    );
    const payload = artifactPayload(
      content.manifestHash,
      profileSave,
      rewardLedgerChecksum,
      attemptChecksums,
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
 * attempt checksum. The same campaign state cannot be restored twice in this
 * process.
 */
export async function restoreShuttergateCampaignArtifact(
  suppliedContent: CompiledContent,
  value: unknown
): Promise<ShuttergateCampaignAuthority> {
  const source = requireProfileRecord(
    value,
    [
      "schemaVersion",
      "campaignId",
      "contentManifestHash",
      "profileSave",
      "rewardLedgerChecksum",
      "attemptChecksums",
      "stateChecksum",
      "payloadChecksum"
    ],
    "campaign artifact"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError("campaign artifact has unsupported schemaVersion");
  if (source.campaignId !== campaignId)
    throw new RangeError("campaign artifact has unsupported campaignId");
  const content = await requireShuttergateReferenceContent(suppliedContent);
  const contentManifestHash = requireChecksum(
    source.contentManifestHash,
    "campaign artifact contentManifestHash"
  );
  if (contentManifestHash !== content.manifestHash)
    throw new RangeError(
      "campaign artifact contentManifestHash does not match compiled content"
    );
  const profileSave = await normalizeProfileSaveEnvelope(source.profileSave);
  if (profileSave.contentVersion !== content.bundle.contentVersion)
    throw new RangeError(
      "campaign artifact profile save does not match compiled content version"
    );
  const rewardLedgerChecksum = requireChecksum(
    source.rewardLedgerChecksum,
    "campaign artifact rewardLedgerChecksum"
  );
  const attemptChecksums = requireBoundedAttemptChecksums(
    source.attemptChecksums
  );
  const stateChecksum = requireChecksum(
    source.stateChecksum,
    "campaign artifact stateChecksum"
  );
  const actualStateChecksum = await canonicalHash(
    statePayload(
      contentManifestHash,
      profileSave,
      rewardLedgerChecksum,
      attemptChecksums
    )
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
      rewardLedgerChecksum,
      attemptChecksums,
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
    for (let index = 0; index < attemptChecksums.length; index += 1) {
      const transition = await runShuttergateCampaignTransition(
        content,
        authority
      );
      if (
        (await canonicalHash(transition.transition)) !== attemptChecksums[index]
      )
        throw new RangeError(
          `campaign artifact attempt ${index} does not match authoritative replay evidence`
        );
      authority = transition.authority;
    }
    if (
      (await canonicalHash(authority.rewardLedger)) !== rewardLedgerChecksum ||
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
