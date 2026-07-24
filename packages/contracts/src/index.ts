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
export type AimPointId = StableId & { readonly __aimPointId: unique symbol };
export type OpaqueRegionId = StableId & {
  readonly __opaqueRegionId: unique symbol;
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
  readonly aimPointId: AimPointId;
  /** Authored gameplay order used to break equal-cost route choices. */
  readonly neighborNodeIds: readonly NavigationNodeId[];
}

export interface AimPointDefinition {
  readonly id: AimPointId;
  readonly x: number;
  readonly y: number;
}

/** Inclusive axis-aligned opaque rectangle in authored integer coordinates. */
export interface OpaqueRegionDefinition {
  readonly id: OpaqueRegionId;
  readonly minimumX: number;
  readonly minimumY: number;
  readonly maximumX: number;
  readonly maximumY: number;
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
  readonly aimPoints: readonly AimPointDefinition[];
  readonly opaqueRegions: readonly OpaqueRegionDefinition[];
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

export interface PendingSpawn {
  /** Stable authored spawn-event ID. */
  readonly id: StableId;
  /** Authored order within the level spawn schedule. */
  readonly authoredOrder: number;
  readonly entityId: EntityId;
  readonly entranceId: EnemyEntranceId;
}

export type SpawnAdmissionDecisionReason =
  | "admitted"
  | "entrance_occupied"
  | "earlier_spawn_pending"
  | "live_enemy_cap_reached";

export interface SpawnAdmissionDecision {
  readonly spawnId: StableId;
  readonly entityId: EntityId;
  readonly entranceId: EnemyEntranceId;
  readonly status: "admitted" | "queued";
  readonly reason: SpawnAdmissionDecisionReason;
}

export interface SpawnAdmissionLimits {
  readonly liveEnemyCap: number;
  /** Existing live enemies, excluding non-enemy navigation blockers. */
  readonly currentLiveEnemies: number;
}

export interface SpawnAdmissionResolution {
  readonly occupancy: readonly NavigationOccupant[];
  readonly pendingSpawns: readonly PendingSpawn[];
  readonly decisions: readonly SpawnAdmissionDecision[];
}

export interface BattlefieldState {
  readonly schemaVersion: 1;
  readonly mapId: StableId;
  readonly occupancy: readonly NavigationOccupant[];
  readonly pendingSpawns: readonly PendingSpawn[];
}

export type DwarfTargetPolicy =
  | "nearest"
  | "lowest_health"
  | "highest_health"
  | "highest_armor"
  | "fastest"
  | "boss_or_elite_first";

/** A living hostile already determined to be in range and line of sight. */
export interface DwarfTargetCandidate {
  readonly entityId: EntityId;
  readonly distanceSquared: number;
  readonly currentHealth: number;
  readonly maximumHealth: number;
  readonly armor: number;
  readonly speed: number;
  readonly isBoss: boolean;
  readonly isElite: boolean;
}

export interface DwarfTargetSelectionRequest {
  readonly requestedPolicy: DwarfTargetPolicy;
  readonly supportedPolicies: readonly DwarfTargetPolicy[];
  readonly candidates: readonly DwarfTargetCandidate[];
}

export type DwarfTargetSelectionReason =
  | "selected_requested_policy"
  | "fallback_unsupported_policy"
  | "fallback_no_preferred_target"
  | "no_valid_targets";

export interface DwarfTargetSelectionDecision {
  readonly requestedPolicy: DwarfTargetPolicy;
  readonly appliedPolicy: DwarfTargetPolicy;
  readonly targetEntityId?: EntityId;
  readonly reason: DwarfTargetSelectionReason;
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
  readonly battlefield?: BattlefieldState;
  readonly terminalResult?: TerminalResult;
}

export interface SimulationEventBase {
  readonly id: string;
  readonly tick: number;
  readonly sequence: number;
  readonly ruleId: string;
}

export interface LifecycleSimulationEvent extends SimulationEventBase {
  readonly type: "round.started" | "final_cleanup.entered" | "round.victory";
}

export interface SpawnSimulationEvent extends SimulationEventBase {
  readonly type: "spawn.admitted" | "spawn.queued";
  readonly spawnId: StableId;
  readonly entityId: EntityId;
  readonly entranceId: EnemyEntranceId;
  readonly reasonCode: SpawnAdmissionDecisionReason;
}

export interface MovementSimulationEvent extends SimulationEventBase {
  readonly type: "movement.moved" | "movement.waited" | "movement.rejected";
  readonly proposalId: StableId;
  readonly entityId: EntityId;
  readonly fromNodeId: NavigationNodeId;
  readonly toNodeId: NavigationNodeId;
  readonly reasonCode: MovementDecisionReason;
}

export type SimulationEvent =
  | LifecycleSimulationEvent
  | SpawnSimulationEvent
  | MovementSimulationEvent;

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
