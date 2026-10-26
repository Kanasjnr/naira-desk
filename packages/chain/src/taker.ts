import { type Address, parseAbi } from "viem";

// Deployed 26 Oct 2026, tx 0xcdb5822f257b08f33695c042ff602110d5021c49cfa748b2d1d589211e967630.
export const TAKER: Address = "0xcf024F46d1756498f3ffD04F1Da4793eE1eFdA57";
export const TAKER_DEPLOY_BLOCK = 81_120_840n;

// Uniswap's SwapRouter02 on Celo. The Taker sells what it bought through it.
export const SWAP_ROUTER = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";

// packages/contracts/src/Taker.sol
export const takerAbi = parseAbi([
  "constructor(address owner, address beneficiary, address reactor, address usdt, address router)",
  "function owner() view returns (address)",
  "function beneficiary() view returns (address)",
  "function reactor() view returns (address)",
  "function usdt() view returns (address)",
  "function router() view returns (address)",
  "function take(bytes swap, address token, uint24 fee, uint256 minProfit) returns (uint256 profit)",
  "function withdraw(address token, uint256 amount)",
  "function takerControl(bytes32 nonce, uint256 issuedAt) view returns (string)",
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
  "event Took(address indexed token, uint256 amount, uint256 spent, uint256 received)",
  "error Unauthorized()",
  "error NoProfit(uint256 before, uint256 afterwards)",
]);
