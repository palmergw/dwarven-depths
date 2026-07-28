import type { StableId } from "@dwarven-depths/contracts";
import {
  createInitialProfile,
  type ProfileState
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
import { userEvent } from "vitest/browser";
import { App } from "./App.js";
import type { CheckpointProfileStore } from "./checkpoint-profile.js";
import "./styles.css";

let root: Root | undefined;
const characterId = "character.iron_warden" as StableId;

function pendingProfile(): ProfileState {
  return {
    ...createInitialProfile(characterId),
    characterExperienceStates: [
      {
        schemaVersion: 1,
        characterId,
        experience: 260,
        level: 3,
        pendingSkillPointLevels: [2, 3]
      }
    ]
  };
}

function finalPendingProfile(): ProfileState {
  const profile = pendingProfile();
  const experience = profile.characterExperienceStates[0];
  if (experience === undefined) throw new Error("missing Iron Warden state");
  return {
    ...profile,
    characterExperienceStates: [
      { ...experience, level: 2, experience: 100, pendingSkillPointLevels: [2] }
    ]
  };
}

async function envelope(profile: ProfileState): Promise<ProfileSaveEnvelope> {
  return createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "skill-selection-test",
    writtenAtEpochMs: 1_725_000_000_000,
    profileId: "profile.local",
    profile
  });
}

function loaded(value: ProfileSaveEnvelope): IndexedDbProfileLoadResult {
  return {
    status: "loaded",
    source: "primary",
    envelope: value,
    migratedFromSchemaVersion: null
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

afterEach(() => {
  root?.unmount();
  root = undefined;
  document.body.replaceChildren();
});

describe("checkpoint Iron Warden skill selection", () => {
  it("persists authoritative keyboard choices and focuses the selected node", async () => {
    const initial = await envelope(pendingProfile());
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
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Pending skill point from level 2"
    );
    const select = await button("Select Stone Guard");
    expect(select).toHaveAccessibleDescription(
      "Effects: +25 maximum health; +3 attack damage. Prerequisites: none."
    );
    select.focus();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    (await button("Saving skill selection…")).click();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.expectedRevision).toBe(initial.profile.revision);
    const written = writes[0]?.envelope as ProfileSaveEnvelope;
    expect(written.profile.selectedSkillNodes).toEqual([
      {
        schemaVersion: 1,
        characterId,
        nodeId: "skill.iron_warden.stone_guard",
        spentSkillPointLevel: 2
      }
    ]);
    expect(
      written.profile.characterExperienceStates[0]?.pendingSkillPointLevels
    ).toEqual([3]);
    releaseWrite?.(written);

    await vi.waitFor(() =>
      expect(
        document.getElementById(
          "skill-iron_warden-stone_guard-selected-heading"
        )
      ).toHaveFocus()
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Pending skill point from level 3"
    );
    expect(await button("Select Long Reach")).toBeEnabled();
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Stone Guard selected at level 2. Effects: +25 maximum health; +3 attack damage. Prerequisites: none."
    );
    const second = await button("Select Long Reach");
    expect(second).toHaveAccessibleDescription(
      "Effects: +1 attack range. Prerequisites: Stone Guard."
    );
    await userEvent.click(second);
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    const secondWritten = writes[1]?.envelope as ProfileSaveEnvelope;
    releaseWrite?.(secondWritten);
    await vi.waitFor(() =>
      expect(document.querySelector(".upgrades")?.textContent).toContain(
        "Long Reach selected at level 3. Effects: +1 attack range. Prerequisites: Stone Guard."
      )
    );
  });

  it("focuses the selected node after spending the final skill point", async () => {
    const initial = await envelope(finalPendingProfile());
    renderWithStore({
      load: async () => loaded(initial),
      write: async (request) => request.envelope as ProfileSaveEnvelope,
      close: async () => undefined
    });

    await userEvent.click(await button("Upgrade inventory"));
    const select = await button("Select Stone Guard");
    select.focus();
    await userEvent.keyboard("{Enter}");

    const heading = await vi.waitFor(() => {
      const selectedHeading = document.getElementById(
        "skill-iron_warden-stone_guard-selected-heading"
      );
      expect(selectedHeading).toHaveFocus();
      return selectedHeading;
    });
    expect(heading?.parentElement?.textContent).toContain(
      "selected at level 2. Effects: +25 maximum health; +3 attack damage. Prerequisites: none."
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "No pending Iron Warden skill points."
    );
    expect(
      Array.from(document.querySelectorAll("button")).some((candidate) =>
        candidate.textContent?.startsWith("Select ")
      )
    ).toBe(false);
  });

  it("preserves confirmed progression when mouse selection cannot be saved", async () => {
    const initial = await envelope(pendingProfile());
    renderWithStore({
      load: async () => loaded(initial),
      write: async () => {
        throw new Error("storage unavailable");
      },
      close: async () => undefined
    });

    await userEvent.click(await button("Upgrade inventory"));
    await userEvent.click(await button("Select Stone Guard"));
    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-failure")?.textContent
      ).toContain("last confirmed progression is unchanged")
    );
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "No Iron Warden skills selected"
    );
    expect(await button("Select Stone Guard")).toBeEnabled();
  });

  it("loads a conflicting canonical profile before requiring a retry", async () => {
    const initial = await envelope(pendingProfile());
    const experience = initial.profile.characterExperienceStates[0];
    if (experience === undefined) throw new Error("missing Iron Warden state");
    const concurrent = await envelope({
      ...initial.profile,
      revision: initial.profile.revision + 1,
      characterExperienceStates: [
        { ...experience, pendingSkillPointLevels: [3] }
      ],
      selectedSkillNodes: [
        {
          schemaVersion: 1,
          characterId,
          nodeId: "skill.iron_warden.stone_guard" as StableId,
          spentSkillPointLevel: 2
        }
      ]
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
    const selectedElsewhere = await button("Select Stone Guard");
    selectedElsewhere.focus();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() =>
      expect(
        document.querySelector(".purchase-failure")?.textContent
      ).toContain("latest saved progression is loaded")
    );
    expect(document.getElementById("iron-warden-skills-heading")).toHaveFocus();
    expect(document.querySelector(".upgrades")?.textContent).toContain(
      "Stone Guard selected at level 2"
    );
    expect(await button("Select Disciplined Slam")).toBeEnabled();
  });
});
