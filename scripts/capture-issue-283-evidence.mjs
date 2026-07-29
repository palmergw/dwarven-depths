import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const output = path.resolve(
  "docs/visual-evidence/approved-art-client-integration"
);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "laptop-1280x800", width: 1280, height: 800 },
  { name: "mobile-390x844", width: 390, height: 844 }
];

async function reachCombat(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await page.getByRole("button", { name: "Resume combat" }).waitFor();
}

const metrics = [];
for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(output, `${viewport.name}-checkpoint.png`)
  });
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Confirm preparation" }).click();
  await page.getByRole("button", { name: "Resume combat" }).waitFor();
  await page.screenshot({
    path: path.join(output, `${viewport.name}-paused.png`)
  });
  await page.getByRole("button", { name: "Resume combat" }).click();
  await page.getByRole("button", { name: "Pause combat" }).waitFor();
  await page.waitForTimeout(120);
  await page.screenshot({
    path: path.join(output, `${viewport.name}-active.png`)
  });
  const frameRate = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const started = performance.now();
        const sample = (now) => {
          frames += 1;
          if (now - started >= 1000)
            resolve(Math.round((frames * 1000) / (now - started)));
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      })
  );
  metrics.push(
    await page.evaluate(
      ({ name, width, height, frameRate }) => ({
        name,
        viewport: [width, height],
        navigationDurationMs: Math.round(
          performance.getEntriesByType("navigation")[0]?.duration ?? 0
        ),
        resourceCount: performance.getEntriesByType("resource").length,
        canvasCount: document.querySelectorAll("canvas").length,
        sampledFramesPerSecond: frameRate,
        presentation: "normal-motion"
      }),
      { ...viewport, frameRate }
    )
  );
  await context.close();
}

const reducedContext = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  reducedMotion: "reduce"
});
await reducedContext.addInitScript(() => {
  localStorage.setItem(
    "dwarven-depths.presentation.motion-preference.v1",
    "reduce"
  );
});
const reducedPage = await reducedContext.newPage();
await reachCombat(reducedPage);
await reducedPage.screenshot({
  path: path.join(output, "laptop-1280x800-reduced-motion.png")
});
await reducedContext.close();

const videoDirectory = path.join(output, ".video");
const videoContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: videoDirectory, size: { width: 1280, height: 720 } }
});
const videoPage = await videoContext.newPage();
await reachCombat(videoPage);
const video = videoPage.video();
await videoPage.getByRole("button", { name: "Resume combat" }).click();
await videoPage.waitForTimeout(7000);
await videoContext.close();
const videoPath = await video?.path();
if (videoPath !== undefined)
  await rename(videoPath, path.join(output, "shuttergate-motion-7s.webm"));

await browser.close();
await writeFile(
  path.join(output, "capture-metrics.json"),
  `${JSON.stringify({ schemaVersion: 1, baseUrl, captures: metrics }, null, 2)}\n`
);
console.log(
  JSON.stringify({
    ok: true,
    output,
    captures: metrics.length + 1,
    video: videoPath !== undefined
  })
);
