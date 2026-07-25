import type { StableId } from "@dwarven-depths/contracts";
import {
  characterIdPattern,
  compareText,
  maximumProfileRecords,
  normalizeProfileState,
  type ProfileState,
  requireProfileArray,
  requireProfileId,
  requireProfileRecord,
  requireProfileUnsigned,
  skillNodeIdPattern
} from "./profile-state.js";

export type CharacterSkillEffectKind =
  | "maximum_health_add"
  | "attack_damage_add"
  | "attack_range_add"
  | "future_cooldown_reduction_ticks";

export interface CharacterSkillEffect {
  readonly schemaVersion: 1;
  readonly kind: CharacterSkillEffectKind;
  readonly value: number;
}

export interface CharacterSkillNodeDefinition {
  readonly schemaVersion: 1;
  readonly nodeId: StableId;
  readonly prerequisiteNodeIds: readonly StableId[];
  readonly effects: readonly CharacterSkillEffect[];
}

export interface CharacterSkillTreeDefinition {
  readonly schemaVersion: 1;
  readonly characterId: StableId;
  readonly nodes: readonly CharacterSkillNodeDefinition[];
}

export interface CharacterSkillEligibilityRequest {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly tree: CharacterSkillTreeDefinition;
}

export interface CharacterSkillEligibility {
  readonly schemaVersion: 1;
  readonly characterId: StableId;
  readonly pendingSkillPointLevel: number | null;
  readonly eligibleNodeIds: readonly StableId[];
}

export interface CharacterSkillChoiceRequest {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly tree: CharacterSkillTreeDefinition;
  readonly nodeId: StableId;
}

export interface CharacterSkillChoiceDecision {
  readonly schemaVersion: 1;
  readonly characterId: StableId;
  readonly nodeId: StableId;
  readonly spentSkillPointLevel: number;
  readonly status: "selected";
  readonly reason: "eligible_skill_node_selected";
}

export interface CharacterSkillChoiceResolution {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly decision: CharacterSkillChoiceDecision;
  readonly modifiers: CharacterSkillModifiers;
}

export interface CharacterSkillModifiers {
  readonly schemaVersion: 1;
  readonly characterId: StableId;
  readonly maximumHealthAdd: number;
  readonly attackDamageAdd: number;
  readonly attackRangeAdd: number;
  readonly futureCooldownReductionTicks: number;
  readonly sourceNodeIds: readonly StableId[];
}

const effectKinds = new Set<CharacterSkillEffectKind>([
  "maximum_health_add",
  "attack_damage_add",
  "attack_range_add",
  "future_cooldown_reduction_ticks"
]);

function normalizeTree(value: unknown): CharacterSkillTreeDefinition {
  const source = requireProfileRecord(
    value,
    ["schemaVersion", "characterId", "nodes"],
    "character skill tree"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError("character skill tree has unsupported schemaVersion");
  const characterId = requireProfileId(
    source.characterId,
    characterIdPattern,
    "character skill tree characterId"
  );
  const seenNodeIds = new Set<StableId>();
  const nodes = requireProfileArray(source.nodes, "character skill tree nodes")
    .map((entry, index): CharacterSkillNodeDefinition => {
      const description = `character skill tree node ${index}`;
      const nodeSource = requireProfileRecord(
        entry,
        ["schemaVersion", "nodeId", "prerequisiteNodeIds", "effects"],
        description
      );
      if (nodeSource.schemaVersion !== 1)
        throw new RangeError(`${description} has unsupported schemaVersion`);
      const nodeId = requireProfileId(
        nodeSource.nodeId,
        skillNodeIdPattern,
        `${description} nodeId`
      );
      if (seenNodeIds.has(nodeId))
        throw new RangeError(`duplicate character skill node ID (${nodeId})`);
      seenNodeIds.add(nodeId);
      const prerequisiteNodeIds = requireProfileArray(
        nodeSource.prerequisiteNodeIds,
        `${description} prerequisiteNodeIds`
      )
        .map((prerequisite, prerequisiteIndex) =>
          requireProfileId(
            prerequisite,
            skillNodeIdPattern,
            `${description} prerequisiteNodeIds[${prerequisiteIndex}]`
          )
        )
        .sort(compareText);
      if (new Set(prerequisiteNodeIds).size !== prerequisiteNodeIds.length)
        throw new RangeError(`${description} contains duplicate prerequisites`);
      if (prerequisiteNodeIds.includes(nodeId))
        throw new RangeError(`${description} cannot require itself`);
      const seenKinds = new Set<CharacterSkillEffectKind>();
      const effects = requireProfileArray(
        nodeSource.effects,
        `${description} effects`
      )
        .map((effect, effectIndex): CharacterSkillEffect => {
          const effectDescription = `${description} effect ${effectIndex}`;
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
            !effectKinds.has(effectSource.kind as CharacterSkillEffectKind)
          )
            throw new RangeError(`${effectDescription} has unknown kind`);
          const kind = effectSource.kind as CharacterSkillEffectKind;
          if (seenKinds.has(kind))
            throw new RangeError(
              `${description} contains duplicate effect kind`
            );
          seenKinds.add(kind);
          const effectValue = requireProfileUnsigned(
            effectSource.value,
            `${effectDescription} value`
          );
          if (effectValue === 0)
            throw new RangeError(`${effectDescription} value must be positive`);
          return Object.freeze({
            schemaVersion: 1,
            kind,
            value: effectValue
          });
        })
        .sort((left, right) => compareText(left.kind, right.kind));
      if (effects.length === 0)
        throw new RangeError(`${description} must contain at least one effect`);
      return Object.freeze({
        schemaVersion: 1,
        nodeId,
        prerequisiteNodeIds: Object.freeze(prerequisiteNodeIds),
        effects: Object.freeze(effects)
      });
    })
    .sort((left, right) => compareText(left.nodeId, right.nodeId));
  if (nodes.length === 0)
    throw new RangeError("character skill tree must contain at least one node");
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  for (const node of nodes) {
    for (const prerequisiteId of node.prerequisiteNodeIds) {
      if (!nodeById.has(prerequisiteId))
        throw new RangeError(
          `character skill node has unknown prerequisite (${node.nodeId} -> ${prerequisiteId})`
        );
    }
  }
  const visiting = new Set<StableId>();
  const visited = new Set<StableId>();
  const visit = (nodeId: StableId): void => {
    if (visiting.has(nodeId))
      throw new RangeError(
        "character skill tree prerequisites must be acyclic"
      );
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    const node = nodeById.get(nodeId);
    if (node === undefined) throw new Error("unreachable authored skill node");
    for (const prerequisiteId of node.prerequisiteNodeIds)
      visit(prerequisiteId);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) visit(node.nodeId);
  return Object.freeze({
    schemaVersion: 1,
    characterId,
    nodes: Object.freeze(nodes)
  });
}

function validateCharacterSelection(
  profile: ProfileState,
  tree: CharacterSkillTreeDefinition
): {
  readonly selectedIds: ReadonlySet<StableId>;
  readonly pendingLevels: readonly number[];
} {
  if (!profile.unlockedCharacterIds.includes(tree.characterId))
    throw new RangeError(
      `character skill tree owner is not unlocked (${tree.characterId})`
    );
  const experienceState = profile.characterExperienceStates.find(
    (state) => state.characterId === tree.characterId
  );
  if (experienceState === undefined)
    throw new RangeError(
      `character skill tree owner has no progression state (${tree.characterId})`
    );
  const selected = profile.selectedSkillNodes.filter(
    (entry) => entry.characterId === tree.characterId
  );
  const nodeById = new Map(tree.nodes.map((node) => [node.nodeId, node]));
  const selectedIds = new Set(selected.map((entry) => entry.nodeId));
  for (const entry of selected) {
    const node = nodeById.get(entry.nodeId);
    if (node === undefined)
      throw new RangeError(
        `selected skill node is not authored for character (${entry.nodeId})`
      );
    if (
      node.prerequisiteNodeIds.some(
        (prerequisiteId) => !selectedIds.has(prerequisiteId)
      )
    )
      throw new RangeError(
        `selected skill node has an unselected prerequisite (${entry.nodeId})`
      );
  }
  return {
    selectedIds,
    pendingLevels: experienceState.pendingSkillPointLevels
  };
}

function eligibilityFromNormalized(
  profile: ProfileState,
  tree: CharacterSkillTreeDefinition
): CharacterSkillEligibility {
  const { selectedIds, pendingLevels } = validateCharacterSelection(
    profile,
    tree
  );
  const eligibleNodeIds =
    pendingLevels.length === 0
      ? []
      : tree.nodes
          .filter(
            (node) =>
              !selectedIds.has(node.nodeId) &&
              node.prerequisiteNodeIds.every((prerequisiteId) =>
                selectedIds.has(prerequisiteId)
              )
          )
          .map((node) => node.nodeId);
  return Object.freeze({
    schemaVersion: 1,
    characterId: tree.characterId,
    pendingSkillPointLevel: pendingLevels[0] ?? null,
    eligibleNodeIds: Object.freeze(eligibleNodeIds)
  });
}

export function deriveCharacterSkillEligibility(
  request: CharacterSkillEligibilityRequest
): CharacterSkillEligibility {
  const source = requireProfileRecord(
    request,
    ["schemaVersion", "profile", "tree"],
    "character skill eligibility request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "character skill eligibility request has unsupported schemaVersion"
    );
  return eligibilityFromNormalized(
    normalizeProfileState(source.profile),
    normalizeTree(source.tree)
  );
}

function addSafe(total: number, value: number, description: string): number {
  const result = total + value;
  if (!Number.isSafeInteger(result))
    throw new RangeError(`${description} exceeds safe integer range`);
  return result;
}

function modifiersFromNormalized(
  profile: ProfileState,
  tree: CharacterSkillTreeDefinition
): CharacterSkillModifiers {
  const { selectedIds } = validateCharacterSelection(profile, tree);
  let maximumHealthAdd = 0;
  let attackDamageAdd = 0;
  let attackRangeAdd = 0;
  let futureCooldownReductionTicks = 0;
  const sourceNodeIds: StableId[] = [];
  for (const node of tree.nodes) {
    if (!selectedIds.has(node.nodeId)) continue;
    sourceNodeIds.push(node.nodeId);
    for (const effect of node.effects) {
      if (effect.kind === "maximum_health_add")
        maximumHealthAdd = addSafe(
          maximumHealthAdd,
          effect.value,
          "maximum-health skill modifier"
        );
      else if (effect.kind === "attack_damage_add")
        attackDamageAdd = addSafe(
          attackDamageAdd,
          effect.value,
          "attack-damage skill modifier"
        );
      else if (effect.kind === "attack_range_add")
        attackRangeAdd = addSafe(
          attackRangeAdd,
          effect.value,
          "attack-range skill modifier"
        );
      else
        futureCooldownReductionTicks = addSafe(
          futureCooldownReductionTicks,
          effect.value,
          "future-cooldown skill modifier"
        );
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    characterId: tree.characterId,
    maximumHealthAdd,
    attackDamageAdd,
    attackRangeAdd,
    futureCooldownReductionTicks,
    sourceNodeIds: Object.freeze(sourceNodeIds)
  });
}

export function deriveCharacterSkillModifiers(
  request: CharacterSkillEligibilityRequest
): CharacterSkillModifiers {
  const source = requireProfileRecord(
    request,
    ["schemaVersion", "profile", "tree"],
    "character skill modifiers request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "character skill modifiers request has unsupported schemaVersion"
    );
  return modifiersFromNormalized(
    normalizeProfileState(source.profile),
    normalizeTree(source.tree)
  );
}

export function selectCharacterSkillNode(
  request: CharacterSkillChoiceRequest
): CharacterSkillChoiceResolution {
  const source = requireProfileRecord(
    request,
    ["schemaVersion", "profile", "tree", "nodeId"],
    "character skill choice request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "character skill choice request has unsupported schemaVersion"
    );
  const profile = normalizeProfileState(source.profile);
  const tree = normalizeTree(source.tree);
  const nodeId = requireProfileId(
    source.nodeId,
    skillNodeIdPattern,
    "character skill choice nodeId"
  );
  const eligibility = eligibilityFromNormalized(profile, tree);
  const selectedIds = new Set(
    profile.selectedSkillNodes.map((entry) => entry.nodeId)
  );
  if (selectedIds.has(nodeId))
    throw new RangeError(
      `character skill node is already selected (${nodeId})`
    );
  if (!tree.nodes.some((node) => node.nodeId === nodeId))
    throw new RangeError(`character skill node is not authored (${nodeId})`);
  const spentSkillPointLevel = eligibility.pendingSkillPointLevel;
  if (spentSkillPointLevel === null)
    throw new RangeError(
      `character has no pending skill point (${tree.characterId})`
    );
  if (!eligibility.eligibleNodeIds.includes(nodeId))
    throw new RangeError(`character skill node is not eligible (${nodeId})`);
  if (profile.selectedSkillNodes.length === maximumProfileRecords)
    throw new RangeError(
      `resolved selectedSkillNodes cannot exceed ${maximumProfileRecords} items`
    );
  if (profile.revision === Number.MAX_SAFE_INTEGER)
    throw new RangeError("profile revision exceeds safe integer range");
  const characterExperienceStates = profile.characterExperienceStates.map(
    (state) =>
      state.characterId === tree.characterId
        ? Object.freeze({
            ...state,
            pendingSkillPointLevels: Object.freeze(
              state.pendingSkillPointLevels.slice(1)
            )
          })
        : state
  );
  const selectedSkillNodes = Object.freeze(
    [
      ...profile.selectedSkillNodes,
      Object.freeze({
        schemaVersion: 1 as const,
        characterId: tree.characterId,
        nodeId,
        spentSkillPointLevel
      })
    ].sort(
      (left, right) =>
        compareText(left.characterId, right.characterId) ||
        left.spentSkillPointLevel - right.spentSkillPointLevel ||
        compareText(left.nodeId, right.nodeId)
    )
  );
  const resolvedProfile: ProfileState = Object.freeze({
    ...profile,
    revision: profile.revision + 1,
    characterExperienceStates: Object.freeze(characterExperienceStates),
    selectedSkillNodes
  });
  const decision = Object.freeze({
    schemaVersion: 1 as const,
    characterId: tree.characterId,
    nodeId,
    spentSkillPointLevel,
    status: "selected" as const,
    reason: "eligible_skill_node_selected" as const
  });
  return Object.freeze({
    schemaVersion: 1,
    profile: resolvedProfile,
    decision,
    modifiers: modifiersFromNormalized(resolvedProfile, tree)
  });
}
