import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

const binary = process.argv[2];
if (binary === undefined) {
  throw new Error("usage: smoke-desktop-runtime.mjs <desktop-binary>");
}
await access(binary);

const driver = spawn(
  "tauri-driver",
  ["--native-driver", "/usr/bin/WebKitWebDriver"],
  { stdio: ["ignore", "pipe", "pipe"] }
);
let driverOutput = "";
driver.stdout.on("data", (chunk) => {
  driverOutput += chunk;
});
driver.stderr.on("data", (chunk) => {
  driverOutput += chunk;
});

const endpoint = "http://127.0.0.1:4444";
let sessionId;

async function request(path, init = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers }
  });
  const body = await response.json();
  if (!response.ok || body.value?.error) {
    throw new Error(`WebDriver ${path} failed: ${JSON.stringify(body)}`);
  }
  return body.value;
}

async function waitForDriver() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await request("/status");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`tauri-driver did not become ready: ${driverOutput}`);
}

async function find(selector) {
  const value = await request(`/session/${sessionId}/element`, {
    method: "POST",
    body: JSON.stringify({ using: "css selector", value: selector })
  });
  return value["element-6066-11e4-a52e-4f735466cecf"];
}

async function waitForText(selector, expected) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const element = await find(selector);
      const text = await request(
        `/session/${sessionId}/element/${element}/text`
      );
      if (text.includes(expected)) return { element, text };
    } catch {
      // The worker-backed view can replace the checkpoint DOM between requests.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${selector} did not reach ${expected}`);
}

try {
  await waitForDriver();
  const session = await request("/session", {
    method: "POST",
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: { "tauri:options": { application: binary } }
      }
    })
  });
  sessionId = session.sessionId;

  const main = await find("main");
  const heading = await find("main h1");
  const checkpointAction = await find("main button");
  const [headingText, checkpointText] = await Promise.all([
    request(`/session/${sessionId}/element/${heading}/text`),
    request(`/session/${sessionId}/element/${checkpointAction}/text`)
  ]);
  if (!headingText.includes("Dwarven Depths")) {
    throw new Error(`unexpected desktop heading: ${headingText}`);
  }
  if (!checkpointText.includes("Begin preparation")) {
    throw new Error(`checkpoint action not ready: ${checkpointText}`);
  }
  await request(`/session/${sessionId}/element/${checkpointAction}/click`, {
    method: "POST",
    body: "{}"
  });
  const preparation = await waitForText("main button", "Confirm preparation");
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mainLandmark: main !== undefined,
      heading: headingText,
      checkpointAction: checkpointText,
      workerBackedPreparation: preparation.text
    })}\n`
  );
} finally {
  if (sessionId !== undefined) {
    await request(`/session/${sessionId}`, { method: "DELETE" }).catch(
      () => {}
    );
  }
  driver.kill("SIGTERM");
}
