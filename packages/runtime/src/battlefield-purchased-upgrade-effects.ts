import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type { BattlefieldState } from "@dwarven-depths/contracts";
import {
  derivePurchasedUpgradeCharacterModifiers,
  type ProfileState,
  type PurchasedUpgradeCatalog,
  type PurchasedUpgradeCharacterModifiers
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
}

export interface BattlefieldPurchasedUpgradeEffectResolution {
  readonly schemaVersion: 1;
  readonly battlefield: BattlefieldState;
  readonly modifiers: readonly PurchasedUpgradeCharacterModifiers[];
}

function requireRequest(
  value: unknown
): BattlefieldPurchasedUpgradeEffectRequest {
  const keys = ["schemaVersion", "battlefield", "profile", "catalog"] as const;
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
      "battlefield purchased-upgrade effect request must contain exactly schemaVersion, battlefield, profile, catalog"
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
    catalog: record["catalog"] as PurchasedUpgradeCatalog
  });
}

function deriveModifiers(input: BattlefieldPurchasedUpgradeEffectRequest) {
  const modifiers = derivePurchasedUpgradeCharacterModifiers({
    schemaVersion: 1,
    profile: input.profile,
    catalog: input.catalog
  });
  const battlefieldModifiers = Object.freeze(
    modifiers.map(
      (modifier): BattlefieldCharacterModifiers =>
        Object.freeze({
          schemaVersion: 1,
          characterDefinitionId: modifier.characterId,
          maximumHealthAdd: modifier.maximumHealthAdd,
          attackDamageAdd: modifier.attackDamageAdd,
          attackRangeAdd: modifier.attackRangeAdd,
          futureCooldownReductionTicks: modifier.futureCooldownReductionTicks
        })
    )
  );
  return Object.freeze({ modifiers, battlefieldModifiers });
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
    modifiers: derived.modifiers
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
    modifiers: derived.modifiers
  });
}
