import { describe, expect, it } from "vitest";
import {
  allowedHostedRunCommands,
  inspectRepositoryWorkflows,
  inspectWorkflowText
} from "./check-ci-runtime-policy.mjs";

function workflowWithStep(step: string, extraJob = "", extraWorkflow = "") {
  return `${extraWorkflow}concurrency:\n  group: test\n  cancel-in-progress: true\njobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 8\n${extraJob}    steps:\n      - ${step}\n`;
}

describe("hosted CI runtime policy", () => {
  it("accepts the checked-in fast workflow and local checkpoint scripts", async () => {
    await expect(inspectRepositoryWorkflows()).resolves.toEqual([]);
  });

  it.each(allowedHostedRunCommands)(
    "allows reviewed hosted command %s",
    (command) => {
      expect(
        inspectWorkflowText("allowed.yml", workflowWithStep(`run: ${command}`))
      ).toEqual([]);
    }
  );

  it.each([
    "pnpm verify",
    "pnpm verify:local:checkpoint",
    "pnpm verify:local:release",
    "npm run verify",
    "yarn verify",
    "pnpm test",
    "pnpm test:built",
    "pnpm --filter @dwarven-depths/runtime test",
    "pnpm exec vitest",
    "./node_modules/.bin/vitest",
    "node node_modules/vitest/vitest.mjs",
    "pnpm test:browser",
    "pnpm exec playwright test",
    "node node_modules/@playwright/test/cli.js test",
    "pnpm report:release-candidate",
    "pnpm build:desktop:docker",
    "docker build -t game .",
    "node scripts/capture-shuttergate-clip.mjs",
    "pnpm hosted-gate",
    "./.github/actions/complete-gate"
  ])("rejects non-allowlisted hosted command %s", (command) => {
    const problems = inspectWorkflowText(
      "forbidden.yml",
      workflowWithStep(`run: ${command}`)
    );
    expect(problems).toContain(
      `forbidden.yml: hosted job test step 0 uses non-allowlisted command: ${command}`
    );
  });

  it("normalizes harmless folded whitespace but does not compose split commands", () => {
    const folded = workflowWithStep("run: >\n          pnpm\n          lint");
    expect(inspectWorkflowText("folded.yml", folded)).toEqual([]);
    const split = workflowWithStep(
      `run: \${{ env.A }}\${{ env.B }} \${{ env.C }}\${{ env.D }}`,
      "    env:\n      A: pn\n      B: pm\n      C: test\n      D: :browser\n"
    );
    expect(inspectWorkflowText("split.yml", split)).toContain(
      "split.yml: hosted job test uses prohibited indirection/runtime keys: env"
    );
  });

  it.each(["container", "defaults", "env", "services", "strategy"])(
    "rejects job-level %s indirection/runtime configuration",
    (key) => {
      const value = key === "container" ? "ubuntu:latest" : "{}";
      const workflow = workflowWithStep(
        "run: pnpm lint",
        `    ${key}: ${value}\n`
      );
      expect(inspectWorkflowText(`${key}.yml`, workflow)).toContain(
        `${key}.yml: hosted job test uses prohibited indirection/runtime keys: ${key}`
      );
    }
  );

  it("rejects workflow-level env/defaults", () => {
    const workflow = workflowWithStep(
      "run: pnpm lint",
      "",
      "env:\n  GATE: pnpm test:browser\n"
    );
    expect(inspectWorkflowText("workflow-env.yml", workflow)).toContain(
      "workflow-env.yml: workflow-level env/defaults are prohibited in bounded hosted CI"
    );
  });

  it("rejects job-level reusable and unallowlisted action workflows", () => {
    const reusable = `concurrency:\n  group: test\n  cancel-in-progress: true\njobs:\n  probe:\n    uses: owner/repo/.github/workflows/full.yml@main\n`;
    expect(inspectWorkflowText("reuse.yml", reusable)).toContain(
      "reuse.yml: reusable workflow job probe is prohibited because its runtime cannot be bounded locally"
    );
    const action = workflowWithStep("uses: docker/build-push-action@v6");
    expect(inspectWorkflowText("action.yml", action)).toContain(
      "action.yml: hosted job test step 0 uses non-allowlisted action: docker/build-push-action@v6"
    );
  });

  it("requires exact pinned action configuration", () => {
    const valid = workflowWithStep(
      "uses: pnpm/action-setup@v6\n        with:\n          version: 11.16.0\n          run_install: false"
    );
    expect(inspectWorkflowText("action-valid.yml", valid)).toEqual([]);
    const changed = workflowWithStep(
      "uses: pnpm/action-setup@v6\n        with:\n          version: 11.16.0\n          run_install: true"
    );
    expect(inspectWorkflowText("action-changed.yml", changed)).toContain(
      "action-changed.yml: hosted job test step 0 changes the pinned configuration for pnpm/action-setup@v6"
    );
  });

  it("enforces bounded concurrency and per-job timeout on quoted and flow maps", () => {
    const quoted =
      'jobs:\n  "test":\n    runs-on: ubuntu-latest\n    steps: []\n';
    expect(inspectWorkflowText("quoted.yml", quoted)).toContain(
      "quoted.yml: hosted job test must declare an integer timeout-minutes"
    );
    const flow =
      "jobs: { test: { runs-on: ubuntu-latest, timeout-minutes: 30, steps: [] } }";
    expect(inspectWorkflowText("flow.yml", flow)).toContain(
      "flow.yml: hosted job test timeout-minutes 30 exceeds the 10-minute hosted-CI ceiling"
    );
    expect(inspectWorkflowText("flow.yml", flow)).toContain(
      "flow.yml: hosted workflows must set concurrency.cancel-in-progress to true"
    );
  });

  it("rejects invalid workflow YAML", () => {
    expect(inspectWorkflowText("invalid.yml", "jobs: [")).toEqual([
      expect.stringContaining("invalid.yml: invalid workflow YAML:")
    ]);
  });
});
