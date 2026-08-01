import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:5173";
const outputDirectory = process.env.DD_TRUTH_OUTPUT_DIRECTORY
  ? pathToFileURL(
      `${process.env.DD_TRUTH_OUTPUT_DIRECTORY.replace(/\/$/, "")}/`
    )
  : new URL("../docs/visual-evidence/running-client/", import.meta.url);
const screenshotUrl = new URL("shuttergate-truth-screen.png", outputDirectory);
const sidecarUrl = new URL("shuttergate-truth-screen.json", outputDirectory);

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  rm(screenshotUrl, { force: true }),
  rm(sidecarUrl, { force: true })
]);
const { stdout: sourceHeadOutput } = await execFile(
  "git",
  ["rev-parse", "HEAD"],
  { cwd: repositoryRoot }
);
const sourceHead = sourceHeadOutput.trim();
const environmentManifestPath = fileURLToPath(
  new URL(
    "../apps/web/src/shuttergate-environment-manifest.json",
    import.meta.url
  )
);
const environmentManifestBytes = await readFile(environmentManifestPath);
const environmentManifest = JSON.parse(
  environmentManifestBytes.toString("utf8")
);
if (
  !Array.isArray(environmentManifest.layers) ||
  environmentManifest.layers.some((layer) =>
    environmentManifest.prohibitedRoles.includes(layer.role)
  )
)
  throw new Error("environment manifest contains a prohibited runtime role");
for (const layer of environmentManifest.layers) {
  const bytes = await readFile(new URL(`../${layer.source}`, import.meta.url));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== layer.sha256)
    throw new Error(`environment layer hash mismatch: ${layer.id}`);
}
const environmentManifestSha256 = createHash("sha256")
  .update(environmentManifestBytes)
  .digest("hex");
const visualAssetPaths = {
  dwarf: process.env.DD_TRUTH_WARDEN_ASSET
    ? pathToFileURL(process.env.DD_TRUTH_WARDEN_ASSET)
    : new URL(
        "../assets/game-art/production-scene/exports/entities/iron-warden-idle.png",
        import.meta.url
      ),
  enemy: process.env.DD_TRUTH_ENEMY_ASSET
    ? pathToFileURL(process.env.DD_TRUTH_ENEMY_ASSET)
    : new URL(
        "../assets/game-art/production-scene/exports/entities/mine-raider-idle.png",
        import.meta.url
      ),
  foreground: new URL(
    "../assets/game-art/layered-map-poc/blender/outputs/entrance-shell.png",
    import.meta.url
  )
};
const visualAssetBytes = Object.fromEntries(
  await Promise.all(
    Object.entries(visualAssetPaths).map(async ([role, url]) => [
      role,
      await readFile(url)
    ])
  )
);
const visualAssetInputs = Object.fromEntries(
  Object.entries(visualAssetBytes).map(([role, bytes]) => [
    role,
    {
      pngBase64: bytes.toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex")
    }
  ])
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await page.waitForFunction(() => {
    const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
    return truth?.captureReady === true && truth.alignment.valid === true;
  });
  await page.getByRole("button", { name: "Resume combat" }).waitFor();
  await page.getByRole("button", { name: "Shield Slam" }).waitFor();
  await page
    .getByRole("button", { name: "Open Iron Warden targeting" })
    .click();
  await page.getByRole("button", { name: "Nearest", exact: true }).waitFor();
  await page.waitForTimeout(250);

  const evidence = await page.evaluate(() => ({
    viewport: [window.innerWidth, window.innerHeight],
    devicePixelRatio: window.devicePixelRatio,
    truth: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__,
    hudCountLabels: [...document.querySelectorAll(".hud-count")].map(
      (node) =>
        `${node.querySelector("dt")?.textContent?.trim()} ${node.querySelector("dd")?.textContent?.trim()}`
    ),
    controls: {
      pause: document
        .querySelector(".combat-pause")
        ?.getAttribute("aria-label"),
      shieldSlamReady:
        [...document.querySelectorAll("button")].find(
          (button) => button.getAttribute("aria-label") === "Shield Slam"
        )?.disabled === false,
      targetPolicyButtons: [
        ...document.querySelectorAll(".target-policy-controls button")
      ].map((button) => button.textContent?.trim())
    }
  }));
  const observedVisuals = await page.evaluate(
    async ({ assets, registry }) => {
      const decode = async (pngBase64, normalizePresentationAlpha = false) => {
        const response = await fetch(`data:image/png;base64,${pngBase64}`);
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("2D audit context unavailable");
        context.drawImage(bitmap, 0, 0);
        const imageData = context.getImageData(
          0,
          0,
          bitmap.width,
          bitmap.height
        );
        const rgba = imageData.data;
        if (normalizePresentationAlpha) {
          for (let index = 3; index < rgba.length; index += 4) {
            const alpha = rgba[index] ?? 0;
            rgba[index] = alpha >= 16 ? 255 : alpha;
          }
        }
        let minimumX = bitmap.width;
        let minimumY = bitmap.height;
        let maximumX = -1;
        let maximumY = -1;
        let nonzeroAlphaPixels = 0;
        let fullAlphaPixels = 0;
        for (let y = 0; y < bitmap.height; y += 1) {
          for (let x = 0; x < bitmap.width; x += 1) {
            const alpha = rgba[(y * bitmap.width + x) * 4 + 3] ?? 0;
            if (alpha === 0) continue;
            nonzeroAlphaPixels += 1;
            if (alpha === 255) fullAlphaPixels += 1;
            minimumX = Math.min(minimumX, x);
            minimumY = Math.min(minimumY, y);
            maximumX = Math.max(maximumX, x);
            maximumY = Math.max(maximumY, y);
          }
        }
        return {
          width: bitmap.width,
          height: bitmap.height,
          alphaBounds:
            nonzeroAlphaPixels === 0
              ? [0, 0, 0, 0]
              : [
                  minimumX,
                  minimumY,
                  maximumX - minimumX + 1,
                  maximumY - minimumY + 1
                ],
          nonzeroAlphaPixels,
          fullAlphaPixels,
          partialAlphaPixels: nonzeroAlphaPixels - fullAlphaPixels,
          rgba
        };
      };
      const decoded = {
        dwarf: await decode(assets.dwarf.pngBase64, true),
        enemy: await decode(assets.enemy.pngBase64, true),
        foreground: await decode(assets.foreground.pngBase64)
      };
      const entities = registry.entities.map((entity) => {
        const source = decoded[entity.faction];
        const [canvasLeft, canvasTop, canvasWidth, canvasHeight] =
          entity.canvasBounds;
        const [sourceLeft, sourceTop, sourceWidth, sourceHeight] =
          source.alphaBounds;
        const alphaBounds = [
          canvasLeft + sourceLeft,
          canvasTop + sourceTop,
          sourceWidth,
          sourceHeight
        ];
        let subjectPixelsBehindArtifact = 0;
        for (let y = 0; y < source.height; y += 1) {
          for (let x = 0; x < source.width; x += 1) {
            if ((source.rgba[(y * source.width + x) * 4 + 3] ?? 0) === 0)
              continue;
            const worldX = canvasLeft + x;
            const worldY = canvasTop + y;
            if (
              worldX < 0 ||
              worldY < 0 ||
              worldX >= decoded.foreground.width ||
              worldY >= decoded.foreground.height
            )
              continue;
            if (
              (decoded.foreground.rgba[
                (worldY * decoded.foreground.width + worldX) * 4 + 3
              ] ?? 0) > 0
            )
              subjectPixelsBehindArtifact += 1;
          }
        }
        const intersectsWorldViewport =
          source.nonzeroAlphaPixels > 0 &&
          alphaBounds[0] < 1280 &&
          alphaBounds[1] < 720 &&
          alphaBounds[0] + alphaBounds[2] > 0 &&
          alphaBounds[1] + alphaBounds[3] > 0;
        const matchesRuntimeRegistry =
          source.width === canvasWidth &&
          source.height === canvasHeight &&
          JSON.stringify(alphaBounds) === JSON.stringify(entity.alphaBounds) &&
          source.nonzeroAlphaPixels === entity.nonzeroAlphaPixels &&
          source.fullAlphaPixels === entity.fullAlphaPixels &&
          source.partialAlphaPixels === entity.partialAlphaPixels &&
          intersectsWorldViewport === entity.intersectsUnobscuredWorldViewport;
        return {
          id: entity.id,
          faction: entity.faction,
          sourceCanvas: [source.width, source.height],
          sourceAlphaBounds: source.alphaBounds,
          worldAlphaBounds: alphaBounds,
          nonzeroAlphaPixels: source.nonzeroAlphaPixels,
          fullAlphaPixels: source.fullAlphaPixels,
          partialAlphaPixels: source.partialAlphaPixels,
          fullAlphaRatio:
            source.nonzeroAlphaPixels === 0
              ? 0
              : source.fullAlphaPixels / source.nonzeroAlphaPixels,
          intersectsWorldViewport,
          subjectPixelsBehindArtifact,
          matchesRuntimeRegistry
        };
      });
      const hostile = entities.find((entity) => entity.faction === "enemy");
      const probeAnchor = [1060, 200];
      const probeCanvasLeft = probeAnchor[0] - 40;
      const probeCanvasTop = probeAnchor[1] - 54;
      let probePixelsBehindArtifact = 0;
      for (let y = 0; y < decoded.enemy.height; y += 1) {
        for (let x = 0; x < decoded.enemy.width; x += 1) {
          if (
            (decoded.enemy.rgba[(y * decoded.enemy.width + x) * 4 + 3] ?? 0) ===
            0
          )
            continue;
          const worldX = probeCanvasLeft + x;
          const worldY = probeCanvasTop + y;
          if (
            worldX < 0 ||
            worldY < 0 ||
            worldX >= decoded.foreground.width ||
            worldY >= decoded.foreground.height
          )
            continue;
          if (
            (decoded.foreground.rgba[
              (worldY * decoded.foreground.width + worldX) * 4 + 3
            ] ?? 0) > 0
          )
            probePixelsBehindArtifact += 1;
        }
      }
      const occlusionMatchesRuntime =
        hostile !== undefined &&
        hostile.nonzeroAlphaPixels ===
          registry.occlusionWitness.subjectAlphaPixels &&
        hostile.subjectPixelsBehindArtifact ===
          registry.occlusionWitness.subjectPixelsBehindArtifact;
      const depthResolutionMatchesRuntime =
        hostile !== undefined &&
        hostile.subjectPixelsBehindArtifact === 0 &&
        registry.depthResolution.intent === "foreground-clear" &&
        registry.depthResolution.actualPixelsBehindArtifact === 0 &&
        registry.depthResolution.probeAnchor[0] === probeAnchor[0] &&
        registry.depthResolution.probeAnchor[1] === probeAnchor[1] &&
        registry.depthResolution.probePixelsBehindArtifact ===
          probePixelsBehindArtifact;
      return {
        assets: {
          dwarf: {
            width: decoded.dwarf.width,
            height: decoded.dwarf.height,
            alphaBounds: decoded.dwarf.alphaBounds,
            nonzeroAlphaPixels: decoded.dwarf.nonzeroAlphaPixels,
            fullAlphaPixels: decoded.dwarf.fullAlphaPixels,
            partialAlphaPixels: decoded.dwarf.partialAlphaPixels
          },
          enemy: {
            width: decoded.enemy.width,
            height: decoded.enemy.height,
            alphaBounds: decoded.enemy.alphaBounds,
            nonzeroAlphaPixels: decoded.enemy.nonzeroAlphaPixels,
            fullAlphaPixels: decoded.enemy.fullAlphaPixels,
            partialAlphaPixels: decoded.enemy.partialAlphaPixels
          },
          foreground: {
            width: decoded.foreground.width,
            height: decoded.foreground.height,
            alphaBounds: decoded.foreground.alphaBounds,
            nonzeroAlphaPixels: decoded.foreground.nonzeroAlphaPixels
          }
        },
        entities,
        occlusionMatchesRuntime,
        depthResolution: {
          intent: "foreground-clear",
          actualPixelsBehindArtifact:
            hostile?.subjectPixelsBehindArtifact ?? -1,
          probeAnchor,
          probePixelsBehindArtifact,
          matchesRuntime: depthResolutionMatchesRuntime
        },
        valid:
          entities.every(
            (entity) =>
              entity.nonzeroAlphaPixels > 0 &&
              entity.intersectsWorldViewport &&
              entity.matchesRuntimeRegistry &&
              entity.fullAlphaRatio >= 0.8
          ) &&
          occlusionMatchesRuntime &&
          hostile?.subjectPixelsBehindArtifact === 0 &&
          probePixelsBehindArtifact > 0 &&
          depthResolutionMatchesRuntime
      };
    },
    {
      assets: visualAssetInputs,
      registry: {
        entities: evidence.truth?.registry.entities,
        occlusionWitness: evidence.truth?.occlusion.witness,
        depthResolution: evidence.truth?.occlusion.depthResolution
      }
    }
  );
  if (
    evidence.viewport[0] !== 1440 ||
    evidence.viewport[1] !== 900 ||
    evidence.truth?.snapshot.tick !== 1 ||
    evidence.truth.registry.dwarfCount !== 1 ||
    evidence.truth.registry.hostileCount !== 1 ||
    evidence.truth.alignment.valid !== true ||
    observedVisuals.valid !== true ||
    evidence.hudCountLabels.join("|") !== "Warden 1|Hostiles 1" ||
    evidence.controls.pause !== "Resume combat" ||
    evidence.controls.shieldSlamReady !== true
  )
    throw new Error(
      `truth-screen capture contract failed: ${JSON.stringify({ evidence, observedVisuals })}`
    );

  const screenshotPath = fileURLToPath(screenshotUrl);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const screenshotSha256 = createHash("sha256")
    .update(await readFile(screenshotPath))
    .digest("hex");
  const captureId = `capture-287-${createHash("sha256")
    .update(
      [
        sourceHead,
        evidence.truth.fixtureId,
        String(evidence.truth.snapshot.tick),
        screenshotSha256
      ].join("\u0000")
    )
    .digest("hex")
    .slice(0, 20)}`;

  await page.getByRole("button", { name: "Nearest", exact: true }).click();
  await page.getByRole("button", { name: "Shield Slam" }).click();
  await page.getByText("Activation queued").waitFor();
  const queuedAtTick = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick
  );
  await page.getByRole("button", { name: "Resume combat" }).click();
  await page.waitForFunction(
    (tick) =>
      (window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick ?? -1) > tick,
    queuedAtTick
  );
  const interactionVerification = await page.evaluate(() => ({
    targetPolicyAccepted: true,
    shieldSlamQueued: true,
    resumedFromTick: 1,
    advancedToTick: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick,
    resultingPhase: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase
  }));

  await writeFile(
    fileURLToPath(sidecarUrl),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        captureId,
        sourceHead,
        capture: {
          screenshot: "shuttergate-truth-screen.png",
          screenshotSha256,
          viewport: evidence.viewport,
          devicePixelRatio: evidence.devicePixelRatio,
          route: "checkpoint -> preparation -> paused combat"
        },
        environmentManifest: {
          id: environmentManifest.id,
          path: "apps/web/src/shuttergate-environment-manifest.json",
          sha256: environmentManifestSha256,
          prohibitedRolesAbsent: true
        },
        visualAssetAudit: {
          valid: observedVisuals.valid,
          sourceSha256: Object.fromEntries(
            Object.entries(visualAssetInputs).map(([role, asset]) => [
              role,
              asset.sha256
            ])
          ),
          ...observedVisuals
        },
        ...evidence,
        interactionVerification
      },
      null,
      2
    )}\n`
  );
  await execFile(
    "pnpm",
    ["exec", "biome", "format", "--write", fileURLToPath(sidecarUrl)],
    { cwd: fileURLToPath(new URL("../", import.meta.url)) }
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      screenshot: screenshotUrl.pathname,
      sidecar: sidecarUrl.pathname,
      tick: evidence.truth.snapshot.tick,
      registry: evidence.truth.registry
    })}\n`
  );
} finally {
  await browser.close();
}
