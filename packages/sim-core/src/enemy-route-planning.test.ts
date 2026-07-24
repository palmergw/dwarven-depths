import { compileContent } from "@dwarven-depths/content-runtime";
import {
  type ContentBundle,
  canonicalHash,
  type EnemyRoutePlanningRequest
} from "@dwarven-depths/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import conformanceContent from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import { enemyRouteParityEvidence } from "./enemy-route-planning.fixture.js";
import { planEnemyRoute } from "./enemy-route-planning.js";

let conformanceMap: EnemyRoutePlanningRequest["map"];

beforeAll(async () => {
  const content = await compileContent(
    conformanceContent as unknown as ContentBundle
  );
  const map = content.maps.get("map.conformance_diamond" as never);
  if (map === undefined) throw new Error("missing conformance map");
  conformanceMap = map;
});

function conformanceRequest(
  overrides: Partial<EnemyRoutePlanningRequest> = {}
): EnemyRoutePlanningRequest {
  return {
    schemaVersion: 1,
    map: conformanceMap,
    sourceNodeId: "node.entry" as never,
    targetPlacementPointId: "placement.goal" as never,
    range: 1,
    requiresLineOfSight: false,
    blockedNodeIds: ["node.goal" as never],
    ...overrides
  };
}

describe("deterministic enemy attack-position route planning", () => {
  it("routes Shuttergate enemies to the first authored attack-valid position", async () => {
    const evidence = await enemyRouteParityEvidence();
    expect(evidence.captain).toEqual({
      schemaVersion: 1,
      status: "route_found",
      reason: "minimum_cost_route",
      sourceNodeId: "node.shuttergate_west_entry",
      targetPlacementPointId: "placement.shuttergate_north_guard",
      pathCost: 60,
      pathNodeIds: [
        "node.shuttergate_west_entry",
        "node.shuttergate_west_hall",
        "node.shuttergate_gate"
      ],
      nextNodeId: "node.shuttergate_west_hall",
      attackPositionNodeId: "node.shuttergate_gate"
    });
    expect(evidence.slinger.pathNodeIds).toEqual([
      "node.shuttergate_east_entry",
      "node.shuttergate_east_hall"
    ]);
    expect(evidence.slinger.attackPositionNodeId).toBe(
      "node.shuttergate_east_hall"
    );
    expect(evidence.unreachable.reason).toBe("no_attack_position_reachable");
  });

  it("uses authored neighbor order for equal-cost paths", () => {
    const request = conformanceRequest();
    const before = structuredClone(request.blockedNodeIds);
    const result = planEnemyRoute(request);
    expect(result.pathNodeIds).toEqual(["node.entry", "node.south"]);
    expect(result.pathCost).toBe(10);
    expect(request.blockedNodeIds).toEqual(before);
  });

  it("reports an already-valid source and never enters the target node", () => {
    const result = planEnemyRoute(
      conformanceRequest({ sourceNodeId: "node.south" as never })
    );
    expect(result).toEqual({
      schemaVersion: 1,
      status: "attack_position_reached",
      reason: "already_attack_valid",
      sourceNodeId: "node.south",
      targetPlacementPointId: "placement.goal",
      pathCost: 0,
      pathNodeIds: ["node.south"],
      nextNodeId: null,
      attackPositionNodeId: "node.south"
    });
  });

  it("respects solid blockers and emits stable unreachable evidence", () => {
    const routedAroundBlocker = planEnemyRoute(
      conformanceRequest({
        blockedNodeIds: ["node.south" as never, "node.goal" as never]
      })
    );
    const reversedBlockers = planEnemyRoute(
      conformanceRequest({
        blockedNodeIds: ["node.goal" as never, "node.south" as never]
      })
    );
    expect(routedAroundBlocker.pathNodeIds).toEqual([
      "node.entry",
      "node.east"
    ]);
    expect(reversedBlockers).toEqual(routedAroundBlocker);
    expect(
      planEnemyRoute(
        conformanceRequest({
          range: 0,
          blockedNodeIds: ["node.goal" as never]
        })
      )
    ).toEqual({
      schemaVersion: 1,
      status: "unreachable",
      reason: "no_attack_position_reachable",
      sourceNodeId: "node.entry",
      targetPlacementPointId: "placement.goal",
      pathCost: null,
      pathNodeIds: [],
      nextNodeId: null,
      attackPositionNodeId: null
    });
  });

  it("strictly validates route identity, blockers, shape, and bounds", () => {
    expect(() =>
      planEnemyRoute(
        conformanceRequest({ blockedNodeIds: ["node.entry" as never] })
      )
    ).toThrow("source node cannot be blocked");
    expect(() =>
      planEnemyRoute(
        conformanceRequest({
          blockedNodeIds: ["node.goal" as never, "node.goal" as never]
        })
      )
    ).toThrow("duplicate blocked navigation node");
    expect(() =>
      planEnemyRoute(
        conformanceRequest({ blockedNodeIds: ["node.missing" as never] })
      )
    ).toThrow("unknown blocked navigation node");
    expect(() => planEnemyRoute(conformanceRequest({ range: -1 }))).toThrow(
      "range must be a non-negative safe integer"
    );
    expect(() =>
      planEnemyRoute({ ...conformanceRequest(), extra: true } as never)
    ).toThrow("exactly the expected keys");
  });

  it("is detached, deeply immutable, and pinned to browser evidence", async () => {
    const evidence = await enemyRouteParityEvidence();
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.captain)).toBe(true);
    expect(Object.isFrozen(evidence.captain.pathNodeIds)).toBe(true);
    expect(await canonicalHash(evidence)).toBe(
      "f03ac8641f630e6c7cce70ed90b4b498abbe001a6da0f70ad2cf89785b60f44e"
    );
  });
});
