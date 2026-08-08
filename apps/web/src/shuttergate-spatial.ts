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

// These are authored ground-plane distances under the locked Shuttergate camera,
// not screen-space nudges. They preserve the approved 38 px occupancy footprint
// while allowing every displaced pivot to participate in world/depth projection.
const OCCUPANCY_COLUMN_SPACING_WORLD = 1.4843748465614681;
const OCCUPANCY_ROW_SPACING_WORLD = 2.8464562818556933;

function normalizedGroundCameraRight(): readonly [number, number] {
  const [x, y] = WORLD_TO_CAMERA[0];
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length === 0)
    throw new Error("invalid Shuttergate ground-plane camera basis");
  return [x / length, y / length];
}

const GROUND_CAMERA_RIGHT = normalizedGroundCameraRight();
const GROUND_CAMERA_DOWN = [
  GROUND_CAMERA_RIGHT[1],
  -GROUND_CAMERA_RIGHT[0]
] as const;

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

const UPRIGHT_ORIGIN = projectShuttergateWorldPoint({ x: 0, y: 0, z: 0 });
const UPRIGHT_UNIT = projectShuttergateWorldPoint({ x: 0, y: 0, z: 1 });
export const SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y =
  (UPRIGHT_UNIT.cameraDepth - UPRIGHT_ORIGIN.cameraDepth) /
  (UPRIGHT_UNIT.y - UPRIGHT_ORIGIN.y);

const GROUND_X_UNIT = projectShuttergateWorldPoint({ x: 1, y: 0, z: 0 });
const GROUND_Y_UNIT = projectShuttergateWorldPoint({ x: 0, y: 1, z: 0 });
const groundScreenXX = GROUND_X_UNIT.x - UPRIGHT_ORIGIN.x;
const groundScreenXY = GROUND_Y_UNIT.x - UPRIGHT_ORIGIN.x;
const groundScreenYX = GROUND_X_UNIT.y - UPRIGHT_ORIGIN.y;
const groundScreenYY = GROUND_Y_UNIT.y - UPRIGHT_ORIGIN.y;
const groundScreenDeterminant =
  groundScreenXX * groundScreenYY - groundScreenXY * groundScreenYX;
if (!Number.isFinite(groundScreenDeterminant) || groundScreenDeterminant === 0)
  throw new Error("invalid Shuttergate ground-plane projection");
const groundDepthX = GROUND_X_UNIT.cameraDepth - UPRIGHT_ORIGIN.cameraDepth;
const groundDepthY = GROUND_Y_UNIT.cameraDepth - UPRIGHT_ORIGIN.cameraDepth;
export const SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_X =
  (groundDepthX * groundScreenYY - groundDepthY * groundScreenYX) /
  groundScreenDeterminant;
export const SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_Y =
  (-groundDepthX * groundScreenXY + groundDepthY * groundScreenXX) /
  groundScreenDeterminant;

export const SHUTTERGATE_WORLD_ANCHORS: Readonly<Record<string, WorldPoint>> =
  Object.fromEntries(
    Object.entries(spatialContract.anchors).map(([nodeId, anchor]) => [
      nodeId,
      worldPoint(anchor.world, nodeId)
    ])
  );

// The simulation's gate node is the convergence immediately before the north
// guard, not the visible entrance threshold. The original scene marker used
// the threshold and made the west route reverse on screen just as combat began.
// Keep that authored marker in the exported contract, but project occupants
// through the route-correct convergence point.
const westHall = SHUTTERGATE_WORLD_ANCHORS["node.shuttergate_west_hall"];
const northGuard = SHUTTERGATE_WORLD_ANCHORS["node.shuttergate_north_guard"];
if (westHall === undefined || northGuard === undefined)
  throw new Error("missing Shuttergate route anchors");
const SHUTTERGATE_PRESENTATION_WORLD_ANCHORS: Readonly<
  Record<string, WorldPoint>
> = {
  ...SHUTTERGATE_WORLD_ANCHORS,
  "node.shuttergate_gate": {
    x: westHall.x + (northGuard.x - westHall.x) * 0.75,
    y: westHall.y + (northGuard.y - westHall.y) * 0.75,
    z: westHall.z + (northGuard.z - westHall.z) * 0.75
  }
};

export function shuttergateOccupancyWorldPoint(
  nodeId: string,
  columnOffset: number,
  rowOffset: number
): WorldPoint {
  const anchor = SHUTTERGATE_PRESENTATION_WORLD_ANCHORS[nodeId];
  if (anchor === undefined)
    throw new Error(`unknown Shuttergate node: ${nodeId}`);
  if (!Number.isFinite(columnOffset) || !Number.isFinite(rowOffset))
    throw new Error("Shuttergate occupancy offsets must be finite");
  const lateral = columnOffset * OCCUPANCY_COLUMN_SPACING_WORLD;
  const downward = rowOffset * OCCUPANCY_ROW_SPACING_WORLD;
  return {
    x:
      anchor.x +
      GROUND_CAMERA_RIGHT[0] * lateral +
      GROUND_CAMERA_DOWN[0] * downward,
    y:
      anchor.y +
      GROUND_CAMERA_RIGHT[1] * lateral +
      GROUND_CAMERA_DOWN[1] * downward,
    z: anchor.z
  };
}

export function projectShuttergateOccupancyPoint(
  nodeId: string,
  columnOffset: number,
  rowOffset: number
): ProjectedPoint {
  return projectShuttergateWorldPoint(
    shuttergateOccupancyWorldPoint(nodeId, columnOffset, rowOffset)
  );
}

export interface ShuttergateOccupant {
  readonly id: string;
  readonly nodeId: string;
}

export interface ProjectedShuttergateOccupant extends ProjectedPoint {
  readonly id: string;
}

export function projectShuttergateOccupants(
  orderedOccupants: readonly ShuttergateOccupant[]
): readonly ProjectedShuttergateOccupant[] {
  const nodeOccupancy = new Map<string, number>();
  for (const occupant of orderedOccupants)
    nodeOccupancy.set(
      occupant.nodeId,
      (nodeOccupancy.get(occupant.nodeId) ?? 0) + 1
    );
  const nodeSlots = new Map<string, number>();
  return orderedOccupants.map((occupant) => {
    const occupancy = nodeOccupancy.get(occupant.nodeId) ?? 1;
    const slot = nodeSlots.get(occupant.nodeId) ?? 0;
    nodeSlots.set(occupant.nodeId, slot + 1);
    const columns = Math.min(3, occupancy);
    const rows = Math.ceil(occupancy / columns);
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const projected = projectShuttergateOccupancyPoint(
      occupant.nodeId,
      column - (columns - 1) / 2,
      row - (rows - 1) / 2
    );
    return {
      id: occupant.id,
      ...quantizeShuttergatePivot(projected),
      cameraDepth: projected.cameraDepth
    };
  });
}

export const SHUTTERGATE_NODE_POSITIONS: Readonly<
  Record<string, { readonly x: number; readonly y: number }>
> = Object.fromEntries(
  Object.entries(SHUTTERGATE_PRESENTATION_WORLD_ANCHORS).map(
    ([nodeId, world]) => [
      nodeId,
      quantizeShuttergatePivot(projectShuttergateWorldPoint(world))
    ]
  )
);

export const SHUTTERGATE_SPATIAL_CONTRACT = spatialContract;
