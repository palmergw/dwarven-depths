import type {
  BattlefieldState,
  DwarfActionPhaseRequest
} from "@dwarven-depths/contracts";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import { normalizePendingCommittedAttacks } from "./battlefield-committed-attacks.js";
import { propagateBattlefieldRoundLineage } from "./battlefield-round-lineage.js";
import { entry } from "./enemy-movement-planning.fixture.js";
import {
  createInitialState,
  resolveBattlefieldAttackImpacts,
  resolveBattlefieldPhase,
  resolveDwarfActionPhase,
  resolveEnemyActionPhase,
  resolveScheduledBattlefieldPhase
} from "./index.js";

function request(
  currentTick: number,
  battlefield: BattlefieldState
): DwarfActionPhaseRequest {
  return {
    schemaVersion: 1,
    currentTick,
    levelId: "level.conformance_map" as never,
    battlefield,
    entries: [
      {
        schemaVersion: 1,
        dwarfEntityId: "entity.dwarf.warden" as never,
        requestedPolicy: "nearest"
      }
    ]
  };
}

export async function dwarfActionPhaseFixture() {
  const base = await battlefieldAttackImpactParityEvidence();
  const actionReady: BattlefieldState = {
    ...base.readyToCommit,
    enemyCombatants: base.readyToCommit.enemyCombatants.map((enemy) => ({
      ...enemy,
      actionState: {
        ...enemy.actionState,
        currentTargetEntityId: null,
        activeBasicAttack: null,
        cooldownCompleteAtTick: null
      }
    }))
  };
  propagateBattlefieldRoundLineage(base.readyToCommit, actionReady);
  const started = resolveDwarfActionPhase(
    request(6, actionReady),
    base.content,
    base.deploymentAuthority
  );
  const winding = resolveDwarfActionPhase(
    request(10, started.battlefield),
    base.content,
    base.deploymentAuthority
  );
  const committed = resolveDwarfActionPhase(
    request(14, winding.battlefield),
    base.content,
    base.deploymentAuthority
  );
  const coolingDown = resolveDwarfActionPhase(
    request(15, committed.battlefield),
    base.content,
    base.deploymentAuthority
  );
  const simultaneousReady: BattlefieldState = {
    ...coolingDown.battlefield,
    enemyCombatants: coolingDown.battlefield.enemyCombatants.map((enemy) => ({
      ...enemy,
      actionState: {
        ...enemy.actionState,
        currentTargetEntityId: "entity.dwarf.warden" as never,
        activeBasicAttack: {
          schemaVersion: 1,
          attackId:
            "attack.goblin_cutter_basic.enemy.cutter.source_length_12.tick_9" as never,
          sourceEntityId: enemy.entityId,
          targetEntityId: "entity.dwarf.warden" as never,
          startedAtTick: 9,
          commitAtTick: 15,
          impactAtTick: 16,
          cooldownDurationTicks: 20,
          damage: 10,
          range: 1,
          targetIsValid: true
        },
        cooldownCompleteAtTick: null
      }
    }))
  };
  propagateBattlefieldRoundLineage(coolingDown.battlefield, simultaneousReady);
  const enemyPhase = resolveEnemyActionPhase(
    {
      schemaVersion: 1,
      currentTick: 15,
      levelId: "level.conformance_map" as never,
      battlefield: simultaneousReady,
      entries: [entry("entity.enemy.cutter" as never)]
    },
    base.content,
    base.deploymentAuthority
  );
  const initialState = createInitialState(
    base.content,
    "level.conformance_map" as never,
    "1"
  );
  const actionState = Object.freeze({
    ...initialState,
    tick: 15,
    phase: "COMBAT_RUNNING" as const,
    battlefield: enemyPhase.battlefield
  });
  const battlefieldPhase = resolveBattlefieldPhase(
    actionState,
    base.content,
    [],
    [],
    undefined,
    base.deploymentAuthority
  );
  const scheduledPhase = resolveScheduledBattlefieldPhase(
    battlefieldPhase.state,
    base.content,
    [],
    undefined,
    base.deploymentAuthority
  );
  const scheduledBattlefield = scheduledPhase.state.battlefield;
  if (scheduledBattlefield === undefined)
    throw new Error("missing scheduled battlefield fixture");
  const substituted: BattlefieldState = {
    ...scheduledBattlefield,
    pendingCommittedAttacks: scheduledBattlefield.pendingCommittedAttacks.map(
      (attack) => ({
        ...attack,
        targetEntityId: "entity.enemy.substitute" as never
      })
    )
  };
  propagateBattlefieldRoundLineage(scheduledBattlefield, substituted);
  let substitutionError = "";
  try {
    resolveScheduledBattlefieldPhase(
      { ...scheduledPhase.state, battlefield: substituted },
      base.content,
      [],
      undefined,
      base.deploymentAuthority
    );
  } catch (error) {
    substitutionError = error instanceof Error ? error.message : String(error);
  }
  const dwarfAttack = committed.committedAttacks.find(
    (attack) => attack.sourceEntityId === "entity.dwarf.warden"
  );
  const dwarf = committed.dwarfCombatants[0];
  if (dwarfAttack === undefined || dwarf === undefined)
    throw new Error("missing committed dwarf attack fixture");
  const sourceDowned = normalizePendingCommittedAttacks(
    [dwarfAttack],
    15,
    [
      {
        ...dwarf,
        currentHealth: 0,
        lifecycleState: "downed",
        actionState: {
          schemaVersion: 1,
          currentTargetEntityId: null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        }
      }
    ],
    new Map([[dwarfAttack.attackId, dwarfAttack.targetEntityId]])
  );
  return Object.freeze({
    base,
    started,
    winding,
    committed,
    coolingDown,
    enemyPhase,
    battlefieldPhase,
    scheduledPhase,
    substitutionError,
    sourceDowned
  });
}

export async function dwarfActionPhaseParityEvidence() {
  const {
    base,
    started,
    winding,
    committed,
    coolingDown,
    enemyPhase,
    battlefieldPhase,
    scheduledPhase,
    substitutionError,
    sourceDowned
  } = await dwarfActionPhaseFixture();
  const impactPending = resolveBattlefieldAttackImpacts(
    {
      schemaVersion: 1,
      currentTick: 15,
      levelId: "level.conformance_map" as never,
      battlefield: enemyPhase.battlefield
    },
    base.content,
    base.deploymentAuthority
  );
  const impacted = resolveBattlefieldAttackImpacts(
    {
      schemaVersion: 1,
      currentTick: 16,
      levelId: "level.conformance_map" as never,
      battlefield: impactPending.battlefield
    },
    base.content,
    base.deploymentAuthority
  );
  return Object.freeze({
    started,
    winding,
    committed,
    coolingDown,
    enemyPhase,
    impactPending,
    impacted,
    battlefieldPhase,
    scheduledPhase,
    substitutionError,
    sourceDowned
  });
}
