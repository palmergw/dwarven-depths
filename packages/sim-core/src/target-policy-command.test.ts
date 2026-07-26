import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import { resolveNormalizedDwarfActions } from "./dwarf-action-phase.js";
import { resolveTargetPolicyCommands } from "./target-policy-command.js";

const nearestEntry = {
  schemaVersion: 1 as const,
  dwarfEntityId: "entity.dwarf.warden" as never,
  requestedPolicy: "nearest" as const
};

function command(
  sequence: number,
  requestedPolicy: "nearest" | "lowest_health" | "highest_health"
) {
  return {
    tick: 6,
    sequence,
    command: {
      atTick: 6,
      type: "setTargetPolicy" as const,
      dwarfEntityId: "entity.dwarf.warden" as never,
      requestedPolicy
    }
  };
}

describe("target-policy commands", () => {
  it("changes same-tick authoritative target acquisition in input order", async () => {
    const evidence = await battlefieldAttackImpactParityEvidence();
    const cutter = evidence.readyToCommit.enemyCombatants[0];
    if (cutter === undefined) throw new Error("missing cutter fixture");
    const battlefield = {
      ...evidence.readyToCommit,
      occupancy: [
        ...evidence.readyToCommit.occupancy,
        {
          entityId: "entity.enemy.captain" as never,
          nodeId: "node.entry" as never
        }
      ],
      enemyCombatants: [
        {
          ...cutter,
          actionState: {
            ...cutter.actionState,
            currentTargetEntityId: null,
            activeBasicAttack: null,
            cooldownCompleteAtTick: null
          }
        },
        {
          ...cutter,
          entityId: "entity.enemy.captain" as never,
          currentHealth: 1,
          actionState: {
            ...cutter.actionState,
            currentTargetEntityId: null,
            activeBasicAttack: null,
            cooldownCompleteAtTick: null
          }
        }
      ],
      dwarfCombatants: evidence.readyToCommit.dwarfCombatants.map((dwarf) => ({
        ...dwarf,
        actionState: {
          ...dwarf.actionState,
          currentTargetEntityId: null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        }
      }))
    };
    const reduced = resolveTargetPolicyCommands(
      6,
      battlefield,
      [nearestEntry],
      [command(3, "lowest_health")],
      evidence.content
    );
    const nearest = resolveNormalizedDwarfActions(
      battlefield,
      6,
      [nearestEntry],
      evidence.content
    );
    const changed = resolveNormalizedDwarfActions(
      battlefield,
      6,
      reduced.entries,
      evidence.content
    );

    expect(reduced.decisions).toEqual([
      {
        schemaVersion: 1,
        sequence: 3,
        dwarfEntityId: "entity.dwarf.warden",
        requestedPolicy: "lowest_health",
        status: "accepted",
        reason: "target_policy_changed"
      }
    ]);
    expect(nearest.decisions[0]?.targetLock.targetEntityId).toBe(
      "entity.enemy.cutter"
    );
    expect(changed.decisions[0]?.targetLock.targetEntityId).toBe(
      "entity.enemy.captain"
    );
  });

  it("rejects duplicates, downed dwarves, unavailable dwarves, and unsupported policies", async () => {
    const evidence = await battlefieldAttackImpactParityEvidence();
    const downed = {
      ...evidence.readyToCommit,
      dwarfCombatants: evidence.readyToCommit.dwarfCombatants.map((dwarf) => ({
        ...dwarf,
        currentHealth: 0,
        lifecycleState: "downed" as const
      }))
    };
    const unavailable = {
      ...command(3, "nearest"),
      command: {
        ...command(3, "nearest").command,
        dwarfEntityId: "entity.dwarf.foreign" as never
      }
    };
    const downedResult = resolveTargetPolicyCommands(
      6,
      downed,
      [],
      [command(2, "nearest"), command(4, "highest_health"), unavailable],
      evidence.content
    );
    expect(downedResult.entries).toEqual([]);
    expect(downedResult.decisions.map(({ reason }) => reason)).toEqual([
      "dwarf_downed",
      "dwarf_unavailable",
      "duplicate_dwarf_command"
    ]);
    expect(() =>
      resolveNormalizedDwarfActions(
        downed,
        6,
        downedResult.entries,
        evidence.content
      )
    ).not.toThrow();

    const warden = evidence.content.characters.get(
      "character.iron_warden" as never
    );
    if (warden === undefined) throw new Error("missing Warden fixture");
    const restrictedContent = {
      ...evidence.content,
      characters: new Map([
        [
          warden.id,
          { ...warden, supportedTargetPolicies: ["nearest"] as const }
        ]
      ])
    };
    const unsupported = resolveTargetPolicyCommands(
      6,
      evidence.readyToCommit,
      [nearestEntry],
      [command(0, "lowest_health")],
      restrictedContent
    );
    expect(unsupported.entries).toEqual([nearestEntry]);
    expect(unsupported.decisions[0]?.reason).toBe("policy_unsupported");
  });

  it("rejects duplicate sequences and mismatched ticks", async () => {
    const evidence = await battlefieldAttackImpactParityEvidence();
    expect(() =>
      resolveTargetPolicyCommands(
        6,
        evidence.readyToCommit,
        [nearestEntry],
        [command(1, "nearest"), command(1, "lowest_health")],
        evidence.content
      )
    ).toThrow(/duplicate.*sequence/);
    expect(() =>
      resolveTargetPolicyCommands(
        7,
        evidence.readyToCommit,
        [nearestEntry],
        [command(1, "nearest")],
        evidence.content
      )
    ).toThrow(/does not match its tick/);
  });
});
