/**
 * Identity Layer Types — Agent identity, reputation, and ownership.
 *
 * Implements concepts from:
 * - ERC-8004 "Trustless Agents" (Identity + Reputation + Validation registries)
 * - W3C DID (Decentralized Identifiers)
 * - EAS (Ethereum Attestation Service)
 * - Stellar Protocol 25 (ZK-KYC selective disclosure)
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 * @see https://www.w3.org/TR/did-core/
 * @see https://attest.org
 */

// ═══ DID Types ══════════════════════════════════════════════════════

/**
 * ASG DID format: did:asg:agent:<chain>:<address>
 * @example "did:asg:agent:eip155:8453:0x1234..."
 * @example "did:asg:agent:stellar:pubnet:GABC..."
 */
export type AgentDID = `did:asg:agent:${string}`;

/** W3C DID Document — simplified for agent use. */
export interface DIDDocument {
  /** The DID subject. */
  id: AgentDID;
  /** DID controller (owner). */
  controller: string;
  /** Verification methods (public keys). */
  verificationMethod: VerificationMethod[];
  /** Service endpoints (A2A, MCP, etc.). */
  service: ServiceEndpoint[];
  /** When the document was created. */
  created: Date;
  /** When the document was last updated. */
  updated: Date;
}

export interface VerificationMethod {
  id: string;
  type: 'Ed25519VerificationKey2020' | 'EcdsaSecp256k1VerificationKey2019' | 'JsonWebKey2020';
  controller: string;
  /** Public key in multibase encoding. */
  publicKeyMultibase?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: 'AgentService' | 'A2AEndpoint' | 'MCPEndpoint' | 'PaymentEndpoint';
  serviceEndpoint: string;
}

// ═══ Agent Card (ERC-8004 Identity Registry) ════════════════════════

/**
 * AgentCard — On-chain identity metadata for an AI agent.
 * Implements the Identity Registry concept from ERC-8004.
 */
export interface AgentCardData {
  /** Agent's human-readable name. */
  name: string;
  /** Semantic version. */
  version: string;
  /** Short description. */
  description?: string;
  /** Capabilities this agent offers. */
  capabilities: string[];
  /** Owner/controller address. */
  owner: string;
  /** Service endpoints. */
  endpoints?: {
    a2a?: string;
    mcp?: string;
    payment?: string;
    webhook?: string;
  };
  /** Chain addresses this agent controls. */
  addresses?: Array<{
    chain: string;
    caip2Id: string;
    address: string;
  }>;
  /** Agent icon URL. */
  iconUrl?: string;
  /** Agent categories/tags. */
  tags?: string[];
}

// ═══ Reputation (ERC-8004 Reputation Registry + EAS) ════════════════

/** A single reputation attestation. */
export interface ReputationAttestation {
  /** Unique attestation ID. */
  id: string;
  /** Who attested (address). */
  attester: string;
  /** The agent being attested (DID or address). */
  subject: string;
  /** Score (0-100). */
  score: number;
  /** Category of the attestation. */
  category: ReputationCategory;
  /** Optional textual feedback. */
  comment?: string;
  /** Transaction hash of the attestation (if on-chain). */
  transactionHash?: string;
  /** When the attestation was created. */
  timestamp: Date;
  /** When the attestation expires (if applicable). */
  expiresAt?: Date;
  /** Is this attestation still valid? */
  isValid: boolean;
}

/** Categories for reputation scoring. */
export type ReputationCategory =
  | 'payment-reliability'  // Pays on time
  | 'task-quality'          // Quality of work
  | 'response-time'         // Response speed
  | 'uptime'                // Service availability
  | 'security'              // Security posture
  | 'general';              // Catch-all

/** Aggregated reputation profile. */
export interface ReputationProfile {
  /** Agent DID. */
  agentDid: AgentDID;
  /** Overall score (0-100). */
  overallScore: number;
  /** Number of attestations received. */
  totalAttestations: number;
  /** Success rate (0-1). */
  successRate: number;
  /** Total transactions processed. */
  totalTransactions: number;
  /** Score breakdown by category. */
  categoryScores: Partial<Record<ReputationCategory, number>>;
  /** Recent attestations (last N). */
  recentAttestations: ReputationAttestation[];
  /** When this profile was last updated. */
  lastUpdated: Date;
}

// ═══ Owner Registry (ERC-8004 Validation) ═══════════════════════════

/** Ownership record linking an agent to its owner. */
export interface OwnerRecord {
  /** Agent DID. */
  agentDid: AgentDID;
  /** Owner address. */
  ownerAddress: string;
  /** When ownership was established. */
  since: Date;
  /** Delegation level. */
  delegationLevel: DelegationLevel;
  /** Additional metadata. */
  metadata?: Record<string, string>;
}

/** How much authority the agent has. */
export type DelegationLevel =
  | 'full'        // Full autonomy
  | 'supervised'  // Owner receives notifications
  | 'restricted'  // Owner must approve large actions
  | 'readonly';   // Agent can only read, not transact

// ═══ Attestation Types ══════════════════════════════════════════════

/** Options for creating a new attestation. */
export interface CreateAttestationOptions {
  /** Agent being attested. */
  subject: string;
  /** Score (0-100). */
  score: number;
  /** Category. */
  category: ReputationCategory;
  /** Optional comment. */
  comment?: string;
  /** How long the attestation is valid (ms). */
  validFor?: number;
}

/** Options for resolving an agent identity. */
export interface ResolveOptions {
  /** Include reputation profile? Default: true */
  includeReputation?: boolean;
  /** Include ownership info? Default: true */
  includeOwnership?: boolean;
  /** Maximum attestations to fetch. Default: 10 */
  maxAttestations?: number;
}

/** Full resolved agent identity. */
export interface ResolvedIdentity {
  /** DID Document. */
  did: DIDDocument;
  /** Agent Card metadata. */
  card: AgentCardData;
  /** Reputation profile (if requested). */
  reputation?: ReputationProfile;
  /** Ownership info (if requested). */
  ownership?: OwnerRecord;
}

// ═══ Agent Identity Options ═════════════════════════════════════════

export interface AgentIdentityOptions {
  /** Agent card metadata. */
  metadata: AgentCardData;
  /** Signing address (from wallet or adapter). */
  signerAddress: string;
  /** CAIP-2 chain ID of the signer. */
  signerChainId: string;
  /** Optional logger. */
  logger?: (msg: string) => void;
}
