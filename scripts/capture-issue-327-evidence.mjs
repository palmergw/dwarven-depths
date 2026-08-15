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

async function newPage(
  browser,
  { textScale = "default", motion = "reduce" } = {}
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: motion === "reduce" ? "reduce" : "no-preference"
  });
  const page = await context.newPage();
  await seedProfile(page);
  await page.addInitScript(
    ({ scale, requestedMotion }) => {
      localStorage.setItem("dwarven-depths.presentation.text-scale.v1", scale);
      localStorage.setItem(
        "dwarven-depths.presentation.motion-preference.v1",
        requestedMotion
      );
    },
    { scale: textScale, requestedMotion: motion }
  );
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
    ({
      requestedVisualId,
      requestedEffectStatus,
      requestedStatusContains,
      requestedMinimumTick
    }) => {
      window.__DD_ISSUE_327_CAPTURE_INTERVAL__ = window.setInterval(() => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        if (
          requestedMinimumTick !== undefined &&
          (truth?.snapshot.tick ?? -1) < requestedMinimumTick
        )
          return;
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
      requestedStatusContains: expected.statusContains,
      requestedMinimumTick: expected.minimumTick
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
const clips = [];
const contactSheets = [];

async function captureNormalMotionPrototypeClips(browser) {
  const temporaryDirectory = new URL(
    "../.ddh/issue-327-video/",
    import.meta.url
  );
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    recordVideo: {
      dir: fileURLToPath(temporaryDirectory),
      size: { width: 1440, height: 900 }
    }
  });
  const recordingStartedAt = performance.now();
  const page = await context.newPage();
  const video = page.video();
  if (video === null) throw new Error("Issue #327 video recording unavailable");
  await seedProfile(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "dwarven-depths.presentation.motion-preference.v1",
      "allow"
    );
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await enterPausedCombat(page);
  await enableAutopilot(page);
  const samples = [];
  let sampling = true;
  const sampleLoop = (async () => {
    while (sampling) {
      const state = await page.evaluate(() => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        return {
          tick: truth?.snapshot.tick ?? null,
          entities:
            truth?.registry.entities.flatMap((entity) =>
              entity.visualId === "enemy.goblin_sapper" ||
              entity.visualId === "enemy.goblin_hexer"
                ? [
                    {
                      id: entity.id,
                      visualId: entity.visualId,
                      statusIds: entity.statusIds
                    }
                  ]
                : []
            ) ?? []
        };
      });
      samples.push({
        videoTimeMilliseconds: Math.round(
          performance.now() - recordingStartedAt
        ),
        ...state
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  })();
  await page.getByRole("button", { name: "Resume combat" }).click();

  async function waitForPhase(visualId, phase) {
    await page.waitForFunction(
      ({ requestedVisualId, requestedPhase }) =>
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.some(
          (entity) =>
            entity.visualId === requestedVisualId &&
            entity.statusIds.some((statusId) =>
              statusId.endsWith(`.${requestedPhase}`)
            )
        ),
      { requestedVisualId: visualId, requestedPhase: phase },
      { timeout: 180_000, polling: 5 }
    );
    return {
      videoTimeMilliseconds: Math.round(performance.now() - recordingStartedAt),
      state: await page.evaluate((requestedVisualId) => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        return {
          tick: truth?.snapshot.tick ?? null,
          entity: truth?.registry.entities.find(
            ({ visualId }) => visualId === requestedVisualId
          )
        };
      }, visualId)
    };
  }

  const transitions = [];
  for (const prototype of [
    { id: "sapper", visualId: "enemy.goblin_sapper" },
    { id: "hexer", visualId: "enemy.goblin_hexer" }
  ]) {
    const telling = await waitForPhase(prototype.visualId, "telling");
    const committed = await waitForPhase(prototype.visualId, "committed");
    transitions.push({ ...prototype, telling, committed });
    await page.waitForTimeout(700);
  }
  await page.getByRole("button", { name: "Pause combat" }).click();
  sampling = false;
  await sampleLoop;
  await page.close();
  const rawVideoPath = fileURLToPath(new URL("raw.webm", temporaryDirectory));
  await video.saveAs(rawVideoPath);

  for (const transition of transitions) {
    const clipStartMilliseconds = Math.max(
      0,
      transition.telling.videoTimeMilliseconds - 450
    );
    const clipEndMilliseconds =
      transition.committed.videoTimeMilliseconds + 900;
    const filename = `${transition.id}-normal-motion-cadence.webm`;
    const outputUrl = new URL(filename, outputDirectory);
    await execFile("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      String(clipStartMilliseconds / 1_000),
      "-i",
      rawVideoPath,
      "-t",
      String((clipEndMilliseconds - clipStartMilliseconds) / 1_000),
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "32",
      "-an",
      fileURLToPath(outputUrl)
    ]);
    const bytes = await readFile(outputUrl);
    const clip = {
      id: `${transition.id}-normal-motion-cadence`,
      video: filename,
      videoSha256: sha256(bytes),
      sourceHead,
      fixtureId,
      viewport: [1440, 900],
      motion: "allow",
      simulationSpeed: 1,
      clipStartMilliseconds,
      clipEndMilliseconds,
      telling: transition.telling,
      committed: transition.committed,
      samples: samples
        .filter(
          ({ videoTimeMilliseconds }) =>
            videoTimeMilliseconds >= clipStartMilliseconds &&
            videoTimeMilliseconds <= clipEndMilliseconds
        )
        .map((sample) => ({
          ...sample,
          videoTimeMilliseconds:
            sample.videoTimeMilliseconds - clipStartMilliseconds
        }))
    };
    await writeFile(
      new URL(`${clip.id}.json`, outputDirectory),
      `${JSON.stringify(clip, null, 2)}\n`
    );
    clips.push(clip);
  }
  await context.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}

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
      activeInspector:
        document.activeElement instanceof HTMLElement
          ? document.activeElement.getAttribute("data-entity-id")
          : null,
      visibleInspectorDetails: [
        ...document.querySelectorAll(".battlefield-entity-inspector > span")
      ].flatMap((element) =>
        getComputedStyle(element).opacity === "1" ? [element.textContent] : []
      ),
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
    (expected.minimumTick !== undefined &&
      (state.snapshot?.tick ?? -1) < expected.minimumTick) ||
    state.paused !== true ||
    state.rendererError !== null ||
    state.motion !== (expected.motion ?? "reduce") ||
    state.reducedMotion !== ((expected.motion ?? "reduce") === "reduce") ||
    (expected.textScale !== undefined &&
      state.textScale !== expected.textScale) ||
    ((expected.visualId !== undefined ||
      expected.statusContains !== undefined) &&
      matchedEntity === undefined) ||
    (expected.recipientStatusContains !== undefined &&
      matchedRecipient === undefined) ||
    (expected.inspectorEntityId !== undefined &&
      state.activeInspector !== expected.inspectorEntityId) ||
    (expected.inspectorDetailContains !== undefined &&
      !state.visibleInspectorDetails.some((detail) =>
        detail?.includes(expected.inspectorDetailContains)
      ))
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

async function cropComparison(
  browser,
  inputUrl,
  id,
  source,
  actionInterval,
  crop = [520, 275, 600, 260]
) {
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
    clip: { x: crop[0], y: crop[1], width: crop[2], height: crop[3] }
  });
  const screenshotBytes = await readFile(screenshotUrl);
  comparisons.push({
    id,
    source,
    screenshot,
    screenshotSha256: sha256(screenshotBytes),
    viewport: [1440, 900],
    crop,
    fixtureId,
    actionInterval
  });
  await context.close();
}

function capturedTick(id) {
  const tick = captures.find((capture) => capture.id === id)?.state.snapshot
    ?.tick;
  if (!Number.isInteger(tick))
    throw new Error(`missing authoritative tick for comparison source ${id}`);
  return tick;
}

const roleCaptures = [
  {
    id: "wave-2-sapper-preparation",
    visualId: "enemy.goblin_sapper",
    effectStatus: "telling",
    minimumTick: 1212
  },
  {
    id: "wave-2-sapper-commit",
    visualId: "enemy.goblin_sapper",
    effectStatus: "committed",
    recipientStatusContains: "stagger"
  },
  {
    id: "wave-3-hexer-channel",
    visualId: "enemy.goblin_hexer",
    effectStatus: "telling",
    minimumTick: 1961
  },
  {
    id: "wave-3-hexer-commit",
    visualId: "enemy.goblin_hexer",
    effectStatus: "committed"
  }
];

const browser = await chromium.launch({ headless: true });
try {
  await captureNormalMotionPrototypeClips(browser);
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
    if (roleCapture.id === "wave-2-sapper-commit") {
      const inspector = page.locator(
        '.battlefield-entity-inspector[data-intent-mechanic="attack_disrupt"]'
      );
      await inspector.hover();
      await capture(page, "sapper-pointer-mechanic-detail", {
        ...roleCapture,
        inspectorDetailContains: "Sapper"
      });
    }
    if (roleCapture.id === "wave-3-hexer-commit") {
      const inspector = page.locator(
        '.battlefield-entity-inspector[data-intent-mechanic="attack_slow"]'
      );
      await inspector.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      const inspectorEntityId = await inspector.getAttribute("data-entity-id");
      await capture(page, "hexer-keyboard-mechanic-detail", {
        ...roleCapture,
        inspectorDetailContains: "Hexer",
        inspectorEntityId
      });
    }
  }
  await page.close();

  const accessibilityPage = await newPage(browser, { textScale: "large" });
  await enterPausedCombat(accessibilityPage);
  await capture(accessibilityPage, "large-text-reduced-motion-paused", {
    textScale: "large"
  });
  await accessibilityPage.close();

  await cropComparison(
    browser,
    new URL("wave-2-sapper-preparation.png", outputDirectory),
    "sapper-phase-telling",
    { head: sourceHead, tick: capturedTick("wave-2-sapper-preparation") },
    "attack_disrupt.telling"
  );
  await cropComparison(
    browser,
    new URL("wave-2-sapper-commit.png", outputDirectory),
    "sapper-phase-committed",
    { head: sourceHead, tick: capturedTick("wave-2-sapper-commit") },
    "attack_disrupt.committed"
  );
  await cropComparison(
    browser,
    new URL("wave-3-hexer-channel.png", outputDirectory),
    "hexer-phase-telling",
    { head: sourceHead, tick: capturedTick("wave-3-hexer-channel") },
    "attack_slow.telling"
  );
  await cropComparison(
    browser,
    new URL("wave-3-hexer-commit.png", outputDirectory),
    "hexer-phase-committed",
    { head: sourceHead, tick: capturedTick("wave-3-hexer-commit") },
    "attack_slow.committed"
  );

  const phaseSheet = new URL(
    "sapper-hexer-runtime-contact-sheet.png",
    outputDirectory
  );
  await execFile("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...[
      "sapper-phase-telling.png",
      "sapper-phase-committed.png",
      "hexer-phase-telling.png",
      "hexer-phase-committed.png"
    ].flatMap((filename) => [
      "-i",
      fileURLToPath(new URL(filename, outputDirectory))
    ]),
    "-filter_complex",
    "xstack=inputs=4:layout=0_0|600_0|0_260|600_260",
    fileURLToPath(phaseSheet)
  ]);
  contactSheets.push({
    id: "sapper-hexer-runtime-contact-sheet",
    image: "sapper-hexer-runtime-contact-sheet.png",
    imageSha256: sha256(await readFile(phaseSheet)),
    source: comparisons.map(({ id, source, actionInterval }) => ({
      id,
      source,
      actionInterval
    }))
  });

  const authoredSheet = new URL(
    "sapper-hexer-authored-layer-contact-sheet.png",
    outputDirectory
  );
  const authoredAssets = [
    "sapper-intent-crest",
    "sapper-fuse-tell",
    "sapper-blast-impact",
    "sapper-fracture-cancel",
    "hexer-intent-crest",
    "hexer-rune-channel",
    "hexer-target-tether",
    "hexer-fracture-cancel"
  ];
  await execFile("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...authoredAssets.flatMap((id) => [
      "-i",
      fileURLToPath(
        new URL(
          `../assets/game-art/combat-animation/exports/entities/${id}.png`,
          import.meta.url
        )
      )
    ]),
    "-filter_complex",
    `${authoredAssets
      .map(
        (_, index) =>
          `[${index}:v]scale=220:140:force_original_aspect_ratio=decrease,pad=220:140:(ow-iw)/2:(oh-ih)/2:color=0x03111f[a${index}]`
      )
      .join(";")};${authoredAssets
      .map((_, index) => `[a${index}]`)
      .join(
        ""
      )}xstack=inputs=8:layout=0_0|220_0|440_0|660_0|0_140|220_140|440_140|660_140`,
    fileURLToPath(authoredSheet)
  ]);
  contactSheets.push({
    id: "sapper-hexer-authored-layer-contact-sheet",
    image: "sapper-hexer-authored-layer-contact-sheet.png",
    imageSha256: sha256(await readFile(authoredSheet)),
    assets: authoredAssets
  });
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
  motionCoverage: ["allow", "reduce"],
  captureCount: captures.length,
  captures: captures.map((capture) => ({
    id: capture.id,
    screenshot: capture.screenshot,
    screenshotSha256: capture.screenshotSha256,
    sidecar: `${capture.id}.json`,
    tick: capture.state.snapshot?.tick ?? null,
    expected: capture.expected
  })),
  comparisons,
  clips: clips.map((clip) => ({
    id: clip.id,
    video: clip.video,
    videoSha256: clip.videoSha256,
    sidecar: `${clip.id}.json`,
    tellingTick: clip.telling.state.tick,
    committedTick: clip.committed.state.tick,
    simulationSpeed: clip.simulationSpeed
  })),
  contactSheets
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
    ),
    ...clips.map(({ id }) =>
      fileURLToPath(new URL(`${id}.json`, outputDirectory))
    )
  ],
  { cwd: repositoryRoot }
);
console.log(JSON.stringify(manifest, null, 2));
