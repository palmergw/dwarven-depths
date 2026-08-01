import { execFile as execFileCallback, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryDirectory = await mkdtemp(
  resolve(tmpdir(), "shuttergate-alpha-integrity-")
);
const transparentWarden = resolve(temporaryDirectory, "transparent-warden.png");
const transparentEnemy = resolve(temporaryDirectory, "transparent-enemy.png");
const outputDirectory = resolve(temporaryDirectory, "capture");
const port = 4187;
const baseUrl = `http://127.0.0.1:${port}`;
let server;

async function requireRejectedMutation(name, environment) {
  let rejected = false;
  let diagnostics = "";
  try {
    await execFile("node", ["scripts/capture-shuttergate-truth.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        DD_WEB_URL: baseUrl,
        DD_TRUTH_OUTPUT_DIRECTORY: outputDirectory,
        ...environment
      },
      maxBuffer: 4 * 1024 * 1024
    });
  } catch (error) {
    diagnostics = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    rejected =
      error.code !== 0 &&
      diagnostics.includes('"nonzeroAlphaPixels":0') &&
      diagnostics.includes('"valid":false');
  }
  if (!rejected)
    throw new Error(`${name} mutation was not rejected\n${diagnostics}`);
  return { mutation: name, rejected: true };
}

try {
  await mkdir(outputDirectory, { recursive: true });
  await execFile(
    "uv",
    [
      "run",
      "--with-requirements",
      "assets/game-art/layered-map-poc/requirements.lock",
      "python3",
      "-c",
      `from PIL import Image; Image.new("RGBA", (112, 72), (0, 0, 0, 0)).save(${JSON.stringify(transparentWarden)}); Image.new("RGBA", (80, 60), (0, 0, 0, 0)).save(${JSON.stringify(transparentEnemy)})`
    ],
    { cwd: root }
  );
  server = spawn(
    "pnpm",
    [
      "--filter",
      "@dwarven-depths/web",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort"
    ],
    { cwd: root, detached: true, stdio: "ignore" }
  );
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  if (!ready) throw new Error("temporary Vite server did not become ready");

  const mutations = [
    await requireRejectedMutation("transparent-warden", {
      DD_TRUTH_WARDEN_ASSET: transparentWarden
    }),
    await requireRejectedMutation("transparent-enemy", {
      DD_TRUTH_ENEMY_ASSET: transparentEnemy
    })
  ];
  process.stdout.write(`${JSON.stringify({ ok: true, mutations })}\n`);
} finally {
  if (server !== undefined) {
    const exited = new Promise((resolveExit) => {
      if (server.exitCode !== null) resolveExit();
      else server.once("exit", resolveExit);
    });
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
    await Promise.race([
      exited,
      new Promise((resolveWait) => setTimeout(resolveWait, 3_000))
    ]);
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}
