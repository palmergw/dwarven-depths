import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  AttackWindup,
  BattlefieldDwarfCombatant,
  BattlefieldState,
  CommittedAttack,
  DwarfActionPhaseDecision,
  DwarfActionPhaseEntry,
  DwarfTargetLockCandidate,
  DwarfTargetLockDecision,
  EntityId,
  StableId
} from "@dwarven-depths/contracts";
import { resolveAttackCommitments } from "./attack-commitment.js";
import { createAttackInstanceId } from "./attack-instance-id.js";
import { resolveDwarfTargetLock } from "./target-locks.js";

const policies = new Set([
  "nearest",
  "lowest_health",
  "highest_health",
  "highest_armor",
  "fastest",
  "boss_or_elite_first"
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function requireEntry(value: unknown, index: number): DwarfActionPhaseEntry {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new TypeError(`dwarf action entry ${index} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  const expected = ["schemaVersion", "dwarfEntityId", "requestedPolicy"];
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expected.length ||
    !expected.every((key) => Object.hasOwn(descriptors, key))
  )
    throw new TypeError(
      `dwarf action entry ${index} must contain exactly the expected keys`
    );
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `dwarf action entry ${index}.${key} must be own enumerable data`
      );
  }
  const data = value as Record<string, unknown>;
  if (data["schemaVersion"] !== 1)
    throw new RangeError(
      `dwarf action entry ${index} has unsupported schemaVersion`
    );
  if (
    typeof data["dwarfEntityId"] !== "string" ||
    !data["dwarfEntityId"].startsWith("entity.")
  )
    throw new RangeError(
      `dwarf action entry ${index} dwarfEntityId must be entity.*`
    );
  if (
    typeof data["requestedPolicy"] !== "string" ||
    !policies.has(data["requestedPolicy"])
  )
    throw new RangeError(
      `dwarf action entry ${index} has unknown target policy`
    );
  return Object.freeze({
    schemaVersion: 1,
    dwarfEntityId: data["dwarfEntityId"] as EntityId,
    requestedPolicy: data[
      "requestedPolicy"
    ] as DwarfActionPhaseEntry["requestedPolicy"]
  });
}

function freezeCombatant(
  combatant: BattlefieldDwarfCombatant,
  actionState: BattlefieldDwarfCombatant["actionState"]
): BattlefieldDwarfCombatant {
  return Object.freeze({
    ...combatant,
    basicAttack: Object.freeze({ ...combatant.basicAttack }),
    actionState: Object.freeze({
      ...actionState,
      activeBasicAttack:
        actionState.activeBasicAttack === null
          ? null
          : Object.freeze({ ...actionState.activeBasicAttack })
    })
  });
}

function decision(
  dwarfEntityId: EntityId,
  status: DwarfActionPhaseDecision["status"],
  reason: DwarfActionPhaseDecision["reason"],
  targetLock: DwarfTargetLockDecision,
  attackId?: StableId
): DwarfActionPhaseDecision {
  return Object.freeze({
    schemaVersion: 1,
    dwarfEntityId,
    status,
    reason,
    targetLock,
    ...(attackId === undefined ? {} : { attackId })
  });
}

export interface NormalizedDwarfActionResolution {
  readonly dwarfCombatants: readonly BattlefieldDwarfCombatant[];
  readonly committedAttacks: readonly CommittedAttack[];
  readonly decisions: readonly DwarfActionPhaseDecision[];
}

/** Pure action producer; its output becomes authoritative only in the authority-owning wrapper. */
export function resolveNormalizedDwarfActions(
  battlefield: BattlefieldState,
  currentTick: number,
  entriesValue: unknown,
  content: CompiledContent
): NormalizedDwarfActionResolution {
  const map = content.maps.get(battlefield.mapId);
  if (map === undefined)
    throw new Error("validated dwarf action map is missing");
  const entries = requireArray(entriesValue, "dwarf action entries").map(
    requireEntry
  );
  const entriesByDwarf = new Map<EntityId, DwarfActionPhaseEntry>();
  for (const entry of entries) {
    if (entriesByDwarf.has(entry.dwarfEntityId))
      throw new RangeError(
        `duplicate dwarf action entry (${entry.dwarfEntityId})`
      );
    entriesByDwarf.set(entry.dwarfEntityId, entry);
  }
  const activeDwarves = battlefield.dwarfCombatants.filter(
    (item) => item.lifecycleState === "active"
  );
  if (entries.length !== activeDwarves.length)
    throw new RangeError("active dwarves require exactly one action entry");
  for (const entry of entries)
    if (!activeDwarves.some((item) => item.entityId === entry.dwarfEntityId))
      throw new RangeError(
        `dwarf action entry does not identify an active dwarf (${entry.dwarfEntityId})`
      );

  const occupancyByEntity = new Map(
    battlefield.occupancy.map((item) => [item.entityId, item] as const)
  );
  const nodesById = new Map(map.nodes.map((node) => [node.id, node] as const));
  const candidates: DwarfTargetLockCandidate[] = battlefield.enemyCombatants
    .filter((enemy) => enemy.lifecycleState === "active")
    .map((enemy) => {
      const occupant = occupancyByEntity.get(enemy.entityId);
      const node =
        occupant === undefined ? undefined : nodesById.get(occupant.nodeId);
      if (node === undefined)
        throw new RangeError(
          `active enemy lacks authored aim geometry (${enemy.entityId})`
        );
      return Object.freeze({
        entityId: enemy.entityId,
        aimPointId: node.aimPointId,
        isHostile: true,
        currentHealth: enemy.currentHealth,
        maximumHealth: enemy.maximumHealth,
        armor: enemy.armor,
        speed: 10_000_001 - enemy.movementIntervalTicks,
        isBoss: enemy.classification === "boss",
        isElite: enemy.classification === "elite"
      });
    });

  const dwarves: BattlefieldDwarfCombatant[] = [];
  const attacks: CommittedAttack[] = [...battlefield.pendingCommittedAttacks];
  const decisions: DwarfActionPhaseDecision[] = [];
  for (const dwarf of [...battlefield.dwarfCombatants].sort((left, right) =>
    compareText(left.entityId, right.entityId)
  )) {
    if (dwarf.lifecycleState === "downed") {
      dwarves.push(freezeCombatant(dwarf, dwarf.actionState));
      continue;
    }
    const entry = entriesByDwarf.get(dwarf.entityId);
    const character = content.characters.get(dwarf.characterDefinitionId);
    const occupant = occupancyByEntity.get(dwarf.entityId);
    const sourceNode =
      occupant === undefined ? undefined : nodesById.get(occupant.nodeId);
    if (
      entry === undefined ||
      character === undefined ||
      sourceNode === undefined
    )
      throw new Error("validated active dwarf action evidence is missing");
    const targetLock = resolveDwarfTargetLock({
      map,
      sourceAimPointId: sourceNode.aimPointId,
      range: dwarf.basicAttack.range,
      requiresLineOfSight: dwarf.basicAttack.requiresLineOfSight,
      currentTargetEntityId: dwarf.actionState.currentTargetEntityId,
      requestedPolicy: entry.requestedPolicy,
      supportedPolicies: character.supportedTargetPolicies,
      candidates
    });
    const targetId = targetLock.targetEntityId ?? null;
    const baseAction = {
      ...dwarf.actionState,
      currentTargetEntityId: targetId
    };

    if (dwarf.actionState.activeBasicAttack !== null) {
      const commitment = resolveAttackCommitments({
        currentTick,
        windups: [
          {
            ...dwarf.actionState.activeBasicAttack,
            targetIsValid:
              targetLock.status === "retained" &&
              targetLock.targetEntityId ===
                dwarf.actionState.activeBasicAttack.targetEntityId
          }
        ]
      }).decisions[0];
      if (commitment === undefined)
        throw new Error("dwarf attack commitment decision is missing");
      if (commitment.status === "committed") {
        const committed = commitment.committedAttack;
        if (committed === undefined)
          throw new Error("committed dwarf attack evidence is missing");
        attacks.push(committed);
        dwarves.push(
          freezeCombatant(dwarf, {
            ...baseAction,
            activeBasicAttack: null,
            cooldownCompleteAtTick: committed.cooldownCompleteAtTick
          })
        );
        decisions.push(
          decision(
            dwarf.entityId,
            "committed",
            "basic_attack_committed",
            targetLock,
            committed.attackId
          )
        );
      } else if (commitment.status === "cancelled") {
        dwarves.push(
          freezeCombatant(dwarf, {
            ...baseAction,
            activeBasicAttack: null,
            cooldownCompleteAtTick: null
          })
        );
        decisions.push(
          decision(
            dwarf.entityId,
            "cancelled",
            "basic_attack_cancelled",
            targetLock,
            dwarf.actionState.activeBasicAttack.attackId
          )
        );
      } else {
        dwarves.push(
          freezeCombatant(dwarf, {
            ...baseAction,
            activeBasicAttack: {
              ...dwarf.actionState.activeBasicAttack,
              targetIsValid: true
            },
            cooldownCompleteAtTick: null
          })
        );
        decisions.push(
          decision(
            dwarf.entityId,
            "winding_up",
            "basic_attack_winding_up",
            targetLock,
            dwarf.actionState.activeBasicAttack.attackId
          )
        );
      }
      continue;
    }

    if (
      dwarf.actionState.cooldownCompleteAtTick !== null &&
      dwarf.actionState.cooldownCompleteAtTick > currentTick
    ) {
      dwarves.push(freezeCombatant(dwarf, baseAction));
      decisions.push(
        decision(
          dwarf.entityId,
          "cooling_down",
          "cooldown_in_progress",
          targetLock
        )
      );
      continue;
    }
    if (targetId === null) {
      dwarves.push(
        freezeCombatant(dwarf, { ...baseAction, cooldownCompleteAtTick: null })
      );
      decisions.push(
        decision(dwarf.entityId, "unlocked", "no_eligible_target", targetLock)
      );
      continue;
    }
    const commitAtTick = currentTick + dwarf.basicAttack.windupTicks;
    const impactAtTick = commitAtTick + dwarf.basicAttack.impactDelayTicks;
    const cooldownBoundary = commitAtTick + dwarf.basicAttack.cooldownTicks;
    if (
      ![commitAtTick, impactAtTick, cooldownBoundary].every(
        Number.isSafeInteger
      )
    )
      throw new RangeError(
        `dwarf basic attack timing exceeds safe integer bounds (${dwarf.entityId})`
      );
    const attackId = createAttackInstanceId(
      dwarf.basicAttack.id,
      dwarf.entityId,
      currentTick
    );
    const windup: AttackWindup = Object.freeze({
      schemaVersion: 1,
      attackId,
      sourceEntityId: dwarf.entityId,
      targetEntityId: targetId,
      startedAtTick: currentTick,
      commitAtTick,
      impactAtTick,
      cooldownDurationTicks: dwarf.basicAttack.cooldownTicks,
      damage: dwarf.basicAttack.damage,
      range: dwarf.basicAttack.range,
      targetIsValid: true
    });
    if (commitAtTick === currentTick) {
      const committed = resolveAttackCommitments({
        currentTick,
        windups: [windup]
      }).decisions[0]?.committedAttack;
      if (committed === undefined)
        throw new Error("zero-windup dwarf attack did not commit");
      attacks.push(committed);
      dwarves.push(
        freezeCombatant(dwarf, {
          ...baseAction,
          activeBasicAttack: null,
          cooldownCompleteAtTick: committed.cooldownCompleteAtTick
        })
      );
      decisions.push(
        decision(
          dwarf.entityId,
          "committed",
          "basic_attack_committed",
          targetLock,
          attackId
        )
      );
    } else {
      dwarves.push(
        freezeCombatant(dwarf, {
          ...baseAction,
          activeBasicAttack: windup,
          cooldownCompleteAtTick: null
        })
      );
      decisions.push(
        decision(
          dwarf.entityId,
          "winding_up",
          "basic_attack_started",
          targetLock,
          attackId
        )
      );
    }
  }
  if (new Set(attacks.map((attack) => attack.attackId)).size !== attacks.length)
    throw new RangeError("duplicate pending committed attack ID");
  return Object.freeze({
    dwarfCombatants: Object.freeze(dwarves),
    committedAttacks: Object.freeze(
      attacks
        .sort((left, right) => compareText(left.attackId, right.attackId))
        .map((attack) => Object.freeze({ ...attack }))
    ),
    decisions: Object.freeze(decisions)
  });
}
