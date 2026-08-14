import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = new URL(
  "../docs/visual-evidence/issue-325/",
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
  throw new Error("Issue #325 capture requires a clean source head");

let priorForgeScreenshot;
let priorForgeSidecar;
try {
  priorForgeScreenshot = await readFile(
    new URL("forge-tree-current.png", outputDirectory)
  );
  priorForgeSidecar = JSON.parse(
    await readFile(new URL("forge-tree-current.json", outputDirectory), "utf8")
  );
} catch {
  priorForgeScreenshot = await readFile(
    new URL("forge-tree.png", outputDirectory)
  );
  priorForgeSidecar = JSON.parse(
    await readFile(new URL("forge-tree.json", outputDirectory), "utf8")
  );
}
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

await writeFile(
  new URL("forge-tree-current.png", outputDirectory),
  priorForgeScreenshot
);
await writeFile(
  new URL("forge-tree-current.json", outputDirectory),
  `${JSON.stringify(
    {
      ...priorForgeSidecar,
      id: "forge-tree-current",
      screenshot: "forge-tree-current.png",
      screenshotSha256: sha256(priorForgeScreenshot),
      state: {
        ...priorForgeSidecar.state,
        preferences: {
          textScale: priorForgeSidecar.state.preferences.textScale,
          motion: priorForgeSidecar.state.preferences.motion,
          reducedMotion: priorForgeSidecar.state.preferences.reducedMotion
        }
      }
    },
    null,
    2
  )}\n`
);

function captureBinding(truth) {
  if (truth === null) return null;
  return {
    fixtureId: truth.fixtureId,
    captureReady: truth.captureReady,
    alignmentValid: truth.alignment.valid,
    snapshot: truth.snapshot
  };
}

async function readState(page) {
  return page.evaluate(() => ({
    viewport: [window.innerWidth, window.innerHeight],
    shellView: document.querySelector("main")?.getAttribute("data-shell-view"),
    phase: document.querySelector("main")?.getAttribute("data-view-phase"),
    truth: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__ ?? null,
    focus: document.activeElement?.getAttribute("aria-label") ?? null,
    preferences: {
      textScale: localStorage.getItem(
        "dwarven-depths.presentation.text-scale.v1"
      ),
      motion: localStorage.getItem(
        "dwarven-depths.presentation.motion-preference.v1"
      ),
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
    },
    abilities: [...document.querySelectorAll(".ability-control")].map(
      (control) => ({
        label: control.getAttribute("aria-label"),
        shortcut: control.getAttribute("aria-keyshortcuts"),
        disabled: control.disabled,
        state: control.getAttribute("data-ability-state"),
        text: control.textContent?.replace(/\s+/g, " ").trim()
      })
    ),
    visibleText: document
      .querySelector("main")
      ?.textContent?.replace(/\s+/g, " ")
      .trim()
  }));
}

const captures = [];
let forgeComparison;
async function waitForStableTruth(page) {
  let previous;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = JSON.stringify((await readState(page)).truth);
    if (current === previous) return;
    previous = current;
    await page.waitForTimeout(100);
  }
  throw new Error("authoritative capture state did not stabilize");
}

async function capture(page, id, expected, expectedArgument) {
  await page.waitForFunction(expected, expectedArgument, { timeout: 90_000 });
  await waitForStableTruth(page);
  const before = await readState(page);
  if (JSON.stringify(before.viewport) !== JSON.stringify([1440, 900]))
    throw new Error(
      `invalid viewport for ${id}: ${JSON.stringify(before.viewport)}`
    );
  if (
    before.truth !== null &&
    (before.truth.fixtureId !== fixtureId ||
      before.truth.captureReady !== true ||
      before.truth.alignment.valid !== true)
  )
    throw new Error(`invalid authoritative capture state for ${id}`);
  const screenshot = `${id}.png`;
  const screenshotPath = fileURLToPath(new URL(screenshot, outputDirectory));
  await page.screenshot({
    path: screenshotPath,
    fullPage: false
  });
  const bytes = await readFile(screenshotPath);
  const after = await readState(page);
  const beforeBinding = JSON.stringify(captureBinding(before.truth));
  const afterBinding = JSON.stringify(captureBinding(after.truth));
  if (afterBinding !== beforeBinding)
    throw new Error(
      `authoritative state changed while capturing ${id}: ${beforeBinding} -> ${afterBinding}`
    );
  const sidecar = {
    schemaVersion: 1,
    issue: 325,
    id,
    sourceHead,
    fixtureId: before.truth === null ? null : fixtureId,
    screenshot,
    screenshotSha256: sha256(bytes),
    state: before
  };
  await writeFile(
    new URL(`${id}.json`, outputDirectory),
    `${JSON.stringify(sidecar, null, 2)}\n`
  );
  captures.push(sidecar);
}

function installPreferences(page, preferences) {
  return page.addInitScript((requested) => {
    localStorage.clear();
    localStorage.setItem(
      "dwarven-depths.presentation.text-scale.v1",
      requested.textScale
    );
    localStorage.setItem(
      "dwarven-depths.presentation.motion-preference.v1",
      requested.motion
    );
  }, preferences);
}

async function newPage(browser, preferences = {}) {
  const reduced = preferences.motion !== "allow";
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: reduced ? "reduce" : "no-preference"
  });
  await installPreferences(page, {
    textScale: preferences.textScale ?? "default",
    motion: preferences.motion ?? "reduce"
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  return page;
}

async function newPausedCombatPage(browser, preferences = {}) {
  const page = await newPage(browser, preferences);
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await waitForPausedCombat(page);
  return page;
}

async function waitForPausedCombat(page) {
  await page.waitForFunction(
    (expectedFixture) =>
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.captureReady === true &&
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.fixtureId === expectedFixture &&
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase === "running" &&
      document.querySelector(".combat-pause-banner") !== null,
    fixtureId,
    { timeout: 90_000 }
  );
}

async function armAbilityImpactPause(page, abilityId, expectedPhase) {
  await page.evaluate(
    ({ requestedAbilityId, requestedPhase }) => {
      window.__DD_ISSUE_325_CAPTURE_TRACE__ = [];
      window.__DD_ISSUE_325_CAPTURE_INTERVAL__ = window.setInterval(() => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        const warden = truth?.registry.entities.find(
          (entity) => entity.faction === "dwarf"
        );
        const traceEntry = `${truth?.snapshot.tick ?? "none"}:${warden?.action?.abilityId ?? "none"}:${warden?.action?.phase ?? "none"}`;
        if (window.__DD_ISSUE_325_CAPTURE_TRACE__.at(-1) !== traceEntry)
          window.__DD_ISSUE_325_CAPTURE_TRACE__.push(traceEntry);
        if (
          warden?.action.kind !== "ability" ||
          warden.action.abilityId !== requestedAbilityId ||
          warden.action.phase !== requestedPhase
        )
          return;
        const pause = [...document.querySelectorAll("button")].find(
          (button) => button.getAttribute("aria-label") === "Pause combat"
        );
        pause?.click();
        window.clearInterval(window.__DD_ISSUE_325_CAPTURE_INTERVAL__);
      }, 1);
    },
    { requestedAbilityId: abilityId, requestedPhase: expectedPhase }
  );
}

async function captureAbility(
  page,
  { id, abilityId, label, key, input, expectedPhase = "impact" }
) {
  await page.waitForFunction(
    (requestedLabel) => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.getAttribute("aria-label") === requestedLabel
      );
      return button?.disabled === false;
    },
    label,
    { timeout: 90_000 }
  );
  await armAbilityImpactPause(page, abilityId, expectedPhase);
  if (input === "keyboard") await page.keyboard.press(key);
  else await page.getByRole("button", { name: label }).click();
  await page.getByRole("button", { name: "Resume combat" }).click();
  try {
    await page.waitForFunction(
      ({ requestedAbilityId, requestedPhase }) => {
        const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        const warden = truth?.registry.entities.find(
          (entity) => entity.faction === "dwarf"
        );
        return (
          document.querySelector(".combat-pause-banner") !== null &&
          warden?.action.kind === "ability" &&
          warden.action.abilityId === requestedAbilityId &&
          warden.action.phase === requestedPhase
        );
      },
      { requestedAbilityId: abilityId, requestedPhase: expectedPhase },
      { timeout: 15_000 }
    );
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      trace: window.__DD_ISSUE_325_CAPTURE_TRACE__,
      shellView: document
        .querySelector("main")
        ?.getAttribute("data-shell-view"),
      phase: document.querySelector("main")?.getAttribute("data-view-phase")
    }));
    throw new Error(
      `ability capture failed for ${abilityId}: ${JSON.stringify(diagnostics)}`,
      { cause: error }
    );
  }
  await capture(
    page,
    id,
    ({ requestedAbilityId, requestedPhase }) => {
      const warden =
        window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.entities.find(
          (entity) => entity.faction === "dwarf"
        );
      return (
        document.querySelector(".combat-pause-banner") !== null &&
        warden?.action.kind === "ability" &&
        warden.action.abilityId === requestedAbilityId &&
        warden.action.phase === requestedPhase
      );
    },
    { requestedAbilityId: abilityId, requestedPhase: expectedPhase }
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await newPage(browser);
  await page.getByRole("button", { name: "Upgrade inventory" }).click();
  await page.mouse.move(20, 20);
  await page.evaluate(() => {
    const scroller = document.querySelector(".upgrades");
    const heading = document.querySelector("#iron-warden-skills-heading");
    const toolbar = document.querySelector(".forge-toolbar");
    if (
      !(scroller instanceof HTMLElement) ||
      !(heading instanceof HTMLElement) ||
      !(toolbar instanceof HTMLElement)
    )
      throw new Error("Forge evidence scroll anchors are unavailable");
    scroller.scrollTop = heading.offsetTop - toolbar.offsetHeight - 12;
  });
  await capture(
    page,
    "forge-tree-replacement",
    () =>
      document.querySelector(".skill-paths") !== null &&
      document.querySelectorAll(".skill-node").length >= 12 &&
      document.querySelectorAll(".skill-detail").length === 1
  );
  await page.locator(".skill-detail").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /^Concussive Force,/ }).hover();
  await capture(
    page,
    "forge-tree-hover-detail",
    () =>
      document.querySelector(".skill-detail h5")?.textContent ===
      "Concussive Force"
  );
  await page.locator(".skill-detail").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /^Executioner's Mark,/ }).focus();
  await page.mouse.move(20, 20);
  await capture(
    page,
    "forge-tree-keyboard-focus-detail",
    () =>
      document.querySelector(".skill-detail h5")?.textContent ===
        "Executioner's Mark" &&
      document.activeElement?.classList.contains("skill-node") === true
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await capture(
    page,
    "preparation-loadout",
    () =>
      document.querySelector('[data-shell-view="preparation"]') !== null &&
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.captureReady === true &&
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.phase ===
        "preparation" &&
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.alignment.valid === true
  );
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await waitForPausedCombat(page);
  await page.getByRole("button", { name: "Linebreaker" }).focus();
  await capture(
    page,
    "combat-ability-bar-keyboard",
    () =>
      document.querySelectorAll(".ability-control").length === 3 &&
      document.activeElement?.getAttribute("aria-label") === "Linebreaker"
  );

  await captureAbility(page, {
    id: "shield-slam-impact",
    abilityId: "ability.iron_warden.shield_slam",
    label: "Shield Slam",
    key: "1",
    input: "pointer"
  });
  await page.close();

  const linebreakerPage = await newPausedCombatPage(browser);
  await captureAbility(linebreakerPage, {
    id: "linebreaker-impact",
    abilityId: "ability.iron_warden.linebreaker",
    label: "Linebreaker",
    key: "2",
    input: "keyboard"
  });
  await linebreakerPage.close();

  const rallyingRoarPage = await newPausedCombatPage(browser);
  await captureAbility(rallyingRoarPage, {
    id: "rallying-roar-commitment",
    abilityId: "ability.iron_warden.rallying_roar",
    label: "Rallying Roar",
    key: "3",
    input: "pointer",
    expectedPhase: "committed"
  });
  await rallyingRoarPage.close();

  const accessibilityPage = await newPausedCombatPage(browser, {
    textScale: "large",
    motion: "reduce"
  });
  await capture(
    accessibilityPage,
    "combat-large-text-reduced-motion",
    () =>
      document.querySelector(".combat-pause-banner") !== null &&
      document.querySelectorAll(".ability-control").length === 3
  );
  await accessibilityPage.close();

  const replacementScreenshot = await readFile(
    new URL("forge-tree-replacement.png", outputDirectory)
  );
  const comparisonPage = await browser.newPage({
    viewport: { width: 2880, height: 900 },
    deviceScaleFactor: 1
  });
  const currentData = `data:image/png;base64,${priorForgeScreenshot.toString("base64")}`;
  const replacementData = `data:image/png;base64,${replacementScreenshot.toString("base64")}`;
  await comparisonPage.setContent(`
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 2880px; height: 900px; overflow: hidden; background: #080604; }
      main { display: grid; grid-template-columns: 1440px 1440px; }
      figure { position: relative; margin: 0; width: 1440px; height: 900px; }
      img { display: block; width: 1440px; height: 900px; }
      figcaption { position: absolute; z-index: 2; top: 14px; left: 50%; padding: 8px 18px;
        border: 1px solid #d4a650; background: #080604ee; color: #f4cf7a;
        font: 700 22px Georgia, serif; letter-spacing: .08em; transform: translateX(-50%); }
    </style>
    <main>
      <figure><figcaption>CURRENT — DENSE COPY</figcaption><img src="${currentData}"></figure>
      <figure><figcaption>REPLACEMENT — ICON TREE</figcaption><img src="${replacementData}"></figure>
    </main>
  `);
  await comparisonPage.waitForFunction(() =>
    [...document.images].every(
      (image) => image.complete && image.naturalWidth === 1440
    )
  );
  const pixelDiff = await comparisonPage.evaluate(() => {
    const canvases = [...document.images].map((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1440;
      canvas.height = 900;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      return canvas;
    });
    const current = canvases[0]
      ?.getContext("2d")
      ?.getImageData(0, 0, 1440, 900).data;
    const replacement = canvases[1]
      ?.getContext("2d")
      ?.getImageData(0, 0, 1440, 900).data;
    if (current === undefined || replacement === undefined)
      throw new Error("Forge comparison pixels are unavailable");
    let changedPixelCount = 0;
    for (let index = 0; index < current.length; index += 4) {
      if (
        current[index] !== replacement[index] ||
        current[index + 1] !== replacement[index + 1] ||
        current[index + 2] !== replacement[index + 2] ||
        current[index + 3] !== replacement[index + 3]
      )
        changedPixelCount += 1;
    }
    return { changedPixelCount, totalPixelCount: 1440 * 900 };
  });
  const board = "forge-tree-current-vs-replacement.png";
  await comparisonPage.screenshot({
    path: fileURLToPath(new URL(board, outputDirectory))
  });
  await comparisonPage.close();
  forgeComparison = {
    current: "forge-tree-current.png",
    currentSha256: sha256(priorForgeScreenshot),
    replacement: "forge-tree-replacement.png",
    replacementSha256: sha256(replacementScreenshot),
    board,
    boardSha256: sha256(await readFile(new URL(board, outputDirectory))),
    viewport: [1440, 900],
    ...pixelDiff,
    changedPixelRatio: pixelDiff.changedPixelCount / pixelDiff.totalPixelCount
  };
} finally {
  await browser.close();
}

const manifest = {
  schemaVersion: 1,
  issue: 325,
  sourceHead,
  fixtureId,
  viewport: [1440, 900],
  deviceScaleFactor: 1,
  browser: "chromium",
  captures: captures.map(({ id, screenshot, screenshotSha256, state }) => ({
    id,
    screenshot,
    screenshotSha256,
    sidecar: `${id}.json`,
    phase: state.phase,
    preferences: state.preferences
  })),
  comparison: forgeComparison,
  decision:
    "Approve the compact icon-led Iron Warden Forge tree, branch links, and single hover/focus detail surface while retaining the three-ability combat presentation."
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
    ...captures.map(({ id }) =>
      fileURLToPath(new URL(`${id}.json`, outputDirectory))
    ),
    fileURLToPath(new URL("forge-tree-current.json", outputDirectory)),
    fileURLToPath(new URL("manifest.json", outputDirectory))
  ],
  { cwd: repositoryRoot }
);
console.log(
  JSON.stringify({ ok: true, sourceHead, captures: captures.length })
);
