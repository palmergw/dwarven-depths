import { normalizeProfileState } from "../packages/progression/dist/profile-state.js";

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

function requireUnsigned(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be an unsigned safe integer`);
  }
  return value;
}

function requireHash(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
  return value;
}

function validateReplayCommands(value) {
  if (!Array.isArray(value))
    throw new Error("replay commands must be an array");
  let previousTick = -1;
  let previousSequence = -1;
  for (const [index, item] of value.entries()) {
    const envelope = requireRecord(item, `replay command ${index}`);
    requireExactKeys(
      envelope,
      ["command", "sequence", "tick"],
      `replay command ${index}`
    );
    const tick = requireUnsigned(envelope.tick, `replay command ${index} tick`);
    const sequence = requireUnsigned(
      envelope.sequence,
      `replay command ${index} sequence`
    );
    if (
      tick < previousTick ||
      sequence !== index ||
      sequence <= previousSequence
    ) {
      throw new Error(
        "replay commands must use canonical tick and sequence order"
      );
    }
    previousTick = tick;
    previousSequence = sequence;
    const command = requireRecord(
      envelope.command,
      `replay command ${index} payload`
    );
    const keysByType = {
      activateAbility: ["abilityId", "atTick", "dwarfEntityId", "type"],
      confirmPreparation: ["atTick", "type"],
      setTargetPolicy: ["atTick", "dwarfEntityId", "requestedPolicy", "type"]
    };
    if (typeof command.type !== "string" || !(command.type in keysByType)) {
      throw new Error(`replay command ${index} has an unsupported type`);
    }
    requireExactKeys(
      command,
      keysByType[command.type],
      `replay command ${index} payload`
    );
    if (
      requireUnsigned(command.atTick, `replay command ${index} atTick`) !== tick
    ) {
      throw new Error(
        `replay command ${index} tick does not match command atTick`
      );
    }
    for (const key of keysByType[command.type]) {
      if (
        key !== "atTick" &&
        key !== "type" &&
        (typeof command[key] !== "string" || command[key].length === 0)
      ) {
        throw new Error(`replay command ${index} ${key} must be a string`);
      }
    }
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
  const runConfiguration = requireRecord(
    evidence.runConfiguration,
    "run configuration"
  );
  requireExactKeys(
    runConfiguration,
    ["attemptId", "placementPointId", "profile", "schemaVersion", "seed"],
    "run configuration"
  );
  if (
    runConfiguration.schemaVersion !== 1 ||
    !/^attempt\.shuttergate\.web_[0-9]{6}$/.test(runConfiguration.attemptId) ||
    !/^[1-9]\d{0,9}$/.test(runConfiguration.seed) ||
    BigInt(runConfiguration.seed) > 0xffff_ffffn ||
    runConfiguration.placementPointId !== "placement.shuttergate_north_guard"
  ) {
    throw new Error("run configuration is malformed");
  }
  const startingProfile = normalizeProfileState(runConfiguration.profile);
  const resolvedProfile = normalizeProfileState(campaign.profile);
  const expectedRewardId = `reward.${runConfiguration.attemptId}`;
  const rewardPrefix = "reward.attempt.shuttergate.web_";
  const claimedAttemptNumbers = startingProfile.claimedRewardIds
    .filter((rewardId) => rewardId.startsWith(rewardPrefix))
    .map((rewardId) => Number(rewardId.slice(rewardPrefix.length)));
  if (
    claimedAttemptNumbers.some(
      (attemptNumber, index) => attemptNumber !== index + 1
    )
  ) {
    throw new Error("run profile campaign rewards are not contiguous");
  }
  const expectedAttemptNumber = claimedAttemptNumbers.length + 1;
  const expectedAttemptId = `attempt.shuttergate.web_${String(
    expectedAttemptNumber
  ).padStart(6, "0")}`;
  if (
    runConfiguration.attemptId !== expectedAttemptId ||
    runConfiguration.seed !== String(expectedAttemptNumber) ||
    campaign.attemptId !== runConfiguration.attemptId ||
    campaign.rewardId !== expectedRewardId ||
    startingProfile.claimedRewardIds.includes(expectedRewardId)
  ) {
    throw new Error("campaign resolution does not match the run configuration");
  }
  const expectedProfile = normalizeProfileState({
    ...startingProfile,
    revision: startingProfile.revision + 1,
    forgeOre: startingProfile.forgeOre + campaign.forgeOreAwarded,
    claimedRewardIds: [...startingProfile.claimedRewardIds, expectedRewardId]
  });
  if (JSON.stringify(resolvedProfile) !== JSON.stringify(expectedProfile)) {
    throw new Error("campaign profile does not apply exactly one run reward");
  }

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
    !Array.isArray(replay.checkpoints) ||
    replay.checkpoints.length !== 1
  ) {
    throw new Error("replay terminal binding is malformed or mismatched");
  }
  if (
    replay.levelId !== "level.shuttergate_hall" ||
    replay.seed !== runConfiguration.seed ||
    replay.rngAlgorithm !== "xorshift32-v1" ||
    typeof replay.contentVersion !== "string" ||
    typeof replay.scenarioId !== "string"
  ) {
    throw new Error("replay metadata does not match the configured run");
  }
  requireHash(replay.contentManifestHash, "replay content manifest hash");
  requireHash(replay.scenarioHash, "replay scenario hash");
  validateReplayCommands(replay.commands);
  if (replay.commands.some((command) => command.tick > expected.terminalTick)) {
    throw new Error("replay command occurs after the terminal tick");
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
