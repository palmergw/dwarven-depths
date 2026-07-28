import { existsSync, readFileSync } from "node:fs";

const implemented = "implemented";
const blocked = "contract-blocked";

export const phase6AcceptanceEntries = Object.freeze([
  entry(
    "new-profile",
    "A new profile starts with only the Iron Warden.",
    implemented,
    ["packages/progression/src/index.test.ts"],
    "Initial profile ownership is validated by the progression contract."
  ),
  entry(
    "placement",
    "The player chooses one valid placement point and starts the level.",
    implemented,
    ["packages/runtime/src/shuttergate-placement-sweep.browser.test.ts"],
    "Both authored placement points run through browser-parity calibration."
  ),
  entry(
    "timed-waves",
    "Continuous timed waves transition without clearing surviving enemies.",
    implemented,
    ["packages/sim-core/src/scheduled-battlefield.test.ts"],
    "The authoritative schedule admits overlapping waves without clearing survivors."
  ),
  entry(
    "enemy-behavior",
    "Goblin Cutters and at least one behaviorally distinct enemy navigate, queue, block, target, and attack correctly.",
    implemented,
    [
      "packages/runtime/src/shuttergate-reference-calibration.test.ts",
      "packages/sim-core/src/enemy-movement-planning.test.ts"
    ],
    "Reference calibration and focused movement evidence cover the authored enemy roles."
  ),
  entry(
    "target-policy",
    "The Iron Warden automatically selects targets and honors a mid-combat preference change.",
    implemented,
    [
      "packages/sim-core/src/target-policy-command.test.ts",
      "packages/sim-core/src/dwarf-attack-targeting.test.ts"
    ],
    "Target acquisition remains authoritative and applies policy changes at the next acquisition."
  ),
  entry(
    "shield-slam",
    "Shield Slam activates in real time and produces a readable tactical result.",
    implemented,
    [
      "packages/sim-core/src/active-ability.test.ts",
      "apps/web/src/App.browser.test.tsx"
    ],
    "Simulation ability evidence is paired with browser cooldown and rejection feedback."
  ),
  entry(
    "reference-baseline",
    "An unupgraded profile normally fails before completing the level under the reference simulation.",
    implemented,
    ["packages/runtime/src/shuttergate-level-1-baseline.test.ts"],
    "The pinned canonical baseline ends in defeat inside its approved evidence ranges."
  ),
  entry(
    "failure-boundary",
    "Failure occurs only when the Iron Warden is down.",
    implemented,
    ["packages/runtime/src/authoritative-combat-checkpoint.test.ts"],
    "Terminal evaluation is bound to the authoritative living-dwarf state."
  ),
  entry(
    "persistent-progress",
    "Kill and progress rewards persist after returning to the level checkpoint.",
    implemented,
    [
      "packages/progression/src/attempt-progress-rewards.test.ts",
      "apps/web/src/upgrade-purchase.browser.test.tsx"
    ],
    "Reward claims persist in the profile and the checkpoint publishes only confirmed writes."
  ),
  entry(
    "first-upgrade",
    "A purchased or selected persistent upgrade produces a measurable deeper push in a reference replay.",
    implemented,
    [
      "packages/runtime/src/shuttergate-level-1-balance-matrix.test.ts",
      "packages/runtime/src/shuttergate-campaign-calibration.test.ts"
    ],
    "Every authored placement and target policy survives longer with the pinned first upgrade."
  ),
  entry(
    "skill-pause",
    "A skill point can be opened while combat is paused or deferred until resolution.",
    implemented,
    ["apps/web/src/skill-selection.browser.test.tsx"],
    "The checkpoint skill workflow persists an authoritative selection without browser-owned progression."
  ),
  entry(
    "boss-progression",
    "The intermediary boss can be defeated after sufficient progression and mastery.",
    blocked,
    [],
    "Overlapping Gatebreaker Captain behavior and a terminating web encounter remain contract-blocked; no victory is inferred."
  ),
  entry(
    "boss-unlock",
    "Defeating the boss immediately persists Deep Ranger availability, including if the attempt later ends in defeat.",
    implemented,
    [
      "packages/runtime/src/boss-reward-checkpoint.test.ts",
      "packages/runtime/src/boss-reward-checkpoint.browser.test.ts"
    ],
    "Boss reward checkpoint evidence commits Deep Ranger before same-step defeat."
  ),
  entry(
    "reduced-repeat-reward",
    "Replaying a completed level applies the configured reduced reward and cannot repeat first-clear rewards.",
    blocked,
    [],
    "Duplicate reward claims are prevented, but no reduced-repeat multiplier or completed-level producer has been approved."
  ),
  entry(
    "save-reload",
    "Save and reload preserve the checkpoint state, boss unlock, build, inventory, and current level.",
    implemented,
    [
      "packages/save/src/profile-save.test.ts",
      "packages/save/src/indexed-db.browser.test.ts"
    ],
    "Versioned profile saves validate stable progression IDs and browser persistence."
  ),
  entry(
    "full-recycle",
    "Full recycle refunds configured progression, resets build choices, and returns campaign progression to the first level.",
    implemented,
    [
      "packages/progression/src/recycle-transactions.test.ts",
      "apps/web/src/upgrade-recycle.browser.test.tsx",
      "apps/web/src/skill-recycle.browser.test.tsx"
    ],
    "Both complete recycle scopes conserve their spend, retain declared ownership, and reset campaign access."
  ),
  entry(
    "deterministic-replay",
    "The same content version, inputs, and seed reproduce the same simulation outcome.",
    implemented,
    ["packages/runtime/src/shuttergate-level-1-policy-replay.test.ts"],
    "The canonical three-attempt policy artifact restores and replays byte-identically."
  ),
  entry(
    "accessible-controls",
    "Essential controls remain keyboard-accessible, scalable, color-independent, and usable with reduced motion enabled.",
    implemented,
    ["apps/web/src/App.browser.test.tsx", "docs/phase-6.md"],
    "Browser checks gate keyboard and constrained-viewport operation; bounded visual review covers color-independent and reduced-motion presentation."
  )
]);

const expectedIds = Object.freeze(phase6AcceptanceEntries.map(({ id }) => id));
const expectedCriteria = Object.freeze(readAcceptanceCriteria());
const expectedExplanations = Object.freeze(
  phase6AcceptanceEntries.map(({ explanation }) => explanation)
);
const expectedEvidence = Object.freeze(
  phase6AcceptanceEntries.map(({ evidence }) => evidence)
);
const blockedIds = new Set(["boss-progression", "reduced-repeat-reward"]);
const evidencePins = Object.freeze([
  pin(
    "Boss-unlock",
    "packages/runtime/src/boss-reward-checkpoint.test.ts",
    "93a14497e18a90a06b102c6562da918c19df202980d9ebc1f8143c1a79638452",
    "Pinned after same-step defeat verified Deep Ranger persistence: 93a14497e18a90a06b102c6562da918c19df202980d9ebc1f8143c1a79638452"
  ),
  pin(
    "Replay-claim",
    "packages/progression/src/attempt-progress-rewards.test.ts",
    "a054d7ab58d97532058c520ec567b5168788ce1f3c103f514994d36790d9d4a7",
    "Pinned after duplicate claims returned zero reward without mutating ownership: a054d7ab58d97532058c520ec567b5168788ce1f3c103f514994d36790d9d4a7"
  ),
  pin(
    "Full-recycle",
    "packages/progression/src/recycle-transactions.test.ts",
    "fde8ef18f09d63c95e111cf6b6e92d59b5b84724e8e64813ae4f01edac87a0fe",
    "Pinned after both complete scopes conserved spend and retained declared state: fde8ef18f09d63c95e111cf6b6e92d59b5b84724e8e64813ae4f01edac87a0fe"
  )
]);

function entry(id, criterion, status, evidence, explanation) {
  return Object.freeze({
    id,
    criterion,
    status,
    evidence: Object.freeze(evidence),
    explanation
  });
}

function pin(label, path, checksum, changeExplanation) {
  return Object.freeze({ label, path, checksum, changeExplanation });
}

function requireEvidencePins() {
  for (const evidencePin of evidencePins) {
    if (
      !/^[0-9a-f]{64}$/.test(evidencePin.checksum) ||
      !evidencePin.changeExplanation.includes(evidencePin.checksum)
    )
      throw new TypeError(
        `Phase 6 evidence pin lacks a checksum-bound explanation (${evidencePin.label})`
      );
    if (!readFileSync(evidencePin.path, "utf8").includes(evidencePin.checksum))
      throw new TypeError(
        `Phase 6 evidence checksum drift is unexplained (${evidencePin.label})`
      );
  }
}

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function plainDataRecord(value) {
  if (!plainRecord(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every(
    (key) =>
      typeof key === "string" && Object.hasOwn(descriptors[key] ?? {}, "value")
  );
}

function plainDataArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    keys.at(-1) !== "length" ||
    !Object.hasOwn(descriptors.length ?? {}, "value")
  )
    return false;
  return Array.from({ length: value.length }, (_, index) =>
    Object.hasOwn(descriptors[String(index)] ?? {}, "value")
  ).every(Boolean);
}

function readAcceptanceCriteria() {
  const source = readFileSync("docs/first-pass-systems.md", "utf8");
  const section = source
    .split("## Vertical-slice acceptance criteria\n", 2)[1]
    ?.split(
      "## Decisions that may remain tunable during technical design",
      1
    )[0];
  const criteria = section
    ?.split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
  if (criteria?.length !== expectedIds.length)
    throw new TypeError("Phase 6 source acceptance criteria are incomplete");
  return criteria;
}

export function requirePhase6AcceptanceEntries(
  value,
  { checkFiles = true } = {}
) {
  if (!plainDataArray(value) || value.length !== expectedIds.length)
    throw new TypeError("Phase 6 acceptance entries are incomplete");
  const seen = new Set();
  const normalized = value.map((candidate, index) => {
    if (
      !plainDataRecord(candidate) ||
      Object.keys(candidate).sort().join(",") !==
        "criterion,evidence,explanation,id,status"
    )
      throw new TypeError("Phase 6 acceptance entry has invalid fields");
    if (candidate.id !== expectedIds[index] || seen.has(candidate.id))
      throw new TypeError(
        "Phase 6 acceptance entries must use canonical unique order"
      );
    seen.add(candidate.id);
    if (candidate.criterion !== expectedCriteria[index])
      throw new TypeError(
        `Phase 6 acceptance criterion does not match source (${candidate.id})`
      );
    const expectedStatus = blockedIds.has(candidate.id) ? blocked : implemented;
    if (candidate.status !== expectedStatus)
      throw new TypeError(
        `Phase 6 acceptance status is not approved (${candidate.id})`
      );
    if (
      typeof candidate.criterion !== "string" ||
      typeof candidate.explanation !== "string" ||
      candidate.explanation !== expectedExplanations[index] ||
      /[|<>`\r\n]/.test(candidate.explanation)
    )
      throw new TypeError(
        `Phase 6 acceptance explanation is not canonical (${candidate.id})`
      );
    const evidence = candidate.evidence;
    if (
      !plainDataArray(evidence) ||
      new Set(evidence).size !== evidence.length ||
      evidence.some(
        (path) =>
          typeof path !== "string" ||
          !(
            /^(apps|packages)\/[A-Za-z0-9._/-]+\.test\.tsx?$/.test(path) ||
            path === "docs/phase-6.md"
          ) ||
          path
            .split("/")
            .some(
              (segment) => segment === "" || segment === "." || segment === ".."
            ) ||
          /[|<>`\r\n]/.test(path)
      )
    )
      throw new TypeError(
        `Phase 6 acceptance evidence is invalid (${candidate.id})`
      );
    const canonicalEvidence = expectedEvidence[index];
    if (
      canonicalEvidence === undefined ||
      evidence.length !== canonicalEvidence.length ||
      evidence.some(
        (path, evidenceIndex) => path !== canonicalEvidence[evidenceIndex]
      )
    )
      throw new TypeError(
        `Phase 6 acceptance evidence is not canonical (${candidate.id})`
      );
    if (expectedStatus === implemented && evidence.length === 0)
      throw new TypeError(
        `Implemented Phase 6 acceptance lacks evidence (${candidate.id})`
      );
    if (expectedStatus === blocked && evidence.length !== 0)
      throw new TypeError(
        `Blocked Phase 6 acceptance must not claim passing evidence (${candidate.id})`
      );
    if (checkFiles) {
      for (const path of evidence) {
        if (!existsSync(path))
          throw new TypeError(
            `Phase 6 acceptance evidence is missing (${path})`
          );
      }
    }
    return entry(
      candidate.id,
      candidate.criterion,
      candidate.status,
      [...evidence],
      candidate.explanation
    );
  });
  return Object.freeze(normalized);
}

function code(value) {
  return `\`${value}\``;
}

export function renderPhase6ReleaseReadinessMarkdown(entries, identity) {
  const accepted = requirePhase6AcceptanceEntries(entries);
  requireEvidencePins();
  if (
    !plainDataRecord(identity) ||
    Object.keys(identity).sort().join(",") !==
      "calibrationReportChecksum,campaignPayloadChecksum,contentManifestHash,scenarioHash,scenarioId"
  )
    throw new TypeError("Phase 6 release-readiness identity is invalid");
  if (identity.scenarioId !== "campaign_scenario.shuttergate.v1")
    throw new TypeError("Phase 6 release-readiness scenario is not canonical");
  for (const [key, value] of Object.entries(identity)) {
    if (
      typeof value !== "string" ||
      (key !== "scenarioId" && !/^[0-9a-f]{64}$/.test(value))
    )
      throw new TypeError(
        `Phase 6 release-readiness identity is invalid (${key})`
      );
  }
  const lines = [
    "# Phase 6 release readiness",
    "",
    "This report separates implemented evidence from criteria that remain contract-blocked. A blocked row is not release acceptance.",
    "",
    `Campaign scenario: ${code(identity.scenarioId)}`,
    `Scenario hash: ${code(identity.scenarioHash)}`,
    `Content manifest: ${code(identity.contentManifestHash)}`,
    `Campaign payload: ${code(identity.campaignPayloadChecksum)}`,
    `Calibration report: ${code(identity.calibrationReportChecksum)}`,
    "",
    "## Acceptance coverage",
    "",
    "| Criterion | Status | Evidence |",
    "| --- | --- | --- |"
  ];
  for (const item of accepted) {
    const evidence =
      item.evidence.length === 0 ? "—" : item.evidence.map(code).join("<br>");
    lines.push(`| ${item.criterion} | ${code(item.status)} | ${evidence} |`);
  }
  lines.push("", "## Release explanations", "");
  for (const id of [
    "reference-baseline",
    "first-upgrade",
    "boss-unlock",
    "reduced-repeat-reward",
    "full-recycle"
  ]) {
    const item = accepted.find((candidate) => candidate.id === id);
    if (item === undefined)
      throw new TypeError(`Phase 6 release explanation is missing (${id})`);
    lines.push(`### ${item.criterion}`, "", item.explanation, "");
  }
  for (const evidencePin of evidencePins)
    lines.push(
      `${evidencePin.label} evidence checksum: ${code(evidencePin.checksum)}`,
      evidencePin.changeExplanation,
      ""
    );
  lines.push(
    "## Contract-blocked release boundaries",
    "",
    "A reference human replay remains blocked until an approved terminating web encounter contract exists.",
    "Terminal client/CLI parity remains blocked by the same nonterminating Phase 5 web boundary.",
    ""
  );
  lines.push(
    "The replay-claim checksum proves duplicate-claim prevention only. It is included to expose the boundary, not to substitute for the blocked reduced-repeat reward contract.",
    ""
  );
  return lines.join("\n");
}
