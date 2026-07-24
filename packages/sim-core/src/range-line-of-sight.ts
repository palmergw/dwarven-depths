import type {
  AimPointDefinition,
  AimPointId,
  BattlefieldMapDefinition,
  OpaqueRegionDefinition
} from "@dwarven-depths/contracts";

const maximumSafeRange = Math.floor(Math.sqrt(Number.MAX_SAFE_INTEGER));

function getAimPoint(
  map: BattlefieldMapDefinition,
  aimPointId: AimPointId
): AimPointDefinition {
  const point = map.aimPoints.find((candidate) => candidate.id === aimPointId);
  if (point === undefined)
    throw new RangeError(`unknown aim point ID (${aimPointId})`);
  return point;
}

function requireRange(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > maximumSafeRange
  )
    throw new RangeError(
      `range must be a non-negative safe integer no greater than ${maximumSafeRange}`
    );
  return value as number;
}

function distanceSquared(
  source: AimPointDefinition,
  target: AimPointDefinition
): number {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const result = deltaX * deltaX + deltaY * deltaY;
  if (!Number.isSafeInteger(result))
    throw new RangeError("aim-point distance exceeds the safe-integer range");
  return result;
}

/** Returns exact squared Euclidean distance between authored integer centers. */
export function getAimPointDistanceSquared(
  map: BattlefieldMapDefinition,
  sourceAimPointId: AimPointId,
  targetAimPointId: AimPointId
): number {
  return distanceSquared(
    getAimPoint(map, sourceAimPointId),
    getAimPoint(map, targetAimPointId)
  );
}

/** Equality is included: a point exactly on the authored range is in range. */
export function isAimPointInRange(
  map: BattlefieldMapDefinition,
  sourceAimPointId: AimPointId,
  targetAimPointId: AimPointId,
  range: number
): boolean {
  const validatedRange = requireRange(range);
  return (
    getAimPointDistanceSquared(map, sourceAimPointId, targetAimPointId) <=
    validatedRange * validatedRange
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function orientation(first: Point, second: Point, third: Point): number {
  const value =
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x);
  return value === 0 ? 0 : value > 0 ? 1 : -1;
}

function onSegment(first: Point, point: Point, second: Point): boolean {
  return (
    point.x >= Math.min(first.x, second.x) &&
    point.x <= Math.max(first.x, second.x) &&
    point.y >= Math.min(first.y, second.y) &&
    point.y <= Math.max(first.y, second.y)
  );
}

function segmentsIntersect(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point
): boolean {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  if (
    firstOrientation !== secondOrientation &&
    thirdOrientation !== fourthOrientation
  )
    return true;
  return (
    (firstOrientation === 0 && onSegment(firstStart, secondStart, firstEnd)) ||
    (secondOrientation === 0 && onSegment(firstStart, secondEnd, firstEnd)) ||
    (thirdOrientation === 0 && onSegment(secondStart, firstStart, secondEnd)) ||
    (fourthOrientation === 0 && onSegment(secondStart, firstEnd, secondEnd))
  );
}

function pointInsideInclusive(
  point: Point,
  region: OpaqueRegionDefinition
): boolean {
  return (
    point.x >= region.minimumX &&
    point.x <= region.maximumX &&
    point.y >= region.minimumY &&
    point.y <= region.maximumY
  );
}

function segmentTouchesRegion(
  source: Point,
  target: Point,
  region: OpaqueRegionDefinition
): boolean {
  if (
    pointInsideInclusive(source, region) ||
    pointInsideInclusive(target, region)
  )
    return true;
  const lowerLeft = { x: region.minimumX, y: region.minimumY };
  const lowerRight = { x: region.maximumX, y: region.minimumY };
  const upperRight = { x: region.maximumX, y: region.maximumY };
  const upperLeft = { x: region.minimumX, y: region.maximumY };
  return (
    segmentsIntersect(source, target, lowerLeft, lowerRight) ||
    segmentsIntersect(source, target, lowerRight, upperRight) ||
    segmentsIntersect(source, target, upperRight, upperLeft) ||
    segmentsIntersect(source, target, upperLeft, lowerLeft)
  );
}

/**
 * Tests only authored opaque terrain. Dynamic units intentionally do not
 * participate. Crossing, endpoint contact, edge contact, and corner contact
 * all count as blocked.
 */
export function hasLineOfSight(
  map: BattlefieldMapDefinition,
  sourceAimPointId: AimPointId,
  targetAimPointId: AimPointId
): boolean {
  const source = getAimPoint(map, sourceAimPointId);
  const target = getAimPoint(map, targetAimPointId);
  return !map.opaqueRegions.some((region) =>
    segmentTouchesRegion(source, target, region)
  );
}
