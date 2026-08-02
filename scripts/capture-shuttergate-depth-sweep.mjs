import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import spatialContract from "../assets/game-art/layered-map-poc/blender/shuttergate-spatial-contract.json" with {
  type: "json"
};

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:5173";
const outputDirectory = process.env.DD_DEPTH_SWEEP_OUTPUT_DIRECTORY
  ? pathToFileURL(
      `${process.env.DD_DEPTH_SWEEP_OUTPUT_DIRECTORY.replace(/\/$/, "")}/`
    )
  : new URL("../docs/visual-evidence/issue-292-depth-sweep/", import.meta.url);
const cropWidth = 144;
const cropHeight = 112;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
const { stdout: sourceHeadOutput } = await execFile(
  "git",
  ["rev-parse", "HEAD"],
  {
    cwd: repositoryRoot
  }
);
const sourceHead = sourceHeadOutput.trim();
const browser = await chromium.launch({ headless: true });
const captures = [];
const motionSamples = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: `
      html, body { width: 1280px; height: 720px; margin: 0; overflow: hidden; background: #000; }
      #root { display: none; }
      #depth-sweep-root, .battlefield, .battlefield-canvas { width: 1280px; height: 720px; margin: 0; }
      .battlefield figcaption { display: none; }
    `
  });
  await page.evaluate(() => {
    const root = document.createElement("div");
    root.id = "depth-sweep-root";
    document.body.append(root);
  });
  await page.addScriptTag({
    type: "module",
    content: `
      import { mountDepthSweep } from "/src/depth-sweep-evidence.ts";
      window.__mountDepthSweep = mountDepthSweep;
    `
  });
  await page.waitForFunction(
    () => typeof window.__mountDepthSweep === "function"
  );

  const orderedAnchors = Object.entries(spatialContract.anchors).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  for (const [nodeIndex, [nodeId, anchor]] of orderedAnchors.entries()) {
    const baseSnapshot = {
      schemaVersion: 1,
      levelId: "level.shuttergate_hall",
      mapId: "map.shuttergate_hall",
      phase: "running",
      nodes: [{ id: nodeId, x: 0, y: 0 }],
      connections: []
    };
    const quietSnapshot = {
      ...baseSnapshot,
      tick: 292 + nodeIndex * 2,
      entities: [{ id: "entity.sweep.warden", nodeId, faction: "dwarf" }]
    };
    const arrivalSnapshot = {
      ...baseSnapshot,
      tick: quietSnapshot.tick + 1,
      entities: [
        { id: "entity.sweep.warden", nodeId, faction: "dwarf" },
        { id: "entity.sweep.raider", nodeId, faction: "enemy" }
      ]
    };
    await page.evaluate(
      (value) => window.__mountDepthSweep(value, false, undefined),
      quietSnapshot
    );
    await page.waitForFunction(
      ({ expectedNodeId, expectedTick }) => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        return (
          truth?.captureReady === true &&
          truth.snapshot.tick === expectedTick &&
          truth.registry.totalCount === 1 &&
          truth.registry.entities.every(
            ({ nodeId }) => nodeId === expectedNodeId
          )
        );
      },
      { expectedNodeId: nodeId, expectedTick: quietSnapshot.tick }
    );
    await page.evaluate(
      (value) => window.__mountDepthSweep(value, false, 1),
      arrivalSnapshot
    );
    await page.waitForFunction(
      ({ expectedNodeId, expectedTick }) => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        return (
          truth?.captureReady === true &&
          truth.snapshot.tick === expectedTick &&
          truth.registry.totalCount === 2 &&
          truth.registry.entities.every(
            ({ nodeId }) => nodeId === expectedNodeId
          )
        );
      },
      { expectedNodeId: nodeId, expectedTick: arrivalSnapshot.tick }
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
    const [pivotX, pivotY] = anchor.rasterPivot;
    const left = Math.max(
      0,
      Math.min(1280 - cropWidth, pivotX - cropWidth / 2)
    );
    const top = Math.max(0, Math.min(720 - cropHeight, pivotY - 78));
    const filename = `${nodeId.replaceAll(".", "-")}.png`;
    const screenshot = await page.screenshot({
      path: fileURLToPath(new URL(filename, outputDirectory)),
      clip: { x: left, y: top, width: cropWidth, height: cropHeight }
    });
    captures.push({
      nodeId,
      effectAlpha: 1,
      authoredPivot: anchor.rasterPivot,
      crop: [left, top, cropWidth, cropHeight],
      screenshot: filename,
      screenshotSha256: createHash("sha256").update(screenshot).digest("hex")
    });
    await page.evaluate(
      ({ snapshot, effectAlpha }) =>
        window.__mountDepthSweep(snapshot, false, effectAlpha),
      { snapshot: arrivalSnapshot, effectAlpha: 0.5 }
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
    const motionFilename = `motion-${nodeId.replaceAll(".", "-")}-alpha-50.png`;
    const motionScreenshot = await page.screenshot({
      path: fileURLToPath(new URL(motionFilename, outputDirectory)),
      clip: { x: left, y: top, width: cropWidth, height: cropHeight }
    });
    motionSamples.push({
      nodeId,
      effectAlpha: 0.5,
      screenshot: motionFilename,
      screenshotSha256: createHash("sha256")
        .update(motionScreenshot)
        .digest("hex")
    });
  }
} finally {
  await browser.close();
}

const depthBytes = await readFile(
  new URL(
    "../assets/game-art/layered-map-poc/blender/outputs/static-scene-depth.bin",
    import.meta.url
  )
);
const manifestPath = fileURLToPath(new URL("manifest.json", outputDirectory));
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      sourceHead,
      viewport: [1280, 720],
      devicePixelRatio: 1,
      fixture:
        "two fixed-scale runtime subjects, ground rings, depth-tested focus, and transient VFX at every authored route node",
      staticDepthSha256: createHash("sha256").update(depthBytes).digest("hex"),
      captures,
      motionSamples
    },
    null,
    2
  )}\n`
);
await execFile("pnpm", ["exec", "biome", "format", "--write", manifestPath], {
  cwd: repositoryRoot
});
console.log(
  JSON.stringify({
    ok: true,
    sourceHead,
    captures: captures.length,
    motionSamples: motionSamples.length
  })
);
