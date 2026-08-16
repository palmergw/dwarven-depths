import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import {
  type CommandEnvelope,
  type ContentBundle,
  canonicalHash,
  type ScenarioDefinition,
  type SimulationEvent
} from "@dwarven-depths/contracts";
import { resolveEnemyBehaviorIntent } from "@dwarven-depths/sim-core";
import { describe, expect, it } from "vitest";
import contentFixture from "../../../content/fixtures/phase-6-shuttergate-enemy-roster.json" with {
  type: "json"
};
import baselineFixture from "../../../scenarios/conformance/shuttergate-enemy-roster-baseline.json" with {
  type: "json"
};
import counterplayFixture from "../../../scenarios/conformance/shuttergate-enemy-roster-counterplay.json" with {
  type: "json"
};
import priorityFixture from "../../../scenarios/conformance/shuttergate-enemy-roster-priority.json" with {
  type: "json"
};
import {
  createLiveScenarioHost,
  createShieldSlamWebPreparationState
} from "./index.js";

async function run(fixture: unknown) {
  const content = await compileContent(
    contentFixture as unknown as ContentBundle
  );
  const scenario = compileScenario(fixture as ScenarioDefinition, content);
  const host = createLiveScenarioHost(
    scenario,
    content,
    createShieldSlamWebPreparationState(content, scenario)
  );
  const pending = [...scenario.commands];
  const events: SimulationEvent[] = [];
  const commands: CommandEnvelope[] = [];
  while (host.state.tick < 2500 && host.state.phase !== "TERMINAL") {
    for (const command of pending.filter(
      (candidate) => candidate.atTick === host.state.tick
    ))
      commands.push(host.scheduleCommand(command));
    events.push(...host.step().events);
  }
  return {
    content,
    stateChecksum: await canonicalHash(host.state),
    eventStreamChecksum: await canonicalHash(events),
    events,
    commands
  };
}

describe("Shuttergate enemy roster showcase", () => {
  it("exercises every canonical non-boss role through tell and commit", async () => {
    const content = await compileContent(
      contentFixture as unknown as ContentBundle
    );
    const roles = [...content.enemies.values()]
      .filter((enemy) => enemy.classification !== "boss")
      .sort((left, right) => left.id.localeCompare(right.id));
    const committed = roles.map((enemy, index) => {
      const behavior = enemy.behavior;
      if (behavior === undefined)
        throw new Error(`missing behavior for ${enemy.id}`);
      const admittedAtTick = index * 100;
      const common = {
        schemaVersion: 1 as const,
        admittedAtTick,
        enemyEntityId: `entity.enemy.showcase_${index}` as never,
        lockedTargetEntityId: null,
        behavior,
        targets: [
          {
            entityId: "entity.dwarf.warden" as never,
            currentHealth: 200,
            maximumHealth: 240,
            pathCost: 1
          }
        ],
        allies: [
          {
            entityId: "entity.enemy.showcase_ally" as never,
            currentHealth: 25,
            maximumHealth: 50,
            pathCost: 1
          }
        ]
      };
      const telling = resolveEnemyBehaviorIntent({
        ...common,
        currentTick: admittedAtTick
      });
      return resolveEnemyBehaviorIntent({
        ...common,
        currentTick: admittedAtTick + behavior.tellTicks,
        lockedTargetEntityId: telling.targetEntityId ?? null
      });
    });
    expect(new Set(committed.map((intent) => intent.roleId)).size).toBe(8);
    expect(
      committed.every((intent) => intent.effectStatus === "committed")
    ).toBe(true);
    expect(new Set(committed.map((intent) => intent.mechanic)).size).toBe(8);
  });

  it("binds the eight-role catalog into deterministic mixed encounters", async () => {
    const { content, events } = await run(baselineFixture);

    const nonBossRoles = [...content.enemies.values()].filter(
      (enemy) => enemy.classification !== "boss"
    );
    expect(nonBossRoles).toHaveLength(8);
    expect(
      new Set(nonBossRoles.map((enemy) => enemy.behavior?.roleId)).size
    ).toBe(8);
    const intents = events.filter(
      (event) => event.type === "enemy.behavior.intent"
    );
    expect(new Set(intents.map((event) => event.effectStatus))).toEqual(
      new Set(["telling", "committed", "cancelled", "cooling_down"])
    );
    expect(intents).toContainEqual(
      expect.objectContaining({
        effectStatus: "cancelled",
        reasonCode: "no_eligible_recipient"
      })
    );
    expect(
      new Set(intents.map((event) => event.roleId)).size
    ).toBeGreaterThanOrEqual(5);
  }, 20_000);

  it("produces three checksum-bound outcomes from counterplay and priority policy", async () => {
    const [baseline, counterplay, priority] = await Promise.all([
      run(baselineFixture),
      run(counterplayFixture),
      run(priorityFixture)
    ]);
    expect(
      new Set(
        [baseline, counterplay, priority].map(
          ({ eventStreamChecksum }) => eventStreamChecksum
        )
      ).size
    ).toBe(3);
    expect(
      new Set(
        [baseline, counterplay, priority].map(
          ({ stateChecksum }) => stateChecksum
        )
      ).size
    ).toBeGreaterThanOrEqual(2);
  }, 30_000);
});
