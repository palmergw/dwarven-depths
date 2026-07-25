import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type { BattlefieldState, StableId } from "@dwarven-depths/contracts";
import {
  type CharacterSkillModifiers,
  type CharacterSkillTreeDefinition,
  deriveCharacterSkillModifiers,
  type ProfileState
} from "@dwarven-depths/progression";
import type { BattlefieldDwarfDeploymentAuthority } from "@dwarven-depths/sim-core";
import {
  applyBattlefieldCharacterModifiers,
  type BattlefieldCharacterModifiers,
  deployBattlefieldDwarvesWithCharacterModifiers
} from "@dwarven-depths/sim-core/battlefield-skill-effects-internal";

export interface BattlefieldSkillEffectRequest {
  readonly schemaVersion: 1;
  readonly battlefield: BattlefieldState;
  readonly profile: ProfileState;
  readonly skillTrees: readonly CharacterSkillTreeDefinition[];
}

export interface BattlefieldSkillEffectResolution {
  readonly schemaVersion: 1;
  readonly battlefield: BattlefieldState;
  readonly modifiers: readonly CharacterSkillModifiers[];
}

function requireDenseDataArray(
  value: unknown,
  description: string
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError(`${description} must be a standard array`);
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError(`${description} must be a dense data array`);
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `${description} item ${index} must be own enumerable data`
      );
    return descriptor.value;
  });
}

function requireRequest(value: unknown): BattlefieldSkillEffectRequest {
  const keys = [
    "schemaVersion",
    "battlefield",
    "profile",
    "skillTrees"
  ] as const;
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(
      "battlefield skill-effect request must be a plain object"
    );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== keys.length ||
    !keys.every((key) => Object.hasOwn(descriptors, key))
  )
    throw new TypeError(
      "battlefield skill-effect request must contain exactly schemaVersion, battlefield, profile, skillTrees"
    );
  const record: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `battlefield skill-effect request.${key} must be own enumerable data`
      );
    record[key] = descriptor.value;
  }
  if (record["schemaVersion"] !== 1)
    throw new RangeError(
      "battlefield skill-effect request has unsupported schemaVersion"
    );
  return Object.freeze({
    schemaVersion: 1,
    battlefield: record["battlefield"] as BattlefieldState,
    profile: record["profile"] as ProfileState,
    skillTrees: Object.freeze(
      requireDenseDataArray(
        record["skillTrees"],
        "battlefield skill-effect request skillTrees"
      ) as CharacterSkillTreeDefinition[]
    )
  });
}

function deriveModifiers(input: BattlefieldSkillEffectRequest) {
  const modifiers = input.skillTrees.map((tree) =>
    deriveCharacterSkillModifiers({
      schemaVersion: 1,
      profile: input.profile,
      tree
    })
  );
  const byCharacter = new Set<StableId>();
  for (const modifier of modifiers) {
    if (byCharacter.has(modifier.characterId))
      throw new RangeError("battlefield skill trees duplicate a character");
    byCharacter.add(modifier.characterId);
  }
  const battlefieldModifiers = modifiers.map(
    (modifier): BattlefieldCharacterModifiers =>
      Object.freeze({
        schemaVersion: 1,
        characterDefinitionId: modifier.characterId,
        maximumHealthAdd: modifier.maximumHealthAdd,
        attackDamageAdd: modifier.attackDamageAdd,
        attackRangeAdd: modifier.attackRangeAdd,
        futureCooldownReductionTicks: modifier.futureCooldownReductionTicks
      })
  );
  return Object.freeze({
    modifiers: Object.freeze(modifiers),
    battlefieldModifiers: Object.freeze(battlefieldModifiers)
  });
}

/** Derives persisted selections and commits their absolute totals to live state. */
export function applySelectedSkillEffectsToBattlefield(
  request: BattlefieldSkillEffectRequest,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldSkillEffectResolution {
  const input = requireRequest(request);
  const derived = deriveModifiers(input);
  const battlefield = applyBattlefieldCharacterModifiers(
    input.battlefield,
    authority,
    content,
    derived.battlefieldModifiers
  );
  return Object.freeze({
    schemaVersion: 1,
    battlefield,
    modifiers: derived.modifiers
  });
}

/** Validates persisted effects before atomically initializing upgraded dwarves. */
export function deployBattlefieldDwarvesWithSelectedSkillEffects(
  request: BattlefieldSkillEffectRequest,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldSkillEffectResolution {
  const input = requireRequest(request);
  const derived = deriveModifiers(input);
  const battlefield = deployBattlefieldDwarvesWithCharacterModifiers(
    input.battlefield,
    authority,
    content,
    derived.battlefieldModifiers
  );
  return Object.freeze({
    schemaVersion: 1,
    battlefield,
    modifiers: derived.modifiers
  });
}
