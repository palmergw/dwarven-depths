import { describe, expect, it } from "vitest";
import {
  projectShuttergateOccupancyPoint,
  projectShuttergateWorldPoint,
  quantizeShuttergatePivot,
  SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_X,
  SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_Y,
  SHUTTERGATE_NODE_POSITIONS,
  SHUTTERGATE_SPATIAL_CONTRACT,
  SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
  SHUTTERGATE_WORLD_ANCHORS,
  shuttergateOccupancyWorldPoint
} from "./shuttergate-spatial.js";

const EXPECTED_PRESENTATION_PIVOTS = {
  "node.shuttergate_west_entry": { x: 1054, y: 302 },
  "node.shuttergate_west_hall": { x: 838, y: 330 },
  "node.shuttergate_east_entry": { x: 1054, y: 302 },
  "node.shuttergate_east_hall": { x: 838, y: 330 },
  "node.shuttergate_gate": { x: 663, y: 323 },
  "node.shuttergate_north_guard": { x: 605, y: 320 },
  "node.shuttergate_keep": { x: 432, y: 402 },
  "node.shuttergate_keep_guard": { x: 364, y: 476 }
} as const;

describe("Shuttergate shared-scene projection", () => {
  it("mechanically reproduces every route-correct runtime pivot", () => {
    expect(SHUTTERGATE_NODE_POSITIONS).toEqual(EXPECTED_PRESENTATION_PIVOTS);
    expect(
      [
        "node.shuttergate_west_entry",
        "node.shuttergate_west_hall",
        "node.shuttergate_gate",
        "node.shuttergate_north_guard"
      ].map((nodeId) => SHUTTERGATE_NODE_POSITIONS[nodeId]?.x)
    ).toEqual([1054, 838, 663, 605]);
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

  it("derives upright per-pixel depth from the locked camera matrices", () => {
    expect(SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y).toBeCloseTo(
      0.023873517721913432,
      12
    );
  });

  it("derives ground-plane per-pixel depth from the locked camera matrices", () => {
    expect(SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_X).toBeCloseTo(
      -5.699541116843676e-10,
      12
    );
    expect(SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_Y).toBeCloseTo(
      -0.06391511297167159,
      12
    );
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
        EXPECTED_PRESENTATION_PIVOTS[
          nodeId as keyof typeof EXPECTED_PRESENTATION_PIVOTS
        ];
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
