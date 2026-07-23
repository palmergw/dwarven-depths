import type { StableId } from "@dwarven-depths/contracts";

export interface ProfileState {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly forgeOre: number;
  readonly unlockedCharacterIds: readonly StableId[];
  readonly claimedRewardIds: readonly StableId[];
}

export function createInitialProfile(ironWardenId: StableId): ProfileState {
  return {
    schemaVersion: 1,
    revision: 0,
    forgeOre: 0,
    unlockedCharacterIds: [ironWardenId],
    claimedRewardIds: []
  };
}
