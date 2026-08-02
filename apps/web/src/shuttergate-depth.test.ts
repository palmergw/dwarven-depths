import { describe, expect, it } from "vitest";
import {
  clipPresentationPixels,
  clipUprightBillboardPixels,
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

  it("clips only opaque billboard pixels behind camera-nearer static depth", () => {
    const depth = decodeStaticSceneDepth(
      fixture([16384, 32767, 65535, 49151]),
      CONTRACT
    );
    const source = new Uint8ClampedArray([
      1, 2, 3, 255, 4, 5, 6, 128, 7, 8, 9, 255, 10, 11, 12, 255
    ]);
    const clipped = clipUprightBillboardPixels(
      source,
      2,
      2,
      depth,
      {
        kind: "upright-billboard",
        cameraDepth: 64,
        cameraDepthPerPixelY: 0,
        depthEdgeGuardPixels: 0,
        frameLeft: 0,
        frameTop: 0,
        pivotY: 0
      },
      CONTRACT.maximumQuantizationError
    );
    expect([...clipped]).toEqual([
      0, 0, 0, 0, 4, 5, 6, 128, 7, 8, 9, 255, 10, 11, 12, 255
    ]);
    expect([...source]).toEqual([
      1, 2, 3, 255, 4, 5, 6, 128, 7, 8, 9, 255, 10, 11, 12, 255
    ]);
  });

  it("uses the upright plane slope instead of one depth for the whole billboard", () => {
    const depth = decodeStaticSceneDepth(
      fixture([30720, 65535, 30720, 65535]),
      CONTRACT
    );
    const source = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
    expect([
      ...clipUprightBillboardPixels(
        source,
        1,
        2,
        depth,
        {
          kind: "upright-billboard",
          cameraDepth: 64,
          cameraDepthPerPixelY: 20,
          depthEdgeGuardPixels: 0,
          frameLeft: 0,
          frameTop: 0,
          pivotY: 1
        },
        CONTRACT.maximumQuantizationError
      )
    ]).toEqual([1, 2, 3, 255, 0, 0, 0, 0]);
  });

  it("depth-tests ground presentation per pixel in both screen axes", () => {
    const depth = decodeStaticSceneDepth(
      fixture([28159, 28159, 28159, 28159]),
      CONTRACT
    );
    const source = new Uint8ClampedArray([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255
    ]);
    expect([
      ...clipPresentationPixels(
        source,
        2,
        2,
        depth,
        {
          kind: "ground-plane",
          cameraDepth: 50,
          cameraDepthPerPixelX: 10,
          cameraDepthPerPixelY: 20,
          depthEdgeGuardPixels: 0,
          frameLeft: 0,
          frameTop: 0,
          pivotX: 0,
          pivotY: 0
        },
        CONTRACT.maximumQuantizationError
      )
    ]).toEqual([1, 2, 3, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...source]).toEqual([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255
    ]);
  });

  it("guards unstable static-depth edges used by antialiased authored surfaces", () => {
    const depth = decodeStaticSceneDepth(
      fixture([0, 65535, 65535, 65535]),
      CONTRACT
    );
    const source = new Uint8ClampedArray([1, 2, 3, 255]);
    expect([
      ...clipUprightBillboardPixels(
        source,
        1,
        1,
        depth,
        {
          kind: "upright-billboard",
          cameraDepth: 64,
          cameraDepthPerPixelY: 0,
          depthEdgeGuardPixels: 1,
          frameLeft: 0,
          frameTop: 0,
          pivotY: 0
        },
        CONTRACT.maximumQuantizationError
      )
    ]).toEqual([...source]);
  });

  it("preserves quantization-equal, transparent, and off-frame pixels", () => {
    const depth = decodeStaticSceneDepth(fixture([32767, 0, 0, 0]), CONTRACT);
    const equalDepth = staticSceneDepthAt(depth, 0, 0);
    const source = new Uint8ClampedArray([20, 21, 22, 255, 30, 31, 32, 0]);
    expect([
      ...clipUprightBillboardPixels(
        source,
        2,
        1,
        depth,
        {
          kind: "upright-billboard",
          cameraDepth: equalDepth + CONTRACT.maximumQuantizationError,
          cameraDepthPerPixelY: 0,
          depthEdgeGuardPixels: 0,
          frameLeft: 0,
          frameTop: 0,
          pivotY: 0
        },
        CONTRACT.maximumQuantizationError
      )
    ]).toEqual([...source]);
    expect([
      ...clipUprightBillboardPixels(
        source,
        2,
        1,
        depth,
        {
          kind: "upright-billboard",
          cameraDepth: 128,
          cameraDepthPerPixelY: 0,
          depthEdgeGuardPixels: 0,
          frameLeft: -2,
          frameTop: 0,
          pivotY: 0
        },
        CONTRACT.maximumQuantizationError
      )
    ]).toEqual([...source]);
  });

  it("strictly rejects malformed billboard models and buffers", () => {
    const depth = decodeStaticSceneDepth(fixture([0, 0, 0, 0]), CONTRACT);
    expect(() =>
      clipUprightBillboardPixels(
        new Uint8ClampedArray(3),
        1,
        1,
        depth,
        {
          kind: "upright-billboard",
          cameraDepth: 1,
          cameraDepthPerPixelY: 0,
          depthEdgeGuardPixels: 0,
          frameLeft: 0,
          frameTop: 0,
          pivotY: 0
        },
        CONTRACT.maximumQuantizationError
      )
    ).toThrow(/pixel buffer/);
    expect(() =>
      clipUprightBillboardPixels(
        new Uint8ClampedArray(4),
        1,
        1,
        depth,
        {
          kind: "upright-billboard",
          cameraDepth: Number.NaN,
          cameraDepthPerPixelY: 0,
          depthEdgeGuardPixels: 0,
          frameLeft: 0,
          frameTop: 0,
          pivotY: 0
        },
        CONTRACT.maximumQuantizationError
      )
    ).toThrow(/depth model/);
  });
});
