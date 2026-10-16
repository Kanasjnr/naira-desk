import { parseAbi } from "viem";

// USDC, USDT and USAT on Celo all implement EIP-3009.
export const eip3009Abi = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);
