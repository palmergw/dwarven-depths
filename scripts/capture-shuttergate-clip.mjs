import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import {
  validateBattlefieldMotionEvidence,
  validateBattlefieldMotionSamples
} from "./battlefield-motion.mjs";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:5173";
const outputDirectory = process.env.DD_CLIP_OUTPUT_DIRECTORY
  ? pathToFileURL(`${process.env.DD_CLIP_OUTPUT_DIRECTORY.replace(/\/$/, "")}/`)
  : new URL("../docs/visual-evidence/running-client/", import.meta.url);
const reducedMotion = process.env.DD_CLIP_REDUCED_MOTION !== "false";
const motionId = reducedMotion ? "reduced-motion" : "normal-motion";
const videoUrl = new URL(`shuttergate-${motionId}-clip.webm`, outputDirectory);
const sidecarUrl = new URL(
  `shuttergate-${motionId}-clip.json`,
  outputDirectory
);
const temporaryVideoDirectory = fileURLToPath(
  new URL("../.ddh/shuttergate-video/", import.meta.url)
);
const rawVideoPath = `${temporaryVideoDirectory}/shuttergate-${motionId}-raw.webm`;
const videoTrimStartMilliseconds = 2_000;
const sampleIntervalMilliseconds = 40;

await mkdir(outputDirectory, { recursive: true });
await rm(temporaryVideoDirectory, { force: true, recursive: true });
await mkdir(temporaryVideoDirectory, { recursive: true });
await Promise.all([
  rm(videoUrl, { force: true }),
  rm(sidecarUrl, { force: true })
]);
const { stdout } = await execFile("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot
});
const sourceHead = stdout.trim();

async function resumeAndObserveTick(page, startingTick) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole("button", { name: "Resume combat" }).click();
    try {
      await page.waitForFunction(
        (tick) =>
          (window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick ?? -1) > tick,
        startingTick,
        { timeout: 5_000 }
      );
      return;
    } catch (error) {
      if (attempt > 0) {
        const diagnostic = await page.evaluate(() => ({
          snapshot: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot,
          buttons: [...document.querySelectorAll("button")].map((button) =>
            button.getAttribute("aria-label")
          )
        }));
        throw new Error(
          `combat did not resume for clip: ${JSON.stringify(diagnostic)}`,
          { cause: error }
        );
      }
      const pause = page.getByRole("button", { name: "Pause combat" });
      if (await pause.isVisible()) await pause.click();
    }
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: reducedMotion ? "reduce" : "no-preference",
  recordVideo: {
    dir: temporaryVideoDirectory,
    size: { width: 1440, height: 900 }
  }
});
const recordingStartedAt = performance.now();
const page = await context.newPage();
const video = page.video();
if (video === null) throw new Error("Playwright video recording unavailable");
let sampleMotion = false;
let sampleLoop = Promise.resolve();
try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await page.waitForFunction((expectedFixture) => {
    const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
    return (
      truth?.captureReady === true &&
      truth.fixtureId === expectedFixture &&
      truth.snapshot.tick === 2
    );
  }, "scenarios/conformance/shuttergate-web-truth.json");
  const startingTick = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick
  );
  const motionSamples = [];
  sampleMotion = true;
  sampleLoop = (async () => {
    while (sampleMotion) {
      const diagnostics = await page.evaluate(
        () => window.__DWARVEN_DEPTHS_RENDERER__
      );
      const videoTimeMilliseconds = Math.round(
        performance.now() - recordingStartedAt - videoTrimStartMilliseconds
      );
      if (
        videoTimeMilliseconds >= 0 &&
        diagnostics?.snapshotTick !== null &&
        diagnostics?.snapshotTick !== undefined
      )
        motionSamples.push({
          videoTimeMilliseconds,
          tick: diagnostics.snapshotTick,
          entities: diagnostics.entities
        });
      await new Promise((resolve) =>
        setTimeout(resolve, sampleIntervalMilliseconds)
      );
    }
  })();
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Open Iron Warden targeting" })
    .click();
  await page.waitForTimeout(500);
  await page
    .locator(".target-policy-menu button", { hasText: "Nearest" })
    .click();
  await page.waitForTimeout(900);
  await resumeAndObserveTick(page, startingTick);
  await page.waitForTimeout(2900);
  await page.getByRole("button", { name: "Pause combat" }).click();
  await page.getByRole("button", { name: "Resume combat" }).waitFor();
  await page.waitForTimeout(1000);
  const endingTick = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick
  );
  sampleMotion = false;
  await sampleLoop;
  await page.close();
  await video.saveAs(rawVideoPath);
  await execFile("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    String(videoTrimStartMilliseconds / 1_000),
    "-i",
    rawVideoPath,
    "-t",
    "7",
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "32",
    "-an",
    fileURLToPath(videoUrl)
  ]);
  const videoBytes = await readFile(videoUrl);
  const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
  const motionValidation = validateBattlefieldMotionSamples(motionSamples);
  const evidence = {
    schemaVersion: 1,
    sourceHead,
    fixtureId: "scenarios/conformance/shuttergate-web-truth.json",
    viewport: [1440, 900],
    video: `shuttergate-${motionId}-clip.webm`,
    videoSha256,
    motion: motionId,
    approximateDurationSeconds: 7,
    videoTrimStartMilliseconds,
    sampleIntervalMilliseconds,
    startingTick,
    endingTick,
    motionValidation,
    samples: motionSamples,
    interactions: [
      "target-policy-nearest",
      "resume",
      "authoritative-tick-advanced",
      "pause"
    ]
  };
  if (
    typeof startingTick !== "number" ||
    typeof endingTick !== "number" ||
    endingTick <= startingTick
  )
    throw new Error(
      `interaction clip did not advance authority: ${JSON.stringify(evidence)}`
    );
  validateBattlefieldMotionEvidence(evidence, videoBytes);
  await writeFile(sidecarUrl, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      sourceHead,
      video: evidence.video,
      videoSha256,
      startingTick,
      endingTick,
      motionValidation
    })}\n`
  );
} finally {
  sampleMotion = false;
  await sampleLoop.catch(() => undefined);
  await context.close();
  await browser.close();
  await rm(temporaryVideoDirectory, { force: true, recursive: true });
}
