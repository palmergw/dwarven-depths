import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);

const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:5173";
const outputDirectory = new URL(
  "../docs/visual-evidence/running-client/",
  import.meta.url
);
const screenshotUrl = new URL("shuttergate-truth-screen.png", outputDirectory);
const sidecarUrl = new URL("shuttergate-truth-screen.json", outputDirectory);

await mkdir(outputDirectory, { recursive: true });
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
  await page.getByRole("button", { name: "Nearest", exact: true }).waitFor();
  await page.waitForTimeout(250);

  const evidence = await page.evaluate(() => ({
    viewport: [window.innerWidth, window.innerHeight],
    devicePixelRatio: window.devicePixelRatio,
    truth: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__,
    controls: {
      pause: document.querySelector(".combat-pause")?.textContent,
      shieldSlamReady:
        [...document.querySelectorAll("button")].find(
          (button) => button.textContent?.trim() === "Shield Slam"
        )?.disabled === false,
      targetPolicyButtons: [
        ...document.querySelectorAll(".target-policy-controls button")
      ].map((button) => button.textContent?.trim())
    }
  }));
  if (
    evidence.viewport[0] !== 1440 ||
    evidence.viewport[1] !== 900 ||
    evidence.truth?.snapshot.tick !== 1 ||
    evidence.truth.registry.dwarfCount !== 1 ||
    evidence.truth.registry.hostileCount !== 1 ||
    evidence.truth.alignment.valid !== true ||
    evidence.controls.pause !== "Resume combat" ||
    evidence.controls.shieldSlamReady !== true
  )
    throw new Error(
      `truth-screen capture contract failed: ${JSON.stringify(evidence)}`
    );

  const screenshotPath = fileURLToPath(screenshotUrl);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const screenshotSha256 = createHash("sha256")
    .update(await readFile(screenshotPath))
    .digest("hex");

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
        capture: {
          screenshot: "shuttergate-truth-screen.png",
          screenshotSha256,
          viewport: evidence.viewport,
          devicePixelRatio: evidence.devicePixelRatio,
          route: "checkpoint -> preparation -> paused combat"
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
