function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonicalExpected)) {
    throw new Error(
      `${label} keys must be ${canonicalExpected.join(", ")}; received ${actual.join(", ")}`
    );
  }
}

export function validateDesktopRunEvidence(value, expected) {
  const evidence = requireRecord(value, "run evidence");
  requireExactKeys(
    evidence,
    ["campaign", "replay", "runConfiguration", "schemaVersion"],
    "run evidence"
  );
  if (evidence.schemaVersion !== 2) {
    throw new Error(
      `run evidence schema must be 2; received ${evidence.schemaVersion}`
    );
  }

  const campaign = requireRecord(evidence.campaign, "campaign");
  requireExactKeys(
    campaign,
    ["attemptId", "forgeOreAwarded", "profile", "rewardId", "schemaVersion"],
    "campaign"
  );
  if (
    campaign.schemaVersion !== 1 ||
    typeof campaign.attemptId !== "string" ||
    typeof campaign.rewardId !== "string" ||
    !Number.isSafeInteger(campaign.forgeOreAwarded) ||
    campaign.forgeOreAwarded < 0
  ) {
    throw new Error("campaign resolution is malformed");
  }
  requireRecord(campaign.profile, "campaign profile");
  requireRecord(evidence.runConfiguration, "run configuration");

  const replay = requireRecord(evidence.replay, "replay");
  requireExactKeys(
    replay,
    [
      "checkpoints",
      "commands",
      "contentManifestHash",
      "contentVersion",
      "expectedTerminalResult",
      "expectedTerminalTick",
      "levelId",
      "rngAlgorithm",
      "scenarioHash",
      "scenarioId",
      "schemaVersion",
      "seed",
      "simulationSchemaVersion"
    ],
    "replay"
  );
  if (
    replay.schemaVersion !== 1 ||
    replay.simulationSchemaVersion !== 1 ||
    replay.expectedTerminalResult !== expected.terminalResult ||
    replay.expectedTerminalTick !== expected.terminalTick ||
    !Array.isArray(replay.commands) ||
    !Array.isArray(replay.checkpoints) ||
    replay.checkpoints.length !== 1
  ) {
    throw new Error("replay terminal binding is malformed or mismatched");
  }
  const checkpoint = requireRecord(
    replay.checkpoints[0],
    "terminal checkpoint"
  );
  requireExactKeys(
    checkpoint,
    ["eventStreamChecksum", "stateChecksum", "tick"],
    "terminal checkpoint"
  );
  if (
    checkpoint.tick !== expected.terminalTick ||
    checkpoint.stateChecksum !== expected.finalStateChecksum ||
    checkpoint.eventStreamChecksum !== expected.eventStreamChecksum
  ) {
    throw new Error("terminal checkpoint does not match the packaged result");
  }
  return evidence;
}
