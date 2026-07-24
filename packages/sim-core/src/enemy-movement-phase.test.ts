import { compileContent } from "@dwarven-depths/content-runtime";
import {
  type ContentBundle,
  canonicalHash,
  type EnemyMovementPlanningRequest
} from "@dwarven-depths/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type BattlefieldDwarfDeploymentAuthority,
  createBattlefieldDwarfDeploymentAuthority
} from "./battlefield-attack-impact.js";
import {
  contentionRequest,
  enemyMovementPhaseContent,
  enemyMovementPhaseParityEvidence
} from "./enemy-movement-phase.fixture.js";
import { resolveEnemyMovementPhase as executeEnemyMovementPhase } from "./index.js";

let content: Awaited<ReturnType<typeof compileContent>>;
let dwarfAuthority: BattlefieldDwarfDeploymentAuthority;

beforeAll(async () => {
  content = await compileContent(
    enemyMovementPhaseContent as unknown as ContentBundle
  );
  dwarfAuthority = createBattlefieldDwarfDeploymentAuthority(
    [
      {
        entityId: "entity.dwarf.warden" as never,
        characterDefinitionId: "character.iron_warden" as never,
        placementPointId: "placement.goal" as never
      }
    ],
    "map.conformance_diamond" as never,
    content
  );
});

function resolveEnemyMovementPhase(
  request: Parameters<typeof executeEnemyMovementPhase>[0],
  compiled: Parameters<typeof executeEnemyMovementPhase>[1]
) {
  return executeEnemyMovementPhase(request, compiled, dwarfAuthority);
}

describe("generated enemy movement phase", () => {
  it("applies stable reservation winners and advances moved and waited cadence", async () => {
    const { contention, stationary } = await enemyMovementPhaseParityEvidence();
    expect(contention.reservations.decisions).toMatchObject([
      {
        entityId: "entity.enemy.proposed",
        status: "moved",
        reason: "moved"
      },
      {
        entityId: "entity.enemy.second",
        status: "waited",
        reason: "destination_reserved"
      }
    ]);
    expect(contention.battlefield.occupancy).toEqual([
      { entityId: "entity.dwarf.warden", nodeId: "node.goal" },
      { entityId: "entity.enemy.proposed", nodeId: "node.south" },
      { entityId: "entity.enemy.second", nodeId: "node.west" }
    ]);
    expect(
      contention.battlefield.enemyCombatants.map(
        (combatant) => combatant.actionState.nextMovementAtTick
      )
    ).toEqual([12, 12]);
    expect(
      stationary.battlefield.enemyCombatants[0]?.actionState.nextMovementAtTick
    ).toBe(12);
    expect(stationary.reservations.decisions).toEqual([]);
  });

  it("is permutation invariant, detached, deeply frozen, and checksum pinned", async () => {
    const request = contentionRequest();
    const before = structuredClone(request);
    const forward = resolveEnemyMovementPhase(request, content);
    const reversed = resolveEnemyMovementPhase(
      {
        ...request,
        battlefield: {
          ...request.battlefield,
          startedWaveIds: [...request.battlefield.startedWaveIds].reverse(),
          firedSpawnIds: [...request.battlefield.firedSpawnIds].reverse(),
          occupancy: [...request.battlefield.occupancy].reverse(),
          pendingSpawns: [...request.battlefield.pendingSpawns].reverse(),
          enemyAdmissions: [...request.battlefield.enemyAdmissions].reverse(),
          enemyCombatants: [...request.battlefield.enemyCombatants].reverse()
        },
        entries: [...request.entries].reverse()
      } as EnemyMovementPlanningRequest,
      content
    );
    expect(reversed).toEqual(forward);
    expect(request).toEqual(before);
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.battlefield)).toBe(true);
    expect(Object.isFrozen(forward.battlefield.occupancy)).toBe(true);
    expect(
      Object.isFrozen(forward.battlefield.enemyCombatants[0]?.actionState)
    ).toBe(true);
    expect(await canonicalHash(await enemyMovementPhaseParityEvidence())).toBe(
      "057ef3257a1871a0cb155870e41e448711b29a64c3812a38f82df7542403c835"
    );
  });
});
