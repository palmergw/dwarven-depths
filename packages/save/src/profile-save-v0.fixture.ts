export const historicalProfileSaveV0Fixture = Object.freeze({
  schemaVersion: 0,
  contentVersion: "content.shuttergate.v1",
  applicationBuild: "test-build-1",
  writtenAtEpochMs: 1_725_000_000_000,
  profileId: "profile.local",
  revision: 2,
  payloadChecksum:
    "23e02ae39215efaaeca351087f2ccb9756fb3bb098674586f0d589986f129935",
  profile: Object.freeze({
    schemaVersion: 1,
    revision: 2,
    forgeOre: 35,
    unlockedCharacterIds: Object.freeze(["character.iron_warden"]),
    unlockedItemIds: Object.freeze([]),
    claimedRewardIds: Object.freeze([]),
    characterExperienceStates: Object.freeze([
      Object.freeze({
        schemaVersion: 1,
        characterId: "character.iron_warden",
        experience: 0,
        level: 1,
        pendingSkillPointLevels: Object.freeze([])
      })
    ]),
    claimedExperienceRewardEvents: Object.freeze([]),
    selectedSkillNodes: Object.freeze([]),
    purchasedUpgrades: Object.freeze([])
  })
});
