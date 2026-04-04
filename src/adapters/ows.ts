/**
 * OWS Adapter — Bridge between Open Wallet Standard and ASG Pay.
 *
 * Uses `@open-wallet-standard/core` for local key management,
 * policy-gated signing, and multi-chain address derivation.
 * ASG Pay handles the payment protocol layer (x402, MPP).
 *
 * Architecture:
 * ```
 * Agent → OwsClient → OWSAdapter → @open-wallet-standard/core
 *                                     ├── createWallet()
 *                                     ├── signTransaction()
 *                                     ├── signMessage()
 *                                     └── Policy Engine (spending limits)
 * ```
 *
 * @example
 * ```ts
 * import { createOwsAdapter } from '@asgcard/pay';
 *
 * // Create adapter backed by OWS local wallet
 * const adapter = createOwsAdapter({
 *   walletName: 'agent-treasury',
 *   chain: 'evm',
 *   chainId: 'eip155:8453',
 *   rpcUrl: 'https://mainnet.base.org',
 * });
 *
 * // Use with ASG Pay client
 * const client = new OwsClient({ adapter });
 * await client.handle402(response);
 * ```
 *
 * @see https://github.com/open-wallet-standard/core
 * @see OWS Specification: docs/00-specification.md
 */

import {
  createWallet,
  getWallet,
  listWallets,
  signMessage,
  signTransaction,
  signAndSend,
  createPolicy,
  createApiKey,
  deleteWallet,
  exportWallet,
  importWalletMnemonic,
  importWalletPrivateKey,
} from '@open-wallet-standard/core';

import type { PaymentAdapter } from './types';

// ═══ Types ══════════════════════════════════════════════════════════════

export interface OwsAdapterOptions {
  /** Name of the OWS wallet (created if it doesn't exist). */
  walletName: string;

  /** Chain family for signing ('evm', 'solana', 'stellar', etc.). */
  chain: 'evm' | 'solana' | 'xrpl' | 'sui' | 'bitcoin' | 'cosmos' | 'tron' | 'filecoin';

  /** CAIP-2 chain identifier (e.g. 'eip155:8453'). */
  chainId: string;

  /** Custom RPC URL for signAndSend. If omitted, OWS uses built-in defaults. */
  rpcUrl?: string;

  /** OWS vault path. Defaults to ~/.ows */
  vaultPath?: string;

  /** Passphrase for encrypted wallets, or an OWS API key token (ows_key_...). */
  passphrase?: string;

  /** Account index for HD derivation. Defaults to 0. */
  accountIndex?: number;

  /** Human-readable chain name for display. */
  chainName?: string;

  /** Logger function. */
  logger?: (msg: string) => void;
}

// ═══ Adapter Factory ════════════════════════════════════════════════════

/**
 * Create a PaymentAdapter backed by an OWS local wallet.
 *
 * The adapter automatically creates the wallet if it doesn't exist,
 * and derives the address for the specified chain.
 */
export function createOwsAdapter(options: OwsAdapterOptions): PaymentAdapter {
  const {
    walletName,
    chain,
    chainId,
    rpcUrl,
    vaultPath,
    passphrase,
    accountIndex = 0,
    logger = () => {},
  } = options;

  // Ensure wallet exists
  let walletInfo;
  try {
    walletInfo = getWallet(walletName, vaultPath);
    logger(`[OWS] 📂 Loaded wallet: ${walletName} (${walletInfo.id})`);
  } catch {
    // Wallet doesn't exist — create it
    walletInfo = createWallet(walletName, passphrase, 12, vaultPath);
    logger(`[OWS] 🆕 Created wallet: ${walletName} (${walletInfo.id})`);
  }

  // Find the address for our chain
  const account = walletInfo.accounts.find((a) =>
    a.chainId.startsWith(chainId.split(':')[0])
  ) ?? walletInfo.accounts[0];

  const address = account?.address ?? '0x0000000000000000000000000000000000000000';
  const derivedChainName = options.chainName ?? mapChainName(chainId);

  logger(`[OWS] 🔗 Chain: ${derivedChainName} (${chainId})`);
  logger(`[OWS] 📍 Address: ${address}`);

  // Build the PaymentAdapter interface
  const adapter: PaymentAdapter = {
    chainName: derivedChainName,
    caip2Id: chainId,

    getAddress(): string {
      return address;
    },

    async pay(
      destination: string,
      amount: string,
      _chainId?: string
    ): Promise<string | null> {
      logger(`[OWS] 💳 Paying ${amount} to ${destination} on ${chainId}`);

      try {
        // For EVM chains, construct and sign+send a transaction
        if (chain === 'evm') {
          // Use signAndSend for on-chain settlement
          const result = signAndSend(
            walletName,
            chain,
            amount, // tx hex — in production this would be a properly encoded tx
            passphrase,
            accountIndex,
            rpcUrl,
            vaultPath
          );
          logger(`[OWS] ✅ Transaction sent: ${result.txHash}`);
          return result.txHash;
        }

        // For other chains, sign the transaction
        const sig = signTransaction(
          walletName,
          chain,
          amount,
          passphrase,
          accountIndex,
          vaultPath
        );
        logger(`[OWS] ✅ Signed: ${sig.signature.substring(0, 20)}...`);
        return sig.signature;
      } catch (error) {
        logger(`[OWS] ❌ Payment failed: ${(error as Error).message}`);
        return null;
      }
    },

    async getBalance(): Promise<string> {
      // OWS doesn't provide balance queries — return '0' and let
      // the agent fund the wallet via `ows fund deposit`
      return '0';
    },

  };

  return adapter;
}

// ═══ OWS Wallet Management Helpers ═════════════════════════════════════

/**
 * Create an OWS policy for agent spending limits.
 *
 * @example
 * ```ts
 * createOwsPolicy({
 *   id: 'agent-budget',
 *   name: 'Agent daily budget',
 *   allowedChains: ['eip155:8453'],
 *   expiresAt: '2026-12-31T23:59:59Z',
 * });
 * ```
 */
export function createOwsPolicy(options: {
  id: string;
  name: string;
  allowedChains?: string[];
  expiresAt?: string;
  vaultPath?: string;
}): void {
  const rules: Array<Record<string, unknown>> = [];

  if (options.allowedChains) {
    rules.push({
      type: 'allowed_chains',
      chain_ids: options.allowedChains,
    });
  }

  if (options.expiresAt) {
    rules.push({
      type: 'expires_at',
      timestamp: options.expiresAt,
    });
  }

  const policy = JSON.stringify({
    id: options.id,
    name: options.name,
    version: 1,
    created_at: new Date().toISOString(),
    rules,
    action: 'deny',
  });

  createPolicy(policy, options.vaultPath);
}

/**
 * Create a scoped OWS API key for agent access.
 * The agent uses this token as the passphrase — it NEVER sees the private key.
 *
 * @returns The API key token (shown once — caller must save it)
 */
export function createOwsAgentKey(options: {
  name: string;
  walletName: string;
  policyIds: string[];
  passphrase: string;
  expiresAt?: string;
  vaultPath?: string;
}): { token: string; id: string; name: string } {
  return createApiKey(
    options.name,
    [options.walletName],
    options.policyIds,
    options.passphrase,
    options.expiresAt,
    options.vaultPath
  );
}

/**
 * Import an existing wallet into OWS from a mnemonic.
 */
export function importOwsWallet(
  name: string,
  mnemonic: string,
  passphrase?: string,
  vaultPath?: string
) {
  return importWalletMnemonic(name, mnemonic, passphrase, undefined, vaultPath);
}

/**
 * Import an existing wallet from a private key.
 */
export function importOwsWalletFromKey(
  name: string,
  privateKeyHex: string,
  chain: 'evm' | 'solana' = 'evm',
  passphrase?: string,
  vaultPath?: string
) {
  return importWalletPrivateKey(name, privateKeyHex, passphrase, vaultPath, chain);
}

/**
 * Export the mnemonic from an OWS wallet.
 */
export function exportOwsWallet(
  nameOrId: string,
  passphrase?: string,
  vaultPath?: string
): string {
  return exportWallet(nameOrId, passphrase, vaultPath);
}

/**
 * List all OWS wallets.
 */
export function listOwsWallets(vaultPath?: string) {
  return listWallets(vaultPath);
}

/**
 * Delete an OWS wallet.
 */
export function deleteOwsWallet(nameOrId: string, vaultPath?: string) {
  return deleteWallet(nameOrId, vaultPath);
}

// ═══ Internal ═══════════════════════════════════════════════════════════

function mapChainName(caip2Id: string): string {
  const names: Record<string, string> = {
    'eip155:1': 'Ethereum',
    'eip155:8453': 'Base',
    'eip155:84532': 'Base Sepolia',
    'eip155:42161': 'Arbitrum',
    'eip155:10': 'Optimism',
    'eip155:137': 'Polygon',
    'solana:mainnet': 'Solana',
    'solana:devnet': 'Solana Devnet',
    'stellar:pubnet': 'Stellar',
    'xrpl:mainnet': 'XRPL',
    'bip122:000000000019d6689c085ae165831e93': 'Bitcoin',
  };
  return names[caip2Id] ?? caip2Id;
}
