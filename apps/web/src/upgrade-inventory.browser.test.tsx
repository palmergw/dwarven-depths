import type { StableId } from "@dwarven-depths/contracts";
import {
  createInitialProfile,
  type ProfileState
} from "@dwarven-depths/progression";
import {
  createProfileSaveEnvelope,
  type ProfileSaveEnvelope
} from "@dwarven-depths/save";
import type {
  IndexedDbProfileLoadResult,
  IndexedDbProfileWriteRequest
} from "@dwarven-depths/save/indexed-db";
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

async function readyStore(
  profile: ProfileState
): Promise<CheckpointProfileStore> {
  const envelope = await createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "upgrade-inventory-test",
    writtenAtEpochMs: 1_725_000_000_000,
    profileId: "profile.local",
    profile
  });
  return {
    load: async (): Promise<IndexedDbProfileLoadResult> => ({
      status: "loaded",
      source: "primary",
      envelope,
      migratedFromSchemaVersion: null
    }),
    write: async (
      _request: IndexedDbProfileWriteRequest
    ): Promise<ProfileSaveEnvelope> => {
      throw new Error("upgrade inventory must not write progression");
    },
    close: async () => undefined
  };
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

describe("checkpoint upgrade inventory", () => {
  it("presents canonical saved purchases and restores keyboard focus", async () => {
    const initial = createInitialProfile("character.iron_warden" as StableId);
    renderWithStore(
      await readyStore({
        ...initial,
        forgeOre: 19,
        purchasedUpgrades: [
          {
            schemaVersion: 1,
            upgradeId: "upgrade.ability.shield_slam" as StableId,
            rank: 2,
            forgeOreSpent: 11
          },
          {
            schemaVersion: 1,
            upgradeId: "upgrade.item.powder_cask" as StableId,
            rank: 1,
            forgeOreSpent: 7
          },
          {
            schemaVersion: 1,
            upgradeId: `upgrade.ability.${"a".repeat(300)}` as StableId,
            rank: 1,
            forgeOreSpent: 1
          }
        ]
      })
    );

    const openButton = await button("Upgrade inventory");
    openButton.focus();
    await userEvent.keyboard("{Enter}");

    const heading = await vi.waitFor(() => {
      const candidate = document.querySelector("#upgrade-inventory-heading");
      expect(candidate).toBeInstanceOf(HTMLHeadingElement);
      return candidate as HTMLHeadingElement;
    });
    expect(document.activeElement).toBe(heading);
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Available Forge Ore: 19"
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Shield Slam TrainingRank 2; 11 Forge Ore spent"
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Powder Cask ReinforcementRank 1; 7 Forge Ore spent"
    );

    await page.viewport(320, 720);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );
    const closeButton = await button("Close upgrade inventory");
    closeButton.focus();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        Array.from(document.querySelectorAll("button")).find(
          (entry) => entry.textContent === "Upgrade inventory"
        )
      )
    );
    expect(await button("Begin preparation")).toBeInstanceOf(HTMLButtonElement);
  });

  it("shows an explicit empty inventory through mouse input", async () => {
    renderWithStore(
      await readyStore(
        createInitialProfile("character.iron_warden" as StableId)
      )
    );

    await userEvent.click(await button("Upgrade inventory"));
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "No upgrades purchased."
    );
  });

  it("does not expose stale inventory when progression is unavailable", async () => {
    const unavailable: CheckpointProfileStore = {
      load: async () => {
        throw new Error("storage unavailable");
      },
      write: async () => {
        throw new Error("must not write");
      },
      close: async () => undefined
    };
    renderWithStore(unavailable);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "Local progression storage is unavailable."
      )
    );
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (entry) => entry.textContent === "Upgrade inventory"
      )
    ).toBe(false);
    expect(await button("Begin preparation")).toBeInstanceOf(HTMLButtonElement);
  });
});
