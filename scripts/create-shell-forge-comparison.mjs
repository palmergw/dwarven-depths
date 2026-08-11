import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const beforeDirectory = new URL(
  "../docs/visual-evidence/shell-usability/wip-01/",
  import.meta.url
);
const afterDirectory = new URL(
  "../docs/visual-evidence/shell-usability/wip-02/",
  import.meta.url
);
const beforeManifest = JSON.parse(
  await readFile(new URL("packet.json", beforeDirectory), "utf8")
);
const afterManifest = JSON.parse(
  await readFile(new URL("packet.json", afterDirectory), "utf8")
);
const beforeEvidence = beforeManifest.evidence.find(
  (entry) => entry.capture === "forge" && entry.viewportName === "desktop"
);
const afterEvidence = afterManifest.evidence.find(
  (entry) => entry.capture === "forge" && entry.viewportName === "desktop"
);
if (beforeEvidence === undefined || afterEvidence === undefined) {
  throw new Error("Both packets must contain one desktop Forge capture.");
}
for (const key of ["viewport", "phase", "shellView"]) {
  if (
    JSON.stringify(beforeEvidence.state[key]) !==
    JSON.stringify(afterEvidence.state[key])
  ) {
    throw new Error(`Forge comparison state mismatch for ${key}.`);
  }
}
if (
  beforeManifest.capture.deviceScaleFactor !==
    afterManifest.capture.deviceScaleFactor ||
  beforeManifest.capture.reducedMotion !== afterManifest.capture.reducedMotion
) {
  throw new Error("Forge comparison capture settings do not match.");
}

const beforeBytes = await readFile(
  new URL(beforeEvidence.screenshot, beforeDirectory)
);
const afterBytes = await readFile(
  new URL(afterEvidence.screenshot, afterDirectory)
);
const browser = await chromium.launch({ headless: true });
let pixelDiff;
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 500 }
  });
  const beforeData = `data:image/png;base64,${beforeBytes.toString("base64")}`;
  const afterData = `data:image/png;base64,${afterBytes.toString("base64")}`;
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #090604; color: #f4d486; font-family: Georgia, serif; }
      header { height: 50px; display: grid; grid-template-columns: 1fr 1fr; align-items: center; border-bottom: 1px solid #8f652f; background: #130d08; text-align: center; }
      strong { letter-spacing: .12em; text-transform: uppercase; }
      main { display: grid; grid-template-columns: 1fr 1fr; }
      img { display: block; width: 720px; height: 450px; object-fit: contain; }
    </style>
    <header><strong>Before — verbose cards</strong><strong>After — compact tiles + focused disclosure</strong></header>
    <main><img id="before" src="${beforeData}"><img id="after" src="${afterData}"></main>
  `);
  await page.waitForFunction(() =>
    Array.from(document.images).every(
      (image) => image.complete && image.naturalWidth === 1440
    )
  );
  pixelDiff = await page.evaluate(
    async ({ beforeData, afterData }) => {
      const load = (source) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = source;
        });
      const [before, after] = await Promise.all([
        load(beforeData),
        load(afterData)
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = before.width;
      canvas.height = before.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(before, 0, 0);
      const beforePixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      ).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(after, 0, 0);
      const afterPixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      ).data;
      let changedPixelCount = 0;
      let absoluteChannelDelta = 0;
      for (let index = 0; index < beforePixels.length; index += 4) {
        let pixelChanged = false;
        for (let channel = 0; channel < 4; channel += 1) {
          const delta = Math.abs(
            beforePixels[index + channel] - afterPixels[index + channel]
          );
          absoluteChannelDelta += delta;
          if (delta !== 0) pixelChanged = true;
        }
        if (pixelChanged) changedPixelCount += 1;
      }
      const pixelCount = canvas.width * canvas.height;
      return {
        dimensions: [canvas.width, canvas.height],
        changedPixelCount,
        changedPixelRatio: changedPixelCount / pixelCount,
        meanAbsoluteChannelDelta: absoluteChannelDelta / (pixelCount * 4 * 255)
      };
    },
    { beforeData, afterData }
  );
  await page.screenshot({
    path: fileURLToPath(new URL("forge-before-after.png", afterDirectory)),
    animations: "disabled"
  });
} finally {
  await browser.close();
}

const comparisonBytes = await readFile(
  new URL("forge-before-after.png", afterDirectory)
);
const comparison = {
  schemaVersion: 1,
  decision:
    "Replace verbose Forge cards with compact icon-led tiles and focus/hover disclosure.",
  fixedState: {
    viewport: beforeEvidence.state.viewport,
    phase: beforeEvidence.state.phase,
    shellView: beforeEvidence.state.shellView,
    reducedMotion: beforeManifest.capture.reducedMotion,
    deviceScaleFactor: beforeManifest.capture.deviceScaleFactor
  },
  before: {
    sourceHead: beforeEvidence.state.sourceHead,
    screenshot: "../wip-01/desktop-forge.png",
    screenshotSha256: beforeEvidence.screenshotSha256
  },
  after: {
    sourceHead: afterEvidence.state.sourceHead,
    screenshot: "desktop-forge.png",
    screenshotSha256: afterEvidence.screenshotSha256
  },
  pixelDiff,
  comparisonScreenshot: "forge-before-after.png",
  comparisonScreenshotSha256: createHash("sha256")
    .update(comparisonBytes)
    .digest("hex")
};
await writeFile(
  new URL("comparison.json", afterDirectory),
  `${JSON.stringify(comparison, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
