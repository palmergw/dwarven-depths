import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import type {
  ContentBundle,
  ScenarioDefinition,
  SimulationState
} from "@dwarven-depths/contracts";
import { createShieldSlamWebPreparationState } from "@dwarven-depths/runtime";
import { describe, expect, it } from "vitest";
import contentFixture from "../../../content/fixtures/phase-3-shuttergate.json";
import scenarioFixture from "../../../scenarios/conformance/shuttergate-web-truth.json";
import { createPresentationSnapshot } from "./presentation-snapshot.js";
import { parseRenderSnapshot } from "./render-snapshot.js";

describe("presentation snapshot browser parity", () => {
  it("projects movement, damage, Shield Slam, status, spawn, death, and wave transitions", async () => {
    const content = await compileContent(
      contentFixture as unknown as ContentBundle
    );
    const scenario = compileScenario(
      scenarioFixture as unknown as ScenarioDefinition,
      content
    );
    const preparation = createShieldSlamWebPreparationState(content, scenario);
    const battlefield = preparation.battlefield;
    if (battlefield === undefined)
      throw new Error("missing prepared battlefield");
    const authoritativeEnemy = battlefield.enemyCombatants[0];
    if (authoritativeEnemy === undefined)
      throw new Error("missing prepared enemy");
    const baseline = JSON.stringify(preparation);
    const initial = createPresentationSnapshot(
      content,
      scenario,
      preparation,
      "preparation"
    );
    const enemyId = "entity.enemy.shield_slam_target";
    const activeState: SimulationState = {
      ...preparation,
      tick: 1,
      phase: "COMBAT_RUNNING",
      battlefield: {
        ...battlefield,
        startedWaveIds: ["wave.shuttergate_1" as never],
        occupancy: battlefield.occupancy.map((occupant) =>
          occupant.entityId === enemyId
            ? { ...occupant, nodeId: "node.shuttergate_west_hall" as never }
            : occupant
        ),
        enemyCombatants: battlefield.enemyCombatants.map((enemy) => ({
          ...enemy,
          currentHealth: enemy.currentHealth - 1
        }))
      },
      activeStatuses: [
        {
          schemaVersion: 1,
          statusId: "status.stagger.fixture" as never,
          ownerEntityId: enemyId as never,
          appliedAtTick: 1,
          expiresAtTick: 10,
          magnitude: 1
        }
      ],
      committedAbilities: [
        {
          schemaVersion: 1,
          abilityId: "ability.iron_warden.shield_slam" as never,
          sourceEntityId: "entity.dwarf.warden" as never,
          commitmentSequence: 0,
          committedAtTick: 1,
          impactAtTick: 2,
          sourceX: 0,
          sourceY: 0,
          aimDeltaX: 1,
          aimDeltaY: 0,
          damage: 40,
          range: 3,
          frontalHalfAngleDegrees: 60,
          staggerTicks: 9
        }
      ]
    };
    const active = createPresentationSnapshot(
      content,
      scenario,
      activeState,
      "running",
      initial
    );
    const enemy = active.entities.find((entity) => entity.id === enemyId);
    expect(parseRenderSnapshot(active)).toEqual(active);
    expect(enemy).toMatchObject({
      transition: "moving",
      currentHealth: authoritativeEnemy.currentHealth - 1,
      statuses: [{ id: "status.stagger.fixture" }]
    });
    expect(
      active.entities.find((entity) => entity.faction === "dwarf")?.action.kind
    ).toBe("ability");
    expect(active.encounter.activeWaveId).toBe("wave.shuttergate_1");
    expect(
      initial.entityTransitions.map((transition) => transition.kind)
    ).toEqual(["spawned", "spawned"]);

    const activeBattlefield = activeState.battlefield;
    if (activeBattlefield === undefined)
      throw new Error("missing active battlefield");
    const destroyed = createPresentationSnapshot(
      content,
      scenario,
      {
        ...activeState,
        tick: 2,
        battlefield: {
          ...activeBattlefield,
          occupancy: activeBattlefield.occupancy.filter(
            (occupant) => occupant.entityId !== enemyId
          ),
          enemyCombatants: activeBattlefield.enemyCombatants.map(
            (combatant) => ({
              ...combatant,
              currentHealth: 0,
              lifecycleState: "destroyed" as const
            })
          )
        },
        activeStatuses: [],
        committedAbilities: []
      },
      "running",
      active
    );
    expect(destroyed.entityTransitions).toEqual([
      { entityId: enemyId, kind: "destroyed", atTick: 2 }
    ]);
    expect(JSON.stringify(preparation)).toBe(baseline);
  });
});
