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

function purchasedProfile(): ProfileState {
  return purchaseUpgradeRank({
    schemaVersion: 1,
    profile: {
      ...createInitialProfile("character.iron_warden" as StableId),
      forgeOre: 40
    },
    catalog: purchasedUpgradeCatalog,
    upgradeId: "upgrade.ability.shield_slam" as StableId
  }).profile;
}

async function envelope(profile: ProfileState): Promise<ProfileSaveEnvelope> {
  return createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "upgrade-recycle-test",
    writtenAtEpochMs: 1_725_000_000_000,
    profileId: "profile.local",
    profile
  });
}

function storeWith(
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

describe("checkpoint shared-upgrade recycle", () => {
  it("confirms a keyboard recycle once and publishes only the written profile", async () => {
    const initial = await envelope(purchasedProfile());
    const writes: IndexedDbProfileWriteRequest[] = [];
    let releaseWrite: ((value: ProfileSaveEnvelope) => void) | undefined;
    renderWithStore(
      storeWith(initial, async (request) => {
        writes.push(request);
        return new Promise<ProfileSaveEnvelope>((resolve) => {
          releaseWrite = resolve;
        });
      })
    );

    await userEvent.click(await button("Upgrade inventory"));
    await userEvent.click(await button("Recycle all shared upgrades"));
    const heading = document.getElementById("recycle-confirmation-heading");
    expect(heading).toHaveFocus();
    expect(heading?.parentElement?.textContent).toContain(
      "refunds exactly 10 Forge Ore"
    );
    const confirm = await button("Confirm recycle");
    confirm.focus();
    await vi.waitFor(() => expect(confirm).toHaveFocus());
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.expectedRevision).toBe(initial.profile.revision);
    expect(await button("Saving recycle…")).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(
      document.getElementById("recycle-confirmation-heading")
    ).not.toBeNull();
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Available Forge Ore: 30"
    );
    const written = writes[0]?.envelope as ProfileSaveEnvelope;
    expect(written.profile.forgeOre).toBe(40);
    expect(written.profile.purchasedUpgrades).toEqual([]);
    releaseWrite?.(written);

    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-success")?.textContent
      ).toContain("40 Forge Ore is now available")
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "No upgrades purchased"
    );
    expect(writes).toHaveLength(1);
  });

  it("unwinds confirmation and inventory by Escape without changing progression", async () => {
    const initial = await envelope(purchasedProfile());
    const writes: IndexedDbProfileWriteRequest[] = [];
    renderWithStore(
      storeWith(initial, async (request): Promise<ProfileSaveEnvelope> => {
        writes.push(request);
        return request.envelope as ProfileSaveEnvelope;
      })
    );

    await userEvent.click(await button("Upgrade inventory"));
    await userEvent.click(await button("Recycle all shared upgrades"));
    const confirmation = document
      .querySelector("#recycle-confirmation-heading")
      ?.closest('[role="dialog"]');
    expect(confirmation).toBeInstanceOf(HTMLElement);
    expect(confirmation?.getAttribute("aria-modal")).toBe("true");

    await userEvent.keyboard("{Tab}");
    expect(await button("Confirm recycle")).toHaveFocus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(await button("Cancel recycle")).toHaveFocus();
    await userEvent.keyboard("{Tab}");
    expect(await button("Confirm recycle")).toHaveFocus();
    expect(confirmation?.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard("{Escape}");
    expect(await button("Recycle all shared upgrades")).toHaveFocus();
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Available Forge Ore: 30"
    );

    await userEvent.keyboard("{Escape}");
    expect(await button("Upgrade inventory")).toHaveFocus();
    expect(document.querySelector(".upgrades")).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("restores cancel focus and preserves confirmed progression on write failure", async () => {
    const initial = await envelope(purchasedProfile());
    renderWithStore(
      storeWith(initial, async () => {
        throw new Error("storage unavailable");
      })
    );

    await userEvent.click(await button("Upgrade inventory"));
    await userEvent.click(await button("Recycle all shared upgrades"));
    await userEvent.click(await button("Cancel recycle"));
    expect(await button("Recycle all shared upgrades")).toHaveFocus();

    await userEvent.click(await button("Recycle all shared upgrades"));
    await userEvent.click(await button("Confirm recycle"));
    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-failure")?.textContent
      ).toContain("last confirmed progression is unchanged")
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Available Forge Ore: 30"
    );
    expect(await button("Confirm recycle")).toBeEnabled();

    await page.viewport(320, 720);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );
  });
});
