import type {
  ContentBundle,
  ReplayDefinition,
  ScenarioDefinition,
  StableId
} from "@dwarven-depths/contracts";
import { z } from "zod";

const stableIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
    "must be a stable nonlocalized ID"
  );

const checksumSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "must be a lowercase SHA-256 checksum");

const seedSchema = z
  .string()
  .max(10)
  .regex(/^[1-9]\d*$/, "must be a canonical positive decimal integer")
  .refine((value) => {
    if (value.length > 10 || !/^[1-9]\d*$/.test(value)) return false;
    const parsed = BigInt(value);
    return parsed >= 1n && parsed <= 0xffff_ffffn;
  }, "must be between 1 and 4294967295");

const levelDefinitionSchema = z
  .object({
    kind: z.literal("level"),
    id: stableIdSchema,
    waveIds: z.array(stableIdSchema)
  })
  .strict();

const waveDefinitionSchema = z
  .object({
    kind: z.literal("wave"),
    id: stableIdSchema,
    durationTicks: z.int().positive().max(10_000_000)
  })
  .strict();

const contentDefinitionSchema = z.discriminatedUnion("kind", [
  levelDefinitionSchema,
  waveDefinitionSchema
]);

const contentBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    contentVersion: z.string().min(1),
    definitions: z.array(contentDefinitionSchema)
  })
  .strict();

const scenarioCommandSchema = z
  .object({
    atTick: z.int().nonnegative(),
    type: z.literal("confirmPreparation")
  })
  .strict();

const scenarioDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: stableIdSchema,
    levelId: stableIdSchema,
    seed: seedSchema,
    maximumTicks: z.int().positive().max(10_000_000),
    commands: z.array(scenarioCommandSchema),
    expectedTerminalResult: z.enum(["victory", "defeat"]).optional()
  })
  .strict();

const commandEnvelopeSchema = z
  .object({
    tick: z.int().nonnegative(),
    sequence: z.int().nonnegative(),
    command: scenarioCommandSchema
  })
  .strict();

const replayCheckpointSchema = z
  .object({
    tick: z.int().nonnegative(),
    stateChecksum: checksumSchema,
    eventStreamChecksum: checksumSchema
  })
  .strict();

const replayDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    simulationSchemaVersion: z.literal(1),
    contentVersion: z.string().min(1),
    contentManifestHash: checksumSchema,
    scenarioId: stableIdSchema,
    scenarioHash: checksumSchema,
    levelId: stableIdSchema,
    seed: seedSchema,
    rngAlgorithm: z.literal("xorshift32-v1"),
    commands: z.array(commandEnvelopeSchema),
    checkpoints: z
      .array(replayCheckpointSchema)
      .length(1, "version 1 requires exactly one terminal checkpoint"),
    expectedTerminalResult: z.enum(["victory", "defeat"]),
    expectedTerminalTick: z.int().nonnegative()
  })
  .strict();

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly relatedPaths?: readonly string[];
}

export class ContentValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "ContentValidationError";
    this.issues = Object.freeze(
      issues.map((issue) =>
        Object.freeze({
          ...issue,
          ...(issue.relatedPaths === undefined
            ? {}
            : { relatedPaths: Object.freeze([...issue.relatedPaths]) })
        })
      )
    );
  }
}

function formatZodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? "$" : `$/${issue.path.join("/")}`,
    code: issue.code,
    message: issue.message
  }));
}

export function validateContentBundle(input: unknown): ContentBundle {
  const parsed = contentBundleSchema.safeParse(input);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));

  const seen = new Map<
    string,
    { readonly index: number; readonly kind: "level" | "wave" }
  >();
  const issues: ValidationIssue[] = [];
  parsed.data.definitions.forEach((definition, index) => {
    const previous = seen.get(definition.id);
    if (previous !== undefined) {
      issues.push({
        path: `$/definitions/${index}/id`,
        code: "duplicate_stable_id",
        message: `duplicates ${definition.id}`,
        relatedPaths: [`$/definitions/${previous.index}/id`]
      });
    } else {
      seen.set(definition.id, { index, kind: definition.kind });
    }
  });

  parsed.data.definitions.forEach((definition, definitionIndex) => {
    if (definition.kind !== "level") return;
    const waveIds = definition.waveIds;
    waveIds.forEach((waveId, waveIndex) => {
      const target = seen.get(waveId);
      if (target === undefined) {
        issues.push({
          path: `$/definitions/${definitionIndex}/waveIds/${waveIndex}`,
          code: "unknown_reference",
          message: `references unknown wave ID (${waveId})`
        });
      } else if (target.kind !== "wave") {
        issues.push({
          path: `$/definitions/${definitionIndex}/waveIds/${waveIndex}`,
          code: "wrong_reference_kind",
          message: `references ${target.kind}; expected wave`,
          relatedPaths: [`$/definitions/${target.index}/id`]
        });
      }
    });
  });

  if (issues.length > 0) throw new ContentValidationError(issues);
  return {
    schemaVersion: 1,
    contentVersion: parsed.data.contentVersion,
    definitions: parsed.data.definitions.map((definition) =>
      definition.kind === "level"
        ? {
            kind: "level",
            id: definition.id as StableId,
            waveIds: definition.waveIds.map((waveId) => waveId as StableId)
          }
        : {
            kind: "wave",
            id: definition.id as StableId,
            durationTicks: definition.durationTicks
          }
    )
  };
}

export function validateScenario(input: unknown): ScenarioDefinition {
  const parsed = scenarioDefinitionSchema.safeParse(input);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));

  const issues: ValidationIssue[] = [];
  const commands = new Set<string>();
  let previousCommandTick = -1;
  parsed.data.commands.forEach((command, index) => {
    if (command.atTick < previousCommandTick) {
      issues.push({
        path: `$/commands/${index}/atTick`,
        code: "commands_out_of_order",
        message: "must not precede the previous command tick"
      });
    }
    previousCommandTick = command.atTick;
    if (command.type === "confirmPreparation" && command.atTick !== 0) {
      issues.push({
        path: `$/commands/${index}/atTick`,
        code: "invalid_preparation_tick",
        message: "confirmPreparation must be scheduled at gameplay tick 0"
      });
    }
    if (command.atTick >= parsed.data.maximumTicks) {
      issues.push({
        path: `$/commands/${index}/atTick`,
        code: "outside_tick_budget",
        message: `must be less than maximumTicks (${parsed.data.maximumTicks})`
      });
    }
    const key = `${command.atTick}:${command.type}`;
    if (commands.has(key)) {
      issues.push({
        path: `$/commands/${index}`,
        code: "duplicate_command",
        message: `duplicates an earlier ${command.type} command at tick ${command.atTick}`
      });
    }
    commands.add(key);
  });
  if (issues.length > 0) throw new ContentValidationError(issues);

  return {
    schemaVersion: 1,
    id: parsed.data.id as StableId,
    levelId: parsed.data.levelId as StableId,
    seed: parsed.data.seed,
    maximumTicks: parsed.data.maximumTicks,
    commands: parsed.data.commands,
    ...(parsed.data.expectedTerminalResult === undefined
      ? {}
      : { expectedTerminalResult: parsed.data.expectedTerminalResult })
  };
}

export function validateReplay(input: unknown): ReplayDefinition {
  const parsed = replayDefinitionSchema.safeParse(input);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));

  const issues: ValidationIssue[] = [];
  let previousCommandTick = -1;
  parsed.data.commands.forEach((envelope, index) => {
    if (envelope.sequence !== index) {
      issues.push({
        path: `$/commands/${index}/sequence`,
        code: "invalid_command_sequence",
        message: `must equal its ordered replay index (${index})`
      });
    }
    if (envelope.tick !== envelope.command.atTick) {
      issues.push({
        path: `$/commands/${index}/tick`,
        code: "command_tick_mismatch",
        message: "must match command.atTick"
      });
    }
    if (envelope.tick > parsed.data.expectedTerminalTick) {
      issues.push({
        path: `$/commands/${index}/tick`,
        code: "command_after_terminal",
        message: "accepted replay command cannot occur after the terminal tick"
      });
    }
    if (envelope.tick < previousCommandTick) {
      issues.push({
        path: `$/commands/${index}/tick`,
        code: "commands_out_of_order",
        message: "must not precede the previous command tick"
      });
    }
    if (envelope.command.type === "confirmPreparation" && envelope.tick !== 0) {
      issues.push({
        path: `$/commands/${index}/tick`,
        code: "invalid_preparation_tick",
        message: "confirmPreparation must be recorded at gameplay tick 0"
      });
    }
    previousCommandTick = envelope.tick;
  });

  let previousCheckpointTick = -1;
  parsed.data.checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.tick <= previousCheckpointTick) {
      issues.push({
        path: `$/checkpoints/${index}/tick`,
        code: "checkpoints_out_of_order",
        message: "must be strictly greater than the previous checkpoint tick"
      });
    }
    previousCheckpointTick = checkpoint.tick;
  });
  const finalCheckpoint = parsed.data.checkpoints.at(-1);
  if (finalCheckpoint?.tick !== parsed.data.expectedTerminalTick) {
    issues.push({
      path: "$/expectedTerminalTick",
      code: "terminal_checkpoint_mismatch",
      message: "must match the final checkpoint tick"
    });
  }

  if (issues.length > 0) throw new ContentValidationError(issues);
  return {
    ...parsed.data,
    scenarioId: parsed.data.scenarioId as StableId,
    levelId: parsed.data.levelId as StableId,
    commands: parsed.data.commands,
    checkpoints: parsed.data.checkpoints
  };
}

export function asStableId(value: string): StableId {
  const parsed = stableIdSchema.safeParse(value);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));
  return parsed.data as StableId;
}
