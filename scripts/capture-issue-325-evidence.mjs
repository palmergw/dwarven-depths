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

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readState(page) {
  return page.evaluate(() => ({
    viewport: [window.innerWidth, window.innerHeight],
    shellView: document.querySelector("main")?.getAttribute("data-shell-view"),
    phase: document.querySelector("main")?.getAttribute("data-view-phase"),
    truth: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__ ?? null,
    focus: document.activeElement?.getAttribute("aria-label") ?? null,
    preferences: {
      contrast: localStorage.getItem(
        "dwarven-depths.presentation.contrast-preference.v1"
      ),
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
    throw new Error(`invalid viewport for ${id}: ${JSON.stringify(before.viewport)}`);
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
    fullPage: false,
    animations: "disabled"
  });
  const bytes = await readFile(screenshotPath);
  const after = await readState(page);
  if (JSON.stringify(after.truth) !== JSON.stringify(before.truth))
    throw new Error(`authoritative state changed while capturing ${id}`);
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
      "dwarven-depths.presentation.contrast-preference.v1",
      requested.contrast
    );
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
    contrast: preferences.contrast ?? "standard",
    textScale: preferences.textScale ?? "default",
    motion: preferences.motion ?? "reduce"
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  return page;
}

async function waitForPausedCombat(page) {
  await page.waitForFunction(
    (expectedFixture) =>
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.captureReady === true &&
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.fixtureId === expectedFixture &&
      document.querySelector(".combat-pause-banner") !== null,
    fixtureId,
    { timeout: 90_000 }
  );
}

async function armAbilityImpactPause(page, abilityId) {
  await page.evaluate((requestedAbilityId) => {
    window.__DD_ISSUE_325_CAPTURE_INTERVAL__ = window.setInterval(() => {
      const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
      const warden = truth?.snapshot.entities.find(
        (entity) => entity.faction === "dwarf"
      );
      if (
        warden?.action.kind !== "ability" ||
        warden.action.abilityId !== requestedAbilityId ||
        warden.action.phase !== "impact"
      )
        return;
      const pause = [...document.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === "Pause combat"
      );
      pause?.click();
      window.clearInterval(window.__DD_ISSUE_325_CAPTURE_INTERVAL__);
    }, 1);
  }, abilityId);
}

async function captureAbility(page, { id, abilityId, label, key, input }) {
  await page.getByRole("button", { name: "Resume combat" }).click();
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
  await armAbilityImpactPause(page, abilityId);
  if (input === "keyboard") await page.keyboard.press(key);
  else await page.getByRole("button", { name: label }).click();
  await page.waitForFunction(
    (requestedAbilityId) => {
      const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
      const warden = truth?.snapshot.entities.find(
        (entity) => entity.faction === "dwarf"
      );
      return (
        document.querySelector(".combat-pause-banner") !== null &&
        warden?.action.kind === "ability" &&
        warden.action.abilityId === requestedAbilityId &&
        warden.action.phase === "impact"
      );
    },
    abilityId,
    { timeout: 90_000 }
  );
  await capture(
    page,
    id,
    (requestedAbilityId) => {
      const warden = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.entities.find(
        (entity) => entity.faction === "dwarf"
      );
      return (
        document.querySelector(".combat-pause-banner") !== null &&
        warden?.action.kind === "ability" &&
        warden.action.abilityId === requestedAbilityId &&
        warden.action.phase === "impact"
      );
    },
    abilityId
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await newPage(browser);
  await page.getByRole("button", { name: "Upgrade inventory" }).click();
  await capture(
    page,
    "forge-tree",
    () =>
      document.querySelector(".skill-paths") !== null &&
      document.querySelectorAll(".skill-path li").length >= 12
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await capture(
    page,
    "preparation-loadout",
    () => document.querySelector('[data-shell-view="preparation"]') !== null
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
  await captureAbility(page, {
    id: "linebreaker-impact",
    abilityId: "ability.iron_warden.linebreaker",
    label: "Linebreaker",
    key: "2",
    input: "keyboard"
  });
  await captureAbility(page, {
    id: "rallying-roar-impact",
    abilityId: "ability.iron_warden.rallying_roar",
    label: "Rallying Roar",
    key: "3",
    input: "pointer"
  });
  await page.close();

  const accessibilityPage = await newPage(browser, {
    contrast: "high",
    textScale: "large",
    motion: "reduce"
  });
  await accessibilityPage
    .getByRole("button", { name: "Begin preparation" })
    .click();
  await accessibilityPage
    .getByRole("button", { name: "Confirm preparation" })
    .click();
  await waitForPausedCombat(accessibilityPage);
  await capture(
    accessibilityPage,
    "combat-high-contrast-large-text-reduced-motion",
    () =>
      document.querySelector(".combat-pause-banner") !== null &&
      document.querySelectorAll(".ability-control").length === 3
  );
  await accessibilityPage.close();
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
  decision:
    "Approve the expanded Iron Warden Forge/loadout hierarchy, three-ability combat bar, and restrained warm Shield Slam, Linebreaker, and Rallying Roar combat effects."
};
await writeFile(
  new URL("manifest.json", outputDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log(
  JSON.stringify({ ok: true, sourceHead, captures: captures.length })
);
