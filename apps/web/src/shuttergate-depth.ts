export const STATIC_DEPTH_HEADER_BYTES = 16;
const STATIC_DEPTH_MAGIC = "DDDEPTH\0";
const STATIC_DEPTH_SCHEMA_VERSION = 1;
const STATIC_DEPTH_MAX_CODE = 65534;

export interface StaticSceneDepthContract {
  readonly encoding: "uint16-linear-camera-depth";
  readonly byteOrder: "little-endian";
  readonly rowOrder: "top-left-row-major";
  readonly width: number;
  readonly height: number;
  readonly cameraDepthRange: readonly [number, number];
  readonly noSurfaceCode: 65535;
  readonly quantization: "round-to-nearest";
  readonly maximumQuantizationError: number;
}

export interface StaticSceneDepth {
  readonly width: number;
  readonly height: number;
  readonly codes: Uint16Array;
  readonly cameraDepthRange: readonly [number, number];
  readonly noSurfaceCode: 65535;
}

export interface UprightBillboardDepthModel {
  readonly kind: "upright-billboard";
  readonly cameraDepth: number;
  readonly cameraDepthPerPixelY: number;
  readonly depthEdgeGuardPixels: number;
  readonly frameLeft: number;
  readonly frameTop: number;
  readonly pivotY: number;
}

export interface GroundPlaneDepthModel {
  readonly kind: "ground-plane";
  readonly cameraDepth: number;
  readonly cameraDepthPerPixelX: number;
  readonly cameraDepthPerPixelY: number;
  readonly depthEdgeGuardPixels: number;
  readonly frameLeft: number;
  readonly frameTop: number;
  readonly pivotX: number;
  readonly pivotY: number;
}

export type PresentationDepthModel =
  | GroundPlaneDepthModel
  | UprightBillboardDepthModel;

function requireSupportedContract(contract: StaticSceneDepthContract): void {
  const [minimum, maximum] = contract.cameraDepthRange;
  if (
    contract.encoding !== "uint16-linear-camera-depth" ||
    contract.byteOrder !== "little-endian" ||
    contract.rowOrder !== "top-left-row-major" ||
    contract.quantization !== "round-to-nearest" ||
    contract.noSurfaceCode !== 65535 ||
    !Number.isInteger(contract.width) ||
    !Number.isInteger(contract.height) ||
    contract.width <= 0 ||
    contract.height <= 0 ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum !== 0 ||
    maximum <= minimum ||
    contract.maximumQuantizationError !==
      (maximum - minimum) / STATIC_DEPTH_MAX_CODE / 2
  )
    throw new Error("unsupported static scene depth contract");
}

export function decodeStaticSceneDepth(
  buffer: ArrayBuffer,
  contract: StaticSceneDepthContract
): StaticSceneDepth {
  requireSupportedContract(contract);
  const expectedLength =
    STATIC_DEPTH_HEADER_BYTES + contract.width * contract.height * 2;
  if (buffer.byteLength !== expectedLength)
    throw new Error(
      `static scene depth length mismatch: expected ${expectedLength}, got ${buffer.byteLength}`
    );
  const view = new DataView(buffer);
  for (let index = 0; index < STATIC_DEPTH_MAGIC.length; index += 1) {
    if (view.getUint8(index) !== STATIC_DEPTH_MAGIC.charCodeAt(index))
      throw new Error("invalid static scene depth magic");
  }
  if (view.getUint16(8, true) !== STATIC_DEPTH_SCHEMA_VERSION)
    throw new Error("unsupported static scene depth schema");
  if (
    view.getUint16(10, true) !== contract.width ||
    view.getUint16(12, true) !== contract.height
  )
    throw new Error("static scene depth dimensions do not match contract");
  if (view.getUint16(14, true) !== 0)
    throw new Error("static scene depth reserved header field must be zero");
  const codes = new Uint16Array(contract.width * contract.height);
  for (let index = 0; index < codes.length; index += 1)
    codes[index] = view.getUint16(STATIC_DEPTH_HEADER_BYTES + index * 2, true);
  return {
    width: contract.width,
    height: contract.height,
    codes,
    cameraDepthRange: contract.cameraDepthRange,
    noSurfaceCode: contract.noSurfaceCode
  };
}

export function staticSceneDepthAt(
  depth: StaticSceneDepth,
  x: number,
  y: number
): number {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= depth.width ||
    y >= depth.height
  )
    throw new RangeError(
      `static scene depth coordinate out of bounds: ${x},${y}`
    );
  const code = depth.codes[y * depth.width + x];
  if (code === undefined)
    throw new RangeError(`missing static scene depth sample: ${x},${y}`);
  if (code === depth.noSurfaceCode) return Number.POSITIVE_INFINITY;
  const [minimum, maximum] = depth.cameraDepthRange;
  return minimum + (code / STATIC_DEPTH_MAX_CODE) * (maximum - minimum);
}

function presentationDepthAt(
  model: PresentationDepthModel,
  localX: number,
  localY: number
): number {
  const yDepth =
    model.cameraDepth + (localY - model.pivotY) * model.cameraDepthPerPixelY;
  return model.kind === "ground-plane"
    ? yDepth + (localX - model.pivotX) * model.cameraDepthPerPixelX
    : yDepth;
}

export function clipPresentationPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  depth: StaticSceneDepth,
  model: PresentationDepthModel,
  maximumQuantizationError: number
): Uint8ClampedArray {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    source.length !== width * height * 4
  )
    throw new Error("invalid presentation pixel buffer");
  if (
    (model.kind !== "upright-billboard" && model.kind !== "ground-plane") ||
    !Number.isFinite(model.cameraDepth) ||
    !Number.isFinite(model.cameraDepthPerPixelY) ||
    (model.kind === "ground-plane" &&
      (!Number.isFinite(model.cameraDepthPerPixelX) ||
        !Number.isInteger(model.pivotX))) ||
    !Number.isInteger(model.depthEdgeGuardPixels) ||
    model.depthEdgeGuardPixels < 0 ||
    !Number.isInteger(model.frameLeft) ||
    !Number.isInteger(model.frameTop) ||
    !Number.isInteger(model.pivotY) ||
    !Number.isFinite(maximumQuantizationError) ||
    maximumQuantizationError < 0
  )
    throw new Error("invalid presentation depth model");

  const clipped = new Uint8ClampedArray(source);
  for (let localY = 0; localY < height; localY += 1) {
    const frameY = model.frameTop + localY;
    if (frameY < 0 || frameY >= depth.height) continue;
    for (let localX = 0; localX < width; localX += 1) {
      const frameX = model.frameLeft + localX;
      if (frameX < 0 || frameX >= depth.width) continue;
      const rgbaIndex = (localY * width + localX) * 4;
      if ((source[rgbaIndex + 3] ?? 0) === 0) continue;
      const presentationDepth = presentationDepthAt(model, localX, localY);
      const staticDepth = staticSceneDepthAt(depth, frameX, frameY);
      if (staticDepth >= presentationDepth - maximumQuantizationError) continue;
      let stableOccluder = true;
      for (
        let offsetY = -model.depthEdgeGuardPixels;
        offsetY <= model.depthEdgeGuardPixels && stableOccluder;
        offsetY += 1
      ) {
        for (
          let offsetX = -model.depthEdgeGuardPixels;
          offsetX <= model.depthEdgeGuardPixels;
          offsetX += 1
        ) {
          const neighborX = frameX + offsetX;
          const neighborY = frameY + offsetY;
          if (
            neighborX < 0 ||
            neighborY < 0 ||
            neighborX >= depth.width ||
            neighborY >= depth.height
          )
            continue;
          if (
            staticSceneDepthAt(depth, neighborX, neighborY) >=
            presentationDepth - maximumQuantizationError
          ) {
            stableOccluder = false;
            break;
          }
        }
      }
      if (!stableOccluder) continue;
      clipped.fill(0, rgbaIndex, rgbaIndex + 4);
    }
  }
  return clipped;
}

export function clipUprightBillboardPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  depth: StaticSceneDepth,
  model: UprightBillboardDepthModel,
  maximumQuantizationError: number
): Uint8ClampedArray {
  return clipPresentationPixels(
    source,
    width,
    height,
    depth,
    model,
    maximumQuantizationError
  );
}
