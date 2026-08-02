/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import spatialContract from "../../../assets/game-art/layered-map-poc/blender/shuttergate-spatial-contract.json";
import { compareRenderIds } from "./render-snapshot.js";
import {
  clipPresentationPixels,
  decodeStaticSceneDepth,
  type PresentationDepthModel,
  type StaticSceneDepth,
  type StaticSceneDepthContract,
  staticSceneDepthAt
} from "./shuttergate-depth.js";
import {
  type ProjectedShuttergateOccupant,
  projectShuttergateOccupants,
  SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_X,
  SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_Y,
  SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
  SHUTTERGATE_WORLD_ANCHORS
} from "./shuttergate-spatial.js";

interface Footprint {
  readonly id:
    | "effect"
    | "focus"
    | "raider"
    | "raider-ring"
    | "warden"
    | "warden-ring";
  readonly anchor: "dwarf" | "enemy";
  readonly width: number;
  readonly height: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly plane: "ground-plane" | "upright-billboard";
  readonly depthEdgeGuardPixels: number;
}

const FOOTPRINTS: readonly Footprint[] = [
  {
    id: "effect",
    anchor: "enemy",
    width: 100,
    height: 60,
    pivotX: 50,
    pivotY: 42,
    plane: "upright-billboard",
    depthEdgeGuardPixels: 1
  },
  {
    id: "focus",
    anchor: "dwarf",
    width: 84,
    height: 80,
    pivotX: 42,
    pivotY: 74,
    plane: "upright-billboard",
    depthEdgeGuardPixels: 1
  },
  {
    id: "raider",
    anchor: "enemy",
    width: 80,
    height: 60,
    pivotX: 40,
    pivotY: 54,
    plane: "upright-billboard",
    depthEdgeGuardPixels: 1
  },
  {
    id: "raider-ring",
    anchor: "enemy",
    width: 80,
    height: 40,
    pivotX: 40,
    pivotY: 20,
    plane: "ground-plane",
    depthEdgeGuardPixels: 0
  },
  {
    id: "warden",
    anchor: "dwarf",
    width: 112,
    height: 72,
    pivotX: 56,
    pivotY: 66,
    plane: "upright-billboard",
    depthEdgeGuardPixels: 1
  },
  {
    id: "warden-ring",
    anchor: "dwarf",
    width: 80,
    height: 40,
    pivotX: 40,
    pivotY: 20,
    plane: "ground-plane",
    depthEdgeGuardPixels: 0
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
  entity: ProjectedShuttergateOccupant,
  footprint: Footprint
): PresentationDepthModel {
  if (entity.cameraDepth === undefined)
    throw new Error(`missing sweep camera depth: ${entity.id}`);
  const shared = {
    cameraDepth: entity.cameraDepth,
    depthEdgeGuardPixels: footprint.depthEdgeGuardPixels,
    frameLeft: Math.round(entity.x) - footprint.pivotX,
    frameTop: Math.round(entity.y) - footprint.pivotY,
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
  const visibleDepth =
    presentationDepth - spatialContract.staticDepth.maximumQuantizationError;
  if (staticSceneDepthAt(depth, frameX, frameY) >= visibleDepth) return true;
  for (
    let offsetY = -model.depthEdgeGuardPixels;
    offsetY <= model.depthEdgeGuardPixels;
    offsetY += 1
  )
    for (
      let offsetX = -model.depthEdgeGuardPixels;
      offsetX <= model.depthEdgeGuardPixels;
      offsetX += 1
    ) {
      const neighborX = frameX + offsetX;
      const neighborY = frameY + offsetY;
      if (
        neighborX >= 0 &&
        neighborY >= 0 &&
        neighborX < depth.width &&
        neighborY < depth.height &&
        staticSceneDepthAt(depth, neighborX, neighborY) >= visibleDepth
      )
        return true;
    }
  return false;
}

function primitivesAt(nodeId: string) {
  return projectShuttergateOccupants(
    [
      { id: "entity.sweep.warden", nodeId },
      { id: "entity.sweep.raider", nodeId }
    ].sort((left, right) => compareRenderIds(left.id, right.id))
  );
}

function sweep(depth: StaticSceneDepth) {
  return Object.keys(SHUTTERGATE_WORLD_ANCHORS)
    .sort()
    .flatMap((nodeId) => {
      const primitives = primitivesAt(nodeId);
      return FOOTPRINTS.map((footprint) => {
        const entity = primitives.find(({ id }) =>
          footprint.anchor === "dwarf"
            ? id === "entity.sweep.warden"
            : id === "entity.sweep.raider"
        );
        if (entity === undefined)
          throw new Error(`missing ${footprint.anchor} sweep primitive`);
        const model = modelFor(entity, footprint);
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
      });
    });
}

describe("Shuttergate route-wide depth sweep", () => {
  it("binds every node and maximum presentation footprint to the CPU depth oracle", () => {
    expect(sweep(loadDepth())).toMatchInlineSnapshot(`
      [
        {
          "id": "node.shuttergate_east_entry/effect",
          "occluded": 3597,
        },
        {
          "id": "node.shuttergate_east_entry/focus",
          "occluded": 3773,
        },
        {
          "id": "node.shuttergate_east_entry/raider",
          "occluded": 2008,
        },
        {
          "id": "node.shuttergate_east_entry/raider-ring",
          "occluded": 1411,
        },
        {
          "id": "node.shuttergate_east_entry/warden",
          "occluded": 4412,
        },
        {
          "id": "node.shuttergate_east_entry/warden-ring",
          "occluded": 2893,
        },
        {
          "id": "node.shuttergate_east_hall/effect",
          "occluded": 1600,
        },
        {
          "id": "node.shuttergate_east_hall/focus",
          "occluded": 336,
        },
        {
          "id": "node.shuttergate_east_hall/raider",
          "occluded": 320,
        },
        {
          "id": "node.shuttergate_east_hall/raider-ring",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_east_hall/warden",
          "occluded": 448,
        },
        {
          "id": "node.shuttergate_east_hall/warden-ring",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_gate/effect",
          "occluded": 1998,
        },
        {
          "id": "node.shuttergate_gate/focus",
          "occluded": 2610,
        },
        {
          "id": "node.shuttergate_gate/raider",
          "occluded": 480,
        },
        {
          "id": "node.shuttergate_gate/raider-ring",
          "occluded": 1196,
        },
        {
          "id": "node.shuttergate_gate/warden",
          "occluded": 3643,
        },
        {
          "id": "node.shuttergate_gate/warden-ring",
          "occluded": 1803,
        },
        {
          "id": "node.shuttergate_keep/effect",
          "occluded": 1699,
        },
        {
          "id": "node.shuttergate_keep/focus",
          "occluded": 435,
        },
        {
          "id": "node.shuttergate_keep/raider",
          "occluded": 419,
        },
        {
          "id": "node.shuttergate_keep/raider-ring",
          "occluded": 544,
        },
        {
          "id": "node.shuttergate_keep/warden",
          "occluded": 547,
        },
        {
          "id": "node.shuttergate_keep/warden-ring",
          "occluded": 544,
        },
        {
          "id": "node.shuttergate_keep_guard/effect",
          "occluded": 973,
        },
        {
          "id": "node.shuttergate_keep_guard/focus",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_keep_guard/raider",
          "occluded": 117,
        },
        {
          "id": "node.shuttergate_keep_guard/raider-ring",
          "occluded": 228,
        },
        {
          "id": "node.shuttergate_keep_guard/warden",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_keep_guard/warden-ring",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_north_guard/effect",
          "occluded": 1598,
        },
        {
          "id": "node.shuttergate_north_guard/focus",
          "occluded": 336,
        },
        {
          "id": "node.shuttergate_north_guard/raider",
          "occluded": 320,
        },
        {
          "id": "node.shuttergate_north_guard/raider-ring",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_north_guard/warden",
          "occluded": 448,
        },
        {
          "id": "node.shuttergate_north_guard/warden-ring",
          "occluded": 319,
        },
        {
          "id": "node.shuttergate_west_entry/effect",
          "occluded": 3597,
        },
        {
          "id": "node.shuttergate_west_entry/focus",
          "occluded": 3773,
        },
        {
          "id": "node.shuttergate_west_entry/raider",
          "occluded": 2008,
        },
        {
          "id": "node.shuttergate_west_entry/raider-ring",
          "occluded": 1411,
        },
        {
          "id": "node.shuttergate_west_entry/warden",
          "occluded": 4412,
        },
        {
          "id": "node.shuttergate_west_entry/warden-ring",
          "occluded": 2893,
        },
        {
          "id": "node.shuttergate_west_hall/effect",
          "occluded": 1600,
        },
        {
          "id": "node.shuttergate_west_hall/focus",
          "occluded": 336,
        },
        {
          "id": "node.shuttergate_west_hall/raider",
          "occluded": 320,
        },
        {
          "id": "node.shuttergate_west_hall/raider-ring",
          "occluded": 0,
        },
        {
          "id": "node.shuttergate_west_hall/warden",
          "occluded": 448,
        },
        {
          "id": "node.shuttergate_west_hall/warden-ring",
          "occluded": 0,
        },
      ]
    `);
  }, 15_000);

  it("rejects the ShoulderRubble mixed-ordering regression class", () => {
    const depth = loadDepth();
    const expected = sweep(depth);
    const mutated = { ...depth, codes: new Uint16Array(depth.codes) };
    const nodeId = "node.shuttergate_gate";
    const footprint = FOOTPRINTS.find(({ id }) => id === "raider-ring");
    if (footprint === undefined)
      throw new Error("missing ring sweep footprint");
    const raider = primitivesAt(nodeId).find(
      ({ id }) => id === "entity.sweep.raider"
    );
    if (raider === undefined) throw new Error("missing raider sweep primitive");
    const model = modelFor(raider, footprint);
    for (let y = 0; y < footprint.height; y += 1) {
      for (let x = 0; x < footprint.pivotX; x += 1) {
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
    const candidate = sweep(mutated);
    const expectedWitness = expected.find(
      ({ id }) => id === `${nodeId}/raider-ring`
    );
    const candidateWitness = candidate.find(
      ({ id }) => id === `${nodeId}/raider-ring`
    );
    expect(expectedWitness?.occluded).toBeGreaterThan(0);
    expect(candidateWitness?.occluded).toBeGreaterThan(0);
    expect(candidateWitness?.occluded).toBeLessThan(
      expectedWitness?.occluded ?? 0
    );
    expect(candidate).not.toEqual(expected);
  }, 15_000);
});
