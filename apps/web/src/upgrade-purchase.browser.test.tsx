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
import type {
  IndexedDbProfileLoadResult,
  IndexedDbProfileWriteRequest
} from "@dwarven-depths/save/indexed-db";
import { IndexedDbProfileStoreError } from "@dwarven-depths/save/indexed-db";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { App } from "./App.js";
import type { CheckpointProfileStore } from "./checkpoint-profile.js";
import "./styles.css";

let root: Root | undefined;

afterEach(async () => {
  root?.unmount();
  root = undefined;
  document.body.replaceChildren();
  await page.viewport(1280, 720);
});

async function envelope(profile: ProfileState): Promise<ProfileSaveEnvelope> {
  return createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "upgrade-purchase-test",
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

function loadedStore(
  initial: ProfileSaveEnvelope,
  write: (request: IndexedDbProfileWriteRequest) => Promise<ProfileSaveEnvelope>
): CheckpointProfileStore {
  return {
    load: async (): Promise<IndexedDbProfileLoadResult> => ({
      status: "loaded",
      source: "primary",
      envelope: initial,
      migratedFromSchemaVersion: null
    }),
    write,
    close: async () => undefined
  };
}

describe("checkpoint upgrade purchasing", () => {
  it("focuses the changed upgrade after a keyboard purchase reaches maximum rank", async () => {
    const rankOne = purchaseUpgradeRank({
      schemaVersion: 1,
      profile: {
        ...createInitialProfile("character.iron_warden" as StableId),
        forgeOre: 35
      },
      catalog: purchasedUpgradeCatalog,
      upgradeId: "upgrade.ability.shield_slam" as StableId
    }).profile;
    const initial = await envelope(rankOne);
    const store = loadedStore(initial, async (request) =>
      Promise.resolve(request.envelope as ProfileSaveEnvelope)
    );
    renderWithStore(store);

    await userEvent.click(await button("Upgrade inventory"));
    const purchase = await button("Purchase rank 2 for 25 Forge Ore");
    expect(await button("Close upgrade inventory")).toHaveClass(
      "primary-action"
    );
    expect(purchase).not.toHaveClass("primary-action");
    purchase.focus();
    await userEvent.keyboard("{Enter}");

    const heading = document.getElementById(
      "upgrade-ability-shield_slam-heading"
    );
    await vi.waitFor(() => expect(heading).toHaveFocus());
    expect(await button("Maximum rank owned")).toBeDisabled();
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Rank 2 of 2"
    );
  });

  it("persists one keyboard purchase before updating confirmed progression", async () => {
    const initial = await envelope({
      ...createInitialProfile("character.iron_warden" as StableId),
      forgeOre: 40
    });
    let releaseWrite: ((value: ProfileSaveEnvelope) => void) | undefined;
    const writes: IndexedDbProfileWriteRequest[] = [];
    const store = loadedStore(initial, async (request) => {
      writes.push(request);
      return new Promise<ProfileSaveEnvelope>((resolve) => {
        releaseWrite = resolve;
      });
    });
    renderWithStore(store);

    await userEvent.click(await button("Upgrade inventory"));
    const purchase = await button("Purchase rank 1 for 10 Forge Ore");
    expect(purchase).toHaveAccessibleDescription(
      expect.stringContaining(
        "Rank 1 effects: +760 maximum health; +2 attack damage; +4 attack range."
      )
    );
    purchase.focus();
    await vi.waitFor(() => expect(purchase).toHaveFocus());
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.expectedRevision).toBe(initial.profile.revision);
    expect(await button("Saving purchase…")).toBeDisabled();
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Available Forge Ore: 40"
    );

    const written = writes[0]?.envelope as ProfileSaveEnvelope;
    releaseWrite?.(written);
    await vi.waitFor(() =>
      expect(document.querySelector(".upgrades")?.textContent).toContain(
        "Available Forge Ore: 30"
      )
    );
    expect(written.profile.purchasedUpgrades).toMatchObject([
      {
        upgradeId: "upgrade.ability.shield_slam",
        rank: 1,
        forgeOreSpent: 10
      }
    ]);
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Rank 1: +760 maximum health; +2 attack damage; +4 attack range."
    );
    expect(
      await button("Purchase rank 2 for 25 Forge Ore")
    ).toHaveAccessibleDescription(
      expect.stringContaining("Rank 2 effects: +30 maximum health.")
    );
    expect(document.querySelector(".purchase-success")?.textContent).toContain(
      "rank purchased"
    );
    expect(writes).toHaveLength(1);
  });

  it("keeps confirmed progression after a mouse purchase storage failure", async () => {
    const initial = await envelope({
      ...createInitialProfile("character.iron_warden" as StableId),
      forgeOre: 10
    });
    const store = loadedStore(initial, async () => {
      throw new Error("storage unavailable");
    });
    renderWithStore(store);

    await userEvent.click(await button("Upgrade inventory"));
    expect(await button("Purchase rank 1 for 10 Forge Ore")).toBeEnabled();
    const lockedItem = await vi.waitFor(() => {
      const candidate = document.querySelector(
        '[aria-describedby^="upgrade-item-powder_cask-purchase-status"]'
      );
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      return candidate as HTMLButtonElement;
    });
    expect(lockedItem).toBeDisabled();
    expect(
      document.getElementById("upgrade-item-powder_cask-purchase-status")
    ).toHaveTextContent("Requires Powder Cask.");

    await userEvent.click(await button("Purchase rank 1 for 10 Forge Ore"));
    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-failure")?.textContent
      ).toContain("last confirmed progression is unchanged")
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Available Forge Ore: 10"
    );
    expect(await button("Purchase rank 1 for 10 Forge Ore")).toBeEnabled();

    await page.viewport(320, 720);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );
  });

  it("reloads a conflicting canonical save before allowing a retry", async () => {
    const initial = await envelope({
      ...createInitialProfile("character.iron_warden" as StableId),
      forgeOre: 40
    });
    const concurrent = await envelope(
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: initial.profile,
        catalog: purchasedUpgradeCatalog,
        upgradeId: "upgrade.ability.shield_slam" as StableId
      }).profile
    );
    let current = initial;
    const expectedRevisions: (number | null)[] = [];
    const store: CheckpointProfileStore = {
      load: async (): Promise<IndexedDbProfileLoadResult> => ({
        status: "loaded",
        source: "primary",
        envelope: current,
        migratedFromSchemaVersion: null
      }),
      write: async (request) => {
        expectedRevisions.push(request.expectedRevision);
        if (expectedRevisions.length === 1) {
          current = concurrent;
          throw new IndexedDbProfileStoreError(
            "save_conflict",
            "concurrent profile revision"
          );
        }
        current = request.envelope as ProfileSaveEnvelope;
        return current;
      },
      close: async () => undefined
    };
    renderWithStore(store);

    await userEvent.click(await button("Upgrade inventory"));
    await userEvent.click(await button("Purchase rank 1 for 10 Forge Ore"));
    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-failure")?.textContent
      ).toContain("latest saved progression is loaded")
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Available Forge Ore: 30"
    );

    await userEvent.click(await button("Purchase rank 2 for 25 Forge Ore"));
    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-success")?.textContent
      ).toContain("5 Forge Ore remains")
    );
    expect(expectedRevisions).toEqual([0, 1]);
  });
});
