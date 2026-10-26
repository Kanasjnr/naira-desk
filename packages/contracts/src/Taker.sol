// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

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
/// @dev The owner is a hot key that trades. Even with that key, funds only ever leave to
/// `beneficiary`: `take` can't lower the USD₮ balance, `withdraw` pays nobody else, and the only
/// signature the contract accepts is Textile's taker-control message.
contract Taker is IERC1271 {
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public immutable beneficiary;
    address public immutable reactor;
    IERC20 public immutable usdt;
    ISwapRouter02 public immutable router;

    event Took(address indexed token, uint256 amount, uint256 spent, uint256 received);

    error Unauthorized();
    error NoProfit(uint256 before, uint256 afterwards);

    constructor(
        address owner_,
        address beneficiary_,
        address reactor_,
        IERC20 usdt_,
        ISwapRouter02 router_
    ) {
        owner = owner_;
        beneficiary = beneficiary_;
        reactor = reactor_;
        usdt = usdt_;
        router = router_;
    }

    /// @param swap Textile's `transactions.swap.data` for a firm quote whose taker is this contract.
    /// @param fee The Uniswap pool's fee tier for `token`/USD₮.
    function take(bytes calldata swap, IERC20 token, uint24 fee, uint256 minProfit)
        external
        returns (uint256 profit)
    {
        if (msg.sender != owner) revert Unauthorized();
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
    function withdraw(IERC20 token, uint256 amount) external {
        if (msg.sender != owner && msg.sender != beneficiary) revert Unauthorized();
        if (address(token) == address(0)) Address.sendValue(payable(beneficiary), amount);
        else token.safeTransfer(beneficiary, amount);
    }

    /// @dev The reactor sends any native CELO it holds to the filler at the end of a fill, so
    /// refusing it would let anyone block every take with 1 wei.
    receive() external payable {}

    /// @notice Textile checks the owner controls this taker by asking it to vouch for its
    /// taker-control message. Celo's USD₮ also asks here for permits and transfer authorizations,
    /// so the message is rebuilt from this contract's own address and chain and nothing else passes.
    /// @param signature The nonce and issuedAt sent to Textile, then the owner's signature of the
    /// message: 32 + 32 + 65 bytes.
    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        if (signature.length != 129) return 0xffffffff;
        bytes32 nonce = bytes32(signature[:32]);
        uint256 issuedAt = uint256(bytes32(signature[32:64]));
        if (hash != MessageHashUtils.toEthSignedMessageHash(bytes(takerControl(nonce, issuedAt)))) {
            return 0xffffffff;
        }
        (address signer, ECDSA.RecoverError error,) = ECDSA.tryRecover(hash, signature[64:]);
        return error == ECDSA.RecoverError.NoError && signer == owner
            ? IERC1271.isValidSignature.selector
            : bytes4(0xffffffff);
    }

    /// @notice Textile's `eip191` taker-control text for this contract.
    function takerControl(bytes32 nonce, uint256 issuedAt) public view returns (string memory) {
        return string.concat(
            "Textile Taker Control\nVersion: 1\n\nSign to prove you control this wallet so Textile can request a firm\nquote for it. This does not approve any transfer, trade or allowance.\n\nWallet: ",
            Strings.toHexString(address(this)),
            "\nChain: ",
            Strings.toString(block.chainid),
            "\nNonce: ",
            Strings.toHexString(uint256(nonce), 32),
            "\nIssued at: ",
            Strings.toString(issuedAt)
        );
    }
}
