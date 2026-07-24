import { compileContent } from "@dwarven-depths/content-runtime";
import type { ContentBundle } from "@dwarven-depths/contracts";
import shuttergateContent from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import { planEnemyRoute } from "./enemy-route-planning.js";

export async function enemyRouteParityEvidence() {
  const content = await compileContent(
    shuttergateContent as unknown as ContentBundle
  );
  const map = content.maps.get("map.shuttergate_hall" as never);
  if (map === undefined) throw new Error("missing Shuttergate map");
  const captain = planEnemyRoute({
    schemaVersion: 1,
    map,
    sourceNodeId: "node.shuttergate_west_entry" as never,
    targetPlacementPointId: "placement.shuttergate_north_guard" as never,
    range: 2,
    requiresLineOfSight: false,
    blockedNodeIds: ["node.shuttergate_north_guard" as never]
  });
  const slinger = planEnemyRoute({
    schemaVersion: 1,
    map,
    sourceNodeId: "node.shuttergate_east_entry" as never,
    targetPlacementPointId: "placement.shuttergate_north_guard" as never,
    range: 6,
    requiresLineOfSight: true,
    blockedNodeIds: ["node.shuttergate_north_guard" as never]
  });
  const unreachable = planEnemyRoute({
    schemaVersion: 1,
    map,
    sourceNodeId: "node.shuttergate_west_entry" as never,
    targetPlacementPointId: "placement.shuttergate_north_guard" as never,
    range: 1,
    requiresLineOfSight: false,
    blockedNodeIds: ["node.shuttergate_north_guard" as never]
  });
  return Object.freeze({ captain, slinger, unreachable });
}
