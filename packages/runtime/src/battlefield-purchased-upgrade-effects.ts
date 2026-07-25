import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type { BattlefieldState, StableId } from "@dwarven-depths/contracts";
import {
  type CharacterSkillModifiers,
  type CharacterSkillTreeDefinition,
  deriveCharacterSkillModifiers,
  derivePurchasedUpgradeCharacterModifiers,
  type ProfileState,
  type PurchasedUpgradeCatalog,
  type PurchasedUpgradeCharacterModifiers,
  validatePurchasedUpgradeProfile
} from "@dwarven-depths/progression";
import type { BattlefieldDwarfDeploymentAuthority } from "@dwarven-depths/sim-core";
import {
  applyBattlefieldCharacterModifiers,
  type BattlefieldCharacterModifiers,
  deployBattlefieldDwarvesWithCharacterModifiers
} from "@dwarven-depths/sim-core/battlefield-skill-effects-internal";

export interface BattlefieldPurchasedUpgradeEffectRequest {
  readonly schemaVersion: 1;
  readonly battlefield: BattlefieldState;
  readonly profile: ProfileState;
  readonly catalog: PurchasedUpgradeCatalog;
  readonly skillTrees: readonly CharacterSkillTreeDefinition[];
}

export interface BattlefieldPurchasedUpgradeEffectResolution {
  readonly schemaVersion: 1;
  readonly battlefield: BattlefieldState;
  readonly purchasedModifiers: readonly PurchasedUpgradeCharacterModifiers[];
  readonly appliedModifiers: readonly BattlefieldCharacterModifiers[];
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

function requireRequest(
  value: unknown
): BattlefieldPurchasedUpgradeEffectRequest {
  const keys = [
    "schemaVersion",
    "battlefield",
    "profile",
    "catalog",
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
      "battlefield purchased-upgrade effect request must be a plain object"
    );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== keys.length ||
    !keys.every((key) => Object.hasOwn(descriptors, key))
  )
    throw new TypeError(
      "battlefield purchased-upgrade effect request must contain exactly schemaVersion, battlefield, profile, catalog, skillTrees"
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
        `battlefield purchased-upgrade effect request.${key} must be own enumerable data`
      );
    record[key] = descriptor.value;
  }
  if (record["schemaVersion"] !== 1)
    throw new RangeError(
      "battlefield purchased-upgrade effect request has unsupported schemaVersion"
    );
  return Object.freeze({
    schemaVersion: 1,
    battlefield: record["battlefield"] as BattlefieldState,
    profile: record["profile"] as ProfileState,
    catalog: record["catalog"] as PurchasedUpgradeCatalog,
    skillTrees: Object.freeze(
      requireDenseDataArray(
        record["skillTrees"],
        "battlefield purchased-upgrade effect request skillTrees"
      ) as CharacterSkillTreeDefinition[]
    )
  });
}

function deriveModifiers(input: BattlefieldPurchasedUpgradeEffectRequest) {
  const profile = validatePurchasedUpgradeProfile({
    schemaVersion: 1,
    profile: input.profile,
    catalog: input.catalog
  });
  const purchasedModifiers = derivePurchasedUpgradeCharacterModifiers({
    schemaVersion: 1,
    profile,
    catalog: input.catalog
  });
  const skillModifiers = input.skillTrees.map((tree) =>
    deriveCharacterSkillModifiers({
      schemaVersion: 1,
      profile,
      tree
    })
  );
  const skillByCharacter = new Map<StableId, CharacterSkillModifiers>();
  for (const modifier of skillModifiers) {
    if (skillByCharacter.has(modifier.characterId))
      throw new RangeError("battlefield skill trees duplicate a character");
    skillByCharacter.set(modifier.characterId, modifier);
  }
  for (const selection of profile.selectedSkillNodes) {
    if (!skillByCharacter.has(selection.characterId))
      throw new RangeError(
        `battlefield skill trees omit selected character (${selection.characterId})`
      );
  }
  const purchasedByCharacter = new Map(
    purchasedModifiers.map((modifier) => [modifier.characterId, modifier])
  );
  const characterIds = [
    ...new Set([...skillByCharacter.keys(), ...purchasedByCharacter.keys()])
  ].sort();
  const add = (left: number, right: number, description: string) => {
    const total = left + right;
    if (!Number.isSafeInteger(total))
      throw new RangeError(`${description} exceeds safe integer range`);
    return total;
  };
  const battlefieldModifiers = Object.freeze(
    characterIds.map((characterId): BattlefieldCharacterModifiers => {
      const skill = skillByCharacter.get(characterId);
      const purchased = purchasedByCharacter.get(characterId);
      return Object.freeze({
        schemaVersion: 1,
        characterDefinitionId: characterId,
        maximumHealthAdd: add(
          skill?.maximumHealthAdd ?? 0,
          purchased?.maximumHealthAdd ?? 0,
          "combined maximumHealthAdd"
        ),
        attackDamageAdd: add(
          skill?.attackDamageAdd ?? 0,
          purchased?.attackDamageAdd ?? 0,
          "combined attackDamageAdd"
        ),
        attackRangeAdd: add(
          skill?.attackRangeAdd ?? 0,
          purchased?.attackRangeAdd ?? 0,
          "combined attackRangeAdd"
        ),
        futureCooldownReductionTicks: add(
          skill?.futureCooldownReductionTicks ?? 0,
          purchased?.futureCooldownReductionTicks ?? 0,
          "combined futureCooldownReductionTicks"
        )
      });
    })
  );
  return Object.freeze({ purchasedModifiers, battlefieldModifiers });
}

/** Applies absolute purchased passive totals to an authoritative live battlefield. */
export function applyPurchasedUpgradeEffectsToBattlefield(
  request: BattlefieldPurchasedUpgradeEffectRequest,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldPurchasedUpgradeEffectResolution {
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
    purchasedModifiers: derived.purchasedModifiers,
    appliedModifiers: derived.battlefieldModifiers
  });
}

/** Validates purchases before atomically deploying upgraded dwarves. */
export function deployBattlefieldDwarvesWithPurchasedUpgradeEffects(
  request: BattlefieldPurchasedUpgradeEffectRequest,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldPurchasedUpgradeEffectResolution {
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
    purchasedModifiers: derived.purchasedModifiers,
    appliedModifiers: derived.battlefieldModifiers
  });
}
