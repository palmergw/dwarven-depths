import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:5173";
const outputDirectory = process.env.DD_BATTLEFIELD_OUTPUT_DIRECTORY
  ? pathToFileURL(
      `${process.env.DD_BATTLEFIELD_OUTPUT_DIRECTORY.replace(/\/$/, "")}/`
    )
  : new URL(
      "../docs/visual-evidence/battlefield-language/current/",
      import.meta.url
    );
const fixtureId = "scenarios/conformance/shuttergate-web-truth.json";
const { stdout } = await execFile("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot
});
const sourceHead = stdout.trim();

await mkdir(outputDirectory, { recursive: true });

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function startClient(browser, viewport, reducedMotion) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: reducedMotion ? "reduce" : "no-preference"
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await page.waitForFunction((expectedFixture) => {
    const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
    return truth?.captureReady === true && truth.fixtureId === expectedFixture;
  }, fixtureId);
  await page
    .getByRole("button", { name: "Open Iron Warden targeting" })
    .click();
  await page.getByRole("button", { name: "Nearest", exact: true }).click();
  return page;
}

async function capture(page, id, expected) {
  const screenshotUrl = new URL(`${id}.png`, outputDirectory);
  const sidecarUrl = new URL(`${id}.json`, outputDirectory);
  await Promise.all([
    rm(screenshotUrl, { force: true }),
    rm(sidecarUrl, { force: true })
  ]);
  await page.waitForFunction(expected);
  await page.waitForTimeout(80);
  const before = await page.evaluate(() => ({
    viewport: [window.innerWidth, window.innerHeight],
    truth: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__,
    renderer: window.__DWARVEN_DEPTHS_RENDERER__,
    rendererError: document
      .querySelector(".battlefield-canvas")
      ?.getAttribute("data-renderer-error"),
    controls: {
      pause: document
        .querySelector(".combat-pause")
        ?.getAttribute("aria-label"),
      shieldSlamDisabled:
        [...document.querySelectorAll("button")].find(
          (button) => button.getAttribute("aria-label") === "Shield Slam"
        )?.disabled ?? null
    }
  }));
  if (
    before.truth?.captureReady !== true ||
    before.truth.fixtureId !== fixtureId ||
    before.truth.registry.entities.some(
      (entity) => !entity.intersectsUnobscuredWorldViewport
    ) ||
    before.rendererError !== null ||
    before.renderer === undefined
  )
    throw new Error(`invalid battlefield capture state: ${id}`);
  await page.screenshot({ path: fileURLToPath(screenshotUrl) });
  const screenshotBytes = await readFile(screenshotUrl);
  const after = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__
  );
  if (JSON.stringify(after) !== JSON.stringify(before.truth))
    throw new Error(`battlefield state changed during capture: ${id}`);
  const sidecar = {
    schemaVersion: 1,
    id,
    sourceHead,
    fixtureId,
    screenshot: `${id}.png`,
    screenshotSha256: digest(screenshotBytes),
    viewport: before.viewport,
    truth: before.truth,
    renderer: before.renderer,
    controls: before.controls
  };
  await writeFile(sidecarUrl, `${JSON.stringify(sidecar, null, 2)}\n`);
  return sidecar;
}

const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  const desktop = await startClient(
    browser,
    { width: 1440, height: 900 },
    true
  );
  captures.push(
    await capture(
      desktop,
      "quiet-paused-reduced-motion",
      () =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick === 1 &&
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "running"
    )
  );
  await desktop.getByRole("button", { name: "Shield Slam" }).click();
  await desktop.getByRole("button", { name: "Resume combat" }).click();
  await desktop.waitForFunction(
    () =>
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.some(
        (entity) =>
          entity.action?.abilityId === "ability.iron_warden.shield_slam" &&
          entity.action.phase === "committed"
      ) === true
  );
  await desktop.getByRole("button", { name: "Pause combat" }).click();
  captures.push(
    await capture(
      desktop,
      "shield-slam-committed-reduced-motion",
      () =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.some(
          (entity) =>
            entity.action?.abilityId === "ability.iron_warden.shield_slam" &&
            entity.action.phase === "committed"
        ) === true
    )
  );
  await desktop.getByRole("button", { name: "Resume combat" }).click();
  await desktop.waitForFunction(
    () =>
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.some(
        (entity) =>
          entity.action?.abilityId === "ability.iron_warden.shield_slam" &&
          entity.action.phase === "impact"
      ) === true
  );
  await desktop.getByRole("button", { name: "Pause combat" }).click();
  captures.push(
    await capture(
      desktop,
      "shield-slam-impact-reduced-motion",
      () =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.some(
          (entity) =>
            entity.action?.abilityId === "ability.iron_warden.shield_slam" &&
            entity.action.phase === "impact"
        ) === true
    )
  );
  await desktop.getByRole("button", { name: "Resume combat" }).click();
  await desktop.waitForFunction(
    () =>
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.some(
        (entity) =>
          entity.faction === "enemy" &&
          entity.currentHealth !== null &&
          entity.maximumHealth !== null &&
          entity.currentHealth < entity.maximumHealth &&
          entity.statusIds.length > 0
      ) === true
  );
  await desktop.getByRole("button", { name: "Pause combat" }).click();
  captures.push(
    await capture(
      desktop,
      "damage-stagger-reduced-motion",
      () =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.some(
          (entity) =>
            entity.faction === "enemy" &&
            entity.currentHealth !== null &&
            entity.maximumHealth !== null &&
            entity.currentHealth < entity.maximumHealth &&
            entity.statusIds.length > 0
        ) === true
    )
  );
  await desktop.close();

  const mobile = await startClient(browser, { width: 390, height: 844 }, true);
  captures.push(
    await capture(
      mobile,
      "quiet-paused-mobile-reduced-motion",
      () =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick === 1 &&
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "running"
    )
  );
  await mobile.close();
} finally {
  await browser.close();
}

const manifest = {
  schemaVersion: 1,
  sourceHead,
  fixtureId,
  captures: captures.map((capture) => ({
    id: capture.id,
    screenshot: capture.screenshot,
    screenshotSha256: capture.screenshotSha256,
    viewport: capture.viewport,
    tick: capture.truth.snapshot.tick,
    phase: capture.truth.snapshot.phase,
    entityCount: capture.truth.registry.totalCount
  })),
  exclusions: {
    denseWave:
      "The approved terminating web encounter fixture contains exactly one authoritative hostile.",
    bossOrElite:
      "The approved terminating web encounter fixture contains one basic hostile and no boss or elite.",
    terminal:
      "Terminal capture is deferred until the bounded web encounter can be driven without introducing nonauthoritative state."
  }
};
await writeFile(
  new URL("manifest.json", outputDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify({ ok: true, ...manifest })}\n`);
