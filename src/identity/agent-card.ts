/**
 * AgentCard — Capability and metadata registry for AI agents.
 *
 * Implements the ERC-8004 Identity Registry concept: each agent has
 * a structured card describing its capabilities, service endpoints,
 * owner, and multi-chain addresses.
 *
 * AgentCards are portable — they can be serialized to JSON and stored
 * on IPFS, or registered on-chain as NFT metadata (ERC-721).
 *
 * @see ERC-8004 — Identity Registry (NFT-based agent IDs)
 * @see Google A2A Protocol — AgentCard discovery
 */

import { AgentCardData } from './types';

export class AgentCard {
  private data: AgentCardData;
  readonly createdAt: Date;
  private updatedAt: Date;

  constructor(data: AgentCardData) {
    this.validateCard(data);
    this.data = { ...data };
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // ═══ Getters ══════════════════════════════════════════════════════

  get name(): string { return this.data.name; }
  get version(): string { return this.data.version; }
  get description(): string | undefined { return this.data.description; }
  get capabilities(): string[] { return [...this.data.capabilities]; }
  get owner(): string { return this.data.owner; }
  get endpoints() { return this.data.endpoints ? { ...this.data.endpoints } : undefined; }
  get addresses() { return this.data.addresses ? [...this.data.addresses] : undefined; }
  get tags(): string[] { return this.data.tags ? [...this.data.tags] : []; }
  get iconUrl(): string | undefined { return this.data.iconUrl; }

  // ═══ Capability Checks ════════════════════════════════════════════

  /**
   * Check if this agent has a specific capability.
   */
  hasCapability(capability: string): boolean {
    return this.data.capabilities.includes(capability.toLowerCase());
  }

  /**
   * Check if this agent has ALL of the specified capabilities.
   */
  hasAllCapabilities(capabilities: string[]): boolean {
    return capabilities.every((c) => this.hasCapability(c));
  }

  /**
   * Check if this agent has ANY of the specified capabilities.
   */
  hasAnyCapability(capabilities: string[]): boolean {
    return capabilities.some((c) => this.hasCapability(c));
  }

  // ═══ Updates ══════════════════════════════════════════════════════

  /**
   * Add a capability to the agent card.
   */
  addCapability(capability: string): void {
    const lower = capability.toLowerCase();
    if (!this.data.capabilities.includes(lower)) {
      this.data.capabilities.push(lower);
      this.updatedAt = new Date();
    }
  }

  /**
   * Remove a capability from the agent card.
   */
  removeCapability(capability: string): boolean {
    const lower = capability.toLowerCase();
    const index = this.data.capabilities.indexOf(lower);
    if (index === -1) return false;

    this.data.capabilities.splice(index, 1);
    this.updatedAt = new Date();
    return true;
  }

  /**
   * Update a service endpoint.
   */
  setEndpoint(type: 'a2a' | 'mcp' | 'payment' | 'webhook', url: string): void {
    if (!this.data.endpoints) {
      this.data.endpoints = {};
    }
    this.data.endpoints[type] = url;
    this.updatedAt = new Date();
  }

  /**
   * Add a chain address to the agent card.
   */
  addAddress(chain: string, caip2Id: string, address: string): void {
    if (!this.data.addresses) {
      this.data.addresses = [];
    }

    // Don't add duplicates
    const exists = this.data.addresses.some(
      (a) => a.caip2Id === caip2Id && a.address === address
    );
    if (!exists) {
      this.data.addresses.push({ chain, caip2Id, address });
      this.updatedAt = new Date();
    }
  }

  // ═══ Serialization ════════════════════════════════════════════════

  /**
   * Serialize to JSON (for IPFS, on-chain storage, etc.)
   */
  toJSON(): AgentCardData & { createdAt: string; updatedAt: string } {
    return {
      ...this.data,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  /**
   * Create an AgentCard from JSON.
   */
  static fromJSON(json: AgentCardData): AgentCard {
    return new AgentCard(json);
  }

  /**
   * Get the raw data.
   */
  getData(): Readonly<AgentCardData> {
    return { ...this.data };
  }

  // ═══ Validation ═══════════════════════════════════════════════════

  private validateCard(data: AgentCardData): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Agent name is required');
    }
    if (!data.version || !/^\d+\.\d+\.\d+/.test(data.version)) {
      throw new Error('Agent version must be semver (e.g., "1.0.0")');
    }
    if (!data.capabilities || data.capabilities.length === 0) {
      throw new Error('Agent must have at least one capability');
    }
    if (!data.owner || data.owner.trim().length === 0) {
      throw new Error('Agent owner address is required');
    }
  }
}
