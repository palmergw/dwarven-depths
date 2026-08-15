import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldAttackImpactRequest,
  BattlefieldAttackImpactResolution,
  BattlefieldDwarfCombatant,
  BattlefieldEnemyCombatant,
  BattlefieldState,
  CommittedAttack,
  DwarfActionPhaseRequest,
  DwarfActionPhaseResolution,
  DwarfDeployment,
  EntityId,
  NavigationOccupant,
  PlacementPointId,
  StableId
} from "@dwarven-depths/contracts";
import {
  type BattlefieldRoundLineage,
  claimBattlefieldPreparationLineage,
  getBattlefieldRoundParent,
  propagateBattlefieldRoundLineage,
  requireBattlefieldRoundLineage
} from "./battlefield-round-lineage.js";
import { resolveCommittedAttackImpacts } from "./committed-attack-impact.js";
import { resolveZeroHealthLifecycles } from "./death-resolution.js";
import { resolveNormalizedDwarfActions } from "./dwarf-action-phase.js";
import { normalizeAuthoritativeBattlefieldEnemyState } from "./enemy-movement-planning.js";

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export interface BattlefieldDwarfDeploymentAuthority {
  readonly schemaVersion: 1;
  readonly mapId: StableId;
  readonly deployments: readonly DwarfDeployment[];
}

export interface BattlefieldCharacterModifiers {
  readonly schemaVersion: 1;
  readonly characterDefinitionId: StableId;
  readonly maximumHealthAdd: number;
  readonly attackDamageAdd: number;
  readonly attackRangeAdd: number;
  readonly futureCooldownReductionTicks: number;
}

const deploymentAuthorityMetadata = new WeakMap<
  BattlefieldDwarfDeploymentAuthority,
  {
    readonly content: CompiledContent;
    readonly lineage: BattlefieldRoundLineage;
    readonly committedAttacks: Map<StableId, CommittedAttack>;
    readonly pendingAttacksByBattlefield: WeakMap<
      BattlefieldState,
      ReadonlyMap<StableId, EntityId>
    >;
    readonly dwarfHealthByBattlefield: WeakMap<
      BattlefieldState,
      ReadonlyMap<
        EntityId,
        Readonly<{
          currentHealth: number;
          lifecycleState: BattlefieldDwarfCombatant["lifecycleState"];
        }>
      >
    >;
    readonly enemyHealthByBattlefield: WeakMap<
      BattlefieldState,
      ReadonlyMap<
        EntityId,
        Readonly<{
          currentHealth: number;
          lifecycleState: BattlefieldEnemyCombatant["lifecycleState"];
        }>
      >
    >;
    readonly dwarfActionStates: Map<
      EntityId,
      BattlefieldDwarfCombatant["actionState"]
    >;
    readonly characterModifiers: Map<StableId, BattlefieldCharacterModifiers>;
    deploymentBattlefield?: BattlefieldState;
  }
>();

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freezeBattlefield(
  battlefield: BattlefieldState,
  occupancy: readonly NavigationOccupant[],
  dwarfCombatants: readonly BattlefieldDwarfCombatant[],
  pendingCommittedAttacks: BattlefieldState["pendingCommittedAttacks"],
  enemyCombatants: readonly BattlefieldEnemyCombatant[] = battlefield.enemyCombatants
): BattlefieldState {
  const result = Object.freeze({
    schemaVersion: 1,
    mapId: battlefield.mapId,
    startedWaveIds: Object.freeze([...battlefield.startedWaveIds]),
    firedSpawnIds: Object.freeze([...battlefield.firedSpawnIds]),
    occupancy: Object.freeze(
      occupancy.map((item) => Object.freeze({ ...item }))
    ),
    pendingSpawns: Object.freeze(
      battlefield.pendingSpawns.map((item) => Object.freeze({ ...item }))
    ),
    enemyAdmissions: Object.freeze(
      battlefield.enemyAdmissions.map((item) => Object.freeze({ ...item }))
    ),
    enemyCombatants: Object.freeze(
      enemyCombatants.map((item) =>
        Object.freeze({
          ...item,
          basicAttack: Object.freeze({ ...item.basicAttack }),
          actionState: Object.freeze({
            ...item.actionState,
            activeBasicAttack:
              item.actionState.activeBasicAttack === null
                ? null
                : Object.freeze({ ...item.actionState.activeBasicAttack })
          })
        })
      )
    ),
    dwarfCombatants: Object.freeze(
      dwarfCombatants.map((item) =>
        Object.freeze({
          ...item,
          basicAttack: Object.freeze({ ...item.basicAttack }),
          actionState: Object.freeze({
            ...item.actionState,
            activeBasicAttack:
              item.actionState.activeBasicAttack === null
                ? null
                : Object.freeze({ ...item.actionState.activeBasicAttack })
          })
        })
      )
    ),
    pendingCommittedAttacks: Object.freeze(
      pendingCommittedAttacks.map((item) => Object.freeze({ ...item }))
    )
  });
  propagateBattlefieldRoundLineage(battlefield, result);
  return result;
}

function requireRecord(
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
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(`${description}.${key} must be own enumerable data`);
    result[key] = descriptor.value;
  }
  return result;
}

function requireArray(value: unknown, description: string): readonly unknown[] {
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
        `${description} item ${index} must be own enumerable data`
      );
    return descriptor.value;
  });
}

function requireId(
  value: unknown,
  domain: string,
  description: string
): StableId {
  if (
    typeof value !== "string" ||
    !stableIdPattern.test(value) ||
    !value.startsWith(`${domain}.`)
  )
    throw new RangeError(`${description} must be a ${domain}.* stable ID`);
  return value as StableId;
}

function requireHealth(value: unknown, description: string): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

function requireCharacterModifiers(
  value: unknown,
  description: string
): BattlefieldCharacterModifiers {
  const record = requireRecord(
    value,
    [
      "schemaVersion",
      "characterDefinitionId",
      "maximumHealthAdd",
      "attackDamageAdd",
      "attackRangeAdd",
      "futureCooldownReductionTicks"
    ],
    description
  );
  if (record["schemaVersion"] !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  return Object.freeze({
    schemaVersion: 1,
    characterDefinitionId: requireId(
      record["characterDefinitionId"],
      "character",
      `${description} characterDefinitionId`
    ),
    maximumHealthAdd: requireHealth(
      record["maximumHealthAdd"],
      `${description} maximumHealthAdd`
    ),
    attackDamageAdd: requireHealth(
      record["attackDamageAdd"],
      `${description} attackDamageAdd`
    ),
    attackRangeAdd: requireHealth(
      record["attackRangeAdd"],
      `${description} attackRangeAdd`
    ),
    futureCooldownReductionTicks: requireHealth(
      record["futureCooldownReductionTicks"],
      `${description} futureCooldownReductionTicks`
    )
  });
}

function addModifier(
  base: number,
  addition: number,
  description: string
): number {
  const resolved = base + addition;
  if (!Number.isSafeInteger(resolved))
    throw new RangeError(`${description} exceeds safe integer range`);
  return resolved;
}

function modifiedCharacterStats(
  character: NonNullable<ReturnType<CompiledContent["characters"]["get"]>>,
  modifiers: BattlefieldCharacterModifiers | undefined
) {
  return Object.freeze({
    maximumHealth: addModifier(
      character.maximumHealth,
      modifiers?.maximumHealthAdd ?? 0,
      "modified character maximumHealth"
    ),
    basicAttack: Object.freeze({
      ...character.basicAttack,
      cooldownTicks: Math.max(
        1,
        character.basicAttack.cooldownTicks -
          (modifiers?.futureCooldownReductionTicks ?? 0)
      ),
      damage: addModifier(
        character.basicAttack.damage,
        modifiers?.attackDamageAdd ?? 0,
        "modified character attack damage"
      ),
      range: addModifier(
        character.basicAttack.range,
        modifiers?.attackRangeAdd ?? 0,
        "modified character attack range"
      )
    })
  });
}

function assertAcceptedDwarfActionState(
  value: unknown,
  expected: BattlefieldDwarfCombatant["actionState"],
  description: string
): BattlefieldDwarfCombatant["actionState"] {
  const record = requireRecord(
    value,
    [
      "schemaVersion",
      "currentTargetEntityId",
      "activeBasicAttack",
      "cooldownCompleteAtTick"
    ],
    description
  );
  if (
    record["schemaVersion"] !== expected.schemaVersion ||
    record["currentTargetEntityId"] !== expected.currentTargetEntityId ||
    record["cooldownCompleteAtTick"] !== expected.cooldownCompleteAtTick
  )
    throw new RangeError(
      `${description} does not match accepted action evidence`
    );
  const active = record["activeBasicAttack"];
  if (expected.activeBasicAttack === null) {
    if (active !== null)
      throw new RangeError(
        `${description} does not match accepted action evidence`
      );
  } else {
    const parsed = requireRecord(
      active,
      [
        "schemaVersion",
        "attackId",
        "sourceEntityId",
        "targetEntityId",
        "startedAtTick",
        "commitAtTick",
        "impactAtTick",
        "cooldownDurationTicks",
        "damage",
        "range",
        "targetIsValid"
      ],
      `${description} activeBasicAttack`
    );
    for (const key of [
      "schemaVersion",
      "attackId",
      "sourceEntityId",
      "targetEntityId",
      "startedAtTick",
      "commitAtTick",
      "impactAtTick",
      "cooldownDurationTicks",
      "damage",
      "range",
      "targetIsValid"
    ] as const)
      if (parsed[key] !== expected.activeBasicAttack[key])
        throw new RangeError(
          `${description} does not match accepted action evidence`
        );
  }
  return Object.freeze({
    ...expected,
    activeBasicAttack:
      expected.activeBasicAttack === null
        ? null
        : Object.freeze({ ...expected.activeBasicAttack })
  });
}

/** Accepts a preparation choice once for use by later mutable phases. */
export function createBattlefieldDwarfDeploymentAuthority(
  value: readonly DwarfDeployment[],
  preparationBattlefield: BattlefieldState,
  content: CompiledContent
): BattlefieldDwarfDeploymentAuthority {
  const mapId = preparationBattlefield.mapId;
  const map = content.maps.get(mapId);
  if (map === undefined)
    throw new RangeError(`unknown battlefield map (${mapId})`);
  const placements = new Set(map.placementPoints.map((point) => point.id));
  const entities = new Set<EntityId>();
  const placementIds = new Set<PlacementPointId>();
  const deployments = requireArray(value, "dwarf deployment authority").map(
    (item, index): DwarfDeployment => {
      const record = requireRecord(
        item,
        ["entityId", "characterDefinitionId", "placementPointId"],
        `dwarf deployment authority ${index}`
      );
      const entityId = requireId(
        record["entityId"],
        "entity",
        `dwarf deployment authority ${index} entityId`
      ) as EntityId;
      const characterDefinitionId = requireId(
        record["characterDefinitionId"],
        "character",
        `dwarf deployment authority ${index} characterDefinitionId`
      );
      const placementPointId = requireId(
        record["placementPointId"],
        "placement",
        `dwarf deployment authority ${index} placementPointId`
      ) as PlacementPointId;
      if (content.characters.get(characterDefinitionId) === undefined)
        throw new RangeError(
          `dwarf deployment authority ${index} references unknown character`
        );
      if (!placements.has(placementPointId))
        throw new RangeError(
          `dwarf deployment authority ${index} references unknown placement`
        );
      if (entities.has(entityId) || placementIds.has(placementPointId))
        throw new RangeError(
          "dwarf deployment authority duplicates an entity or placement"
        );
      entities.add(entityId);
      placementIds.add(placementPointId);
      return Object.freeze({
        entityId,
        characterDefinitionId,
        placementPointId
      });
    }
  );
  const authority = Object.freeze({
    schemaVersion: 1 as const,
    mapId,
    deployments: Object.freeze(
      deployments.sort((left, right) =>
        compareText(left.entityId, right.entityId)
      )
    )
  });
  const lineage = claimBattlefieldPreparationLineage(
    preparationBattlefield,
    content
  );
  deploymentAuthorityMetadata.set(authority, {
    content,
    lineage,
    committedAttacks: new Map(),
    pendingAttacksByBattlefield: new WeakMap([
      [preparationBattlefield, new Map()]
    ]),
    dwarfHealthByBattlefield: new WeakMap([
      [preparationBattlefield, new Map()]
    ]),
    enemyHealthByBattlefield: new WeakMap(),
    dwarfActionStates: new Map(
      deployments.map((deployment) => [
        deployment.entityId,
        Object.freeze({
          schemaVersion: 1 as const,
          currentTargetEntityId: null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        })
      ])
    ),
    characterModifiers: new Map()
  });
  return authority;
}

function requireAuthorityMetadata(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent
) {
  const metadata = deploymentAuthorityMetadata.get(authority);
  if (metadata?.content !== content)
    throw new RangeError(
      "dwarf deployment authority was not accepted for this content"
    );
  return metadata;
}

/** Records immutable attack commitment evidence produced by the action phase. */
export function authorizeBattlefieldCommittedAttacks(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  attacks: readonly CommittedAttack[],
  battlefield: BattlefieldState
): void {
  const metadata = requireAuthorityMetadata(authority, content);
  const pending = new Map<StableId, EntityId>();
  for (const attack of attacks) {
    const existing = metadata.committedAttacks.get(attack.attackId);
    if (
      existing !== undefined &&
      (existing.sourceEntityId !== attack.sourceEntityId ||
        existing.targetEntityId !== attack.targetEntityId ||
        existing.committedAtTick !== attack.committedAtTick ||
        existing.impactAtTick !== attack.impactAtTick ||
        existing.cooldownCompleteAtTick !== attack.cooldownCompleteAtTick ||
        existing.damage !== attack.damage ||
        existing.range !== attack.range)
    )
      throw new RangeError(
        `committed attack conflicts with accepted evidence (${attack.attackId})`
      );
    metadata.committedAttacks.set(
      attack.attackId,
      Object.freeze({ ...attack })
    );
    pending.set(attack.attackId, attack.targetEntityId);
  }
  metadata.pendingAttacksByBattlefield.set(battlefield, pending);
}

/** Returns the accepted target identity for each action-phase commitment. */
export function getAuthorizedCommittedAttackTargets(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  battlefield: BattlefieldState
): ReadonlyMap<StableId, EntityId> {
  const metadata = requireAuthorityMetadata(authority, content);
  const descendants: BattlefieldState[] = [];
  const visited = new Set<BattlefieldState>();
  let current = battlefield;
  let accepted = metadata.pendingAttacksByBattlefield.get(current);
  while (accepted === undefined) {
    if (visited.has(current))
      throw new RangeError(
        "battlefield pending-attack lineage contains a cycle"
      );
    visited.add(current);
    descendants.push(current);
    const parent = getBattlefieldRoundParent(current);
    if (parent === undefined)
      throw new RangeError(
        "battlefield lacks authoritative pending-attack lineage"
      );
    current = parent;
    accepted = metadata.pendingAttacksByBattlefield.get(current);
  }
  for (const descendant of descendants.reverse()) {
    const actual = new Map(
      descendant.pendingCommittedAttacks.map((attack) => [
        attack.attackId,
        attack.targetEntityId
      ])
    );
    if (
      actual.size !== accepted.size ||
      [...accepted].some(
        ([attackId, targetId]) => actual.get(attackId) !== targetId
      )
    )
      throw new RangeError(
        "persisted committed attacks do not match authoritative pending attacks"
      );
    metadata.pendingAttacksByBattlefield.set(descendant, accepted);
  }
  return new Map(accepted);
}

/** Returns complete accepted snapshots for the battlefield's pending attacks. */
export function getAuthorizedCommittedAttacks(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  battlefield: BattlefieldState
): ReadonlyMap<StableId, CommittedAttack> {
  const metadata = requireAuthorityMetadata(authority, content);
  const targets = getAuthorizedCommittedAttackTargets(
    authority,
    content,
    battlefield
  );
  return new Map(
    [...targets].map(([attackId, targetEntityId]) => {
      const attack = metadata.committedAttacks.get(attackId);
      if (attack?.targetEntityId !== targetEntityId)
        throw new RangeError(
          `pending attack lacks complete accepted evidence (${attackId})`
        );
      return [attackId, attack] as const;
    })
  );
}

function authorizeBattlefieldDwarfHealth(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  battlefield: BattlefieldState,
  dwarves: readonly BattlefieldDwarfCombatant[]
): void {
  const metadata = requireAuthorityMetadata(authority, content);
  const health = new Map<
    EntityId,
    Readonly<{
      currentHealth: number;
      lifecycleState: BattlefieldDwarfCombatant["lifecycleState"];
    }>
  >();
  for (const dwarf of dwarves) {
    if (health.has(dwarf.entityId))
      throw new RangeError("authoritative dwarf health duplicates an entity");
    health.set(
      dwarf.entityId,
      Object.freeze({
        currentHealth: dwarf.currentHealth,
        lifecycleState: dwarf.lifecycleState
      })
    );
  }
  metadata.dwarfHealthByBattlefield.set(battlefield, health);
}

function getInheritedBattlefieldDwarfHealth(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  battlefield: BattlefieldState
): ReadonlyMap<
  EntityId,
  Readonly<{
    currentHealth: number;
    lifecycleState: BattlefieldDwarfCombatant["lifecycleState"];
  }>
> {
  const metadata = requireAuthorityMetadata(authority, content);
  const visited = new Set<BattlefieldState>();
  let current = battlefield;
  let accepted = metadata.dwarfHealthByBattlefield.get(current);
  while (accepted === undefined) {
    if (visited.has(current))
      throw new RangeError("battlefield dwarf-health lineage contains a cycle");
    visited.add(current);
    const parent = getBattlefieldRoundParent(current);
    if (parent === undefined)
      throw new RangeError(
        "battlefield lacks authoritative dwarf-health lineage"
      );
    current = parent;
    accepted = metadata.dwarfHealthByBattlefield.get(current);
  }
  return accepted;
}

function getInheritedBattlefieldEnemyHealth(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  battlefield: BattlefieldState
):
  | ReadonlyMap<
      EntityId,
      Readonly<{
        currentHealth: number;
        lifecycleState: BattlefieldEnemyCombatant["lifecycleState"];
      }>
    >
  | undefined {
  const metadata = requireAuthorityMetadata(authority, content);
  const visited = new Set<BattlefieldState>();
  let current: BattlefieldState | undefined = battlefield;
  while (current !== undefined) {
    if (visited.has(current))
      throw new RangeError("battlefield enemy-health lineage contains a cycle");
    visited.add(current);
    const accepted = metadata.enemyHealthByBattlefield.get(current);
    if (accepted !== undefined) return accepted;
    current = getBattlefieldRoundParent(current);
  }
  return undefined;
}

/** Rejects caller-authored enemy health after admission or an impact transition. */
export function validateBattlefieldEnemyHealth(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  battlefield: BattlefieldState,
  enemies: readonly BattlefieldEnemyCombatant[]
): void {
  const accepted = getInheritedBattlefieldEnemyHealth(
    authority,
    content,
    battlefield
  );
  for (const enemy of enemies) {
    const prior = accepted?.get(enemy.entityId);
    if (
      prior === undefined
        ? enemy.currentHealth !== enemy.maximumHealth ||
          enemy.lifecycleState !== "active"
        : prior.currentHealth !== enemy.currentHealth ||
          prior.lifecycleState !== enemy.lifecycleState
    )
      throw new RangeError(
        `battlefield enemy health/lifecycle does not match authoritative evidence (${enemy.entityId})`
      );
  }
  if (
    accepted !== undefined &&
    [...accepted.keys()].some(
      (entityId) => !enemies.some((enemy) => enemy.entityId === entityId)
    )
  )
    throw new RangeError(
      "battlefield enemy health/lifecycle omits authoritative evidence"
    );
}

function authorizeBattlefieldEnemyHealth(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  battlefield: BattlefieldState,
  enemies: readonly BattlefieldEnemyCombatant[]
): void {
  const metadata = requireAuthorityMetadata(authority, content);
  metadata.enemyHealthByBattlefield.set(
    battlefield,
    new Map(
      enemies.map((enemy) => [
        enemy.entityId,
        Object.freeze({
          currentHealth: enemy.currentHealth,
          lifecycleState: enemy.lifecycleState
        })
      ])
    )
  );
}

/** Records enemy health emitted by the trusted active-ability producer. */
export function authorizeActiveAbilityEnemyHealth(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  source: BattlefieldState,
  target: BattlefieldState
): void {
  requireDeploymentAuthority(authority, source, content);
  validateBattlefieldEnemyHealth(
    authority,
    content,
    source,
    source.enemyCombatants
  );
  requireDeploymentAuthority(authority, target, content);
  authorizeBattlefieldEnemyHealth(
    authority,
    content,
    target,
    target.enemyCombatants
  );
}

/** Cancels a dwarf windup when an accepted active ability takes precedence. */
export function interruptUncommittedDwarfAttackForActiveAbility(
  source: BattlefieldState,
  dwarfEntityId: EntityId,
  currentTick: number,
  content: CompiledContent,
  authority?: BattlefieldDwarfDeploymentAuthority
): BattlefieldState {
  if (authority !== undefined)
    requireDeploymentAuthority(authority, source, content);
  const dwarf = source.dwarfCombatants.find(
    (combatant) => combatant.entityId === dwarfEntityId
  );
  const windup = dwarf?.actionState.activeBasicAttack;
  if (
    dwarf === undefined ||
    windup == null ||
    windup.commitAtTick <= currentTick
  )
    return source;
  const dwarfCombatants = source.dwarfCombatants.map((combatant) =>
    combatant.entityId === dwarfEntityId
      ? Object.freeze({
          ...combatant,
          actionState: Object.freeze({
            ...combatant.actionState,
            activeBasicAttack: null,
            cooldownCompleteAtTick: null
          })
        })
      : combatant
  );
  const target = freezeBattlefield(
    source,
    source.occupancy,
    dwarfCombatants,
    source.pendingCommittedAttacks
  );
  if (authority !== undefined)
    acceptDwarfActionTransition(
      authority,
      content,
      source.dwarfCombatants,
      target.dwarfCombatants
    );
  return target;
}

/** Applies an authored hostile disruption through the accepted dwarf-action authority. */
export function delayDwarfActionForEnemyBehavior(
  source: BattlefieldState,
  dwarfEntityId: EntityId,
  currentTick: number,
  delayTicks: number,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldState {
  requireDeploymentAuthority(authority, source, content);
  if (!Number.isSafeInteger(delayTicks) || delayTicks <= 0)
    throw new RangeError(
      "enemy behavior delay must be a positive safe integer"
    );
  const completeAtTick = currentTick + delayTicks;
  if (!Number.isSafeInteger(completeAtTick))
    throw new RangeError("enemy behavior delay exceeds safe integer bounds");
  const dwarfCombatants = source.dwarfCombatants.map((combatant) =>
    combatant.entityId === dwarfEntityId &&
    combatant.lifecycleState === "active"
      ? Object.freeze({
          ...combatant,
          actionState: Object.freeze({
            ...combatant.actionState,
            activeBasicAttack:
              combatant.actionState.activeBasicAttack?.commitAtTick !==
                undefined &&
              combatant.actionState.activeBasicAttack.commitAtTick <=
                currentTick
                ? combatant.actionState.activeBasicAttack
                : null,
            cooldownCompleteAtTick: Math.max(
              combatant.actionState.cooldownCompleteAtTick ?? 0,
              completeAtTick
            )
          })
        })
      : combatant
  );
  const target = freezeBattlefield(
    source,
    source.occupancy,
    dwarfCombatants,
    source.pendingCommittedAttacks
  );
  acceptDwarfActionTransition(
    authority,
    content,
    source.dwarfCombatants,
    target.dwarfCombatants
  );
  return target;
}

function sameDwarfActionState(
  left: BattlefieldDwarfCombatant["actionState"],
  right: BattlefieldDwarfCombatant["actionState"]
): boolean {
  if (
    left.schemaVersion !== right.schemaVersion ||
    left.currentTargetEntityId !== right.currentTargetEntityId ||
    left.cooldownCompleteAtTick !== right.cooldownCompleteAtTick
  )
    return false;
  const leftAttack = left.activeBasicAttack;
  const rightAttack = right.activeBasicAttack;
  if (leftAttack === null || rightAttack === null)
    return leftAttack === rightAttack;
  return (
    leftAttack.schemaVersion === rightAttack.schemaVersion &&
    leftAttack.attackId === rightAttack.attackId &&
    leftAttack.sourceEntityId === rightAttack.sourceEntityId &&
    leftAttack.targetEntityId === rightAttack.targetEntityId &&
    leftAttack.startedAtTick === rightAttack.startedAtTick &&
    leftAttack.commitAtTick === rightAttack.commitAtTick &&
    leftAttack.impactAtTick === rightAttack.impactAtTick &&
    leftAttack.cooldownDurationTicks === rightAttack.cooldownDurationTicks &&
    leftAttack.damage === rightAttack.damage &&
    leftAttack.range === rightAttack.range &&
    leftAttack.targetIsValid === rightAttack.targetIsValid
  );
}

function acceptDwarfActionTransition(
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  previous: readonly BattlefieldDwarfCombatant[],
  next: readonly BattlefieldDwarfCombatant[]
): void {
  const metadata = requireAuthorityMetadata(authority, content);
  const previousById = new Map(previous.map((item) => [item.entityId, item]));
  if (previous.length !== next.length)
    throw new RangeError("dwarf action transition changed deployment identity");
  for (const combatant of next) {
    const prior = previousById.get(combatant.entityId);
    const accepted = metadata.dwarfActionStates.get(combatant.entityId);
    if (
      prior === undefined ||
      accepted === undefined ||
      !sameDwarfActionState(prior.actionState, accepted)
    )
      throw new RangeError(
        "dwarf action transition lacks accepted prior state"
      );
  }
  for (const combatant of next)
    metadata.dwarfActionStates.set(combatant.entityId, combatant.actionState);
}

function requireDeploymentAuthority(
  authority: BattlefieldDwarfDeploymentAuthority,
  battlefield: BattlefieldState,
  content: CompiledContent
): readonly DwarfDeployment[] {
  const metadata = requireAuthorityMetadata(authority, content);
  requireBattlefieldRoundLineage(battlefield, content, metadata.lineage);
  if (metadata.content !== content || authority.mapId !== battlefield.mapId)
    throw new RangeError(
      "dwarf deployment authority was not accepted for this content and map"
    );
  return authority.deployments;
}

function _normalizeOccupancy(
  value: unknown,
  content: CompiledContent,
  mapId: StableId
): readonly NavigationOccupant[] {
  const map = content.maps.get(mapId);
  if (map === undefined)
    throw new RangeError(`unknown battlefield map (${mapId})`);
  const knownNodes = new Set(map.nodes.map((node) => node.id));
  const seenEntities = new Set<EntityId>();
  const seenNodes = new Set<NavigationOccupant["nodeId"]>();
  const occupancy = requireArray(value, "battlefield occupancy").map(
    (item, index): NavigationOccupant => {
      const record = requireRecord(
        item,
        ["entityId", "nodeId"],
        `battlefield occupant ${index}`
      );
      const entityId = requireId(
        record["entityId"],
        "entity",
        `battlefield occupant ${index} entityId`
      ) as EntityId;
      const nodeId = requireId(
        record["nodeId"],
        "node",
        `battlefield occupant ${index} nodeId`
      ) as NavigationOccupant["nodeId"];
      if (!knownNodes.has(nodeId))
        throw new RangeError(
          `battlefield occupant ${index} references unknown node`
        );
      if (seenEntities.has(entityId) || seenNodes.has(nodeId))
        throw new RangeError(
          "battlefield occupancy contains a duplicate entity or node"
        );
      seenEntities.add(entityId);
      seenNodes.add(nodeId);
      return Object.freeze({ entityId, nodeId });
    }
  );
  return Object.freeze(
    occupancy.sort((left, right) => compareText(left.entityId, right.entityId))
  );
}

function _normalizeEnemyCombatants(
  battlefield: BattlefieldState,
  content: CompiledContent,
  levelId: StableId,
  currentTick: number
): readonly BattlefieldEnemyCombatant[] {
  const level = content.levels.get(levelId);
  if (level === undefined) throw new RangeError(`unknown level (${levelId})`);
  const authoredSpawns = new Map<
    EntityId,
    {
      readonly definitionId: StableId;
      readonly spawnId: StableId;
      readonly waveId: StableId;
      readonly atTick: number;
    }
  >();
  for (const waveId of level.waveIds) {
    const wave = content.waves.get(waveId);
    if (wave === undefined)
      throw new RangeError(`unknown level wave (${waveId})`);
    for (const spawn of wave.spawnEvents)
      authoredSpawns.set(spawn.entityId, {
        definitionId: spawn.enemyDefinitionId,
        spawnId: spawn.id,
        waveId,
        atTick: wave.startAtTick + spawn.atTick
      });
  }
  const startedWaveIds = new Set(
    requireArray(battlefield.startedWaveIds, "started wave IDs").map(
      (value, index) => requireId(value, "wave", `started wave ID ${index}`)
    )
  );
  const firedSpawnIds = new Set(
    requireArray(battlefield.firedSpawnIds, "fired spawn IDs").map(
      (value, index) => requireId(value, "spawn", `fired spawn ID ${index}`)
    )
  );
  const pendingSpawnIds = new Set(
    requireArray(battlefield.pendingSpawns, "pending spawns").map(
      (item, index) => {
        const record = requireRecord(
          item,
          [
            "id",
            "authoredOrder",
            "entityId",
            "enemyDefinitionId",
            "entranceId"
          ],
          `pending spawn ${index}`
        );
        return requireId(record["id"], "spawn", `pending spawn ${index} id`);
      }
    )
  );
  const admissions = new Map<
    EntityId,
    { definitionId: StableId; tick: number }
  >();
  for (const [index, item] of requireArray(
    battlefield.enemyAdmissions,
    "battlefield enemy admissions"
  ).entries()) {
    const record = requireRecord(
      item,
      [
        "schemaVersion",
        "spawnId",
        "entityId",
        "enemyDefinitionId",
        "admittedAtTick"
      ],
      `battlefield enemy admission ${index}`
    );
    if (record["schemaVersion"] !== 1)
      throw new RangeError("enemy admission has unsupported schemaVersion");
    const entityId = requireId(
      record["entityId"],
      "entity",
      `battlefield enemy admission ${index} entityId`
    ) as EntityId;
    const definitionId = requireId(
      record["enemyDefinitionId"],
      "enemy",
      `battlefield enemy admission ${index} enemyDefinitionId`
    );
    const admittedAtTick = requireHealth(
      record["admittedAtTick"],
      `battlefield enemy admission ${index} admittedAtTick`
    );
    const spawnId = requireId(
      record["spawnId"],
      "spawn",
      `battlefield enemy admission ${index} spawnId`
    );
    const authoredSpawn = authoredSpawns.get(entityId);
    if (
      admittedAtTick > currentTick ||
      authoredSpawn === undefined ||
      authoredSpawn.definitionId !== definitionId ||
      authoredSpawn.spawnId !== spawnId ||
      !startedWaveIds.has(authoredSpawn.waveId) ||
      !firedSpawnIds.has(spawnId) ||
      pendingSpawnIds.has(spawnId) ||
      authoredSpawn.atTick > admittedAtTick ||
      admissions.has(entityId)
    )
      throw new RangeError(
        "enemy admission does not match authored wave evidence"
      );
    admissions.set(entityId, { definitionId, tick: admittedAtTick });
  }
  const combatants = requireArray(
    battlefield.enemyCombatants,
    "battlefield enemy combatants"
  ).map((item, index): BattlefieldEnemyCombatant => {
    const description = `battlefield enemy combatant ${index}`;
    const record = requireRecord(
      item,
      [
        "schemaVersion",
        "entityId",
        "enemyDefinitionId",
        "classification",
        "currentHealth",
        "maximumHealth",
        "armor",
        "movementIntervalTicks",
        "admittedAtTick",
        "lifecycleState",
        "basicAttack",
        "actionState"
      ],
      description
    );
    if (record["schemaVersion"] !== 1)
      throw new RangeError(`${description} has unsupported schemaVersion`);
    const entityId = requireId(
      record["entityId"],
      "entity",
      `${description} entityId`
    ) as EntityId;
    const definitionId = requireId(
      record["enemyDefinitionId"],
      "enemy",
      `${description} enemyDefinitionId`
    );
    const definition = content.enemies.get(definitionId);
    const admission = admissions.get(entityId);
    if (
      definition === undefined ||
      admission === undefined ||
      admission.definitionId !== definitionId ||
      admission.tick !== record["admittedAtTick"]
    )
      throw new RangeError(`${description} does not match authored admission`);
    const currentHealth = requireHealth(
      record["currentHealth"],
      `${description} currentHealth`
    );
    const basicAttack = requireRecord(
      record["basicAttack"],
      [
        "id",
        "windupTicks",
        "impactDelayTicks",
        "cooldownTicks",
        "damage",
        "range",
        "requiresLineOfSight"
      ],
      `${description} basicAttack`
    );
    for (const key of [
      "id",
      "windupTicks",
      "impactDelayTicks",
      "cooldownTicks",
      "damage",
      "range",
      "requiresLineOfSight"
    ] as const)
      if (basicAttack[key] !== definition.basicAttack[key])
        throw new RangeError(`${description} basicAttack is not authored`);
    if (
      record["classification"] !== definition.classification ||
      record["maximumHealth"] !== definition.maximumHealth ||
      record["armor"] !== definition.armor ||
      record["movementIntervalTicks"] !== definition.movementIntervalTicks ||
      currentHealth > definition.maximumHealth ||
      (record["lifecycleState"] !== "active" &&
        record["lifecycleState"] !== "destroyed") ||
      (record["lifecycleState"] === "active"
        ? currentHealth === 0
        : currentHealth !== 0)
    )
      throw new RangeError(
        `${description} does not match authored enemy state`
      );
    const actionState = requireRecord(
      record["actionState"],
      [
        "schemaVersion",
        "nextMovementAtTick",
        "currentTargetEntityId",
        "activeBasicAttack",
        "cooldownCompleteAtTick"
      ],
      `${description} actionState`
    );
    if (actionState["schemaVersion"] !== 1)
      throw new RangeError(`${description} actionState is not version 1`);
    const nextMovementAtTick = requireHealth(
      actionState["nextMovementAtTick"],
      `${description} nextMovementAtTick`
    );
    const targetValue = actionState["currentTargetEntityId"];
    const currentTargetEntityId =
      targetValue === null
        ? null
        : (requireId(
            targetValue,
            "entity",
            `${description} currentTargetEntityId`
          ) as EntityId);
    const cooldownValue = actionState["cooldownCompleteAtTick"];
    const cooldownCompleteAtTick =
      cooldownValue === null
        ? null
        : requireHealth(cooldownValue, `${description} cooldownCompleteAtTick`);
    const activeValue = actionState["activeBasicAttack"];
    let activeBasicAttack: BattlefieldEnemyCombatant["actionState"]["activeBasicAttack"] =
      null;
    if (activeValue !== null) {
      const active = requireRecord(
        activeValue,
        [
          "schemaVersion",
          "attackId",
          "sourceEntityId",
          "targetEntityId",
          "startedAtTick",
          "commitAtTick",
          "impactAtTick",
          "cooldownDurationTicks",
          "damage",
          "range",
          "targetIsValid"
        ],
        `${description} activeBasicAttack`
      );
      const startedAtTick = requireHealth(
        active["startedAtTick"],
        `${description} activeBasicAttack startedAtTick`
      );
      const commitAtTick = requireHealth(
        active["commitAtTick"],
        `${description} activeBasicAttack commitAtTick`
      );
      const impactAtTick = requireHealth(
        active["impactAtTick"],
        `${description} activeBasicAttack impactAtTick`
      );
      const targetEntityId = requireId(
        active["targetEntityId"],
        "entity",
        `${description} activeBasicAttack targetEntityId`
      ) as EntityId;
      if (
        active["schemaVersion"] !== 1 ||
        active["attackId"] !== definition.basicAttack.id ||
        active["sourceEntityId"] !== entityId ||
        startedAtTick < admission.tick ||
        commitAtTick !== startedAtTick + definition.basicAttack.windupTicks ||
        impactAtTick !==
          commitAtTick + definition.basicAttack.impactDelayTicks ||
        active["cooldownDurationTicks"] !==
          definition.basicAttack.cooldownTicks ||
        active["damage"] !== definition.basicAttack.damage ||
        active["range"] !== definition.basicAttack.range ||
        typeof active["targetIsValid"] !== "boolean"
      )
        throw new RangeError(
          `${description} activeBasicAttack is not authored`
        );
      activeBasicAttack = Object.freeze({
        schemaVersion: 1,
        attackId: active["attackId"] as StableId,
        sourceEntityId: entityId,
        targetEntityId,
        startedAtTick,
        commitAtTick,
        impactAtTick,
        cooldownDurationTicks: definition.basicAttack.cooldownTicks,
        damage: definition.basicAttack.damage,
        range: definition.basicAttack.range,
        targetIsValid: active["targetIsValid"] as boolean
      });
    }
    return Object.freeze({
      schemaVersion: 1,
      entityId,
      enemyDefinitionId: definitionId,
      classification: definition.classification,
      currentHealth,
      maximumHealth: definition.maximumHealth,
      armor: definition.armor,
      movementIntervalTicks: definition.movementIntervalTicks,
      admittedAtTick: admission.tick,
      lifecycleState: record["lifecycleState"] as "active" | "destroyed",
      basicAttack: Object.freeze({ ...definition.basicAttack }),
      actionState: Object.freeze({
        schemaVersion: 1,
        nextMovementAtTick,
        currentTargetEntityId,
        activeBasicAttack,
        cooldownCompleteAtTick
      })
    });
  });
  if (combatants.length !== admissions.size)
    throw new RangeError("enemy combatants do not match authored admissions");
  return Object.freeze(
    combatants.sort((left, right) => compareText(left.entityId, right.entityId))
  );
}

export function normalizeBattlefieldDwarves(
  battlefield: BattlefieldState,
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent
): readonly BattlefieldDwarfCombatant[] {
  const deployments = requireDeploymentAuthority(
    authority,
    battlefield,
    content
  );
  const acceptedHealth = getInheritedBattlefieldDwarfHealth(
    authority,
    content,
    battlefield
  );
  const mapId = battlefield.mapId;
  const occupancy = _normalizeOccupancy(
    battlefield.occupancy,
    content,
    battlefield.mapId
  );
  const map = content.maps.get(mapId);
  if (map === undefined)
    throw new RangeError(`unknown battlefield map (${mapId})`);
  const placementNodes = new Map(
    map.placementPoints.map((placement) => [placement.id, placement.nodeId])
  );
  const occupiedNodes = new Map<
    EntityId,
    readonly NavigationOccupant["nodeId"][]
  >();
  for (const item of occupancy) {
    const nodes = occupiedNodes.get(item.entityId) ?? [];
    occupiedNodes.set(item.entityId, [...nodes, item.nodeId]);
  }
  const seenEntities = new Set<EntityId>();
  const seenPlacements = new Set<PlacementPointId>();
  const deploymentsByEntity = new Map<EntityId, DwarfDeployment>();
  for (const [index, item] of requireArray(
    deployments,
    "authored dwarf deployments"
  ).entries()) {
    const record = requireRecord(
      item,
      ["entityId", "characterDefinitionId", "placementPointId"],
      `authored dwarf deployment ${index}`
    );
    const deployment = Object.freeze({
      entityId: requireId(
        record["entityId"],
        "entity",
        `authored dwarf deployment ${index} entityId`
      ) as EntityId,
      characterDefinitionId: requireId(
        record["characterDefinitionId"],
        "character",
        `authored dwarf deployment ${index} characterDefinitionId`
      ),
      placementPointId: requireId(
        record["placementPointId"],
        "placement",
        `authored dwarf deployment ${index} placementPointId`
      ) as PlacementPointId
    });
    if (deploymentsByEntity.has(deployment.entityId))
      throw new RangeError("duplicate authored dwarf deployment entity ID");
    deploymentsByEntity.set(deployment.entityId, deployment);
  }
  // biome-ignore format: keep the descriptor-validation pipeline visually nested
  const dwarves = requireArray(
    battlefield.dwarfCombatants,
    "battlefield dwarf combatants"
  ).map(
    (item, index): BattlefieldDwarfCombatant => {
      const description = `battlefield dwarf combatant ${index}`;
      const record = requireRecord(
        item,
        [
          "schemaVersion",
          "entityId",
          "characterDefinitionId",
          "placementPointId",
          "currentHealth",
          "maximumHealth",
          "lifecycleState",
          "basicAttack",
          "actionState"
        ],
        description
      );
      if (record["schemaVersion"] !== 1)
        throw new RangeError(`${description} has unsupported schemaVersion`);
      const entityId = requireId(
        record["entityId"],
        "entity",
        `${description} entityId`
      ) as EntityId;
      const characterDefinitionId = requireId(
        record["characterDefinitionId"],
        "character",
        `${description} characterDefinitionId`
      );
      const placementPointId = requireId(
        record["placementPointId"],
        "placement",
        `${description} placementPointId`
      ) as PlacementPointId;
      const character = content.characters.get(characterDefinitionId);
      if (character === undefined)
        throw new RangeError(
          `${description} references unknown character definition`
        );
      const deployment = deploymentsByEntity.get(entityId);
      if (
        deployment === undefined ||
        deployment.characterDefinitionId !== characterDefinitionId ||
        deployment.placementPointId !== placementPointId
      )
        throw new RangeError(
          `${description} does not match authored deployment evidence`
        );
      const currentHealth = requireHealth(
        record["currentHealth"],
        `${description} currentHealth`
      );
      const maximumHealth = requireHealth(
        record["maximumHealth"],
        `${description} maximumHealth`
      );
      const modified = modifiedCharacterStats(
        character,
        requireAuthorityMetadata(authority, content).characterModifiers.get(
          characterDefinitionId
        )
      );
      if (
        maximumHealth !== modified.maximumHealth ||
        currentHealth > maximumHealth
      )
        throw new RangeError(
          `${description} health does not match authoritative modifiers`
        );
      const lifecycleState = record["lifecycleState"];
      if (lifecycleState !== "active" && lifecycleState !== "downed")
        throw new RangeError(`${description} lifecycleState is invalid`);
      if (
        lifecycleState === "active" ? currentHealth === 0 : currentHealth !== 0
      )
        throw new RangeError(
          `${description} health and lifecycleState are inconsistent`
        );
      const authoritativeHealth = acceptedHealth.get(entityId);
      if (
        authoritativeHealth === undefined
          ? acceptedHealth.size !== 0 ||
            currentHealth !== modified.maximumHealth ||
            lifecycleState !== "active"
          : authoritativeHealth.currentHealth !== currentHealth ||
            authoritativeHealth.lifecycleState !== lifecycleState
      )
        throw new RangeError(
          `${description} health/lifecycle does not match authoritative battlefield evidence`
        );
      const basicAttack = requireRecord(
        record["basicAttack"],
        [
          "id",
          "windupTicks",
          "impactDelayTicks",
          "cooldownTicks",
          "damage",
          "range",
          "requiresLineOfSight"
        ],
        `${description} basicAttack`
      );
      for (const key of [
        "id",
        "windupTicks",
        "impactDelayTicks",
        "cooldownTicks",
        "damage",
        "range",
        "requiresLineOfSight"
      ] as const)
        if (basicAttack[key] !== modified.basicAttack[key])
          throw new RangeError(
            `${description} basicAttack is not authored or does not match authoritative modifiers`
          );
      const actionStateRecord = requireRecord(
        record["actionState"],
        [
          "schemaVersion",
          "currentTargetEntityId",
          "activeBasicAttack",
          "cooldownCompleteAtTick"
        ],
        `${description} actionState`
      );
      if (actionStateRecord["schemaVersion"] !== 1)
        throw new RangeError(`${description} actionState is not version 1`);
      const acceptedActionState = requireAuthorityMetadata(authority, content)
        .dwarfActionStates.get(entityId);
      if (acceptedActionState === undefined)
        throw new RangeError(`${description} actionState lacks deployment authority`);
      const actionState = assertAcceptedDwarfActionState(
        record["actionState"],
        acceptedActionState,
        `${description} actionState`
      );
      if (
        lifecycleState === "downed" &&
        (actionState.currentTargetEntityId !== null ||
          actionState.activeBasicAttack !== null ||
          actionState.cooldownCompleteAtTick !== null)
      )
        throw new RangeError(`${description} downed dwarf actionState is not idle`);
      const expectedNode = placementNodes.get(placementPointId);
      if (expectedNode === undefined)
        throw new RangeError(
          `${description} references unknown placement point`
        );
      const entityOccupancy = occupiedNodes.get(entityId) ?? [];
      if (
        lifecycleState === "active" &&
        (entityOccupancy.length !== 1 || entityOccupancy[0] !== expectedNode)
      )
        throw new RangeError(
          `${description} active dwarf must occupy its authored placement`
        );
      if (lifecycleState === "downed" && entityOccupancy.length > 0)
        throw new RangeError(
          `${description} downed dwarf cannot occupy navigation`
        );
      if (seenEntities.has(entityId) || seenPlacements.has(placementPointId))
        throw new RangeError(
          `${description} duplicates a dwarf entity or placement`
        );
      seenEntities.add(entityId);
      seenPlacements.add(placementPointId);
      return Object.freeze({
        schemaVersion: 1,
        entityId,
        characterDefinitionId,
        placementPointId,
        currentHealth,
        maximumHealth,
        lifecycleState,
        basicAttack: modified.basicAttack,
        actionState
      });
    }
  );
  if (dwarves.length !== deploymentsByEntity.size)
    throw new RangeError(
      "battlefield dwarves do not match authored deployments"
    );
  if (acceptedHealth.size !== 0 && dwarves.length !== acceptedHealth.size)
    throw new RangeError(
      "battlefield dwarf health does not match authoritative battlefield evidence"
    );
  const normalized = Object.freeze(
    dwarves.sort((left, right) => compareText(left.entityId, right.entityId))
  );
  authorizeBattlefieldDwarfHealth(authority, content, battlefield, normalized);
  return normalized;
}

export function deployBattlefieldDwarves(
  battlefield: BattlefieldState,
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent
): BattlefieldState {
  const metadata = requireAuthorityMetadata(authority, content);
  if (metadata.deploymentBattlefield !== undefined)
    throw new RangeError("battlefield dwarves are already initialized");
  const deployments = requireDeploymentAuthority(
    authority,
    battlefield,
    content
  );
  if (battlefield.dwarfCombatants.length > 0)
    throw new RangeError("battlefield dwarves are already initialized");
  const map = content.maps.get(battlefield.mapId);
  if (map === undefined)
    throw new RangeError(`unknown battlefield map (${battlefield.mapId})`);
  const placements = new Map(
    map.placementPoints.map((point) => [point.id, point.nodeId])
  );
  const occupiedNodes = new Set(
    battlefield.occupancy.map((item) => item.nodeId)
  );
  const occupiedEntities = new Set(
    battlefield.occupancy.map((item) => item.entityId)
  );
  const dwarfCombatants: BattlefieldDwarfCombatant[] = [];
  const occupancy = battlefield.occupancy.map((item) =>
    Object.freeze({ ...item })
  );
  for (const [index, item] of requireArray(
    deployments,
    "dwarf deployments"
  ).entries()) {
    const record = requireRecord(
      item,
      ["entityId", "characterDefinitionId", "placementPointId"],
      `dwarf deployment ${index}`
    );
    const entityId = requireId(
      record["entityId"],
      "entity",
      `dwarf deployment ${index} entityId`
    ) as EntityId;
    const characterDefinitionId = requireId(
      record["characterDefinitionId"],
      "character",
      `dwarf deployment ${index} characterDefinitionId`
    );
    const placementPointId = requireId(
      record["placementPointId"],
      "placement",
      `dwarf deployment ${index} placementPointId`
    ) as PlacementPointId;
    const character = content.characters.get(characterDefinitionId);
    const nodeId = placements.get(placementPointId);
    if (character === undefined || nodeId === undefined)
      throw new RangeError(
        `dwarf deployment ${index} references unknown authored content`
      );
    if (occupiedNodes.has(nodeId) || occupiedEntities.has(entityId))
      throw new RangeError(`dwarf deployment ${index} placement is occupied`);
    occupiedNodes.add(nodeId);
    occupiedEntities.add(entityId);
    occupancy.push(Object.freeze({ entityId, nodeId }));
    const modified = modifiedCharacterStats(
      character,
      metadata.characterModifiers.get(characterDefinitionId)
    );
    dwarfCombatants.push(
      Object.freeze({
        schemaVersion: 1,
        entityId,
        characterDefinitionId,
        placementPointId,
        currentHealth: modified.maximumHealth,
        maximumHealth: modified.maximumHealth,
        lifecycleState: "active",
        basicAttack: modified.basicAttack,
        actionState: Object.freeze({
          schemaVersion: 1,
          currentTargetEntityId: null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        })
      })
    );
  }
  const candidate = freezeBattlefield(
    battlefield,
    occupancy.sort((left, right) => compareText(left.entityId, right.entityId)),
    dwarfCombatants,
    battlefield.pendingCommittedAttacks
  );
  authorizeBattlefieldDwarfHealth(
    authority,
    content,
    candidate,
    dwarfCombatants
  );
  const normalized = normalizeBattlefieldDwarves(candidate, authority, content);
  const deployed = freezeBattlefield(
    candidate,
    candidate.occupancy,
    normalized,
    battlefield.pendingCommittedAttacks
  );
  metadata.deploymentBattlefield = deployed;
  return deployed;
}

/** @internal Runtime integration after persisted skill validation. */
export function deployBattlefieldDwarvesWithCharacterModifiers(
  battlefield: BattlefieldState,
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  value: readonly BattlefieldCharacterModifiers[]
): BattlefieldState {
  const metadata = requireAuthorityMetadata(authority, content);
  if (metadata.deploymentBattlefield !== undefined)
    throw new RangeError("battlefield dwarves are already initialized");
  const deployedCharacterIds = new Set(
    authority.deployments.map((deployment) => deployment.characterDefinitionId)
  );
  const nextModifiers = new Map<StableId, BattlefieldCharacterModifiers>();
  for (const [index, item] of requireArray(
    value,
    "battlefield character modifiers"
  ).entries()) {
    const modifiers = requireCharacterModifiers(
      item,
      `battlefield character modifiers ${index}`
    );
    if (!deployedCharacterIds.has(modifiers.characterDefinitionId))
      throw new RangeError(
        `battlefield character modifiers ${index} does not own a deployed dwarf`
      );
    if (nextModifiers.has(modifiers.characterDefinitionId))
      throw new RangeError(
        "battlefield character modifiers duplicate a character"
      );
    const character = content.characters.get(modifiers.characterDefinitionId);
    if (character === undefined)
      throw new RangeError(
        "battlefield character modifiers reference unknown character"
      );
    modifiedCharacterStats(character, modifiers);
    nextModifiers.set(modifiers.characterDefinitionId, modifiers);
  }
  if (nextModifiers.size !== deployedCharacterIds.size)
    throw new RangeError(
      "battlefield character modifiers must cover every deployed character"
    );
  for (const [characterId, modifiers] of nextModifiers)
    metadata.characterModifiers.set(characterId, modifiers);
  try {
    return deployBattlefieldDwarves(battlefield, authority, content);
  } catch (error) {
    metadata.characterModifiers.clear();
    throw error;
  }
}

/** @internal Applies validated totals without rewriting committed work. */
export function applyBattlefieldCharacterModifiers(
  battlefield: BattlefieldState,
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  value: readonly BattlefieldCharacterModifiers[]
): BattlefieldState {
  const metadata = requireAuthorityMetadata(authority, content);
  if (metadata.deploymentBattlefield === undefined)
    throw new RangeError(
      "battlefield dwarves must be initialized before modifiers apply"
    );
  const dwarves = normalizeBattlefieldDwarves(battlefield, authority, content);
  const deployedCharacterIds = new Set(
    authority.deployments.map((deployment) => deployment.characterDefinitionId)
  );
  const nextModifiers = new Map<StableId, BattlefieldCharacterModifiers>();
  for (const [index, item] of requireArray(
    value,
    "battlefield character modifiers"
  ).entries()) {
    const modifiers = requireCharacterModifiers(
      item,
      `battlefield character modifiers ${index}`
    );
    if (!deployedCharacterIds.has(modifiers.characterDefinitionId))
      throw new RangeError(
        `battlefield character modifiers ${index} does not own a deployed dwarf`
      );
    if (nextModifiers.has(modifiers.characterDefinitionId))
      throw new RangeError(
        "battlefield character modifiers duplicate a character"
      );
    const previous = metadata.characterModifiers.get(
      modifiers.characterDefinitionId
    );
    if (
      previous !== undefined &&
      (modifiers.maximumHealthAdd < previous.maximumHealthAdd ||
        modifiers.attackDamageAdd < previous.attackDamageAdd ||
        modifiers.attackRangeAdd < previous.attackRangeAdd ||
        modifiers.futureCooldownReductionTicks <
          previous.futureCooldownReductionTicks)
    )
      throw new RangeError(
        "live battlefield character modifiers cannot decrease"
      );
    const character = content.characters.get(modifiers.characterDefinitionId);
    if (character === undefined)
      throw new RangeError(
        "battlefield character modifiers reference unknown character"
      );
    modifiedCharacterStats(character, modifiers);
    nextModifiers.set(modifiers.characterDefinitionId, modifiers);
  }
  if (nextModifiers.size !== deployedCharacterIds.size)
    throw new RangeError(
      "battlefield character modifiers must cover every deployed character"
    );

  const updatedDwarves = dwarves.map((dwarf) => {
    const modifiers = nextModifiers.get(dwarf.characterDefinitionId);
    const character = content.characters.get(dwarf.characterDefinitionId);
    if (modifiers === undefined || character === undefined)
      throw new Error("validated battlefield modifier owner is missing");
    const modified = modifiedCharacterStats(character, modifiers);
    const missingHealth = dwarf.maximumHealth - dwarf.currentHealth;
    const currentHealth =
      dwarf.lifecycleState === "downed"
        ? 0
        : Math.max(0, modified.maximumHealth - missingHealth);
    if (dwarf.lifecycleState === "active" && currentHealth === 0)
      throw new RangeError(
        "live maximum-health modifier would down an active dwarf"
      );
    return Object.freeze({
      ...dwarf,
      currentHealth,
      maximumHealth: modified.maximumHealth,
      basicAttack: modified.basicAttack,
      actionState: Object.freeze({
        ...dwarf.actionState,
        activeBasicAttack:
          dwarf.actionState.activeBasicAttack === null
            ? null
            : Object.freeze({ ...dwarf.actionState.activeBasicAttack })
      })
    });
  });
  const previousModifiers = new Map(metadata.characterModifiers);
  metadata.characterModifiers.clear();
  for (const [characterId, modifiers] of nextModifiers)
    metadata.characterModifiers.set(characterId, modifiers);
  try {
    const candidate = freezeBattlefield(
      battlefield,
      battlefield.occupancy,
      updatedDwarves,
      battlefield.pendingCommittedAttacks
    );
    authorizeBattlefieldDwarfHealth(
      authority,
      content,
      candidate,
      updatedDwarves
    );
    const normalized = normalizeBattlefieldDwarves(
      candidate,
      authority,
      content
    );
    return freezeBattlefield(
      candidate,
      candidate.occupancy,
      normalized,
      candidate.pendingCommittedAttacks
    );
  } catch (error) {
    metadata.characterModifiers.clear();
    for (const [characterId, modifiers] of previousModifiers)
      metadata.characterModifiers.set(characterId, modifiers);
    throw error;
  }
}

/** Resolves authoritative dwarf target locks, basic windups, and commitments. */
export function resolveDwarfActionPhase(
  request: DwarfActionPhaseRequest,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): DwarfActionPhaseResolution {
  const input = requireRecord(
    request,
    ["schemaVersion", "currentTick", "levelId", "battlefield", "entries"],
    "dwarf action phase request"
  );
  if (input["schemaVersion"] !== 1)
    throw new RangeError(
      "dwarf action phase request has unsupported schemaVersion"
    );
  const currentTick = requireHealth(input["currentTick"], "currentTick");
  const levelId = requireId(input["levelId"], "level", "levelId");
  const level = content.levels.get(levelId);
  if (level === undefined) throw new RangeError(`unknown level (${levelId})`);
  const normalized = normalizeAuthoritativeBattlefieldEnemyState(
    input["battlefield"],
    levelId,
    currentTick,
    content,
    authority
  );
  if (normalized.battlefield.mapId !== level.mapId)
    throw new RangeError("battlefield map does not match level");
  const resolved = resolveNormalizedDwarfActions(
    normalized.battlefield,
    currentTick,
    input["entries"],
    content
  );
  const battlefield = freezeBattlefield(
    normalized.battlefield,
    normalized.occupancy,
    resolved.dwarfCombatants,
    resolved.committedAttacks,
    normalized.enemyCombatants
  );
  authorizeBattlefieldCommittedAttacks(
    authority,
    content,
    battlefield.pendingCommittedAttacks,
    battlefield
  );
  acceptDwarfActionTransition(
    authority,
    content,
    normalized.battlefield.dwarfCombatants,
    battlefield.dwarfCombatants
  );
  return Object.freeze({
    schemaVersion: 1,
    battlefield,
    dwarfCombatants: battlefield.dwarfCombatants,
    committedAttacks: battlefield.pendingCommittedAttacks,
    decisions: resolved.decisions
  });
}

export function resolveBattlefieldAttackImpacts(
  request: BattlefieldAttackImpactRequest,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldAttackImpactResolution {
  const requestRecord = requireRecord(
    request,
    ["schemaVersion", "currentTick", "levelId", "battlefield"],
    "battlefield attack impact request"
  );
  if (requestRecord["schemaVersion"] !== 1)
    throw new RangeError(
      "battlefield attack impact request has unsupported schemaVersion"
    );
  const currentTick = requireHealth(
    requestRecord["currentTick"],
    "currentTick"
  );
  const levelId = requireId(requestRecord["levelId"], "level", "levelId");
  const level = content.levels.get(levelId);
  if (level === undefined) throw new RangeError(`unknown level (${levelId})`);
  const normalized = normalizeAuthoritativeBattlefieldEnemyState(
    requestRecord["battlefield"],
    levelId,
    currentTick,
    content,
    authority
  );
  const battlefield = normalized.battlefield;
  if (battlefield.mapId !== level.mapId)
    throw new RangeError("battlefield map does not match level");
  const occupancy = normalized.occupancy;
  const dwarves = battlefield.dwarfCombatants;
  const enemyCombatants = normalized.enemyCombatants;
  const attacks = normalized.pendingCommittedAttacks;
  const impactCombatants = [...dwarves, ...enemyCombatants];
  const impacts = resolveCommittedAttackImpacts({
    currentTick,
    attacks,
    combatants: impactCombatants.map((combatant) => ({
      schemaVersion: 1,
      entityId: combatant.entityId,
      currentHealth: combatant.currentHealth,
      maximumHealth: combatant.maximumHealth
    }))
  });
  const healthById = new Map(
    impacts.health.map((health) => [health.entityId, health])
  );
  const dwarfEntityIds = new Set(dwarves.map((dwarf) => dwarf.entityId));
  const enemyEntityIds = new Set(
    enemyCombatants.map((enemy) => enemy.entityId)
  );
  const combatantEntityIds = new Set([...dwarfEntityIds, ...enemyEntityIds]);
  const lifecycle = resolveZeroHealthLifecycles({
    combatants: [
      ...dwarves.map((dwarf) => ({
        schemaVersion: 1 as const,
        entityId: dwarf.entityId,
        kind: "dwarf" as const,
        currentHealth:
          healthById.get(dwarf.entityId)?.currentHealth ?? dwarf.currentHealth,
        lifecycleState: dwarf.lifecycleState
      })),
      ...enemyCombatants.map((enemy) => ({
        schemaVersion: 1 as const,
        entityId: enemy.entityId,
        kind: "enemy" as const,
        currentHealth:
          healthById.get(enemy.entityId)?.currentHealth ?? enemy.currentHealth,
        lifecycleState: enemy.lifecycleState
      }))
    ],
    occupancy: occupancy.filter((occupant) =>
      combatantEntityIds.has(occupant.entityId)
    )
  });
  const lifecycleById = new Map(
    lifecycle.combatants.map((item) => [item.entityId, item])
  );
  const nextDwarves = Object.freeze(
    dwarves.map((dwarf) => {
      const resolved = lifecycleById.get(dwarf.entityId);
      const lifecycleState = (resolved?.lifecycleState ??
        dwarf.lifecycleState) as "active" | "downed";
      return Object.freeze({
        ...dwarf,
        currentHealth: resolved?.currentHealth ?? dwarf.currentHealth,
        lifecycleState,
        actionState:
          lifecycleState === "downed"
            ? Object.freeze({
                schemaVersion: 1 as const,
                currentTargetEntityId: null,
                activeBasicAttack: null,
                cooldownCompleteAtTick: null
              })
            : dwarf.actionState
      });
    })
  );
  const activeDwarfIds = new Set(
    nextDwarves
      .filter((dwarf) => dwarf.lifecycleState === "active")
      .map((dwarf) => dwarf.entityId)
  );
  const nextEnemies = Object.freeze(
    enemyCombatants.map((enemy) => {
      const resolved = lifecycleById.get(enemy.entityId);
      const lifecycleState = (resolved?.lifecycleState ??
        enemy.lifecycleState) as "active" | "destroyed";
      return Object.freeze({
        ...enemy,
        currentHealth: resolved?.currentHealth ?? enemy.currentHealth,
        lifecycleState,
        actionState:
          lifecycleState === "destroyed"
            ? Object.freeze({
                schemaVersion: 1 as const,
                nextMovementAtTick: enemy.actionState.nextMovementAtTick,
                currentTargetEntityId: null,
                activeBasicAttack: null,
                cooldownCompleteAtTick: null
              })
            : enemy.actionState
      });
    })
  );
  const activeEnemyIds = new Set(
    nextEnemies
      .filter((enemy) => enemy.lifecycleState === "active")
      .map((enemy) => enemy.entityId)
  );
  const nextOccupancy = Object.freeze(
    occupancy
      .filter(
        (occupant) =>
          (!dwarfEntityIds.has(occupant.entityId) ||
            activeDwarfIds.has(occupant.entityId)) &&
          (!enemyEntityIds.has(occupant.entityId) ||
            activeEnemyIds.has(occupant.entityId))
      )
      .map((occupant) => Object.freeze({ ...occupant }))
      .sort((left, right) => compareText(left.entityId, right.entityId))
  );
  const pendingAttackIds = new Set(
    impacts.decisions
      .filter((decision) => decision.status === "pending")
      .map((decision) => decision.attackId)
  );
  const pendingCommittedAttacks = Object.freeze(
    attacks
      .filter((attack) => pendingAttackIds.has(attack.attackId))
      .map((attack) => Object.freeze({ ...attack }))
  );
  const nextBattlefield = freezeBattlefield(
    battlefield,
    nextOccupancy,
    nextDwarves,
    pendingCommittedAttacks,
    nextEnemies
  );
  authorizeBattlefieldDwarfHealth(
    authority,
    content,
    nextBattlefield,
    nextDwarves
  );
  authorizeBattlefieldEnemyHealth(
    authority,
    content,
    nextBattlefield,
    nextEnemies
  );
  acceptDwarfActionTransition(
    authority,
    content,
    battlefield.dwarfCombatants,
    nextBattlefield.dwarfCombatants
  );
  authorizeBattlefieldCommittedAttacks(
    authority,
    content,
    pendingCommittedAttacks,
    nextBattlefield
  );
  normalizeBattlefieldDwarves(nextBattlefield, authority, content);
  return Object.freeze({
    schemaVersion: 1,
    battlefield: nextBattlefield,
    impactDecisions: impacts.decisions,
    healthResolutions: impacts.healthResolutions,
    lifecycleDecisions: lifecycle.decisions
  });
}
