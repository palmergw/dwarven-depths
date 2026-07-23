import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import fixture from "../../../scenarios/conformance/stable-tables.json" with {
  type: "json"
};
import {
  AuthoritativeTables,
  effectId,
  entityId,
  type StableTableError
} from "./stable-tables.js";

const stableTablesChecksum =
  "6ea32a50c655cfe02f6c08ef08c3a742b65f6be310d35b41069ea61595e580ba";

function permutations<Value>(values: readonly Value[]): Value[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, candidate) => candidate !== index)).map(
      (tail) => [value, ...tail]
    )
  );
}

const entityRecords = [
  { id: entityId("entity.dwarf.alpha") },
  { id: entityId("entity.enemy.beta") },
  { id: entityId("entity.tower.gamma") }
] as const;

const effectRecords = [
  {
    id: effectId("effect.guard.alpha"),
    sourceEntityId: entityId("entity.tower.gamma"),
    targetEntityId: entityId("entity.dwarf.alpha")
  },
  {
    id: effectId("effect.mark.beta"),
    sourceEntityId: entityId("entity.dwarf.alpha"),
    targetEntityId: entityId("entity.enemy.beta")
  }
] as const;

function populatedTables(): AuthoritativeTables {
  let tables = AuthoritativeTables.empty();
  for (const record of entityRecords) tables = tables.withEntity(record);
  for (const record of effectRecords) tables = tables.withEffect(record);
  return tables;
}

describe("stable authoritative entity/effect tables", () => {
  it("normalizes the checked-in nonempty fixture and freezes public evidence", async () => {
    const tables = AuthoritativeTables.fromSnapshot(fixture);
    const snapshot = tables.snapshot();

    expect(snapshot.entities.map((record) => record.id)).toEqual([
      "entity.dwarf.alpha",
      "entity.enemy.beta",
      "entity.tower.gamma"
    ]);
    expect(snapshot.effects.map((record) => record.id)).toEqual([
      "effect.guard.alpha",
      "effect.mark.beta"
    ]);
    expect(await tables.checksum()).toBe(stableTablesChecksum);
    expect(await tables.checksum()).toBe(await canonicalHash(fixture));
    expect(Object.isFrozen(tables)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.entities)).toBe(true);
    expect(Object.isFrozen(snapshot.entities[0])).toBe(true);
    expect(Object.isFrozen(snapshot.effects)).toBe(true);
    expect(Object.isFrozen(snapshot.effects[0])).toBe(true);
    expect(() =>
      Object.defineProperty(snapshot.entities, "0", {
        value: { id: "entity.bad.id" }
      })
    ).toThrow();
  });

  it("serializes and hashes every insertion permutation identically", async () => {
    const hashes = new Set<string>();
    const snapshots = new Set<string>();

    for (const entities of permutations(entityRecords)) {
      for (const effects of permutations(effectRecords)) {
        let tables = AuthoritativeTables.empty();
        for (const record of entities) tables = tables.withEntity(record);
        for (const record of effects) tables = tables.withEffect(record);
        hashes.add(await tables.checksum());
        snapshots.add(JSON.stringify(tables.snapshot()));
      }
    }

    expect(hashes.size).toBe(1);
    expect(snapshots.size).toBe(1);
  });

  it("rejects malformed, duplicate, and dangling IDs with precise paths", () => {
    expect(() => entityId("Entity.bad.id")).toThrowError(
      expect.objectContaining({
        code: "invalid_entity_id",
        path: "$"
      })
    );
    expect(() => effectId("effect.onlyone")).toThrowError(
      expect.objectContaining({
        code: "invalid_effect_id",
        path: "$"
      })
    );

    expect(() =>
      AuthoritativeTables.fromSnapshot({
        schemaVersion: 1,
        entities: [{ id: "entity.dwarf.alpha" }, { id: "entity.dwarf.alpha" }],
        effects: []
      })
    ).toThrowError(
      expect.objectContaining({
        code: "duplicate_entity_id",
        path: "$/entities/1/id",
        relatedPaths: ["$/entities/0/id"]
      } satisfies Partial<StableTableError>)
    );

    expect(() =>
      AuthoritativeTables.fromSnapshot({
        schemaVersion: 1,
        entities: [{ id: "entity.dwarf.alpha" }],
        effects: [
          {
            id: "effect.guard.alpha",
            sourceEntityId: "entity.dwarf.alpha",
            targetEntityId: "entity.dwarf.alpha"
          },
          {
            id: "effect.guard.alpha",
            sourceEntityId: "entity.dwarf.alpha",
            targetEntityId: "entity.dwarf.alpha"
          }
        ]
      })
    ).toThrowError(
      expect.objectContaining({
        code: "duplicate_effect_id",
        path: "$/effects/1/id",
        relatedPaths: ["$/effects/0/id"]
      } satisfies Partial<StableTableError>)
    );

    const sparseEntities = new Array(1);
    expect(() =>
      AuthoritativeTables.fromSnapshot({
        schemaVersion: 1,
        entities: sparseEntities,
        effects: []
      })
    ).toThrowError(
      expect.objectContaining({
        code: "invalid_snapshot",
        path: "$/entities"
      } satisfies Partial<StableTableError>)
    );
    expect(() =>
      AuthoritativeTables.fromSnapshot({
        schemaVersion: 1,
        entities: new Array(100_001),
        effects: []
      })
    ).toThrowError(
      expect.objectContaining({
        code: "invalid_snapshot",
        path: "$/entities"
      } satisfies Partial<StableTableError>)
    );

    const tables = AuthoritativeTables.empty().withEntity(entityRecords[0]);
    expect(() =>
      tables.withEffect({
        id: effectId("effect.mark.missing"),
        sourceEntityId: entityRecords[0].id,
        targetEntityId: entityId("entity.enemy.missing")
      })
    ).toThrowError(
      expect.objectContaining({
        code: "missing_target_entity",
        path: "$/targetEntityId"
      } satisfies Partial<StableTableError>)
    );
    expect(() => tables.withEntity(entityRecords[0])).toThrowError(
      expect.objectContaining({ code: "duplicate_entity_id", path: "$/id" })
    );
    expect(() => populatedTables().withEffect(effectRecords[0])).toThrowError(
      expect.objectContaining({ code: "duplicate_effect_id", path: "$/id" })
    );
  });

  it("removes entities, effects, and all related index entries immutably", async () => {
    const original = populatedTables();
    const dwarfId = entityId("entity.dwarf.alpha");
    const markId = effectId("effect.mark.beta");

    expect(
      original.effectsForEntity(dwarfId).map((record) => record.id)
    ).toEqual(["effect.guard.alpha", "effect.mark.beta"]);

    const withoutDwarf = original.withoutEntity(dwarfId);
    expect(withoutDwarf.entity(dwarfId)).toBeUndefined();
    expect(withoutDwarf.effectsForEntity(dwarfId)).toEqual([]);
    expect(withoutDwarf.effects()).toEqual([]);
    expect(original.effects()).toHaveLength(2);

    const withoutMark = original.withoutEffect(markId);
    expect(withoutMark.effect(markId)).toBeUndefined();
    expect(
      withoutMark.effectsForEntity(dwarfId).map((record) => record.id)
    ).toEqual(["effect.guard.alpha"]);
    expect(original.effect(markId)).toBeDefined();

    const emptyHashes = new Set<string>();
    for (const order of permutations(entityRecords)) {
      let candidate = original;
      for (const record of order) {
        candidate = candidate.withoutEntity(record.id);
        expect(candidate.effectsForEntity(record.id)).toEqual([]);
      }
      expect(candidate.entities()).toEqual([]);
      expect(candidate.effects()).toEqual([]);
      emptyHashes.add(await candidate.checksum());
    }
    expect(emptyHashes.size).toBe(1);
    expect(original.withoutEntity(entityId("entity.enemy.missing"))).toBe(
      original
    );
  });
});
