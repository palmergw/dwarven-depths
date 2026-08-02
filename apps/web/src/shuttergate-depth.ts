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
