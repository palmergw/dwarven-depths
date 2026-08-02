import spatialContract from "../../../assets/game-art/layered-map-poc/blender/shuttergate-spatial-contract.json";

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly cameraDepth: number;
}

type HomogeneousPoint = readonly [number, number, number, number];
type Matrix4 = readonly [
  readonly [number, number, number, number],
  readonly [number, number, number, number],
  readonly [number, number, number, number],
  readonly [number, number, number, number]
];

function multiplyRow(row: Matrix4[number], point: HomogeneousPoint): number {
  return (
    row[0] * point[0] +
    row[1] * point[1] +
    row[2] * point[2] +
    row[3] * point[3]
  );
}

function multiplyPoint(
  matrix: Matrix4,
  point: HomogeneousPoint
): HomogeneousPoint {
  return [
    multiplyRow(matrix[0], point),
    multiplyRow(matrix[1], point),
    multiplyRow(matrix[2], point),
    multiplyRow(matrix[3], point)
  ];
}

function requireSpatialContract(): void {
  if (
    spatialContract.schemaVersion !== 2 ||
    spatialContract.mapId !== "map.shuttergate_hall" ||
    spatialContract.frame.width !== 1280 ||
    spatialContract.frame.height !== 720 ||
    spatialContract.frame.origin !== "top-left" ||
    spatialContract.frame.rasterQuantization !== "floor(value-plus-0.5)" ||
    spatialContract.camera.projection !== "orthographic" ||
    spatialContract.camera.worldToCameraRowMajor.length !== 4 ||
    spatialContract.camera.worldToClipRowMajor.length !== 4
  ) {
    throw new Error("unsupported Shuttergate spatial contract");
  }
}

requireSpatialContract();

const WORLD_TO_CAMERA = spatialContract.camera
  .worldToCameraRowMajor as unknown as Matrix4;
const WORLD_TO_CLIP = spatialContract.camera
  .worldToClipRowMajor as unknown as Matrix4;

function worldPoint(values: readonly number[], nodeId: string): WorldPoint {
  const [x, y, z] = values;
  if (x === undefined || y === undefined || z === undefined) {
    throw new Error(`invalid world anchor for ${nodeId}`);
  }
  return { x, y, z };
}

export function projectShuttergateWorldPoint(
  point: WorldPoint
): ProjectedPoint {
  const homogeneous = [point.x, point.y, point.z, 1] as const;
  const clip = multiplyPoint(WORLD_TO_CLIP, homogeneous);
  const camera = multiplyPoint(WORLD_TO_CAMERA, homogeneous);
  const reciprocalW = 1 / clip[3];
  const normalizedX = clip[0] * reciprocalW;
  const normalizedY = clip[1] * reciprocalW;
  return {
    x: (normalizedX * 0.5 + 0.5) * spatialContract.frame.width,
    y: (1 - (normalizedY * 0.5 + 0.5)) * spatialContract.frame.height,
    cameraDepth: -camera[2]
  };
}

export function quantizeShuttergatePivot(point: ProjectedPoint): {
  readonly x: number;
  readonly y: number;
} {
  return { x: Math.floor(point.x + 0.5), y: Math.floor(point.y + 0.5) };
}

export const SHUTTERGATE_WORLD_ANCHORS: Readonly<Record<string, WorldPoint>> =
  Object.fromEntries(
    Object.entries(spatialContract.anchors).map(([nodeId, anchor]) => [
      nodeId,
      worldPoint(anchor.world, nodeId)
    ])
  );

export const SHUTTERGATE_NODE_POSITIONS: Readonly<
  Record<string, { readonly x: number; readonly y: number }>
> = Object.fromEntries(
  Object.entries(SHUTTERGATE_WORLD_ANCHORS).map(([nodeId, world]) => [
    nodeId,
    quantizeShuttergatePivot(projectShuttergateWorldPoint(world))
  ])
);

export const SHUTTERGATE_SPATIAL_CONTRACT = spatialContract;
