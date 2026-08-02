import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import type {
  ContentBundle,
  ScenarioDefinition
} from "@dwarven-depths/contracts";
import {
  createLiveScenarioHost,
  createShieldSlamWebPreparationState
} from "@dwarven-depths/runtime";
import { describe, expect, it } from "vitest";
import contentFixture from "../../../content/fixtures/phase-3-shuttergate.json";
import scenarioFixture from "../../../scenarios/conformance/shuttergate-web-truth.json";
import { createPresentationSnapshot } from "./presentation-snapshot.js";
import {
  parseRenderSnapshot,
  type RenderSnapshotV2
} from "./render-snapshot.js";

async function fixtureSnapshots(): Promise<readonly RenderSnapshotV2[]> {
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
  host.scheduleCommand({ atTick: 0, type: "confirmPreparation" });
  for (
    let index = 0;
    index < 80 && host.state.phase !== "TERMINAL";
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
    if (step.state.tick === 1)
      host.scheduleCommand({
        atTick: 1,
        type: "activateAbility",
        dwarfEntityId: "entity.dwarf.warden" as never,
        abilityId: "ability.shield_slam" as never
      });
  }
  return snapshots;
}

describe("presentation snapshot v2", () => {
  it("projects immutable combat identity, health, authored positions, and encounter transitions", async () => {
    const snapshots = await fixtureSnapshots();
    for (const snapshot of snapshots)
      expect(parseRenderSnapshot(snapshot)).toEqual(snapshot);

    const running = snapshots.find((snapshot) => snapshot.phase === "running");
    expect(running?.entities.map((entity) => entity.id)).toEqual([
      "entity.dwarf.warden",
      "entity.enemy.shield_slam_target"
    ]);
    expect(running?.entities[0]).toMatchObject({
      visualId: "character.iron_warden",
      archetype: "character",
      currentHealth: 240,
      maximumHealth: 240,
      transition: "active"
    });
    expect(running?.encounter).toMatchObject({
      activeWaveId: null,
      livingHostileCount: 1
    });
    expect(running?.entities[0]?.position).toEqual(
      running?.entities[0]?.previousPosition
    );
    expect(
      snapshots.some((snapshot) =>
        snapshot.entityTransitions.some(
          (transition) =>
            transition.kind === "spawned" || transition.kind === "destroyed"
        )
      )
    ).toBe(true);
  });

  it("keeps v1 readable and rejects noncanonical, extended, unbounded, or cross-tick v2 data", async () => {
    const snapshots = await fixtureSnapshots();
    const snapshot = snapshots.at(1);
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
});
