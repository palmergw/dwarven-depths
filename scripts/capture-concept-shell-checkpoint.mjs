import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:4173";
const outputDirectory = process.env.DD_CHECKPOINT_OUTPUT_DIRECTORY
  ? pathToFileURL(
      `${process.env.DD_CHECKPOINT_OUTPUT_DIRECTORY.replace(/\/$/, "")}/`
    )
  : new URL("../docs/visual-evidence/concept-shell/wip-02/", import.meta.url);
const screenshotUrl = new URL("checkpoint-1440x900.png", outputDirectory);
const sidecarUrl = new URL("checkpoint-1440x900.json", outputDirectory);
const { stdout } = await execFile("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot
});
const sourceHead = stdout.trim();

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  rm(screenshotUrl, { force: true }),
  rm(sidecarUrl, { force: true })
]);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const roster = document.querySelector(".profile-summary");
    return (
      roster?.textContent?.includes("Loading local progression") === false &&
      Array.from(document.images).every((image) => image.complete)
    );
  });

  const state = await page.evaluate(() => {
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
    const primary = document.querySelector(
      ".checkpoint-command .primary-action"
    );
    const checkpointButtons = Array.from(
      document.querySelectorAll(".checkpoint-menu button")
    );
    const playerText = [
      document.querySelector(".checkpoint-command")?.textContent,
      document.querySelector(".checkpoint-menu")?.textContent,
      document.querySelector(".profile-summary")?.textContent
    ]
      .join(" ")
      .replaceAll(/\s+/g, " ")
      .trim();
    return {
      sourceHead: document
        .querySelector('meta[name="dd-source-head"]')
        ?.getAttribute("content"),
      sourceClean:
        document
          .querySelector('meta[name="dd-source-clean"]')
          ?.getAttribute("content") === "true",
      viewport: [window.innerWidth, window.innerHeight],
      phase: main?.dataset.viewPhase,
      mainCount: document.querySelectorAll("main").length,
      backdropCount: document.querySelectorAll(".checkpoint-backdrop").length,
      primaryActionCount: document.querySelectorAll(
        ".checkpoint-command .primary-action"
      ).length,
      primaryAction: primary?.textContent?.trim(),
      checkpointButtons: checkpointButtons.map((button) =>
        button.textContent?.trim()
      ),
      developerInspectionVisible: Array.from(
        document.querySelectorAll(".inspection-surface")
      ).some(visible),
      playerText,
      stableIdVisible: /\b[a-z][a-z0-9_-]*\.[a-z0-9_.-]+\b/.test(playerText),
      bodyScroll: [document.body.scrollWidth, document.body.scrollHeight]
    };
  });

  const expectedButtons = ["Upgrade inventory", "Settings"];
  if (
    state.sourceHead !== sourceHead ||
    !state.sourceClean ||
    JSON.stringify(state.viewport) !== JSON.stringify([1440, 900]) ||
    state.phase !== "checkpoint" ||
    state.mainCount !== 1 ||
    state.backdropCount !== 1 ||
    state.primaryActionCount !== 1 ||
    state.primaryAction !== "Begin preparation" ||
    JSON.stringify(state.checkpointButtons) !==
      JSON.stringify(expectedButtons) ||
    state.developerInspectionVisible ||
    state.stableIdVisible ||
    state.bodyScroll[0] > 1440 ||
    state.bodyScroll[1] > 900
  ) {
    throw new Error(
      `invalid checkpoint capture state: ${JSON.stringify(state)}`
    );
  }

  await page.screenshot({
    path: fileURLToPath(screenshotUrl),
    fullPage: false,
    animations: "disabled"
  });
  const screenshotBytes = await readFile(screenshotUrl);
  const sidecar = {
    schemaVersion: 1,
    sourceHead,
    screenshot: "checkpoint-1440x900.png",
    screenshotSha256: createHash("sha256")
      .update(screenshotBytes)
      .digest("hex"),
    capture: {
      browser: "chromium",
      browserImage: "mcr.microsoft.com/playwright:v1.61.1-noble",
      viewport: state.viewport,
      deviceScaleFactor: 1,
      reducedMotion: true,
      waitCondition: "networkidle-profile-ready-images-complete"
    },
    state
  };
  await writeFile(sidecarUrl, `${JSON.stringify(sidecar, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(sidecar, null, 2)}\n`);
} finally {
  await browser.close();
}
