/**
 * Tests for OWS Adapter — bridges @open-wallet-standard/core to ASG Pay.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock @open-wallet-standard/core
vi.mock('@open-wallet-standard/core', () => ({
  createWallet: vi.fn().mockReturnValue({
    id: 'test-uuid',
    name: 'test-wallet',
    accounts: [
      { chainId: 'eip155:1', address: '0xTestAddr', derivationPath: "m/44'/60'/0'/0/0" },
      { chainId: 'solana:5eykt4', address: '7Kz9TestSolAddr', derivationPath: "m/44'/501'/0'/0'" },
    ],
    createdAt: '2026-01-01T00:00:00Z',
  }),
  getWallet: vi.fn().mockImplementation(() => {
    throw new Error('Wallet not found');
  }),
  listWallets: vi.fn().mockReturnValue([]),
  signMessage: vi.fn().mockReturnValue({ signature: '0xSigHex', recoveryId: 0 }),
  signTransaction: vi.fn().mockReturnValue({ signature: '0xTxSigHex' }),
  signAndSend: vi.fn().mockReturnValue({ txHash: '0xTxHashResult' }),
  createPolicy: vi.fn(),
  createApiKey: vi.fn().mockReturnValue({ token: 'ows_key_test123', id: 'key-id', name: 'test-key' }),
  deleteWallet: vi.fn(),
  exportWallet: vi.fn().mockReturnValue('goose puzzle decorate much ...'),
  importWalletMnemonic: vi.fn().mockReturnValue({ id: 'imported-uuid', name: 'imported', accounts: [] }),
  importWalletPrivateKey: vi.fn().mockReturnValue({ id: 'pk-uuid', name: 'pk-wallet', accounts: [] }),
}));

import {
  createOwsAdapter,
  createOwsPolicy,
  createOwsAgentKey,
  importOwsWallet,
  importOwsWalletFromKey,
  exportOwsWallet,
  listOwsWallets,
  deleteOwsWallet,
} from '../adapters/ows';

import {
  createWallet,
  getWallet,
  signAndSend,
  signTransaction,
  createPolicy,
  createApiKey,
  exportWallet,
  importWalletMnemonic,
  importWalletPrivateKey,
  deleteWallet,
  listWallets,
} from '@open-wallet-standard/core';

describe('OWS Adapter', () => {
  describe('createOwsAdapter()', () => {
    it('should create adapter with correct chain metadata', () => {
      const adapter = createOwsAdapter({
        walletName: 'test-wallet',
        chain: 'evm',
        chainId: 'eip155:8453',
      });

      expect(adapter.chainName).toBe('Base');
      expect(adapter.caip2Id).toBe('eip155:8453');
    });

    it('should auto-create wallet if not found', () => {
      createOwsAdapter({
        walletName: 'new-wallet',
        chain: 'evm',
        chainId: 'eip155:8453',
      });

      expect(getWallet).toHaveBeenCalledWith('new-wallet', undefined);
      expect(createWallet).toHaveBeenCalledWith('new-wallet', undefined, 12, undefined);
    });

    it('should return correct address', () => {
      const adapter = createOwsAdapter({
        walletName: 'test-wallet',
        chain: 'evm',
        chainId: 'eip155:1',
      });

      expect(adapter.getAddress()).toBe('0xTestAddr');
    });

    it('should pay using signAndSend for EVM', async () => {
      const adapter = createOwsAdapter({
        walletName: 'test-wallet',
        chain: 'evm',
        chainId: 'eip155:8453',
        rpcUrl: 'https://mainnet.base.org',
      });

      const txHash = await adapter.pay('0xDest', '1000000');
      expect(txHash).toBe('0xTxHashResult');
      expect(signAndSend).toHaveBeenCalled();
    });

    it('should pay using signTransaction for non-EVM', async () => {
      const adapter = createOwsAdapter({
        walletName: 'test-wallet',
        chain: 'solana',
        chainId: 'solana:mainnet',
      });

      const sig = await adapter.pay('7Kz9Dest', '1000000');
      expect(sig).toBe('0xTxSigHex');
      expect(signTransaction).toHaveBeenCalled();
    });

    it('should return 0 for getBalance()', async () => {
      const adapter = createOwsAdapter({
        walletName: 'test-wallet',
        chain: 'evm',
        chainId: 'eip155:8453',
      });

      const balance = await adapter.getBalance();
      expect(balance).toBe('0');
    });

    it('should use logger when provided', () => {
      const logs: string[] = [];
      createOwsAdapter({
        walletName: 'test-wallet',
        chain: 'evm',
        chainId: 'eip155:8453',
        logger: (msg) => logs.push(msg),
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(l => l.includes('[OWS]'))).toBe(true);
    });
  });

  describe('Policy Management', () => {
    it('should create spending policy', () => {
      createOwsPolicy({
        id: 'budget-policy',
        name: 'Agent budget',
        allowedChains: ['eip155:8453'],
        expiresAt: '2026-12-31T23:59:59Z',
      });

      expect(createPolicy).toHaveBeenCalled();
      const callArg = (createPolicy as any).mock.calls[0][0];
      const parsed = JSON.parse(callArg);
      expect(parsed.id).toBe('budget-policy');
      expect(parsed.rules).toHaveLength(2);
      expect(parsed.rules[0].type).toBe('allowed_chains');
      expect(parsed.rules[1].type).toBe('expires_at');
    });
  });

  describe('API Key Management', () => {
    it('should create scoped agent key', () => {
      const result = createOwsAgentKey({
        name: 'claude-agent',
        walletName: 'test-wallet',
        policyIds: ['budget-policy'],
        passphrase: 'secret',
      });

      expect(result.token).toBe('ows_key_test123');
      expect(createApiKey).toHaveBeenCalledWith(
        'claude-agent',
        ['test-wallet'],
        ['budget-policy'],
        'secret',
        undefined,
        undefined,
      );
    });
  });

  describe('Wallet Import/Export', () => {
    it('should import from mnemonic', () => {
      importOwsWallet('imported', 'goose puzzle decorate much ...');
      expect(importWalletMnemonic).toHaveBeenCalled();
    });

    it('should import from private key', () => {
      importOwsWalletFromKey('pk-wallet', '0x1234abcd', 'evm');
      expect(importWalletPrivateKey).toHaveBeenCalled();
    });

    it('should export mnemonic', () => {
      const phrase = exportOwsWallet('test-wallet');
      expect(phrase).toBe('goose puzzle decorate much ...');
      expect(exportWallet).toHaveBeenCalledWith('test-wallet', undefined, undefined);
    });

    it('should list wallets', () => {
      listOwsWallets();
      expect(listWallets).toHaveBeenCalled();
    });

    it('should delete wallet', () => {
      deleteOwsWallet('test-wallet');
      expect(deleteWallet).toHaveBeenCalledWith('test-wallet', undefined);
    });
  });
});
