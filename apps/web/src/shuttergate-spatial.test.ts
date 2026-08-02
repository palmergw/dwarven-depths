import { describe, expect, it } from "vitest";
import {
  projectShuttergateWorldPoint,
  quantizeShuttergatePivot,
  SHUTTERGATE_NODE_POSITIONS,
  SHUTTERGATE_SPATIAL_CONTRACT,
  SHUTTERGATE_WORLD_ANCHORS
} from "./shuttergate-spatial.js";

const EXPECTED_LEGACY_PIVOTS = {
  "node.shuttergate_west_entry": { x: 1054, y: 302 },
  "node.shuttergate_west_hall": { x: 838, y: 330 },
  "node.shuttergate_east_entry": { x: 1054, y: 302 },
  "node.shuttergate_east_hall": { x: 838, y: 330 },
  "node.shuttergate_gate": { x: 1110, y: 253 },
  "node.shuttergate_north_guard": { x: 605, y: 320 },
  "node.shuttergate_keep": { x: 432, y: 402 },
  "node.shuttergate_keep_guard": { x: 364, y: 476 }
} as const;

describe("Shuttergate shared-scene projection", () => {
  it("mechanically reproduces every approved runtime pivot", () => {
    expect(SHUTTERGATE_NODE_POSITIONS).toEqual(EXPECTED_LEGACY_PIVOTS);
  });

  it("agrees with Blender's unrounded exported projection", () => {
    for (const [nodeId, anchor] of Object.entries(
      SHUTTERGATE_SPATIAL_CONTRACT.anchors
    )) {
      const world = SHUTTERGATE_WORLD_ANCHORS[nodeId];
      const [expectedX, expectedY] = anchor.projectedPivot;
      if (
        world === undefined ||
        expectedX === undefined ||
        expectedY === undefined
      ) {
        throw new Error(`incomplete generated spatial anchor: ${nodeId}`);
      }
      const projected = projectShuttergateWorldPoint(world);
      expect(Math.abs(projected.x - expectedX)).toBeLessThanOrEqual(0.0001);
      expect(Math.abs(projected.y - expectedY)).toBeLessThanOrEqual(0.0001);
      expect(
        Math.abs(projected.cameraDepth - anchor.cameraDepth)
      ).toBeLessThanOrEqual(0.0001);
      expect(quantizeShuttergatePivot(projected)).toEqual({
        x: anchor.rasterPivot[0],
        y: anchor.rasterPivot[1]
      });
    }
  });

  it("preserves explicit coincident topology aliases", () => {
    expect(SHUTTERGATE_WORLD_ANCHORS["node.shuttergate_west_entry"]).toEqual(
      SHUTTERGATE_WORLD_ANCHORS["node.shuttergate_east_entry"]
    );
    expect(SHUTTERGATE_WORLD_ANCHORS["node.shuttergate_west_hall"]).toEqual(
      SHUTTERGATE_WORLD_ANCHORS["node.shuttergate_east_hall"]
    );
  });
});
