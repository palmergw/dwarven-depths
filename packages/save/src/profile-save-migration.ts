import { requireProfileRecord } from "@dwarven-depths/progression";
import {
  currentProfileSaveSchemaVersion,
  currentSimulationProtocolVersion,
  normalizeProfileSaveEnvelope,
  type ProfileSaveEnvelope
} from "./profile-save.js";

export const oldestSupportedProfileSaveSchemaVersion = 0;

export interface ProfileSaveMigrationResult {
  readonly envelope: ProfileSaveEnvelope;
  readonly migratedFromSchemaVersion: 0 | null;
}

function readSchemaVersion(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("profile save must be a plain object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("profile save must be a plain object");
  const descriptor = Object.getOwnPropertyDescriptor(value, "schemaVersion");
  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor)
  )
    throw new TypeError(
      "profile save schemaVersion must be an enumerable data property"
    );
  return descriptor.value;
}

async function migrateProfileSaveV0(
  value: unknown
): Promise<ProfileSaveEnvelope> {
  const source = requireProfileRecord(
    value,
    [
      "schemaVersion",
      "contentVersion",
      "applicationBuild",
      "writtenAtEpochMs",
      "profileId",
      "revision",
      "payloadChecksum",
      "profile"
    ],
    "profile save schema 0"
  );
  if (source.schemaVersion !== oldestSupportedProfileSaveSchemaVersion)
    throw new RangeError("profile save migration expected schemaVersion 0");

  const migrated = await normalizeProfileSaveEnvelope({
    schemaVersion: currentProfileSaveSchemaVersion,
    contentVersion: source.contentVersion,
    simulationProtocolVersion: currentSimulationProtocolVersion,
    applicationBuild: source.applicationBuild,
    writtenAtEpochMs: source.writtenAtEpochMs,
    profileId: source.profileId,
    profileRevision: source.revision,
    payloadChecksum: source.payloadChecksum,
    profile: source.profile
  });
  return normalizeProfileSaveEnvelope(migrated);
}

export async function migrateProfileSaveEnvelope(
  value: unknown
): Promise<ProfileSaveMigrationResult> {
  const schemaVersion = readSchemaVersion(value);
  if (schemaVersion === currentProfileSaveSchemaVersion)
    return Object.freeze({
      envelope: await normalizeProfileSaveEnvelope(value),
      migratedFromSchemaVersion: null
    });
  if (schemaVersion === oldestSupportedProfileSaveSchemaVersion)
    return Object.freeze({
      envelope: await migrateProfileSaveV0(value),
      migratedFromSchemaVersion: oldestSupportedProfileSaveSchemaVersion
    });
  if (Number.isSafeInteger(schemaVersion))
    throw new RangeError(
      (schemaVersion as number) > currentProfileSaveSchemaVersion
        ? "profile save has unsupported newer schemaVersion"
        : "profile save has unsupported historical schemaVersion"
    );
  throw new RangeError("profile save schemaVersion must be a safe integer");
}
