// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test, Vm} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ISwapRouter02, Taker} from "../src/Taker.sol";

/// Replays real Textile fills from 25 and 26 Oct against Celo as it was the block before, with
/// the Taker's code at the address the quotes were made out to. The state they read is committed
/// in test/fork-cache: after adding a fixture, run the tests once with Foundry 1.8.6, as CI does,
/// and copy ~/.foundry/cache/rpc/celo/<block> there.
contract TakerReplayTest is Test {
    using stdJson for string;

    address constant REACTOR = 0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3;
    IERC20 constant USDT = IERC20(0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e);
    IERC20 constant CNGN = IERC20(0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f);
    IERC20 constant WBRL = IERC20(0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0);
    ISwapRouter02 constant ROUTER = ISwapRouter02(0x5615CDAb10dc425a742d643d949a7F474C01abc4);
    address payable constant QUOTED_TAKER = payable(0x497F12830607015Ed5ec9736afe43aaF8496512f);

    // A maker sold ₦6,154.19 for 4.456053 USD₮ while the pool paid 4.499053.
    uint256 constant CNGN_IN = 6_154_188_697;
    uint256 constant CNGN_SPENT = 4_456_053;
    uint256 constant CNGN_RECEIVED = 4_499_053;
    // A maker sold 3,070.75 wBRL for 588 USD₮, 2.7% under the pool.
    uint256 constant WBRL_PROFIT = 16_036_238;

    address owner = makeAddr("owner");
    uint256 deadline;

    function replay(string memory name) internal returns (Taker taker, bytes memory swap) {
        string memory fixture = vm.readFile(string.concat("test/fixtures/", name, ".json"));
        vm.createSelectFork(
            vm.envOr("CELO_RPC_URL", string("https://forno.celo.org")), fixture.readUint(".block")
        );
        deadline = fixture.readUint(".deadline");
        vm.etch(QUOTED_TAKER, address(new Taker(owner, REACTOR, USDT, ROUTER)).code);
        return (Taker(QUOTED_TAKER), fixture.readBytes(".swap"));
    }

    function take(Taker taker, bytes memory swap, IERC20 token, uint24 fee, uint256 minProfit)
        internal
        returns (uint256)
    {
        vm.prank(owner);
        return taker.take(swap, token, fee, minProfit);
    }

    function test_TakesCngnUnderThePool() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        uint256 start = USDT.balanceOf(address(taker));

        vm.expectEmit(address(taker));
        emit Taker.Took(address(CNGN), CNGN_IN, CNGN_SPENT, CNGN_RECEIVED);
        uint256 profit = take(taker, swap, CNGN, 100, 0);

        assertEq(profit, CNGN_RECEIVED - CNGN_SPENT);
        assertEq(USDT.balanceOf(address(taker)), start + profit);
        assertEq(CNGN.balanceOf(address(taker)), 0);
        assertEq(USDT.allowance(address(taker), REACTOR), 0);
        assertEq(CNGN.allowance(address(taker), address(ROUTER)), 0);
    }

    function test_TakesWbrlUnderThePool() public {
        (Taker taker, bytes memory swap) = replay("wbrl");
        uint256 start = USDT.balanceOf(address(taker));

        assertEq(take(taker, swap, WBRL, 100, 0), WBRL_PROFIT);
        assertEq(USDT.balanceOf(address(taker)), start + WBRL_PROFIT);
        assertEq(WBRL.balanceOf(address(taker)), 0);
    }

    function test_TakesAtExactlyTheMinProfit() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        assertEq(take(taker, swap, CNGN, 100, CNGN_RECEIVED - CNGN_SPENT), 43_000);
    }

    function test_RevertsOneUnitShortOfTheMinProfit() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        uint256 start = USDT.balanceOf(address(taker));
        uint256 profit = CNGN_RECEIVED - CNGN_SPENT;

        vm.expectRevert(abi.encodeWithSelector(Taker.NoProfit.selector, start, start + profit));
        take(taker, swap, CNGN, 100, profit + 1);
    }

    // Someone else sells 30,000 wBRL into the pool first, so it no longer pays what the maker took.
    function test_RevertsWhenThePoolMovedFirst() public {
        (Taker taker, bytes memory swap) = replay("wbrl");
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

        uint256 start = USDT.balanceOf(address(taker));
        vm.expectPartialRevert(Taker.NoProfit.selector);
        take(taker, swap, WBRL, 100, 0);
        assertEq(USDT.balanceOf(address(taker)), start);
    }

    function test_OnlyTheNamedTakerFills() public {
        (, bytes memory swap) = replay("cngn");
        Taker other = new Taker(owner, REACTOR, USDT, ROUTER);
        deal(address(USDT), address(other), 10e6);

        vm.expectPartialRevert(bytes4(keccak256("FillerNotPreferred(address,uint256)")));
        take(other, swap, CNGN, 100, 0);
    }

    function test_RevertsOnAnExpiredQuote() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        vm.warp(deadline + 1);

        vm.expectPartialRevert(bytes4(keccak256("SignatureExpired(uint256)")));
        take(taker, swap, CNGN, 100, 0);
    }

    function test_RevertsOnAQuoteAlreadyFilled() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        take(taker, swap, CNGN, 100, 0);

        vm.expectRevert(bytes4(keccak256("InvalidNonce()")));
        take(taker, swap, CNGN, 100, 0);
    }

    function test_RevertsWithoutEnoughUsdtToPay() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        deal(address(USDT), address(taker), CNGN_SPENT - 1);

        vm.expectRevert();
        take(taker, swap, CNGN, 100, 0);
    }

    function test_RevertsWhenToldTheWrongToken() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        vm.expectRevert();
        take(taker, swap, WBRL, 100, 0);
    }

    function test_RevertsWithoutAPoolAtThatFee() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        vm.expectRevert();
        take(taker, swap, CNGN, 500, 0);
    }

    // Tokens sent to the Taker are sold with the next take of that token.
    function test_SellsWhatItAlreadyHeld() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        deal(address(CNGN), address(taker), 1_000e6);

        assertGt(take(taker, swap, CNGN, 100, 0), CNGN_RECEIVED - CNGN_SPENT);
        assertEq(CNGN.balanceOf(address(taker)), 0);
    }

    // The reactor sends any CELO it holds to the filler, so 1 wei sent there mustn't block takes.
    function test_AcceptsCeloTheReactorRefunds() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        uint256 before = address(taker).balance;
        vm.deal(REACTOR, 1);

        take(taker, swap, CNGN, 100, 0);
        assertEq(address(taker).balance, before + 1);
    }

    function test_OnlyTheOwnerTakesAndWithdraws() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        vm.expectRevert(Taker.NotOwner.selector);
        taker.take(swap, CNGN, 100, 0);
        vm.expectRevert(Taker.NotOwner.selector);
        taker.withdraw(USDT, address(this), 1);

        uint256 balance = USDT.balanceOf(address(taker));
        vm.prank(owner);
        taker.withdraw(USDT, owner, balance);
        assertEq(USDT.balanceOf(owner), balance);
        assertEq(USDT.balanceOf(address(taker)), 0);
    }
}

contract TakerTest is Test {
    uint256 constant SECP256K1_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    Vm.Wallet owner = vm.createWallet("owner");
    Taker taker = new Taker(owner.addr, address(1), IERC20(address(2)), ISwapRouter02(address(3)));
    bytes32 challenge = keccak256("Textile Taker Control");

    function sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_KeepsItsSetup() public view {
        assertEq(taker.owner(), owner.addr);
        assertEq(taker.reactor(), address(1));
        assertEq(address(taker.usdt()), address(2));
        assertEq(address(taker.router()), address(3));
    }

    function test_AcceptsTheOwnerSigningTheBoundHash() public view {
        bytes memory signature = sign(owner.privateKey, taker.boundHash(challenge));
        assertEq(taker.isValidSignature(challenge, signature), IERC1271.isValidSignature.selector);
    }

    function test_RejectsTheOwnerSigningTheBareHash() public view {
        bytes memory signature = sign(owner.privateKey, challenge);
        assertEq(taker.isValidSignature(challenge, signature), bytes4(0xffffffff));
    }

    function test_RejectsOtherSigners() public {
        bytes memory signature =
            sign(vm.createWallet("other").privateKey, taker.boundHash(challenge));
        assertEq(taker.isValidSignature(challenge, signature), bytes4(0xffffffff));
    }

    function test_RejectsMalleableSignatures() public view {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner.privateKey, taker.boundHash(challenge));
        bytes memory flipped = abi.encodePacked(r, SECP256K1_N - uint256(s), v == 27 ? 28 : 27);
        assertEq(taker.isValidSignature(challenge, flipped), bytes4(0xffffffff));
    }

    function test_RejectsASignatureMeantForAnotherTaker() public {
        Taker other =
            new Taker(owner.addr, address(1), IERC20(address(2)), ISwapRouter02(address(3)));
        bytes memory signature = sign(owner.privateKey, other.boundHash(challenge));
        assertEq(taker.isValidSignature(challenge, signature), bytes4(0xffffffff));
    }

    function test_RejectsASignatureFromAnotherChain() public {
        bytes memory signature = sign(owner.privateKey, taker.boundHash(challenge));
        vm.chainId(42220);
        assertEq(taker.isValidSignature(challenge, signature), bytes4(0xffffffff));
    }

    function testFuzz_RejectsAnythingElse(bytes32 hash, bytes calldata signature) public view {
        assertEq(taker.isValidSignature(hash, signature), bytes4(0xffffffff));
    }

    function test_WithdrawsCelo() public {
        address payable to = payable(makeAddr("to"));
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(taker).call{value: 1 ether}("");
        assertTrue(ok);

        vm.expectRevert(Taker.NotOwner.selector);
        taker.withdraw(IERC20(address(0)), to, 1 ether);
        vm.prank(owner.addr);
        taker.withdraw(IERC20(address(0)), to, 1 ether);
        assertEq(to.balance, 1 ether);
        assertEq(address(taker).balance, 0);
    }

    function test_RevertsWithdrawingMoreCeloThanItHolds() public {
        vm.prank(owner.addr);
        vm.expectRevert();
        taker.withdraw(IERC20(address(0)), owner.addr, 1);
    }
}
