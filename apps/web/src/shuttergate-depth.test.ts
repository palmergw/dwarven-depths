import { describe, expect, it } from "vitest";
import {
  decodeStaticSceneDepth,
  STATIC_DEPTH_HEADER_BYTES,
  type StaticSceneDepthContract,
  staticSceneDepthAt
} from "./shuttergate-depth.js";

const CONTRACT: StaticSceneDepthContract = {
  encoding: "uint16-linear-camera-depth",
  byteOrder: "little-endian",
  rowOrder: "top-left-row-major",
  width: 2,
  height: 2,
  cameraDepthRange: [0, 128],
  noSurfaceCode: 65535,
  quantization: "round-to-nearest",
  maximumQuantizationError: 128 / 65534 / 2
};

function fixture(codes: readonly number[]): ArrayBuffer {
  const bytes = new ArrayBuffer(STATIC_DEPTH_HEADER_BYTES + codes.length * 2);
  const view = new DataView(bytes);
  for (const [index, value] of [..."DDDEPTH\0"]
    .map((character) => character.charCodeAt(0))
    .entries())
    view.setUint8(index, value);
  view.setUint16(8, 1, true);
  view.setUint16(10, 2, true);
  view.setUint16(12, 2, true);
  view.setUint16(14, 0, true);
  codes.forEach((code, index) => {
    view.setUint16(STATIC_DEPTH_HEADER_BYTES + index * 2, code, true);
  });
  return bytes;
}

describe("Shuttergate static scene depth", () => {
  it("decodes explicit little-endian top-left rows and no-surface pixels", () => {
    const depth = decodeStaticSceneDepth(
      fixture([0, 32767, 65534, 65535]),
      CONTRACT
    );
    expect(staticSceneDepthAt(depth, 0, 0)).toBe(0);
    expect(staticSceneDepthAt(depth, 1, 0)).toBeCloseTo(
      (32767 * 128) / 65534,
      10
    );
    expect(staticSceneDepthAt(depth, 0, 1)).toBe(128);
    expect(staticSceneDepthAt(depth, 1, 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("strictly rejects malformed headers and payload lengths", () => {
    const badMagic = fixture([0, 0, 0, 0]);
    new DataView(badMagic).setUint8(0, 0);
    expect(() => decodeStaticSceneDepth(badMagic, CONTRACT)).toThrow(/magic/);
    expect(() => decodeStaticSceneDepth(fixture([0, 0, 0]), CONTRACT)).toThrow(
      /length/
    );
    const trailing = new Uint8Array(STATIC_DEPTH_HEADER_BYTES + 10);
    trailing.set(new Uint8Array(fixture([0, 0, 0, 0])));
    expect(() => decodeStaticSceneDepth(trailing.buffer, CONTRACT)).toThrow(
      /length/
    );
  });

  it("rejects unsupported metadata instead of guessing", () => {
    expect(() =>
      decodeStaticSceneDepth(fixture([0, 0, 0, 0]), {
        ...CONTRACT,
        byteOrder: "big-endian" as "little-endian"
      })
    ).toThrow(/contract/);
    const reserved = fixture([0, 0, 0, 0]);
    new DataView(reserved).setUint16(14, 1, true);
    expect(() => decodeStaticSceneDepth(reserved, CONTRACT)).toThrow(
      /reserved/
    );
  });
});
