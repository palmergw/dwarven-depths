import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

const shellFiles = (await filesBelow(distDirectory))
  .filter(
    (path) => !path.endsWith(".map") && !path.endsWith("service-worker.js")
  )
  .sort();

const precacheUrls = shellFiles.map(
  (path) => `/${relative(distDirectory, path).split(sep).join("/")}`
);
const versionHash = createHash("sha256");
for (const [index, path] of shellFiles.entries()) {
  versionHash.update(precacheUrls[index]);
  versionHash.update("\0");
  versionHash.update(await readFile(path));
  versionHash.update("\0");
}
const cacheName = `dwarven-depths-shell-${versionHash.digest("hex").slice(0, 16)}`;

const serviceWorker = `const CACHE_NAME = ${JSON.stringify(cacheName)};
const CACHE_PREFIX = "dwarven-depths-shell-";
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached ?? fetch(request))
  );
});
`;

await writeFile(resolve(distDirectory, "service-worker.js"), serviceWorker);
console.log(`Generated ${cacheName} with ${precacheUrls.length} shell assets.`);
