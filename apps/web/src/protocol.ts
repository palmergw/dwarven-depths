import { parseRenderSnapshot, type RenderSnapshot } from "./render-snapshot.js";

export const WEB_PROTOCOL_VERSION = 2 as const;
type WebProtocolVersion = 1 | 2;

export type ClientMessage =
  | { readonly protocolVersion: 1; readonly type: "initialize" }
  | { readonly protocolVersion: 2; readonly type: "initialize" }
  | {
      readonly protocolVersion: 1;
      readonly type: "command";
      readonly requestId: string;
      readonly command: { readonly type: "confirmPreparation" };
    }
  | {
      readonly protocolVersion: 2;
      readonly type: "command";
      readonly requestId: string;
      readonly command:
        | { readonly type: "confirmPreparation" }
        | { readonly type: "commitManualResume" }
        | { readonly type: "setManualPause"; readonly paused: boolean };
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
      readonly protocolVersion: 2;
      readonly type: "snapshot";
      readonly phase: "running";
      readonly manualPaused: boolean;
    }
  | {
      readonly protocolVersion: WebProtocolVersion;
      readonly type: "render_snapshot";
      readonly snapshot: RenderSnapshot;
    }
  | {
      readonly protocolVersion: WebProtocolVersion;
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
      readonly protocolVersion: WebProtocolVersion;
      readonly type: "failure";
      readonly code: string;
      readonly message: string;
    };

type RecordValue = {
  [key: string]: unknown;
  protocolVersion?: unknown;
  type?: unknown;
  requestId?: unknown;
  command?: unknown;
  manualPaused?: unknown;
  paused?: unknown;
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

export function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (
    !isRecord(value) ||
    (value.protocolVersion !== 1 &&
      value.protocolVersion !== WEB_PROTOCOL_VERSION) ||
    typeof value.type !== "string"
  )
    return undefined;
  if (value.type === "initialize") {
    return hasExactKeys(value, ["protocolVersion", "type"])
      ? {
          protocolVersion: value.protocolVersion as WebProtocolVersion,
          type: "initialize"
        }
      : undefined;
  }
  if (
    value.type !== "command" ||
    !hasExactKeys(value, ["command", "protocolVersion", "requestId", "type"]) ||
    typeof value.requestId !== "string" ||
    value.requestId.length === 0 ||
    !isRecord(value.command)
  )
    return undefined;
  if (
    value.protocolVersion === WEB_PROTOCOL_VERSION &&
    value.command.type === "setManualPause" &&
    hasExactKeys(value.command, ["paused", "type"]) &&
    typeof value.command.paused === "boolean"
  ) {
    return {
      protocolVersion: WEB_PROTOCOL_VERSION,
      type: "command",
      requestId: value.requestId,
      command: { type: "setManualPause", paused: value.command.paused }
    };
  }
  if (
    value.protocolVersion === WEB_PROTOCOL_VERSION &&
    value.command.type === "commitManualResume" &&
    hasExactKeys(value.command, ["type"])
  ) {
    return {
      protocolVersion: WEB_PROTOCOL_VERSION,
      type: "command",
      requestId: value.requestId,
      command: { type: "commitManualResume" }
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
      value.protocolVersion !== WEB_PROTOCOL_VERSION) ||
    typeof value.type !== "string"
  )
    return undefined;
  if (value.type === "render_snapshot") {
    if (!hasExactKeys(value, ["protocolVersion", "snapshot", "type"]))
      return undefined;
    const snapshot = parseRenderSnapshot(value.snapshot);
    return snapshot === undefined
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
      return hasExactKeys(value, [
        "manualPaused",
        "phase",
        "protocolVersion",
        "type"
      ]) && typeof value.manualPaused === "boolean"
        ? {
            protocolVersion: WEB_PROTOCOL_VERSION,
            type: "snapshot",
            phase: "running",
            manualPaused: value.manualPaused
          }
        : undefined;
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
    if (
      !hasExactKeys(value, ["code", "message", "protocolVersion", "type"]) ||
      typeof value.code !== "string" ||
      typeof value.message !== "string"
    )
      return undefined;
    return {
      protocolVersion: value.protocolVersion as WebProtocolVersion,
      type: "failure",
      code: value.code,
      message: value.message
    };
  }
  if (
    value.type !== "result" ||
    !hasExactKeys(value, [
      "commands",
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
  const commands = value.commands;
  if (
    commands.length !== 1 ||
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
        hasExactKeys(envelope.command, ["atTick", "type"]) &&
        Number.isSafeInteger(envelope.command.atTick) &&
        (envelope.command.atTick as number) >= 0 &&
        envelope.command.atTick === envelope.tick &&
        envelope.command.type === "confirmPreparation"
    )
  )
    return undefined;
  return value as WorkerMessage;
}

export function failure(
  code: string,
  message: string,
  protocolVersion: WebProtocolVersion = WEB_PROTOCOL_VERSION
): WorkerMessage {
  return {
    protocolVersion,
    type: "failure",
    code,
    message
  };
}
