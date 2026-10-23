/** Celo mainnet. The hackathon only counts mainnet activity. */
export const CELO_CHAIN_ID = 42220;

/**
 * ERC-8021 attribution code issued to this project at enrollment.
 * Every transaction we send must carry it, starting with the first one.
 */
export const ATTRIBUTION_CODE = "celo_1944046be211";

/** Tether USD on Celo, 6 decimals. */
export const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";

/** cNGN, the naira stablecoin, 6 decimals. */
export const CNGN = "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f";

/**
 * Wallets we control: the agent, the operator and Stitch's strategy signer.
 * Their trades and deposits never count as independent volume or LPs.
 */
export const OUR_WALLETS = [
  "0xE4D88C9A86bd42D4f5D05a234E6D56f71bB58582",
  "0xa1599790B763E537bd15b5b912012e5Fb65491a3",
  "0x6DAeA09da609B3E6dc6f1E33ed9a325CdF6A562a",
] as const;
