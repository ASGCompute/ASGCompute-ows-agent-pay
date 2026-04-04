import * as StellarSdk from '@stellar/stellar-sdk';
import { PaymentAdapter } from './types';
import { Logger, noopLogger } from '../logger';

/** Circle's official USDC issuer on Stellar mainnet. */
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

export interface StellarPaymentAdapterOptions {
  /** Stellar secret key for the agent's wallet. */
  secretKey: string;
  /**
   * Asset to settle with:
   * - 'XLM' — native lumens (default for testnet)
   * - 'USDC' — Circle's native USDC on Stellar (recommended for production)
   */
  asset?: 'XLM' | 'USDC';
  /**
   * Network: 'mainnet' | 'testnet' (default: 'testnet').
   * Determines Horizon URL, network passphrase, and CAIP-2 ID.
   */
  network?: 'mainnet' | 'testnet';
  /** Override the Horizon URL. */
  horizonUrl?: string;
  /** Optional logger. */
  logger?: Logger;
}

/**
 * StellarPaymentAdapter — On-chain settlement on the Stellar network.
 *
 * Supports:
 * - Native XLM payments (testnet default)
 * - Circle USDC payments (production recommended)
 *
 * The production ASG Pay stack settles USDC on Stellar mainnet.
 * @see https://pay.asgcard.dev
 * @see https://stellar.org/usdc
 */
export class StellarPaymentAdapter implements PaymentAdapter {
  public readonly chainName = 'Stellar';
  public readonly caip2Id: string;

  private keypair: StellarSdk.Keypair;
  private server: StellarSdk.Horizon.Server;
  private networkPassphrase: string;
  private assetType: 'XLM' | 'USDC';
  private log: Logger;

  constructor(options: StellarPaymentAdapterOptions) {
    this.keypair = StellarSdk.Keypair.fromSecret(options.secretKey);
    this.log = options.logger ?? noopLogger;
    this.assetType = options.asset ?? 'XLM';

    const isMainnet = options.network === 'mainnet';

    this.networkPassphrase = isMainnet
      ? StellarSdk.Networks.PUBLIC
      : StellarSdk.Networks.TESTNET;

    this.caip2Id = isMainnet ? 'stellar:pubnet' : 'stellar:testnet';

    this.server = new StellarSdk.Horizon.Server(
      options.horizonUrl ??
        (isMainnet
          ? 'https://horizon.stellar.org'
          : 'https://horizon-testnet.stellar.org')
    );
  }

  getAddress(): string {
    return this.keypair.publicKey();
  }

  /**
   * Get the Stellar asset object based on configuration.
   * - XLM: native asset (no trustline needed)
   * - USDC: Circle's issued USDC (trustline required)
   */
  private getAsset(): StellarSdk.Asset {
    if (this.assetType === 'USDC') {
      return new StellarSdk.Asset('USDC', USDC_ISSUER);
    }
    return StellarSdk.Asset.native();
  }

  /**
   * Convert atomic units to human-readable amount.
   * Stellar uses 7 decimal places (stroops) for all assets.
   */
  private formatAmount(stroops: string): string {
    return (parseInt(stroops, 10) / 1e7).toFixed(7);
  }

  public async pay(
    destination: string,
    amount: string,
    network: string
  ): Promise<string | null> {
    try {
      const asset = this.getAsset();
      const humanAmount = this.formatAmount(amount);
      const assetLabel = this.assetType === 'USDC' ? 'USDC' : 'XLM';

      this.log(
        `[Stellar/${assetLabel}] 🚀 ${humanAmount} → ${destination.slice(0, 10)}…`
      );

      const sourceAccount = await this.server.loadAccount(
        this.keypair.publicKey()
      );

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination,
            asset,
            amount: humanAmount,
          })
        )
        .setTimeout(30)
        .build();

      tx.sign(this.keypair);

      this.log(`[Stellar/${assetLabel}] 📡 Submitting…`);
      const response = await this.server.submitTransaction(tx);
      this.log(`[Stellar/${assetLabel}] ✅ ${response.hash}`);

      return response.hash;
    } catch (error: any) {
      const detail = error?.response?.data?.extras?.result_codes || error.message;
      this.log(`[Stellar] ❌ ${JSON.stringify(detail)}`);
      return null;
    }
  }

  /**
   * Check if the account has a USDC trustline.
   * Returns false if using XLM or if the trustline exists.
   * Returns true if USDC is selected but trustline is missing.
   */
  public async needsTrustline(): Promise<boolean> {
    if (this.assetType !== 'USDC') return false;

    try {
      const account = await this.server.loadAccount(this.keypair.publicKey());
      const hasTrustline = account.balances.some(
        (b: any) =>
          b.asset_type !== 'native' &&
          b.asset_code === 'USDC' &&
          b.asset_issuer === USDC_ISSUER
      );
      return !hasTrustline;
    } catch {
      return true;
    }
  }

  /**
   * Establish a USDC trustline (required before receiving USDC).
   * Only needed once per account.
   */
  public async createUsdcTrustline(): Promise<string | null> {
    try {
      this.log('[Stellar/USDC] 🔗 Creating USDC trustline…');

      const sourceAccount = await this.server.loadAccount(
        this.keypair.publicKey()
      );

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.changeTrust({
            asset: new StellarSdk.Asset('USDC', USDC_ISSUER),
          })
        )
        .setTimeout(30)
        .build();

      tx.sign(this.keypair);
      const response = await this.server.submitTransaction(tx);
      this.log(`[Stellar/USDC] ✅ Trustline created: ${response.hash}`);
      return response.hash;
    } catch (error: any) {
      this.log(`[Stellar/USDC] ❌ Trustline failed: ${error.message}`);
      return null;
    }
  }
}
