// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @notice Fills Textile quotes made out to it and sells what it bought on Uniswap in the same
/// transaction. A trade that doesn't grow its USD₮ by `minProfit` reverts.
contract Taker is IERC1271 {
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public immutable reactor;
    IERC20 public immutable usdt;
    ISwapRouter02 public immutable router;

    event Took(address indexed token, uint256 amount, uint256 spent, uint256 received);

    error NotOwner();
    error NoProfit(uint256 before, uint256 afterwards);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, address reactor_, IERC20 usdt_, ISwapRouter02 router_) {
        owner = owner_;
        reactor = reactor_;
        usdt = usdt_;
        router = router_;
    }

    /// @param swap Textile's `transactions.swap.data` for a firm quote whose taker is this contract.
    /// @param fee The Uniswap pool's fee tier for `token`/USD₮.
    function take(bytes calldata swap, IERC20 token, uint24 fee, uint256 minProfit)
        external
        onlyOwner
        returns (uint256 profit)
    {
        uint256 start = usdt.balanceOf(address(this));
        usdt.forceApprove(reactor, start);
        (bool ok, bytes memory reason) = reactor.call(swap);
        if (!ok) {
            assembly {
                revert(add(reason, 32), mload(reason))
            }
        }
        usdt.forceApprove(reactor, 0);
        uint256 spent = start - usdt.balanceOf(address(this));

        uint256 amount = token.balanceOf(address(this));
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

    /// @param token The token to send, or address(0) for native CELO.
    function withdraw(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (address(token) == address(0)) Address.sendValue(payable(to), amount);
        else token.safeTransfer(to, amount);
    }

    /// @dev The reactor sends any native CELO it holds to the filler at the end of a fill, so
    /// refusing it would let anyone block every take with 1 wei.
    receive() external payable {}

    /// @dev Textile checks the owner controls this taker through here. The owner signs the hash
    /// bound to this contract and chain, so no other signature of theirs passes as this contract's.
    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        (address signer, ECDSA.RecoverError error,) = ECDSA.tryRecover(boundHash(hash), signature);
        return error == ECDSA.RecoverError.NoError && signer == owner
            ? IERC1271.isValidSignature.selector
            : bytes4(0xffffffff);
    }

    function boundHash(bytes32 hash) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, hash));
    }
}
