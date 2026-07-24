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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requirePolicy(value: unknown, description: string): DwarfTargetPolicy {
  if (
    typeof value !== "string" ||
    !targetPolicies.has(value as DwarfTargetPolicy)
  )
    throw new RangeError(
      `unknown ${description} target policy (${String(value)})`
    );
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
  candidate: DwarfTargetCandidate,
  index: number
): DwarfTargetCandidate {
  const description = `target candidate ${index}`;
  if (
    typeof candidate.entityId !== "string" ||
    !entityIdPattern.test(candidate.entityId)
  )
    throw new RangeError(
      `${description} entityId must be an entity.* stable ID`
    );
  const distanceSquared = requireNonNegativeSafeInteger(
    candidate.distanceSquared,
    `${description} distanceSquared`
  );
  const maximumHealth = requireNonNegativeSafeInteger(
    candidate.maximumHealth,
    `${description} maximumHealth`
  );
  const currentHealth = requireNonNegativeSafeInteger(
    candidate.currentHealth,
    `${description} currentHealth`
  );
  if (maximumHealth === 0)
    throw new RangeError(`${description} maximumHealth must be positive`);
  if (currentHealth === 0 || currentHealth > maximumHealth)
    throw new RangeError(
      `${description} currentHealth must be between 1 and maximumHealth`
    );
  const armor = requireNonNegativeSafeInteger(
    candidate.armor,
    `${description} armor`
  );
  const speed = requireNonNegativeSafeInteger(
    candidate.speed,
    `${description} speed`
  );
  if (typeof candidate.isBoss !== "boolean")
    throw new TypeError(`${description} isBoss must be boolean`);
  if (typeof candidate.isElite !== "boolean")
    throw new TypeError(`${description} isElite must be boolean`);

  return Object.freeze({
    entityId: candidate.entityId,
    distanceSquared,
    currentHealth,
    maximumHealth,
    armor,
    speed,
    isBoss: candidate.isBoss,
    isElite: candidate.isElite
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
  const requestedPolicy = requirePolicy(request.requestedPolicy, "requested");
  const supportedPolicies = new Set<DwarfTargetPolicy>();
  for (const value of request.supportedPolicies) {
    const policy = requirePolicy(value, "supported");
    if (supportedPolicies.has(policy))
      throw new RangeError(`duplicate supported target policy (${policy})`);
    supportedPolicies.add(policy);
  }

  const entityIds = new Set<string>();
  const candidates = request.candidates.map((candidate, index) => {
    const validated = validateCandidate(candidate, index);
    if (entityIds.has(validated.entityId))
      throw new RangeError(
        `duplicate target candidate entity ID (${validated.entityId})`
      );
    entityIds.add(validated.entityId);
    return validated;
  });

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
