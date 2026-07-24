import type {
  ActiveStatus,
  StatusApplication,
  StatusApplicationDecision
} from "@dwarven-depths/contracts";

export interface StatusApplicationRuleResult {
  readonly status: ActiveStatus;
  readonly decision: StatusApplicationDecision;
}

/**
 * Applies the already-validated identical-status refresh rule. Validation and
 * stable application ordering remain the responsibility of the phase adapter.
 */
export function applyStatusApplicationRule(
  currentTick: number,
  previous: ActiveStatus | undefined,
  application: StatusApplication
): StatusApplicationRuleResult {
  const expiresAtTick = currentTick + application.durationTicks;
  const magnitude = Math.max(previous?.magnitude ?? 0, application.magnitude);
  const status = Object.freeze({
    schemaVersion: 1 as const,
    statusId: application.statusId,
    ownerEntityId: application.ownerEntityId,
    appliedAtTick: currentTick,
    expiresAtTick,
    magnitude
  });
  const decision = Object.freeze({
    schemaVersion: 1 as const,
    statusId: application.statusId,
    ownerEntityId: application.ownerEntityId,
    status:
      previous === undefined ? ("applied" as const) : ("refreshed" as const),
    reason:
      previous === undefined
        ? ("new_status" as const)
        : ("duration_refreshed_stronger_magnitude_retained" as const),
    ...(previous === undefined
      ? {}
      : { previousMagnitude: previous.magnitude }),
    resultingMagnitude: magnitude,
    expiresAtTick
  });
  return Object.freeze({ status, decision });
}
