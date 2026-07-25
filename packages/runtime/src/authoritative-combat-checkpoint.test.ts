import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatCheckpointParityEvidence } from "./authoritative-combat-checkpoint.fixture.js";

const EXPECTED_CHECKSUM =
  "f62b5729813d6c83f83ea06484fbf0ca662616e68d13e98a800a485d80682b04";

describe("authoritative combat reward and terminal checkpoint", () => {
  it("derives reward and terminal evidence from the resolved battlefield", async () => {
    const evidence = await authoritativeCombatCheckpointParityEvidence();
    expect(evidence.simultaneous.rejectedRewardError).toBe(
      "boss death has no configured reward (entity.enemy.captain)"
    );
    expect(evidence.shuttergate.terminalEvaluation).toMatchObject({
      state: "combat_running",
      reason: "final_wave_in_progress",
      livingDwarves: 2,
      livingHostileEnemies: 1
    });
    expect(evidence.simultaneous.tick0).toMatchObject({
      bossRewards: { decisions: [] },
      terminalEvaluation: {
        state: "combat_running",
        reason: "final_wave_in_progress",
        livingDwarves: 1,
        livingHostileEnemies: 1
      }
    });
    expect(evidence.simultaneous.tick1).toMatchObject({
      bossRewards: {
        profile: {
          forgeOre: 20,
          unlockedCharacterIds: [
            "character.deep_ranger",
            "character.iron_warden"
          ],
          claimedRewardIds: ["reward.boss.gatebreaker_captain"]
        },
        decisions: [
          {
            eventId: "death.enemy.captain",
            bossEntityId: "entity.enemy.captain",
            status: "claimed"
          }
        ]
      },
      terminalEvaluation: {
        state: "terminal",
        terminalResult: "defeat",
        reason: "all_dwarves_downed",
        livingDwarves: 0,
        livingHostileEnemies: 0
      }
    });
    expect(
      evidence.simultaneous.tick1.combat.impacts.lifecycleDecisions
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "entity.dwarf.warden",
          lifecycleAfter: "downed"
        }),
        expect.objectContaining({
          entityId: "entity.enemy.captain",
          lifecycleAfter: "destroyed"
        })
      ])
    );
    expect(evidence.validationErrors).toEqual([
      "authoritative combat checkpoint request must contain exactly schemaVersion, state, dwarfActionEntries, profile, rewards",
      "authoritative combat checkpoint request must contain exactly schemaVersion, state, dwarfActionEntries, profile, rewards"
    ]);
    expect(Object.isFrozen(evidence.simultaneous.tick1)).toBe(true);
    expect(await canonicalHash(evidence)).toBe(EXPECTED_CHECKSUM);
  });
});
