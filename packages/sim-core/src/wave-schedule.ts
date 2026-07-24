import type {
  PendingSpawn,
  StableId,
  WaveDefinition,
  WaveScheduleDecision,
  WaveScheduleRequest,
  WaveScheduleResolution,
  WaveSpawnEvent
} from "@dwarven-depths/contracts";

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function requireStableId(
  value: unknown,
  path: string,
  domain?: string
): asserts value is string {
  if (
    typeof value !== "string" ||
    !stableIdPattern.test(value) ||
    (domain !== undefined && !value.startsWith(`${domain}.`))
  )
    throw new RangeError(
      `${path} must be a ${domain === undefined ? "" : `${domain}.* `}stable ID`
    );
}

function requireTick(value: unknown, path: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new RangeError(`${path} must be a non-negative safe integer`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSpawns(left: PendingSpawn, right: PendingSpawn): number {
  return (
    left.authoredOrder - right.authoredOrder ||
    compareText(left.id, right.id) ||
    compareText(left.entityId, right.entityId)
  );
}

function freezeSpawn(event: WaveSpawnEvent): PendingSpawn {
  return Object.freeze({
    id: event.id,
    authoredOrder: event.authoredOrder,
    entityId: event.entityId,
    enemyDefinitionId: event.enemyDefinitionId,
    entranceId: event.entranceId
  });
}

function validateWave(wave: WaveDefinition): void {
  if (wave.kind !== "wave")
    throw new RangeError("wave definition kind must be wave");
  requireStableId(wave.id, "wave.id", "wave");
  requireTick(wave.startAtTick, `wave ${wave.id} startAtTick`);
  if (!Number.isSafeInteger(wave.durationTicks) || wave.durationTicks <= 0)
    throw new RangeError(
      `wave ${wave.id} durationTicks must be a positive safe integer`
    );
  const endAtTick = wave.startAtTick + wave.durationTicks;
  if (!Number.isSafeInteger(endAtTick))
    throw new RangeError(
      `wave ${wave.id} end tick exceeds the safe-integer range`
    );

  for (const event of wave.spawnEvents) {
    requireStableId(event.id, `wave ${wave.id} spawn id`, "spawn");
    requireTick(event.authoredOrder, `spawn ${event.id} authoredOrder`);
    requireTick(event.atTick, `spawn ${event.id} atTick`);
    requireStableId(event.entityId, `spawn ${event.id} entityId`, "entity");
    requireStableId(
      event.enemyDefinitionId,
      `spawn ${event.id} enemyDefinitionId`,
      "enemy"
    );
    requireStableId(
      event.entranceId,
      `spawn ${event.id} entranceId`,
      "entrance"
    );
    if (event.atTick < wave.startAtTick || event.atTick >= endAtTick)
      throw new RangeError(`spawn ${event.id} occurs outside wave ${wave.id}`);
  }
}

function uniqueIds(
  values: readonly StableId[],
  path: string,
  domain?: string
): Set<StableId> {
  const result = new Set<StableId>();
  for (const value of values) {
    requireStableId(value, path, domain);
    if (result.has(value))
      throw new RangeError(`${path} contains duplicate ID (${value})`);
    result.add(value);
  }
  return result;
}

/**
 * Resolves fixed-step phase 2 against authored round-combat timestamps. Wave
 * definitions are looked up through level.waveIds, so caller array order never
 * becomes gameplay data. Due events are idempotent against the fired-ID state.
 */
export function resolveWaveSchedule(
  request: WaveScheduleRequest
): WaveScheduleResolution {
  if (request.schemaVersion !== 1)
    throw new RangeError("wave schedule request schemaVersion must be 1");
  requireTick(request.currentTick, "currentTick");
  if (request.level.kind !== "level")
    throw new RangeError("wave schedule level must be a level definition");
  requireStableId(request.level.id, "level.id", "level");

  const waveById = new Map<StableId, WaveDefinition>();
  const spawnById = new Map<StableId, WaveSpawnEvent>();
  const waveIdBySpawnId = new Map<StableId, StableId>();
  const spawnedEntityIds = new Set<StableId>();
  const authoredOrders = new Set<number>();
  for (const wave of request.waves) {
    validateWave(wave);
    if (waveById.has(wave.id))
      throw new RangeError(`duplicate wave definition ID (${wave.id})`);
    waveById.set(wave.id, wave);
    for (const event of wave.spawnEvents) {
      if (spawnById.has(event.id))
        throw new RangeError(`duplicate authored spawn ID (${event.id})`);
      if (spawnedEntityIds.has(event.entityId))
        throw new RangeError(
          `duplicate authored spawn entity ID (${event.entityId})`
        );
      if (authoredOrders.has(event.authoredOrder))
        throw new RangeError(
          `duplicate authored spawn order (${event.authoredOrder})`
        );
      spawnById.set(event.id, event);
      waveIdBySpawnId.set(event.id, wave.id);
      spawnedEntityIds.add(event.entityId);
      authoredOrders.add(event.authoredOrder);
    }
  }

  const levelWaveIds = uniqueIds(
    request.level.waveIds,
    "level.waveIds",
    "wave"
  );
  if (levelWaveIds.size !== waveById.size)
    throw new RangeError("waves must exactly match level.waveIds");
  const orderedWaves = request.level.waveIds.map((waveId) => {
    const wave = waveById.get(waveId);
    if (wave === undefined)
      throw new RangeError(
        `level references missing wave definition (${waveId})`
      );
    return wave;
  });

  const started = uniqueIds(request.startedWaveIds, "startedWaveIds", "wave");
  for (const waveId of started) {
    const wave = waveById.get(waveId);
    if (wave === undefined)
      throw new RangeError(`unknown started wave ID (${waveId})`);
    if (wave.startAtTick > request.currentTick)
      throw new RangeError(`started wave ${waveId} is in the future`);
  }
  const fired = uniqueIds(request.firedSpawnIds, "firedSpawnIds", "spawn");
  for (const spawnId of fired) {
    const event = spawnById.get(spawnId);
    if (event === undefined)
      throw new RangeError(`unknown fired spawn ID (${spawnId})`);
    if (event.atTick > request.currentTick)
      throw new RangeError(`fired spawn ${spawnId} is in the future`);
    const waveId = waveIdBySpawnId.get(spawnId);
    if (waveId === undefined || !started.has(waveId))
      throw new RangeError(
        `fired spawn ${spawnId} belongs to a wave that is not marked started`
      );
  }

  const pendingById = new Map<StableId, PendingSpawn>();
  const pendingEntityIds = new Set<StableId>();
  for (const spawn of request.pendingSpawns) {
    requireStableId(spawn.id, "pending spawn id", "spawn");
    requireTick(spawn.authoredOrder, `pending spawn ${spawn.id} authoredOrder`);
    requireStableId(
      spawn.entityId,
      `pending spawn ${spawn.id} entityId`,
      "entity"
    );
    requireStableId(
      spawn.enemyDefinitionId,
      `pending spawn ${spawn.id} enemyDefinitionId`,
      "enemy"
    );
    requireStableId(
      spawn.entranceId,
      `pending spawn ${spawn.id} entranceId`,
      "entrance"
    );
    if (pendingById.has(spawn.id))
      throw new RangeError(`duplicate pending spawn ID (${spawn.id})`);
    if (pendingEntityIds.has(spawn.entityId))
      throw new RangeError(
        `duplicate pending spawn entity ID (${spawn.entityId})`
      );
    if (!fired.has(spawn.id))
      throw new RangeError(`pending spawn ${spawn.id} is not marked fired`);
    const authored = spawnById.get(spawn.id);
    if (
      authored === undefined ||
      authored.authoredOrder !== spawn.authoredOrder ||
      authored.entityId !== spawn.entityId ||
      authored.enemyDefinitionId !== spawn.enemyDefinitionId ||
      authored.entranceId !== spawn.entranceId
    )
      throw new RangeError(
        `pending spawn ${spawn.id} does not match authored schedule`
      );
    pendingById.set(spawn.id, spawn);
    pendingEntityIds.add(spawn.entityId);
  }

  const decisions: WaveScheduleDecision[] = [];
  for (const wave of orderedWaves) {
    if (wave.startAtTick <= request.currentTick && !started.has(wave.id)) {
      started.add(wave.id);
      decisions.push(
        Object.freeze({
          schemaVersion: 1,
          eventKind: "wave_started",
          eventId: wave.id,
          waveId: wave.id,
          status: "started",
          reason: "authored_wave_start_reached",
          authoredAtTick: wave.startAtTick
        })
      );
    }
  }

  const dueSpawns = orderedWaves
    .flatMap((wave) =>
      wave.spawnEvents.map((event) => ({ waveId: wave.id, event }))
    )
    .sort(
      (left, right) =>
        left.event.authoredOrder - right.event.authoredOrder ||
        compareText(left.event.id, right.event.id)
    );
  for (const { waveId, event } of dueSpawns) {
    if (event.atTick > request.currentTick || fired.has(event.id)) continue;
    fired.add(event.id);
    pendingById.set(event.id, freezeSpawn(event));
    decisions.push(
      Object.freeze({
        schemaVersion: 1,
        eventKind: "spawn_enqueued",
        eventId: event.id,
        waveId,
        status: "enqueued",
        reason: "authored_spawn_tick_reached",
        authoredAtTick: event.atTick,
        entityId: event.entityId,
        enemyDefinitionId: event.enemyDefinitionId,
        entranceId: event.entranceId
      })
    );
  }

  const orderedStarted = orderedWaves
    .filter((wave) => started.has(wave.id))
    .map((wave) => wave.id);
  const orderedFired = dueSpawns
    .filter(({ event }) => fired.has(event.id))
    .map(({ event }) => event.id);
  const pendingSpawns = [...pendingById.values()]
    .sort(compareSpawns)
    .map((spawn) => Object.freeze({ ...spawn }));

  return Object.freeze({
    schemaVersion: 1,
    startedWaveIds: Object.freeze(orderedStarted),
    firedSpawnIds: Object.freeze(orderedFired),
    pendingSpawns: Object.freeze(pendingSpawns),
    decisions: Object.freeze(decisions)
  });
}
