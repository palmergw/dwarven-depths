import type {
  DwarfTargetCandidate,
  DwarfTargetPolicy,
  DwarfTargetSelectionDecision,
  DwarfTargetSelectionReason,
  DwarfTargetSelectionRequest
} from "@dwarven-depths/contracts";

const targetPolicies = new Set<DwarfTargetPolicy>([
  "nearest",
  "lowest_health",
  "highest_health",
  "highest_armor",
  "fastest",
  "boss_or_elite_first"
]);
const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

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

function requireDenseDataArray(
  value: unknown,
  description: string
): readonly unknown[] {
  if (!Array.isArray(value))
    throw new TypeError(`${description} must be an array`);
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError(`${description} must be a dense data array`);
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `${description}[${index}] must be an enumerable data item`
      );
    items.push(descriptor.value);
  }
  return items;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requirePolicy(value: unknown, description: string): DwarfTargetPolicy {
  if (
    typeof value !== "string" ||
    !targetPolicies.has(value as DwarfTargetPolicy)
  )
    throw new RangeError(`unknown ${description} target policy`);
  return value as DwarfTargetPolicy;
}

function requireNonNegativeSafeInteger(
  value: unknown,
  description: string
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

function validateCandidate(
  candidate: unknown,
  index: number
): DwarfTargetCandidate {
  const description = `target candidate ${index}`;
  const record = requireDataRecord(
    candidate,
    [
      "entityId",
      "distanceSquared",
      "currentHealth",
      "maximumHealth",
      "armor",
      "speed",
      "isBoss",
      "isElite"
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
  const distanceSquared = requireNonNegativeSafeInteger(
    record.distanceSquared,
    `${description} distanceSquared`
  );
  const maximumHealth = requireNonNegativeSafeInteger(
    record.maximumHealth,
    `${description} maximumHealth`
  );
  const currentHealth = requireNonNegativeSafeInteger(
    record.currentHealth,
    `${description} currentHealth`
  );
  if (maximumHealth === 0)
    throw new RangeError(`${description} maximumHealth must be positive`);
  if (currentHealth === 0 || currentHealth > maximumHealth)
    throw new RangeError(
      `${description} currentHealth must be between 1 and maximumHealth`
    );
  const armor = requireNonNegativeSafeInteger(
    record.armor,
    `${description} armor`
  );
  const speed = requireNonNegativeSafeInteger(
    record.speed,
    `${description} speed`
  );
  if (typeof record.isBoss !== "boolean")
    throw new TypeError(`${description} isBoss must be boolean`);
  if (typeof record.isElite !== "boolean")
    throw new TypeError(`${description} isElite must be boolean`);

  return Object.freeze({
    entityId: record.entityId as DwarfTargetCandidate["entityId"],
    distanceSquared,
    currentHealth,
    maximumHealth,
    armor,
    speed,
    isBoss: record.isBoss,
    isElite: record.isElite
  });
}

function compareUniversal(
  left: DwarfTargetCandidate,
  right: DwarfTargetCandidate
): number {
  return (
    left.distanceSquared - right.distanceSquared ||
    compareText(left.entityId, right.entityId)
  );
}

function compareForPolicy(
  policy: DwarfTargetPolicy,
  left: DwarfTargetCandidate,
  right: DwarfTargetCandidate
): number {
  let preference = 0;
  switch (policy) {
    case "lowest_health":
      preference = left.currentHealth - right.currentHealth;
      break;
    case "highest_health":
      preference = right.currentHealth - left.currentHealth;
      break;
    case "highest_armor":
      preference = right.armor - left.armor;
      break;
    case "fastest":
      preference = right.speed - left.speed;
      break;
    case "nearest":
    case "boss_or_elite_first":
      break;
  }
  return preference || compareUniversal(left, right);
}

function decision(
  requestedPolicy: DwarfTargetPolicy,
  appliedPolicy: DwarfTargetPolicy,
  reason: DwarfTargetSelectionReason,
  target?: DwarfTargetCandidate
): DwarfTargetSelectionDecision {
  return Object.freeze({
    requestedPolicy,
    appliedPolicy,
    ...(target === undefined ? {} : { targetEntityId: target.entityId }),
    reason
  });
}

/**
 * Selects one already-valid, in-range, visible hostile using deterministic
 * player-facing policy and universal tie rules.
 */
export function selectDwarfTarget(
  request: DwarfTargetSelectionRequest
): DwarfTargetSelectionDecision {
  const record = requireDataRecord(
    request,
    ["requestedPolicy", "supportedPolicies", "candidates"],
    "target selection request"
  );
  const requestedPolicy = requirePolicy(record.requestedPolicy, "requested");
  const supportedPolicies = new Set<DwarfTargetPolicy>();
  for (const value of requireDenseDataArray(
    record.supportedPolicies,
    "supported target policies"
  )) {
    const policy = requirePolicy(value, "supported");
    if (supportedPolicies.has(policy))
      throw new RangeError(`duplicate supported target policy (${policy})`);
    supportedPolicies.add(policy);
  }

  const entityIds = new Set<string>();
  const candidates: DwarfTargetCandidate[] = [];
  const candidateInputs = requireDenseDataArray(
    record.candidates,
    "target candidates"
  );
  for (let index = 0; index < candidateInputs.length; index += 1) {
    const candidate = candidateInputs[index];
    const validated = validateCandidate(candidate, index);
    if (entityIds.has(validated.entityId))
      throw new RangeError(
        `duplicate target candidate entity ID (${validated.entityId})`
      );
    entityIds.add(validated.entityId);
    candidates.push(validated);
  }

  const supported = supportedPolicies.has(requestedPolicy);
  let appliedPolicy: DwarfTargetPolicy = supported
    ? requestedPolicy
    : "nearest";
  let reason: DwarfTargetSelectionReason = supported
    ? "selected_requested_policy"
    : "fallback_unsupported_policy";
  let eligible = candidates;

  if (candidates.length === 0)
    return decision(requestedPolicy, appliedPolicy, "no_valid_targets");

  if (appliedPolicy === "boss_or_elite_first") {
    eligible = candidates.filter(
      (candidate) => candidate.isBoss || candidate.isElite
    );
    if (eligible.length === 0) {
      appliedPolicy = "nearest";
      reason = "fallback_no_preferred_target";
      eligible = candidates;
    }
  }

  const target = [...eligible].sort((left, right) =>
    compareForPolicy(appliedPolicy, left, right)
  )[0];
  if (target === undefined)
    throw new Error("validated target candidates are missing");
  return decision(requestedPolicy, appliedPolicy, reason, target);
}
