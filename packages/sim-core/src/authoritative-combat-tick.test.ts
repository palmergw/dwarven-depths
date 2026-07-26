import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatTickParityEvidence } from "./authoritative-combat-tick.fixture.js";

const EXPECTED_CHECKSUM =
  "0a8893e62ea55fbc75c376206c9201ec08170d91d7912f7c1a373b001a118387";

describe("authoritative combat tick", () => {
  it("composes Shuttergate scheduling, actions, movement, and impacts", async () => {
    const evidence = await authoritativeCombatTickParityEvidence();
    expect(evidence.reversed).toEqual(evidence.forward);
    expect(evidence.forward.validationErrors).toEqual([
      "combat state phase must be COMBAT_RUNNING",
      "authoritative combat tick state.tick must be own enumerable data",
      "scheduled combat events overflow eventSequence"
    ]);
    expect(
      evidence.forward.state.battlefield?.enemyCombatants[0]
    ).toMatchObject({
      entityId: "entity.enemy.shuttergate_001",
      currentHealth: 32,
      lifecycleState: "active"
    });
    expect(evidence.forward.state.battlefield?.dwarfCombatants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "entity.dwarf.warden_north",
          currentHealth: 230,
          lifecycleState: "active"
        })
      ])
    );
    expect(evidence.forward.checkpoints[0]).toMatchObject({
      tick: 0,
      events: [
        expect.objectContaining({ type: "wave.started" }),
        expect.objectContaining({ type: "spawn.enqueued" }),
        expect.objectContaining({ type: "spawn.admitted" })
      ]
    });
    expect(evidence.forward.checkpoints[1]).toMatchObject({
      tick: 6,
      events: [expect.objectContaining({ type: "movement.moved", sequence: 3 })]
    });
    expect(evidence.forward.checkpoints[2]).toMatchObject({
      tick: 12,
      movement: {
        reservations: {
          decisions: [
            expect.objectContaining({
              status: "moved",
              toNodeId: "node.shuttergate_gate"
            })
          ]
        }
      }
    });
    expect(evidence.forward.checkpoints[5]).toMatchObject({
      tick: 20,
      impacts: {
        impactDecisions: [
          expect.objectContaining({ status: "resolved", damage: 10 })
        ]
      }
    });
    expect(evidence.forward.checkpoints[7]).toMatchObject({
      tick: 23,
      impacts: {
        impactDecisions: [
          expect.objectContaining({ status: "resolved", damage: 18 })
        ]
      }
    });
    expect(Object.isFrozen(evidence.forward.state)).toBe(true);
    expect(Object.isFrozen(evidence.forward.state.battlefield)).toBe(true);
    expect(evidence.forward.state.eventSequence).toBe(5);
    expect(await canonicalHash(evidence)).toBe(EXPECTED_CHECKSUM);
  });
});
