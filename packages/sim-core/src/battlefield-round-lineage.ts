import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type { BattlefieldState, StableId } from "@dwarven-depths/contracts";

export interface BattlefieldRoundLineage {
  readonly content: CompiledContent;
  readonly levelId: StableId;
  readonly mapId: StableId;
  preparationClaimed: boolean;
}

const battlefieldLineages = new WeakMap<
  BattlefieldState,
  BattlefieldRoundLineage
>();
const battlefieldParents = new WeakMap<BattlefieldState, BattlefieldState>();

export function initializeBattlefieldRoundLineage(
  battlefield: BattlefieldState,
  content: CompiledContent,
  levelId: StableId
): void {
  if (battlefieldLineages.has(battlefield))
    throw new RangeError("battlefield round lineage is already initialized");
  battlefieldLineages.set(battlefield, {
    content,
    levelId,
    mapId: battlefield.mapId,
    preparationClaimed: false
  });
}

export function claimBattlefieldPreparationLineage(
  battlefield: BattlefieldState,
  content: CompiledContent
): BattlefieldRoundLineage {
  const lineage = battlefieldLineages.get(battlefield);
  if (lineage === undefined || lineage.content !== content)
    throw new RangeError(
      "dwarf deployments require an initialized preparation battlefield"
    );
  if (lineage.mapId !== battlefield.mapId)
    throw new RangeError("battlefield round lineage map does not match state");
  if (lineage.preparationClaimed)
    throw new RangeError(
      "battlefield preparation already accepted dwarf deployments"
    );
  lineage.preparationClaimed = true;
  return lineage;
}

export function requireBattlefieldRoundLineage(
  battlefield: BattlefieldState,
  content: CompiledContent,
  expected: BattlefieldRoundLineage
): void {
  const actual = battlefieldLineages.get(battlefield);
  if (actual !== expected || actual.content !== content)
    throw new RangeError(
      "battlefield does not belong to the accepted preparation round"
    );
  if (actual.mapId !== battlefield.mapId)
    throw new RangeError("battlefield round lineage map does not match state");
}

export function propagateBattlefieldRoundLineage(
  source: BattlefieldState,
  target: BattlefieldState
): void {
  const lineage = battlefieldLineages.get(source);
  if (lineage !== undefined) {
    const existing = battlefieldLineages.get(target);
    if (existing !== undefined) {
      if (existing !== lineage)
        throw new RangeError("battlefield already belongs to another round");
      return;
    }
    battlefieldLineages.set(target, lineage);
    battlefieldParents.set(target, source);
  }
}

export function getBattlefieldRoundParent(
  battlefield: BattlefieldState
): BattlefieldState | undefined {
  return battlefieldParents.get(battlefield);
}
