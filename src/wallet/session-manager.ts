/**
 * SessionManager — Scoped, time-limited permission management.
 *
 * Implements session-key patterns inspired by EIP-7702, allowing
 * agent owners to grant agents time-limited, capped permissions
 * without exposing master private keys.
 *
 * Sessions enforce:
 * - Per-transaction caps
 * - Total session budget
 * - Destination whitelists
 * - Chain restrictions
 * - Time-based expiry
 *
 * @see EIP-7702 — EOA → Smart Account delegation
 * @see ERC-4337 — Account Abstraction session keys
 */

import { Session, SessionPermissions } from './types';

/**
 * Generate a unique session ID.
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `sess_${timestamp}_${random}`;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  /**
   * Create a new session with scoped permissions.
   */
  createSession(permissions: SessionPermissions): Session {
    // Validate permissions
    if (permissions.maxPerTransaction <= 0) {
      throw new Error('maxPerTransaction must be positive');
    }
    if (permissions.maxTotal <= 0) {
      throw new Error('maxTotal must be positive');
    }
    if (permissions.maxPerTransaction > permissions.maxTotal) {
      throw new Error('maxPerTransaction cannot exceed maxTotal');
    }
    if (permissions.expiresAt.getTime() <= Date.now()) {
      throw new Error('Session expiry must be in the future');
    }

    const session: Session = {
      id: generateSessionId(),
      permissions,
      spent: 0,
      txCount: 0,
      createdAt: new Date(),
      isActive: true,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Revoke (deactivate) a session by ID.
   */
  revokeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.isActive = false;
    return true;
  }

  /**
   * Check if a proposed spend is allowed within a session's permissions.
   */
  checkSession(
    sessionId: string,
    amountUsd: number,
    destination?: string,
    chain?: string
  ): { allowed: boolean; reason?: string } {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { allowed: false, reason: 'Session not found' };
    }

    if (!session.isActive) {
      return { allowed: false, reason: 'Session revoked' };
    }

    // Check expiry
    if (Date.now() > session.permissions.expiresAt.getTime()) {
      session.isActive = false;
      return { allowed: false, reason: 'Session expired' };
    }

    // Check per-transaction limit
    if (amountUsd > session.permissions.maxPerTransaction) {
      return {
        allowed: false,
        reason: `Amount $${amountUsd} exceeds per-tx limit of $${session.permissions.maxPerTransaction}`,
      };
    }

    // Check total session budget
    if (session.spent + amountUsd > session.permissions.maxTotal) {
      return {
        allowed: false,
        reason: `Amount $${amountUsd} would exceed session budget of $${session.permissions.maxTotal} (spent: $${session.spent})`,
      };
    }

    // Check destination whitelist
    const allowedDest = session.permissions.allowedDestinations;
    if (allowedDest && allowedDest.length > 0 && destination) {
      if (!allowedDest.includes(destination)) {
        return {
          allowed: false,
          reason: `Destination ${destination} not in session whitelist`,
        };
      }
    }

    // Check chain whitelist
    const allowedChains = session.permissions.allowedChains;
    if (allowedChains && allowedChains.length > 0 && chain) {
      if (!allowedChains.includes(chain)) {
        return {
          allowed: false,
          reason: `Chain ${chain} not allowed in this session`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a successful spend against a session.
   */
  recordSpend(sessionId: string, amountUsd: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    session.spent += amountUsd;
    session.txCount += 1;
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions.
   */
  getActiveSessions(): Session[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter(
      (s) => s.isActive && now <= s.permissions.expiresAt.getTime()
    );
  }

  /**
   * Get the remaining budget for a session.
   */
  getRemainingBudget(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;
    return Math.max(0, session.permissions.maxTotal - session.spent);
  }

  /**
   * Prune expired sessions from memory.
   */
  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [id, session] of this.sessions) {
      if (now > session.permissions.expiresAt.getTime()) {
        session.isActive = false;
        this.sessions.delete(id);
        pruned++;
      }
    }

    return pruned;
  }
}
