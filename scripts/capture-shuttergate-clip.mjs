import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

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
const page = await context.newPage();
const video = page.video();
if (video === null) throw new Error("Playwright video recording unavailable");
try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await page.waitForFunction((expectedFixture) => {
    const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
    return truth?.captureReady === true && truth.fixtureId === expectedFixture;
  }, "scenarios/conformance/shuttergate-web-truth.json");
  const startingTick = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick
  );
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Open Iron Warden targeting" })
    .click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Nearest", exact: true }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Shield Slam" }).click();
  await page.getByText("Activation queued").waitFor();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Resume combat" }).click();
  await page.waitForFunction(
    (tick) =>
      (window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick ?? -1) > tick,
    startingTick
  );
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: "Pause combat" }).click();
  await page.getByRole("button", { name: "Resume combat" }).waitFor();
  await page.waitForTimeout(1000);
  const endingTick = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick
  );
  await page.close();
  await video.saveAs(fileURLToPath(videoUrl));
  const videoBytes = await readFile(videoUrl);
  const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
  const evidence = {
    schemaVersion: 1,
    sourceHead,
    fixtureId: "scenarios/conformance/shuttergate-web-truth.json",
    viewport: [1440, 900],
    video: `shuttergate-${motionId}-clip.webm`,
    videoSha256,
    motion: motionId,
    approximateDurationSeconds: 8.4,
    startingTick,
    endingTick,
    interactions: [
      "target-policy-nearest",
      "shield-slam-queued",
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
  await writeFile(sidecarUrl, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, ...evidence })}\n`);
} finally {
  await context.close();
  await browser.close();
  await rm(temporaryVideoDirectory, { force: true, recursive: true });
}
