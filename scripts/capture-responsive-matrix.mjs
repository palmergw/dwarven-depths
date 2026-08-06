import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:4173";
const outputDirectory = process.env.DD_RESPONSIVE_OUTPUT_DIRECTORY
  ? pathToFileURL(
      `${process.env.DD_RESPONSIVE_OUTPUT_DIRECTORY.replace(/\/$/, "")}/`
    )
  : new URL(
      "../docs/visual-evidence/responsive-matrix/wip-01/",
      import.meta.url
    );
const fixtureId = "scenarios/conformance/shuttergate-web-truth.json";
const viewports = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 1024, height: 768 },
  compact: { width: 768, height: 768 },
  mobile: { width: 390, height: 844 }
};
const shellStates = [
  "checkpoint",
  "forge",
  "settings",
  "preparation",
  "result",
  "error",
  "high-contrast",
  "large-text"
];
const combatStates = [
  "paused-combat",
  "quiet-combat",
  "dense-combat",
  "ability-impact",
  "reduced-motion"
];

const { stdout: trackedStatus } = await execFile(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=no"],
  { cwd: repositoryRoot }
);
if (trackedStatus.trim() !== "") {
  throw new Error(
    "Refusing to capture responsive evidence from a worktree with tracked changes."
  );
}
const { stdout: sourceHeadOutput } = await execFile(
  "git",
  ["rev-parse", "HEAD"],
  { cwd: repositoryRoot }
);
const sourceHead = sourceHeadOutput.trim();
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

function installTerminalWorker(page, terminalState) {
  return page.addInitScript((state) => {
    const checksum = "a".repeat(64);
    globalThis.Worker = class MatrixWorker extends EventTarget {
      postMessage(message) {
        if (message?.type === "initialize") {
          this.dispatchEvent(
            new MessageEvent("message", {
              data: {
                protocolVersion: 4,
                type: "snapshot",
                phase: "preparation",
                levelId: "level.shuttergate_hall",
                deployableEntityCount: 1,
                placementPointCount: 2
              }
            })
          );
        } else if (message?.command?.type === "confirmPreparation") {
          this.dispatchEvent(
            new MessageEvent("message", {
              data:
                state === "result"
                  ? {
                      protocolVersion: 4,
                      type: "result",
                      terminalResult: "victory",
                      terminalTick: 1,
                      finalStateChecksum: checksum,
                      eventStreamChecksum: checksum,
                      commands: [
                        {
                          tick: 0,
                          sequence: 0,
                          command: {
                            atTick: 0,
                            type: "confirmPreparation"
                          }
                        }
                      ]
                    }
                  : {
                      protocolVersion: 4,
                      type: "failure",
                      code: "runtime_failure",
                      message:
                        "The company could not enter Shuttergate. Rally and try again."
                    }
            })
          );
        }
      }
      terminate() {}
    };
  }, terminalState);
}

function installPreferences(page, preferences) {
  return page.addInitScript((values) => {
    const keys = {
      contrast: "dwarven-depths.presentation.contrast-preference.v1",
      motion: "dwarven-depths.presentation.motion-preference.v1",
      text: "dwarven-depths.presentation.text-scale.v1"
    };
    for (const [preference, value] of Object.entries(values)) {
      localStorage.setItem(keys[preference], value);
    }
  }, preferences);
}

async function capture(page, viewportName, stateName, errors) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const scrollingPanel = document.querySelector(".settings, .upgrades");
    if (scrollingPanel instanceof HTMLElement) scrollingPanel.scrollTop = 0;
  });
  await page.waitForTimeout(250);
  const state = await page.evaluate(
    ({ expectedHead, expectedFixture, mobile }) => {
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return (
          !element.hidden &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      };
      const main = document.querySelector("main");
      const visibleText = document.body.innerText
        .replaceAll(/\s+/g, " ")
        .trim();
      const targets = Array.from(
        document.querySelectorAll(
          "button:not(:disabled), select:not(:disabled)"
        )
      )
        .filter(visible)
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            name:
              element.getAttribute("aria-label") ??
              element.textContent?.replaceAll(/\s+/g, " ").trim(),
            bounds: [bounds.left, bounds.top, bounds.width, bounds.height],
            contained:
              bounds.left >= -0.5 &&
              bounds.top >= -0.5 &&
              bounds.right <= window.innerWidth + 0.5 &&
              bounds.bottom <= window.innerHeight + 0.5,
            touchSized: !mobile || (bounds.width >= 44 && bounds.height >= 44)
          };
        });
      const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
      return {
        sourceHead: document
          .querySelector('meta[name="dd-source-head"]')
          ?.getAttribute("content"),
        sourceClean:
          document
            .querySelector('meta[name="dd-source-clean"]')
            ?.getAttribute("content") === "true",
        expectedHead,
        viewport: [window.innerWidth, window.innerHeight],
        phase: main?.dataset.viewPhase,
        shellView: main?.dataset.shellView,
        settings: {
          contrast: main?.dataset.contrastPreference,
          motion: main?.dataset.motionPreference,
          textScale: main?.dataset.textScale
        },
        fixtureId: truth?.fixtureId ?? null,
        tick: truth?.snapshot.tick ?? null,
        entityCount: truth?.registry.totalCount ?? null,
        expectedFixture,
        bodyScroll: [
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight
        ],
        visibleInspectionCount: Array.from(
          document.querySelectorAll(".inspection-surface")
        ).filter(visible).length,
        stableIdVisible: /\b[a-z][a-z0-9_-]*\.[a-z0-9_.-]+\b/.test(visibleText),
        targets
      };
    },
    {
      expectedHead: sourceHead,
      expectedFixture: fixtureId,
      mobile: viewportName === "mobile"
    }
  );
  if (
    state.sourceHead !== sourceHead ||
    !state.sourceClean ||
    state.bodyScroll[0] > state.viewport[0] ||
    state.bodyScroll[1] > state.viewport[1] ||
    state.visibleInspectionCount !== 0 ||
    state.stableIdVisible ||
    state.targets.some((target) => !target.contained || !target.touchSized) ||
    errors.length > 0
  ) {
    throw new Error(
      `invalid ${viewportName}/${stateName}: ${JSON.stringify({ state, errors })}`
    );
  }
  if (
    stateName.includes("combat") ||
    stateName === "ability-impact" ||
    stateName === "reduced-motion"
  ) {
    if (state.fixtureId !== fixtureId || state.phase !== "running") {
      throw new Error(
        `combat capture is not fixture-bound: ${JSON.stringify(state)}`
      );
    }
  }
  const filename = `${viewportName}-${stateName}.png`;
  const screenshotUrl = new URL(filename, outputDirectory);
  await page.screenshot({
    path: fileURLToPath(screenshotUrl),
    fullPage: false,
    animations: "disabled"
  });
  const bytes = await readFile(screenshotUrl);
  return {
    viewportName,
    state: stateName,
    screenshot: filename,
    screenshotSha256: createHash("sha256").update(bytes).digest("hex"),
    observed: state
  };
}

async function openPage(browser, viewport, preferences = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: preferences.motion === "allow" ? "no-preference" : "reduce"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  await installPreferences(page, preferences);
  return { context, page, errors };
}

async function armAutomaticPause(page, stateName) {
  await page.evaluate((expectedState) => {
    const captureTicks = {
      "ability-ready": 1825,
      impact: 1832
    };
    window.__DD_CAPTURE_PAUSE_INTERVAL__ = window.setInterval(() => {
      const truth = window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
      if ((truth?.snapshot.tick ?? -1) < captureTicks[expectedState]) return;
      const matched =
        expectedState === "ability-ready"
          ? truth?.registry.entities.some(
              (entity) =>
                entity.faction === "dwarf" && entity.targetEntityId !== null
            ) === true
          : truth?.registry.entities.some(
              (entity) =>
                entity.action?.abilityId ===
                  "ability.iron_warden.shield_slam" &&
                entity.action.phase === "impact"
            ) === true;
      if (!matched) return;
      const pause = Array.from(document.querySelectorAll("button")).find(
        (button) => button.getAttribute("aria-label") === "Pause combat"
      );
      pause?.click();
      window.clearInterval(window.__DD_CAPTURE_PAUSE_INTERVAL__);
    }, 1);
  }, stateName);
}

async function waitForAutomaticPause(page) {
  await page
    .getByRole("button", { name: "Resume combat" })
    .waitFor({ timeout: 60_000 });
}

const browser = await chromium.launch({ headless: true });
const evidence = [];
try {
  for (const [viewportName, viewport] of Object.entries(viewports)) {
    for (const stateName of shellStates) {
      const preferences =
        stateName === "high-contrast"
          ? { contrast: "high", motion: "reduce" }
          : stateName === "large-text"
            ? { motion: "reduce", text: "extra-large" }
            : { motion: "reduce" };
      const { context, page, errors } = await openPage(
        browser,
        viewport,
        preferences
      );
      try {
        if (stateName === "result" || stateName === "error") {
          await installTerminalWorker(
            page,
            stateName === "result" ? "result" : "error"
          );
        }
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        await page.waitForFunction(() =>
          Array.from(document.images).every((image) => image.complete)
        );
        if (stateName === "forge") {
          await page.getByRole("button", { name: /Upgrade inventory/ }).click();
        } else if (stateName === "settings") {
          await page.getByRole("button", { name: "Settings" }).click();
        } else if (stateName === "preparation") {
          await page.getByRole("button", { name: "Begin preparation" }).click();
        } else if (stateName === "result" || stateName === "error") {
          await page.getByRole("button", { name: "Begin preparation" }).click();
          await page
            .getByRole("button", { name: "Confirm preparation" })
            .click();
        }
        const expectedShellView =
          stateName === "error"
            ? "failure"
            : stateName === "high-contrast" || stateName === "large-text"
              ? "checkpoint"
              : stateName;
        await page
          .locator(`main[data-shell-view="${expectedShellView}"]`)
          .waitFor({ timeout: 20_000 });
        evidence.push(await capture(page, viewportName, stateName, errors));
      } finally {
        await context.close();
      }
    }

    const { context, page, errors } = await openPage(browser, viewport, {
      motion: "allow"
    });
    try {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Begin preparation" }).click();
      await page.getByRole("button", { name: "Confirm preparation" }).click();
      await page.waitForFunction(
        () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.captureReady === true
      );
      evidence.push(await capture(page, viewportName, "paused-combat", errors));
      await page.getByRole("button", { name: "Resume combat" }).click();
      await page.waitForFunction(
        () => (window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.snapshot.tick ?? 0) >= 20
      );
      await page.getByRole("button", { name: "Pause combat" }).click();
      evidence.push(await capture(page, viewportName, "quiet-combat", errors));
      await page.getByRole("button", { name: "Resume combat" }).click();
      await page.waitForFunction(
        () =>
          (window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.registry.hostileCount ?? 0) >
          1,
        undefined,
        { timeout: 90_000 }
      );
      await page.getByRole("button", { name: "Pause combat" }).click();
      evidence.push(await capture(page, viewportName, "dense-combat", errors));
      await page
        .getByRole("button", { name: "Open Iron Warden targeting" })
        .click();
      await page.getByRole("button", { name: "Nearest", exact: true }).click();
      await armAutomaticPause(page, "ability-ready");
      await page.getByRole("button", { name: "Resume combat" }).click();
      await waitForAutomaticPause(page);
      await page.getByRole("button", { name: "Shield Slam" }).click();
      await armAutomaticPause(page, "impact");
      await page.getByRole("button", { name: "Resume combat" }).click();
      await waitForAutomaticPause(page);
      evidence.push(
        await capture(page, viewportName, "ability-impact", errors)
      );
    } finally {
      await context.close();
    }

    const reduced = await openPage(browser, viewport, { motion: "reduce" });
    try {
      await reduced.page.goto(baseUrl, { waitUntil: "networkidle" });
      await reduced.page
        .getByRole("button", { name: "Begin preparation" })
        .click();
      await reduced.page
        .getByRole("button", { name: "Confirm preparation" })
        .click();
      await reduced.page.waitForFunction(
        () => window.__DWARVEN_DEPTHS_TRUTH_SCREEN__?.captureReady === true
      );
      evidence.push(
        await capture(
          reduced.page,
          viewportName,
          "reduced-motion",
          reduced.errors
        )
      );
    } finally {
      await reduced.context.close();
    }
  }
} finally {
  await browser.close();
}

const expectedCount =
  Object.keys(viewports).length * (shellStates.length + combatStates.length);
if (evidence.length !== expectedCount) {
  throw new Error(
    `capture count mismatch: ${evidence.length} !== ${expectedCount}`
  );
}
const manifest = {
  schemaVersion: 1,
  sourceHead,
  fixtureId,
  capture: {
    browser: "chromium",
    browserImage: "mcr.microsoft.com/playwright:v1.61.1-noble",
    deviceScaleFactor: 1,
    viewportOrder: Object.keys(viewports),
    stateOrder: [...shellStates, ...combatStates]
  },
  evidence
};
await writeFile(
  new URL("manifest.json", outputDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`
);
process.stdout.write(
  `captured ${evidence.length} responsive states for ${sourceHead}\n`
);
