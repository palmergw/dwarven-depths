import type { StableId } from "@dwarven-depths/contracts";
import {
  createInitialProfile,
  type ProfileState,
  purchasedUpgradeCatalog,
  purchaseUpgradeRank
} from "@dwarven-depths/progression";
import {
  createProfileSaveEnvelope,
  type ProfileSaveEnvelope
} from "@dwarven-depths/save";
import {
  type IndexedDbProfileLoadResult,
  IndexedDbProfileStoreError,
  type IndexedDbProfileWriteRequest
} from "@dwarven-depths/save/indexed-db";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { App } from "./App.js";
import type { CheckpointProfileStore } from "./checkpoint-profile.js";
import "./styles.css";

let root: Root | undefined;

const characterId = "character.iron_warden" as StableId;

afterEach(async () => {
  root?.unmount();
  root = undefined;
  document.body.replaceChildren();
  await page.viewport(1280, 720);
});

function skilledProfile(): ProfileState {
  const purchased = purchaseUpgradeRank({
    schemaVersion: 1,
    profile: { ...createInitialProfile(characterId), forgeOre: 40 },
    catalog: purchasedUpgradeCatalog,
    upgradeId: "upgrade.ability.shield_slam" as StableId
  }).profile;
  return {
    ...purchased,
    characterExperienceStates: [
      {
        schemaVersion: 1,
        characterId,
        experience: 260,
        level: 3,
        pendingSkillPointLevels: []
      }
    ],
    selectedSkillNodes: [
      {
        schemaVersion: 1,
        characterId,
        nodeId: "skill.iron_warden.stone_guard" as StableId,
        spentSkillPointLevel: 2
      },
      {
        schemaVersion: 1,
        characterId,
        nodeId: "skill.iron_warden.disciplined_slam" as StableId,
        spentSkillPointLevel: 3
      }
    ]
  };
}

async function envelope(profile: ProfileState): Promise<ProfileSaveEnvelope> {
  return createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "skill-recycle-test",
    writtenAtEpochMs: 1_725_000_000_000,
    profileId: "profile.local",
    profile
  });
}

function renderWithStore(store: CheckpointProfileStore): void {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(<App createProfileStore={() => store} />);
}

async function button(text: string): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const candidate = Array.from(document.querySelectorAll("button")).find(
      (entry) => entry.textContent === text
    );
    expect(candidate).toBeInstanceOf(HTMLButtonElement);
    return candidate as HTMLButtonElement;
  });
}

function loaded(envelope: ProfileSaveEnvelope): IndexedDbProfileLoadResult {
  return {
    status: "loaded",
    source: "primary",
    envelope,
    migratedFromSchemaVersion: null
  };
}

describe("checkpoint Iron Warden skill recycle", () => {
  it("confirms once by keyboard and publishes only the canonical written profile", async () => {
    const initial = await envelope(skilledProfile());
    const writes: IndexedDbProfileWriteRequest[] = [];
    let releaseWrite: ((value: ProfileSaveEnvelope) => void) | undefined;
    renderWithStore({
      load: async () => loaded(initial),
      write: async (request) => {
        writes.push(request);
        return new Promise<ProfileSaveEnvelope>((resolve) => {
          releaseWrite = resolve;
        });
      },
      close: async () => undefined
    });

    await userEvent.click(await button("Upgrade inventory"));
    await userEvent.click(await button("Recycle Iron Warden skill tree"));
    const heading = document.getElementById(
      "skill-recycle-confirmation-heading"
    );
    expect(heading).toHaveFocus();
    expect(heading?.parentElement?.textContent).toContain(
      "spent skill-point levels 2, 3"
    );
    expect(heading?.parentElement?.textContent).toContain(
      "Shared upgrades, Forge Ore"
    );
    expect(
      document.querySelectorAll('[role="dialog"][aria-modal="true"]')
    ).toHaveLength(1);
    const backgroundRecycle = await button("Recycle all shared upgrades");
    expect(backgroundRecycle.inert).toBe(true);
    await page
      .getByRole("button", { name: "Recycle all shared upgrades" })
      .click({ force: true });
    expect(document.getElementById("recycle-confirmation-heading")).toBeNull();

    const confirm = await button("Confirm skill recycle");
    confirm.focus();
    await vi.waitFor(() => expect(confirm).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    (await button("Saving skill recycle…")).click();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.expectedRevision).toBe(initial.profile.revision);

    const written = writes[0]?.envelope as ProfileSaveEnvelope;
    expect(written.profile.selectedSkillNodes).toEqual([]);
    expect(
      written.profile.characterExperienceStates[0]?.pendingSkillPointLevels
    ).toEqual([2, 3]);
    expect(written.profile.purchasedUpgrades).toEqual(
      initial.profile.purchasedUpgrades
    );
    expect(written.profile.forgeOre).toBe(initial.profile.forgeOre);
    releaseWrite?.(written);

    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-success")?.textContent
      ).toContain("Spent skill points are available again")
    );
    expect(document.querySelector(".upgrades")?.textContent).not.toContain(
      "Recycle Iron Warden skill tree"
    );
    expect(document.getElementById("iron-warden-skills-heading")).toHaveFocus();
  });

  it("restores cancel focus and preserves confirmed progression on failure", async () => {
    const initial = await envelope(skilledProfile());
    renderWithStore({
      load: async () => loaded(initial),
      write: async () => {
        throw new Error("storage unavailable");
      },
      close: async () => undefined
    });

    await userEvent.click(await button("Upgrade inventory"));
    await userEvent.click(await button("Recycle Iron Warden skill tree"));
    await userEvent.keyboard("{Escape}");
    expect(await button("Recycle Iron Warden skill tree")).toHaveFocus();
    expect((await button("Recycle all shared upgrades")).inert).toBe(false);
    expect(
      document.getElementById("skill-iron_warden-stone_guard-skill-node")
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(await button("Recycle Iron Warden skill tree"));
    await userEvent.click(await button("Confirm skill recycle"));
    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-failure")?.textContent
      ).toContain("last confirmed progression is unchanged")
    );
    expect(await button("Confirm skill recycle")).toBeEnabled();

    await page.viewport(320, 720);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );
  });

  it("reloads the latest confirmed profile after a save conflict", async () => {
    const initial = await envelope(skilledProfile());
    const experience = initial.profile.characterExperienceStates[0];
    if (experience === undefined) throw new Error("missing Iron Warden state");
    const concurrent = await envelope({
      ...initial.profile,
      revision: initial.profile.revision + 1,
      forgeOre: 77,
      characterExperienceStates: [
        {
          ...experience,
          pendingSkillPointLevels: [2, 3]
        }
      ],
      selectedSkillNodes: []
    });
    let current = initial;
    renderWithStore({
      load: async () => loaded(current),
      write: async () => {
        current = concurrent;
        throw new IndexedDbProfileStoreError(
          "save_conflict",
          "concurrent profile revision"
        );
      },
      close: async () => undefined
    });

    await userEvent.click(await button("Upgrade inventory"));
    await userEvent.click(await button("Recycle Iron Warden skill tree"));
    await userEvent.click(await button("Confirm skill recycle"));

    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-failure")?.textContent
      ).toContain("latest saved progression is loaded")
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Available Forge Ore: 77"
    );
    expect(document.querySelector(".upgrades")?.textContent).not.toContain(
      "Recycle Iron Warden skill tree"
    );
  });
});
