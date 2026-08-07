import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:5173";
const outputDirectory = process.env.DD_COMBAT_HUD_OUTPUT_DIRECTORY
  ? pathToFileURL(
      `${process.env.DD_COMBAT_HUD_OUTPUT_DIRECTORY.replace(/\/$/, "")}/`
    )
  : new URL("../docs/visual-evidence/combat-hud/wip-01/", import.meta.url);
const fixtureId = "scenarios/conformance/shuttergate-web-truth.json";
const { stdout: sourceHeadOutput } = await execFile(
  "git",
  ["rev-parse", "HEAD"],
  { cwd: repositoryRoot }
);
const sourceHead = sourceHeadOutput.trim();
const { stdout: statusOutput } = await execFile(
  "git",
  ["status", "--porcelain"],
  { cwd: repositoryRoot }
);
if (statusOutput.trim() !== "")
  throw new Error("combat HUD capture requires a clean source head");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function waitForStableTruth(page, id) {
  let previous = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(50);
    const current = await page.evaluate(
      () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__
    );
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  }
  throw new Error(`capture state did not settle: ${id}`);
}

async function armPause(page, condition) {
  await page.evaluate((requestedCondition) => {
    window.__DD_HUD_CAPTURE_INTERVAL__ = window.setInterval(() => {
      const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
      const warden = truth?.registry.entities.find(
        (entity) => entity.faction === "dwarf"
      );
      const ability = [...document.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === "Shield Slam"
      );
      const abilityState =
        document.querySelector(".ability-state")?.textContent;
      const matched =
        requestedCondition === "wave-transition"
          ? (truth?.snapshot.tick ?? -1) >= 900 &&
            document
              .querySelector(".hud-plaque-center dd")
              ?.textContent?.trim() === "2 of 2"
          : requestedCondition === "ability-ready"
            ? (truth?.snapshot.tick ?? -1) >= 1800 &&
              warden?.targetEntityId !== null &&
              ability?.disabled === false
            : requestedCondition === "cooldown-status"
              ? abilityState?.includes("Recharging") === true &&
                truth?.registry.entities.some(
                  (entity) => entity.statusIds.length > 0
                ) === true
              : requestedCondition === "low-health"
                ? warden?.currentHealth !== null &&
                  warden?.maximumHealth !== null &&
                  warden.currentHealth > 0 &&
                  warden.currentHealth / warden.maximumHealth <= 0.3
                : false;
      if (!matched) return;
      const pause = [...document.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === "Pause combat"
      );
      pause?.click();
      window.clearInterval(window.__DD_HUD_CAPTURE_INTERVAL__);
    }, 1);
  }, condition);
}

async function resumeUntilPaused(page) {
  await page.getByRole("button", { name: "Resume combat" }).click();
  await page
    .getByRole("button", { name: "Pause combat" })
    .waitFor({ timeout: 10_000 });
  await page
    .getByRole("button", { name: "Resume combat" })
    .waitFor({ timeout: 90_000 });
  await page.evaluate(() =>
    window.clearInterval(window.__DD_HUD_CAPTURE_INTERVAL__)
  );
}

async function capture(page, id, expected) {
  await page.waitForFunction(expected, undefined, { timeout: 90_000 });
  const truth = await waitForStableTruth(page, id);
  const state = await page.evaluate(() => ({
    viewport: [window.innerWidth, window.innerHeight],
    truth: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__,
    phase: document.querySelector("main")?.getAttribute("data-view-phase"),
    hud: document
      .querySelector(".combat-hud")
      ?.textContent?.replace(/\s+/g, " ")
      .trim(),
    health: {
      current: document
        .querySelector(".warden-health-track")
        ?.getAttribute("value"),
      maximum: document
        .querySelector(".warden-health-track")
        ?.getAttribute("max"),
      low: document
        .querySelector(".warden-health-track")
        ?.getAttribute("data-low-health")
    },
    ability: {
      disabled:
        [...document.querySelectorAll("button")].find(
          (button) => button.getAttribute("aria-label") === "Shield Slam"
        )?.disabled ?? null,
      state: document
        .querySelector(".ability-control")
        ?.getAttribute("data-ability-state"),
      text: document.querySelector(".ability-state")?.textContent?.trim()
    },
    pause: {
      control: document
        .querySelector(".combat-pause")
        ?.getAttribute("aria-label"),
      banner: document
        .querySelector(".combat-pause-banner")
        ?.textContent?.replace(/\s+/g, " ")
        .trim()
    },
    targetMenuOpen: document
      .querySelector(".character-portrait-button")
      ?.getAttribute("aria-expanded"),
    playerText: document.querySelector("main")?.textContent ?? "",
    rendererError: document
      .querySelector(".battlefield-canvas")
      ?.getAttribute("data-renderer-error")
  }));
  if (
    JSON.stringify(state.truth) !== JSON.stringify(truth) ||
    state.truth?.captureReady !== true ||
    state.truth.fixtureId !== fixtureId ||
    state.truth.alignment.valid !== true ||
    JSON.stringify(state.viewport) !== JSON.stringify([1440, 900]) ||
    state.rendererError !== null ||
    /\b(?:entity|ability|status|wave)\.[a-z0-9_]+(?:\.[a-z0-9_]+)*\b/.test(
      state.playerText
    )
  )
    throw new Error(
      `invalid combat HUD capture state: ${id}: ${JSON.stringify(state)}`
    );

  const screenshotUrl = new URL(`${id}.png`, outputDirectory);
  const sidecarUrl = new URL(`${id}.json`, outputDirectory);
  await page.screenshot({ path: fileURLToPath(screenshotUrl) });
  const screenshotBytes = await readFile(screenshotUrl);
  const after = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__
  );
  if (JSON.stringify(after) !== JSON.stringify(truth))
    throw new Error(`combat state changed during capture: ${id}`);
  const sidecar = {
    schemaVersion: 1,
    id,
    label: `WIP #275 — ${id}`,
    sourceHead,
    fixtureId,
    screenshot: `${id}.png`,
    screenshotSha256: sha256(screenshotBytes),
    viewport: state.viewport,
    phase: state.phase,
    truth,
    hud: state.hud,
    health: state.health,
    ability: state.ability,
    pause: state.pause,
    targetMenuOpen: state.targetMenuOpen
  };
  await writeFile(sidecarUrl, `${JSON.stringify(sidecar, null, 2)}\n`);
  return sidecar;
}

const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await page.waitForFunction(
    (expectedFixture) =>
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.captureReady === true &&
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.fixtureId === expectedFixture,
    fixtureId
  );
  await page
    .getByRole("button", { name: "Open Iron Warden targeting" })
    .click();
  await page.getByRole("button", { name: "Nearest", exact: true }).click();

  captures.push(
    await capture(
      page,
      "wip-default-paused",
      () =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "running" &&
        document.querySelector(".combat-pause-banner") !== null
    )
  );

  await armPause(page, "wave-transition");
  await resumeUntilPaused(page);
  captures.push(
    await capture(
      page,
      "wip-wave-transition",
      () =>
        document.querySelector(".hud-plaque-center dd")?.textContent?.trim() ===
        "2 of 2"
    )
  );

  await armPause(page, "ability-ready");
  await resumeUntilPaused(page);
  captures.push(
    await capture(
      page,
      "wip-ability-ready",
      () =>
        document
          .querySelector(".ability-control")
          ?.getAttribute("data-ability-state") === "ready"
    )
  );

  await page.getByRole("button", { name: "Shield Slam" }).click();
  await armPause(page, "cooldown-status");
  await resumeUntilPaused(page);
  captures.push(
    await capture(
      page,
      "wip-cooldown-status",
      () =>
        document
          .querySelector(".ability-control")
          ?.getAttribute("data-ability-state") === "cooldown" &&
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.some(
          (entity) => entity.statusIds.length > 0
        ) === true
    )
  );

  await armPause(page, "low-health");
  await resumeUntilPaused(page);
  captures.push(
    await capture(
      page,
      "wip-low-health",
      () =>
        document
          .querySelector(".warden-health-track")
          ?.getAttribute("data-low-health") === "true"
    )
  );

  await page.getByRole("button", { name: "Resume combat" }).click();
  await page.waitForFunction(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "terminal",
    undefined,
    { timeout: 90_000 }
  );
  captures.push(
    await capture(
      page,
      "wip-terminal-defeat",
      () =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "terminal" &&
        document.querySelector("main")?.getAttribute("data-view-phase") ===
          "result"
    )
  );
  await page.close();
} finally {
  await browser.close();
}

const manifest = {
  schemaVersion: 1,
  label: "WIP #275 combat HUD packet",
  sourceHead,
  fixtureId,
  viewport: [1440, 900],
  settings: {
    reducedMotion: true,
    contrast: "standard",
    textScale: "default"
  },
  captures: captures.map((capture) => ({
    id: capture.id,
    screenshot: capture.screenshot,
    screenshotSha256: capture.screenshotSha256,
    tick: capture.truth.snapshot.tick,
    phase: capture.truth.snapshot.phase,
    abilityState: capture.ability.state,
    health: capture.health
  }))
};
await writeFile(
  new URL("manifest.json", outputDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify({ ok: true, ...manifest })}\n`);
