import { describe, it, expect } from 'vitest';
import { buildEip681Uri } from '../requests/eip681';
import { buildSep7Uri } from '../requests/sep7';
import { buildSolanaPayUri } from '../requests/solana-pay';
import { buildPaymentUri } from '../requests/universal';

// ── EIP-681 ──────────────────────────────────────────────────────────

describe('buildEip681Uri', () => {
  it('builds native ETH URI', () => {
    const uri = buildEip681Uri({ to: '0xABC', amount: '1.5' });
    expect(uri).toContain('ethereum:0xABC');
    expect(uri).toContain('value=1500000000000000000');
  });

  it('builds native ETH URI with chain ID', () => {
    const uri = buildEip681Uri({ to: '0xABC', amount: '0.01', chainId: 8453 });
    expect(uri).toContain('chainId=8453');
  });

  it('omits chainId for mainnet', () => {
    const uri = buildEip681Uri({ to: '0xABC', amount: '1', chainId: 1 });
    expect(uri).not.toContain('chainId');
  });

  it('builds ERC-20 USDC transfer URI', () => {
    const uri = buildEip681Uri({
      to: '0xRECIPIENT',
      amount: '10',
      asset: '0xUSDC_CONTRACT',
      decimals: 6,
    });
    expect(uri).toContain('ethereum:0xUSDC_CONTRACT/transfer');
    expect(uri).toContain('address=0xRECIPIENT');
    expect(uri).toContain('uint256=10000000');
  });

  it('handles fractional amounts', () => {
    const uri = buildEip681Uri({
      to: '0xABC',
      amount: '0.5',
      asset: '0xUSDC',
      decimals: 6,
    });
    expect(uri).toContain('uint256=500000');
  });

  it('handles zero amount', () => {
    const uri = buildEip681Uri({ to: '0xABC', amount: '0' });
    expect(uri).toContain('value=0');
  });

  it('treats "ETH" asset as native', () => {
    const uri = buildEip681Uri({ to: '0xABC', amount: '1', asset: 'ETH' });
    expect(uri).not.toContain('/transfer');
    expect(uri).toContain('value=');
  });
});

// ── SEP-7 ────────────────────────────────────────────────────────────

describe('buildSep7Uri', () => {
  it('builds native XLM URI', () => {
    const uri = buildSep7Uri({ destination: 'GABCD', amount: '100' });
    expect(uri).toBe('web+stellar:pay?destination=GABCD&amount=100');
  });

  it('includes asset_code and asset_issuer for USDC', () => {
    const uri = buildSep7Uri({
      destination: 'GABCD',
      amount: '50',
      assetCode: 'USDC',
      assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    });
    expect(uri).toContain('asset_code=USDC');
    expect(uri).toContain('asset_issuer=GA5Z');
  });

  it('includes memo', () => {
    const uri = buildSep7Uri({
      destination: 'GABCD',
      amount: '10',
      memo: 'invoice-42',
    });
    expect(uri).toContain('memo=invoice-42');
    expect(uri).toContain('memo_type=MEMO_TEXT');
  });

  it('includes callback and origin_domain', () => {
    const uri = buildSep7Uri({
      destination: 'GABCD',
      amount: '1',
      callback: 'https://api.test.com/callback',
      originDomain: 'test.com',
    });
    expect(uri).toContain('callback=');
    expect(uri).toContain('origin_domain=test.com');
  });

  it('omits asset fields for XLM', () => {
    const uri = buildSep7Uri({ destination: 'GABCD', amount: '100', assetCode: 'XLM' });
    expect(uri).not.toContain('asset_code');
    expect(uri).not.toContain('asset_issuer');
  });
});

// ── Solana Pay ───────────────────────────────────────────────────────

describe('buildSolanaPayUri', () => {
  it('builds native SOL URI', () => {
    const uri = buildSolanaPayUri({ recipient: '7abc', amount: '1.5' });
    expect(uri).toBe('solana:7abc?amount=1.5');
  });

  it('includes SPL token mint', () => {
    const uri = buildSolanaPayUri({
      recipient: '7abc',
      amount: '25.00',
      splToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    });
    expect(uri).toContain('spl-token=EPjFWdd5');
  });

  it('includes label and message', () => {
    const uri = buildSolanaPayUri({
      recipient: '7abc',
      amount: '10',
      label: 'ASG Pay',
      message: 'Service fee',
    });
    expect(uri).toContain('label=ASG+Pay');
    expect(uri).toContain('message=Service+fee');
  });

  it('includes reference for tracking', () => {
    const uri = buildSolanaPayUri({
      recipient: '7abc',
      amount: '5',
      reference: 'ref123',
    });
    expect(uri).toContain('reference=ref123');
  });

  it('includes memo', () => {
    const uri = buildSolanaPayUri({
      recipient: '7abc',
      amount: '1',
      memo: 'order-42',
    });
    expect(uri).toContain('memo=order-42');
  });
});

// ── Universal Builder ────────────────────────────────────────────────

describe('buildPaymentUri', () => {
  it('routes to EIP-681 for evm', () => {
    const uri = buildPaymentUri({
      chain: 'evm',
      evm: { to: '0xABC', amount: '1' },
    });
    expect(uri).toContain('ethereum:');
  });

  it('routes to SEP-7 for stellar', () => {
    const uri = buildPaymentUri({
      chain: 'stellar',
      stellar: { destination: 'GABCD', amount: '100' },
    });
    expect(uri).toContain('web+stellar:');
  });

  it('routes to Solana Pay for solana', () => {
    const uri = buildPaymentUri({
      chain: 'solana',
      solana: { recipient: '7abc', amount: '5' },
    });
    expect(uri).toContain('solana:');
  });

  it('throws when options missing for chain', () => {
    expect(() => buildPaymentUri({ chain: 'evm' })).toThrow();
    expect(() => buildPaymentUri({ chain: 'stellar' })).toThrow();
    expect(() => buildPaymentUri({ chain: 'solana' })).toThrow();
  });

  it('throws for unsupported chain', () => {
    expect(() => buildPaymentUri({ chain: 'bitcoin' as any })).toThrow();
  });
});
