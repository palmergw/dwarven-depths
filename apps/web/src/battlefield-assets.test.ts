import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BATTLEFIELD_ASSET_MANIFEST,
  BATTLEFIELD_LAYER_ORDER,
  parseBattlefieldAssetManifest
} from "./battlefield-assets.js";
import rawManifest from "./battlefield-assets.json";
import { BATTLEFIELD_RUNTIME_ASSET_KEYS } from "./battlefield-layers.js";

describe("Shuttergate battlefield asset manifest", () => {
  it("binds every runtime asset to its source bytes, digest, layer, and budget", () => {
    let totalBytes = 0;
    for (const asset of BATTLEFIELD_ASSET_MANIFEST.assets) {
      const bytes = readFileSync(asset.path);
      expect(statSync(asset.path).size, asset.path).toBe(asset.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), asset.path).toBe(
        asset.sha256
      );
      totalBytes += bytes.byteLength;
    }
    expect(totalBytes).toBe(BATTLEFIELD_ASSET_MANIFEST.totalBytes);
    expect(totalBytes).toBeLessThanOrEqual(
      BATTLEFIELD_ASSET_MANIFEST.budgetBytes
    );
    expect(BATTLEFIELD_ASSET_MANIFEST.layerOrder).toEqual(
      BATTLEFIELD_LAYER_ORDER
    );
    expect(BATTLEFIELD_ASSET_MANIFEST.assets.map(({ key }) => key)).toEqual(
      BATTLEFIELD_RUNTIME_ASSET_KEYS
    );
  });

  it("rejects unknown keys, duplicate asset IDs, noncanonical layers, and budget drift", () => {
    expect(parseBattlefieldAssetManifest(rawManifest)).toEqual(
      BATTLEFIELD_ASSET_MANIFEST
    );
    expect(
      parseBattlefieldAssetManifest({ ...rawManifest, unexpected: true })
    ).toBeUndefined();
    expect(
      parseBattlefieldAssetManifest({
        ...rawManifest,
        assets: [rawManifest.assets[0], rawManifest.assets[0]]
      })
    ).toBeUndefined();
    expect(
      parseBattlefieldAssetManifest({
        ...rawManifest,
        layerOrder: [...rawManifest.layerOrder].reverse()
      })
    ).toBeUndefined();
    expect(
      parseBattlefieldAssetManifest({
        ...rawManifest,
        budgetBytes: rawManifest.totalBytes - 1
      })
    ).toBeUndefined();
  });
});
