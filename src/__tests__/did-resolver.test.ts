/**
 * Tests for DIDResolver — W3C DID resolution.
 */

import { DIDResolver } from '../identity/did-resolver';
import { AgentCardData } from '../identity/types';

describe('DIDResolver', () => {
  let resolver: DIDResolver;

  const mockCard: AgentCardData = {
    name: 'Test Agent',
    version: '1.0.0',
    capabilities: ['trade', 'analyze'],
    owner: '0xOwner123',
    endpoints: {
      a2a: 'https://agent.example.com/a2a',
      mcp: 'https://agent.example.com/mcp',
      payment: 'https://agent.example.com/pay',
    },
  };

  beforeEach(() => {
    resolver = new DIDResolver();
  });

  describe('create()', () => {
    it('should create a DID and document', () => {
      const { did, document } = resolver.create('0xAgent1', 'eip155:8453', mockCard);
      expect(did).toBe('did:asg:agent:eip155:8453:0xAgent1');
      expect(document.id).toBe(did);
      expect(document.controller).toBe('0xOwner123');
    });

    it('should include verification method', () => {
      const { document } = resolver.create('0xAgent1', 'eip155:8453', mockCard);
      expect(document.verificationMethod).toHaveLength(1);
      expect(document.verificationMethod[0].type).toBe('EcdsaSecp256k1VerificationKey2019');
    });

    it('should use Ed25519 for Stellar', () => {
      const { document } = resolver.create('GABC...', 'stellar:pubnet', mockCard);
      expect(document.verificationMethod[0].type).toBe('Ed25519VerificationKey2020');
    });

    it('should use Ed25519 for Solana', () => {
      const { document } = resolver.create('5eyk...', 'solana:mainnet', mockCard);
      expect(document.verificationMethod[0].type).toBe('Ed25519VerificationKey2020');
    });

    it('should include service endpoints', () => {
      const { document } = resolver.create('0xAgent1', 'eip155:8453', mockCard);
      expect(document.service).toHaveLength(3);
      expect(document.service.map(s => s.type)).toContain('A2AEndpoint');
      expect(document.service.map(s => s.type)).toContain('MCPEndpoint');
      expect(document.service.map(s => s.type)).toContain('PaymentEndpoint');
    });

    it('should set timestamps', () => {
      const { document } = resolver.create('0xAgent1', 'eip155:8453', mockCard);
      expect(document.created).toBeInstanceOf(Date);
      expect(document.updated).toBeInstanceOf(Date);
    });
  });

  describe('resolve()', () => {
    it('should resolve a registered DID', () => {
      const { did } = resolver.create('0xAgent1', 'eip155:8453', mockCard);
      const doc = resolver.resolve(did);
      expect(doc).not.toBeNull();
      expect(doc!.id).toBe(did);
    });

    it('should return null for unregistered DID', () => {
      const doc = resolver.resolve('did:asg:agent:eip155:8453:0xUnknown' as any);
      expect(doc).toBeNull();
    });
  });

  describe('parse()', () => {
    it('should parse a valid DID', () => {
      const parsed = resolver.parse('did:asg:agent:eip155:8453:0xAddr');
      expect(parsed).not.toBeNull();
      expect(parsed!.method).toBe('asg');
      expect(parsed!.submethod).toBe('agent');
      expect(parsed!.chain).toBe('eip155:8453');
      expect(parsed!.address).toBe('0xAddr');
    });

    it('should return null for invalid DID', () => {
      expect(resolver.parse('not:a:did')).toBeNull();
      expect(resolver.parse('did:other:agent:chain:addr')).toBeNull();
    });
  });

  describe('validate()', () => {
    it('should validate correct DID', () => {
      expect(resolver.validate('did:asg:agent:eip155:8453:0xAddr')).toBe(true);
    });

    it('should reject invalid DID', () => {
      expect(resolver.validate('did:other:agent:chain:addr')).toBe(false);
      expect(resolver.validate('invalid')).toBe(false);
    });
  });

  describe('updateServices()', () => {
    it('should update services', () => {
      const { did } = resolver.create('0xAgent1', 'eip155:8453', mockCard);
      const updated = resolver.updateServices(did, [
        { id: `${did}#new`, type: 'AgentService', serviceEndpoint: 'https://new.example.com' },
      ]);
      expect(updated).toBe(true);
      const doc = resolver.resolve(did);
      expect(doc!.service).toHaveLength(1);
      expect(doc!.service[0].type).toBe('AgentService');
    });

    it('should return false for unknown DID', () => {
      expect(resolver.updateServices('did:asg:agent:x:y' as any, [])).toBe(false);
    });
  });

  describe('deactivate()', () => {
    it('should remove DID', () => {
      const { did } = resolver.create('0xAgent1', 'eip155:8453', mockCard);
      expect(resolver.deactivate(did)).toBe(true);
      expect(resolver.resolve(did)).toBeNull();
    });
  });

  describe('listAll()', () => {
    it('should list all registered DIDs', () => {
      resolver.create('0xAgent1', 'eip155:8453', mockCard);
      resolver.create('0xAgent2', 'stellar:pubnet', mockCard);
      expect(resolver.listAll()).toHaveLength(2);
    });
  });
});
