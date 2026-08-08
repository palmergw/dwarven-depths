import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const binary = process.argv[2];
if (binary === undefined) {
  throw new Error(
    "usage: smoke-desktop-runtime.mjs <desktop-binary> [evidence-directory]"
  );
}
await access(binary);
const evidenceDirectory =
  process.argv[3] === undefined ? undefined : resolve(process.argv[3]);
const canonicalViewport = { width: 1440, height: 900 };

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

async function evaluate(script) {
  return request(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: JSON.stringify({ script, args: [] })
  });
}

async function setCanonicalViewport() {
  let outerWidth = canonicalViewport.width;
  let outerHeight = canonicalViewport.height;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await request(`/session/${sessionId}/window/rect`, {
      method: "POST",
      body: JSON.stringify({
        width: outerWidth,
        height: outerHeight,
        x: 0,
        y: 0
      })
    });
    const viewport = await evaluate(
      "return { width: window.innerWidth, height: window.innerHeight };"
    );
    if (
      viewport.width === canonicalViewport.width &&
      viewport.height === canonicalViewport.height
    ) {
      return viewport;
    }
    outerWidth += canonicalViewport.width - viewport.width;
    outerHeight += canonicalViewport.height - viewport.height;
  }
  throw new Error(
    `desktop viewport did not reach 1440x900: ${JSON.stringify(
      await evaluate(
        "return { width: window.innerWidth, height: window.innerHeight };"
      )
    )}`
  );
}

async function captureEvidence(id, expectedShellView) {
  if (evidenceDirectory === undefined) return undefined;
  const state = await evaluate(`
    const main = document.querySelector("main");
    const visibleText = document.body.innerText.replace(/\\s+/g, " ").trim();
    return {
      sourceHead: document.querySelector('meta[name="dd-source-head"]')?.content ?? null,
      sourceClean: document.querySelector('meta[name="dd-source-clean"]')?.content === "true",
      viewport: [window.innerWidth, window.innerHeight],
      phase: main?.dataset.viewPhase ?? null,
      shellView: main?.dataset.shellView ?? null,
      mainCount: document.querySelectorAll("main").length,
      stableIdVisible: /\\b[a-z][a-z0-9_-]*\\.[a-z0-9_.-]+\\b/.test(visibleText),
      truth: window.__DWARVEN_DEPTHS_TRUTH_SCREEN__ ?? null
    };
  `);
  if (
    state.sourceHead === null ||
    state.sourceClean !== true ||
    JSON.stringify(state.viewport) !== JSON.stringify([1440, 900]) ||
    state.shellView !== expectedShellView ||
    state.mainCount !== 1 ||
    state.stableIdVisible ||
    (id === "desktop-combat-paused" &&
      (state.truth?.captureReady !== true ||
        state.truth?.alignment?.valid !== true ||
        state.truth?.fixtureId !==
          "scenarios/conformance/shuttergate-web-truth.json"))
  ) {
    throw new Error(
      `invalid packaged desktop capture ${id}: ${JSON.stringify(state)}`
    );
  }
  const screenshot = Buffer.from(
    await request(`/session/${sessionId}/screenshot`),
    "base64"
  );
  if (
    screenshot.length < 24 ||
    screenshot.subarray(1, 4).toString("ascii") !== "PNG" ||
    screenshot.readUInt32BE(16) !== canonicalViewport.width ||
    screenshot.readUInt32BE(20) !== canonicalViewport.height
  ) {
    throw new Error(`packaged desktop screenshot ${id} is not a 1440x900 PNG`);
  }
  const filename = `${id}.png`;
  await writeFile(resolve(evidenceDirectory, filename), screenshot);
  return {
    id,
    screenshot: filename,
    screenshotSha256: createHash("sha256").update(screenshot).digest("hex"),
    state
  };
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
  await setCanonicalViewport();
  progress("canonical 1440x900 viewport ready");
  if (evidenceDirectory !== undefined) {
    await mkdir(evidenceDirectory, { recursive: true });
  }

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
  const checkpointEvidence = await captureEvidence(
    "desktop-checkpoint",
    "checkpoint"
  );
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
  const combatEvidence = await captureEvidence(
    "desktop-combat-paused",
    "running"
  );
  const result = {
    ok: true,
    mainLandmark: main !== undefined,
    heading: headingText,
    checkpointAction: checkpointText,
    workerBackedPreparation: preparation.text,
    backgroundPause: resumeAction !== undefined,
    backgroundPauseTrigger
  };
  if (
    evidenceDirectory !== undefined &&
    checkpointEvidence !== undefined &&
    combatEvidence !== undefined
  ) {
    const binaryBytes = await readFile(binary);
    await writeFile(
      resolve(evidenceDirectory, "manifest.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          sourceHead: checkpointEvidence.state.sourceHead,
          capture: {
            target: "tauri-linux-evaluation",
            driver: "tauri-driver/WebKitWebDriver",
            viewport: [canonicalViewport.width, canonicalViewport.height],
            binary: basename(binary),
            binarySha256: createHash("sha256").update(binaryBytes).digest("hex")
          },
          smoke: result,
          evidence: [checkpointEvidence, combatEvidence]
        },
        null,
        2
      )}\n`
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
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
