// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ISwapRouter02} from "./Taker.sol";

/// @notice Code the agent wallet runs as its own through EIP-7702, so it fills Textile quotes made
/// out to itself and sells what it bought on Uniswap in the same transaction, from its own balance.
/// A trade that doesn't grow its USD₮ by `minProfit` reverts.
/// @dev Holds no storage, so it never collides with anything the wallet delegated to before.
contract AgentDelegate is IERC1271 {
    using SafeERC20 for IERC20;

    address public immutable reactor;
    IERC20 public immutable usdt;
    ISwapRouter02 public immutable router;

    event Took(address indexed token, uint256 amount, uint256 spent, uint256 received);

    error Unauthorized();
    error NoProfit(uint256 before, uint256 afterwards);

    constructor(address reactor_, IERC20 usdt_, ISwapRouter02 router_) {
        reactor = reactor_;
        usdt = usdt_;
        router = router_;
    }

    /// @param swap Textile's `transactions.swap.data` for a firm quote whose taker is this wallet.
    /// @param fee The Uniswap pool's fee tier for `token`/USD₮.
    function take(bytes calldata swap, IERC20 token, uint24 fee, uint256 minProfit)
        external
        returns (uint256 profit)
    {
        // Under EIP-7702 only the wallet's own transactions call it as itself.
        if (msg.sender != address(this)) revert Unauthorized();
        uint256 start = usdt.balanceOf(address(this));
        uint256 held = token.balanceOf(address(this));
        usdt.forceApprove(reactor, start);
        (bool ok, bytes memory reason) = reactor.call(swap);
        if (!ok) {
            assembly {
                revert(add(reason, 32), mload(reason))
            }
        }
        usdt.forceApprove(reactor, 0);
        uint256 spent = start - usdt.balanceOf(address(this));

        // Only what this fill bought is sold, never tokens the wallet already held.
        uint256 amount = token.balanceOf(address(this)) - held;
        token.forceApprove(address(router), amount);
        uint256 received = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: address(token),
                tokenOut: address(usdt),
                fee: fee,
                recipient: address(this),
                amountIn: amount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );

        uint256 end = usdt.balanceOf(address(this));
        if (end < start + minProfit) revert NoProfit(start, end);
        emit Took(address(token), amount, spent, received);
        return end - start;
    }

    /// @notice Contracts that check signatures through EIP-1271 once the wallet has code (USD₮ and
    /// USDC transfer authorizations, Textile's proof of control) get the answer a plain wallet
    /// gives: only the wallet's own key signs for it.
    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        (address signer, ECDSA.RecoverError error,) = ECDSA.tryRecover(hash, signature);
        return error == ECDSA.RecoverError.NoError && signer == address(this)
            ? IERC1271.isValidSignature.selector
            : bytes4(0xffffffff);
    }

    /// @dev The reactor sends any native CELO it holds to the filler at the end of a fill, and the
    /// wallet must keep receiving CELO for gas.
    receive() external payable {}
}
