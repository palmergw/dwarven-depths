import { describe, expect, it } from "vitest";
import {
  inspectRepositoryWorkflows,
  inspectWorkflowText
} from "./check-ci-runtime-policy.mjs";

describe("hosted CI runtime policy", () => {
  it("accepts the checked-in fast workflows", async () => {
    await expect(inspectRepositoryWorkflows()).resolves.toEqual([]);
  });

  it.each([
    ["complete verification", "run: pnpm verify"],
    ["npm verification bypass", "run: npm run verify"],
    ["yarn verification bypass", "run: yarn verify"],
    ["local checkpoint", "run: pnpm verify:local:checkpoint"],
    ["local release checkpoint", "run: pnpm run verify:local:release"],
    ["full unit suite", "run: pnpm test:built"],
    [
      "option-prefixed full suite",
      "run: pnpm --filter @dwarven-depths/runtime test"
    ],
    ["direct Vitest suite", "run: pnpm exec vitest run"],
    ["implicit Vitest CI suite", "run: pnpm exec vitest"],
    ["Vitest binary suite", "run: ./node_modules/.bin/vitest"],
    ["Vitest module suite", "run: node node_modules/vitest/vitest.mjs"],
    ["direct Vitest run flag", "run: pnpm exec vitest --run"],
    ["browser tests", "run: corepack pnpm test:browser"],
    ["direct Playwright suite", "run: pnpm exec playwright test"],
    ["release reports", "run: pnpm report:release-candidate"],
    ["desktop packaging", "run: pnpm build:desktop:docker"],
    ["capture", "run: pnpm capture:shuttergate-clip"]
  ])("rejects hosted %s", (_label, command) => {
    const workflow = `concurrency:\n  group: test\n  cancel-in-progress: true\njobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 8\n    steps:\n      - ${command}\n`;
    expect(
      inspectWorkflowText(".github/workflows/test.yml", workflow)
    ).not.toEqual([]);
  });

  it.each([
    [
      "folded complete verification",
      "run: >\n          pnpm\n          verify"
    ],
    ["direct desktop packaging", "run: ./scripts/build-desktop-docker.sh"],
    ["direct capture", "run: node scripts/capture-shuttergate-clip.mjs"]
  ])("rejects parsed YAML %s", (_label, command) => {
    const workflow = `concurrency:\n  group: test\n  cancel-in-progress: true\njobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 8\n    steps:\n      - ${command}\n`;
    expect(inspectWorkflowText("parsed.yml", workflow)).not.toEqual([]);
  });

  it("rejects a Playwright job container", () => {
    const workflow = `concurrency:\n  group: test\n  cancel-in-progress: true\njobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 8\n    container:\n      image: mcr.microsoft.com/playwright:v1.61.1-noble\n    steps:\n      - run: pnpm lint\n`;
    expect(inspectWorkflowText("container.yml", workflow)).toContain(
      "container.yml: hosted job test contains long-running browser/offline tests"
    );
  });

  it("rejects job-level reusable workflows", () => {
    const workflow = `concurrency:\n  group: test\n  cancel-in-progress: true\njobs:\n  probe:\n    uses: owner/repo/.github/workflows/full.yml@main\n`;
    expect(inspectWorkflowText("reuse.yml", workflow)).toContain(
      "reuse.yml: reusable workflow job probe is prohibited because its runtime cannot be bounded locally"
    );
  });

  it("rejects long commands hidden in matrix or environment scalars", () => {
    const workflow = `concurrency:\n  group: test\n  cancel-in-progress: true\njobs:\n  probe:\n    runs-on: ubuntu-latest\n    timeout-minutes: 8\n    strategy:\n      matrix:\n        command: ["pnpm test:browser"]\n    env:\n      RELEASE_GATE: pnpm verify:local:release\n    steps:\n      - run: \${{ matrix.command }}\n`;
    const problems = inspectWorkflowText("indirect.yml", workflow);
    expect(problems).toContain(
      "indirect.yml: hosted job probe contains long-running browser/offline tests"
    );
    expect(problems).toContain(
      "indirect.yml: hosted job probe contains long-running complete verification"
    );
  });

  it("handles quoted and flow-style job maps", () => {
    expect(
      inspectWorkflowText(
        "quoted.yml",
        'jobs:\n  "test":\n    runs-on: ubuntu-latest\n'
      )
    ).toContain(
      "quoted.yml: hosted job test must declare an integer timeout-minutes"
    );
    expect(
      inspectWorkflowText(
        "flow.yml",
        "jobs: { test: { runs-on: ubuntu-latest, steps: [{ run: pnpm lint }] } }"
      )
    ).toContain(
      "flow.yml: hosted job test must declare an integer timeout-minutes"
    );
  });

  it("rejects missing and excessive hosted job timeouts per job", () => {
    expect(
      inspectWorkflowText(
        "missing.yml",
        "jobs:\n  bounded:\n    runs-on: ubuntu-latest\n    timeout-minutes: 8\n  unbounded:\n    runs-on: ubuntu-latest\n"
      )
    ).toContain(
      "missing.yml: hosted job unbounded must declare an integer timeout-minutes"
    );
    expect(
      inspectWorkflowText(
        "wide-indent.yml",
        "jobs:\n    slow:\n      runs-on: ubuntu-latest\n      steps:\n        - run: pnpm lint\n"
      )
    ).toContain(
      "wide-indent.yml: hosted job slow must declare an integer timeout-minutes"
    );
    expect(
      inspectWorkflowText(
        "long.yml",
        "jobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 30\n"
      )
    ).toContain(
      "long.yml: hosted job test timeout-minutes 30 exceeds the 10-minute hosted-CI ceiling"
    );
  });
});
