import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { selectDwarfTarget } from "./index.js";

const policies = [
  "nearest",
  "lowest_health",
  "highest_health",
  "highest_armor",
  "fastest",
  "boss_or_elite_first"
] as const;

const candidates = [
  {
    entityId: "entity.enemy.alpha" as never,
    distanceSquared: 25,
    currentHealth: 30,
    maximumHealth: 100,
    armor: 4,
    speed: 8,
    isBoss: false,
    isElite: false
  },
  {
    entityId: "entity.enemy.beta" as never,
    distanceSquared: 100,
    currentHealth: 10,
    maximumHealth: 100,
    armor: 12,
    speed: 6,
    isBoss: false,
    isElite: true
  },
  {
    entityId: "entity.enemy.gamma" as never,
    distanceSquared: 64,
    currentHealth: 80,
    maximumHealth: 100,
    armor: 2,
    speed: 14,
    isBoss: false,
    isElite: false
  }
] as const;

describe("dwarf target-selection browser parity", () => {
  it("pins all player-facing policies to the Node checksum", async () => {
    const decisions = policies.map((requestedPolicy) =>
      selectDwarfTarget({
        requestedPolicy,
        supportedPolicies: policies,
        candidates
      })
    );

    expect(decisions.map((decision) => decision.targetEntityId)).toEqual([
      "entity.enemy.alpha",
      "entity.enemy.beta",
      "entity.enemy.gamma",
      "entity.enemy.beta",
      "entity.enemy.gamma",
      "entity.enemy.beta"
    ]);
    expect(await canonicalHash(decisions)).toBe(
      "fa0043a573a612c1a36d7a0036b936d45c42758a0fc8f68f42f7701fbb0fff1c"
    );
  });
});
