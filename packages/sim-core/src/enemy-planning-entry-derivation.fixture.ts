import { compileContent } from "@dwarven-depths/content-runtime";
import type { SimulationState } from "@dwarven-depths/contracts";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import {
  createBattlefieldDwarfDeploymentAuthority,
  deployBattlefieldDwarves
} from "./battlefield-attack-impact.js";
import { resolveEnemyActionPhase } from "./enemy-action-phase.js";
import { deriveEnemyPlanningEntries } from "./enemy-movement-planning.js";
import {
  createInitialState,
  resolveEnemyMovementPhase,
  resolveScheduledBattlefieldPhase
} from "./index.js";

export async function enemyPlanningEntryDerivationParityEvidence() {
  const content = await compileContent(shuttergateInput);
  const initial = createInitialState(
    content,
    "level.shuttergate_hall" as never,
    "1"
  );
  if (initial.battlefield === undefined)
    throw new Error("missing Shuttergate battlefield");
  const authority = createBattlefieldDwarfDeploymentAuthority(
    [
      {
        entityId: "entity.dwarf.warden_north" as never,
        characterDefinitionId: "character.iron_warden" as never,
        placementPointId: "placement.shuttergate_north_guard" as never
      },
      {
        entityId: "entity.dwarf.warden_keep" as never,
        characterDefinitionId: "character.iron_warden" as never,
        placementPointId: "placement.shuttergate_keep_guard" as never
      }
    ],
    initial.battlefield,
    content
  );
  const deployed = deployBattlefieldDwarves(
    initial.battlefield,
    authority,
    content
  );
  const scheduled = resolveScheduledBattlefieldPhase(
    Object.freeze({ ...initial, battlefield: deployed }) as SimulationState,
    content,
    [],
    undefined,
    authority
  );
  if (scheduled.state.battlefield === undefined)
    throw new Error("missing scheduled Shuttergate battlefield");
  const derived = deriveEnemyPlanningEntries(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: initial.levelId,
      battlefield: scheduled.state.battlefield
    },
    content,
    authority
  );
  const enemyActions = resolveEnemyActionPhase(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: initial.levelId,
      battlefield: scheduled.state.battlefield,
      entries: derived.entries
    },
    content,
    authority
  );
  const movement = resolveEnemyMovementPhase(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: initial.levelId,
      battlefield: enemyActions.battlefield,
      entries: derived.entries
    },
    content,
    authority
  );
  const lethalImpact = await battlefieldAttackImpactParityEvidence();
  const afterDwarfDowned = deriveEnemyPlanningEntries(
    {
      schemaVersion: 1,
      currentTick: 7,
      levelId: "level.conformance_map" as never,
      battlefield: lethalImpact.resolved.battlefield
    },
    lethalImpact.content,
    lethalImpact.deploymentAuthority
  );
  return Object.freeze({
    derived,
    actionDecisions: enemyActions.decisions,
    movementDecisions: movement.planning.decisions,
    afterDwarfDowned
  });
}
