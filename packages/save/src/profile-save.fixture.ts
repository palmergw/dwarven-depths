import { canonicalHash } from "@dwarven-depths/contracts";
import { createInitialProfile } from "@dwarven-depths/progression";
import {
  createProfileSaveEnvelope,
  normalizeProfileSaveEnvelope
} from "./profile-save.js";

export async function profileSaveParityEvidence() {
  const envelope = await createProfileSaveEnvelope({
    contentVersion: "content.shuttergate.v1",
    applicationBuild: "test-build-1",
    writtenAtEpochMs: 1_725_000_000_000,
    profileId: "profile.local",
    profile: {
      ...createInitialProfile("character.iron_warden" as never),
      revision: 2,
      forgeOre: 35
    }
  });
  const roundTrip = await normalizeProfileSaveEnvelope(
    JSON.parse(JSON.stringify(envelope))
  );
  return Object.freeze({
    envelope,
    roundTrip,
    checksum: await canonicalHash(envelope)
  });
}
