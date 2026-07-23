import {
  canonicalHash,
  type EffectId,
  type EntityId,
  type StableEffectRecord,
  type StableEntityRecord,
  type StableTablesSnapshot
} from "@dwarven-depths/contracts";

export type StableTableErrorCode =
  | "invalid_snapshot"
  | "invalid_entity_id"
  | "invalid_effect_id"
  | "duplicate_entity_id"
  | "duplicate_effect_id"
  | "missing_source_entity"
  | "missing_target_entity"
  | "table_capacity_exceeded";

export class StableTableError extends Error {
  readonly code: StableTableErrorCode;
  readonly path: string;
  readonly relatedPaths: readonly string[];

  constructor(
    code: StableTableErrorCode,
    path: string,
    message: string,
    relatedPaths: readonly string[] = []
  ) {
    super(message);
    this.name = "StableTableError";
    this.code = code;
    this.path = path;
    this.relatedPaths = Object.freeze([...relatedPaths]);
  }
}

const entityIdPattern = /^entity\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const effectIdPattern = /^effect\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const maximumIdLength = 128;
const maximumTableRecords = 100_000;

function parseId<Id extends EntityId | EffectId>(
  value: unknown,
  path: string,
  kind: "entity" | "effect"
): Id {
  const pattern = kind === "entity" ? entityIdPattern : effectIdPattern;
  if (
    typeof value !== "string" ||
    value.length > maximumIdLength ||
    !pattern.test(value)
  ) {
    throw new StableTableError(
      kind === "entity" ? "invalid_entity_id" : "invalid_effect_id",
      path,
      `${kind} ID must be a lowercase dotted ID beginning with ${kind}. and containing kind and instance segments`
    );
  }
  return value as Id;
}

export function entityId(value: string): EntityId {
  return parseId(value, "$", "entity");
}

export function effectId(value: string): EffectId {
  return parseId(value, "$", "effect");
}

interface RawTablesSnapshot {
  readonly schemaVersion: unknown;
  readonly entities: unknown;
  readonly effects: unknown;
}

interface RawEntityRecord {
  readonly id: unknown;
}

interface RawEffectRecord {
  readonly id: unknown;
  readonly sourceEntityId: unknown;
  readonly targetEntityId: unknown;
}

function requirePlainRecord<Value extends object = Record<string, unknown>>(
  value: unknown,
  path: string
): Value {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new StableTableError(
      "invalid_snapshot",
      path,
      "must be a plain object"
    );
  }
  return value as Value;
}

function requireExactKeys(
  record: object,
  expected: readonly string[],
  path: string
): void {
  const ownKeys = Reflect.ownKeys(record);
  const symbol = ownKeys.find((key) => typeof key === "symbol");
  if (symbol !== undefined) {
    throw new StableTableError(
      "invalid_snapshot",
      path,
      "contains an unsupported symbol property"
    );
  }
  const keys = ownKeys as string[];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new StableTableError(
        "invalid_snapshot",
        `${path}/${key}`,
        "must be an enumerable data property"
      );
    }
  }
  const missing = expected.find((key) => !keys.includes(key));
  const unexpected = keys.find((key) => !expected.includes(key));
  if (missing === undefined && unexpected === undefined) return;
  throw new StableTableError(
    "invalid_snapshot",
    path,
    missing === undefined
      ? `contains unknown property ${unexpected}`
      : `is missing required property ${missing}`
  );
}

function requireDenseArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new StableTableError("invalid_snapshot", path, "must be an array");
  }
  if (value.length > maximumTableRecords) {
    throw new StableTableError(
      "invalid_snapshot",
      path,
      `must contain at most ${maximumTableRecords} records`
    );
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) {
    throw new StableTableError(
      "invalid_snapshot",
      path,
      "must be a dense array without extra properties"
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new StableTableError(
        "invalid_snapshot",
        `${path}/${index}`,
        "must be an enumerable array data item"
      );
    }
  }
  return value;
}

function compareIds(
  left: StableEntityRecord | StableEffectRecord,
  right: StableEntityRecord | StableEffectRecord
): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function freezeEntity(id: EntityId): StableEntityRecord {
  return Object.freeze({ id });
}

function freezeEffect(
  id: EffectId,
  sourceEntityId: EntityId,
  targetEntityId: EntityId
): StableEffectRecord {
  return Object.freeze({ id, sourceEntityId, targetEntityId });
}

function buildSnapshot(
  entities: Iterable<StableEntityRecord>,
  effects: Iterable<StableEffectRecord>
): StableTablesSnapshot {
  return Object.freeze({
    schemaVersion: 1,
    entities: Object.freeze([...entities].sort(compareIds)),
    effects: Object.freeze([...effects].sort(compareIds))
  });
}

export class AuthoritativeTables {
  readonly #snapshot: StableTablesSnapshot;
  readonly #entities: ReadonlyMap<EntityId, StableEntityRecord>;
  readonly #effects: ReadonlyMap<EffectId, StableEffectRecord>;
  readonly #effectsByEntity: ReadonlyMap<
    EntityId,
    readonly StableEffectRecord[]
  >;

  private constructor(snapshot: StableTablesSnapshot) {
    this.#snapshot = snapshot;
    this.#entities = new Map(
      snapshot.entities.map((record) => [record.id, record] as const)
    );
    this.#effects = new Map(
      snapshot.effects.map((record) => [record.id, record] as const)
    );
    const effectsByEntity = new Map<EntityId, StableEffectRecord[]>();
    for (const effect of snapshot.effects) {
      for (const id of new Set([
        effect.sourceEntityId,
        effect.targetEntityId
      ])) {
        const records = effectsByEntity.get(id) ?? [];
        records.push(effect);
        effectsByEntity.set(id, records);
      }
    }
    this.#effectsByEntity = new Map(
      [...effectsByEntity].map(([id, records]) => [
        id,
        Object.freeze(records.sort(compareIds))
      ])
    );
    Object.freeze(this);
  }

  static empty(): AuthoritativeTables {
    return new AuthoritativeTables(buildSnapshot([], []));
  }

  static fromSnapshot(input: unknown): AuthoritativeTables {
    const root = requirePlainRecord<RawTablesSnapshot>(input, "$");
    requireExactKeys(root, ["schemaVersion", "entities", "effects"], "$");
    if (root.schemaVersion !== 1) {
      throw new StableTableError(
        "invalid_snapshot",
        "$/schemaVersion",
        "must equal 1"
      );
    }
    const entityInputs = requireDenseArray(root.entities, "$/entities");
    const effectInputs = requireDenseArray(root.effects, "$/effects");

    const entities = new Map<EntityId, StableEntityRecord>();
    const entityPaths = new Map<EntityId, string>();
    for (let index = 0; index < entityInputs.length; index += 1) {
      const value = entityInputs[index];
      const path = `$/entities/${index}`;
      const record = requirePlainRecord<RawEntityRecord>(value, path);
      requireExactKeys(record, ["id"], path);
      const id = parseId<EntityId>(record.id, `${path}/id`, "entity");
      const earlierPath = entityPaths.get(id);
      if (earlierPath !== undefined) {
        throw new StableTableError(
          "duplicate_entity_id",
          `${path}/id`,
          `duplicates entity ID ${id}`,
          [`${earlierPath}/id`]
        );
      }
      entities.set(id, freezeEntity(id));
      entityPaths.set(id, path);
    }

    const effects = new Map<EffectId, StableEffectRecord>();
    const effectPaths = new Map<EffectId, string>();
    for (let index = 0; index < effectInputs.length; index += 1) {
      const value = effectInputs[index];
      const path = `$/effects/${index}`;
      const record = requirePlainRecord<RawEffectRecord>(value, path);
      requireExactKeys(
        record,
        ["id", "sourceEntityId", "targetEntityId"],
        path
      );
      const id = parseId<EffectId>(record.id, `${path}/id`, "effect");
      const earlierPath = effectPaths.get(id);
      if (earlierPath !== undefined) {
        throw new StableTableError(
          "duplicate_effect_id",
          `${path}/id`,
          `duplicates effect ID ${id}`,
          [`${earlierPath}/id`]
        );
      }
      const sourceEntityId = parseId<EntityId>(
        record.sourceEntityId,
        `${path}/sourceEntityId`,
        "entity"
      );
      const targetEntityId = parseId<EntityId>(
        record.targetEntityId,
        `${path}/targetEntityId`,
        "entity"
      );
      if (!entities.has(sourceEntityId)) {
        throw new StableTableError(
          "missing_source_entity",
          `${path}/sourceEntityId`,
          `references missing entity ${sourceEntityId}`
        );
      }
      if (!entities.has(targetEntityId)) {
        throw new StableTableError(
          "missing_target_entity",
          `${path}/targetEntityId`,
          `references missing entity ${targetEntityId}`
        );
      }
      effects.set(id, freezeEffect(id, sourceEntityId, targetEntityId));
      effectPaths.set(id, path);
    }

    return new AuthoritativeTables(
      buildSnapshot(entities.values(), effects.values())
    );
  }

  withEntity(record: StableEntityRecord): AuthoritativeTables {
    const input = requirePlainRecord<StableEntityRecord>(record, "$");
    requireExactKeys(input, ["id"], "$");
    const id = parseId<EntityId>(input.id, "$/id", "entity");
    if (this.#entities.has(id)) {
      throw new StableTableError(
        "duplicate_entity_id",
        "$/id",
        `duplicates entity ID ${id}`
      );
    }
    if (this.#snapshot.entities.length >= maximumTableRecords) {
      throw new StableTableError(
        "table_capacity_exceeded",
        "$",
        `entity table cannot exceed ${maximumTableRecords} records`
      );
    }
    return new AuthoritativeTables(
      buildSnapshot(
        [...this.#snapshot.entities, freezeEntity(id)],
        this.#snapshot.effects
      )
    );
  }

  withEffect(record: StableEffectRecord): AuthoritativeTables {
    const input = requirePlainRecord<StableEffectRecord>(record, "$");
    requireExactKeys(input, ["id", "sourceEntityId", "targetEntityId"], "$");
    const id = parseId<EffectId>(input.id, "$/id", "effect");
    if (this.#effects.has(id)) {
      throw new StableTableError(
        "duplicate_effect_id",
        "$/id",
        `duplicates effect ID ${id}`
      );
    }
    if (this.#snapshot.effects.length >= maximumTableRecords) {
      throw new StableTableError(
        "table_capacity_exceeded",
        "$",
        `effect table cannot exceed ${maximumTableRecords} records`
      );
    }
    const sourceEntityId = parseId<EntityId>(
      input.sourceEntityId,
      "$/sourceEntityId",
      "entity"
    );
    const targetEntityId = parseId<EntityId>(
      input.targetEntityId,
      "$/targetEntityId",
      "entity"
    );
    if (!this.#entities.has(sourceEntityId)) {
      throw new StableTableError(
        "missing_source_entity",
        "$/sourceEntityId",
        `references missing entity ${sourceEntityId}`
      );
    }
    if (!this.#entities.has(targetEntityId)) {
      throw new StableTableError(
        "missing_target_entity",
        "$/targetEntityId",
        `references missing entity ${targetEntityId}`
      );
    }
    return new AuthoritativeTables(
      buildSnapshot(this.#snapshot.entities, [
        ...this.#snapshot.effects,
        freezeEffect(id, sourceEntityId, targetEntityId)
      ])
    );
  }

  withoutEntity(value: EntityId): AuthoritativeTables {
    const id = parseId<EntityId>(value, "$", "entity");
    if (!this.#entities.has(id)) return this;
    return new AuthoritativeTables(
      buildSnapshot(
        this.#snapshot.entities.filter((record) => record.id !== id),
        this.#snapshot.effects.filter(
          (record) =>
            record.sourceEntityId !== id && record.targetEntityId !== id
        )
      )
    );
  }

  withoutEffect(value: EffectId): AuthoritativeTables {
    const id = parseId<EffectId>(value, "$", "effect");
    if (!this.#effects.has(id)) return this;
    return new AuthoritativeTables(
      buildSnapshot(
        this.#snapshot.entities,
        this.#snapshot.effects.filter((record) => record.id !== id)
      )
    );
  }

  entity(value: EntityId): StableEntityRecord | undefined {
    return this.#entities.get(parseId<EntityId>(value, "$", "entity"));
  }

  effect(value: EffectId): StableEffectRecord | undefined {
    return this.#effects.get(parseId<EffectId>(value, "$", "effect"));
  }

  entities(): readonly StableEntityRecord[] {
    return this.#snapshot.entities;
  }

  effects(): readonly StableEffectRecord[] {
    return this.#snapshot.effects;
  }

  effectsForEntity(value: EntityId): readonly StableEffectRecord[] {
    const id = parseId<EntityId>(value, "$", "entity");
    return this.#effectsByEntity.get(id) ?? Object.freeze([]);
  }

  snapshot(): StableTablesSnapshot {
    return this.#snapshot;
  }

  checksum(): Promise<string> {
    return canonicalHash(this.#snapshot);
  }
}
