export type StableId = string & { readonly __stableId: unique symbol };

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface LevelDefinition {
  readonly kind: "level";
  readonly id: StableId;
  readonly waveIds: readonly StableId[];
}

export type ContentDefinition = LevelDefinition;

export interface ContentBundle {
  readonly schemaVersion: 1;
  readonly contentVersion: string;
  readonly definitions: readonly ContentDefinition[];
}

export interface ScenarioCommand {
  readonly atTick: number;
  readonly type: "confirmPreparation";
}

export interface ScenarioDefinition {
  readonly schemaVersion: 1;
  readonly id: StableId;
  readonly levelId: StableId;
  readonly seed: string;
  readonly maximumTicks: number;
  readonly commands: readonly ScenarioCommand[];
  readonly expectedTerminalResult?: TerminalResult;
}

export type SimulationPhase = "PREPARATION" | "COMBAT_RUNNING" | "TERMINAL";
export type TerminalResult = "victory" | "defeat";

export interface SimulationState {
  readonly schemaVersion: 1;
  readonly contentVersion: string;
  readonly tick: number;
  readonly seed: string;
  readonly rngState: number;
  readonly levelId: StableId;
  readonly phase: SimulationPhase;
  readonly eventSequence: number;
  readonly terminalResult?: TerminalResult;
}

export interface SimulationEvent {
  readonly id: string;
  readonly tick: number;
  readonly sequence: number;
  readonly type: "round.started" | "final_cleanup.entered" | "round.victory";
  readonly ruleId: string;
}

export interface CommandEnvelope {
  readonly tick: number;
  readonly sequence: number;
  readonly command: ScenarioCommand;
}

function serialize(value: unknown, path: string): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new TypeError(`${path} must be a safe non-negative-zero integer`);
      }
      return String(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item, index) => serialize(item, `${path}/${index}`)).join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${path} must contain only plain objects`);
      }

      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys
        .map(
          (key) =>
            `${JSON.stringify(key)}:${serialize(record[key], `${path}/${key}`)}`
        )
        .join(",")}}`;
    }
    default:
      throw new TypeError(`${path} contains unsupported ${typeof value}`);
  }
}

export function canonicalStringify(value: unknown): string {
  return serialize(value, "$");
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function canonicalHash(value: unknown): Promise<string> {
  return sha256Hex(canonicalStringify(value));
}
