/**
 * AgentIdentity — Main facade for the identity layer.
 *
 * Orchestrates DIDResolver, AgentCard, Reputation, and OwnerRegistry
 * into a single, cohesive interface. This is the primary object that
 * agents and the OwsClient interact with.
 *
 * @example
 * ```ts
 * const identity = new AgentIdentity({
 *   metadata: {
 *     name: 'Trading Bot Alpha',
 *     version: '1.0.0',
 *     capabilities: ['trade', 'analyze'],
 *     owner: '0xOwner...',
 *   },
 *   signerAddress: '0xAgent...',
 *   signerChainId: 'eip155:8453',
 * });
 *
 * // Other agents can verify:
 * const score = identity.getReputationScore();
 * const canTrust = identity.meetsThreshold(70);
 * ```
 */

import { DIDResolver } from './did-resolver';
import { AgentCard } from './agent-card';
import { Reputation } from './reputation';
import { OwnerRegistry } from './owner-registry';
import {
  AgentDID,
  AgentIdentityOptions,
  AgentCardData,
  DIDDocument,
  ReputationProfile,
  OwnerRecord,
  CreateAttestationOptions,
  ReputationAttestation,
  ResolvedIdentity,
  ResolveOptions,
  DelegationLevel,
} from './types';

export class AgentIdentity {
  /** The agent's DID. */
  readonly did: AgentDID;
  /** The agent's DID Document. */
  readonly didDocument: DIDDocument;
  /** The agent's card (capabilities, metadata). */
  readonly card: AgentCard;

  /** Shared modules (can be used across multiple agents). */
  readonly didResolver: DIDResolver;
  readonly reputation: Reputation;
  readonly ownerRegistry: OwnerRegistry;

  private log: (msg: string) => void;

  constructor(options: AgentIdentityOptions) {
    this.log = options.logger ?? (() => {});

    // Initialize modules
    this.didResolver = new DIDResolver();
    this.reputation = new Reputation();
    this.ownerRegistry = new OwnerRegistry();

    // Create agent card
    this.card = new AgentCard(options.metadata);

    // Register DID
    const { did, document } = this.didResolver.create(
      options.signerAddress,
      options.signerChainId,
      options.metadata
    );
    this.did = did;
    this.didDocument = document;

    // Register ownership
    this.ownerRegistry.register(
      this.did,
      options.metadata.owner,
      'supervised'
    );

    this.log(`[Identity] 🆔 Agent identity created: ${this.did}`);
    this.log(`[Identity] 🏷️ Name: ${options.metadata.name} v${options.metadata.version}`);
    this.log(`[Identity] 🎯 Capabilities: ${options.metadata.capabilities.join(', ')}`);
  }

  // ═══ Identity API ═════════════════════════════════════════════════

  /**
   * Get the agent's DID string.
   */
  getDID(): AgentDID {
    return this.did;
  }

  /**
   * Get the agent's card data.
   */
  getCard(): Readonly<AgentCardData> {
    return this.card.getData();
  }

  /**
   * Check if this agent has a specific capability.
   */
  hasCapability(capability: string): boolean {
    return this.card.hasCapability(capability);
  }

  // ═══ Reputation API ═══════════════════════════════════════════════

  /**
   * Get this agent's reputation score (0-100).
   */
  getReputationScore(): number {
    return this.reputation.getScore(this.did);
  }

  /**
   * Get this agent's full reputation profile.
   */
  getReputationProfile(): ReputationProfile {
    return this.reputation.getProfile(this.did);
  }

  /**
   * Check if this agent meets a minimum trust threshold.
   */
  meetsThreshold(minScore: number): boolean {
    return this.reputation.meetsThreshold(this.did, minScore);
  }

  /**
   * Create a reputation attestation for ANOTHER agent.
   */
  attestAgent(options: CreateAttestationOptions): ReputationAttestation {
    this.log(`[Identity] ⭐ Attesting ${options.subject}: ${options.score}/100 (${options.category})`);
    return this.reputation.attest(
      this.didDocument.controller,
      options
    );
  }

  // ═══ Ownership API ════════════════════════════════════════════════

  /**
   * Get this agent's owner.
   */
  getOwner(): OwnerRecord | null {
    return this.ownerRegistry.getOwner(this.did);
  }

  /**
   * Get this agent's delegation level.
   */
  getDelegationLevel(): DelegationLevel | null {
    return this.ownerRegistry.getDelegationLevel(this.did);
  }

  /**
   * Check if this agent can transact (not readonly).
   */
  canTransact(): boolean {
    return this.ownerRegistry.canTransact(this.did);
  }

  // ═══ Resolution API (for discovering other agents) ════════════════

  /**
   * Resolve another agent's identity by DID.
   */
  resolveAgent(agentDid: AgentDID, options?: ResolveOptions): ResolvedIdentity | null {
    const didDoc = this.didResolver.resolve(agentDid);
    if (!didDoc) return null;

    const includeRep = options?.includeReputation ?? true;
    const includeOwner = options?.includeOwnership ?? true;

    // We don't have the card in this context — return a minimal version
    const resolved: ResolvedIdentity = {
      did: didDoc,
      card: {
        name: 'Unknown',
        version: '0.0.0',
        capabilities: [],
        owner: didDoc.controller,
      },
      reputation: includeRep ? this.reputation.getProfile(agentDid) : undefined,
      ownership: includeOwner ? this.ownerRegistry.getOwner(agentDid) ?? undefined : undefined,
    };

    return resolved;
  }

  // ═══ Serialization ════════════════════════════════════════════════

  /**
   * Export the full identity as a portable JSON object.
   */
  toJSON() {
    return {
      did: this.did,
      didDocument: this.didDocument,
      card: this.card.toJSON(),
      reputation: this.reputation.getProfile(this.did),
      ownership: this.ownerRegistry.getOwner(this.did),
    };
  }
}
