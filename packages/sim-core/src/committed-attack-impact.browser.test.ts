import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { resolveCommittedAttackImpacts } from "./index.js";

const combatant = {
  schemaVersion: 1 as const,
  entityId: "entity.enemy.cutter" as never,
  currentHealth: 20,
  maximumHealth: 20
};

const attack = {
  schemaVersion: 1 as const,
  attackId: "attack.warden.basic" as never,
  sourceEntityId: "entity.dwarf.warden" as never,
  targetEntityId: "entity.enemy.cutter" as never,
  committedAtTick: 12,
  impactAtTick: 15,
  cooldownCompleteAtTick: 42,
  damage: 12,
  range: 1_000
};

describe("committed attack impact browser parity", () => {
  it("pins pending, invalid-target, and simultaneous lethal impact evidence", async () => {
    const evidence = [
      resolveCommittedAttackImpacts({
        currentTick: 14,
        attacks: [attack],
        combatants: [combatant]
      }),
      resolveCommittedAttackImpacts({
        currentTick: 15,
        attacks: [attack],
        combatants: []
      }),
      resolveCommittedAttackImpacts({
        currentTick: 15,
        attacks: [
          { ...attack, attackId: "attack.zulu" as never, damage: 13 },
          { ...attack, attackId: "attack.alpha" as never, damage: 11 }
        ],
        combatants: [combatant]
      })
    ];
    expect(await canonicalHash(evidence)).toBe(
      "78d625835d6ad538cd3339ee44676a971e66e7afc19631f8f05a5bd2faf5e52d"
    );
  });

  it("pins validation and ordering boundaries", () => {
    const forward = resolveCommittedAttackImpacts({
      currentTick: 15,
      attacks: [
        { ...attack, attackId: "attack.zulu" as never },
        { ...attack, attackId: "attack.alpha" as never }
      ],
      combatants: [combatant]
    });
    const reverse = resolveCommittedAttackImpacts({
      currentTick: 15,
      attacks: [
        { ...attack, attackId: "attack.alpha" as never },
        { ...attack, attackId: "attack.zulu" as never }
      ],
      combatants: [combatant]
    });
    expect(forward).toEqual(reverse);
    expect(() =>
      resolveCommittedAttackImpacts({
        currentTick: 16,
        attacks: [attack],
        combatants: [combatant]
      })
    ).toThrow("passed its impact tick");
  });
});
