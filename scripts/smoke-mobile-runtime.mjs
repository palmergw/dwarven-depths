import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(
  process.argv[2] ?? "apps/mobile/android/app/src/main/assets/public"
);
const mimeTypes = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".map", "application/json"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"]
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const candidate = resolve(
    root,
    pathname === "/" ? "index.html" : `.${pathname}`
  );
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const file = await stat(candidate);
    if (!file.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type":
        mimeTypes.get(extname(candidate)) ?? "application/octet-stream"
    });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolveReady) =>
  server.listen(0, "127.0.0.1", resolveReady)
);
const address = server.address();
if (address === null || typeof address === "string") {
  throw new Error("mobile smoke server did not bind a TCP port");
}
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  hasTouch: true,
  isMobile: true,
  viewport: { width: 320, height: 720 }
});
const page = await context.newPage();
const errors = [];
const externalRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (!request.url().startsWith(origin)) externalRequests.push(request.url());
});

async function readPersistedProfile() {
  return page.evaluate(
    () =>
      new Promise((resolveProfile, rejectProfile) => {
        if (globalThis.indexedDB === undefined) {
          rejectProfile(new Error("IndexedDB is unavailable"));
          return;
        }
        const open = globalThis.indexedDB.open("dwarven-depths-profile-v1", 1);
        open.onerror = () =>
          rejectProfile(
            open.error ?? new Error("could not open profile database")
          );
        open.onsuccess = () => {
          const database = open.result;
          try {
            const transaction = database.transaction("profiles", "readonly");
            const request = transaction
              .objectStore("profiles")
              .get("profile.local");
            request.onerror = () =>
              rejectProfile(
                request.error ?? new Error("could not read persisted profile")
              );
            request.onsuccess = () => resolveProfile(request.result ?? null);
            transaction.onabort = () =>
              rejectProfile(
                transaction.error ??
                  new Error("profile read transaction aborted")
              );
            transaction.oncomplete = () => database.close();
          } catch (error) {
            database.close();
            rejectProfile(error);
          }
        };
      })
  );
}

try {
  const startedAt = performance.now();
  await page.goto(origin, { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { level: 1, name: "Dwarven Depths" })
    .waitFor();
  const launchMilliseconds = Math.round(performance.now() - startedAt);
  if (launchMilliseconds > 8_000) {
    throw new Error(
      `packaged mobile shell launch exceeded 8000ms: ${launchMilliseconds}`
    );
  }

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    undersizedControls: Array.from(
      document.querySelectorAll("button:not(:disabled), select:not(:disabled)")
    )
      .map((control) => ({
        label:
          control.textContent?.trim() ??
          control.getAttribute("aria-label") ??
          "unknown",
        width: control.getBoundingClientRect().width,
        height: control.getBoundingClientRect().height
      }))
      .filter((control) => control.width < 44 || control.height < 44)
  }));
  if (layout.documentWidth > layout.viewportWidth) {
    throw new Error(
      `mobile shell overflows horizontally: ${JSON.stringify(layout)}`
    );
  }
  if (layout.undersizedControls.length > 0) {
    throw new Error(
      `mobile touch targets are undersized: ${JSON.stringify(layout.undersizedControls)}`
    );
  }

  const profileBeforeReload = await page
    .locator(".profile-summary")
    .innerText();
  const persistedProfileBeforeReload = await readPersistedProfile();
  if (
    persistedProfileBeforeReload === null ||
    typeof persistedProfileBeforeReload !== "object" ||
    persistedProfileBeforeReload.profileId !== "profile.local" ||
    persistedProfileBeforeReload.schemaVersion !== 1 ||
    persistedProfileBeforeReload.profileRevision !== 0 ||
    typeof persistedProfileBeforeReload.payloadChecksum !== "string"
  ) {
    throw new Error(
      `packaged shell did not persist the initial checkpoint profile: ${JSON.stringify(persistedProfileBeforeReload)}`
    );
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Begin preparation" }).waitFor();
  const profileAfterReload = await page.locator(".profile-summary").innerText();
  const persistedProfileAfterReload = await readPersistedProfile();
  if (profileAfterReload !== profileBeforeReload) {
    throw new Error("checkpoint profile changed across packaged-shell reload");
  }
  if (
    JSON.stringify(persistedProfileAfterReload) !==
    JSON.stringify(persistedProfileBeforeReload)
  ) {
    throw new Error(
      "persisted checkpoint changed across packaged-shell reload"
    );
  }

  await page.getByRole("button", { name: "Begin preparation" }).tap();
  await page.getByRole("button", { name: "Confirm preparation" }).tap();
  const resume = page.getByRole("button", { name: "Resume combat" });
  const pause = page.getByRole("button", { name: "Pause combat" });
  await Promise.race([resume.waitFor(), pause.waitFor()]);
  if (await resume.isVisible()) await resume.tap();
  await pause.waitFor();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide"))
  );
  await resume.waitFor();

  await resume.click();
  await page.locator(".results").waitFor({ timeout: 30_000 });
  const downloadEvent = page
    .waitForEvent("download", { timeout: 2_000 })
    .catch(() => undefined);
  await page.locator(".results .result-actions button").first().click();
  const download = await downloadEvent;
  const exportUrl = page.url();
  if (
    download !== undefined &&
    !download.suggestedFilename().startsWith("dwarven-depths-run-evidence-v2-")
  ) {
    throw new Error(
      `unexpected evidence filename: ${download.suggestedFilename()}`
    );
  }
  if (externalRequests.length > 0) {
    throw new Error(
      `packaged shell made external requests: ${externalRequests.join(", ")}`
    );
  }
  if (errors.length > 0) {
    throw new Error(
      `packaged shell emitted runtime errors: ${errors.join(" | ")}`
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      viewport: "320x720-touch",
      launchMilliseconds,
      horizontalOverflow: false,
      minimumTouchTargetPixels: 44,
      backgroundPause: true,
      checkpointReload: true,
      evidenceWebDownload: download !== undefined,
      evidenceExportBlocker:
        download === undefined
          ? exportUrl.startsWith("blob:")
            ? "mobile-blob-navigation"
            : "mobile-blob-download-not-observed"
          : null,
      externalRequests: 0
    })}\n`
  );
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolveClosed, reject) =>
    server.close((error) => (error ? reject(error) : resolveClosed()))
  );
}
