import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import systemContentInput from "../../../content/fixtures/phase-2-system.json" with {
  type: "json"
};
import { createPhase2SystemScenarioEvidence } from "./phase-2-system-scenarios.js";

function reasons(
  events: readonly { readonly type: string; readonly reasonCode?: string }[]
): readonly string[] {
  return events.map((event) => `${event.type}:${event.reasonCode ?? "none"}`);
}

describe("Phase 2 battlefield system scenarios", () => {
  it("pins blocked queues, deterministic resume, and placement-driven routes", async () => {
    const content = await compileContent(systemContentInput);
    const evidence = createPhase2SystemScenarioEvidence(content);

    expect(reasons(evidence.entranceQueue.waitingEvents)).toEqual([
      "spawn.queued:entrance_occupied",
      "movement.moved:moved"
    ]);
    expect(reasons(evidence.entranceQueue.resumedEvents)).toEqual([
      "spawn.admitted:admitted"
    ]);
    expect(evidence.entranceQueue.finalState.battlefield).toMatchObject({
      occupancy: [
        { entityId: "entity.enemy.blocker", nodeId: "node.south" },
        { entityId: "entity.enemy.entrance_waiting", nodeId: "node.entry" }
      ],
      pendingSpawns: []
    });

    expect(reasons(evidence.liveCapQueue.cappedEvents)).toEqual([
      "spawn.admitted:admitted",
      "spawn.queued:live_enemy_cap_reached"
    ]);
    expect(reasons(evidence.liveCapQueue.resumedEvents)).toEqual([
      "spawn.admitted:admitted"
    ]);
    expect(evidence.liveCapQueue.finalState.battlefield).toMatchObject({
      occupancy: [
        { entityId: "entity.enemy.cap_second", nodeId: "node.entry" }
      ],
      pendingSpawns: []
    });

    expect(evidence.placementRoutes).toEqual({
      eastPlacement: { valid: true, issues: [] },
      eastAttackRoute: {
        entityId: "entity.dwarf.warden",
        placementPointId: "placement.east",
        approachNodeId: "node.east_approach",
        route: {
          nodeIds: ["node.entry", "node.east", "node.east_approach"],
          totalCost: 20
        }
      },
      southPlacement: { valid: true, issues: [] },
      southAttackRoute: {
        entityId: "entity.dwarf.warden",
        placementPointId: "placement.south",
        approachNodeId: "node.south_approach",
        route: {
          nodeIds: ["node.entry", "node.south", "node.south_approach"],
          totalCost: 20
        }
      }
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.placementRoutes.eastAttackRoute)).toBe(
      true
    );
    expect(await canonicalHash(evidence)).toBe(
      "7da8214a6d73f77ef4975b2b2eef859cb531e783a4dc4100f5df14a25f65b80a"
    );
  });
});
