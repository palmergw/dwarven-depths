import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import {
  createInitialProfile,
  purchasedUpgradeCatalog,
  purchaseUpgradeRank
} from "../packages/progression/dist/index.js";
import { createProfileSaveEnvelope } from "../packages/save/dist/index.js";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = new URL(
  "../docs/visual-evidence/issue-327/",
  import.meta.url
);
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:5173";
const fixtureId = "scenarios/conformance/shuttergate-web-truth.json";
const { stdout: headOutput } = await execFile("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot
});
const sourceHead = headOutput.trim();
const { stdout: statusOutput } = await execFile(
  "git",
  ["status", "--porcelain"],
  { cwd: repositoryRoot }
);
if (statusOutput.trim() !== "")
  throw new Error("Issue #327 capture requires a clean source head");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const initialProfile = {
  ...createInitialProfile("character.iron_warden"),
  forgeOre: 16
};
const captureProfile = purchaseUpgradeRank({
  schemaVersion: 1,
  profile: initialProfile,
  catalog: purchasedUpgradeCatalog,
  upgradeId: "upgrade.ability.shield_slam"
}).profile;
const captureEnvelope = await createProfileSaveEnvelope({
  contentVersion: "content.empty-level.v1",
  applicationBuild: "phase-5-web",
  writtenAtEpochMs: 1,
  profileId: "profile.local",
  profile: captureProfile
});

async function seedProfile(page) {
  const interceptedUrl = `${baseUrl.replace(/\/$/, "")}/`;
  await page.route(interceptedUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>profile seed</title>"
    })
  );
  await page.goto(interceptedUrl);
  await page.evaluate(async (envelope) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("dwarven-depths-profile-v1");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("profile database delete blocked"));
    });
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("dwarven-depths-profile-v1", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("profiles");
        request.result.createObjectStore("profile-backups");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("profiles", "readwrite");
      transaction.objectStore("profiles").put(envelope, "profile.local");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, captureEnvelope);
  await page.unroute(interceptedUrl);
}

async function newPage(browser, { textScale = "default" } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await seedProfile(page);
  await page.addInitScript((scale) => {
    localStorage.setItem("dwarven-depths.presentation.text-scale.v1", scale);
    localStorage.setItem(
      "dwarven-depths.presentation.motion-preference.v1",
      "reduce"
    );
  }, textScale);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  return page;
}

async function enterPausedCombat(page) {
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await page.getByRole("button", { name: "Resume combat" }).waitFor({
    timeout: 90_000
  });
}

async function waitForStableTruth(page) {
  let previous;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = JSON.stringify(
      await page.evaluate(() => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        return truth === undefined
          ? null
          : {
              fixtureId: truth.fixtureId,
              captureReady: truth.captureReady,
              alignmentValid: truth.alignment.valid,
              snapshot: truth.snapshot,
              registry: truth.registry
            };
      })
    );
    if (current === previous) return;
    previous = current;
    await page.waitForTimeout(100);
  }
  throw new Error("authoritative capture state did not stabilize");
}

async function armRolePause(page, visualId, effectStatus) {
  await page.evaluate(
    ({ requestedVisualId, requestedEffectStatus }) => {
      window.__DD_ISSUE_327_CAPTURE_INTERVAL__ = window.setInterval(() => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        const matched = truth?.registry.entities.some(
          (entity) =>
            entity.visualId === requestedVisualId &&
            entity.statusIds.some((statusId) =>
              statusId.endsWith(`.${requestedEffectStatus}`)
            )
        );
        if (!matched) return;
        const pause = [...document.querySelectorAll("button")].find(
          (button) => button.getAttribute("aria-label") === "Pause combat"
        );
        pause?.click();
        window.clearInterval(window.__DD_ISSUE_327_CAPTURE_INTERVAL__);
      }, 1);
    },
    { requestedVisualId: visualId, requestedEffectStatus: effectStatus }
  );
}

async function enableAutopilot(page) {
  await page.evaluate(() => {
    window.__DD_ISSUE_327_AUTOPILOT_INTERVAL__ = window.setInterval(() => {
      for (const control of document.querySelectorAll(".ability-control"))
        if (control instanceof HTMLButtonElement && !control.disabled)
          control.click();
    }, 10);
  });
}

const captures = [];
async function capture(page, id, expected = {}) {
  await waitForStableTruth(page);
  const state = await page.evaluate(() => {
    const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
    return {
      viewport: [window.innerWidth, window.innerHeight],
      fixtureId: truth?.fixtureId ?? null,
      captureReady: truth?.captureReady ?? false,
      alignmentValid: truth?.alignment.valid ?? false,
      snapshot: truth?.snapshot ?? null,
      entities:
        truth?.registry.entities.map((entity) => ({
          id: entity.id,
          visualId: entity.visualId,
          faction: entity.faction,
          lifecycle: entity.lifecycle,
          statusIds: entity.statusIds,
          action: entity.action
        })) ?? [],
      paused: document.querySelector(".combat-pause-banner") !== null,
      rendererError: document
        .querySelector(".battlefield-canvas")
        ?.getAttribute("data-renderer-error"),
      textScale: localStorage.getItem(
        "dwarven-depths.presentation.text-scale.v1"
      ),
      motion: localStorage.getItem(
        "dwarven-depths.presentation.motion-preference.v1"
      ),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      visibleText: document
        .querySelector("main")
        ?.textContent?.replace(/\s+/g, " ")
        .trim()
    };
  });
  const matchedEntity =
    expected.visualId === undefined
      ? undefined
      : state.entities.find(
          (entity) =>
            entity.visualId === expected.visualId &&
            entity.statusIds.some((statusId) =>
              statusId.endsWith(`.${expected.effectStatus}`)
            )
        );
  if (
    JSON.stringify(state.viewport) !== JSON.stringify([1440, 900]) ||
    state.fixtureId !== fixtureId ||
    state.captureReady !== true ||
    state.alignmentValid !== true ||
    state.paused !== true ||
    state.rendererError !== null ||
    state.motion !== "reduce" ||
    state.reducedMotion !== true ||
    (expected.textScale !== undefined &&
      state.textScale !== expected.textScale) ||
    (expected.visualId !== undefined && matchedEntity === undefined)
  )
    throw new Error(
      `invalid Issue #327 capture ${id}: ${JSON.stringify(state)}`
    );

  const screenshot = `${id}.png`;
  const screenshotUrl = new URL(screenshot, outputDirectory);
  await page.screenshot({
    path: fileURLToPath(screenshotUrl),
    fullPage: false
  });
  const screenshotBytes = await readFile(screenshotUrl);
  const sidecar = {
    schemaVersion: 1,
    issue: 327,
    id,
    sourceHead,
    fixtureId,
    screenshot,
    screenshotSha256: sha256(screenshotBytes),
    expected,
    state
  };
  await writeFile(
    new URL(`${id}.json`, outputDirectory),
    `${JSON.stringify(sidecar, null, 2)}\n`
  );
  captures.push(sidecar);
}

const roleCaptures = [
  {
    id: "wave-1-skirmisher-tell",
    visualId: "enemy.goblin_skirmisher",
    effectStatus: "telling"
  },
  {
    id: "wave-2-sapper-commit",
    visualId: "enemy.goblin_sapper",
    effectStatus: "committed"
  },
  {
    id: "wave-3-hexer-commit",
    visualId: "enemy.goblin_hexer",
    effectStatus: "committed"
  },
  {
    id: "wave-4-banner-commit",
    visualId: "enemy.goblin_banner_bearer",
    effectStatus: "committed"
  },
  {
    id: "wave-5-hunter-tell",
    visualId: "enemy.goblin_warden_hunter",
    effectStatus: "telling"
  }
];

const browser = await chromium.launch({ headless: true });
try {
  const page = await newPage(browser);
  await enterPausedCombat(page);
  await page.getByRole("button", { name: "2× combat speed" }).click();
  await enableAutopilot(page);
  for (const roleCapture of roleCaptures) {
    await armRolePause(page, roleCapture.visualId, roleCapture.effectStatus);
    await page.getByRole("button", { name: "Resume combat" }).click();
    await page.getByRole("button", { name: "Resume combat" }).waitFor({
      timeout: 120_000
    });
    await capture(page, roleCapture.id, roleCapture);
  }
  await page.close();

  const accessibilityPage = await newPage(browser, { textScale: "large" });
  await enterPausedCombat(accessibilityPage);
  await capture(accessibilityPage, "large-text-reduced-motion-paused", {
    textScale: "large"
  });
  await accessibilityPage.close();
} finally {
  await browser.close();
}

const manifest = {
  schemaVersion: 1,
  issue: 327,
  sourceHead,
  fixtureId,
  viewport: [1440, 900],
  deviceScaleFactor: 1,
  reducedMotion: true,
  captureCount: captures.length,
  captures: captures.map((capture) => ({
    id: capture.id,
    screenshot: capture.screenshot,
    screenshotSha256: capture.screenshotSha256,
    sidecar: `${capture.id}.json`,
    tick: capture.state.snapshot?.tick ?? null,
    expected: capture.expected
  }))
};
await writeFile(
  new URL("manifest.json", outputDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log(JSON.stringify(manifest, null, 2));
