import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldDwarfCombatant,
  BattlefieldEnemyCombatant,
  ScenarioDefinition,
  SimulationState
} from "@dwarven-depths/contracts";
import {
  compareRenderIds,
  type RenderEntityV2,
  type RenderPhase,
  type RenderPosition,
  type RenderSnapshotV2
} from "./render-snapshot.js";

function positionFor(
  nodeId: string,
  positions: ReadonlyMap<string, RenderPosition>
): RenderPosition {
  const position = positions.get(nodeId);
  if (position === undefined)
    throw new Error(`Render occupancy references unknown node ${nodeId}.`);
  return position;
}

function facingFrom(
  current: RenderPosition,
  destination: RenderPosition | undefined,
  previous: RenderPosition | null
): RenderEntityV2["facing"] {
  const reference = destination ?? previous;
  if (reference === undefined || reference === null) return "south";
  const deltaX =
    destination === undefined
      ? current.x - reference.x
      : reference.x - current.x;
  const deltaY =
    destination === undefined
      ? current.y - reference.y
      : reference.y - current.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY))
    return deltaX >= 0 ? "east" : "west";
  return deltaY >= 0 ? "south" : "north";
}

function actionFor(
  state: SimulationState,
  combatant: BattlefieldDwarfCombatant | BattlefieldEnemyCombatant,
  moved: boolean
): RenderEntityV2["action"] {
  const ability = state.committedAbilities?.find(
    (candidate) => candidate.sourceEntityId === combatant.entityId
  );
  if (ability !== undefined)
    return {
      kind: "ability",
      phase: state.tick < ability.impactAtTick ? "committed" : "impact",
      abilityId: ability.abilityId
    };
  const attack = combatant.actionState.activeBasicAttack;
  if (attack !== null)
    return {
      kind: "basic_attack",
      phase:
        state.tick < attack.commitAtTick
          ? "windup"
          : state.tick < attack.impactAtTick
            ? "committed"
            : "impact",
      abilityId: null
    };
  if (
    combatant.actionState.cooldownCompleteAtTick !== null &&
    combatant.actionState.cooldownCompleteAtTick > state.tick
  )
    return { kind: "basic_attack", phase: "recovery", abilityId: null };
  return moved
    ? { kind: "moving", phase: "idle", abilityId: null }
    : { kind: "idle", phase: "idle", abilityId: null };
}

export function createPresentationSnapshot(
  content: CompiledContent,
  scenario: ScenarioDefinition,
  state: SimulationState,
  phase: RenderPhase,
  previous?: RenderSnapshotV2
): RenderSnapshotV2 {
  const level = content.levels.get(scenario.levelId);
  const map =
    level?.mapId === undefined ? undefined : content.maps.get(level.mapId);
  if (
    previous !== undefined &&
    (previous.scenarioId !== scenario.id ||
      previous.levelId !== scenario.levelId ||
      previous.mapId !== (map?.id ?? null) ||
      previous.tick >= state.tick)
  )
    throw new Error(
      "The previous presentation snapshot does not precede the same authored encounter."
    );
  const nodes = [...(map?.nodes ?? [])]
    .sort((left, right) => compareRenderIds(left.id, right.id))
    .map(({ id, x, y }) => ({ id, x, y }));
  const positions = new Map(
    nodes.map((node) => [node.id, { nodeId: node.id, x: node.x, y: node.y }])
  );
  const occupancy = new Map(
    (state.battlefield?.occupancy ?? []).map((entry) => [
      entry.entityId,
      entry.nodeId
    ])
  );
  const previousById = new Map(
    previous?.entities.map((entity) => [entity.id, entity])
  );
  const combatants = [
    ...(state.battlefield?.dwarfCombatants ?? []).map((combatant) => ({
      combatant,
      faction: "dwarf" as const,
      visualId: combatant.characterDefinitionId,
      archetype: "character" as const,
      elite: false,
      boss: false
    })),
    ...(state.battlefield?.enemyCombatants ?? []).map((combatant) => ({
      combatant,
      faction: "enemy" as const,
      visualId: combatant.enemyDefinitionId,
      archetype: combatant.classification,
      elite: combatant.classification === "elite",
      boss: combatant.classification === "boss"
    }))
  ];
  const entities: RenderEntityV2[] = [];
  for (const entry of combatants.sort((left, right) =>
    compareRenderIds(left.combatant.entityId, right.combatant.entityId)
  )) {
    if (entry.combatant.lifecycleState !== "active") continue;
    const nodeId = occupancy.get(entry.combatant.entityId);
    if (nodeId === undefined)
      throw new Error(
        `Active render combatant ${entry.combatant.entityId} has no occupancy.`
      );
    const position = positionFor(nodeId, positions);
    const previousPosition =
      previousById.get(entry.combatant.entityId)?.position ?? null;
    const moved =
      previousPosition !== null && previousPosition.nodeId !== position.nodeId;
    const targetEntityId = entry.combatant.actionState.currentTargetEntityId;
    const targetNodeId =
      targetEntityId === null ? undefined : occupancy.get(targetEntityId);
    const targetPosition =
      targetNodeId === undefined
        ? undefined
        : positionFor(targetNodeId, positions);
    entities.push({
      id: entry.combatant.entityId,
      nodeId,
      faction: entry.faction,
      visualId: entry.visualId,
      archetype: entry.archetype,
      position,
      previousPosition,
      currentHealth: entry.combatant.currentHealth,
      maximumHealth: entry.combatant.maximumHealth,
      facing: facingFrom(position, targetPosition, previousPosition),
      action: actionFor(state, entry.combatant, moved),
      targetEntityId,
      statuses: [...(state.activeStatuses ?? [])]
        .filter((status) => status.ownerEntityId === entry.combatant.entityId)
        .sort((left, right) => compareRenderIds(left.statusId, right.statusId))
        .map((status) => ({
          id: status.statusId,
          appliedAtTick: status.appliedAtTick,
          expiresAtTick: status.expiresAtTick,
          magnitude: status.magnitude
        })),
      transition:
        previousPosition === null ? "spawned" : moved ? "moving" : "active",
      elite: entry.elite,
      boss: entry.boss
    });
  }

  const entityIds = new Set(entities.map((entity) => entity.id));
  const lifecycleById = new Map<string, "active" | "downed" | "destroyed">(
    combatants.map((entry) => [
      entry.combatant.entityId,
      entry.combatant.lifecycleState
    ])
  );
  const transitionKinds = new Map<string, "spawned" | "downed" | "destroyed">();
  for (const entity of entities)
    if (!previousById.has(entity.id)) transitionKinds.set(entity.id, "spawned");
  for (const previousEntity of previous?.entities ?? []) {
    if (entityIds.has(previousEntity.id)) continue;
    transitionKinds.set(
      previousEntity.id,
      lifecycleById.get(previousEntity.id) === "downed" ? "downed" : "destroyed"
    );
  }
  const startedWaveIds = [...(state.battlefield?.startedWaveIds ?? [])].sort(
    compareRenderIds
  );
  const authoredActiveWaveId = state.battlefield?.startedWaveIds.at(-1) ?? null;
  return {
    schemaVersion: 2,
    scenarioId: scenario.id,
    levelId: scenario.levelId,
    mapId: map?.id ?? null,
    tick: state.tick,
    previousTick: previous?.tick ?? null,
    phase,
    nodes,
    connections: [...(map?.connections ?? [])]
      .sort((left, right) => compareRenderIds(left.id, right.id))
      .map(({ id, nodeIds }) => ({
        id,
        fromNodeId: nodeIds[0],
        toNodeId: nodeIds[1]
      })),
    entities,
    entityTransitions: [...transitionKinds]
      .sort(([left], [right]) => compareRenderIds(left, right))
      .map(([entityId, kind]) => ({ entityId, kind, atTick: state.tick })),
    encounter: {
      startedWaveIds,
      activeWaveId: authoredActiveWaveId,
      pendingSpawnCount: state.battlefield?.pendingSpawns.length ?? 0,
      livingHostileCount: entities.filter(
        (entity) => entity.faction === "enemy"
      ).length,
      terminalResult: state.terminalResult ?? null
    }
  };
}
