import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  resolveScheduledBattlefieldPhase
} from "./index.js";
import {
  scheduledBattlefieldContent,
  scheduledBattlefieldParityEvidence
} from "./scheduled-battlefield.fixture.js";

describe("scheduled battlefield browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = await scheduledBattlefieldParityEvidence();
    expect(evidence[0]?.events.map((event) => event.type)).toEqual([
      "wave.started",
      "wave.started",
      "spawn.enqueued",
      "spawn.enqueued",
      "spawn.admitted",
      "spawn.queued"
    ]);
    expect(await canonicalHash(evidence)).toBe(
      "99c041bd09947025a43ee9523a11dafd6d5d1f396ba825bd97aa023b4c72f2a1"
    );
  });

  it("rejects a wholesale authored enemy-definition swap", async () => {
    const content = await compileContent(scheduledBattlefieldContent);
    const initial = createInitialState(
      content,
      "level.scheduled_battlefield" as never,
      "1"
    );
    const due = resolveScheduledBattlefieldPhase(initial, content, []);
    if (due.state.battlefield === undefined)
      throw new Error("expected battlefield state");
    const slinger = content.enemies.get("enemy.goblin_slinger" as never);
    if (slinger === undefined) throw new Error("expected slinger definition");
    const swapped = {
      ...due.state,
      battlefield: {
        ...due.state.battlefield,
        enemyCombatants: due.state.battlefield.enemyCombatants.map(
          (combatant) => ({
            ...combatant,
            enemyDefinitionId: slinger.id,
            classification: slinger.classification,
            currentHealth: slinger.maximumHealth,
            maximumHealth: slinger.maximumHealth,
            armor: slinger.armor,
            movementIntervalTicks: slinger.movementIntervalTicks,
            basicAttack: { ...slinger.basicAttack }
          })
        )
      }
    };

    expect(() =>
      resolveScheduledBattlefieldPhase(swapped, content, [])
    ).toThrow("does not match authored spawn identity");

    const hiddenFiredSpawnIds = [...due.state.battlefield.firedSpawnIds];
    Object.defineProperty(hiddenFiredSpawnIds, Symbol.iterator, {
      value: () => [][Symbol.iterator](),
      enumerable: false
    });
    const hiddenProgress = {
      ...due.state,
      battlefield: {
        ...due.state.battlefield,
        occupancy: [],
        enemyCombatants: [],
        firedSpawnIds: hiddenFiredSpawnIds
      }
    };
    expect(() =>
      resolveScheduledBattlefieldPhase(hiddenProgress, content, [])
    ).toThrow("fired spawn IDs contains unsupported array properties");
  });
});
