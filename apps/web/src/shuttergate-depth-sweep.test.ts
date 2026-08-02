/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import spatialContract from "../../../assets/game-art/layered-map-poc/blender/shuttergate-spatial-contract.json";
import {
  clipPresentationPixels,
  decodeStaticSceneDepth,
  type PresentationDepthModel,
  type StaticSceneDepth,
  type StaticSceneDepthContract,
  staticSceneDepthAt
} from "./shuttergate-depth.js";
import {
  projectShuttergateWorldPoint,
  SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_X,
  SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_Y,
  SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
  SHUTTERGATE_WORLD_ANCHORS
} from "./shuttergate-spatial.js";

interface Footprint {
  readonly id: "effect" | "raider" | "ring" | "warden";
  readonly width: number;
  readonly height: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly plane: "ground-plane" | "upright-billboard";
}

const FOOTPRINTS: readonly Footprint[] = [
  {
    id: "effect",
    width: 96,
    height: 58,
    pivotX: 48,
    pivotY: 41,
    plane: "upright-billboard"
  },
  {
    id: "raider",
    width: 80,
    height: 60,
    pivotX: 40,
    pivotY: 54,
    plane: "upright-billboard"
  },
  {
    id: "ring",
    width: 78,
    height: 32,
    pivotX: 39,
    pivotY: 18,
    plane: "ground-plane"
  },
  {
    id: "warden",
    width: 112,
    height: 72,
    pivotX: 56,
    pivotY: 66,
    plane: "upright-billboard"
  }
];

function loadDepth(): StaticSceneDepth {
  const bytes = readFileSync(
    new URL(
      "../../../assets/game-art/layered-map-poc/blender/outputs/static-scene-depth.bin",
      import.meta.url
    )
  );
  return decodeStaticSceneDepth(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer,
    spatialContract.staticDepth as unknown as StaticSceneDepthContract
  );
}

function modelFor(
  nodeId: string,
  footprint: Footprint
): PresentationDepthModel {
  const world = SHUTTERGATE_WORLD_ANCHORS[nodeId];
  if (world === undefined) throw new Error(`missing sweep anchor: ${nodeId}`);
  const projected = projectShuttergateWorldPoint(world);
  const shared = {
    cameraDepth: projected.cameraDepth,
    depthEdgeGuardPixels: 0,
    frameLeft: Math.round(projected.x) - footprint.pivotX,
    frameTop: Math.round(projected.y) - footprint.pivotY,
    pivotY: footprint.pivotY
  } as const;
  return footprint.plane === "ground-plane"
    ? {
        ...shared,
        kind: "ground-plane",
        cameraDepthPerPixelX: SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_X,
        cameraDepthPerPixelY: SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_Y,
        pivotX: footprint.pivotX
      }
    : {
        ...shared,
        kind: "upright-billboard",
        cameraDepthPerPixelY: SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y
      };
}

function oracleVisible(
  depth: StaticSceneDepth,
  model: PresentationDepthModel,
  localX: number,
  localY: number
): boolean {
  const frameX = model.frameLeft + localX;
  const frameY = model.frameTop + localY;
  if (
    frameX < 0 ||
    frameY < 0 ||
    frameX >= depth.width ||
    frameY >= depth.height
  )
    return true;
  let presentationDepth =
    model.cameraDepth + (localY - model.pivotY) * model.cameraDepthPerPixelY;
  if (model.kind === "ground-plane")
    presentationDepth += (localX - model.pivotX) * model.cameraDepthPerPixelX;
  return (
    staticSceneDepthAt(depth, frameX, frameY) >=
    presentationDepth - spatialContract.staticDepth.maximumQuantizationError
  );
}

function sweep(depth: StaticSceneDepth) {
  return Object.keys(SHUTTERGATE_WORLD_ANCHORS)
    .sort()
    .flatMap((nodeId) =>
      FOOTPRINTS.map((footprint) => {
        const model = modelFor(nodeId, footprint);
        const source = new Uint8ClampedArray(
          footprint.width * footprint.height * 4
        );
        for (let index = 3; index < source.length; index += 4)
          source[index] = 255;
        const rendered = clipPresentationPixels(
          source,
          footprint.width,
          footprint.height,
          depth,
          model,
          spatialContract.staticDepth.maximumQuantizationError
        );
        let visible = 0;
        for (let y = 0; y < footprint.height; y += 1) {
          for (let x = 0; x < footprint.width; x += 1) {
            const expectedVisible = oracleVisible(depth, model, x, y);
            const actualVisible =
              (rendered[(y * footprint.width + x) * 4 + 3] ?? 0) > 0;
            expect(actualVisible, `${nodeId}/${footprint.id}@${x},${y}`).toBe(
              expectedVisible
            );
            if (actualVisible) visible += 1;
          }
        }
        return {
          id: `${nodeId}/${footprint.id}`,
          occluded: footprint.width * footprint.height - visible
        };
      })
    );
}

describe("Shuttergate route-wide depth sweep", () => {
  it("binds every node and maximum presentation footprint to the CPU depth oracle", () => {
    expect(sweep(loadDepth())).toMatchInlineSnapshot(`
      [
        {
          "id": "node.shuttergate_east_entry/effect",
          "occluded": 4216,
        },
        {
          "id": "node.shuttergate_east_entry/raider",
          "occluded": 3090,
        },
        {
          "id": "node.shuttergate_east_entry/ring",
          "occluded": 1679,
        },
        {
          "id": "node.shuttergate_east_entry/warden",
          "occluded": 3915,
        },
        {
          "id": "node.shuttergate_east_hall/effect",
          "occluded": 1440,
        },
        {
          "id": "node.shuttergate_east_hall/raider",
          "occluded": 320,
        },
        {
          "id": "node.shuttergate_east_hall/ring",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_east_hall/warden",
          "occluded": 448,
        },
        {
          "id": "node.shuttergate_gate/effect",
          "occluded": 2651,
        },
        {
          "id": "node.shuttergate_gate/raider",
          "occluded": 1375,
        },
        {
          "id": "node.shuttergate_gate/ring",
          "occluded": 930,
        },
        {
          "id": "node.shuttergate_gate/warden",
          "occluded": 2610,
        },
        {
          "id": "node.shuttergate_keep/effect",
          "occluded": 1582,
        },
        {
          "id": "node.shuttergate_keep/raider",
          "occluded": 462,
        },
        {
          "id": "node.shuttergate_keep/ring",
          "occluded": 544,
        },
        {
          "id": "node.shuttergate_keep/warden",
          "occluded": 590,
        },
        {
          "id": "node.shuttergate_keep_guard/effect",
          "occluded": 639,
        },
        {
          "id": "node.shuttergate_keep_guard/raider",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_keep_guard/ring",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_keep_guard/warden",
          "occluded": 104,
        },
        {
          "id": "node.shuttergate_north_guard/effect",
          "occluded": 1440,
        },
        {
          "id": "node.shuttergate_north_guard/raider",
          "occluded": 320,
        },
        {
          "id": "node.shuttergate_north_guard/ring",
          "occluded": 95,
        },
        {
          "id": "node.shuttergate_north_guard/warden",
          "occluded": 448,
        },
        {
          "id": "node.shuttergate_west_entry/effect",
          "occluded": 4216,
        },
        {
          "id": "node.shuttergate_west_entry/raider",
          "occluded": 3090,
        },
        {
          "id": "node.shuttergate_west_entry/ring",
          "occluded": 1679,
        },
        {
          "id": "node.shuttergate_west_entry/warden",
          "occluded": 3915,
        },
        {
          "id": "node.shuttergate_west_hall/effect",
          "occluded": 1440,
        },
        {
          "id": "node.shuttergate_west_hall/raider",
          "occluded": 320,
        },
        {
          "id": "node.shuttergate_west_hall/ring",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_west_hall/warden",
          "occluded": 448,
        },
      ]
    `);
  });

  it("rejects the ShoulderRubble mixed-ordering regression class", () => {
    const depth = loadDepth();
    const expected = sweep(depth);
    const mutated = { ...depth, codes: new Uint16Array(depth.codes) };
    const witness = expected.find(({ occluded }) => occluded > 0);
    if (witness === undefined)
      throw new Error("route sweep has no occlusion witness");
    const [nodeId, footprintId] = witness.id.split("/");
    const footprint = FOOTPRINTS.find(({ id }) => id === footprintId);
    if (nodeId === undefined || footprint === undefined)
      throw new Error("invalid route sweep witness");
    const model = modelFor(nodeId, footprint);
    for (let y = 0; y < footprint.height; y += 1) {
      for (let x = 0; x < footprint.width; x += 1) {
        const frameX = model.frameLeft + x;
        const frameY = model.frameTop + y;
        if (
          frameX >= 0 &&
          frameY >= 0 &&
          frameX < depth.width &&
          frameY < depth.height
        )
          mutated.codes[frameY * depth.width + frameX] = depth.noSurfaceCode;
      }
    }
    expect(sweep(mutated)).not.toEqual(expected);
  });
});
