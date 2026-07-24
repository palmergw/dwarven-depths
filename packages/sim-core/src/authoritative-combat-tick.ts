import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  AuthoritativeCombatTickRequest,
  AuthoritativeCombatTickResolution,
  BattlefieldState,
  DwarfActionPhaseEntry,
  SimulationEvent,
  SimulationState
} from "@dwarven-depths/contracts";
import {
  type BattlefieldDwarfDeploymentAuthority,
  resolveBattlefieldAttackImpacts,
  resolveDwarfActionPhase
} from "./battlefield-attack-impact.js";
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
  const dwarfActions = resolveDwarfActionPhase(
    {
      ...common,
      battlefield: enemyActions.battlefield,
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
    enemyMovement.reservations.decisions.length >
    Number.MAX_SAFE_INTEGER - scheduled.state.eventSequence
  )
    throw new RangeError("movement events overflow eventSequence");
  const movementEvents: SimulationEvent[] =
    enemyMovement.reservations.decisions.map((decision, offset) => {
      const sequence = scheduled.state.eventSequence + offset;
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
  const events = Object.freeze([...scheduled.events, ...movementEvents]);
  const resolvedState = Object.freeze({
    ...scheduled.state,
    eventSequence: scheduled.state.eventSequence + movementEvents.length,
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
