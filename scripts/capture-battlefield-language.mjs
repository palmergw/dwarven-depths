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

async function armAutomaticPause(page, state) {
  await page.evaluate((expectedState) => {
    window.__DD_CAPTURE_PAUSE_INTERVAL__ = window.setInterval(() => {
      const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
      let matched;
      if (expectedState === "dense") {
        matched = (truth?.registry.hostileCount ?? 0) > 1;
      } else if (expectedState === "damage-status") {
        matched =
          truth?.registry.entities.some(
            (entity) =>
              entity.faction === "enemy" &&
              entity.currentHealth !== null &&
              entity.maximumHealth !== null &&
              entity.currentHealth < entity.maximumHealth &&
              entity.statusIds.length > 0
          ) === true;
      } else {
        matched =
          truth?.registry.entities.some(
            (entity) =>
              entity.action?.abilityId === "ability.iron_warden.shield_slam" &&
              entity.action.phase === expectedState
          ) === true;
      }
      if (!matched) return;
      const pause = [...document.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === "Pause combat"
      );
      pause?.click();
      window.clearInterval(window.__DD_CAPTURE_PAUSE_INTERVAL__);
    }, 1);
  }, state);
}

async function waitForAutomaticPause(page) {
  await page
    .getByRole("button", { name: "Pause combat" })
    .waitFor({ timeout: 60_000 });
  await page
    .getByRole("button", { name: "Resume combat" })
    .waitFor({ timeout: 60_000 });
  await page.evaluate(() => {
    window.clearInterval(window.__DD_CAPTURE_PAUSE_INTERVAL__);
  });
}

async function waitForStableTruth(page, id) {
  let previous = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(50);
    const current = await page.evaluate(
      () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__
    );
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  }
  throw new Error(`battlefield state did not settle before capture: ${id}`);
}

async function capture(page, id, expected) {
  const screenshotUrl = new URL(`${id}.png`, outputDirectory);
  const sidecarUrl = new URL(`${id}.json`, outputDirectory);
  await Promise.all([
    rm(screenshotUrl, { force: true }),
    rm(sidecarUrl, { force: true })
  ]);
  await page.waitForFunction(expected);
  const stableTruth = await waitForStableTruth(page, id);
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
    JSON.stringify(before.truth) !== JSON.stringify(stableTruth) ||
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
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "running" &&
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.totalCount > 1
    )
  );
  await armAutomaticPause(desktop, "dense");
  await desktop.getByRole("button", { name: "Resume combat" }).click();
  await waitForAutomaticPause(desktop);
  captures.push(
    await capture(
      desktop,
      "dense-wave-reduced-motion",
      () =>
        (window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.hostileCount ?? 0) > 1
    )
  );
  await desktop.getByRole("button", { name: "Resume combat" }).click();
  await desktop.waitForFunction(
    () =>
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.some(
        (entity) => entity.faction === "dwarf" && entity.targetEntityId !== null
      ) === true
  );
  await desktop.getByRole("button", { name: "Pause combat" }).click();
  await desktop.getByRole("button", { name: "Shield Slam" }).click();
  await armAutomaticPause(desktop, "committed");
  await desktop.getByRole("button", { name: "Resume combat" }).click();
  await waitForAutomaticPause(desktop);
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
  await armAutomaticPause(desktop, "impact");
  await desktop.getByRole("button", { name: "Resume combat" }).click();
  await waitForAutomaticPause(desktop);
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
  await armAutomaticPause(desktop, "damage-status");
  await desktop.getByRole("button", { name: "Resume combat" }).click();
  await waitForAutomaticPause(desktop);
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
  await desktop.getByRole("button", { name: "Resume combat" }).click();
  await desktop.waitForFunction(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "terminal",
    undefined,
    { timeout: 60_000 }
  );
  captures.push(
    await capture(
      desktop,
      "terminal-defeat-reduced-motion",
      () =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "terminal"
    )
  );
  await desktop.close();

  const mobile = await startClient(browser, { width: 390, height: 844 }, true);
  captures.push(
    await capture(
      mobile,
      "quiet-paused-mobile-reduced-motion",
      () =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "running" &&
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.totalCount > 1
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
  encounter: {
    denseWaveCaptured: captures.some(
      ({ id }) => id === "dense-wave-reduced-motion"
    ),
    eliteCaptured: captures.some(({ truth }) =>
      truth.registry.entities.some((entity) => entity.elite === true)
    ),
    terminalCaptured: captures.some(
      ({ id }) => id === "terminal-defeat-reduced-motion"
    )
  }
};
await writeFile(
  new URL("manifest.json", outputDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify({ ok: true, ...manifest })}\n`);
