const SAMPLE_KEYS = ["entities", "tick", "videoTimeMilliseconds"];
const ENTITY_KEYS = [
  "action",
  "alpha",
  "currentHealth",
  "id",
  "lifecycle",
  "nodeId",
  "screenPosition",
  "transitionTick",
  "worldPosition"
];
const ACTION_KEYS = ["kind", "phase"];
const ROUTE = [
  "node.shuttergate_west_entry",
  "node.shuttergate_west_hall",
  "node.shuttergate_gate"
];

function hasExactKeys(value, expected) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...expected].sort().join("\0")
  );
}

function finitePair(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function requireEntity(entity) {
  if (!hasExactKeys(entity, ENTITY_KEYS))
    throw new Error("motion entity must have the exact supported shape");
  if (
    typeof entity.id !== "string" ||
    !entity.id.startsWith("entity.") ||
    typeof entity.nodeId !== "string" ||
    !finitePair(entity.worldPosition) ||
    !finitePair(entity.screenPosition) ||
    !Number.isFinite(entity.currentHealth) ||
    entity.currentHealth < 0 ||
    !hasExactKeys(entity.action, ACTION_KEYS) ||
    typeof entity.action.kind !== "string" ||
    typeof entity.action.phase !== "string" ||
    (entity.lifecycle !== "active" &&
      entity.lifecycle !== "downed" &&
      entity.lifecycle !== "destroyed") ||
    (entity.transitionTick !== null &&
      (!Number.isSafeInteger(entity.transitionTick) ||
        entity.transitionTick < 0)) ||
    !Number.isFinite(entity.alpha) ||
    entity.alpha < 0 ||
    entity.alpha > 1
  )
    throw new Error("motion entity contains an invalid value");
}

export function validateBattlefieldMotionSamples(samples) {
  if (!Array.isArray(samples) || samples.length < 12)
    throw new Error("motion evidence requires at least 12 samples");
  let previousTime = -1;
  let previousTick = -1;
  for (const sample of samples) {
    if (!hasExactKeys(sample, SAMPLE_KEYS))
      throw new Error("motion sample must have the exact supported shape");
    if (
      !Number.isFinite(sample.videoTimeMilliseconds) ||
      sample.videoTimeMilliseconds < 0 ||
      sample.videoTimeMilliseconds <= previousTime ||
      !Number.isSafeInteger(sample.tick) ||
      sample.tick < previousTick ||
      !Array.isArray(sample.entities)
    )
      throw new Error("motion sample ordering or values are invalid");
    let previousId = "";
    for (const entity of sample.entities) {
      requireEntity(entity);
      if (entity.id <= previousId)
        throw new Error(
          "motion entities must use canonical unique ID ordering"
        );
      previousId = entity.id;
    }
    previousTime = sample.videoTimeMilliseconds;
    previousTick = sample.tick;
  }

  const trackedId = samples
    .flatMap((sample) => sample.entities)
    .find((entity) => entity.id.startsWith("entity.enemy."))?.id;
  if (trackedId === undefined)
    throw new Error("motion evidence has no hostile actor");

  const tracked = samples.map((sample) => ({
    sample,
    entity: sample.entities.find((entity) => entity.id === trackedId)
  }));
  const active = tracked.filter(({ entity }) => entity?.lifecycle === "active");
  const departures = tracked.filter(
    ({ entity }) =>
      entity?.lifecycle === "downed" || entity?.lifecycle === "destroyed"
  );
  if (active.length < 6)
    throw new Error("hostile active traversal is undersampled");
  if (departures.length < 4)
    throw new Error("hostile lifecycle transition is not retained long enough");

  let seenTrackedEntity = false;
  let seenRemoval = false;
  let lastActiveTick = -1;
  let departureKind;
  let departureTransitionTick;
  for (const { sample, entity } of tracked) {
    if (entity === undefined) {
      if (!seenTrackedEntity) continue;
      if (departureTransitionTick === undefined)
        throw new Error("hostile disappeared before a lifecycle transition");
      seenRemoval = true;
      continue;
    }
    if (seenRemoval) throw new Error("hostile reappeared after removal");
    seenTrackedEntity = true;
    if (entity.lifecycle === "active") {
      if (entity.transitionTick !== null)
        throw new Error("active hostile must not declare a transition tick");
      if (departureTransitionTick !== undefined)
        throw new Error(
          "hostile returned to active after a lifecycle transition"
        );
      lastActiveTick = sample.tick;
      continue;
    }
    if (
      entity.transitionTick === null ||
      entity.transitionTick > sample.tick ||
      entity.transitionTick <= lastActiveTick
    )
      throw new Error("hostile lifecycle transition tick is not authoritative");
    if (departureTransitionTick === undefined) {
      departureKind = entity.lifecycle;
      departureTransitionTick = entity.transitionTick;
    } else if (
      entity.lifecycle !== departureKind ||
      entity.transitionTick !== departureTransitionTick
    )
      throw new Error("hostile lifecycle transition changed during retention");
  }

  let previousRouteIndex = -1;
  let previousVisible;
  let maximumScreenStep = 0;
  const visitedRoute = [];
  for (const current of tracked) {
    const entity = current.entity;
    if (entity === undefined || entity.lifecycle !== "active") continue;
    const routeIndex = ROUTE.indexOf(entity.nodeId);
    if (routeIndex < 0)
      throw new Error(`hostile left the supported route: ${entity.nodeId}`);
    if (routeIndex < previousRouteIndex)
      throw new Error("hostile traversal moved backward along the route");
    if (routeIndex > previousRouteIndex) visitedRoute.push(entity.nodeId);
    previousRouteIndex = routeIndex;
    if (previousVisible !== undefined) {
      const elapsed =
        current.sample.videoTimeMilliseconds -
        previousVisible.sample.videoTimeMilliseconds;
      const distance = Math.hypot(
        entity.screenPosition[0] - previousVisible.entity.screenPosition[0],
        entity.screenPosition[1] - previousVisible.entity.screenPosition[1]
      );
      maximumScreenStep = Math.max(maximumScreenStep, distance);
      if (distance > Math.max(18, elapsed * 1.4))
        throw new Error(
          "hostile screen displacement exceeds continuous motion bound"
        );
    }
    previousVisible = { sample: current.sample, entity };
  }
  if (visitedRoute.join("\0") !== ROUTE.join("\0"))
    throw new Error(
      "hostile did not traverse the complete entry-to-combat route"
    );

  const phases = new Set(
    active
      .map(({ entity }) => entity)
      .filter((entity) => entity?.action.kind === "basic_attack")
      .map((entity) => entity.action.phase)
  );
  for (const phase of ["windup", "recovery"])
    if (!phases.has(phase))
      throw new Error(`hostile attack is missing ${phase}`);

  const dwarfHealth = samples.flatMap((sample) =>
    sample.entities
      .filter((entity) => entity.id.startsWith("entity.dwarf."))
      .map((entity) => entity.currentHealth)
  );
  if (
    dwarfHealth.length === 0 ||
    Math.min(...dwarfHealth) >= Math.max(...dwarfHealth)
  )
    throw new Error("hostile attack has no authoritative damage impact");

  const departureAlpha = departures.map(({ entity }) => entity.alpha);
  if (Math.max(...departureAlpha) - Math.min(...departureAlpha) < 0.4)
    throw new Error("hostile lifecycle transition has no readable fade");
  const firstDeparture = tracked.findIndex(
    ({ entity }) =>
      entity?.lifecycle === "downed" || entity?.lifecycle === "destroyed"
  );
  if (
    firstDeparture < 0 ||
    !tracked
      .slice(firstDeparture + 1)
      .some(({ entity }) => entity === undefined)
  )
    throw new Error(
      "hostile removal is not preceded by a completed lifecycle transition"
    );

  return {
    trackedEntityId: trackedId,
    sampleCount: samples.length,
    activeSampleCount: active.length,
    departureSampleCount: departures.length,
    visitedRoute,
    attackPhases: [...phases].sort(),
    maximumScreenStep
  };
}
