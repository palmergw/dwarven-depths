import type {
  EnemyTargetAcquisitionDecision,
  EnemyTargetAcquisitionRequest,
  EnemyTargetCandidate,
  EnemyTargetKind
} from "@dwarven-depths/contracts";

const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const placementPointIdPattern =
  /^placement\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const targetKinds = new Set<EnemyTargetKind>([
  "living_dwarf",
  "attackable_blocker"
]);

function requireDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
  description: string
): Readonly<Record<Keys[number], unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${description} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${description} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => Object.hasOwn(descriptors, key))
  )
    throw new TypeError(
      `${description} must contain exactly ${expectedKeys.join(", ")}`
    );
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `${description}.${key} must be an enumerable data property`
      );
  }
  return Object.fromEntries(
    expectedKeys.map((key) => [key, descriptors[key]?.value])
  ) as Record<Keys[number], unknown>;
}

function requireDenseDataArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value))
    throw new TypeError("target candidates must be an array");
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError("target candidates must be a dense data array");
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `target candidates[${index}] must be an enumerable data item`
      );
    result.push(descriptor.value);
  }
  return result;
}

function validateCandidate(
  value: unknown,
  index: number
): EnemyTargetCandidate {
  const description = `enemy target candidate ${index}`;
  const record = requireDataRecord(
    value,
    [
      "entityId",
      "targetKind",
      "placementPointId",
      "pathCost",
      "isAlive",
      "isReachable",
      "opensRoute"
    ],
    description
  );
  if (
    typeof record.entityId !== "string" ||
    !entityIdPattern.test(record.entityId)
  )
    throw new RangeError(
      `${description} entityId must be an entity.* stable ID`
    );
  if (
    typeof record.targetKind !== "string" ||
    !targetKinds.has(record.targetKind as EnemyTargetKind)
  )
    throw new RangeError(`${description} has unknown targetKind`);
  if (
    typeof record.placementPointId !== "string" ||
    !placementPointIdPattern.test(record.placementPointId)
  )
    throw new RangeError(
      `${description} placementPointId must be a placement.* stable ID`
    );
  if (
    !Number.isSafeInteger(record.pathCost) ||
    Object.is(record.pathCost, -0) ||
    (record.pathCost as number) < 0
  )
    throw new RangeError(
      `${description} pathCost must be a non-negative safe integer`
    );
  for (const key of ["isAlive", "isReachable", "opensRoute"] as const) {
    if (typeof record[key] !== "boolean")
      throw new TypeError(`${description} ${key} must be boolean`);
  }
  if (record.targetKind === "living_dwarf" && record.opensRoute)
    throw new RangeError(
      `${description} living dwarf cannot be marked as a route-opening blocker`
    );
  return Object.freeze({
    entityId: record.entityId as EnemyTargetCandidate["entityId"],
    targetKind: record.targetKind as EnemyTargetKind,
    placementPointId:
      record.placementPointId as EnemyTargetCandidate["placementPointId"],
    pathCost: record.pathCost as number,
    isAlive: record.isAlive as boolean,
    isReachable: record.isReachable as boolean,
    opensRoute: record.opensRoute as boolean
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Selects the nearest eligible target for a basic enemy. */
export function acquireEnemyTarget(
  request: EnemyTargetAcquisitionRequest
): EnemyTargetAcquisitionDecision {
  const record = requireDataRecord(
    request,
    ["candidates"],
    "enemy target request"
  );
  const seen = new Set<string>();
  const eligible: EnemyTargetCandidate[] = [];
  const inputs = requireDenseDataArray(record.candidates);
  for (let index = 0; index < inputs.length; index += 1) {
    const candidate = validateCandidate(inputs[index], index);
    if (seen.has(candidate.entityId))
      throw new RangeError(
        `duplicate enemy target candidate entity ID (${candidate.entityId})`
      );
    seen.add(candidate.entityId);
    if (
      candidate.isAlive &&
      candidate.isReachable &&
      (candidate.targetKind === "living_dwarf" || candidate.opensRoute)
    )
      eligible.push(candidate);
  }
  eligible.sort(
    (left, right) =>
      left.pathCost - right.pathCost ||
      compareText(left.placementPointId, right.placementPointId) ||
      compareText(left.entityId, right.entityId)
  );
  const selected = eligible[0];
  if (selected === undefined)
    return Object.freeze({ reason: "no_eligible_targets" });
  return Object.freeze({
    targetEntityId: selected.entityId,
    targetKind: selected.targetKind,
    placementPointId: selected.placementPointId,
    pathCost: selected.pathCost,
    reason:
      selected.targetKind === "living_dwarf"
        ? "selected_reachable_dwarf"
        : "selected_route_opening_blocker"
  });
}
