import rawManifest from "./battlefield-assets.json";
import {
  BATTLEFIELD_LAYER_ORDER,
  type BattlefieldLayerId
} from "./battlefield-layers.js";

export {
  BATTLEFIELD_LAYER_ORDER,
  type BattlefieldLayerId
} from "./battlefield-layers.js";
export type BattlefieldAssetKind = "image" | "binary";

export interface BattlefieldAsset {
  readonly key: string;
  readonly kind: BattlefieldAssetKind;
  readonly layer: BattlefieldLayerId;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface BattlefieldAssetManifest {
  readonly schemaVersion: 1;
  readonly id: "manifest.web.shuttergate_battlefield";
  readonly budgetBytes: number;
  readonly totalBytes: number;
  readonly layerOrder: typeof BATTLEFIELD_LAYER_ORDER;
  readonly assets: readonly BattlefieldAsset[];
  readonly provenance: {
    readonly license: "MIT";
    readonly licensePath: "LICENSE";
    readonly environmentSource: string;
    readonly environmentBuild: string;
    readonly entityManifest: string;
    readonly entityProvenance: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

export function parseBattlefieldAssetManifest(
  value: unknown
): BattlefieldAssetManifest | undefined {
  if (!isRecord(value)) return undefined;
  const {
    assets: rawAssets,
    budgetBytes,
    id,
    layerOrder,
    provenance: rawProvenance,
    schemaVersion,
    totalBytes: declaredTotalBytes
  } = value;
  if (
    !hasExactKeys(value, [
      "assets",
      "budgetBytes",
      "id",
      "layerOrder",
      "provenance",
      "schemaVersion",
      "totalBytes"
    ]) ||
    schemaVersion !== 1 ||
    id !== "manifest.web.shuttergate_battlefield" ||
    !Number.isSafeInteger(budgetBytes) ||
    (budgetBytes as number) <= 0 ||
    !Number.isSafeInteger(declaredTotalBytes) ||
    (declaredTotalBytes as number) < 0 ||
    !Array.isArray(layerOrder) ||
    layerOrder.length !== BATTLEFIELD_LAYER_ORDER.length ||
    !layerOrder.every(
      (layer, index) => layer === BATTLEFIELD_LAYER_ORDER[index]
    ) ||
    !Array.isArray(rawAssets) ||
    rawAssets.length === 0 ||
    !isRecord(rawProvenance) ||
    !hasExactKeys(rawProvenance, [
      "entityManifest",
      "entityProvenance",
      "environmentBuild",
      "environmentSource",
      "license",
      "licensePath"
    ]) ||
    recordValue(rawProvenance, "license") !== "MIT" ||
    recordValue(rawProvenance, "licensePath") !== "LICENSE"
  )
    return undefined;

  const assets: BattlefieldAsset[] = [];
  const keys = new Set<string>();
  for (const asset of rawAssets) {
    if (!isRecord(asset)) return undefined;
    const { bytes, key, kind, layer, path, sha256 } = asset;
    if (
      !hasExactKeys(asset, [
        "bytes",
        "key",
        "kind",
        "layer",
        "path",
        "sha256"
      ]) ||
      typeof key !== "string" ||
      !/^[a-z0-9][a-z0-9-]*$/.test(key) ||
      keys.has(key) ||
      (kind !== "image" && kind !== "binary") ||
      !BATTLEFIELD_LAYER_ORDER.includes(layer as BattlefieldLayerId) ||
      typeof path !== "string" ||
      !path.startsWith("assets/") ||
      !Number.isSafeInteger(bytes) ||
      (bytes as number) <= 0 ||
      typeof sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(sha256)
    )
      return undefined;
    keys.add(key);
    assets.push(asset as unknown as BattlefieldAsset);
  }
  const totalBytes = assets.reduce((total, asset) => total + asset.bytes, 0);
  if (totalBytes !== declaredTotalBytes || totalBytes > (budgetBytes as number))
    return undefined;

  for (const key of [
    "environmentSource",
    "environmentBuild",
    "entityManifest",
    "entityProvenance"
  ] as const)
    if (
      typeof rawProvenance[key] !== "string" ||
      !(rawProvenance[key] as string).startsWith(
        key.startsWith("entity")
          ? "assets/game-art/production-scene/"
          : "assets/game-art/layered-map-poc/blender/"
      )
    )
      return undefined;

  return value as unknown as BattlefieldAssetManifest;
}

const parsedManifest = parseBattlefieldAssetManifest(rawManifest);
if (parsedManifest === undefined)
  throw new Error("invalid Shuttergate battlefield asset manifest");
export const BATTLEFIELD_ASSET_MANIFEST: BattlefieldAssetManifest =
  parsedManifest;
