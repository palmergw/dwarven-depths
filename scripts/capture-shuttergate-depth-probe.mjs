import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL(
  "../docs/visual-evidence/running-client/",
  import.meta.url
);
const screenshotUrl = new URL("shuttergate-depth-probe.png", output);
const sidecarUrl = new URL("shuttergate-depth-probe.json", output);
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:5173";

await Promise.all([
  rm(screenshotUrl, { force: true }),
  rm(sidecarUrl, { force: true })
]);
const { stdout } = await execFile("git", ["rev-parse", "HEAD"], { cwd: root });
const sourceHead = stdout.trim();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  await page.goto(`${baseUrl}?depthProbe=entrance`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await page.waitForFunction(() => {
    const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
    const enemy = truth?.registry.entities.find(
      (entity) => entity.faction === "enemy"
    );
    return (
      truth?.captureReady === true &&
      truth.snapshot.tick === 1 &&
      enemy?.x === 1060 &&
      enemy.y === 200 &&
      enemy.nonzeroAlphaPixels === 1341 &&
      enemy.fullAlphaPixels >= 1073 &&
      truth.occlusion.witness.subjectPixelsBehindArtifact > 0
    );
  });
  await page
    .getByRole("button", { name: "Open Iron Warden targeting" })
    .click();
  await page.getByRole("button", { name: "Nearest", exact: true }).waitFor();
  await page.waitForTimeout(250);
  const truth = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__
  );
  const enemy = truth.registry.entities.find(
    (entity) => entity.faction === "enemy"
  );
  if (
    truth.registry.dwarfCount !== 1 ||
    truth.registry.hostileCount !== 1 ||
    enemy.fullAlphaPixels / enemy.nonzeroAlphaPixels < 0.8 ||
    truth.occlusion.witness.subjectPixelsBehindArtifact <= 0
  )
    throw new Error(`depth probe contract failed: ${JSON.stringify(truth)}`);
  const screenshotPath = fileURLToPath(screenshotUrl);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const screenshotSha256 = createHash("sha256")
    .update(await readFile(screenshotPath))
    .digest("hex");
  const sidecar = {
    schemaVersion: 1,
    classification: "diagnostic-only-running-client-depth-probe",
    sourceHead,
    fixtureId: truth.fixtureId,
    viewport: truth.viewport,
    tick: truth.snapshot.tick,
    probeAnchor: [enemy.x, enemy.y],
    hostilePresentation: {
      nonzeroAlphaPixels: enemy.nonzeroAlphaPixels,
      fullAlphaPixels: enemy.fullAlphaPixels,
      partialAlphaPixels: enemy.partialAlphaPixels,
      fullAlphaRatio: enemy.fullAlphaPixels / enemy.nonzeroAlphaPixels
    },
    foregroundOverlapPixels:
      truth.occlusion.witness.subjectPixelsBehindArtifact,
    layerOrder: truth.occlusion.layerOrder,
    screenshot: "shuttergate-depth-probe.png",
    screenshotSha256
  };
  await writeFile(sidecarUrl, `${JSON.stringify(sidecar, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, ...sidecar }));
} finally {
  await browser.close();
}
