/**
 * Reputation — EAS-compatible reputation scoring for AI agents.
 *
 * Implements the Reputation Registry concept from ERC-8004, using
 * an EAS-compatible schema for creating, storing, and querying
 * reputation attestations.
 *
 * Features:
 * - Create/revoke attestations
 * - Aggregate scores by category
 * - Compute overall trust score
 * - Track payment reliability, task quality, uptime, etc.
 *
 * @see ERC-8004 — Reputation Registry
 * @see https://attest.org — Ethereum Attestation Service
 */

import {
  ReputationAttestation,
  ReputationProfile,
  ReputationCategory,
  CreateAttestationOptions,
  AgentDID,
} from './types';

/**
 * Weights for each reputation category in the overall score.
 */
const CATEGORY_WEIGHTS: Record<ReputationCategory, number> = {
  'payment-reliability': 0.30,
  'task-quality': 0.25,
  'response-time': 0.15,
  'uptime': 0.15,
  'security': 0.10,
  'general': 0.05,
};

/**
 * Generate a unique attestation ID.
 */
function generateAttestationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `att_${ts}_${rand}`;
}

export class Reputation {
  /** In-memory attestation store (production: EAS on-chain or IPFS). */
  private attestations: Map<string, ReputationAttestation[]> = new Map();

  /**
   * Create a reputation attestation for an agent.
   *
   * @param attesterAddress - Who is creating the attestation
   * @param options - Attestation details
   * @returns The created attestation
   */
  attest(
    attesterAddress: string,
    options: CreateAttestationOptions
  ): ReputationAttestation {
    if (options.score < 0 || options.score > 100) {
      throw new Error('Score must be between 0 and 100');
    }

    const attestation: ReputationAttestation = {
      id: generateAttestationId(),
      attester: attesterAddress,
      subject: options.subject,
      score: options.score,
      category: options.category,
      comment: options.comment,
      timestamp: new Date(),
      expiresAt: options.validFor
        ? new Date(Date.now() + options.validFor)
        : undefined,
      isValid: true,
    };

    const existing = this.attestations.get(options.subject) ?? [];
    existing.push(attestation);
    this.attestations.set(options.subject, existing);

    return attestation;
  }

  /**
   * Revoke an attestation by ID.
   */
  revoke(subject: string, attestationId: string): boolean {
    const attestations = this.attestations.get(subject);
    if (!attestations) return false;

    const att = attestations.find((a) => a.id === attestationId);
    if (!att) return false;

    att.isValid = false;
    return true;
  }

  /**
   * Get the full reputation profile for an agent.
   */
  getProfile(agentDid: AgentDID): ReputationProfile {
    const attestations = this.getValidAttestations(agentDid);

    if (attestations.length === 0) {
      return {
        agentDid,
        overallScore: 0,
        totalAttestations: 0,
        successRate: 0,
        totalTransactions: 0,
        categoryScores: {},
        recentAttestations: [],
        lastUpdated: new Date(),
      };
    }

    // Calculate category scores
    const categoryScores = this.calculateCategoryScores(attestations);

    // Calculate weighted overall score
    const overallScore = this.calculateOverallScore(categoryScores);

    // Calculate success rate (score >= 70 is "success")
    const successCount = attestations.filter((a) => a.score >= 70).length;
    const successRate = successCount / attestations.length;

    return {
      agentDid,
      overallScore: Math.round(overallScore),
      totalAttestations: attestations.length,
      successRate: Math.round(successRate * 100) / 100,
      totalTransactions: attestations.filter(
        (a) => a.category === 'payment-reliability'
      ).length,
      categoryScores,
      recentAttestations: attestations.slice(-10),
      lastUpdated: new Date(),
    };
  }

  /**
   * Get the overall score for an agent (0-100).
   */
  getScore(agentDid: AgentDID): number {
    return this.getProfile(agentDid).overallScore;
  }

  /**
   * Check if an agent meets a minimum trust threshold.
   */
  meetsThreshold(agentDid: AgentDID, minScore: number): boolean {
    return this.getScore(agentDid) >= minScore;
  }

  /**
   * Get all valid (non-expired, non-revoked) attestations for an agent.
   */
  getValidAttestations(subject: string): ReputationAttestation[] {
    const all = this.attestations.get(subject) ?? [];
    const now = Date.now();

    return all.filter((a) => {
      if (!a.isValid) return false;
      if (a.expiresAt && a.expiresAt.getTime() < now) return false;
      return true;
    });
  }

  /**
   * Get all attestations (including invalid) for an agent.
   */
  getAllAttestations(subject: string): ReputationAttestation[] {
    return [...(this.attestations.get(subject) ?? [])];
  }

  /**
   * Get the attestation count for an agent.
   */
  getAttestationCount(subject: string): number {
    return this.getValidAttestations(subject).length;
  }

  // ─── Internal ──────────────────────────────────────────────────────

  /**
   * Calculate average scores per category.
   */
  private calculateCategoryScores(
    attestations: ReputationAttestation[]
  ): Partial<Record<ReputationCategory, number>> {
    const categoryGroups: Partial<Record<ReputationCategory, number[]>> = {};

    for (const att of attestations) {
      if (!categoryGroups[att.category]) {
        categoryGroups[att.category] = [];
      }
      categoryGroups[att.category]!.push(att.score);
    }

    const result: Partial<Record<ReputationCategory, number>> = {};
    for (const [category, scores] of Object.entries(categoryGroups)) {
      const avg = scores!.reduce((a, b) => a + b, 0) / scores!.length;
      result[category as ReputationCategory] = Math.round(avg);
    }

    return result;
  }

  /**
   * Calculate weighted overall score from category scores.
   */
  private calculateOverallScore(
    categoryScores: Partial<Record<ReputationCategory, number>>
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [category, score] of Object.entries(categoryScores)) {
      const weight = CATEGORY_WEIGHTS[category as ReputationCategory] ?? 0.05;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return 0;
    return weightedSum / totalWeight;
  }
}
