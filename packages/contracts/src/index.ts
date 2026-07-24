export type StableId = string & { readonly __stableId: unique symbol };
export type EntityId = StableId & { readonly __entityId: unique symbol };
export type EffectId = StableId & { readonly __effectId: unique symbol };
export type NavigationNodeId = StableId & {
  readonly __navigationNodeId: unique symbol;
};
export type NavigationConnectionId = StableId & {
  readonly __navigationConnectionId: unique symbol;
};
export type PlacementPointId = StableId & {
  readonly __placementPointId: unique symbol;
};
export type EnemyEntranceId = StableId & {
  readonly __enemyEntranceId: unique symbol;
};

export interface StableEntityRecord {
  readonly id: EntityId;
}

export interface StableEffectRecord {
  readonly id: EffectId;
  readonly sourceEntityId: EntityId;
  readonly targetEntityId: EntityId;
}

export interface StableTablesSnapshot {
  readonly schemaVersion: 1;
  readonly entities: readonly StableEntityRecord[];
  readonly effects: readonly StableEffectRecord[];
}

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface LevelDefinition {
  readonly kind: "level";
  readonly id: StableId;
  readonly waveIds: readonly StableId[];
  readonly mapId?: StableId;
}

export interface WaveDefinition {
  readonly kind: "wave";
  readonly id: StableId;
  readonly durationTicks: number;
}

export interface NavigationNodeDefinition {
  readonly id: NavigationNodeId;
  readonly x: number;
  readonly y: number;
  /** Authored gameplay order used to break equal-cost route choices. */
  readonly neighborNodeIds: readonly NavigationNodeId[];
}

export interface NavigationConnectionDefinition {
  readonly id: NavigationConnectionId;
  readonly nodeIds: readonly [NavigationNodeId, NavigationNodeId];
  readonly cost: number;
}

export interface PlacementPointDefinition {
  readonly id: PlacementPointId;
  readonly nodeId: NavigationNodeId;
  readonly capacity: number;
  readonly adjacentPlacementPointIds: readonly PlacementPointId[];
}

export interface EnemyEntranceDefinition {
  readonly id: EnemyEntranceId;
  readonly nodeId: NavigationNodeId;
}

export interface BattlefieldMapDefinition {
  readonly kind: "map";
  readonly id: StableId;
  readonly nodes: readonly NavigationNodeDefinition[];
  readonly connections: readonly NavigationConnectionDefinition[];
  readonly placementPoints: readonly PlacementPointDefinition[];
  readonly enemyEntrances: readonly EnemyEntranceDefinition[];
}

export interface StaticDwarfPlacement {
  readonly entityId: EntityId;
  readonly placementPointId: PlacementPointId;
}

export type StaticPlacementIssueCode =
  | "duplicate_dwarf"
  | "unknown_placement_point"
  | "placement_capacity_exceeded"
  | "entrance_has_no_attack_route";

export interface StaticPlacementIssue {
  readonly path: string;
  readonly code: StaticPlacementIssueCode;
  readonly message: string;
  readonly relatedPaths?: readonly string[];
}

export interface StaticPlacementValidation {
  readonly valid: boolean;
  readonly issues: readonly StaticPlacementIssue[];
}

export interface NavigationOccupant {
  readonly entityId: EntityId;
  readonly nodeId: NavigationNodeId;
}

export interface MovementProposal {
  readonly id: StableId;
  readonly entityId: EntityId;
  readonly fromNodeId: NavigationNodeId;
  readonly toNodeId: NavigationNodeId;
}

export type MovementDecisionReason =
  | "moved"
  | "destination_occupied"
  | "destination_reserved"
  | "duplicate_entity_proposal"
  | "entity_not_occupied"
  | "source_mismatch"
  | "unknown_node"
  | "same_node"
  | "nodes_not_connected";

export interface MovementDecision {
  readonly proposalId: StableId;
  readonly entityId: EntityId;
  readonly fromNodeId: NavigationNodeId;
  readonly toNodeId: NavigationNodeId;
  readonly status: "moved" | "waited" | "rejected";
  readonly reason: MovementDecisionReason;
}

export interface MovementReservationResolution {
  readonly occupancy: readonly NavigationOccupant[];
  readonly decisions: readonly MovementDecision[];
}

export type ContentDefinition =
  | LevelDefinition
  | WaveDefinition
  | BattlefieldMapDefinition;

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

export interface ReplayCheckpoint {
  readonly tick: number;
  readonly stateChecksum: string;
  readonly eventStreamChecksum: string;
}

export interface ReplayDefinition {
  readonly schemaVersion: 1;
  readonly simulationSchemaVersion: 1;
  readonly contentVersion: string;
  readonly contentManifestHash: string;
  readonly scenarioId: StableId;
  readonly scenarioHash: string;
  readonly levelId: StableId;
  readonly seed: string;
  readonly rngAlgorithm: "xorshift32-v1";
  readonly commands: readonly CommandEnvelope[];
  readonly checkpoints: readonly ReplayCheckpoint[];
  readonly expectedTerminalResult: TerminalResult;
  readonly expectedTerminalTick: number;
}

export interface TimelineEventRecord {
  readonly schemaVersion: 1;
  readonly kind: "event";
  readonly tick: number;
  readonly sequence: number;
  readonly event: SimulationEvent;
}

export interface TimelineCheckpointRecord {
  readonly schemaVersion: 1;
  readonly kind: "checkpoint";
  readonly tick: number;
  readonly sequence: number;
  readonly checkpoint: ReplayCheckpoint;
}

export type TimelineRecord = TimelineEventRecord | TimelineCheckpointRecord;

export type DiagnosticCause =
  | {
      readonly kind: "command";
      readonly sequence: number;
      readonly atTick: number;
      readonly commandType: ScenarioCommand["type"];
    }
  | {
      readonly kind: "event";
      readonly eventId: string;
    };

export interface LifecycleDiagnosticRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly kind: "lifecycle";
  readonly tick: number;
  readonly sequence: number;
  readonly eventType: SimulationEvent["type"];
  readonly reasonCode: string;
  readonly eventId: string;
  readonly causes: readonly DiagnosticCause[];
}

function serialize(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>
): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new TypeError(
          `${path} must be a safe integer other than negative zero`
        );
      }
      return String(value);
    case "object": {
      if (Array.isArray(value)) {
        if (ancestors.has(value))
          throw new TypeError(`${path} contains a cycle`);
        ancestors.add(value);
        try {
          if (Reflect.ownKeys(value).length !== value.length + 1) {
            throw new TypeError(
              `${path} contains unsupported array properties`
            );
          }
          const items: string[] = [];
          for (let index = 0; index < value.length; index += 1) {
            const descriptor = Object.getOwnPropertyDescriptor(value, index);
            if (
              descriptor === undefined ||
              !descriptor.enumerable ||
              !("value" in descriptor)
            ) {
              throw new TypeError(`${path}/${index} is not an array data item`);
            }
            items.push(
              serialize(descriptor.value, `${path}/${index}`, ancestors)
            );
          }
          return `[${items.join(",")}]`;
        } finally {
          ancestors.delete(value);
        }
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${path} must contain only plain objects`);
      }
      if (ancestors.has(value)) throw new TypeError(`${path} contains a cycle`);

      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError(
            `${path}/${key} must be an enumerable data property`
          );
        }
      }
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError(`${path} contains unsupported symbol keys`);
      }

      ancestors.add(value);
      try {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        return `{${keys
          .map(
            (key) =>
              `${JSON.stringify(key)}:${serialize(record[key], `${path}/${key}`, ancestors)}`
          )
          .join(",")}}`;
      } finally {
        ancestors.delete(value);
      }
    }
    default:
      throw new TypeError(`${path} contains unsupported ${typeof value}`);
  }
}

export function canonicalStringify(value: unknown): string {
  return serialize(value, "$", new WeakSet());
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
