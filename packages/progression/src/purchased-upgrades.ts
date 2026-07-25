import type { StableId } from "@dwarven-depths/contracts";
import {
  characterIdPattern,
  compareText,
  itemIdPattern,
  maximumProfileRecords,
  normalizeProfileState,
  type ProfileState,
  type PurchasedUpgrade,
  requireProfileArray,
  requireProfileId,
  requireProfileRecord,
  requireProfileUnsigned,
  upgradeIdPattern
} from "./profile-state.js";
import type {
  CharacterSkillEffect,
  CharacterSkillEffectKind
} from "./skill-tree.js";

export type PurchasedUpgradeKind = "ability_rank" | "item_rank";

export interface PurchasedUpgradeDefinition {
  readonly schemaVersion: 1;
  readonly upgradeId: StableId;
  readonly kind: PurchasedUpgradeKind;
  readonly ownerId: StableId;
  readonly prerequisiteUpgradeIds: readonly StableId[];
  readonly rankCosts: readonly number[];
  readonly passiveEffectsByRank: readonly (readonly CharacterSkillEffect[])[];
}

export interface PurchasedUpgradeCatalog {
  readonly schemaVersion: 1;
  readonly upgrades: readonly PurchasedUpgradeDefinition[];
}

export interface ForgeOrePurchaseRequest {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly catalog: PurchasedUpgradeCatalog;
  readonly upgradeId: StableId;
}

export interface ForgeOrePurchaseDecision {
  readonly schemaVersion: 1;
  readonly upgradeId: StableId;
  readonly kind: PurchasedUpgradeKind;
  readonly previousRank: number;
  readonly purchasedRank: number;
  readonly forgeOreSpent: number;
  readonly forgeOreRemaining: number;
  readonly status: "purchased";
  readonly reason: "upgrade_rank_purchased";
}

export interface ForgeOrePurchaseResolution {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly decision: ForgeOrePurchaseDecision;
}

export interface PurchasedUpgradeValidationRequest {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly catalog: PurchasedUpgradeCatalog;
}

export interface PurchasedUpgradeCharacterModifiers {
  readonly schemaVersion: 1;
  readonly characterId: StableId;
  readonly maximumHealthAdd: number;
  readonly attackDamageAdd: number;
  readonly attackRangeAdd: number;
  readonly futureCooldownReductionTicks: number;
  readonly sourceUpgradeIds: readonly StableId[];
}

const upgradeKinds = new Set<PurchasedUpgradeKind>([
  "ability_rank",
  "item_rank"
]);
const passiveEffectKinds = new Set<CharacterSkillEffectKind>([
  "maximum_health_add",
  "attack_damage_add",
  "attack_range_add",
  "future_cooldown_reduction_ticks"
]);

function addSafe(total: number, value: number, description: string): number {
  const result = total + value;
  if (!Number.isSafeInteger(result))
    throw new RangeError(`${description} exceeds safe integer range`);
  return result;
}

function passiveEffectsIdentity(
  definition: PurchasedUpgradeDefinition
): string {
  return JSON.stringify({
    upgradeId: definition.upgradeId,
    kind: definition.kind,
    ownerId: definition.ownerId,
    passiveEffectsByRank: definition.passiveEffectsByRank
  });
}

function normalizeCatalog(value: unknown): PurchasedUpgradeCatalog {
  const source = requireProfileRecord(
    value,
    ["schemaVersion", "upgrades"],
    "purchased upgrade catalog"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "purchased upgrade catalog has unsupported schemaVersion"
    );
  const seen = new Set<StableId>();
  const seenOwners = new Set<string>();
  let totalRecords = 0;
  const upgrades = requireProfileArray(
    source.upgrades,
    "purchased upgrade catalog upgrades"
  )
    .map((entry, index): PurchasedUpgradeDefinition => {
      const description = `purchased upgrade ${index}`;
      const definition = requireProfileRecord(
        entry,
        [
          "schemaVersion",
          "upgradeId",
          "kind",
          "ownerId",
          "prerequisiteUpgradeIds",
          "rankCosts",
          "passiveEffectsByRank"
        ],
        description
      );
      if (definition.schemaVersion !== 1)
        throw new RangeError(`${description} has unsupported schemaVersion`);
      const upgradeId = requireProfileId(
        definition.upgradeId,
        upgradeIdPattern,
        `${description} upgradeId`
      );
      if (seen.has(upgradeId))
        throw new RangeError(`duplicate purchased upgrade ID (${upgradeId})`);
      seen.add(upgradeId);
      if (
        typeof definition.kind !== "string" ||
        !upgradeKinds.has(definition.kind as PurchasedUpgradeKind)
      )
        throw new RangeError(`${description} has unknown kind`);
      const kind = definition.kind as PurchasedUpgradeKind;
      const ownerId = requireProfileId(
        definition.ownerId,
        kind === "ability_rank" ? characterIdPattern : itemIdPattern,
        `${description} ownerId`
      );
      const expectedUpgradePrefix =
        kind === "ability_rank" ? "upgrade.ability." : "upgrade.item.";
      if (!upgradeId.startsWith(expectedUpgradePrefix))
        throw new RangeError(
          `${description} upgradeId does not match kind (${upgradeId})`
        );
      const ownerKey = `${kind}:${ownerId}`;
      if (seenOwners.has(ownerKey))
        throw new RangeError(
          `duplicate purchased upgrade owner (${kind}, ${ownerId})`
        );
      seenOwners.add(ownerKey);
      const prerequisites = requireProfileArray(
        definition.prerequisiteUpgradeIds,
        `${description} prerequisiteUpgradeIds`
      )
        .map((prerequisite, prerequisiteIndex) =>
          requireProfileId(
            prerequisite,
            upgradeIdPattern,
            `${description} prerequisiteUpgradeIds[${prerequisiteIndex}]`
          )
        )
        .sort(compareText);
      if (new Set(prerequisites).size !== prerequisites.length)
        throw new RangeError(`${description} contains duplicate prerequisites`);
      if (prerequisites.includes(upgradeId))
        throw new RangeError(`${description} cannot require itself`);
      const rankCosts = requireProfileArray(
        definition.rankCosts,
        `${description} rankCosts`
      ).map((cost, rankIndex) => {
        const normalized = requireProfileUnsigned(
          cost,
          `${description} rankCosts[${rankIndex}]`
        );
        if (normalized === 0)
          throw new RangeError(`${description} rank cost must be positive`);
        return normalized;
      });
      if (rankCosts.length === 0)
        throw new RangeError(
          `${description} must contain at least one rank cost`
        );
      const passiveEffectsByRank = requireProfileArray(
        definition.passiveEffectsByRank,
        `${description} passiveEffectsByRank`
      ).map((rankEffects, rankIndex) => {
        const seenKinds = new Set<CharacterSkillEffectKind>();
        const effects = requireProfileArray(
          rankEffects,
          `${description} passiveEffectsByRank[${rankIndex}]`
        )
          .map((effect, effectIndex): CharacterSkillEffect => {
            const effectDescription = `${description} passiveEffectsByRank[${rankIndex}][${effectIndex}]`;
            const effectSource = requireProfileRecord(
              effect,
              ["schemaVersion", "kind", "value"],
              effectDescription
            );
            if (effectSource.schemaVersion !== 1)
              throw new RangeError(
                `${effectDescription} has unsupported schemaVersion`
              );
            if (
              typeof effectSource.kind !== "string" ||
              !passiveEffectKinds.has(
                effectSource.kind as CharacterSkillEffectKind
              )
            )
              throw new RangeError(`${effectDescription} has unknown kind`);
            const effectKind = effectSource.kind as CharacterSkillEffectKind;
            if (seenKinds.has(effectKind))
              throw new RangeError(
                `${description} rank ${rankIndex + 1} contains duplicate passive effect kind`
              );
            seenKinds.add(effectKind);
            const value = requireProfileUnsigned(
              effectSource.value,
              `${effectDescription} value`
            );
            if (value === 0)
              throw new RangeError(
                `${effectDescription} value must be positive`
              );
            return Object.freeze({ schemaVersion: 1, kind: effectKind, value });
          })
          .sort((left, right) => compareText(left.kind, right.kind));
        if (kind === "item_rank" && effects.length > 0)
          throw new RangeError(
            `${description} item rank cannot define character passive effects`
          );
        return Object.freeze(effects);
      });
      if (passiveEffectsByRank.length !== rankCosts.length)
        throw new RangeError(
          `${description} passiveEffectsByRank must match rankCosts length`
        );
      totalRecords +=
        1 +
        prerequisites.length +
        rankCosts.length +
        passiveEffectsByRank.length +
        passiveEffectsByRank.reduce(
          (total, effects) => total + effects.length,
          0
        );
      if (totalRecords > maximumProfileRecords)
        throw new RangeError(
          `purchased upgrade catalog cannot exceed ${maximumProfileRecords} total records`
        );
      const normalizedDefinition = Object.freeze({
        schemaVersion: 1,
        upgradeId,
        kind,
        ownerId,
        prerequisiteUpgradeIds: Object.freeze(prerequisites),
        rankCosts: Object.freeze(rankCosts),
        passiveEffectsByRank: Object.freeze(passiveEffectsByRank)
      });
      if (passiveEffectsIdentity(normalizedDefinition).length > 8_192)
        throw new RangeError(
          `${description} passive effect identity exceeds profile bound`
        );
      return normalizedDefinition;
    })
    .sort((left, right) => compareText(left.upgradeId, right.upgradeId));
  if (upgrades.length === 0)
    throw new RangeError("purchased upgrade catalog must not be empty");

  const byId = new Map(upgrades.map((upgrade) => [upgrade.upgradeId, upgrade]));
  const indegree = new Map(
    upgrades.map((upgrade) => [
      upgrade.upgradeId,
      upgrade.prerequisiteUpgradeIds.length
    ])
  );
  const dependents = new Map<StableId, StableId[]>();
  for (const upgrade of upgrades) {
    for (const prerequisiteId of upgrade.prerequisiteUpgradeIds) {
      if (!byId.has(prerequisiteId))
        throw new RangeError(
          `purchased upgrade has unknown prerequisite (${upgrade.upgradeId} -> ${prerequisiteId})`
        );
      const entries = dependents.get(prerequisiteId) ?? [];
      entries.push(upgrade.upgradeId);
      dependents.set(prerequisiteId, entries);
    }
  }
  const ready = upgrades
    .filter((upgrade) => indegree.get(upgrade.upgradeId) === 0)
    .map((upgrade) => upgrade.upgradeId);
  let visited = 0;
  for (let index = 0; index < ready.length; index += 1) {
    const upgradeId = ready[index];
    if (upgradeId === undefined)
      throw new Error("unreachable ready purchased upgrade");
    visited += 1;
    for (const dependentId of dependents.get(upgradeId) ?? []) {
      const remaining = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, remaining);
      if (remaining === 0) ready.push(dependentId);
    }
  }
  if (visited !== upgrades.length)
    throw new RangeError("purchased upgrade prerequisites must be acyclic");
  return Object.freeze({ schemaVersion: 1, upgrades: Object.freeze(upgrades) });
}

function expectedSpend(
  definition: PurchasedUpgradeDefinition,
  rank: number
): number {
  let total = 0;
  for (let index = 0; index < rank; index += 1) {
    const cost = definition.rankCosts[index];
    if (cost === undefined)
      throw new RangeError(
        `purchased upgrade rank exceeds authored maximum (${definition.upgradeId})`
      );
    total = addSafe(total, cost, "purchased upgrade cumulative spend");
  }
  return total;
}

function validatePurchases(
  profile: ProfileState,
  catalog: PurchasedUpgradeCatalog,
  requirePassiveEffectsIdentity = false
): ReadonlyMap<StableId, PurchasedUpgrade> {
  const definitions = new Map(
    catalog.upgrades.map((upgrade) => [upgrade.upgradeId, upgrade])
  );
  const purchased = new Map(
    profile.purchasedUpgrades.map((upgrade) => [upgrade.upgradeId, upgrade])
  );
  for (const purchase of profile.purchasedUpgrades) {
    const definition = definitions.get(purchase.upgradeId);
    if (definition === undefined)
      throw new RangeError(
        `profile purchased upgrade is not authored (${purchase.upgradeId})`
      );
    if (purchase.forgeOreSpent !== expectedSpend(definition, purchase.rank))
      throw new RangeError(
        `profile purchased upgrade spend does not match authored costs (${purchase.upgradeId})`
      );
    if (
      requirePassiveEffectsIdentity &&
      purchase.passiveEffectsIdentity !== passiveEffectsIdentity(definition)
    )
      throw new RangeError(
        `profile purchased upgrade passive effects do not match authored catalog (${purchase.upgradeId})`
      );
    const ownerIds =
      definition.kind === "ability_rank"
        ? profile.unlockedCharacterIds
        : profile.unlockedItemIds;
    if (!ownerIds.includes(definition.ownerId))
      throw new RangeError(
        `profile purchased upgrade owner is not unlocked (${definition.ownerId})`
      );
    if (
      definition.prerequisiteUpgradeIds.some(
        (prerequisiteId) => !purchased.has(prerequisiteId)
      )
    )
      throw new RangeError(
        `profile purchased upgrade has an unpurchased prerequisite (${purchase.upgradeId})`
      );
  }
  return purchased;
}

/** Validates persisted purchases against their authored catalog without mutation. */
export function validatePurchasedUpgradeProfile(
  request: PurchasedUpgradeValidationRequest
): ProfileState {
  const source = requireProfileRecord(
    request,
    ["schemaVersion", "profile", "catalog"],
    "purchased upgrade validation request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "purchased upgrade validation request has unsupported schemaVersion"
    );
  const profile = normalizeProfileState(source.profile);
  validatePurchases(profile, normalizeCatalog(source.catalog));
  return profile;
}

/** Derives absolute character modifiers from catalog-validated purchased ranks. */
export function derivePurchasedUpgradeCharacterModifiers(
  request: PurchasedUpgradeValidationRequest
): readonly PurchasedUpgradeCharacterModifiers[] {
  const source = requireProfileRecord(
    request,
    ["schemaVersion", "profile", "catalog"],
    "purchased upgrade modifier request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "purchased upgrade modifier request has unsupported schemaVersion"
    );
  const profile = normalizeProfileState(source.profile);
  const catalog = normalizeCatalog(source.catalog);
  const purchases = validatePurchases(profile, catalog, true);
  const totals = new Map<
    StableId,
    {
      maximumHealthAdd: number;
      attackDamageAdd: number;
      attackRangeAdd: number;
      futureCooldownReductionTicks: number;
      sourceUpgradeIds: StableId[];
    }
  >();
  for (const definition of catalog.upgrades) {
    if (definition.kind !== "ability_rank") continue;
    const purchase = purchases.get(definition.upgradeId);
    if (purchase === undefined) continue;
    const total = totals.get(definition.ownerId) ?? {
      maximumHealthAdd: 0,
      attackDamageAdd: 0,
      attackRangeAdd: 0,
      futureCooldownReductionTicks: 0,
      sourceUpgradeIds: []
    };
    for (let rankIndex = 0; rankIndex < purchase.rank; rankIndex += 1) {
      const effects = definition.passiveEffectsByRank[rankIndex];
      if (effects === undefined)
        throw new RangeError(
          `purchased upgrade rank has no authored passive effects (${definition.upgradeId})`
        );
      for (const effect of effects) {
        const field =
          effect.kind === "maximum_health_add"
            ? "maximumHealthAdd"
            : effect.kind === "attack_damage_add"
              ? "attackDamageAdd"
              : effect.kind === "attack_range_add"
                ? "attackRangeAdd"
                : "futureCooldownReductionTicks";
        total[field] = addSafe(
          total[field],
          effect.value,
          `purchased upgrade ${field}`
        );
      }
    }
    total.sourceUpgradeIds.push(definition.upgradeId);
    totals.set(definition.ownerId, total);
  }
  return Object.freeze(
    [...totals.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([characterId, total]) =>
        Object.freeze({
          schemaVersion: 1,
          characterId,
          maximumHealthAdd: total.maximumHealthAdd,
          attackDamageAdd: total.attackDamageAdd,
          attackRangeAdd: total.attackRangeAdd,
          futureCooldownReductionTicks: total.futureCooldownReductionTicks,
          sourceUpgradeIds: Object.freeze([...total.sourceUpgradeIds])
        })
      )
  );
}

/** Purchases exactly the next authored rank with Forge Ore. */
export function purchaseUpgradeRank(
  request: ForgeOrePurchaseRequest
): ForgeOrePurchaseResolution {
  const source = requireProfileRecord(
    request,
    ["schemaVersion", "profile", "catalog", "upgradeId"],
    "Forge Ore purchase request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "Forge Ore purchase request has unsupported schemaVersion"
    );
  const profile = normalizeProfileState(source.profile);
  const catalog = normalizeCatalog(source.catalog);
  const upgradeId = requireProfileId(
    source.upgradeId,
    upgradeIdPattern,
    "Forge Ore purchase upgradeId"
  );
  const definition = catalog.upgrades.find(
    (upgrade) => upgrade.upgradeId === upgradeId
  );
  if (definition === undefined)
    throw new RangeError(`purchased upgrade is not authored (${upgradeId})`);
  const ownerIds =
    definition.kind === "ability_rank"
      ? profile.unlockedCharacterIds
      : profile.unlockedItemIds;
  if (!ownerIds.includes(definition.ownerId))
    throw new RangeError(
      `purchased upgrade owner is not unlocked (${definition.ownerId})`
    );
  const purchases = validatePurchases(profile, catalog);
  const existing = purchases.get(upgradeId);
  const previousRank = existing?.rank ?? 0;
  const cost = definition.rankCosts[previousRank];
  if (cost === undefined)
    throw new RangeError(
      `purchased upgrade is already at maximum rank (${upgradeId})`
    );
  for (const prerequisiteId of definition.prerequisiteUpgradeIds) {
    if (!purchases.has(prerequisiteId))
      throw new RangeError(
        `purchased upgrade prerequisite is not owned (${upgradeId} -> ${prerequisiteId})`
      );
  }
  if (profile.forgeOre < cost)
    throw new RangeError(
      `insufficient Forge Ore for purchased upgrade (${upgradeId})`
    );
  if (profile.revision === Number.MAX_SAFE_INTEGER)
    throw new RangeError("profile revision exceeds safe integer range");
  if (
    existing === undefined &&
    profile.purchasedUpgrades.length === maximumProfileRecords
  )
    throw new RangeError(
      `resolved purchasedUpgrades cannot exceed ${maximumProfileRecords} items`
    );
  const forgeOreSpent = addSafe(
    existing?.forgeOreSpent ?? 0,
    cost,
    "purchased upgrade cumulative spend"
  );
  const purchasedUpgrade = Object.freeze({
    schemaVersion: 1 as const,
    upgradeId,
    rank: previousRank + 1,
    forgeOreSpent,
    passiveEffectsIdentity: passiveEffectsIdentity(definition)
  });
  const purchasedUpgrades = Object.freeze(
    [
      ...profile.purchasedUpgrades.filter(
        (purchase) => purchase.upgradeId !== upgradeId
      ),
      purchasedUpgrade
    ].sort((left, right) => compareText(left.upgradeId, right.upgradeId))
  );
  const resolvedProfile: ProfileState = Object.freeze({
    ...profile,
    revision: profile.revision + 1,
    forgeOre: profile.forgeOre - cost,
    purchasedUpgrades
  });
  return Object.freeze({
    schemaVersion: 1,
    profile: resolvedProfile,
    decision: Object.freeze({
      schemaVersion: 1,
      upgradeId,
      kind: definition.kind,
      previousRank,
      purchasedRank: previousRank + 1,
      forgeOreSpent: cost,
      forgeOreRemaining: resolvedProfile.forgeOre,
      status: "purchased",
      reason: "upgrade_rank_purchased"
    })
  });
}
