import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(root, "apps/web/dist");

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else files.push(path);
  }
  return files;
}

const serviceWorker = await readFile(
  resolve(distDirectory, "service-worker.js"),
  "utf8"
);
const precacheMatch = serviceWorker.match(
  /const PRECACHE_URLS = (\[[\s\S]*?\]);/
);
assert.ok(
  precacheMatch,
  "generated service worker exposes its precache contract"
);
const precacheUrls = JSON.parse(precacheMatch[1]);
const expectedUrls = (await filesBelow(distDirectory))
  .filter(
    (path) => !path.endsWith(".map") && !path.endsWith("service-worker.js")
  )
  .map((path) => `/${relative(distDirectory, path).split(sep).join("/")}`)
  .sort();
assert.deepEqual(
  precacheUrls,
  expectedUrls,
  "every generated shell asset is precached"
);
assert.ok(
  precacheUrls.some((url) =>
    /^\/assets\/simulation\.worker-[\w-]+\.js$/.test(url)
  ),
  "the authoritative simulation worker bundle is precached"
);
assert.match(serviceWorker, /request\.method !== "GET"/);
assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
assert.doesNotMatch(serviceWorker, /skipWaiting/);

const contentTypes = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"]
]);
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const filePath = resolve(distDirectory, `.${requestedPath}`);
    assert.ok(
      filePath.startsWith(`${distDirectory}${sep}`),
      "request path stays inside the web build"
    );
    assert.ok((await stat(filePath)).isFile());
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type":
        contentTypes.get(extname(filePath)) ?? "application/octet-stream"
    });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolveListen) =>
  server.listen(0, "127.0.0.1", resolveListen)
);
const address = server.address();
assert.ok(address && typeof address !== "string");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "allow" });
try {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.getByRole("heading", { name: "Dwarven Depths" }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.goto(`http://127.0.0.1:${address.port}/checkpoint`, {
    waitUntil: "domcontentloaded"
  });
  await page.getByRole("heading", { name: "Dwarven Depths" }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
    true,
    "offline routed navigation is controlled by the installed service worker"
  );
  await page.getByRole("button", { name: "Begin preparation" }).click();
  await page.getByRole("button", { name: "Confirm preparation" }).waitFor();
} finally {
  await context.setOffline(false);
  await context.close();
  await browser.close();
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose()))
  );
}

console.log(
  `Verified ${precacheUrls.length} precached assets and a playable Chromium offline navigation.`
);
