import type {
  ContentBundle,
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
    seed: z
      .string()
      .max(10)
      .regex(/^[1-9]\d*$/, "must be a canonical positive decimal integer")
      .refine((value) => {
        if (value.length > 10 || !/^[1-9]\d*$/.test(value)) return false;
        const parsed = BigInt(value);
        return parsed >= 1n && parsed <= 0xffff_ffffn;
      }, "must be between 1 and 4294967295"),
    maximumTicks: z.int().positive().max(10_000_000),
    commands: z.array(scenarioCommandSchema),
    expectedTerminalResult: z.enum(["victory", "defeat"]).optional()
  })
  .strict();

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export class ContentValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "ContentValidationError";
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue }))
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
        message: `duplicates $/definitions/${previous.index}/id (${definition.id})`
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
          message: `references ${target.kind} at $/definitions/${target.index}/id; expected wave`
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
  parsed.data.commands.forEach((command, index) => {
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

export function asStableId(value: string): StableId {
  const parsed = stableIdSchema.safeParse(value);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));
  return parsed.data as StableId;
}
