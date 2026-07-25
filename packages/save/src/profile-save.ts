import { canonicalHash } from "@dwarven-depths/contracts";
import {
  normalizeProfileState,
  type ProfileState,
  requireProfileRecord,
  requireProfileUnsigned
} from "@dwarven-depths/progression";

export const currentProfileSaveSchemaVersion = 1;
export const currentSimulationProtocolVersion = 1;

const checksumPattern = /^[a-f0-9]{64}$/;
const profileIdPattern = /^profile\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const versionTextPattern = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;

export interface ProfileSaveEnvelope {
  readonly schemaVersion: 1;
  readonly contentVersion: string;
  readonly simulationProtocolVersion: 1;
  readonly applicationBuild: string;
  readonly writtenAtEpochMs: number;
  readonly profileId: string;
  readonly profileRevision: number;
  readonly payloadChecksum: string;
  readonly profile: ProfileState;
}

export interface CreateProfileSaveEnvelopeRequest {
  readonly contentVersion: string;
  readonly applicationBuild: string;
  readonly writtenAtEpochMs: number;
  readonly profileId: string;
  readonly profile: unknown;
}

function requireVersionText(value: unknown, description: string): string {
  if (typeof value !== "string" || !versionTextPattern.test(value))
    throw new RangeError(
      `${description} must be 1-128 portable version characters`
    );
  return value;
}

function requireProfileId(value: unknown): string {
  if (typeof value !== "string" || !profileIdPattern.test(value))
    throw new RangeError("save profileId must be a valid stable profile ID");
  return value;
}

function requireChecksum(value: unknown): string {
  if (typeof value !== "string" || !checksumPattern.test(value))
    throw new RangeError(
      "save payloadChecksum must be a lowercase SHA-256 hex digest"
    );
  return value;
}

function freezeEnvelope(
  source: Omit<ProfileSaveEnvelope, "profile">,
  profile: ProfileState
): ProfileSaveEnvelope {
  return Object.freeze({ ...source, profile });
}

export async function createProfileSaveEnvelope(
  request: CreateProfileSaveEnvelopeRequest
): Promise<ProfileSaveEnvelope> {
  const source = requireProfileRecord(
    request,
    [
      "contentVersion",
      "applicationBuild",
      "writtenAtEpochMs",
      "profileId",
      "profile"
    ],
    "profile save creation request"
  );
  const profile = normalizeProfileState(source.profile);
  return freezeEnvelope(
    {
      schemaVersion: currentProfileSaveSchemaVersion,
      contentVersion: requireVersionText(
        source.contentVersion,
        "save contentVersion"
      ),
      simulationProtocolVersion: currentSimulationProtocolVersion,
      applicationBuild: requireVersionText(
        source.applicationBuild,
        "save applicationBuild"
      ),
      writtenAtEpochMs: requireProfileUnsigned(
        source.writtenAtEpochMs,
        "save writtenAtEpochMs"
      ),
      profileId: requireProfileId(source.profileId),
      profileRevision: profile.revision,
      payloadChecksum: await canonicalHash(profile)
    },
    profile
  );
}

export async function normalizeProfileSaveEnvelope(
  value: unknown
): Promise<ProfileSaveEnvelope> {
  const source = requireProfileRecord(
    value,
    [
      "schemaVersion",
      "contentVersion",
      "simulationProtocolVersion",
      "applicationBuild",
      "writtenAtEpochMs",
      "profileId",
      "profileRevision",
      "payloadChecksum",
      "profile"
    ],
    "profile save"
  );
  if (source.schemaVersion !== currentProfileSaveSchemaVersion)
    throw new RangeError("profile save has unsupported schemaVersion");
  if (source.simulationProtocolVersion !== currentSimulationProtocolVersion)
    throw new RangeError(
      "profile save has unsupported simulationProtocolVersion"
    );
  const profile = normalizeProfileState(source.profile);
  const profileRevision = requireProfileUnsigned(
    source.profileRevision,
    "save profileRevision"
  );
  if (profileRevision !== profile.revision)
    throw new RangeError(
      "save profileRevision must match the profile payload revision"
    );
  const payloadChecksum = requireChecksum(source.payloadChecksum);
  const actualChecksum = await canonicalHash(profile);
  if (payloadChecksum !== actualChecksum)
    throw new RangeError("profile save payload checksum does not match");
  return freezeEnvelope(
    {
      schemaVersion: currentProfileSaveSchemaVersion,
      contentVersion: requireVersionText(
        source.contentVersion,
        "save contentVersion"
      ),
      simulationProtocolVersion: currentSimulationProtocolVersion,
      applicationBuild: requireVersionText(
        source.applicationBuild,
        "save applicationBuild"
      ),
      writtenAtEpochMs: requireProfileUnsigned(
        source.writtenAtEpochMs,
        "save writtenAtEpochMs"
      ),
      profileId: requireProfileId(source.profileId),
      profileRevision,
      payloadChecksum
    },
    profile
  );
}
