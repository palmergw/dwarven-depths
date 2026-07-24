import type {
  ActiveCooldown,
  ActiveStatus,
  CombatTimerResolution,
  CombatTimerResolutionRequest,
  CooldownTimerDecision,
  EntityId,
  StableId,
  StatusApplication,
  StatusApplicationDecision,
  StatusApplicationRequest,
  StatusApplicationResolution,
  StatusId,
  StatusTimerDecision
} from "@dwarven-depths/contracts";

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const statusIdPattern = /^status\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const maximumRecords = 100_000;

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
  if (value.length > maximumRecords)
    throw new RangeError(
      `${description} cannot exceed ${maximumRecords} items`
    );
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

function requireInteger(value: unknown, description: string): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

function requireId<Id extends StableId>(
  value: unknown,
  pattern: RegExp,
  description: string
): Id {
  if (typeof value !== "string" || !pattern.test(value))
    throw new RangeError(`${description} must be a valid stable ID`);
  return value as Id;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareStatuses(
  left: Pick<ActiveStatus, "ownerEntityId" | "statusId">,
  right: Pick<ActiveStatus, "ownerEntityId" | "statusId">
): number {
  return (
    compareText(left.ownerEntityId, right.ownerEntityId) ||
    compareText(left.statusId, right.statusId)
  );
}

function statusKey(status: {
  readonly ownerEntityId: EntityId;
  readonly statusId: StatusId;
}): string {
  return `${status.ownerEntityId}\u0000${status.statusId}`;
}

function validateCooldown(value: unknown, index: number): ActiveCooldown {
  const description = `cooldown ${index}`;
  const record = requireDataRecord(
    value,
    [
      "schemaVersion",
      "cooldownId",
      "ownerEntityId",
      "startedAtTick",
      "completeAtTick"
    ],
    description
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const startedAtTick = requireInteger(
    record.startedAtTick,
    `${description} startedAtTick`
  );
  const completeAtTick = requireInteger(
    record.completeAtTick,
    `${description} completeAtTick`
  );
  if (completeAtTick < startedAtTick)
    throw new RangeError(`${description} completion cannot precede its start`);
  return Object.freeze({
    schemaVersion: 1,
    cooldownId: requireId<StableId>(
      record.cooldownId,
      stableIdPattern,
      `${description} cooldownId`
    ),
    ownerEntityId: requireId<EntityId>(
      record.ownerEntityId,
      entityIdPattern,
      `${description} ownerEntityId`
    ),
    startedAtTick,
    completeAtTick
  });
}

function validateStatus(value: unknown, index: number): ActiveStatus {
  const description = `status ${index}`;
  const record = requireDataRecord(
    value,
    [
      "schemaVersion",
      "statusId",
      "ownerEntityId",
      "appliedAtTick",
      "expiresAtTick",
      "magnitude"
    ],
    description
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const appliedAtTick = requireInteger(
    record.appliedAtTick,
    `${description} appliedAtTick`
  );
  const expiresAtTick = requireInteger(
    record.expiresAtTick,
    `${description} expiresAtTick`
  );
  if (expiresAtTick <= appliedAtTick)
    throw new RangeError(`${description} expiry must follow its application`);
  return Object.freeze({
    schemaVersion: 1,
    statusId: requireId<StatusId>(
      record.statusId,
      statusIdPattern,
      `${description} statusId`
    ),
    ownerEntityId: requireId<EntityId>(
      record.ownerEntityId,
      entityIdPattern,
      `${description} ownerEntityId`
    ),
    appliedAtTick,
    expiresAtTick,
    magnitude: requireInteger(record.magnitude, `${description} magnitude`)
  });
}

function validateApplication(value: unknown, index: number): StatusApplication {
  const description = `status application ${index}`;
  const record = requireDataRecord(
    value,
    [
      "schemaVersion",
      "statusId",
      "ownerEntityId",
      "durationTicks",
      "magnitude"
    ],
    description
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const durationTicks = requireInteger(
    record.durationTicks,
    `${description} durationTicks`
  );
  if (durationTicks === 0)
    throw new RangeError(`${description} durationTicks must be positive`);
  return Object.freeze({
    schemaVersion: 1,
    statusId: requireId<StatusId>(
      record.statusId,
      statusIdPattern,
      `${description} statusId`
    ),
    ownerEntityId: requireId<EntityId>(
      record.ownerEntityId,
      entityIdPattern,
      `${description} ownerEntityId`
    ),
    durationTicks,
    magnitude: requireInteger(record.magnitude, `${description} magnitude`)
  });
}

/** Resolves fixed-step phase 4 cooldown completion and status expiry. */
export function resolveCombatTimers(
  request: CombatTimerResolutionRequest
): CombatTimerResolution {
  const record = requireDataRecord(
    request,
    ["currentTick", "cooldowns", "statuses"],
    "combat timer resolution request"
  );
  const currentTick = requireInteger(record.currentTick, "currentTick");

  const cooldownIds = new Set<string>();
  const cooldowns = requireDenseDataArray(record.cooldowns, "cooldowns")
    .map(validateCooldown)
    .map((cooldown) => {
      if (cooldownIds.has(cooldown.cooldownId))
        throw new RangeError(`duplicate cooldown ID (${cooldown.cooldownId})`);
      cooldownIds.add(cooldown.cooldownId);
      if (currentTick < cooldown.startedAtTick)
        throw new RangeError(
          `cooldown has not started (${cooldown.cooldownId})`
        );
      return cooldown;
    })
    .sort((left, right) => compareText(left.cooldownId, right.cooldownId));

  const statusKeys = new Set<string>();
  const statuses = requireDenseDataArray(record.statuses, "statuses")
    .map(validateStatus)
    .map((status) => {
      const key = statusKey(status);
      if (statusKeys.has(key))
        throw new RangeError(
          `duplicate owner/status pair (${status.ownerEntityId}, ${status.statusId})`
        );
      statusKeys.add(key);
      if (currentTick < status.appliedAtTick)
        throw new RangeError(
          `status has not been applied (${status.ownerEntityId}, ${status.statusId})`
        );
      return status;
    })
    .sort(compareStatuses);

  const cooldownDecisions = cooldowns.map(
    (cooldown): CooldownTimerDecision =>
      Object.freeze({
        schemaVersion: 1,
        cooldownId: cooldown.cooldownId,
        ownerEntityId: cooldown.ownerEntityId,
        status: currentTick >= cooldown.completeAtTick ? "completed" : "active",
        reason:
          currentTick >= cooldown.completeAtTick
            ? "completion_tick_reached"
            : "waiting_for_completion"
      })
  );
  const statusDecisions = statuses.map(
    (status): StatusTimerDecision =>
      Object.freeze({
        schemaVersion: 1,
        statusId: status.statusId,
        ownerEntityId: status.ownerEntityId,
        status: currentTick >= status.expiresAtTick ? "expired" : "active",
        reason:
          currentTick >= status.expiresAtTick
            ? "expiry_tick_reached"
            : "waiting_for_expiry"
      })
  );

  return Object.freeze({
    schemaVersion: 1,
    cooldowns: Object.freeze(
      cooldowns.filter((cooldown) => currentTick < cooldown.completeAtTick)
    ),
    statuses: Object.freeze(
      statuses.filter((status) => currentTick < status.expiresAtTick)
    ),
    cooldownDecisions: Object.freeze(cooldownDecisions),
    statusDecisions: Object.freeze(statusDecisions)
  });
}

/** Applies new statuses after phase 4, refreshing identical owner/status pairs. */
export function applyStatusApplications(
  request: StatusApplicationRequest
): StatusApplicationResolution {
  const record = requireDataRecord(
    request,
    ["currentTick", "statuses", "applications"],
    "status application request"
  );
  const currentTick = requireInteger(record.currentTick, "currentTick");
  const statusesByKey = new Map<string, ActiveStatus>();
  for (const status of requireDenseDataArray(record.statuses, "statuses").map(
    validateStatus
  )) {
    const key = statusKey(status);
    if (statusesByKey.has(key))
      throw new RangeError(
        `duplicate owner/status pair (${status.ownerEntityId}, ${status.statusId})`
      );
    if (currentTick < status.appliedAtTick)
      throw new RangeError(
        `status has not been applied (${status.ownerEntityId}, ${status.statusId})`
      );
    if (currentTick >= status.expiresAtTick)
      throw new RangeError(
        `expired status must be removed before application (${status.ownerEntityId}, ${status.statusId})`
      );
    statusesByKey.set(key, status);
  }

  const applicationKeys = new Set<string>();
  const applications = requireDenseDataArray(
    record.applications,
    "status applications"
  )
    .map(validateApplication)
    .map((application) => {
      const key = statusKey(application);
      if (applicationKeys.has(key))
        throw new RangeError(
          `duplicate status application (${application.ownerEntityId}, ${application.statusId})`
        );
      applicationKeys.add(key);
      if (!Number.isSafeInteger(currentTick + application.durationTicks))
        throw new RangeError(
          `status expiry exceeds the safe-integer range (${application.ownerEntityId}, ${application.statusId})`
        );
      return application;
    })
    .sort(compareStatuses);

  const decisions: StatusApplicationDecision[] = [];
  for (const application of applications) {
    const key = statusKey(application);
    const previous = statusesByKey.get(key);
    const expiresAtTick = currentTick + application.durationTicks;
    const magnitude = Math.max(previous?.magnitude ?? 0, application.magnitude);
    statusesByKey.set(
      key,
      Object.freeze({
        schemaVersion: 1,
        statusId: application.statusId,
        ownerEntityId: application.ownerEntityId,
        appliedAtTick: currentTick,
        expiresAtTick,
        magnitude
      })
    );
    decisions.push(
      Object.freeze({
        schemaVersion: 1,
        statusId: application.statusId,
        ownerEntityId: application.ownerEntityId,
        status: previous === undefined ? "applied" : "refreshed",
        reason:
          previous === undefined
            ? "new_status"
            : "duration_refreshed_stronger_magnitude_retained",
        ...(previous === undefined
          ? {}
          : { previousMagnitude: previous.magnitude }),
        resultingMagnitude: magnitude,
        expiresAtTick
      })
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    statuses: Object.freeze([...statusesByKey.values()].sort(compareStatuses)),
    decisions: Object.freeze(decisions)
  });
}
