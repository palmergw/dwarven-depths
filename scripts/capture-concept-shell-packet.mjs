import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.DD_WEB_URL ?? "http://127.0.0.1:4173";
const outputDirectory = process.env.DD_SHELL_PACKET_OUTPUT_DIRECTORY
  ? pathToFileURL(
      `${process.env.DD_SHELL_PACKET_OUTPUT_DIRECTORY.replace(/\/$/, "")}/`
    )
  : new URL("../docs/visual-evidence/concept-shell/wip-03/", import.meta.url);
const { stdout: trackedStatus } = await execFile(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=no"],
  { cwd: repositoryRoot }
);
if (trackedStatus.trim() !== "") {
  throw new Error(
    "Refusing to capture visual evidence from a worktree with tracked changes."
  );
}
const { stdout } = await execFile("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot
});
const sourceHead = stdout.trim();
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 }
};
const captures = [
  "checkpoint",
  "settings",
  "forge",
  "preparation",
  "result",
  "failure"
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  ...Object.keys(viewports).flatMap((viewportName) =>
    captures.map((capture) =>
      rm(new URL(`${viewportName}-${capture}.png`, outputDirectory), {
        force: true
      })
    )
  ),
  rm(new URL("packet.json", outputDirectory), { force: true })
]);

const browser = await chromium.launch({ headless: true });
const evidence = [];
try {
  for (const [viewportName, viewport] of Object.entries(viewports)) {
    for (const capture of captures) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        reducedMotion: "reduce"
      });
      const page = await context.newPage();
      if (capture === "result" || capture === "failure") {
        await page.addInitScript((terminalState) => {
          const checksum = "a".repeat(64);
          globalThis.Worker = class EvidenceWorker extends EventTarget {
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
                      terminalState === "result"
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
        }, capture);
      }
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.waitForFunction(() => {
        const roster = document.querySelector(".profile-summary");
        return (
          roster?.textContent?.includes("Loading local progression") ===
            false &&
          Array.from(document.images).every((image) => image.complete)
        );
      });

      if (capture === "settings") {
        await page.getByRole("button", { name: "Settings" }).click();
      } else if (capture === "forge") {
        await page.getByRole("button", { name: /Upgrade inventory/ }).click();
      } else if (capture === "preparation") {
        await page.getByRole("button", { name: "Begin preparation" }).click();
      } else if (capture === "failure") {
        await page.getByRole("button", { name: "Begin preparation" }).click();
        await page.getByRole("button", { name: "Confirm preparation" }).click();
      } else if (capture === "result") {
        await page.getByRole("button", { name: "Begin preparation" }).click();
        await page.getByRole("button", { name: "Confirm preparation" }).click();
      }

      const expectedShellView =
        capture === "failure"
          ? "failure"
          : capture === "result"
            ? "result"
            : capture;
      await page
        .locator(`main[data-shell-view="${expectedShellView}"]`)
        .waitFor({ timeout: capture === "result" ? 125_000 : 20_000 });
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        const scrollingPanel = document.querySelector(".settings, .upgrades");
        if (scrollingPanel instanceof HTMLElement) scrollingPanel.scrollTop = 0;
      });
      await page.waitForTimeout(1_000);

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
        const visibleText = document.body.innerText
          .replaceAll(/\s+/g, " ")
          .trim();
        return {
          viewport: [window.innerWidth, window.innerHeight],
          phase: main?.dataset.viewPhase,
          shellView: main?.dataset.shellView,
          mainCount: document.querySelectorAll("main").length,
          visibleInspectionCount: Array.from(
            document.querySelectorAll(".inspection-surface")
          ).filter(visible).length,
          stableIdVisible:
            /(?:character|level|map|upgrade|ability)\.[a-z0-9_.-]+/.test(
              visibleText
            ),
          bodyScroll: [document.body.scrollWidth, document.body.scrollHeight],
          panelScroll: [
            document.querySelector(".panel")?.scrollWidth,
            document.querySelector(".panel")?.scrollHeight
          ],
          visibleButtonNames: Array.from(document.querySelectorAll("button"))
            .filter(visible)
            .map((button) => button.textContent?.replaceAll(/\s+/g, " ").trim())
        };
      });
      if (
        JSON.stringify(state.viewport) !==
          JSON.stringify([viewport.width, viewport.height]) ||
        state.shellView !== expectedShellView ||
        state.mainCount !== 1 ||
        state.visibleInspectionCount !== 0 ||
        state.stableIdVisible ||
        state.bodyScroll[0] > viewport.width ||
        state.bodyScroll[1] > viewport.height
      ) {
        throw new Error(
          `invalid ${viewportName} ${capture} capture state: ${JSON.stringify(state)}`
        );
      }

      const filename = `${viewportName}-${capture}.png`;
      const screenshotUrl = new URL(filename, outputDirectory);
      await page.screenshot({
        path: fileURLToPath(screenshotUrl),
        fullPage: false,
        animations: "disabled"
      });
      const screenshotBytes = await readFile(screenshotUrl);
      evidence.push({
        viewportName,
        capture,
        screenshot: filename,
        screenshotSha256: createHash("sha256")
          .update(screenshotBytes)
          .digest("hex"),
        state
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const manifest = {
  schemaVersion: 1,
  sourceHead,
  capture: {
    browser: "chromium",
    browserImage: "mcr.microsoft.com/playwright:v1.61.1-noble",
    deviceScaleFactor: 1,
    reducedMotion: true,
    waitCondition: "networkidle-profile-ready-images-complete"
  },
  evidence
};
await writeFile(
  new URL("packet.json", outputDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
