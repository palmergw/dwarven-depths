import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:4173";
const outputDirectory = process.env.DD_JOURNEY_OUTPUT_DIRECTORY
  ? pathToFileURL(
      `${process.env.DD_JOURNEY_OUTPUT_DIRECTORY.replace(/\/$/, "")}/`
    )
  : new URL(
      "../docs/visual-evidence/release-closeout/wip-03/journey/",
      import.meta.url
    );
const temporaryVideoDirectory = fileURLToPath(
  new URL("../.ddh/shuttergate-journey-video/", import.meta.url)
);
const rawVideoPath = `${temporaryVideoDirectory}/shuttergate-journey-raw.webm`;
const videoUrl = new URL("shuttergate-complete-journey.webm", outputDirectory);
const sidecarUrl = new URL(
  "shuttergate-complete-journey.json",
  outputDirectory
);
const expectedResults = ["defeat", "defeat", "victory"];

const { stdout: trackedStatus } = await execFile(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=no"],
  { cwd: repositoryRoot }
);
if (trackedStatus.trim() !== "")
  throw new Error(
    "Refusing to capture journey evidence from a worktree with tracked changes."
  );
const { stdout: headOutput } = await execFile("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot
});
const sourceHead = headOutput.trim();

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await rm(temporaryVideoDirectory, { recursive: true, force: true });
await mkdir(temporaryVideoDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "no-preference",
  recordVideo: {
    dir: temporaryVideoDirectory,
    size: { width: 1440, height: 900 }
  }
});
const page = await context.newPage();
const video = page.video();
if (video === null) throw new Error("Playwright video recording unavailable");
const stages = [];

async function readState() {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      sourceHead: document
        .querySelector('meta[name="dd-source-head"]')
        ?.getAttribute("content"),
      sourceClean:
        document
          .querySelector('meta[name="dd-source-clean"]')
          ?.getAttribute("content") === "true",
      viewport: [window.innerWidth, window.innerHeight],
      phase: main?.getAttribute("data-view-phase"),
      shellView: main?.getAttribute("data-shell-view"),
      truth: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__
        ? {
            fixtureId: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__.fixtureId,
            tick: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__.snapshot.tick,
            terminalResult:
              window.__DWARVEN_DEPTHS_TRUTH_SCREEN__.snapshot.encounter
                ?.terminalResult ?? null
          }
        : null,
      visibleText: document.body.innerText.replaceAll(/\s+/g, " ").trim()
    };
  });
}

async function captureStage(id, expectedShellView) {
  const state = await readState();
  if (
    state.sourceHead !== sourceHead ||
    state.sourceClean !== true ||
    JSON.stringify(state.viewport) !== JSON.stringify([1440, 900]) ||
    state.shellView !== expectedShellView ||
    !state.visibleText.toLocaleLowerCase("en-US").includes("dwarven depths")
  )
    throw new Error(`invalid journey stage ${id}: ${JSON.stringify(state)}`);
  const screenshot = `${id}.png`;
  const screenshotUrl = new URL(screenshot, outputDirectory);
  await page.screenshot({
    path: fileURLToPath(screenshotUrl),
    fullPage: false,
    animations: "disabled"
  });
  const bytes = await readFile(screenshotUrl);
  stages.push({
    id,
    screenshot,
    screenshotSha256: createHash("sha256").update(bytes).digest("hex"),
    state
  });
}

async function waitForCheckpoint() {
  await page.locator('main[data-shell-view="checkpoint"]').waitFor({
    timeout: 20_000
  });
  await page.getByRole("button", { name: "Begin preparation" }).waitFor();
}

async function runAttempt(attemptNumber, expectedResult) {
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  const combatToggle = page.locator(
    'button[aria-label="Pause combat"], button[aria-label="Resume combat"]'
  );
  await combatToggle.waitFor({ timeout: 20_000 });
  if ((await combatToggle.getAttribute("aria-label")) === "Resume combat") {
    await combatToggle.click();
    await page
      .getByRole("button", { name: "Pause combat" })
      .waitFor({ timeout: 5_000 });
  }
  const speedButton = page.getByRole("button", { name: "2× combat speed" });
  await speedButton.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label="2× combat speed"]')
        ?.getAttribute("aria-pressed") === "true"
  );

  const startedAt = Date.now();
  while ((await page.locator('main[data-shell-view="result"]').count()) === 0) {
    if (Date.now() - startedAt > 180_000)
      throw new Error(
        `attempt ${attemptNumber} did not reach a terminal result`
      );
    await page.keyboard.press("Digit1");
    await page.waitForTimeout(250);
  }
  await page.locator('main[data-shell-view="result"]').waitFor();
  const heading = await page.locator(".result-screen h2").textContent();
  if (heading?.toLocaleLowerCase("en-US").includes(expectedResult) !== true)
    throw new Error(
      `attempt ${attemptNumber} expected ${expectedResult}, received ${heading}`
    );
  await captureStage(`attempt-${attemptNumber}-${expectedResult}`, "result");
}

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitForCheckpoint();
  await captureStage("fresh-checkpoint", "checkpoint");

  await runAttempt(1, expectedResults[0]);
  await page.getByRole("button", { name: "Return to checkpoint" }).click();
  await waitForCheckpoint();
  await page.reload({ waitUntil: "networkidle" });
  await waitForCheckpoint();
  const firstReloadText = (await readState()).visibleText;
  if (!firstReloadText.includes("Forge Ore8"))
    throw new Error("first reward did not survive a real page reload");
  await captureStage("attempt-1-reloaded-checkpoint", "checkpoint");

  await runAttempt(2, expectedResults[1]);
  await page.getByRole("button", { name: "Return to checkpoint" }).click();
  await waitForCheckpoint();
  await page.getByRole("button", { name: "Upgrade inventory" }).click();
  await page
    .getByRole("button", {
      name: "Purchase Shield Slam Training rank 1 for 10 Forge Ore"
    })
    .click();
  await page.getByText("Available Forge Ore: 6").waitFor();
  await page.getByRole("button", { name: "Close upgrade inventory" }).click();
  await page.reload({ waitUntil: "networkidle" });
  await waitForCheckpoint();
  const purchaseReloadText = (await readState()).visibleText;
  if (!purchaseReloadText.includes("Forge Ore6"))
    throw new Error("purchased build did not survive a real page reload");
  await captureStage("purchased-build-reloaded-checkpoint", "checkpoint");

  await runAttempt(3, expectedResults[2]);
  const finalText = (await readState()).visibleText;
  if (!finalText.includes("New balance14 Forge Ore"))
    throw new Error(
      "victory reward summary is not bound to the persisted profile"
    );
  await page.close();
  await video.saveAs(rawVideoPath);
  await execFile("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    rawVideoPath,
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "34",
    "-an",
    fileURLToPath(videoUrl)
  ]);
  const videoBytes = await readFile(videoUrl);
  const evidence = {
    schemaVersion: 1,
    sourceHead,
    fixtureId: "scenarios/conformance/shuttergate-web-truth.json",
    viewport: [1440, 900],
    expectedResults,
    video: "shuttergate-complete-journey.webm",
    videoSha256: createHash("sha256").update(videoBytes).digest("hex"),
    stages
  };
  await writeFile(sidecarUrl, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      sourceHead,
      expectedResults,
      stageCount: stages.length,
      videoSha256: evidence.videoSha256
    })}\n`
  );
} finally {
  await context.close();
  await browser.close();
  await rm(temporaryVideoDirectory, { recursive: true, force: true });
}
