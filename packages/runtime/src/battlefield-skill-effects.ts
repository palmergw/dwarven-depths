import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type { BattlefieldState, StableId } from "@dwarven-depths/contracts";
import {
  type CharacterSkillModifiers,
  type CharacterSkillTreeDefinition,
  deriveCharacterSkillModifiers,
  type ProfileState
} from "@dwarven-depths/progression";
import {
  applyBattlefieldCharacterModifiers,
  type BattlefieldDwarfDeploymentAuthority,
  deployBattlefieldDwarves
} from "@dwarven-depths/sim-core";

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
  if (
    !Array.isArray(record["skillTrees"]) ||
    Object.getPrototypeOf(record["skillTrees"]) !== Array.prototype ||
    Reflect.ownKeys(record["skillTrees"]).length !==
      record["skillTrees"].length + 1
  )
    throw new TypeError(
      "battlefield skill-effect request skillTrees must be a dense data array"
    );
  return record as unknown as BattlefieldSkillEffectRequest;
}

/** Derives persisted selections and commits their absolute totals to live state. */
export function applySelectedSkillEffectsToBattlefield(
  request: BattlefieldSkillEffectRequest,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldSkillEffectResolution {
  const input = requireRequest(request);
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
  const battlefield = applyBattlefieldCharacterModifiers(
    input.battlefield,
    authority,
    content,
    modifiers.map((modifier) =>
      Object.freeze({
        schemaVersion: 1 as const,
        characterDefinitionId: modifier.characterId,
        maximumHealthAdd: modifier.maximumHealthAdd,
        attackDamageAdd: modifier.attackDamageAdd,
        attackRangeAdd: modifier.attackRangeAdd,
        futureCooldownReductionTicks: modifier.futureCooldownReductionTicks
      })
    )
  );
  return Object.freeze({
    schemaVersion: 1,
    battlefield,
    modifiers: Object.freeze(modifiers)
  });
}

/** Initializes deployed dwarves and immediately applies persisted selections. */
export function deployBattlefieldDwarvesWithSelectedSkillEffects(
  request: BattlefieldSkillEffectRequest,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldSkillEffectResolution {
  const input = requireRequest(request);
  return applySelectedSkillEffectsToBattlefield(
    {
      ...input,
      battlefield: deployBattlefieldDwarves(
        input.battlefield,
        authority,
        content
      )
    },
    content,
    authority
  );
}
