import type { BattlefieldMapDefinition } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  getAimPointDistanceSquared,
  hasLineOfSight,
  isAimPointInRange
} from "./index.js";

function geometryMap(): BattlefieldMapDefinition {
  return {
    kind: "map",
    id: "map.geometry" as never,
    nodes: [],
    connections: [],
    placementPoints: [],
    enemyEntrances: [],
    aimPoints: [
      { id: "aim.origin" as never, x: 0, y: 0 },
      { id: "aim.horizontal" as never, x: 10, y: 0 },
      { id: "aim.vertical" as never, x: 0, y: 10 },
      { id: "aim.diagonal" as never, x: 6, y: 8 },
      { id: "aim.clear" as never, x: 10, y: 10 },
      { id: "aim.edge" as never, x: 4, y: 5 },
      { id: "aim.corner_source" as never, x: 0, y: -2 },
      { id: "aim.corner_ray" as never, x: 10, y: 8 },
      { id: "aim.inside" as never, x: 5, y: 5 }
    ],
    opaqueRegions: [
      {
        id: "opaque.center" as never,
        minimumX: 4,
        minimumY: 4,
        maximumX: 6,
        maximumY: 6
      }
    ]
  };
}

describe("authored range and line of sight", () => {
  it("uses squared Euclidean distance for horizontal, vertical, and diagonal centers", () => {
    const map = geometryMap();
    expect(
      getAimPointDistanceSquared(
        map,
        "aim.origin" as never,
        "aim.horizontal" as never
      )
    ).toBe(100);
    expect(
      getAimPointDistanceSquared(
        map,
        "aim.origin" as never,
        "aim.vertical" as never
      )
    ).toBe(100);
    expect(
      getAimPointDistanceSquared(
        map,
        "aim.origin" as never,
        "aim.diagonal" as never
      )
    ).toBe(100);
    expect(
      isAimPointInRange(map, "aim.origin" as never, "aim.diagonal" as never, 10)
    ).toBe(true);
    expect(
      isAimPointInRange(map, "aim.origin" as never, "aim.diagonal" as never, 9)
    ).toBe(false);
  });

  it("blocks crossings, opaque endpoints, edge touches, and corner touches", () => {
    const map = geometryMap();
    expect(
      hasLineOfSight(map, "aim.origin" as never, "aim.clear" as never)
    ).toBe(false);
    expect(
      hasLineOfSight(map, "aim.origin" as never, "aim.inside" as never)
    ).toBe(false);
    expect(
      hasLineOfSight(map, "aim.origin" as never, "aim.edge" as never)
    ).toBe(false);
    expect(
      hasLineOfSight(
        map,
        "aim.corner_source" as never,
        "aim.corner_ray" as never
      )
    ).toBe(false);
  });

  it("keeps horizontal, vertical, and diagonal segments clear when terrain is not touched", () => {
    const map = geometryMap();
    expect(
      hasLineOfSight(map, "aim.origin" as never, "aim.horizontal" as never)
    ).toBe(true);
    expect(
      hasLineOfSight(map, "aim.origin" as never, "aim.vertical" as never)
    ).toBe(true);
    expect(
      hasLineOfSight(map, "aim.horizontal" as never, "aim.clear" as never)
    ).toBe(true);
  });

  it("rejects unknown IDs and malformed or unsafe ranges deterministically", () => {
    const map = geometryMap();
    expect(() =>
      hasLineOfSight(map, "aim.missing" as never, "aim.origin" as never)
    ).toThrowError("unknown aim point ID (aim.missing)");
    for (const range of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
      expect(() =>
        isAimPointInRange(
          map,
          "aim.origin" as never,
          "aim.clear" as never,
          range
        )
      ).toThrow("range must be a non-negative safe integer");
    }
  });

  it("is independent of record order and leaves authored content unchanged", () => {
    const map = geometryMap();
    const snapshot = structuredClone(map);
    const reordered = {
      ...map,
      aimPoints: [...map.aimPoints].reverse(),
      opaqueRegions: [...map.opaqueRegions].reverse()
    };
    expect(
      hasLineOfSight(reordered, "aim.origin" as never, "aim.clear" as never)
    ).toBe(hasLineOfSight(map, "aim.origin" as never, "aim.clear" as never));
    expect(map).toEqual(snapshot);
  });
});
