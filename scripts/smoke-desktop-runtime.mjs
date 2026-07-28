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
  { detached: true, stdio: ["ignore", "pipe", "pipe"] }
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

function progress(step) {
  process.stderr.write(`[desktop-smoke] ${step}\n`);
}

async function request(path, init = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    signal: AbortSignal.timeout(2_000),
    headers: { "content-type": "application/json", ...init.headers }
  });
  const body = await response.json();
  if (!response.ok || body.value?.error) {
    throw new Error(`WebDriver ${path} failed: ${JSON.stringify(body)}`);
  }
  return body.value;
}

async function waitForDriver() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
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

async function waitForElement(selector) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await find(selector);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`element did not reach ${selector}`);
}

async function findButtonByText(text) {
  const value = await request(`/session/${sessionId}/element`, {
    method: "POST",
    body: JSON.stringify({
      using: "xpath",
      value: `//main//button[contains(normalize-space(.), ${JSON.stringify(text)})]`
    })
  });
  return value["element-6066-11e4-a52e-4f735466cecf"];
}

async function waitForText(selector, expected) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
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

async function waitForButton(text) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await findButtonByText(text);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`button did not reach ${text}`);
}

async function waitForCombatControl() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const element = await findButtonByText("combat");
      const text = await request(
        `/session/${sessionId}/element/${element}/text`
      );
      if (text === "Pause combat" || text === "Resume combat") {
        return { element, text };
      }
    } catch {
      // The worker can replace preparation with the running view between calls.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("combat controls did not become ready");
}

try {
  await waitForDriver();
  progress("driver ready");
  const session = await request("/session", {
    method: "POST",
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: { "tauri:options": { application: binary } }
      }
    })
  });
  sessionId = session.sessionId;
  progress("session ready");

  const main = await waitForElement("main");
  const heading = await waitForElement("main h1");
  const checkpointAction = await waitForButton("Begin preparation");
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
  progress("checkpoint ready");
  await request(`/session/${sessionId}/element/${checkpointAction}/click`, {
    method: "POST",
    body: "{}"
  });
  const preparation = await waitForText("main button", "Confirm preparation");
  progress("worker preparation ready");
  await request(`/session/${sessionId}/element/${preparation.element}/click`, {
    method: "POST",
    body: "{}"
  });
  const combatControl = await waitForCombatControl();
  progress("combat running");
  const backgroundPauseTrigger =
    combatControl.text === "Resume combat" ? "webdriver-focus" : "minimize";
  const resumeAction =
    combatControl.text === "Resume combat"
      ? combatControl.element
      : await (async () => {
          await request(`/session/${sessionId}/window/minimize`, {
            method: "POST",
            body: "{}"
          });
          return waitForButton("Resume combat");
        })();
  progress("background pause observed");
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mainLandmark: main !== undefined,
      heading: headingText,
      checkpointAction: checkpointText,
      workerBackedPreparation: preparation.text,
      backgroundPause: resumeAction !== undefined,
      backgroundPauseTrigger
    })}\n`
  );
} finally {
  if (sessionId !== undefined) {
    await request(`/session/${sessionId}`, { method: "DELETE" }).catch(
      () => {}
    );
  }
  if (driver.pid !== undefined) {
    try {
      process.kill(-driver.pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") {
        process.stderr.write(`failed to stop tauri-driver: ${String(error)}\n`);
        process.exitCode = 1;
      }
    }
  }
}
