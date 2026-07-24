import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  AuthoritativeCombatTickRequest,
  AuthoritativeCombatTickResolution,
  DwarfActionPhaseEntry,
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

function requireDataRecord(
  value: unknown,
  keys: readonly string[],
  description: string
): Record<string, unknown> {
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
  const record: Record<string, unknown> = {};
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
  // biome-ignore lint/complexity/useLiteralKeys: validated dynamic record
  if (input["schemaVersion"] !== 1)
    throw new RangeError(
      "authoritative combat tick request has unsupported schemaVersion"
    );
  // biome-ignore lint/complexity/useLiteralKeys: validated dynamic record
  const state = input["state"] as SimulationState;
  const dwarfActionEntries = requireDenseDataArray(
    // biome-ignore lint/complexity/useLiteralKeys: validated dynamic record
    input["dwarfActionEntries"],
    "authoritative combat tick dwarfActionEntries"
  ) as readonly DwarfActionPhaseEntry[];

  const scheduled = resolveScheduledBattlefieldPhase(
    state,
    content,
    [],
    undefined,
    dwarfAuthority
  );
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
  const resolvedState = Object.freeze({
    ...scheduled.state,
    battlefield: impacts.battlefield
  });

  return Object.freeze({
    schemaVersion: 1,
    state: resolvedState,
    events: scheduled.events,
    enemyPlanning,
    enemyActions,
    dwarfActions,
    enemyMovement,
    impacts
  });
}
