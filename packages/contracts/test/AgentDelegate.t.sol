// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {AgentDelegate} from "../src/AgentDelegate.sol";
import {ISwapRouter02} from "../src/Taker.sol";

interface IUsdtAuthorization {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}

/// Replays the Taker's real Textile fills with the delegate's code at the quoted address, which is
/// what EIP-7702 delegation does to a wallet: the code runs as the wallet, on the wallet's balances.
contract AgentDelegateReplayTest is Test {
    using stdJson for string;

    address constant REACTOR = 0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3;
    IERC20 constant USDT = IERC20(0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e);
    IERC20 constant CNGN = IERC20(0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f);
    IERC20 constant WBRL = IERC20(0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0);
    ISwapRouter02 constant ROUTER = ISwapRouter02(0x5615CDAb10dc425a742d643d949a7F474C01abc4);
    address payable constant QUOTED_TAKER = payable(0x497F12830607015Ed5ec9736afe43aaF8496512f);

    uint256 constant CNGN_IN = 6_154_188_697;
    uint256 constant CNGN_SPENT = 4_456_053;
    uint256 constant CNGN_RECEIVED = 4_499_053;
    uint256 constant WBRL_PROFIT = 16_036_238;

    bytes32 constant TRANSFER_WITH_AUTHORIZATION = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    address thief = makeAddr("thief");
    uint256 deadline;

    function replay(string memory name) internal returns (AgentDelegate wallet, bytes memory swap) {
        string memory fixture = vm.readFile(string.concat("test/fixtures/", name, ".json"));
        vm.createSelectFork(
            vm.envOr("CELO_RPC_URL", string("https://forno.celo.org")), fixture.readUint(".block")
        );
        deadline = fixture.readUint(".deadline");
        vm.etch(QUOTED_TAKER, address(new AgentDelegate(REACTOR, USDT, ROUTER)).code);
        return (AgentDelegate(QUOTED_TAKER), fixture.readBytes(".swap"));
    }

    function take(AgentDelegate wallet, bytes memory swap, IERC20 token, uint256 minProfit)
        internal
        returns (uint256)
    {
        vm.prank(address(wallet));
        return wallet.take(swap, token, 100, minProfit);
    }

    function sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_TakesCngnUnderThePoolFromItsOwnBalance() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");
        uint256 start = USDT.balanceOf(address(wallet));

        vm.expectEmit(address(wallet));
        emit AgentDelegate.Took(address(CNGN), CNGN_IN, CNGN_SPENT, CNGN_RECEIVED);
        uint256 profit = take(wallet, swap, CNGN, 0);

        assertEq(profit, CNGN_RECEIVED - CNGN_SPENT);
        assertEq(USDT.balanceOf(address(wallet)), start + profit);
        assertEq(USDT.allowance(address(wallet), REACTOR), 0);
        assertEq(CNGN.allowance(address(wallet), address(ROUTER)), 0);
    }

    function test_TakesWbrlUnderThePool() public {
        (AgentDelegate wallet, bytes memory swap) = replay("wbrl");
        assertEq(take(wallet, swap, WBRL, 0), WBRL_PROFIT);
    }

    function test_NeverSellsTokensTheWalletAlreadyHeld() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");
        uint256 held = CNGN.balanceOf(address(wallet)) + 1_000e6;
        deal(address(CNGN), address(wallet), held);

        take(wallet, swap, CNGN, 0);

        assertEq(CNGN.balanceOf(address(wallet)), held);
    }

    function test_RevertsOneUnitShortOfTheMinProfit() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");
        uint256 start = USDT.balanceOf(address(wallet));
        uint256 profit = CNGN_RECEIVED - CNGN_SPENT;

        vm.expectRevert(
            abi.encodeWithSelector(AgentDelegate.NoProfit.selector, start, start + profit)
        );
        take(wallet, swap, CNGN, profit + 1);
    }

    // Someone else sells 30,000 wBRL into the pool first, so it no longer pays what the maker took.
    function test_RevertsWhenThePoolMovedFirst() public {
        (AgentDelegate wallet, bytes memory swap) = replay("wbrl");
        address rival = makeAddr("rival");
        deal(address(WBRL), rival, 30_000e18);
        vm.startPrank(rival);
        WBRL.approve(address(ROUTER), 30_000e18);
        ROUTER.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: address(WBRL),
                tokenOut: address(USDT),
                fee: 100,
                recipient: rival,
                amountIn: 30_000e18,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();

        uint256 start = USDT.balanceOf(address(wallet));
        vm.expectPartialRevert(AgentDelegate.NoProfit.selector);
        take(wallet, swap, WBRL, 0);
        assertEq(USDT.balanceOf(address(wallet)), start);
    }

    function test_OnlyTheQuotedWalletFills() public {
        (, bytes memory swap) = replay("cngn");
        address other = makeAddr("other wallet");
        vm.etch(other, address(new AgentDelegate(REACTOR, USDT, ROUTER)).code);
        deal(address(USDT), other, 10e6);

        vm.expectPartialRevert(bytes4(keccak256("FillerNotPreferred(address,uint256)")));
        take(AgentDelegate(payable(other)), swap, CNGN, 0);
    }

    function test_RevertsOnAnExpiredQuote() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");
        vm.warp(deadline + 1);

        vm.expectPartialRevert(bytes4(keccak256("SignatureExpired(uint256)")));
        take(wallet, swap, CNGN, 0);
    }

    function test_RevertsOnAQuoteAlreadyFilled() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");
        take(wallet, swap, CNGN, 0);

        vm.expectRevert(bytes4(keccak256("InvalidNonce()")));
        take(wallet, swap, CNGN, 0);
    }

    function test_RevertsWithoutEnoughUsdtToPay() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");
        deal(address(USDT), address(wallet), CNGN_SPENT - 1);

        vm.expectRevert();
        take(wallet, swap, CNGN, 0);
    }

    function test_RevertsWhenToldTheWrongToken() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");
        vm.expectRevert();
        take(wallet, swap, WBRL, 0);
    }

    function test_RevertsWithoutAPoolAtThatFee() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");
        vm.prank(address(wallet));
        vm.expectRevert();
        wallet.take(swap, CNGN, 500, 0);
    }

    // The reactor sends any CELO it holds to the filler, so 1 wei sent there mustn't block takes.
    function test_AcceptsCeloTheReactorRefunds() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");
        uint256 before = address(wallet).balance;
        vm.deal(REACTOR, 1);

        take(wallet, swap, CNGN, 0);
        assertEq(address(wallet).balance, before + 1);
    }

    function test_OnlyTheWalletItselfTrades() public {
        (AgentDelegate wallet, bytes memory swap) = replay("cngn");

        vm.prank(thief);
        vm.expectRevert(AgentDelegate.Unauthorized.selector);
        wallet.take(swap, CNGN, 100, 0);
    }

    function test_VouchesOnlyForTheWalletsOwnKey() public {
        (address agent, uint256 key) = makeAddrAndKey("agent");
        vm.etch(agent, address(new AgentDelegate(REACTOR, USDT, ROUTER)).code);
        bytes32 digest = keccak256("anything the agent signs");

        assertEq(
            AgentDelegate(payable(agent)).isValidSignature(digest, sign(key, digest)),
            IERC1271.isValidSignature.selector
        );
        (, uint256 otherKey) = makeAddrAndKey("someone else");
        assertEq(
            AgentDelegate(payable(agent)).isValidSignature(digest, sign(otherKey, digest)),
            bytes4(0xffffffff)
        );
    }

    function test_RejectsMalleableSignatures() public {
        (address agent, uint256 key) = makeAddrAndKey("agent");
        vm.etch(agent, address(new AgentDelegate(REACTOR, USDT, ROUTER)).code);
        bytes32 digest = keccak256("anything the agent signs");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory flipped = abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? 28 : 27);

        assertEq(
            AgentDelegate(payable(agent)).isValidSignature(digest, flipped), bytes4(0xffffffff)
        );
    }

    // Celo's USD₮ checks EIP-1271 once the wallet has code, so the agent's buy payments still pass
    // with its own key and nobody else can sign one.
    function test_UsdtTransferAuthorizationsStillNeedTheWalletsKey() public {
        replay("cngn");
        (address agent, uint256 key) = makeAddrAndKey("agent");
        vm.etch(agent, address(new AgentDelegate(REACTOR, USDT, ROUTER)).code);
        deal(address(USDT), agent, 20e6);
        IUsdtAuthorization usdt = IUsdtAuthorization(address(USDT));

        bytes32 digest = MessageHashUtils.toTypedDataHash(
            usdt.DOMAIN_SEPARATOR(),
            keccak256(
                abi.encode(
                    TRANSFER_WITH_AUTHORIZATION, agent, thief, 5e6, 0, type(uint256).max, bytes32(0)
                )
            )
        );
        (, uint256 otherKey) = makeAddrAndKey("someone else");
        vm.expectRevert();
        usdt.transferWithAuthorization(
            agent, thief, 5e6, 0, type(uint256).max, bytes32(0), sign(otherKey, digest)
        );

        usdt.transferWithAuthorization(
            agent, thief, 5e6, 0, type(uint256).max, bytes32(0), sign(key, digest)
        );
        assertEq(USDT.balanceOf(thief), 5e6);
    }

    // A real EIP-7702 delegation, as the agent will sign it on Celo (Isthmus runs Prague).
    function test_WorksThroughARealDelegation() public {
        vm.setEvmVersion("prague");
        (address agent, uint256 key) = makeAddrAndKey("agent");
        AgentDelegate delegate = new AgentDelegate(REACTOR, USDT, ROUTER);
        vm.signAndAttachDelegation(address(delegate), key);

        assertEq(agent.code, abi.encodePacked(hex"ef0100", address(delegate)));
        bytes32 digest = keccak256("anything the agent signs");
        assertEq(
            AgentDelegate(payable(agent)).isValidSignature(digest, sign(key, digest)),
            IERC1271.isValidSignature.selector
        );
        vm.prank(thief);
        vm.expectRevert(AgentDelegate.Unauthorized.selector);
        AgentDelegate(payable(agent)).take("", CNGN, 100, 0);
    }

    function test_StillReceivesCelo() public {
        (address agent,) = makeAddrAndKey("agent");
        vm.etch(agent, address(new AgentDelegate(REACTOR, USDT, ROUTER)).code);
        vm.deal(thief, 1 ether);

        vm.prank(thief);
        (bool ok,) = payable(agent).call{value: 1 ether}("");

        assertTrue(ok);
        assertEq(agent.balance, 1 ether);
    }
}
