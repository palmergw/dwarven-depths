import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { resolveAttackCommitments } from "./index.js";

const windup = {
  schemaVersion: 1 as const,
  attackId: "attack.warden.basic" as never,
  sourceEntityId: "entity.dwarf.warden" as never,
  targetEntityId: "entity.enemy.cutter" as never,
  startedAtTick: 10,
  commitAtTick: 12,
  impactAtTick: 15,
  cooldownDurationTicks: 30,
  damage: 12,
  range: 1_000,
  targetIsValid: true
};

describe("attack commitment browser parity", () => {
  it("pins waiting, cancellation, and commitment decisions", async () => {
    const decisions = [
      resolveAttackCommitments({ currentTick: 11, windups: [windup] }),
      resolveAttackCommitments({
        currentTick: 12,
        windups: [{ ...windup, targetIsValid: false }]
      }),
      resolveAttackCommitments({ currentTick: 12, windups: [windup] })
    ];
    expect(decisions.map((item) => item.decisions[0]?.reason)).toEqual([
      "waiting_for_commit",
      "target_invalid_before_commit",
      "committed"
    ]);
    expect(await canonicalHash(decisions)).toBe(
      "44d3dd59c4d7bcaaf720cc66e3f3449beab3ea86795d5d502a1bebec6fdcc4c6"
    );
  });

  it("pins ordering and validation boundaries", () => {
    const forward = resolveAttackCommitments({
      currentTick: 12,
      windups: [
        { ...windup, attackId: "attack.zulu" as never },
        { ...windup, attackId: "attack.alpha" as never }
      ]
    });
    const reverse = resolveAttackCommitments({
      currentTick: 12,
      windups: [
        { ...windup, attackId: "attack.alpha" as never },
        { ...windup, attackId: "attack.zulu" as never }
      ]
    });
    expect(forward).toEqual(reverse);
    expect(() =>
      resolveAttackCommitments({ currentTick: 12, windups: [windup, windup] })
    ).toThrow("duplicate attack windup ID");
  });
});
