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

    const productionManifest = JSON.parse(
      readFileSync(BATTLEFIELD_ASSET_MANIFEST.provenance.entityManifest, "utf8")
    ) as {
      readonly files: readonly {
        readonly path: string;
        readonly sha256: string;
      }[];
    };
    const combatManifest = JSON.parse(
      readFileSync(
        BATTLEFIELD_ASSET_MANIFEST.provenance.combatAnimationManifest,
        "utf8"
      )
    ) as {
      readonly files: readonly {
        readonly path: string;
        readonly sha256: string;
      }[];
    };
    const authoredFiles = new Map(
      [...productionManifest.files, ...combatManifest.files].map((file) => [
        file.path,
        file.sha256
      ])
    );
    for (const asset of BATTLEFIELD_ASSET_MANIFEST.assets.filter(
      ({ path }) =>
        path.includes("/production-scene/") ||
        path.includes("/combat-animation/")
    ))
      expect(authoredFiles.get(asset.path), asset.path).toBe(asset.sha256);
    expect(
      statSync(
        BATTLEFIELD_ASSET_MANIFEST.provenance.combatAnimationProvenance
      ).isFile()
    ).toBe(true);
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
    expect(
      parseBattlefieldAssetManifest({
        ...rawManifest,
        provenance: {
          ...rawManifest.provenance,
          combatAnimationManifest: rawManifest.provenance.entityManifest
        }
      })
    ).toBeUndefined();
  });
});
