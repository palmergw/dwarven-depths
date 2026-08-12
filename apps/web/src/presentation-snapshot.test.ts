import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import type {
  ContentBundle,
  ScenarioDefinition,
  SimulationState
} from "@dwarven-depths/contracts";
import {
  createLiveScenarioHost,
  createShieldSlamWebPreparationState
} from "@dwarven-depths/runtime";
import { describe, expect, it } from "vitest";
import contentFixture from "../../../content/fixtures/phase-3-shuttergate.json";
import scenarioFixture from "../../../scenarios/conformance/shuttergate-web-truth.json";
import { deriveCombatFeedback } from "./combat-feedback.js";
import { createPresentationSnapshot } from "./presentation-snapshot.js";
import {
  parseRenderSnapshot,
  type RenderSnapshotV2
} from "./render-snapshot.js";

async function buildFixtureSnapshots(): Promise<readonly RenderSnapshotV2[]> {
  const content = await compileContent(
    contentFixture as unknown as ContentBundle
  );
  const scenario = compileScenario(
    scenarioFixture as unknown as ScenarioDefinition,
    content
  );
  const host = createLiveScenarioHost(
    scenario,
    content,
    createShieldSlamWebPreparationState(content, scenario)
  );
  const snapshots: RenderSnapshotV2[] = [
    createPresentationSnapshot(content, scenario, host.state, "preparation")
  ];
  let shieldSlamCommitted = false;
  host.scheduleCommand({ atTick: 0, type: "confirmPreparation" });
  for (
    let index = 0;
    index < scenario.maximumTicks && host.state.phase !== "TERMINAL";
    index += 1
  ) {
    const step = host.step();
    const previous = snapshots.at(-1);
    snapshots.push(
      createPresentationSnapshot(
        content,
        scenario,
        step.state,
        step.state.phase === "TERMINAL" ? "terminal" : "running",
        previous
      )
    );
    shieldSlamCommitted ||= (step.state.committedAbilities?.length ?? 0) > 0;
    if (
      !shieldSlamCommitted &&
      step.state.tick % 5 === 0 &&
      step.state.battlefield?.dwarfCombatants.some(
        (dwarf) => dwarf.actionState.currentTargetEntityId !== null
      )
    ) {
      host.scheduleCommand({
        atTick: step.state.tick,
        type: "activateAbility",
        dwarfEntityId: "entity.dwarf.warden" as never,
        abilityId: "ability.iron_warden.shield_slam" as never
      });
    }
  }
  return snapshots;
}

let fixtureSnapshotsPromise: Promise<readonly RenderSnapshotV2[]> | undefined;

function fixtureSnapshots(): Promise<readonly RenderSnapshotV2[]> {
  fixtureSnapshotsPromise ??= buildFixtureSnapshots();
  return fixtureSnapshotsPromise;
}

describe("presentation snapshot v2", () => {
  it("projects immutable combat identity, health, authored positions, and encounter transitions", async () => {
    const snapshots = await fixtureSnapshots();
    for (const snapshot of snapshots)
      expect(parseRenderSnapshot(snapshot)).toEqual(snapshot);

    const shieldSlamImpactIndex = snapshots.findIndex((snapshot) =>
      snapshot.entities.some(
        (entity) =>
          entity.action.kind === "ability" &&
          entity.action.abilityId === "ability.iron_warden.shield_slam" &&
          entity.action.phase === "impact"
      )
    );
    expect(shieldSlamImpactIndex).toBeGreaterThan(0);
    const shieldSlamImpact = snapshots[shieldSlamImpactIndex];
    const beforeShieldSlamImpact = snapshots[shieldSlamImpactIndex - 1];
    if (shieldSlamImpact === undefined || beforeShieldSlamImpact === undefined)
      throw new Error("missing Shield Slam impact snapshots");
    const priorHealthById = new Map(
      beforeShieldSlamImpact.entities.map((entity) => [
        entity.id,
        entity.currentHealth
      ])
    );
    expect(
      shieldSlamImpact.entities.some(
        (entity) =>
          entity.faction === "enemy" &&
          entity.currentHealth < (priorHealthById.get(entity.id) ?? 0)
      ) ||
        shieldSlamImpact.entityTransitions.some(
          (transition) =>
            transition.kind === "downed" || transition.kind === "destroyed"
        )
    ).toBe(true);
    expect(
      beforeShieldSlamImpact.entities.find(
        (entity) => entity.faction === "dwarf"
      )?.action
    ).toMatchObject({ kind: "ability", phase: "committed" });
    const afterShieldSlamImpact = snapshots[shieldSlamImpactIndex + 1];
    if (afterShieldSlamImpact === undefined)
      throw new Error("missing post-impact Shield Slam snapshot");
    expect(
      afterShieldSlamImpact.entities.find(
        (entity) => entity.faction === "dwarf"
      )?.action
    ).not.toMatchObject({ kind: "ability", phase: "impact" });

    const running = snapshots.find(
      (snapshot) =>
        snapshot.phase === "running" &&
        snapshot.encounter.livingHostileCount > 0
    );
    expect(running?.entities.map((entity) => entity.id)).toEqual([
      "entity.dwarf.warden",
      "entity.enemy.shuttergate_001"
    ]);
    expect(running?.entities[0]).toMatchObject({
      visualId: "character.iron_warden",
      archetype: "character",
      currentHealth: 240,
      maximumHealth: 240,
      transition: "active"
    });
    expect(running?.encounter).toMatchObject({
      activeWaveId: "wave.shuttergate_1",
      livingHostileCount: 1
    });
    expect(running?.entities[0]?.position).toEqual(
      running?.entities[0]?.previousPosition
    );
    expect(
      snapshots.some((snapshot) =>
        snapshot.entities.some((entity) => entity.action.kind === "ability")
      )
    ).toBe(true);
    expect(
      snapshots.some((snapshot) =>
        snapshot.entities.some((entity) => entity.statuses.length > 0)
      )
    ).toBe(true);
    expect(
      snapshots.some((snapshot) =>
        snapshot.entities.some(
          (entity) => entity.currentHealth < entity.maximumHealth
        )
      )
    ).toBe(true);
    expect(
      snapshots.some((snapshot) =>
        snapshot.entityTransitions.some(
          (transition) =>
            transition.kind === "spawned" || transition.kind === "destroyed"
        )
      )
    ).toBe(true);
    expect(
      snapshots.some((snapshot) =>
        snapshot.entities.some((entity) => entity.elite)
      )
    ).toBe(true);
    expect(snapshots.at(-1)).toMatchObject({
      phase: "terminal",
      encounter: {
        terminalResult: "defeat",
        startedWaveIds: [
          "wave.shuttergate_1",
          "wave.shuttergate_2",
          "wave.shuttergate_3"
        ]
      }
    });
  }, 15_000);

  it("derives movement, ability, status, wave, and death presentation without mutating authority", async () => {
    const content = await compileContent(
      contentFixture as unknown as ContentBundle
    );
    const scenario = compileScenario(
      scenarioFixture as unknown as ScenarioDefinition,
      content
    );
    const host = createLiveScenarioHost(
      scenario,
      content,
      createShieldSlamWebPreparationState(content, scenario)
    );
    host.scheduleCommand({ atTick: 0, type: "confirmPreparation" });
    while (
      !host.state.battlefield?.enemyCombatants.some(
        (enemy) => enemy.lifecycleState === "active"
      )
    )
      host.step();
    const preparation = host.state;
    const battlefield = preparation.battlefield;
    if (battlefield === undefined)
      throw new Error("missing prepared battlefield");
    const baseline = JSON.stringify(preparation);
    const initial = createPresentationSnapshot(
      content,
      scenario,
      { ...preparation, tick: preparation.tick - 1 },
      "preparation"
    );
    const activeState: SimulationState = {
      ...preparation,
      phase: "COMBAT_RUNNING",
      battlefield: {
        ...battlefield,
        startedWaveIds: ["wave.shuttergate_1" as never],
        occupancy: battlefield.occupancy.map((occupant) =>
          occupant.entityId === "entity.enemy.shuttergate_001"
            ? { ...occupant, nodeId: "node.shuttergate_west_hall" as never }
            : occupant
        )
      },
      activeStatuses: [
        {
          schemaVersion: 1,
          statusId: "status.stagger.fixture" as never,
          ownerEntityId: "entity.enemy.shuttergate_001" as never,
          appliedAtTick: preparation.tick,
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
          committedAtTick: preparation.tick,
          impactAtTick: preparation.tick + 1,
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
    expect(parseRenderSnapshot(active)).toEqual(active);
    expect(active.encounter.activeWaveId).toBe("wave.shuttergate_1");
    expect(
      active.entities.find((entity) => entity.faction === "enemy")
    ).toMatchObject({
      transition: "moving",
      statuses: [{ id: "status.stagger.fixture" }]
    });
    expect(
      active.entities.find((entity) => entity.faction === "dwarf")?.action
    ).toMatchObject({
      kind: "ability",
      phase: "committed"
    });
    expect(
      parseRenderSnapshot({
        ...active,
        entities: active.entities.map((entity, index) =>
          index === 0
            ? {
                ...entity,
                position: { ...entity.position, x: entity.position.x + 1 }
              }
            : entity
        )
      })
    ).toBeUndefined();
    expect(
      parseRenderSnapshot({
        ...active,
        encounter: {
          ...active.encounter,
          livingHostileCount: active.encounter.livingHostileCount + 1
        }
      })
    ).toBeUndefined();

    const activeBattlefield = activeState.battlefield;
    if (activeBattlefield === undefined)
      throw new Error("missing active battlefield");
    const destroyedState: SimulationState = {
      ...activeState,
      tick: activeState.tick + 1,
      battlefield: {
        ...activeBattlefield,
        occupancy: activeBattlefield.occupancy.filter(
          (occupant) => occupant.entityId !== "entity.enemy.shuttergate_001"
        ),
        enemyCombatants: activeBattlefield.enemyCombatants.map((enemy) => ({
          ...enemy,
          currentHealth: 0,
          lifecycleState: "destroyed" as const
        }))
      },
      activeStatuses: [],
      committedAbilities: []
    };
    const destroyed = createPresentationSnapshot(
      content,
      scenario,
      destroyedState,
      "running",
      active
    );
    expect(destroyed.entityTransitions).toContainEqual({
      entityId: "entity.enemy.shuttergate_001",
      kind: "destroyed",
      atTick: activeState.tick + 1
    });
    expect(deriveCombatFeedback(active, destroyed)?.departures).toEqual([
      expect.objectContaining({ id: "entity.enemy.shuttergate_001" })
    ]);
    expect(
      deriveCombatFeedback(active, { ...destroyed, previousTick: 0 })
    ).toBeUndefined();
    expect(
      deriveCombatFeedback(active, { ...destroyed, mapId: "map.foreign" })
    ).toBeUndefined();
    expect(JSON.stringify(preparation)).toBe(baseline);
  });

  it("keeps v1 readable and rejects noncanonical, extended, unbounded, or cross-tick v2 data", async () => {
    const snapshots = await fixtureSnapshots();
    const snapshot = snapshots.find(
      (candidate) => candidate.entities.length > 1
    );
    if (snapshot === undefined) throw new Error("missing running snapshot");
    const legacy = {
      schemaVersion: 1,
      levelId: "level.legacy",
      mapId: null,
      tick: 0,
      phase: "preparation",
      nodes: [],
      connections: [],
      entities: []
    } as const;
    expect(parseRenderSnapshot(legacy)).toEqual(legacy);
    expect(
      parseRenderSnapshot({ ...snapshot, unexpected: true })
    ).toBeUndefined();
    expect(
      parseRenderSnapshot({
        ...snapshot,
        entities: [...snapshot.entities].reverse()
      })
    ).toBeUndefined();
    expect(
      parseRenderSnapshot({
        ...snapshot,
        previousTick: snapshot.tick + 1,
        entities: snapshot.entities
      })
    ).toBeUndefined();
    expect(
      parseRenderSnapshot({
        ...snapshot,
        previousTick: snapshot.tick,
        entities: snapshot.entities
      })
    ).toBeUndefined();
    expect(
      parseRenderSnapshot({
        ...snapshot,
        entities: snapshot.entities.map((entity, index) =>
          index === 0 ? { ...entity, targetEntityId: "entity.foreign" } : entity
        )
      })
    ).toBeUndefined();
    expect(
      parseRenderSnapshot({
        ...snapshot,
        entities: snapshot.entities.map((entity, index) =>
          index === 0
            ? {
                ...entity,
                statuses: new Array(129).fill(entity.statuses[0] ?? {})
              }
            : entity
        )
      })
    ).toBeUndefined();
    expect(parseRenderSnapshot({ ...legacy, extra: true })).toBeUndefined();
  });

  it("rejects a replayed or cross-encounter predecessor", async () => {
    const content = await compileContent(
      contentFixture as unknown as ContentBundle
    );
    const scenario = compileScenario(
      scenarioFixture as unknown as ScenarioDefinition,
      content
    );
    const state = createShieldSlamWebPreparationState(content, scenario);
    const previous = createPresentationSnapshot(
      content,
      scenario,
      state,
      "preparation"
    );
    expect(() =>
      createPresentationSnapshot(
        content,
        scenario,
        state,
        "preparation",
        previous
      )
    ).toThrow(/does not precede/);
    expect(() =>
      createPresentationSnapshot(
        content,
        scenario,
        { ...state, tick: 1 },
        "running",
        {
          ...previous,
          levelId: "level.foreign"
        }
      )
    ).toThrow(/same authored encounter/);
    expect(() =>
      createPresentationSnapshot(
        content,
        { ...scenario, id: "scenario.other" as never },
        { ...state, tick: 1 },
        "running",
        previous
      )
    ).toThrow(/same authored encounter/);
  });
});
