/**
 * Logger type for @asgcard/pay SDK.
 *
 * Pass `console.log` for verbose output, or provide a custom logger.
 * If omitted, the SDK is silent — no stdout pollution.
 */
export type Logger = (message: string, ...args: any[]) => void;

/** No-op logger — used when no logger is provided. */
export const noopLogger: Logger = () => {};
