import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  getAimPointDistanceSquared,
  hasLineOfSight,
  isAimPointInRange
} from "./index.js";

const map = {
  kind: "map",
  id: "map.browser_geometry",
  nodes: [],
  connections: [],
  placementPoints: [],
  enemyEntrances: [],
  aimPoints: [
    { id: "aim.source", x: 0, y: 0 },
    { id: "aim.boundary", x: 6, y: 8 },
    { id: "aim.blocked", x: 12, y: 0 },
    { id: "aim.clear", x: 12, y: 8 }
  ],
  opaqueRegions: [
    {
      id: "opaque.wall",
      minimumX: 5,
      minimumY: -1,
      maximumX: 7,
      maximumY: 3
    }
  ]
} as never;

describe("range and line-of-sight browser parity", () => {
  it("pins representative integer geometry to the Node checksum", async () => {
    const evidence = {
      distanceSquared: getAimPointDistanceSquared(
        map,
        "aim.source" as never,
        "aim.boundary" as never
      ),
      equalRange: isAimPointInRange(
        map,
        "aim.source" as never,
        "aim.boundary" as never,
        10
      ),
      belowRange: isAimPointInRange(
        map,
        "aim.source" as never,
        "aim.boundary" as never,
        9
      ),
      blocked: hasLineOfSight(
        map,
        "aim.source" as never,
        "aim.blocked" as never
      ),
      clear: hasLineOfSight(map, "aim.source" as never, "aim.clear" as never)
    };

    expect(evidence).toEqual({
      distanceSquared: 100,
      equalRange: true,
      belowRange: false,
      blocked: false,
      clear: true
    });
    expect(await canonicalHash(evidence)).toBe(
      "5b4c5ad55c7baba156c077c16cf4684f54d72714fdf7c8543fa4f64de7fc995e"
    );
  });
});
