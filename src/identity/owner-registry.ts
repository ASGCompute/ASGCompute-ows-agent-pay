/**
 * OwnerRegistry — Agent ↔ Owner binding with delegation levels.
 *
 * Implements the Validation Registry concept from ERC-8004,
 * linking AI agents to their human/organizational owners with
 * configurable delegation levels.
 *
 * Delegation levels:
 * - `full`        — Agent has full autonomy
 * - `supervised`  — Owner receives notifications
 * - `restricted`  — Owner must approve large transactions
 * - `readonly`    — Agent can only read, not transact
 *
 * @see ERC-8004 — Validation Registry
 */

import { AgentDID, DelegationLevel, OwnerRecord } from './types';

export class OwnerRegistry {
  /** In-memory registry (production: on-chain smart contract). */
  private records: Map<string, OwnerRecord> = new Map();
  /** Reverse index: owner → agents. */
  private ownerIndex: Map<string, Set<string>> = new Map();

  /**
   * Register an agent-owner binding.
   */
  register(
    agentDid: AgentDID,
    ownerAddress: string,
    delegationLevel: DelegationLevel = 'supervised',
    metadata?: Record<string, string>
  ): OwnerRecord {
    if (!agentDid || !ownerAddress) {
      throw new Error('Agent DID and owner address are required');
    }

    const record: OwnerRecord = {
      agentDid,
      ownerAddress,
      since: new Date(),
      delegationLevel,
      metadata,
    };

    this.records.set(agentDid, record);

    // Update reverse index
    if (!this.ownerIndex.has(ownerAddress)) {
      this.ownerIndex.set(ownerAddress, new Set());
    }
    this.ownerIndex.get(ownerAddress)!.add(agentDid);

    return record;
  }

  /**
   * Get the owner record for an agent.
   */
  getOwner(agentDid: AgentDID): OwnerRecord | null {
    return this.records.get(agentDid) ?? null;
  }

  /**
   * Get all agents owned by a specific address.
   */
  getAgentsByOwner(ownerAddress: string): OwnerRecord[] {
    const agentDids = this.ownerIndex.get(ownerAddress);
    if (!agentDids) return [];

    return Array.from(agentDids)
      .map((did) => this.records.get(did))
      .filter((r): r is OwnerRecord => r !== undefined);
  }

  /**
   * Check if an address owns a specific agent.
   */
  isOwner(agentDid: AgentDID, ownerAddress: string): boolean {
    const record = this.records.get(agentDid);
    return record?.ownerAddress === ownerAddress;
  }

  /**
   * Get the delegation level for an agent.
   */
  getDelegationLevel(agentDid: AgentDID): DelegationLevel | null {
    const record = this.records.get(agentDid);
    return record?.delegationLevel ?? null;
  }

  /**
   * Update the delegation level for an agent.
   * Only the current owner can do this (enforcement is caller's responsibility).
   */
  setDelegationLevel(agentDid: AgentDID, level: DelegationLevel): boolean {
    const record = this.records.get(agentDid);
    if (!record) return false;

    record.delegationLevel = level;
    return true;
  }

  /**
   * Transfer ownership of an agent to a new address.
   */
  transferOwnership(agentDid: AgentDID, newOwnerAddress: string): boolean {
    const record = this.records.get(agentDid);
    if (!record) return false;

    const oldOwner = record.ownerAddress;

    // Update reverse index
    this.ownerIndex.get(oldOwner)?.delete(agentDid);
    if (!this.ownerIndex.has(newOwnerAddress)) {
      this.ownerIndex.set(newOwnerAddress, new Set());
    }
    this.ownerIndex.get(newOwnerAddress)!.add(agentDid);

    // Update record
    record.ownerAddress = newOwnerAddress;
    record.since = new Date();

    return true;
  }

  /**
   * Remove an agent from the registry.
   */
  unregister(agentDid: AgentDID): boolean {
    const record = this.records.get(agentDid);
    if (!record) return false;

    this.ownerIndex.get(record.ownerAddress)?.delete(agentDid);
    this.records.delete(agentDid);
    return true;
  }

  /**
   * Check if an agent is allowed to perform an action based on delegation.
   */
  canTransact(agentDid: AgentDID): boolean {
    const level = this.getDelegationLevel(agentDid);
    return level !== null && level !== 'readonly';
  }

  /**
   * Check if an action requires owner approval.
   */
  requiresApproval(agentDid: AgentDID): boolean {
    const level = this.getDelegationLevel(agentDid);
    return level === 'restricted';
  }

  /**
   * Get the total number of registered agents.
   */
  getAgentCount(): number {
    return this.records.size;
  }
}
