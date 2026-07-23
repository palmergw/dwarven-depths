import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalStringify } from "./index.js";

describe("canonicalStringify", () => {
  it("orders object keys recursively", () => {
    expect(canonicalStringify({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}'
    );
  });

  it("rejects values outside the deterministic integer contract", () => {
    expect(() => canonicalStringify({ value: 1.5 })).toThrow(/safe/);
    expect(() => canonicalStringify({ value: -0 })).toThrow(/safe/);
    expect(() => canonicalStringify({ value: undefined })).toThrow(
      /unsupported/
    );
  });

  it("produces the same hash for equivalent key order", async () => {
    await expect(canonicalHash({ a: 1, b: 2 })).resolves.toBe(
      await canonicalHash({ b: 2, a: 1 })
    );
  });
});
