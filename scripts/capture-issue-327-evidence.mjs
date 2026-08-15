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
const comparisonSourceHead = "68d2f4ee0a21f9ea9d6b8d8b8766e2ec71567043";
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
  await page.waitForTimeout(250);
  const beforeTick = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick
  );
  await page.waitForTimeout(250);
  const afterTick = await page.evaluate(
    () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick
  );
  if (beforeTick === undefined || afterTick !== beforeTick)
    throw new Error(
      `authoritative capture tick did not stabilize: ${beforeTick} -> ${afterTick}`
    );
}

async function armCapturePause(page, expected) {
  await page.evaluate(
    ({ requestedVisualId, requestedEffectStatus, requestedStatusContains }) => {
      window.__DD_ISSUE_327_CAPTURE_INTERVAL__ = window.setInterval(() => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        const matched = truth?.registry.entities.some(
          (entity) =>
            (requestedVisualId === undefined ||
              entity.visualId === requestedVisualId) &&
            entity.statusIds.some((statusId) =>
              requestedEffectStatus !== undefined
                ? statusId.endsWith(`.${requestedEffectStatus}`)
                : requestedStatusContains !== undefined &&
                  statusId.includes(requestedStatusContains)
            )
        );
        if (!matched) return;
        window.clearInterval(window.__DD_ISSUE_327_AUTOPILOT_INTERVAL__);
        const pause = [...document.querySelectorAll("button")].find(
          (button) => button.getAttribute("aria-label") === "Pause combat"
        );
        if (!(pause instanceof HTMLButtonElement) || pause.disabled) return;
        pause.click();
        window.clearInterval(window.__DD_ISSUE_327_CAPTURE_INTERVAL__);
      }, 1);
    },
    {
      requestedVisualId: expected.visualId,
      requestedEffectStatus: expected.effectStatus,
      requestedStatusContains: expected.statusContains
    }
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
const comparisons = [];
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
    expected.visualId === undefined && expected.statusContains === undefined
      ? undefined
      : state.entities.find(
          (entity) =>
            (expected.visualId === undefined ||
              entity.visualId === expected.visualId) &&
            entity.statusIds.some((statusId) =>
              expected.effectStatus !== undefined
                ? statusId.endsWith(`.${expected.effectStatus}`)
                : expected.statusContains !== undefined &&
                  statusId.includes(expected.statusContains)
            )
        );
  const matchedRecipient =
    expected.recipientStatusContains === undefined
      ? undefined
      : state.entities.find((entity) =>
          entity.statusIds.some((statusId) =>
            statusId.includes(expected.recipientStatusContains)
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
    ((expected.visualId !== undefined ||
      expected.statusContains !== undefined) &&
      matchedEntity === undefined) ||
    (expected.recipientStatusContains !== undefined &&
      matchedRecipient === undefined)
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

async function cropComparison(browser, inputUrl, id, source) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.goto(inputUrl.href, { waitUntil: "load" });
  await page.evaluate(() => {
    document.body.style.margin = "0";
    document.body.style.background = "#000";
    const image = document.querySelector("img");
    if (!(image instanceof HTMLImageElement))
      throw new Error("comparison source is not an image");
    image.style.position = "fixed";
    image.style.inset = "0";
    image.style.width = "1440px";
    image.style.height = "900px";
    image.style.maxWidth = "none";
    image.style.maxHeight = "none";
  });
  const screenshot = `${id}.png`;
  const screenshotUrl = new URL(screenshot, outputDirectory);
  await page.screenshot({
    path: fileURLToPath(screenshotUrl),
    clip: { x: 520, y: 275, width: 600, height: 260 }
  });
  const screenshotBytes = await readFile(screenshotUrl);
  comparisons.push({
    id,
    source,
    screenshot,
    screenshotSha256: sha256(screenshotBytes),
    viewport: [1440, 900],
    crop: [520, 275, 600, 260],
    fixtureId,
    actionInterval: "attack_disrupt.committed"
  });
  await context.close();
}

const roleCaptures = [
  {
    id: "wave-1-skirmisher-tell",
    visualId: "enemy.goblin_skirmisher",
    effectStatus: "telling"
  },
  {
    id: "wave-2-sapper-preparation",
    visualId: "enemy.goblin_sapper",
    effectStatus: "telling"
  },
  {
    id: "wave-2-sapper-commit",
    visualId: "enemy.goblin_sapper",
    effectStatus: "committed",
    recipientStatusContains: "stagger"
  },
  {
    id: "wave-3-hexer-commit",
    visualId: "enemy.goblin_hexer",
    effectStatus: "committed"
  },
  {
    id: "wave-4-banner-tell",
    visualId: "enemy.goblin_banner_bearer",
    effectStatus: "telling"
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
  for (const roleCapture of roleCaptures) {
    await armCapturePause(page, roleCapture);
    await enableAutopilot(page);
    await page.getByRole("button", { name: "Resume combat" }).click();
    await page.getByRole("button", { name: "Pause combat" }).waitFor({
      timeout: 10_000
    });
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

  const historicalFullFrameUrl = new URL(
    ".comparison-current-full-frame.png",
    outputDirectory
  );
  const { stdout: historicalFullFrame } = await execFile(
    "git",
    [
      "show",
      `${comparisonSourceHead}:docs/visual-evidence/issue-327/wave-2-sapper-commit.png`
    ],
    { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 4 * 1024 * 1024 }
  );
  await writeFile(historicalFullFrameUrl, historicalFullFrame);
  await cropComparison(
    browser,
    historicalFullFrameUrl,
    "comparison-current-geometric-markers",
    { head: comparisonSourceHead, tick: 1213 }
  );
  await cropComparison(
    browser,
    new URL("wave-2-sapper-commit.png", outputDirectory),
    "comparison-replacement-world-tells",
    { head: sourceHead, tick: 1214 }
  );
  await rm(historicalFullFrameUrl);
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
  })),
  comparisons
};
await writeFile(
  new URL("manifest.json", outputDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`
);
await execFile(
  "pnpm",
  [
    "exec",
    "biome",
    "format",
    "--write",
    fileURLToPath(new URL("manifest.json", outputDirectory)),
    ...captures.map(({ id }) =>
      fileURLToPath(new URL(`${id}.json`, outputDirectory))
    )
  ],
  { cwd: repositoryRoot }
);
console.log(JSON.stringify(manifest, null, 2));
