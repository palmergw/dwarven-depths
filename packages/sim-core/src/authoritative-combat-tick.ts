import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  AuthoritativeCombatTickRequest,
  AuthoritativeCombatTickResolution,
  BattlefieldState,
  DwarfActionPhaseEntry,
  EnemyBehaviorIntentDecision,
  EntityId,
  SimulationEvent,
  SimulationState
} from "@dwarven-depths/contracts";
import {
  type BattlefieldDwarfDeploymentAuthority,
  delayDwarfActionForEnemyBehavior,
  interceptDwarfTargetForEnemyBehavior,
  resolveBattlefieldAttackImpacts,
  resolveDwarfActionPhase
} from "./battlefield-attack-impact.js";
import { propagateBattlefieldRoundLineage } from "./battlefield-round-lineage.js";
import { resolveEnemyActionPhase } from "./enemy-action-phase.js";
import { deriveEnemyPlanningEntries } from "./enemy-movement-planning.js";
import {
  resolveEnemyMovementPhase,
  resolveScheduledBattlefieldPhase
} from "./index.js";

interface ParsedDataRecord extends Record<string, unknown> {
  readonly schemaVersion?: unknown;
  readonly state?: unknown;
  readonly dwarfActionEntries?: unknown;
  readonly contentVersion?: unknown;
  readonly tick?: unknown;
  readonly seed?: unknown;
  readonly rngState?: unknown;
  readonly levelId?: unknown;
  readonly phase?: unknown;
  readonly eventSequence?: unknown;
  readonly battlefield?: unknown;
}

function requireDataRecord(
  value: unknown,
  keys: readonly string[],
  description: string
): ParsedDataRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(`${description} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== keys.length ||
    !keys.every((key) => Object.hasOwn(descriptors, key))
  )
    throw new TypeError(
      `${description} must contain exactly the expected keys`
    );
  const record: ParsedDataRecord = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(`${description}.${key} must be own enumerable data`);
    record[key] = descriptor.value;
  }
  return record;
}

function requireDenseDataArray(
  value: unknown,
  description: string
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError(`${description} must be a standard array`);
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError(`${description} must be a dense data array`);
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `${description}[${index}] must be own enumerable data`
      );
    return descriptor.value;
  });
}

function requireNonNegativeSafeInteger(
  value: unknown,
  description: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

function normalizeCombatState(
  value: unknown,
  content: CompiledContent
): SimulationState {
  const state = requireDataRecord(
    value,
    [
      "schemaVersion",
      "contentVersion",
      "tick",
      "seed",
      "rngState",
      "levelId",
      "phase",
      "eventSequence",
      "battlefield"
    ],
    "authoritative combat tick state"
  );
  if (state.schemaVersion !== 1)
    throw new RangeError("combat state has unsupported schemaVersion");
  if (state.contentVersion !== content.bundle.contentVersion)
    throw new RangeError("combat state contentVersion does not match content");
  const tick = requireNonNegativeSafeInteger(state.tick, "combat state tick");
  if (
    typeof state.seed !== "string" ||
    !/^[1-9]\d{0,9}$/.test(state.seed) ||
    BigInt(state.seed) > 0xffff_ffffn
  )
    throw new RangeError("combat state seed must be a canonical uint32 string");
  const rngState = requireNonNegativeSafeInteger(
    state.rngState,
    "combat state rngState"
  );
  if (rngState > 0xffff_ffff)
    throw new RangeError("combat state rngState must be a uint32");
  if (
    typeof state.levelId !== "string" ||
    !content.levels.has(state.levelId as never)
  )
    throw new RangeError(
      "combat state levelId must reference compiled content"
    );
  if (state.phase !== "COMBAT_RUNNING")
    throw new RangeError("combat state phase must be COMBAT_RUNNING");
  const eventSequence = requireNonNegativeSafeInteger(
    state.eventSequence,
    "combat state eventSequence"
  );
  return Object.freeze({
    schemaVersion: 1,
    contentVersion: state.contentVersion,
    tick,
    seed: state.seed,
    rngState,
    levelId: state.levelId as SimulationState["levelId"],
    phase: "COMBAT_RUNNING",
    eventSequence,
    battlefield: state.battlefield as BattlefieldState
  });
}

function applyEnemyBehaviorEffects(
  battlefield: BattlefieldState,
  intents: readonly EnemyBehaviorIntentDecision[],
  currentTick: number,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldState {
  const committed = intents.filter(
    (intent) =>
      intent.effectStatus === "committed" &&
      intent.phaseStartedAtTick === currentTick
  );
  if (committed.length === 0) return battlefield;
  const hastedEnemies = new Set<EntityId>();
  const slowedDwarves = new Map<
    EntityId,
    { readonly delayTicks: number; readonly interruptWindup: boolean }
  >();
  const interceptions: Array<
    readonly [protectedEntityId: EntityId, guardEntityId: EntityId]
  > = [];
  for (const intent of committed) {
    if (intent.mechanic === "formation_command") {
      for (const enemy of battlefield.enemyCombatants)
        if (
          enemy.lifecycleState === "active" &&
          enemy.entityId !== intent.enemyEntityId
        ) {
          hastedEnemies.add(enemy.entityId);
        }
      continue;
    }
    const targetEntityId = intent.targetEntityId;
    if (targetEntityId === undefined) continue;
    if (intent.mechanic === "ally_haste") {
      hastedEnemies.add(targetEntityId);
    } else if (intent.mechanic === "target_intercept") {
      interceptions.push([targetEntityId, intent.enemyEntityId]);
    } else if (
      intent.mechanic === "attack_disrupt" ||
      intent.mechanic === "attack_slow"
    ) {
      const prior = slowedDwarves.get(targetEntityId);
      slowedDwarves.set(
        targetEntityId,
        Object.freeze({
          delayTicks: Math.max(prior?.delayTicks ?? 0, intent.effectMagnitude),
          interruptWindup:
            prior?.interruptWindup === true ||
            intent.mechanic === "attack_disrupt"
        })
      );
    }
  }
  const enemyCombatants = battlefield.enemyCombatants.map((enemy) => {
    if (!hastedEnemies.has(enemy.entityId)) return enemy;
    return Object.freeze({
      ...enemy,
      actionState: Object.freeze({
        ...enemy.actionState,
        cooldownCompleteAtTick: null
      })
    });
  });
  let resolved = Object.freeze({
    ...battlefield,
    enemyCombatants: Object.freeze(enemyCombatants),
    dwarfCombatants: battlefield.dwarfCombatants
  });
  propagateBattlefieldRoundLineage(battlefield, resolved);
  for (const [protectedEntityId, guardEntityId] of interceptions.sort(
    (left, right) =>
      left[0] < right[0]
        ? -1
        : left[0] > right[0]
          ? 1
          : left[1] < right[1]
            ? -1
            : left[1] > right[1]
              ? 1
              : 0
  ))
    resolved = interceptDwarfTargetForEnemyBehavior(
      resolved,
      protectedEntityId,
      guardEntityId,
      currentTick,
      content,
      authority
    );
  for (const [dwarfEntityId, slow] of [...slowedDwarves].sort(
    ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)
  ))
    resolved = delayDwarfActionForEnemyBehavior(
      resolved,
      dwarfEntityId,
      currentTick,
      slow.delayTicks,
      slow.interruptWindup,
      content,
      authority
    );
  return resolved;
}

/**
 * Composes the currently implemented authoritative battlefield boundaries in
 * fixed same-step order. Rewards, terminal evaluation, statuses, and death
 * triggers remain separate until their battlefield integration is contracted.
 */
export function resolveAuthoritativeCombatTick(
  request: AuthoritativeCombatTickRequest,
  content: CompiledContent,
  dwarfAuthority: BattlefieldDwarfDeploymentAuthority
): AuthoritativeCombatTickResolution {
  const input = requireDataRecord(
    request,
    ["schemaVersion", "state", "dwarfActionEntries"],
    "authoritative combat tick request"
  );
  if (input.schemaVersion !== 1)
    throw new RangeError(
      "authoritative combat tick request has unsupported schemaVersion"
    );
  const state = normalizeCombatState(input.state, content);
  const dwarfActionEntries = requireDenseDataArray(
    input.dwarfActionEntries,
    "authoritative combat tick dwarfActionEntries"
  ) as readonly DwarfActionPhaseEntry[];

  const scheduled = resolveScheduledBattlefieldPhase(
    state,
    content,
    [],
    undefined,
    dwarfAuthority
  );
  if (!Number.isSafeInteger(scheduled.state.eventSequence))
    throw new RangeError("scheduled combat events overflow eventSequence");
  const scheduledBattlefield = scheduled.state.battlefield;
  if (scheduledBattlefield === undefined)
    throw new Error("authoritative combat tick requires battlefield state");
  const common = {
    schemaVersion: 1 as const,
    currentTick: scheduled.state.tick,
    levelId: scheduled.state.levelId
  };
  const enemyPlanning = deriveEnemyPlanningEntries(
    { ...common, battlefield: scheduledBattlefield },
    content,
    dwarfAuthority
  );
  const enemyActions = resolveEnemyActionPhase(
    {
      ...common,
      battlefield: scheduledBattlefield,
      entries: enemyPlanning.entries
    },
    content,
    dwarfAuthority
  );
  const behaviorIntents = enemyActions.decisions.flatMap((decision) =>
    decision.behaviorIntent === undefined ? [] : [decision.behaviorIntent]
  );
  const behaviorBattlefield = applyEnemyBehaviorEffects(
    enemyActions.battlefield,
    behaviorIntents,
    scheduled.state.tick,
    content,
    dwarfAuthority
  );
  propagateBattlefieldRoundLineage(
    enemyActions.battlefield,
    behaviorBattlefield
  );
  const dwarfActions = resolveDwarfActionPhase(
    {
      ...common,
      battlefield: behaviorBattlefield,
      entries: dwarfActionEntries
    },
    content,
    dwarfAuthority
  );
  const enemyMovement = resolveEnemyMovementPhase(
    {
      ...common,
      battlefield: dwarfActions.battlefield,
      entries: enemyPlanning.entries
    },
    content,
    dwarfAuthority
  );
  const impacts = resolveBattlefieldAttackImpacts(
    { ...common, battlefield: enemyMovement.battlefield },
    content,
    dwarfAuthority
  );
  if (
    behaviorIntents.length + enemyMovement.reservations.decisions.length >
    Number.MAX_SAFE_INTEGER - scheduled.state.eventSequence
  )
    throw new RangeError("combat evidence events overflow eventSequence");
  const behaviorEvents: SimulationEvent[] = behaviorIntents.map(
    (intent, offset) => {
      const sequence = scheduled.state.eventSequence + offset;
      return Object.freeze({
        id: `event.${String(sequence).padStart(6, "0")}`,
        tick: scheduled.state.tick,
        sequence,
        type: "enemy.behavior.intent",
        ruleId: "SIM-ENEMY-BEHAVIOR-001",
        enemyEntityId: intent.enemyEntityId,
        roleId: intent.roleId,
        strategy: intent.strategy,
        mechanic: intent.mechanic,
        purposeId: intent.purposeId,
        counterplayId: intent.counterplayId,
        tellId: intent.tellId,
        effectId: intent.effectId,
        phase: intent.phase,
        phaseStartedAtTick: intent.phaseStartedAtTick,
        phaseCompletesAtTick: intent.phaseCompletesAtTick,
        ...(intent.targetEntityId === undefined
          ? {}
          : { targetEntityId: intent.targetEntityId }),
        effectStatus: intent.effectStatus,
        effectMagnitude: intent.effectMagnitude,
        reasonCode: intent.reason
      });
    }
  );
  const movementEvents: SimulationEvent[] =
    enemyMovement.reservations.decisions.map((decision, offset) => {
      const sequence =
        scheduled.state.eventSequence + behaviorEvents.length + offset;
      return Object.freeze({
        id: `event.${String(sequence).padStart(6, "0")}`,
        tick: scheduled.state.tick,
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
      });
    });
  const events = Object.freeze([
    ...scheduled.events,
    ...behaviorEvents,
    ...movementEvents
  ]);
  const resolvedState = Object.freeze({
    ...scheduled.state,
    eventSequence:
      scheduled.state.eventSequence +
      behaviorEvents.length +
      movementEvents.length,
    battlefield: impacts.battlefield
  });

  return Object.freeze({
    schemaVersion: 1,
    state: resolvedState,
    events,
    enemyPlanning,
    enemyActions,
    dwarfActions,
    enemyMovement,
    impacts
  });
}
