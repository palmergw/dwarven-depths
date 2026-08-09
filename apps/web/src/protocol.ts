import {
  normalizeProfileState,
  type ProfileState
} from "@dwarven-depths/progression";
import type { ShuttergateWebRunConfiguration } from "@dwarven-depths/runtime";
import { parseRenderSnapshot, type RenderSnapshot } from "./render-snapshot.js";

export const WEB_PROTOCOL_VERSION = 4 as const;
type WebProtocolVersion = 1 | 2 | 3 | 4;
export const EMPTY_CONTENT_MANIFEST_HASH =
  "3166e781fc4cce29240c01099919f4475ebe03294a76987706214eb24e398abe";

export const TARGET_POLICIES = [
  "nearest",
  "lowest_health",
  "highest_health",
  "highest_armor",
  "fastest",
  "boss_or_elite_first"
] as const;
export type TargetPolicy = (typeof TARGET_POLICIES)[number];
export type SimulationSpeed = 1 | 2;

export interface CombatControlDwarf {
  readonly entityId: string;
  readonly characterId: string;
  readonly currentTargetPolicy?: TargetPolicy;
  readonly supportedTargetPolicies: readonly TargetPolicy[];
  readonly activeAbilities?: readonly {
    readonly abilityId: string;
    readonly cooldownCompleteAtTick: number | null;
    readonly rejectionReason: string | null;
  }[];
}

export type ClientMessage =
  | { readonly protocolVersion: 1; readonly type: "initialize" }
  | { readonly protocolVersion: 2; readonly type: "initialize" }
  | { readonly protocolVersion: 3; readonly type: "initialize" }
  | {
      readonly protocolVersion: 4;
      readonly type: "initialize";
      readonly runConfiguration: ShuttergateWebRunConfiguration;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "command";
      readonly requestId: string;
      readonly command: { readonly type: "confirmPreparation" };
    }
  | {
      readonly protocolVersion: 2 | 3;
      readonly type: "command";
      readonly requestId: string;
      readonly command:
        | { readonly type: "confirmPreparation" }
        | {
            readonly type: "commitManualResume";
            readonly resumeRequestId: string;
          }
        | { readonly type: "setManualPause"; readonly paused: boolean };
    }
  | {
      readonly protocolVersion: 4;
      readonly type: "command";
      readonly requestId: string;
      readonly command:
        | { readonly type: "confirmPreparation" }
        | {
            readonly type: "commitManualResume";
            readonly resumeRequestId: string;
          }
        | { readonly type: "setManualPause"; readonly paused: boolean }
        | {
            readonly type: "setSimulationSpeed";
            readonly speed: SimulationSpeed;
          }
        | {
            readonly type: "setTargetPolicy";
            readonly dwarfEntityId: string;
            readonly requestedPolicy: TargetPolicy;
          }
        | {
            readonly type: "activateAbility";
            readonly dwarfEntityId: string;
            readonly abilityId: string;
          };
    };

export type WorkerMessage =
  | {
      readonly protocolVersion: WebProtocolVersion;
      readonly type: "snapshot";
      readonly phase: "preparation";
      readonly levelId: string;
      readonly deployableEntityCount: number;
      readonly placementPointCount: number;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "snapshot";
      readonly phase: "running";
    }
  | {
      readonly protocolVersion: 2 | 3;
      readonly type: "snapshot";
      readonly phase: "running";
      readonly manualPaused: boolean;
      readonly resumeRequestId: string | null;
    }
  | {
      readonly protocolVersion: 4;
      readonly type: "snapshot";
      readonly phase: "running";
      readonly manualPaused: boolean;
      readonly resumeRequestId: string | null;
      readonly simulationSpeed: SimulationSpeed;
    }
  | {
      readonly protocolVersion: 3;
      readonly type: "combat_controls";
      readonly contentManifestHash: typeof EMPTY_CONTENT_MANIFEST_HASH;
      readonly dwarves: readonly [];
    }
  | {
      readonly protocolVersion: 4;
      readonly type: "combat_controls";
      readonly acknowledgedRequestIds: readonly string[];
      readonly authoritativeTick: number;
      readonly contentManifestHash: string;
      readonly dwarves: readonly CombatControlDwarf[];
    }
  | {
      readonly protocolVersion: WebProtocolVersion;
      readonly type: "render_snapshot";
      readonly snapshot: RenderSnapshot;
    }
  | {
      readonly protocolVersion: 1 | 2 | 3;
      readonly type: "result";
      readonly terminalResult: "victory" | "defeat";
      readonly terminalTick: number;
      readonly finalStateChecksum: string;
      readonly eventStreamChecksum: string;
      readonly commands: readonly {
        readonly tick: number;
        readonly sequence: number;
        readonly command: {
          readonly atTick: number;
          readonly type: "confirmPreparation";
        };
      }[];
    }
  | {
      readonly protocolVersion: 4;
      readonly type: "result";
      readonly terminalResult: "victory" | "defeat";
      readonly terminalTick: number;
      readonly finalStateChecksum: string;
      readonly eventStreamChecksum: string;
      readonly campaign: {
        readonly schemaVersion: 1;
        readonly attemptId: string;
        readonly rewardId: string;
        readonly forgeOreAwarded: number;
        readonly profile: ProfileState;
      };
      readonly commands: readonly {
        readonly tick: number;
        readonly sequence: number;
        readonly command:
          | { readonly atTick: number; readonly type: "confirmPreparation" }
          | {
              readonly atTick: number;
              readonly type: "setTargetPolicy";
              readonly dwarfEntityId: string;
              readonly requestedPolicy: TargetPolicy;
            }
          | {
              readonly atTick: number;
              readonly type: "activateAbility";
              readonly dwarfEntityId: string;
              readonly abilityId: string;
            };
      }[];
    }
  | {
      readonly protocolVersion: WebProtocolVersion;
      readonly type: "failure";
      readonly code: string;
      readonly message: string;
      readonly requestId?: string;
    };

type RecordValue = {
  [key: string]: unknown;
  protocolVersion?: unknown;
  type?: unknown;
  requestId?: unknown;
  command?: unknown;
  manualPaused?: unknown;
  paused?: unknown;
  speed?: unknown;
  resumeRequestId?: unknown;
  phase?: unknown;
  levelId?: unknown;
  deployableEntityCount?: unknown;
  placementPointCount?: unknown;
  code?: unknown;
  message?: unknown;
  terminalResult?: unknown;
  terminalTick?: unknown;
  finalStateChecksum?: unknown;
  eventStreamChecksum?: unknown;
  commands?: unknown;
  tick?: unknown;
  sequence?: unknown;
  atTick?: unknown;
  snapshot?: unknown;
  dwarves?: unknown;
  acknowledgedRequestIds?: unknown;
  authoritativeTick?: unknown;
  contentManifestHash?: unknown;
  dwarfEntityId?: unknown;
  characterId?: unknown;
  supportedTargetPolicies?: unknown;
  requestedPolicy?: unknown;
  activeAbilities?: unknown;
  abilityId?: unknown;
  cooldownCompleteAtTick?: unknown;
  rejectionReason?: unknown;
  runConfiguration?: unknown;
  schemaVersion?: unknown;
  attemptId?: unknown;
  placementPointId?: unknown;
  seed?: unknown;
  rewardId?: unknown;
  forgeOreAwarded?: unknown;
  profile?: unknown;
  campaign?: unknown;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isLevelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    /^level\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(value)
  );
}

function isRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function isStableId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value)
  );
}

function isTargetPolicy(value: unknown): value is TargetPolicy {
  return TARGET_POLICIES.some((policy) => policy === value);
}

function parseRunConfiguration(
  value: unknown
): ShuttergateWebRunConfiguration | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "attemptId",
      "placementPointId",
      "profile",
      "schemaVersion",
      "seed"
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.attemptId !== "string" ||
    !/^attempt\.shuttergate\.web_[0-9]{6}$/.test(value.attemptId) ||
    typeof value.seed !== "string" ||
    !/^[1-9]\d{0,9}$/.test(value.seed) ||
    BigInt(value.seed) > 0xffff_ffffn ||
    value.placementPointId !== "placement.shuttergate_north_guard"
  )
    return undefined;
  try {
    return Object.freeze({
      schemaVersion: 1,
      attemptId: value.attemptId as never,
      seed: value.seed,
      placementPointId: value.placementPointId as never,
      profile: normalizeProfileState(value.profile)
    });
  } catch {
    return undefined;
  }
}

export function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (
    !isRecord(value) ||
    (value.protocolVersion !== 1 &&
      value.protocolVersion !== 2 &&
      value.protocolVersion !== 3 &&
      value.protocolVersion !== WEB_PROTOCOL_VERSION) ||
    typeof value.type !== "string"
  )
    return undefined;
  if (value.type === "initialize") {
    if (value.protocolVersion === 4) {
      if (!hasExactKeys(value, ["protocolVersion", "runConfiguration", "type"]))
        return undefined;
      const runConfiguration = parseRunConfiguration(value.runConfiguration);
      return runConfiguration === undefined
        ? undefined
        : { protocolVersion: 4, type: "initialize", runConfiguration };
    }
    return hasExactKeys(value, ["protocolVersion", "type"])
      ? {
          protocolVersion: value.protocolVersion as 1 | 2 | 3,
          type: "initialize"
        }
      : undefined;
  }
  if (
    value.type !== "command" ||
    !hasExactKeys(value, ["command", "protocolVersion", "requestId", "type"]) ||
    !isRequestId(value.requestId) ||
    !isRecord(value.command)
  )
    return undefined;
  if (
    value.protocolVersion !== 1 &&
    value.command.type === "setManualPause" &&
    hasExactKeys(value.command, ["paused", "type"]) &&
    typeof value.command.paused === "boolean"
  ) {
    return {
      protocolVersion: value.protocolVersion,
      type: "command",
      requestId: value.requestId,
      command: { type: "setManualPause", paused: value.command.paused }
    };
  }
  if (
    value.protocolVersion !== 1 &&
    value.command.type === "commitManualResume" &&
    hasExactKeys(value.command, ["resumeRequestId", "type"]) &&
    isRequestId(value.command.resumeRequestId)
  ) {
    return {
      protocolVersion: value.protocolVersion,
      type: "command",
      requestId: value.requestId,
      command: {
        type: "commitManualResume",
        resumeRequestId: value.command.resumeRequestId
      }
    };
  }
  if (
    value.protocolVersion === 4 &&
    value.command.type === "setSimulationSpeed" &&
    hasExactKeys(value.command, ["speed", "type"]) &&
    (value.command.speed === 1 || value.command.speed === 2)
  ) {
    return {
      protocolVersion: 4,
      type: "command",
      requestId: value.requestId,
      command: { type: "setSimulationSpeed", speed: value.command.speed }
    };
  }
  if (
    value.protocolVersion === 4 &&
    value.command.type === "setTargetPolicy" &&
    hasExactKeys(value.command, ["dwarfEntityId", "requestedPolicy", "type"]) &&
    isStableId(value.command.dwarfEntityId) &&
    isTargetPolicy(value.command.requestedPolicy)
  ) {
    return {
      protocolVersion: 4,
      type: "command",
      requestId: value.requestId,
      command: {
        type: "setTargetPolicy",
        dwarfEntityId: value.command.dwarfEntityId,
        requestedPolicy: value.command.requestedPolicy
      }
    };
  }
  if (
    value.protocolVersion === 4 &&
    value.command.type === "activateAbility" &&
    hasExactKeys(value.command, ["abilityId", "dwarfEntityId", "type"]) &&
    isStableId(value.command.dwarfEntityId) &&
    isStableId(value.command.abilityId)
  ) {
    return {
      protocolVersion: 4,
      type: "command",
      requestId: value.requestId,
      command: {
        type: "activateAbility",
        dwarfEntityId: value.command.dwarfEntityId,
        abilityId: value.command.abilityId
      }
    };
  }
  if (
    !hasExactKeys(value.command, ["type"]) ||
    value.command.type !== "confirmPreparation"
  )
    return undefined;
  return {
    protocolVersion: value.protocolVersion as WebProtocolVersion,
    type: "command",
    requestId: value.requestId,
    command: { type: "confirmPreparation" }
  };
}

export function parseWorkerMessage(value: unknown): WorkerMessage | undefined {
  if (
    !isRecord(value) ||
    (value.protocolVersion !== 1 &&
      value.protocolVersion !== 2 &&
      value.protocolVersion !== 3 &&
      value.protocolVersion !== WEB_PROTOCOL_VERSION) ||
    typeof value.type !== "string"
  )
    return undefined;
  if (value.type === "combat_controls") {
    if (
      (value.protocolVersion !== 3 && value.protocolVersion !== 4) ||
      (value.protocolVersion === 3
        ? !hasExactKeys(value, [
            "contentManifestHash",
            "dwarves",
            "protocolVersion",
            "type"
          ])
        : !hasExactKeys(value, [
            "acknowledgedRequestIds",
            "authoritativeTick",
            "contentManifestHash",
            "dwarves",
            "protocolVersion",
            "type"
          ])) ||
      !isHash(value.contentManifestHash) ||
      !Array.isArray(value.dwarves)
    )
      return undefined;
    if (value.protocolVersion === 3)
      return value.contentManifestHash === EMPTY_CONTENT_MANIFEST_HASH &&
        value.dwarves.length === 0
        ? (value as WorkerMessage)
        : undefined;
    if (
      !Number.isSafeInteger(value.authoritativeTick) ||
      (value.authoritativeTick as number) < 0 ||
      !Array.isArray(value.acknowledgedRequestIds) ||
      !value.acknowledgedRequestIds.every(
        (requestId, index, requestIds) =>
          isRequestId(requestId) &&
          (index === 0 ||
            (typeof requestIds[index - 1] === "string" &&
              requestIds[index - 1] < requestId))
      )
    )
      return undefined;
    let previousEntityId = "";
    for (const dwarf of value.dwarves) {
      if (
        !isRecord(dwarf) ||
        (!hasExactKeys(dwarf, [
          "characterId",
          "currentTargetPolicy",
          "entityId",
          "supportedTargetPolicies"
        ]) &&
          !hasExactKeys(dwarf, [
            "activeAbilities",
            "characterId",
            "currentTargetPolicy",
            "entityId",
            "supportedTargetPolicies"
          ]))
      )
        return undefined;
      const {
        characterId,
        currentTargetPolicy,
        entityId,
        supportedTargetPolicies
      } = dwarf;
      if (
        !isStableId(entityId) ||
        entityId <= previousEntityId ||
        !isStableId(characterId) ||
        !isTargetPolicy(currentTargetPolicy) ||
        !Array.isArray(supportedTargetPolicies) ||
        supportedTargetPolicies.length === 0 ||
        !supportedTargetPolicies.every(
          (policy, index, policies) =>
            isTargetPolicy(policy) &&
            (index === 0 ||
              (isTargetPolicy(policies[index - 1]) &&
                TARGET_POLICIES.indexOf(policies[index - 1]) <
                  TARGET_POLICIES.indexOf(policy)))
        )
      )
        return undefined;
      if (!supportedTargetPolicies.includes(currentTargetPolicy))
        return undefined;
      previousEntityId = entityId;
      if (dwarf.activeAbilities !== undefined) {
        if (!Array.isArray(dwarf.activeAbilities)) return undefined;
        let previousAbilityId = "";
        for (const ability of dwarf.activeAbilities) {
          if (
            !isRecord(ability) ||
            !hasExactKeys(ability, [
              "abilityId",
              "cooldownCompleteAtTick",
              "rejectionReason"
            ]) ||
            !isStableId(ability.abilityId) ||
            ability.abilityId <= previousAbilityId ||
            (ability.cooldownCompleteAtTick !== null &&
              (!Number.isSafeInteger(ability.cooldownCompleteAtTick) ||
                (ability.cooldownCompleteAtTick as number) < 0)) ||
            (ability.rejectionReason !== null &&
              typeof ability.rejectionReason !== "string")
          )
            return undefined;
          previousAbilityId = ability.abilityId;
        }
      }
    }
    return value as WorkerMessage;
  }
  if (value.type === "render_snapshot") {
    if (!hasExactKeys(value, ["protocolVersion", "snapshot", "type"]))
      return undefined;
    const snapshot = parseRenderSnapshot(value.snapshot);
    return snapshot === undefined ||
      (value.protocolVersion === 4) !== (snapshot.schemaVersion === 2)
      ? undefined
      : {
          protocolVersion: value.protocolVersion as WebProtocolVersion,
          type: "render_snapshot",
          snapshot
        };
  }
  if (value.type === "snapshot") {
    if (value.phase === "running") {
      if (value.protocolVersion === 1) {
        return hasExactKeys(value, ["phase", "protocolVersion", "type"])
          ? { protocolVersion: 1, type: "snapshot", phase: "running" }
          : undefined;
      }
      const keys = [
        "manualPaused",
        "phase",
        "protocolVersion",
        "resumeRequestId",
        ...(value.protocolVersion === 4 ? ["simulationSpeed"] : []),
        "type"
      ];
      if (
        !hasExactKeys(value, keys) ||
        !(
          (value.manualPaused === true && value.resumeRequestId === null) ||
          (value.manualPaused === false &&
            (isRequestId(value.resumeRequestId) ||
              (value.protocolVersion === 4 && value.resumeRequestId === null)))
        )
      )
        return undefined;
      if (value.protocolVersion === 4) {
        const simulationSpeed = value["simulationSpeed"];
        return simulationSpeed === 1 || simulationSpeed === 2
          ? {
              protocolVersion: 4,
              type: "snapshot",
              phase: "running",
              manualPaused: value.manualPaused,
              resumeRequestId: value.resumeRequestId as string | null,
              simulationSpeed
            }
          : undefined;
      }
      return {
        protocolVersion: value.protocolVersion,
        type: "snapshot",
        phase: "running",
        manualPaused: value.manualPaused,
        resumeRequestId: value.resumeRequestId as string | null
      };
    }
    if (
      value.phase !== "preparation" ||
      !hasExactKeys(value, [
        "deployableEntityCount",
        "levelId",
        "phase",
        "placementPointCount",
        "protocolVersion",
        "type"
      ]) ||
      !isLevelId(value.levelId) ||
      !Number.isSafeInteger(value.deployableEntityCount) ||
      (value.deployableEntityCount as number) < 0 ||
      !Number.isSafeInteger(value.placementPointCount) ||
      (value.placementPointCount as number) < 0
    )
      return undefined;
    return value as WorkerMessage;
  }
  if (value.type === "failure") {
    const isBoundCommandRejection =
      value.protocolVersion === 4 && value.code === "command_rejected";
    if (
      !hasExactKeys(
        value,
        isBoundCommandRejection
          ? ["code", "message", "protocolVersion", "requestId", "type"]
          : ["code", "message", "protocolVersion", "type"]
      ) ||
      typeof value.code !== "string" ||
      typeof value.message !== "string" ||
      (isBoundCommandRejection && !isRequestId(value.requestId))
    )
      return undefined;
    return {
      protocolVersion: value.protocolVersion as WebProtocolVersion,
      type: "failure",
      code: value.code,
      message: value.message,
      ...(isBoundCommandRejection
        ? { requestId: value.requestId as string }
        : {})
    };
  }
  if (
    value.type !== "result" ||
    !hasExactKeys(value, [
      "commands",
      ...(value.protocolVersion === 4 ? ["campaign"] : []),
      "eventStreamChecksum",
      "finalStateChecksum",
      "protocolVersion",
      "terminalResult",
      "terminalTick",
      "type"
    ]) ||
    (value.terminalResult !== "victory" && value.terminalResult !== "defeat") ||
    !Number.isSafeInteger(value.terminalTick) ||
    (value.terminalTick as number) < 0 ||
    !isHash(value.finalStateChecksum) ||
    !isHash(value.eventStreamChecksum) ||
    !Array.isArray(value.commands)
  )
    return undefined;
  if (value.protocolVersion === 4) {
    if (
      !isRecord(value.campaign) ||
      !hasExactKeys(value.campaign, [
        "attemptId",
        "forgeOreAwarded",
        "profile",
        "rewardId",
        "schemaVersion"
      ]) ||
      value.campaign.schemaVersion !== 1 ||
      typeof value.campaign.attemptId !== "string" ||
      !/^attempt\.shuttergate\.web_[0-9]{6}$/.test(value.campaign.attemptId) ||
      value.campaign.rewardId !== `reward.${value.campaign.attemptId}` ||
      !Number.isSafeInteger(value.campaign.forgeOreAwarded) ||
      (value.campaign.forgeOreAwarded as number) < 0
    )
      return undefined;
    try {
      normalizeProfileState(value.campaign.profile);
    } catch {
      return undefined;
    }
  }
  const commands = value.commands;
  if (
    commands.length < 1 ||
    !commands.every(
      (envelope, index) =>
        isRecord(envelope) &&
        hasExactKeys(envelope, ["command", "sequence", "tick"]) &&
        Number.isSafeInteger(envelope.tick) &&
        (envelope.tick as number) >= 0 &&
        (envelope.tick as number) <= (value.terminalTick as number) &&
        Number.isSafeInteger(envelope.sequence) &&
        envelope.sequence === index &&
        isRecord(envelope.command) &&
        Number.isSafeInteger(envelope.command.atTick) &&
        (envelope.command.atTick as number) >= 0 &&
        envelope.command.atTick === envelope.tick &&
        (hasExactKeys(envelope.command, ["atTick", "type"]) &&
        envelope.command.type === "confirmPreparation"
          ? index === 0
          : value.protocolVersion === 4 &&
            ((hasExactKeys(envelope.command, [
              "atTick",
              "dwarfEntityId",
              "requestedPolicy",
              "type"
            ]) &&
              envelope.command.type === "setTargetPolicy" &&
              isStableId(envelope.command.dwarfEntityId) &&
              isTargetPolicy(envelope.command.requestedPolicy)) ||
              (hasExactKeys(envelope.command, [
                "abilityId",
                "atTick",
                "dwarfEntityId",
                "type"
              ]) &&
                envelope.command.type === "activateAbility" &&
                isStableId(envelope.command.dwarfEntityId) &&
                isStableId(envelope.command.abilityId))))
    )
  )
    return undefined;
  if (value.protocolVersion !== 4 && commands.length !== 1) return undefined;
  const firstEnvelope = commands[0];
  if (!isRecord(firstEnvelope)) return undefined;
  const firstCommand = firstEnvelope.command;
  if (
    firstEnvelope.tick !== 0 ||
    !isRecord(firstCommand) ||
    firstCommand.type !== "confirmPreparation"
  )
    return undefined;
  let previousCommandTick = -1;
  const targetPolicyKeys = new Set<string>();
  const abilityKeys = new Set<string>();
  for (const envelope of commands) {
    if (!isRecord(envelope)) return undefined;
    const { command, tick } = envelope;
    if (typeof tick !== "number" || tick < previousCommandTick)
      return undefined;
    previousCommandTick = tick;
    if (isRecord(command) && command.type === "setTargetPolicy") {
      const { dwarfEntityId } = command;
      if (typeof dwarfEntityId !== "string") return undefined;
      const key = `${tick}:${dwarfEntityId}`;
      if (targetPolicyKeys.has(key)) return undefined;
      targetPolicyKeys.add(key);
    } else if (isRecord(command) && command.type === "activateAbility") {
      const { abilityId, dwarfEntityId } = command;
      if (typeof dwarfEntityId !== "string" || typeof abilityId !== "string")
        return undefined;
      const key = `${tick}:${dwarfEntityId}:${abilityId}`;
      if (abilityKeys.has(key)) return undefined;
      abilityKeys.add(key);
    }
  }
  return value as WorkerMessage;
}

export function failure(
  code: string,
  message: string,
  protocolVersion: WebProtocolVersion = WEB_PROTOCOL_VERSION,
  requestId?: string
): WorkerMessage {
  if (protocolVersion === 4 && code === "command_rejected") {
    if (requestId === undefined)
      throw new Error("protocol 4 command rejection requires a request ID");
    return {
      protocolVersion,
      type: "failure",
      code,
      message,
      requestId
    };
  }
  return {
    protocolVersion,
    type: "failure",
    code,
    message
  };
}
