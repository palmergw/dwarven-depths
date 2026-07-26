import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldState,
  CommandEnvelope,
  DwarfActionPhaseEntry,
  EntityId,
  SetTargetPolicyCommand,
  TargetPolicyCommandDecision,
  TargetPolicyCommandReason,
  TargetPolicyCommandResolution
} from "@dwarven-depths/contracts";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function decision(
  sequence: number,
  command: SetTargetPolicyCommand,
  status: TargetPolicyCommandDecision["status"],
  reason: TargetPolicyCommandReason
): TargetPolicyCommandDecision {
  return Object.freeze({
    schemaVersion: 1,
    sequence,
    dwarfEntityId: command.dwarfEntityId,
    requestedPolicy: command.requestedPolicy,
    status,
    reason
  });
}

/**
 * Reduces one simulation tick's semantic target-policy commands into the
 * stable action entries consumed by authoritative dwarf target acquisition.
 */
export function resolveTargetPolicyCommands(
  currentTick: number,
  battlefield: BattlefieldState,
  currentEntries: readonly DwarfActionPhaseEntry[],
  envelopes: readonly CommandEnvelope[],
  content: CompiledContent
): TargetPolicyCommandResolution {
  if (!Number.isSafeInteger(currentTick) || currentTick < 0)
    throw new RangeError("target-policy command tick must be non-negative");

  const entries = new Map<EntityId, DwarfActionPhaseEntry>();
  for (const entry of currentEntries) {
    if (entries.has(entry.dwarfEntityId))
      throw new RangeError(
        `duplicate target-policy action entry (${entry.dwarfEntityId})`
      );
    entries.set(entry.dwarfEntityId, Object.freeze({ ...entry }));
  }

  const commands = envelopes
    .filter(
      (
        envelope
      ): envelope is CommandEnvelope & {
        readonly command: SetTargetPolicyCommand;
      } => envelope.command.type === "setTargetPolicy"
    )
    .sort((left, right) => left.sequence - right.sequence);
  if (
    new Set(commands.map(({ sequence }) => sequence)).size !== commands.length
  )
    throw new RangeError("duplicate target-policy command sequence");

  const decisions: TargetPolicyCommandDecision[] = [];
  const commandedDwarves = new Set<EntityId>();
  for (const envelope of commands) {
    if (
      envelope.tick !== currentTick ||
      envelope.command.atTick !== currentTick ||
      !Number.isSafeInteger(envelope.sequence) ||
      envelope.sequence < 0
    )
      throw new RangeError(
        "target-policy command envelope does not match its tick"
      );

    const command = envelope.command;
    if (commandedDwarves.has(command.dwarfEntityId)) {
      decisions.push(
        decision(
          envelope.sequence,
          command,
          "rejected",
          "duplicate_dwarf_command"
        )
      );
      continue;
    }
    commandedDwarves.add(command.dwarfEntityId);

    const dwarf = battlefield.dwarfCombatants.find(
      ({ entityId }) => entityId === command.dwarfEntityId
    );
    if (dwarf === undefined) {
      decisions.push(
        decision(envelope.sequence, command, "rejected", "dwarf_unavailable")
      );
      continue;
    }
    if (dwarf.lifecycleState === "downed") {
      decisions.push(
        decision(envelope.sequence, command, "rejected", "dwarf_downed")
      );
      continue;
    }
    const currentEntry = entries.get(command.dwarfEntityId);
    if (currentEntry === undefined) {
      decisions.push(
        decision(envelope.sequence, command, "rejected", "dwarf_unavailable")
      );
      continue;
    }
    const character = content.characters.get(dwarf.characterDefinitionId);
    if (
      character === undefined ||
      !character.supportedTargetPolicies.includes(command.requestedPolicy)
    ) {
      decisions.push(
        decision(envelope.sequence, command, "rejected", "policy_unsupported")
      );
      continue;
    }

    entries.set(
      command.dwarfEntityId,
      Object.freeze({
        schemaVersion: 1,
        dwarfEntityId: command.dwarfEntityId,
        requestedPolicy: command.requestedPolicy
      })
    );
    decisions.push(
      decision(envelope.sequence, command, "accepted", "target_policy_changed")
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    entries: Object.freeze(
      [...entries.values()].sort((left, right) =>
        compareText(left.dwarfEntityId, right.dwarfEntityId)
      )
    ),
    decisions: Object.freeze(decisions)
  });
}
