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

const contentBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    contentVersion: z.string().min(1),
    definitions: z.array(levelDefinitionSchema)
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
      .max(20)
      .regex(/^\d+$/, "must be an unsigned decimal integer"),
    maximumTicks: z.int().positive(),
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
    this.issues = issues;
  }
}

function formatZodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: `$/${issue.path.join("/")}`,
    code: issue.code,
    message: issue.message
  }));
}

export function validateContentBundle(input: unknown): ContentBundle {
  const parsed = contentBundleSchema.safeParse(input);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));

  const seen = new Map<string, number>();
  const issues: ValidationIssue[] = [];
  parsed.data.definitions.forEach((definition, index) => {
    const previous = seen.get(definition.id);
    if (previous !== undefined) {
      issues.push({
        path: `$/definitions/${index}/id`,
        code: "duplicate_stable_id",
        message: `duplicates $/definitions/${previous}/id (${definition.id})`
      });
    } else {
      seen.set(definition.id, index);
    }
  });

  if (issues.length > 0) throw new ContentValidationError(issues);
  return {
    schemaVersion: 1,
    contentVersion: parsed.data.contentVersion,
    definitions: parsed.data.definitions.map((definition) => ({
      kind: "level",
      id: definition.id as StableId,
      waveIds: definition.waveIds.map((waveId) => waveId as StableId)
    }))
  };
}

export function validateScenario(input: unknown): ScenarioDefinition {
  const parsed = scenarioDefinitionSchema.safeParse(input);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));
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
