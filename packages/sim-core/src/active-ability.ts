import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  AbilityActivationDecision,
  AbilityActivationReason,
  AbilityImpactDecision,
  ActivateAbilityCommand,
  ActiveAbilityTickRequest,
  ActiveAbilityTickResolution,
  ActiveCooldown,
  ActiveStatus,
  BattlefieldEnemyCombatant,
  BattlefieldState,
  CommandEnvelope,
  CommittedActiveAbility,
  EntityId,
  NavigationNodeDefinition,
  StableId,
  StatusApplicationDecision
} from "@dwarven-depths/contracts";
import {
  authorizeActiveAbilityEnemyHealth,
  type BattlefieldDwarfDeploymentAuthority,
  interruptUncommittedDwarfAttackForActiveAbility
} from "./battlefield-attack-impact.js";
import { propagateBattlefieldRoundLineage } from "./battlefield-round-lineage.js";
import {
  applyStatusApplications,
  resolveCombatTimers
} from "./combat-timers.js";

const SHIELD_SLAM_ID = "ability.iron_warden.shield_slam";
const STAGGER_STATUS_ID = "status.staggered";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cooldownId(ownerEntityId: EntityId, abilityId: StableId): StableId {
  return `${abilityId}.cooldown.${ownerEntityId.replaceAll(".", "_")}` as StableId;
}

function activationDecision(
  envelope: CommandEnvelope & { readonly command: ActivateAbilityCommand },
  status: AbilityActivationDecision["status"],
  reason: AbilityActivationReason,
  timing?: {
    readonly committedAtTick: number;
    readonly impactAtTick: number;
    readonly cooldownCompleteAtTick: number;
  }
): AbilityActivationDecision {
  return Object.freeze({
    schemaVersion: 1,
    sequence: envelope.sequence,
    dwarfEntityId: envelope.command.dwarfEntityId,
    abilityId: envelope.command.abilityId,
    status,
    reason,
    ...timing
  });
}

function nodeForEntity(
  battlefield: BattlefieldState,
  nodes: ReadonlyMap<string, NavigationNodeDefinition>,
  entityId: EntityId
): NavigationNodeDefinition | undefined {
  const occupant = battlefield.occupancy.find(
    (item) => item.entityId === entityId
  );
  return occupant === undefined ? undefined : nodes.get(occupant.nodeId);
}

export function isPointInsideActiveAbilityCone(
  ability: CommittedActiveAbility,
  target: Pick<NavigationNodeDefinition, "x" | "y">
): boolean {
  const deltaX = BigInt(target.x - ability.sourceX);
  const deltaY = BigInt(target.y - ability.sourceY);
  const distanceSquared = deltaX * deltaX + deltaY * deltaY;
  const range = BigInt(ability.range);
  if (distanceSquared > range * range) return false;
  const aimX = BigInt(ability.aimDeltaX);
  const aimY = BigInt(ability.aimDeltaY);
  const dot = aimX * deltaX + aimY * deltaY;
  if (dot < 0n) return false;
  if (ability.frontalHalfAngleDegrees === 90) return true;
  const aimSquared = aimX * aimX + aimY * aimY;
  const product = aimSquared * distanceSquared;
  const dotSquared = dot * dot;
  switch (ability.frontalHalfAngleDegrees) {
    case 0:
      return dotSquared === product;
    case 30:
      return 4n * dotSquared >= 3n * product;
    case 45:
      return 2n * dotSquared >= product;
    case 60:
      return 4n * dotSquared >= product;
  }
}

function freezeEnemy(
  enemy: BattlefieldEnemyCombatant,
  currentHealth: number,
  activeBasicAttack: BattlefieldEnemyCombatant["actionState"]["activeBasicAttack"],
  staggerExpiresAtTick: number
): BattlefieldEnemyCombatant {
  const suppressUncommittedWork =
    activeBasicAttack === null ||
    activeBasicAttack.commitAtTick > staggerExpiresAtTick;
  const minimumMovementTick = Math.max(
    enemy.actionState.nextMovementAtTick,
    staggerExpiresAtTick
  );
  const movementIntervalsSinceAdmission = Math.ceil(
    (minimumMovementTick - enemy.admittedAtTick) / enemy.movementIntervalTicks
  );
  return Object.freeze({
    ...enemy,
    currentHealth,
    lifecycleState: currentHealth === 0 ? "destroyed" : enemy.lifecycleState,
    basicAttack: Object.freeze({ ...enemy.basicAttack }),
    actionState: Object.freeze({
      ...enemy.actionState,
      nextMovementAtTick:
        enemy.admittedAtTick +
        movementIntervalsSinceAdmission * enemy.movementIntervalTicks,
      cooldownCompleteAtTick: suppressUncommittedWork
        ? Math.max(
            enemy.actionState.cooldownCompleteAtTick ?? 0,
            enemy.admittedAtTick + enemy.basicAttack.cooldownTicks,
            staggerExpiresAtTick
          )
        : enemy.actionState.cooldownCompleteAtTick,
      activeBasicAttack:
        activeBasicAttack === null
          ? null
          : Object.freeze({ ...activeBasicAttack })
    })
  });
}

/** True through the tick before expiry; phase-4 expiry makes the enemy eligible on the expiry tick. */
export function isEnemyStaggered(
  statuses: readonly ActiveStatus[],
  enemyEntityId: EntityId,
  currentTick: number
): boolean {
  return statuses.some(
    (status) =>
      status.statusId === STAGGER_STATUS_ID &&
      status.ownerEntityId === enemyEntityId &&
      status.expiresAtTick > currentTick
  );
}

/**
 * Resolves the complete deterministic active-ability boundary for one tick.
 * Timer expiry precedes command admission; Shield Slam impacts are returned for
 * application before ordinary committed basic-attack impacts.
 */
export function resolveActiveAbilityTick(
  request: ActiveAbilityTickRequest,
  content: CompiledContent,
  authority?: BattlefieldDwarfDeploymentAuthority
): ActiveAbilityTickResolution {
  if (request.schemaVersion !== 1)
    throw new RangeError(
      "active ability request has unsupported schemaVersion"
    );
  if (!Number.isSafeInteger(request.currentTick) || request.currentTick < 0)
    throw new RangeError(
      "active ability tick must be a non-negative safe integer"
    );

  const timers = resolveCombatTimers({
    currentTick: request.currentTick,
    cooldowns: request.cooldowns,
    statuses: request.statuses
  });
  const cooldowns: ActiveCooldown[] = [...timers.cooldowns];
  let statuses: readonly ActiveStatus[] = timers.statuses;
  let committedAbilities: CommittedActiveAbility[] = [
    ...request.committedAbilities
  ];
  const activations: AbilityActivationDecision[] = [];
  const impacts: AbilityImpactDecision[] = [];
  const statusApplicationDecisions: StatusApplicationDecision[] = [];
  let battlefield = request.battlefield;
  const map = content.maps.get(battlefield.mapId);
  if (map === undefined)
    throw new RangeError("active ability battlefield map is unknown");
  const nodes = new Map(map.nodes.map((node) => [node.id, node] as const));

  const commands = request.commands
    .filter(
      (
        envelope
      ): envelope is CommandEnvelope & {
        readonly command: ActivateAbilityCommand;
      } => envelope.command.type === "activateAbility"
    )
    .sort((left, right) => left.sequence - right.sequence);
  if (
    new Set(commands.map(({ sequence }) => sequence)).size !== commands.length
  )
    throw new RangeError("duplicate active ability command sequence");
  const commanded = new Set<string>();

  for (const envelope of commands) {
    if (
      envelope.tick !== request.currentTick ||
      envelope.command.atTick !== request.currentTick ||
      !Number.isSafeInteger(envelope.sequence) ||
      envelope.sequence < 0
    )
      throw new RangeError(
        "active ability command envelope does not match its tick"
      );
    const command = envelope.command;
    const key = `${command.dwarfEntityId}\u0000${command.abilityId}`;
    if (commanded.has(key)) {
      activations.push(
        activationDecision(envelope, "rejected", "duplicate_ability_command")
      );
      continue;
    }
    commanded.add(key);
    if (request.phase !== "COMBAT_RUNNING") {
      activations.push(
        activationDecision(envelope, "rejected", "phase_unavailable")
      );
      continue;
    }
    const dwarf = battlefield.dwarfCombatants.find(
      ({ entityId }) => entityId === command.dwarfEntityId
    );
    if (dwarf === undefined) {
      activations.push(
        activationDecision(envelope, "rejected", "owner_unavailable")
      );
      continue;
    }
    if (dwarf.lifecycleState === "downed") {
      activations.push(
        activationDecision(envelope, "rejected", "owner_downed")
      );
      continue;
    }
    const character = content.characters.get(dwarf.characterDefinitionId);
    const ability = character?.activeAbilities?.find(
      ({ id }) => id === command.abilityId
    );
    if (ability === undefined || ability.id !== SHIELD_SLAM_ID) {
      activations.push(
        activationDecision(envelope, "rejected", "ability_unsupported")
      );
      continue;
    }
    if (
      cooldowns.some(
        (cooldown) =>
          cooldown.ownerEntityId === command.dwarfEntityId &&
          cooldown.cooldownId === cooldownId(command.dwarfEntityId, ability.id)
      )
    ) {
      activations.push(
        activationDecision(envelope, "rejected", "cooldown_active")
      );
      continue;
    }
    if (
      (dwarf.actionState.activeBasicAttack !== null &&
        dwarf.actionState.activeBasicAttack.commitAtTick <=
          request.currentTick) ||
      battlefield.pendingCommittedAttacks.some(
        ({ sourceEntityId }) => sourceEntityId === command.dwarfEntityId
      ) ||
      committedAbilities.some(
        ({ sourceEntityId }) => sourceEntityId === command.dwarfEntityId
      )
    ) {
      activations.push(
        activationDecision(envelope, "rejected", "committed_action_conflict")
      );
      continue;
    }
    const placement = map.placementPoints.find(
      ({ id }) => id === dwarf.placementPointId
    );
    const sourceNode =
      placement === undefined ? undefined : nodes.get(placement.nodeId);
    const eligibleTargets = battlefield.enemyCombatants
      .filter(
        (enemy) => enemy.lifecycleState === "active" && enemy.currentHealth > 0
      )
      .map((enemy) => ({
        enemy,
        node: nodeForEntity(battlefield, nodes, enemy.entityId)
      }))
      .filter(
        (
          entry
        ): entry is {
          enemy: BattlefieldEnemyCombatant;
          node: NavigationNodeDefinition;
        } => entry.node !== undefined
      );
    const retainedTarget = eligibleTargets.find(
      ({ enemy }) => enemy.entityId === dwarf.actionState.currentTargetEntityId
    );
    const target =
      retainedTarget ??
      (sourceNode === undefined
        ? undefined
        : eligibleTargets.sort((left, right) => {
            const leftX = left.node.x - sourceNode.x;
            const leftY = left.node.y - sourceNode.y;
            const rightX = right.node.x - sourceNode.x;
            const rightY = right.node.y - sourceNode.y;
            return (
              leftX * leftX +
                leftY * leftY -
                (rightX * rightX + rightY * rightY) ||
              compareText(left.enemy.entityId, right.enemy.entityId)
            );
          })[0]);
    const targetNode = target === undefined ? undefined : target.node;
    if (
      sourceNode === undefined ||
      targetNode === undefined ||
      (sourceNode.x === targetNode.x && sourceNode.y === targetNode.y)
    ) {
      activations.push(
        activationDecision(envelope, "rejected", "target_or_facing_unavailable")
      );
      continue;
    }
    battlefield = interruptUncommittedDwarfAttackForActiveAbility(
      battlefield,
      dwarf.entityId,
      request.currentTick,
      content,
      authority
    );
    const impactAtTick =
      request.currentTick + ability.windupTicks + ability.impactDelayTicks;
    const cooldownCompleteAtTick = request.currentTick + ability.cooldownTicks;
    if (
      !Number.isSafeInteger(impactAtTick) ||
      !Number.isSafeInteger(cooldownCompleteAtTick)
    )
      throw new RangeError("active ability timing exceeds safe integer bounds");
    committedAbilities.push(
      Object.freeze({
        schemaVersion: 1,
        abilityId: ability.id,
        sourceEntityId: dwarf.entityId,
        commitmentSequence: envelope.sequence,
        committedAtTick: request.currentTick,
        impactAtTick,
        sourceX: sourceNode.x,
        sourceY: sourceNode.y,
        aimDeltaX: targetNode.x - sourceNode.x,
        aimDeltaY: targetNode.y - sourceNode.y,
        damage: ability.damage,
        range: ability.range,
        frontalHalfAngleDegrees: ability.frontalHalfAngleDegrees,
        staggerTicks: ability.staggerTicks
      })
    );
    cooldowns.push(
      Object.freeze({
        schemaVersion: 1,
        cooldownId: cooldownId(dwarf.entityId, ability.id),
        ownerEntityId: dwarf.entityId,
        startedAtTick: request.currentTick,
        completeAtTick: cooldownCompleteAtTick
      })
    );
    activations.push(
      activationDecision(envelope, "accepted", "ability_committed", {
        committedAtTick: request.currentTick,
        impactAtTick,
        cooldownCompleteAtTick
      })
    );
  }

  const due = committedAbilities
    .filter(({ impactAtTick }) => impactAtTick === request.currentTick)
    .sort(
      (left, right) =>
        left.commitmentSequence - right.commitmentSequence ||
        compareText(left.sourceEntityId, right.sourceEntityId)
    );
  committedAbilities = committedAbilities.filter(
    ({ impactAtTick }) => impactAtTick > request.currentTick
  );
  for (const ability of due) {
    const targets = battlefield.enemyCombatants
      .filter(
        (enemy) => enemy.lifecycleState === "active" && enemy.currentHealth > 0
      )
      .map((enemy) => ({
        enemy,
        node: nodeForEntity(battlefield, nodes, enemy.entityId)
      }))
      .filter(
        (
          entry
        ): entry is {
          enemy: BattlefieldEnemyCombatant;
          node: NavigationNodeDefinition;
        } =>
          entry.node !== undefined &&
          isPointInsideActiveAbilityCone(ability, entry.node)
      )
      .sort((left, right) => {
        const leftX = left.node.x - ability.sourceX;
        const leftY = left.node.y - ability.sourceY;
        const rightX = right.node.x - ability.sourceX;
        const rightY = right.node.y - ability.sourceY;
        return (
          leftX * leftX + leftY * leftY - (rightX * rightX + rightY * rightY) ||
          compareText(left.enemy.entityId, right.enemy.entityId)
        );
      });
    const targetIds = new Set(targets.map(({ enemy }) => enemy.entityId));
    const interrupted: StableId[] = [];
    const enemyCombatants = battlefield.enemyCombatants.map((enemy) => {
      if (!targetIds.has(enemy.entityId)) return enemy;
      const windup = enemy.actionState.activeBasicAttack;
      const interrupt =
        windup !== null && windup.commitAtTick > request.currentTick;
      if (interrupt) interrupted.push(windup.attackId);
      return freezeEnemy(
        enemy,
        Math.max(0, enemy.currentHealth - ability.damage),
        interrupt ? null : windup,
        request.currentTick + ability.staggerTicks
      );
    });
    const livingTargets = enemyCombatants.filter(
      (enemy) =>
        targetIds.has(enemy.entityId) && enemy.lifecycleState === "active"
    );
    const statusApplication = applyStatusApplications({
      currentTick: request.currentTick,
      statuses,
      applications: livingTargets.map((enemy) => ({
        schemaVersion: 1,
        statusId: STAGGER_STATUS_ID as never,
        ownerEntityId: enemy.entityId,
        durationTicks: ability.staggerTicks,
        magnitude: 1
      }))
    });
    statuses = statusApplication.statuses;
    statusApplicationDecisions.push(...statusApplication.decisions);
    const living = new Set(
      enemyCombatants
        .filter(({ lifecycleState }) => lifecycleState === "active")
        .map(({ entityId }) => entityId)
    );
    statuses = statuses.filter(({ ownerEntityId }) =>
      living.has(ownerEntityId)
    );
    const impactedBattlefield = Object.freeze({
      ...battlefield,
      enemyCombatants: Object.freeze(enemyCombatants),
      occupancy: Object.freeze(
        battlefield.occupancy.filter(
          ({ entityId }) => !targetIds.has(entityId) || living.has(entityId)
        )
      )
    });
    propagateBattlefieldRoundLineage(battlefield, impactedBattlefield);
    battlefield = impactedBattlefield;
    impacts.push(
      Object.freeze({
        schemaVersion: 1,
        abilityId: ability.abilityId,
        sourceEntityId: ability.sourceEntityId,
        targetEntityIds: Object.freeze(
          targets.map(({ enemy }) => enemy.entityId)
        ),
        interruptedAttackIds: Object.freeze(interrupted.sort(compareText)),
        statusId: STAGGER_STATUS_ID as never,
        damage: ability.damage,
        staggerExpiresAtTick: request.currentTick + ability.staggerTicks,
        reason: "shield_slam_impacted"
      })
    );
  }

  if (authority !== undefined && battlefield !== request.battlefield)
    authorizeActiveAbilityEnemyHealth(
      authority,
      content,
      request.battlefield,
      battlefield
    );
  return Object.freeze({
    schemaVersion: 1,
    battlefield,
    cooldowns: Object.freeze(
      cooldowns.sort(
        (left, right) =>
          compareText(left.ownerEntityId, right.ownerEntityId) ||
          compareText(left.cooldownId, right.cooldownId)
      )
    ),
    statuses: Object.freeze([...statuses]),
    committedAbilities: Object.freeze(committedAbilities),
    activations: Object.freeze(activations),
    impacts: Object.freeze(impacts),
    cooldownDecisions: timers.cooldownDecisions,
    statusDecisions: timers.statusDecisions,
    statusApplicationDecisions: Object.freeze(statusApplicationDecisions)
  });
}
