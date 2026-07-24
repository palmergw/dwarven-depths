import type { CompiledContent } from "@dwarven-depths/content-runtime";

export * from "./attack-commitment.js";
export * from "./combat-timers.js";
export * from "./committed-attack-impact.js";
export * from "./committed-combat-effects.js";
export * from "./death-resolution.js";
export * from "./death-trigger-resolution.js";
export * from "./enemy-target-acquisition.js";
export * from "./range-line-of-sight.js";
export * from "./stable-tables.js";
export * from "./target-locks.js";
export * from "./target-selection.js";

import {
  type BattlefieldMapDefinition,
  type BattlefieldState,
  type CommandEnvelope,
  canonicalHash,
  type EnemyEntranceId,
  type EntityId,
  type LifecycleSimulationEvent,
  type MovementDecision,
  type MovementProposal,
  type MovementReservationResolution,
  type NavigationNodeId,
  type NavigationOccupant,
  type PendingSpawn,
  type SimulationEvent,
  type SimulationState,
  type SpawnAdmissionDecision,
  type SpawnAdmissionLimits,
  type SpawnAdmissionResolution
} from "@dwarven-depths/contracts";

export interface StepResult {
  readonly state: SimulationState;
  readonly events: readonly SimulationEvent[];
}

function freezeBattlefieldState(
  mapId: BattlefieldState["mapId"],
  occupancy: readonly NavigationOccupant[],
  pendingSpawns: readonly PendingSpawn[]
): BattlefieldState {
  return Object.freeze({
    schemaVersion: 1,
    mapId,
    occupancy: Object.freeze(
      occupancy.map((occupant) => Object.freeze({ ...occupant }))
    ),
    pendingSpawns: Object.freeze(
      pendingSpawns.map((spawn) => Object.freeze({ ...spawn }))
    )
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function isDomainStableId(value: unknown, domain?: string): value is string {
  return (
    typeof value === "string" &&
    stableIdPattern.test(value) &&
    (domain === undefined || value.startsWith(`${domain}.`))
  );
}

function comparePendingSpawns(left: PendingSpawn, right: PendingSpawn): number {
  return (
    left.authoredOrder - right.authoredOrder ||
    compareText(left.id, right.id) ||
    compareText(left.entityId, right.entityId)
  );
}

function freezeSpawnDecision(
  spawn: PendingSpawn,
  status: SpawnAdmissionDecision["status"],
  reason: SpawnAdmissionDecision["reason"]
): SpawnAdmissionDecision {
  return Object.freeze({
    spawnId: spawn.id,
    entityId: spawn.entityId,
    entranceId: spawn.entranceId,
    status,
    reason
  });
}

/**
 * Admits one deterministic spawn phase. Each authored entrance admits at most
 * its oldest pending enemy; occupied entrances and a full live-enemy cap retain
 * enemies off-map in canonical queue order.
 */
export function admitQueuedSpawns(
  map: BattlefieldMapDefinition,
  occupancy: readonly NavigationOccupant[],
  pendingSpawns: readonly PendingSpawn[],
  limits?: SpawnAdmissionLimits
): SpawnAdmissionResolution {
  if (
    limits !== undefined &&
    (!Number.isSafeInteger(limits.liveEnemyCap) || limits.liveEnemyCap <= 0)
  ) {
    throw new RangeError("live-enemy cap must be a positive safe integer");
  }
  if (
    limits !== undefined &&
    (!Number.isSafeInteger(limits.currentLiveEnemies) ||
      limits.currentLiveEnemies < 0)
  ) {
    throw new RangeError(
      "current live-enemy count must be a non-negative safe integer"
    );
  }

  const nodes = new Set(map.nodes.map((node) => node.id));
  const entrances = new Map(
    map.enemyEntrances.map((entrance) => [entrance.id, entrance])
  );
  const occupantsByEntity = new Map<EntityId, NavigationOccupant>();
  const occupantsByNode = new Map<NavigationNodeId, NavigationOccupant>();
  for (const occupant of occupancy) {
    if (!isDomainStableId(occupant.entityId, "entity")) {
      throw new RangeError("occupancy entityId must be an entity.* stable ID");
    }
    if (!nodes.has(occupant.nodeId)) {
      throw new RangeError(
        `occupancy references unknown navigation node ID (${occupant.nodeId})`
      );
    }
    if (occupantsByEntity.has(occupant.entityId)) {
      throw new RangeError(
        `duplicate occupied entity ID (${occupant.entityId})`
      );
    }
    if (occupantsByNode.has(occupant.nodeId)) {
      throw new RangeError(
        `duplicate occupied navigation node ID (${occupant.nodeId})`
      );
    }
    occupantsByEntity.set(occupant.entityId, occupant);
    occupantsByNode.set(occupant.nodeId, occupant);
  }
  if (limits !== undefined && limits.currentLiveEnemies > occupancy.length) {
    throw new RangeError(
      "current live-enemy count cannot exceed occupied entity count"
    );
  }
  if (limits !== undefined && limits.currentLiveEnemies > limits.liveEnemyCap) {
    throw new RangeError("current live-enemy count exceeds live-enemy cap");
  }

  const spawnIds = new Set<string>();
  const spawnEntityIds = new Set<EntityId>();
  for (const spawn of pendingSpawns) {
    if (!isDomainStableId(spawn.id)) {
      throw new RangeError("pending spawn id must be a stable ID");
    }
    if (spawnIds.has(spawn.id)) {
      throw new RangeError(`duplicate pending spawn ID (${spawn.id})`);
    }
    spawnIds.add(spawn.id);
    if (!isDomainStableId(spawn.entityId, "entity")) {
      throw new RangeError(
        `pending spawn entityId must be an entity.* stable ID (${spawn.id})`
      );
    }
    if (spawnEntityIds.has(spawn.entityId)) {
      throw new RangeError(
        `duplicate pending spawn entity ID (${spawn.entityId})`
      );
    }
    spawnEntityIds.add(spawn.entityId);
    if (occupantsByEntity.has(spawn.entityId)) {
      throw new RangeError(
        `pending spawn entity is already occupied (${spawn.entityId})`
      );
    }
    if (!Number.isSafeInteger(spawn.authoredOrder) || spawn.authoredOrder < 0) {
      throw new RangeError(
        `pending spawn authoredOrder must be a non-negative safe integer (${spawn.id})`
      );
    }
    if (!entrances.has(spawn.entranceId)) {
      throw new RangeError(`unknown enemy entrance ID (${spawn.entranceId})`);
    }
  }

  const orderedSpawns = [...pendingSpawns].sort(comparePendingSpawns);
  const handledEntrances = new Set<EnemyEntranceId>();
  const admittedOccupants: NavigationOccupant[] = [];
  const remainingSpawns: PendingSpawn[] = [];
  const decisions: SpawnAdmissionDecision[] = [];

  for (const spawn of orderedSpawns) {
    const entrance = entrances.get(spawn.entranceId);
    if (entrance === undefined)
      throw new Error("validated entrance is missing");

    if (
      limits !== undefined &&
      limits.currentLiveEnemies + admittedOccupants.length >=
        limits.liveEnemyCap
    ) {
      remainingSpawns.push(Object.freeze({ ...spawn }));
      decisions.push(
        freezeSpawnDecision(spawn, "queued", "live_enemy_cap_reached")
      );
      handledEntrances.add(spawn.entranceId);
      continue;
    }
    if (handledEntrances.has(spawn.entranceId)) {
      remainingSpawns.push(Object.freeze({ ...spawn }));
      decisions.push(
        freezeSpawnDecision(spawn, "queued", "earlier_spawn_pending")
      );
      continue;
    }
    handledEntrances.add(spawn.entranceId);
    if (occupantsByNode.has(entrance.nodeId)) {
      remainingSpawns.push(Object.freeze({ ...spawn }));
      decisions.push(freezeSpawnDecision(spawn, "queued", "entrance_occupied"));
      continue;
    }

    const admitted = Object.freeze({
      entityId: spawn.entityId,
      nodeId: entrance.nodeId
    });
    admittedOccupants.push(admitted);
    occupantsByNode.set(entrance.nodeId, admitted);
    decisions.push(freezeSpawnDecision(spawn, "admitted", "admitted"));
  }

  const resolvedOccupancy = [...occupancy, ...admittedOccupants]
    .sort((left, right) => compareText(left.entityId, right.entityId))
    .map((occupant) => Object.freeze({ ...occupant }));

  return Object.freeze({
    occupancy: Object.freeze(resolvedOccupancy),
    pendingSpawns: Object.freeze(remainingSpawns),
    decisions: Object.freeze(decisions)
  });
}

function freezeDecision(
  proposal: MovementProposal,
  status: MovementDecision["status"],
  reason: MovementDecision["reason"]
): MovementDecision {
  return Object.freeze({
    proposalId: proposal.id,
    entityId: proposal.entityId,
    fromNodeId: proposal.fromNodeId,
    toNodeId: proposal.toNodeId,
    status,
    reason
  });
}

/**
 * Resolves one simultaneous movement-reservation phase against snapshot
 * occupancy. An occupied node remains unavailable for the entire phase, so a
 * proposal cannot follow, swap with, pass through, or push another occupant.
 */
export function resolveMovementReservations(
  map: BattlefieldMapDefinition,
  occupancy: readonly NavigationOccupant[],
  proposals: readonly MovementProposal[]
): MovementReservationResolution {
  const nodes = new Map(map.nodes.map((node) => [node.id, node]));
  const occupantsByEntity = new Map<EntityId, NavigationOccupant>();
  const occupantsByNode = new Map<NavigationNodeId, NavigationOccupant>();

  for (const occupant of occupancy) {
    if (!nodes.has(occupant.nodeId))
      throw new RangeError(
        `occupancy references unknown navigation node ID (${occupant.nodeId})`
      );
    if (occupantsByEntity.has(occupant.entityId))
      throw new RangeError(
        `duplicate occupied entity ID (${occupant.entityId})`
      );
    if (occupantsByNode.has(occupant.nodeId))
      throw new RangeError(
        `duplicate occupied navigation node ID (${occupant.nodeId})`
      );
    occupantsByEntity.set(occupant.entityId, occupant);
    occupantsByNode.set(occupant.nodeId, occupant);
  }

  const proposalIds = new Set<string>();
  const proposalCountByEntity = new Map<EntityId, number>();
  for (const proposal of proposals) {
    if (proposalIds.has(proposal.id))
      throw new RangeError(`duplicate movement proposal ID (${proposal.id})`);
    proposalIds.add(proposal.id);
    proposalCountByEntity.set(
      proposal.entityId,
      (proposalCountByEntity.get(proposal.entityId) ?? 0) + 1
    );
  }

  const orderedProposals = [...proposals].sort(
    (left, right) =>
      compareText(left.entityId, right.entityId) ||
      compareText(left.id, right.id)
  );
  const decisions = new Map<MovementProposal, MovementDecision>();
  const candidatesByDestination = new Map<
    NavigationNodeId,
    MovementProposal[]
  >();

  for (const proposal of orderedProposals) {
    if ((proposalCountByEntity.get(proposal.entityId) ?? 0) > 1) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "duplicate_entity_proposal")
      );
      continue;
    }
    const occupant = occupantsByEntity.get(proposal.entityId);
    if (occupant === undefined) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "entity_not_occupied")
      );
      continue;
    }
    if (occupant.nodeId !== proposal.fromNodeId) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "source_mismatch")
      );
      continue;
    }
    const fromNode = nodes.get(proposal.fromNodeId);
    if (fromNode === undefined || !nodes.has(proposal.toNodeId)) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "unknown_node")
      );
      continue;
    }
    if (proposal.fromNodeId === proposal.toNodeId) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "same_node")
      );
      continue;
    }
    if (!fromNode.neighborNodeIds.includes(proposal.toNodeId)) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "nodes_not_connected")
      );
      continue;
    }
    if (occupantsByNode.has(proposal.toNodeId)) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "waited", "destination_occupied")
      );
      continue;
    }
    const candidates = candidatesByDestination.get(proposal.toNodeId) ?? [];
    candidates.push(proposal);
    candidatesByDestination.set(proposal.toNodeId, candidates);
  }

  const movedNodeByEntity = new Map<EntityId, NavigationNodeId>();
  for (const candidates of candidatesByDestination.values()) {
    candidates.sort(
      (left, right) =>
        compareText(left.entityId, right.entityId) ||
        compareText(left.id, right.id)
    );
    candidates.forEach((proposal, index) => {
      if (index === 0) {
        movedNodeByEntity.set(proposal.entityId, proposal.toNodeId);
        decisions.set(proposal, freezeDecision(proposal, "moved", "moved"));
      } else {
        decisions.set(
          proposal,
          freezeDecision(proposal, "waited", "destination_reserved")
        );
      }
    });
  }

  const resolvedOccupancy = [...occupantsByEntity.values()]
    .sort((left, right) => compareText(left.entityId, right.entityId))
    .map((occupant) =>
      Object.freeze({
        entityId: occupant.entityId,
        nodeId: movedNodeByEntity.get(occupant.entityId) ?? occupant.nodeId
      })
    );
  const resolvedDecisions = orderedProposals.map((proposal) => {
    const decision = decisions.get(proposal);
    if (decision === undefined)
      throw new Error(`movement proposal ${proposal.id} was not resolved`);
    return decision;
  });

  return Object.freeze({
    occupancy: Object.freeze(resolvedOccupancy),
    decisions: Object.freeze(resolvedDecisions)
  });
}

export function seedToUint32(seed: string): number {
  if (seed.length > 10 || !/^[1-9]\d*$/.test(seed)) {
    throw new RangeError(
      "seed must be a canonical integer between 1 and 4294967295"
    );
  }
  const value = BigInt(seed);
  if (value > 0xffff_ffffn) {
    throw new RangeError(
      "seed must be a canonical integer between 1 and 4294967295"
    );
  }
  return Number(value);
}

export function nextUint32(state: number): number {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function createInitialState(
  content: CompiledContent,
  levelId: SimulationState["levelId"],
  seed: string
): SimulationState {
  const level = content.levels.get(levelId);
  if (level === undefined) throw new Error(`Unknown level ID: ${levelId}`);
  const battlefield =
    level.mapId === undefined
      ? undefined
      : freezeBattlefieldState(level.mapId, [], []);
  return Object.freeze({
    schemaVersion: 1,
    contentVersion: content.bundle.contentVersion,
    tick: 0,
    seed,
    rngState: seedToUint32(seed),
    levelId,
    phase: "PREPARATION",
    eventSequence: 0,
    ...(battlefield === undefined ? {} : { battlefield })
  });
}

/**
 * Resolves the battlefield portions of one simulation step in the fixed rule
 * order: enqueue scheduled spawns, admit queues, then arbitrate movement.
 */
export function resolveBattlefieldPhase(
  state: SimulationState,
  content: CompiledContent,
  scheduledSpawns: readonly PendingSpawn[],
  proposals: readonly MovementProposal[],
  limits?: SpawnAdmissionLimits
): StepResult {
  const level = content.levels.get(state.levelId);
  if (level === undefined)
    throw new Error(`Unknown level ID: ${state.levelId}`);
  if (state.battlefield === undefined)
    throw new Error(`level ${state.levelId} does not have battlefield state`);
  if (level.mapId === undefined || state.battlefield.mapId !== level.mapId) {
    throw new Error(
      `battlefield map ${state.battlefield.mapId} does not match level map`
    );
  }
  const map = content.maps.get(level.mapId);
  if (map === undefined) throw new Error(`Unknown map ID: ${level.mapId}`);

  const admitted = admitQueuedSpawns(
    map,
    state.battlefield.occupancy,
    [...state.battlefield.pendingSpawns, ...scheduledSpawns],
    limits
  );
  const moved = resolveMovementReservations(map, admitted.occupancy, proposals);
  const events: SimulationEvent[] = [];

  for (const decision of admitted.decisions) {
    const sequence = state.eventSequence + events.length;
    events.push(
      Object.freeze({
        id: `event.${String(sequence).padStart(6, "0")}`,
        tick: state.tick,
        sequence,
        type:
          decision.status === "admitted" ? "spawn.admitted" : "spawn.queued",
        ruleId: "SIM-SPAWN-ADMISSION-001",
        spawnId: decision.spawnId,
        entityId: decision.entityId,
        entranceId: decision.entranceId,
        reasonCode: decision.reason
      })
    );
  }
  for (const decision of moved.decisions) {
    const sequence = state.eventSequence + events.length;
    events.push(
      Object.freeze({
        id: `event.${String(sequence).padStart(6, "0")}`,
        tick: state.tick,
        sequence,
        type:
          decision.status === "moved"
            ? "movement.moved"
            : decision.status === "waited"
              ? "movement.waited"
              : "movement.rejected",
        ruleId: "SIM-MOVEMENT-RESERVATION-001",
        proposalId: decision.proposalId,
        entityId: decision.entityId,
        fromNodeId: decision.fromNodeId,
        toNodeId: decision.toNodeId,
        reasonCode: decision.reason
      })
    );
  }

  return Object.freeze({
    state: Object.freeze({
      ...state,
      eventSequence: state.eventSequence + events.length,
      battlefield: freezeBattlefieldState(
        level.mapId,
        moved.occupancy,
        admitted.pendingSpawns
      )
    }),
    events: Object.freeze(events)
  });
}

function event(
  state: SimulationState,
  offset: number,
  type: LifecycleSimulationEvent["type"],
  ruleId: string
): LifecycleSimulationEvent {
  const sequence = state.eventSequence + offset;
  return {
    id: `event.${String(sequence).padStart(6, "0")}`,
    tick: state.tick,
    sequence,
    type,
    ruleId
  };
}

export function stepSimulation(
  state: SimulationState,
  commands: readonly CommandEnvelope[],
  content: CompiledContent
): StepResult {
  if (state.phase === "TERMINAL") return { state, events: [] };

  const accepted = commands
    .filter(
      (envelope) =>
        envelope.tick === state.tick &&
        envelope.command.atTick === envelope.tick &&
        envelope.command.type === "confirmPreparation"
    )
    .sort((left, right) => left.sequence - right.sequence);

  if (state.phase === "PREPARATION" && accepted.length > 0) {
    const level = content.levels.get(state.levelId);
    if (!level) throw new Error(`Unknown level ID: ${state.levelId}`);

    const events: SimulationEvent[] = [
      event(state, 0, "round.started", "SIM-LIFECYCLE-001")
    ];
    if (level.waveIds.length === 0) {
      events.push(
        event(state, 1, "final_cleanup.entered", "SIM-FINAL-CLEANUP-001")
      );
      events.push(event(state, 2, "round.victory", "SIM-VICTORY-001"));
      return {
        state: {
          ...state,
          phase: "TERMINAL",
          terminalResult: "victory",
          eventSequence: state.eventSequence + events.length
        },
        events
      };
    }

    return {
      state: {
        ...state,
        tick: state.tick + 1,
        phase: "COMBAT_RUNNING",
        eventSequence: state.eventSequence + events.length
      },
      events
    };
  }

  if (state.phase === "PREPARATION") return { state, events: [] };

  return {
    state: {
      ...state,
      tick: state.tick + 1
    },
    events: []
  };
}

export async function stateChecksum(state: SimulationState): Promise<string> {
  return canonicalHash(state);
}
