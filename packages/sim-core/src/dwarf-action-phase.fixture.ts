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
  const started = resolveDwarfActionPhase(
    request(6, base.committed),
    base.content,
    base.deploymentAuthority
  );
  const withoutEnemyAttack: BattlefieldState = {
    ...started.battlefield,
    pendingCommittedAttacks: []
  };
  propagateBattlefieldRoundLineage(started.battlefield, withoutEnemyAttack);
  const winding = resolveDwarfActionPhase(
    request(10, withoutEnemyAttack),
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
  const enemyPhase = resolveEnemyActionPhase(
    {
      schemaVersion: 1,
      currentTick: 15,
      levelId: "level.conformance_map" as never,
      battlefield: coolingDown.battlefield,
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
  return Object.freeze({
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
