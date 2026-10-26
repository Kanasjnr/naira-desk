import { parseAbi } from "viem";

// Uniswap's SwapRouter02 on Celo. The Taker sells what it bought through it.
export const SWAP_ROUTER = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";

// packages/contracts/src/Taker.sol
export const takerAbi = parseAbi([
  "constructor(address owner, address reactor, address usdt, address router)",
  "function owner() view returns (address)",
  "function reactor() view returns (address)",
  "function usdt() view returns (address)",
  "function router() view returns (address)",
  "function take(bytes swap, address token, uint24 fee, uint256 minProfit) returns (uint256 profit)",
  "function withdraw(address token, address to, uint256 amount)",
  "function boundHash(bytes32 hash) view returns (bytes32)",
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
  "event Took(address indexed token, uint256 amount, uint256 spent, uint256 received)",
  "error NotOwner()",
  "error NoProfit(uint256 before, uint256 afterwards)",
]);
