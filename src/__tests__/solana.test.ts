import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

// Mock @solana/web3.js
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual<typeof import('@solana/web3.js')>('@solana/web3.js');
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getBalance: vi.fn().mockResolvedValue(5 * actual.LAMPORTS_PER_SOL),
      sendTransaction: vi.fn().mockResolvedValue('mocksig123abc'),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
      getAccountInfo: vi.fn().mockResolvedValue(null),
      requestAirdrop: vi.fn().mockResolvedValue('airdrop_sig_123'),
    })),
  };
});

// Mock @solana/spl-token
vi.mock('@solana/spl-token', () => ({
  getOrCreateAssociatedTokenAccount: vi.fn().mockResolvedValue({
    address: new (require('@solana/web3.js').PublicKey)('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
    amount: BigInt(1_000_000), // 1 USDC
  }),
  createTransferInstruction: vi.fn().mockReturnValue({
    programId: new (require('@solana/web3.js').PublicKey)('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    keys: [],
    data: Buffer.from([]),
  }),
  getMint: vi.fn(),
  getAccount: vi.fn().mockResolvedValue({ amount: BigInt(5_000_000) }),
  TOKEN_PROGRAM_ID: new (require('@solana/web3.js').PublicKey)('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
}));

import { SolanaPaymentAdapter } from '../adapters/solana';

describe('SolanaPaymentAdapter', () => {
  const testKeypair = Keypair.generate();

  // ── Constructor ────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates adapter with default options (devnet, SOL)', () => {
      const adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
      });
      expect(adapter.chainName).toBe('Solana Devnet');
      expect(adapter.caip2Id).toContain('solana:');
      expect(adapter.getAddress()).toBe(testKeypair.publicKey.toBase58());
    });

    it('creates adapter for mainnet-beta', () => {
      const adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
        network: 'mainnet-beta',
      });
      expect(adapter.chainName).toBe('Solana Mainnet');
      expect(adapter.caip2Id).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    });

    it('creates adapter for testnet', () => {
      const adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
        network: 'testnet',
      });
      expect(adapter.chainName).toBe('Solana Testnet');
    });

    it('generates random keypair if no secretKey provided', () => {
      const adapter = new SolanaPaymentAdapter({});
      expect(adapter.getAddress()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
      expect(adapter.getAddress().length).toBeGreaterThan(30);
    });

    it('accepts number[] secretKey', () => {
      const arr = Array.from(testKeypair.secretKey);
      const adapter = new SolanaPaymentAdapter({
        secretKey: arr,
      });
      expect(adapter.getAddress()).toBe(testKeypair.publicKey.toBase58());
    });

    it('accepts custom RPC URL', () => {
      const adapter = new SolanaPaymentAdapter({
        rpcUrl: 'https://my-custom-rpc.com',
      });
      expect(adapter.chainName).toBe('Solana Devnet');
    });

    it('defaults to SOL asset', () => {
      const adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
      });
      // Verify it works as SOL adapter
      expect(adapter.chainName).toContain('Solana');
    });

    it('accepts USDC asset', () => {
      const adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
        asset: 'USDC',
      });
      expect(adapter.chainName).toContain('Solana');
    });
  });

  // ── SOL Payments ──────────────────────────────────────────────

  describe('SOL payments', () => {
    let adapter: SolanaPaymentAdapter;
    let logs: string[];

    beforeEach(() => {
      logs = [];
      adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
        network: 'devnet',
        asset: 'SOL',
        logger: (msg) => logs.push(msg),
      });
    });

    it('sends SOL successfully', async () => {
      const dest = Keypair.generate().publicKey.toBase58();
      const result = await adapter.pay(dest, String(LAMPORTS_PER_SOL), 'devnet');
      expect(result).toBe('mocksig123abc');
      expect(logs.some(l => l.includes('🚀'))).toBe(true);
      expect(logs.some(l => l.includes('✅'))).toBe(true);
    });

    it('returns null on insufficient balance', async () => {
      const dest = Keypair.generate().publicKey.toBase58();
      // Request 100 SOL (balance is only 5)
      const result = await adapter.pay(dest, String(100 * LAMPORTS_PER_SOL), 'devnet');
      expect(result).toBeNull();
      expect(logs.some(l => l.includes('Insufficient'))).toBe(true);
    });

    it('returns null on error', async () => {
      // Invalid destination
      const result = await adapter.pay('invalid', '1000', 'devnet');
      expect(result).toBeNull();
      expect(logs.some(l => l.includes('❌'))).toBe(true);
    });
  });

  // ── USDC Payments ─────────────────────────────────────────────

  describe('USDC payments', () => {
    let adapter: SolanaPaymentAdapter;
    let logs: string[];

    beforeEach(() => {
      logs = [];
      adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
        network: 'devnet',
        asset: 'USDC',
        logger: (msg) => logs.push(msg),
      });
    });

    it('sends USDC successfully', async () => {
      const dest = Keypair.generate().publicKey.toBase58();
      const result = await adapter.pay(dest, '500000', 'devnet'); // 0.5 USDC
      expect(result).toBe('mocksig123abc');
      expect(logs.some(l => l.includes('USDC'))).toBe(true);
    });

    it('returns null on insufficient USDC balance', async () => {
      const dest = Keypair.generate().publicKey.toBase58();
      // Request 5 USDC (mock only has 1)
      const result = await adapter.pay(dest, '5000000', 'devnet');
      expect(result).toBeNull();
      expect(logs.some(l => l.includes('Insufficient'))).toBe(true);
    });
  });

  // ── Balance ───────────────────────────────────────────────────

  describe('balance checks', () => {
    it('returns SOL balance', async () => {
      const adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
      });
      const balance = await adapter.getSolBalance();
      expect(balance).toBe('5.000000000');
    });
  });

  // ── Airdrop ───────────────────────────────────────────────────

  describe('airdrop', () => {
    it('requests airdrop on devnet', async () => {
      const logs: string[] = [];
      const adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
        network: 'devnet',
        logger: (msg) => logs.push(msg),
      });
      const sig = await adapter.requestAirdrop(2);
      expect(sig).toBe('airdrop_sig_123');
      expect(logs.some(l => l.includes('Airdrop'))).toBe(true);
    });

    it('rejects airdrop on mainnet', async () => {
      const logs: string[] = [];
      const adapter = new SolanaPaymentAdapter({
        secretKey: testKeypair.secretKey,
        network: 'mainnet-beta',
        logger: (msg) => logs.push(msg),
      });
      const sig = await adapter.requestAirdrop();
      expect(sig).toBeNull();
      expect(logs.some(l => l.includes('Cannot airdrop on mainnet'))).toBe(true);
    });
  });

  // ── CAIP-2 ────────────────────────────────────────────────────

  describe('CAIP-2 identifiers', () => {
    it('mainnet uses genesis hash', () => {
      const adapter = new SolanaPaymentAdapter({
        network: 'mainnet-beta',
      });
      expect(adapter.caip2Id).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    });

    it('devnet uses devnet hash', () => {
      const adapter = new SolanaPaymentAdapter({
        network: 'devnet',
      });
      expect(adapter.caip2Id).toBe('solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z');
    });
  });
});
