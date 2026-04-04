/**
 * Tests for AgentCard — capability metadata registry.
 */

import { AgentCard } from '../identity/agent-card';

describe('AgentCard', () => {
  const validData = {
    name: 'Trade Bot',
    version: '1.0.0',
    description: 'Automated trading agent',
    capabilities: ['trade', 'analyze', 'report'],
    owner: '0xOwner123',
    endpoints: {
      a2a: 'https://agent.example.com/a2a',
    },
    tags: ['defi', 'trading'],
  };

  describe('constructor', () => {
    it('should create card with valid data', () => {
      const card = new AgentCard(validData);
      expect(card.name).toBe('Trade Bot');
      expect(card.version).toBe('1.0.0');
      expect(card.owner).toBe('0xOwner123');
    });

    it('should reject missing name', () => {
      expect(() => new AgentCard({ ...validData, name: '' }))
        .toThrow('Agent name is required');
    });

    it('should reject invalid version', () => {
      expect(() => new AgentCard({ ...validData, version: 'bad' }))
        .toThrow('version must be semver');
    });

    it('should reject empty capabilities', () => {
      expect(() => new AgentCard({ ...validData, capabilities: [] }))
        .toThrow('at least one capability');
    });

    it('should reject missing owner', () => {
      expect(() => new AgentCard({ ...validData, owner: '' }))
        .toThrow('owner address is required');
    });
  });

  describe('capability checks', () => {
    const card = new AgentCard(validData);

    it('should check single capability', () => {
      expect(card.hasCapability('trade')).toBe(true);
      expect(card.hasCapability('unknown')).toBe(false);
    });

    it('should check ALL capabilities', () => {
      expect(card.hasAllCapabilities(['trade', 'analyze'])).toBe(true);
      expect(card.hasAllCapabilities(['trade', 'unknown'])).toBe(false);
    });

    it('should check ANY capability', () => {
      expect(card.hasAnyCapability(['trade', 'unknown'])).toBe(true);
      expect(card.hasAnyCapability(['unknown1', 'unknown2'])).toBe(false);
    });
  });

  describe('updates', () => {
    it('should add capability', () => {
      const card = new AgentCard(validData);
      card.addCapability('monitor');
      expect(card.hasCapability('monitor')).toBe(true);
    });

    it('should not add duplicate capability', () => {
      const card = new AgentCard(validData);
      card.addCapability('trade');
      expect(card.capabilities.filter(c => c === 'trade')).toHaveLength(1);
    });

    it('should remove capability', () => {
      const card = new AgentCard(validData);
      expect(card.removeCapability('trade')).toBe(true);
      expect(card.hasCapability('trade')).toBe(false);
    });

    it('should return false for removing non-existent capability', () => {
      const card = new AgentCard(validData);
      expect(card.removeCapability('unknown')).toBe(false);
    });

    it('should set endpoint', () => {
      const card = new AgentCard(validData);
      card.setEndpoint('mcp', 'https://agent.example.com/mcp');
      expect(card.endpoints!.mcp).toBe('https://agent.example.com/mcp');
    });

    it('should add address', () => {
      const card = new AgentCard(validData);
      card.addAddress('Base', 'eip155:8453', '0xAddr1');
      expect(card.addresses).toHaveLength(1);
    });

    it('should not add duplicate address', () => {
      const card = new AgentCard(validData);
      card.addAddress('Base', 'eip155:8453', '0xAddr1');
      card.addAddress('Base', 'eip155:8453', '0xAddr1');
      expect(card.addresses).toHaveLength(1);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const card = new AgentCard(validData);
      const json = card.toJSON();
      expect(json.name).toBe('Trade Bot');
      expect(json.createdAt).toBeDefined();
      expect(json.updatedAt).toBeDefined();
    });

    it('should deserialize from JSON', () => {
      const freshData = {
        name: 'Trade Bot',
        version: '1.0.0',
        capabilities: ['trade', 'analyze', 'report'],
        owner: '0xOwner123',
      };
      const card = AgentCard.fromJSON(freshData);
      expect(card.name).toBe('Trade Bot');
      expect(card.capabilities).toContain('trade');
    });
  });

  describe('getData()', () => {
    it('should return readonly copy', () => {
      const card = new AgentCard(validData);
      const data = card.getData();
      expect(data.name).toBe('Trade Bot');
    });
  });
});
