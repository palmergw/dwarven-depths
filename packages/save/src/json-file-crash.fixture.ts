import { createInitialProfile } from "@dwarven-depths/progression";
import { JsonProfileStore } from "./json-file.js";
import { createProfileSaveEnvelope } from "./profile-save.js";

const path = process.argv[2];
if (path === undefined) throw new Error("profile path argument is required");

const envelope = await createProfileSaveEnvelope({
  contentVersion: "content.shuttergate.v1",
  applicationBuild: "crash-fixture",
  writtenAtEpochMs: 1_725_000_000_001,
  profileId: "profile.local",
  profile: {
    ...createInitialProfile("character.iron_warden" as never),
    revision: 1,
    forgeOre: 10
  }
});

await new JsonProfileStore(path, {
  injectFault: async (point) => {
    if (point === "before_durable_replacement") {
      process.stdout.write("READY\n");
      await new Promise(() => undefined);
    }
  }
}).write({ expectedRevision: 0, envelope });
