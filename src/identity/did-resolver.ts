/**
 * DIDResolver — W3C Decentralized Identifier resolution for ASG agents.
 *
 * Implements a custom DID method `did:asg:agent:<chain>:<address>` that
 * resolves to a DID Document containing the agent's public keys,
 * service endpoints, and ownership information.
 *
 * Format: did:asg:agent:<caip2-chain>:<address>
 * @example "did:asg:agent:eip155:8453:0x1234abcd..."
 * @example "did:asg:agent:stellar:pubnet:GABC..."
 * @example "did:asg:agent:solana:mainnet:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp..."
 *
 * @see https://www.w3.org/TR/did-core/
 * @see ERC-8004 — Identity Registry
 */

import {
  AgentDID,
  DIDDocument,
  VerificationMethod,
  ServiceEndpoint,
  AgentCardData,
} from './types';

/**
 * Parse a DID string into its components.
 */
interface ParsedDID {
  method: string;     // "asg"
  submethod: string;  // "agent"
  chain: string;      // "eip155:8453"
  address: string;    // "0x1234..."
}

export class DIDResolver {
  /** In-memory registry (production: on-chain or IPFS). */
  private registry: Map<string, DIDDocument> = new Map();

  /**
   * Create a DID for an agent.
   *
   * @param address - The agent's primary address
   * @param chainId - CAIP-2 chain identifier
   * @param card - Agent card metadata
   * @returns The generated DID and DID Document
   */
  create(
    address: string,
    chainId: string,
    card: AgentCardData
  ): { did: AgentDID; document: DIDDocument } {
    const did = this.buildDID(address, chainId);

    const verificationMethod: VerificationMethod = {
      id: `${did}#key-1`,
      type: this.getKeyType(chainId),
      controller: did,
      publicKeyMultibase: this.addressToMultibase(address),
    };

    const services: ServiceEndpoint[] = [];

    if (card.endpoints?.a2a) {
      services.push({
        id: `${did}#a2a`,
        type: 'A2AEndpoint',
        serviceEndpoint: card.endpoints.a2a,
      });
    }

    if (card.endpoints?.mcp) {
      services.push({
        id: `${did}#mcp`,
        type: 'MCPEndpoint',
        serviceEndpoint: card.endpoints.mcp,
      });
    }

    if (card.endpoints?.payment) {
      services.push({
        id: `${did}#payment`,
        type: 'PaymentEndpoint',
        serviceEndpoint: card.endpoints.payment,
      });
    }

    const document: DIDDocument = {
      id: did,
      controller: card.owner,
      verificationMethod: [verificationMethod],
      service: services,
      created: new Date(),
      updated: new Date(),
    };

    this.registry.set(did, document);
    return { did, document };
  }

  /**
   * Resolve a DID to its DID Document.
   */
  resolve(did: AgentDID): DIDDocument | null {
    return this.registry.get(did) ?? null;
  }

  /**
   * Parse a DID string into its components.
   */
  parse(did: string): ParsedDID | null {
    const parts = did.split(':');

    // did:asg:agent:<chainType>:<chainId>:<address>
    // Minimum: did:asg:agent:chain:address = 5 parts
    if (parts.length < 5 || parts[0] !== 'did' || parts[1] !== 'asg') {
      return null;
    }

    const method = parts[1];       // "asg"
    const submethod = parts[2];    // "agent"

    // Chain can be multi-part (e.g., "eip155:8453")
    // Address is always the last part
    const address = parts[parts.length - 1];
    const chain = parts.slice(3, parts.length - 1).join(':');

    return { method, submethod, chain, address };
  }

  /**
   * Validate that a DID string is well-formed.
   */
  validate(did: string): boolean {
    const parsed = this.parse(did);
    if (!parsed) return false;

    return (
      parsed.method === 'asg' &&
      parsed.submethod === 'agent' &&
      parsed.chain.length > 0 &&
      parsed.address.length > 0
    );
  }

  /**
   * Update a DID Document's service endpoints.
   */
  updateServices(did: AgentDID, services: ServiceEndpoint[]): boolean {
    const doc = this.registry.get(did);
    if (!doc) return false;

    doc.service = services;
    doc.updated = new Date();
    return true;
  }

  /**
   * Deactivate (delete) a DID Document.
   */
  deactivate(did: AgentDID): boolean {
    return this.registry.delete(did);
  }

  /**
   * List all registered DIDs.
   */
  listAll(): AgentDID[] {
    return Array.from(this.registry.keys()) as AgentDID[];
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private buildDID(address: string, chainId: string): AgentDID {
    return `did:asg:agent:${chainId}:${address}` as AgentDID;
  }

  private getKeyType(chainId: string): VerificationMethod['type'] {
    if (chainId.startsWith('eip155')) return 'EcdsaSecp256k1VerificationKey2019';
    if (chainId.startsWith('stellar')) return 'Ed25519VerificationKey2020';
    if (chainId.startsWith('solana')) return 'Ed25519VerificationKey2020';
    return 'JsonWebKey2020';
  }

  private addressToMultibase(address: string): string {
    // Multibase-encode the address (simplified: just prefix with 'z' for base58btc)
    return `z${address}`;
  }
}
