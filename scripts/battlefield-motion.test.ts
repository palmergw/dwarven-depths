import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  validateBattlefieldMotionEvidence,
  validateBattlefieldMotionSamples
} from "./battlefield-motion.mjs";

const action = (kind = "idle", phase = "idle") => ({ kind, phase });
const entity = (
  id: string,
  nodeId: string,
  screenX: number,
  health: number,
  options: {
    readonly action?: { readonly kind: string; readonly phase: string };
    readonly lifecycle?: "active" | "downed" | "destroyed";
    readonly alpha?: number;
    readonly transitionTick?: number | null;
  } = {}
) => ({
  id,
  nodeId,
  worldPosition: nodeId.endsWith("west_entry")
    ? ([-6, 0] as const)
    : nodeId.endsWith("west_hall")
      ? ([-3, 0] as const)
      : ([0, 0] as const),
  screenPosition: [screenX, 320] as const,
  currentHealth: health,
  action: options.action ?? action(),
  lifecycle: options.lifecycle ?? ("active" as const),
  transitionTick: options.transitionTick ?? null,
  alpha: options.alpha ?? 1
});

function validSamples() {
  const hostileId = "entity.enemy.shuttergate_001";
  const dwarfId = "entity.dwarf.warden";
  const rows = [
    [2, "node.shuttergate_west_entry", 1054, action()],
    [4, "node.shuttergate_west_entry", 1010, action()],
    [7, "node.shuttergate_west_hall", 960, action()],
    [10, "node.shuttergate_west_hall", 900, action()],
    [13, "node.shuttergate_west_hall", 840, action()],
    [16, "node.shuttergate_gate", 790, action("basic_attack", "windup")],
    [19, "node.shuttergate_gate", 730, action("basic_attack", "committed")],
    [22, "node.shuttergate_gate", 680, action("basic_attack", "recovery")]
  ] as const;
  const samples: {
    videoTimeMilliseconds: number;
    tick: number;
    entities: ReturnType<typeof entity>[];
  }[] = rows.map(([tick, nodeId, x, hostileAction], index) => ({
    videoTimeMilliseconds: index * 50,
    tick,
    entities: [
      entity(dwarfId, "node.shuttergate_gate", 605, index < 7 ? 240 : 230),
      entity(hostileId, nodeId, x, 50, { action: hostileAction })
    ]
  }));
  for (const [index, alpha] of [1, 0.78, 0.48, 0.18].entries())
    samples.push({
      videoTimeMilliseconds: (rows.length + index) * 50,
      tick: 25 + index * 3,
      entities: [
        entity(dwarfId, "node.shuttergate_gate", 605, 230),
        entity(hostileId, "node.shuttergate_gate", 663, 14, {
          lifecycle: "destroyed",
          transitionTick: 25,
          alpha
        })
      ]
    });
  samples.push({
    videoTimeMilliseconds: 600,
    tick: 37,
    entities: [entity(dwarfId, "node.shuttergate_gate", 605, 230)]
  });
  return samples;
}

const committedExpectations = {
  sourceHead: "c097a142ffb31c8ac506d6f5213105187ff0d204",
  transitionTicks: { "entity.enemy.shuttergate_001": 89 }
};

describe("running-client battlefield motion evidence", () => {
  it("accepts continuous route, combat, damage, and retained destruction", () => {
    expect(validateBattlefieldMotionSamples(validSamples())).toMatchObject({
      trackedEntityId: "entity.enemy.shuttergate_001",
      visitedRoute: [
        "node.shuttergate_west_entry",
        "node.shuttergate_west_hall",
        "node.shuttergate_gate"
      ],
      departureSampleCount: 4
    });
  });

  it("allows bounded route-node snaps only for reduced-motion evidence", () => {
    const reduced = validSamples().map((sample, index) => ({
      ...sample,
      videoTimeMilliseconds: index * 10
    }));
    expect(() => validateBattlefieldMotionSamples(reduced)).toThrow(
      "continuous motion bound"
    );
    expect(
      validateBattlefieldMotionSamples(reduced, { reducedMotion: true })
    ).toMatchObject({
      trackedEntityId: "entity.enemy.shuttergate_001"
    });
    reduced[3] = {
      ...reduced[3],
      entities: reduced[3].entities.map((candidate) =>
        candidate.id.startsWith("entity.enemy.")
          ? { ...candidate, screenPosition: [500, 320] as const }
          : candidate
      )
    };
    expect(() =>
      validateBattlefieldMotionSamples(reduced, { reducedMotion: true })
    ).toThrow("continuous motion bound");
  });

  it("strictly rejects extra properties and noncanonical entity order", () => {
    expect(() =>
      validateBattlefieldMotionSamples([
        { ...validSamples()[0], extra: true },
        ...validSamples().slice(1)
      ])
    ).toThrow("exact supported shape");
    const samples = validSamples();
    samples[0] = {
      ...samples[0],
      entities: [...samples[0].entities].reverse()
    };
    expect(() => validateBattlefieldMotionSamples(samples)).toThrow(
      "canonical unique ID ordering"
    );
  });

  it("rejects jumps, backward traversal, and unexplained removal", () => {
    const jump = validSamples();
    jump[3] = {
      ...jump[3],
      entities: jump[3].entities.map((candidate) =>
        candidate.id.startsWith("entity.enemy.")
          ? { ...candidate, screenPosition: [700, 320] as const }
          : candidate
      )
    };
    expect(() => validateBattlefieldMotionSamples(jump)).toThrow(
      "continuous motion bound"
    );

    const backward = validSamples();
    backward[6] = {
      ...backward[6],
      entities: backward[6].entities.map((candidate) =>
        candidate.id.startsWith("entity.enemy.")
          ? { ...candidate, nodeId: "node.shuttergate_west_hall" }
          : candidate
      )
    };
    expect(() => validateBattlefieldMotionSamples(backward)).toThrow(
      "moved backward"
    );

    expect(() =>
      validateBattlefieldMotionSamples(
        validSamples().map((sample) => ({
          ...sample,
          entities: sample.entities.filter(
            (candidate) => candidate.lifecycle === "active"
          )
        }))
      )
    ).toThrow("lifecycle transition");

    const disappearance = validSamples();
    disappearance[2] = {
      ...disappearance[2],
      entities: disappearance[2].entities.filter(
        (candidate) => !candidate.id.startsWith("entity.enemy.")
      )
    };
    expect(() => validateBattlefieldMotionSamples(disappearance)).toThrow(
      "disappeared before a lifecycle transition"
    );

    const additionalHostile = validSamples();
    additionalHostile[0].entities.push(
      entity("entity.enemy.zzz", "node.shuttergate_west_entry", 1080, 50)
    );
    additionalHostile[2].entities.push(
      entity("entity.enemy.zzz", "node.shuttergate_west_entry", 1050, 50)
    );
    expect(() => validateBattlefieldMotionSamples(additionalHostile)).toThrow(
      "entity.enemy.zzz disappeared before a lifecycle transition"
    );

    const destroyedOnly = validSamples();
    for (let index = 8; index < 12; index += 1)
      destroyedOnly[index].entities.push(
        entity("entity.enemy.zzz", "node.shuttergate_gate", 670, 0, {
          lifecycle: "destroyed",
          transitionTick: 24
        })
      );
    expect(() => validateBattlefieldMotionSamples(destroyedOnly)).toThrow(
      "entity.enemy.zzz lifecycle transition tick is not authoritative"
    );
  });

  it("binds lifecycle state and transition tick to the sample sequence", () => {
    const futureTransition = validSamples();
    futureTransition[8] = {
      ...futureTransition[8],
      entities: futureTransition[8].entities.map((candidate) =>
        candidate.id.startsWith("entity.enemy.")
          ? { ...candidate, transitionTick: futureTransition[8].tick + 1_000 }
          : candidate
      )
    };
    expect(() => validateBattlefieldMotionSamples(futureTransition)).toThrow(
      "transition tick is not authoritative"
    );

    const activeTransition = validSamples();
    activeTransition[3] = {
      ...activeTransition[3],
      entities: activeTransition[3].entities.map((candidate) =>
        candidate.id.startsWith("entity.enemy.")
          ? { ...candidate, transitionTick: activeTransition[3].tick }
          : candidate
      )
    };
    expect(() => validateBattlefieldMotionSamples(activeTransition)).toThrow(
      "is active with a transition tick"
    );
  });

  it("independently verifies the committed video and sidecar derivations", async () => {
    const directory = "docs/visual-evidence/release-closeout/wip-02/clip";
    const evidence = JSON.parse(
      await readFile(`${directory}/shuttergate-normal-motion-clip.json`, "utf8")
    );
    const videoBytes = await readFile(`${directory}/${evidence.video}`);
    expect(
      validateBattlefieldMotionEvidence(
        evidence,
        videoBytes,
        committedExpectations
      )
    ).toMatchObject(evidence.motionValidation);

    for (const tampered of [
      { ...evidence, videoSha256: "0".repeat(64) },
      { ...evidence, endingTick: evidence.endingTick + 1 },
      {
        ...evidence,
        motionValidation: {
          ...evidence.motionValidation,
          sampleCount: evidence.motionValidation.sampleCount - 1
        }
      },
      {
        ...evidence,
        samples: evidence.samples.map((sample: object, index: number) =>
          index === 0 ? { ...sample, unexpected: true } : sample
        )
      }
    ])
      expect(() =>
        validateBattlefieldMotionEvidence(
          tampered,
          videoBytes,
          committedExpectations
        )
      ).toThrow();

    expect(() =>
      validateBattlefieldMotionEvidence(
        { ...evidence, sourceHead: "0".repeat(40) },
        videoBytes,
        committedExpectations
      )
    ).toThrow("source head does not match");

    const changedTransition = structuredClone(evidence);
    for (const sample of changedTransition.samples)
      sample.entities = sample.entities.map(
        (candidate: { id: string; lifecycle: string }) =>
          candidate.id === evidence.motionValidation.trackedEntityId &&
          candidate.lifecycle !== "active"
            ? { ...candidate, transitionTick: 90 }
            : candidate
      );
    expect(() =>
      validateBattlefieldMotionEvidence(
        changedTransition,
        videoBytes,
        committedExpectations
      )
    ).toThrow();
  });
});
