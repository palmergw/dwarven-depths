import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldEnemyCombatant,
  BattlefieldState,
  ContentBundle
} from "@dwarven-depths/contracts";
import conformanceContent from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import referenceCombatants from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import {
  createInitialState,
  deployBattlefieldDwarves,
  resolveBattlefieldAttackImpacts
} from "./index.js";

const authoredWarden = referenceCombatants.definitions.find(
  (definition) => definition.id === "character.iron_warden"
);
if (authoredWarden?.kind !== "character")
  throw new Error("missing authored Warden fixture");

const contentInput = {
  ...conformanceContent,
  definitions: [
    ...conformanceContent.definitions,
    ...referenceCombatants.definitions.filter(
      (definition) =>
        definition.id === "character.iron_warden" ||
        definition.id === "enemy.goblin_cutter"
    ),
    {
      ...authoredWarden,
      id: "character.substitute",
      maximumHealth: 999,
      basicAttack: { ...authoredWarden.basicAttack, id: "attack.substitute" }
    }
  ]
};

export async function battlefieldAttackImpactParityEvidence() {
  const content = await compileContent(
    contentInput as unknown as ContentBundle
  );
  const initial = createInitialState(
    content,
    "level.conformance_map" as never,
    "1"
  );
  if (initial.battlefield === undefined) throw new Error("missing battlefield");
  const deployments = Object.freeze([
    Object.freeze({
      entityId: "entity.dwarf.warden" as never,
      characterDefinitionId: "character.iron_warden" as never,
      placementPointId: "placement.goal" as never
    })
  ]);
  const deployed = deployBattlefieldDwarves(
    initial.battlefield,
    deployments,
    content
  );
  const cutterDefinition = content.enemies.get("enemy.goblin_cutter" as never);
  if (cutterDefinition === undefined)
    throw new Error("missing cutter definition");
  const cutter: BattlefieldEnemyCombatant = {
    schemaVersion: 1,
    entityId: "entity.enemy.cutter" as never,
    enemyDefinitionId: cutterDefinition.id,
    classification: cutterDefinition.classification,
    currentHealth: cutterDefinition.maximumHealth,
    maximumHealth: cutterDefinition.maximumHealth,
    armor: cutterDefinition.armor,
    movementIntervalTicks: cutterDefinition.movementIntervalTicks,
    admittedAtTick: 0,
    lifecycleState: "active",
    basicAttack: { ...cutterDefinition.basicAttack },
    actionState: {
      schemaVersion: 1,
      nextMovementAtTick: 6,
      currentTargetEntityId: "entity.dwarf.warden" as never,
      activeBasicAttack: null,
      cooldownCompleteAtTick: 26
    }
  };
  const committed: BattlefieldState = {
    ...deployed,
    dwarfCombatants: deployed.dwarfCombatants.map((dwarf) => ({
      ...dwarf,
      currentHealth: cutterDefinition.basicAttack.damage
    })),
    occupancy: [
      { entityId: cutter.entityId, nodeId: "node.entry" as never },
      ...deployed.occupancy
    ],
    enemyCombatants: [cutter],
    pendingCommittedAttacks: [
      {
        schemaVersion: 1,
        attackId: "attack.goblin_cutter_basic.enemy.cutter.tick_0" as never,
        sourceEntityId: cutter.entityId,
        targetEntityId: "entity.dwarf.warden" as never,
        committedAtTick: 6,
        impactAtTick: 7,
        cooldownCompleteAtTick: 26,
        damage: cutterDefinition.basicAttack.damage,
        range: cutterDefinition.basicAttack.range
      }
    ]
  };
  const pending = resolveBattlefieldAttackImpacts(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      deployments,
      battlefield: committed
    },
    content
  );
  const resolved = resolveBattlefieldAttackImpacts(
    {
      schemaVersion: 1,
      currentTick: 7,
      levelId: "level.conformance_map" as never,
      deployments,
      battlefield: pending.battlefield
    },
    content
  );
  return Object.freeze({ content, deployments, committed, pending, resolved });
}
