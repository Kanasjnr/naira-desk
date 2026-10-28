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

/** Ripio's Brazilian real and Argentine peso, 18 decimals. */
export const WBRL = "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0";
export const WARS = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";

/**
 * Wallets we control: the agent, the operator, Stitch's strategy signer, the Taker and
 * the demo buyer of our own API. Their trades, deposits and purchases never count as
 * independent volume, LPs or sales.
 */
export const OUR_WALLETS = [
  "0xE4D88C9A86bd42D4f5D05a234E6D56f71bB58582",
  "0xa1599790B763E537bd15b5b912012e5Fb65491a3",
  "0x6DAeA09da609B3E6dc6f1E33ed9a325CdF6A562a",
  "0xcf024F46d1756498f3ffD04F1Da4793eE1eFdA57",
  "0x48fe78C8e5Cb3f2Ff22bffD5db987B16F560574F",
] as const;
