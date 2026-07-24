import type {
  BattlefieldState,
  DwarfActionPhaseRequest
} from "@dwarven-depths/contracts";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import { propagateBattlefieldRoundLineage } from "./battlefield-round-lineage.js";
import { resolveDwarfActionPhase } from "./index.js";

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
  return Object.freeze({ base, started, winding, committed, coolingDown });
}

export async function dwarfActionPhaseParityEvidence() {
  const { started, winding, committed, coolingDown } =
    await dwarfActionPhaseFixture();
  return Object.freeze({ started, winding, committed, coolingDown });
}
