import { describe, expect, it } from "vitest";
import {
  projectShuttergateOccupancyPoint,
  projectShuttergateWorldPoint,
  quantizeShuttergatePivot,
  SHUTTERGATE_NODE_POSITIONS,
  SHUTTERGATE_SPATIAL_CONTRACT,
  SHUTTERGATE_WORLD_ANCHORS,
  shuttergateOccupancyWorldPoint
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

  it("projects same-node occupancy from anchor-local ground offsets", () => {
    for (const [nodeId, anchor] of Object.entries(SHUTTERGATE_WORLD_ANCHORS)) {
      const pivot =
        EXPECTED_LEGACY_PIVOTS[nodeId as keyof typeof EXPECTED_LEGACY_PIVOTS];
      expect(
        quantizeShuttergatePivot(projectShuttergateOccupancyPoint(nodeId, 0, 0))
      ).toEqual(pivot);
      for (const [column, row] of [
        [-1, -0.5],
        [0, -0.5],
        [1, -0.5],
        [-1, 0.5]
      ] as const) {
        const world = shuttergateOccupancyWorldPoint(nodeId, column, row);
        expect(world.z).toBe(anchor.z);
        expect(
          quantizeShuttergatePivot(
            projectShuttergateOccupancyPoint(nodeId, column, row)
          )
        ).toEqual({
          x: pivot.x + column * 38,
          y: pivot.y + row * 38
        });
      }
    }
  });

  it("applies identical local displacement to coincident aliases", () => {
    expect(
      shuttergateOccupancyWorldPoint("node.shuttergate_west_entry", 1, 0.5)
    ).toEqual(
      shuttergateOccupancyWorldPoint("node.shuttergate_east_entry", 1, 0.5)
    );
  });

  it("strictly rejects invalid occupancy requests", () => {
    expect(() =>
      shuttergateOccupancyWorldPoint("node.shuttergate_absent", 0, 0)
    ).toThrow("unknown Shuttergate node");
    expect(() =>
      shuttergateOccupancyWorldPoint("node.shuttergate_gate", Number.NaN, 0)
    ).toThrow("must be finite");
    expect(() =>
      shuttergateOccupancyWorldPoint("node.shuttergate_gate", 0, Infinity)
    ).toThrow("must be finite");
  });
});
