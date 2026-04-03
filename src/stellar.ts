import * as StellarSdk from '@stellar/stellar-sdk';

export interface StellarPaymentAdapterOptions {
  /** Stellar secret key for the agent's wallet. */
  secretKey: string;
  /** Override the network passphrase (default: Testnet). */
  networkPassphrase?: string;
  /** Override the Horizon URL (default: Testnet Horizon). */
  horizonUrl?: string;
}

/**
 * StellarPaymentAdapter — Executes on-chain Stellar payments.
 *
 * In the production ASG Pay stack the adapter targets USDC on Stellar
 * mainnet (see https://pay.asgcard.dev). For hackathon purposes it
 * defaults to Stellar Testnet with native XLM.
 */
export class StellarPaymentAdapter {
  private keypair: StellarSdk.Keypair;
  private server: StellarSdk.Horizon.Server;
  private networkPassphrase: string;

  constructor(options: StellarPaymentAdapterOptions) {
    this.keypair = StellarSdk.Keypair.fromSecret(options.secretKey);
    this.networkPassphrase =
      options.networkPassphrase || StellarSdk.Networks.TESTNET;
    this.server = new StellarSdk.Horizon.Server(
      options.horizonUrl || 'https://horizon-testnet.stellar.org'
    );
  }

  /**
   * Send `amount` (in stroops) of native XLM to `destination`.
   * Returns the transaction hash on success, or `null` on failure.
   */
  public async pay(
    destination: string,
    amount: string,
    network: string
  ): Promise<string | null> {
    try {
      console.log(
        `[Stellar] 🚀 Building payment → ${destination} (${amount} stroops, ${network})`
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
            asset: StellarSdk.Asset.native(),
            amount: (parseInt(amount) / 10_000_000).toFixed(7),
          })
        )
        .setTimeout(30)
        .build();

      tx.sign(this.keypair);

      console.log('[Stellar] 📡 Submitting transaction…');
      const response = await this.server.submitTransaction(tx);
      console.log(`[Stellar] ✅ Confirmed — hash: ${response.hash}`);

      return response.hash;
    } catch (error: any) {
      console.error(
        '[Stellar] ❌ Transaction failed:',
        error?.response?.data || error.message
      );
      return null;
    }
  }
}
