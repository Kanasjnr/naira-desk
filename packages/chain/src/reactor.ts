import { parseAbi } from "viem";

// Textile's LimitOrderReactor on Celo, a UniswapX reactor. Every vault fill goes through it.
export const REACTOR = "0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3";

export const reactorAbi = parseAbi([
  "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)",
]);
