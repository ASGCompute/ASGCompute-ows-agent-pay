/**
 * Tests for SessionManager — scoped permission management.
 */

import { SessionManager } from '../wallet/session-manager';
import { SessionPermissions } from '../wallet/types';

describe('SessionManager', () => {
  let manager: SessionManager;
  const futureDate = new Date(Date.now() + 3600_000); // 1 hour from now

  const defaultPerms: SessionPermissions = {
    maxPerTransaction: 10,
    maxTotal: 100,
    expiresAt: futureDate,
  };

  beforeEach(() => {
    manager = new SessionManager();
  });

  describe('createSession()', () => {
    it('should create a session with valid permissions', () => {
      const session = manager.createSession(defaultPerms);
      expect(session.id).toMatch(/^sess_/);
      expect(session.isActive).toBe(true);
      expect(session.spent).toBe(0);
      expect(session.txCount).toBe(0);
    });

    it('should reject maxPerTransaction <= 0', () => {
      expect(() => manager.createSession({ ...defaultPerms, maxPerTransaction: 0 }))
        .toThrow('maxPerTransaction must be positive');
    });

    it('should reject maxTotal <= 0', () => {
      expect(() => manager.createSession({ ...defaultPerms, maxTotal: 0 }))
        .toThrow('maxTotal must be positive');
    });

    it('should reject maxPerTransaction > maxTotal', () => {
      expect(() => manager.createSession({ ...defaultPerms, maxPerTransaction: 200 }))
        .toThrow('maxPerTransaction cannot exceed maxTotal');
    });

    it('should reject expired sessions', () => {
      const pastDate = new Date(Date.now() - 1000);
      expect(() => manager.createSession({ ...defaultPerms, expiresAt: pastDate }))
        .toThrow('Session expiry must be in the future');
    });
  });

  describe('checkSession()', () => {
    it('should allow valid spend', () => {
      const session = manager.createSession(defaultPerms);
      const result = manager.checkSession(session.id, 5);
      expect(result.allowed).toBe(true);
    });

    it('should reject unknown session', () => {
      const result = manager.checkSession('sess_unknown', 5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Session not found');
    });

    it('should reject revoked session', () => {
      const session = manager.createSession(defaultPerms);
      manager.revokeSession(session.id);
      const result = manager.checkSession(session.id, 5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Session revoked');
    });

    it('should reject when exceeding per-tx limit', () => {
      const session = manager.createSession(defaultPerms);
      const result = manager.checkSession(session.id, 50);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds per-tx limit');
    });

    it('should reject when exceeding total budget', () => {
      const session = manager.createSession(defaultPerms);
      manager.recordSpend(session.id, 9);
      manager.recordSpend(session.id, 9);
      manager.recordSpend(session.id, 9);
      manager.recordSpend(session.id, 9);
      manager.recordSpend(session.id, 9);
      manager.recordSpend(session.id, 9);
      manager.recordSpend(session.id, 9);
      manager.recordSpend(session.id, 9);
      manager.recordSpend(session.id, 9);
      manager.recordSpend(session.id, 9);
      // Spent $90, trying to spend $10 more = $100 which is the limit
      const result = manager.checkSession(session.id, 10);
      expect(result.allowed).toBe(true);
      // But $10.01 should fail
      const result2 = manager.checkSession(session.id, 10.01);
      expect(result2.allowed).toBe(false);
    });

    it('should reject unauthorized destination', () => {
      const session = manager.createSession({
        ...defaultPerms,
        allowedDestinations: ['0xAllowed'],
      });
      const result = manager.checkSession(session.id, 5, '0xNotAllowed');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in session whitelist');
    });

    it('should allow whitelisted destination', () => {
      const session = manager.createSession({
        ...defaultPerms,
        allowedDestinations: ['0xAllowed'],
      });
      const result = manager.checkSession(session.id, 5, '0xAllowed');
      expect(result.allowed).toBe(true);
    });

    it('should reject unauthorized chain', () => {
      const session = manager.createSession({
        ...defaultPerms,
        allowedChains: ['eip155:8453'],
      });
      const result = manager.checkSession(session.id, 5, undefined, 'eip155:1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not allowed in this session');
    });
  });

  describe('recordSpend()', () => {
    it('should update spent amount', () => {
      const session = manager.createSession(defaultPerms);
      manager.recordSpend(session.id, 5);
      const s = manager.getSession(session.id)!;
      expect(s.spent).toBe(5);
      expect(s.txCount).toBe(1);
    });

    it('should accumulate transactions', () => {
      const session = manager.createSession(defaultPerms);
      manager.recordSpend(session.id, 3);
      manager.recordSpend(session.id, 7);
      const s = manager.getSession(session.id)!;
      expect(s.spent).toBe(10);
      expect(s.txCount).toBe(2);
    });

    it('should throw for unknown session', () => {
      expect(() => manager.recordSpend('sess_unknown', 5))
        .toThrow('Session sess_unknown not found');
    });
  });

  describe('revokeSession()', () => {
    it('should deactivate session', () => {
      const session = manager.createSession(defaultPerms);
      expect(manager.revokeSession(session.id)).toBe(true);
      expect(manager.getSession(session.id)!.isActive).toBe(false);
    });

    it('should return false for unknown session', () => {
      expect(manager.revokeSession('sess_unknown')).toBe(false);
    });
  });

  describe('getActiveSessions()', () => {
    it('should return only active, non-expired sessions', () => {
      manager.createSession(defaultPerms);
      manager.createSession(defaultPerms);
      const toRevoke = manager.createSession(defaultPerms);
      manager.revokeSession(toRevoke.id);

      const active = manager.getActiveSessions();
      expect(active).toHaveLength(2);
    });
  });

  describe('getRemainingBudget()', () => {
    it('should return correct remaining budget', () => {
      const session = manager.createSession(defaultPerms);
      manager.recordSpend(session.id, 30);
      expect(manager.getRemainingBudget(session.id)).toBe(70);
    });

    it('should return 0 for unknown session', () => {
      expect(manager.getRemainingBudget('sess_unknown')).toBe(0);
    });
  });
});
