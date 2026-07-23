import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalStringify } from "./index.js";

describe("canonicalStringify", () => {
  it("orders object keys recursively", () => {
    expect(canonicalStringify({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}'
    );
  });

  it("rejects values outside the deterministic JSON contract", () => {
    expect(() => canonicalStringify({ value: 1.5 })).toThrow(/safe/);
    expect(() => canonicalStringify({ value: -0 })).toThrow(/safe/);
    expect(() => canonicalStringify({ value: undefined })).toThrow(
      /unsupported/
    );

    const sparse = new Array<unknown>(2);
    sparse[1] = 1;
    expect(() => canonicalStringify(sparse)).toThrow(/array/);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalStringify(cyclic)).toThrow(/cycle/);

    for (const unsupported of [
      new Date(0),
      new Map(),
      new Set(),
      1n,
      Symbol("value"),
      () => undefined
    ]) {
      expect(() => canonicalStringify(unsupported)).toThrow();
    }

    const extendedArray = [1] as number[] & { extra?: number };
    extendedArray.extra = 2;
    expect(() => canonicalStringify(extendedArray)).toThrow(
      /unsupported array properties/
    );
  });

  it("produces the same hash for equivalent key order", async () => {
    await expect(canonicalHash({ a: 1, b: 2 })).resolves.toBe(
      await canonicalHash({ b: 2, a: 1 })
    );
  });
});
