// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Test, Vm} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ISwapRouter02, Taker} from "../src/Taker.sol";

interface IUsdt {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function nonces(address owner) external view returns (uint256);
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        bytes calldata signature
    ) external;
}

contract YesWallet {
    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return IERC1271.isValidSignature.selector;
    }
}

/// Replays real Textile fills from 25 and 26 Oct against Celo as it was the block before, with
/// the Taker's code at the address the quotes were made out to. The state they read is committed
/// in test/fork-cache: after adding a fixture or a test that reads new state, run the tests once
/// with Foundry 1.8.6, as CI does, and copy ~/.foundry/cache/rpc/celo/<block> there.
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

    bytes32 constant TRANSFER_WITH_AUTHORIZATION = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 constant PERMIT = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );

    address owner = makeAddr("owner");
    address beneficiary = makeAddr("beneficiary");
    address thief = makeAddr("thief");
    uint256 deadline;

    function replay(string memory name) internal returns (Taker taker, bytes memory swap) {
        string memory fixture = vm.readFile(string.concat("test/fixtures/", name, ".json"));
        vm.createSelectFork(
            vm.envOr("CELO_RPC_URL", string("https://forno.celo.org")), fixture.readUint(".block")
        );
        deadline = fixture.readUint(".deadline");
        vm.etch(QUOTED_TAKER, address(new Taker(owner, beneficiary, REACTOR, USDT, ROUTER)).code);
        return (Taker(QUOTED_TAKER), fixture.readBytes(".swap"));
    }

    function take(Taker taker, bytes memory swap, IERC20 token, uint24 fee, uint256 minProfit)
        internal
        returns (uint256)
    {
        vm.prank(owner);
        return taker.take(swap, token, fee, minProfit);
    }

    function transferAuthorization(address from) internal view returns (bytes32) {
        return MessageHashUtils.toTypedDataHash(
            IUsdt(address(USDT)).DOMAIN_SEPARATOR(),
            keccak256(
                abi.encode(
                    TRANSFER_WITH_AUTHORIZATION, from, thief, 10e6, 0, type(uint256).max, bytes32(0)
                )
            )
        );
    }

    function permit(address holder) internal view returns (bytes32) {
        return MessageHashUtils.toTypedDataHash(
            IUsdt(address(USDT)).DOMAIN_SEPARATOR(),
            keccak256(
                abi.encode(
                    PERMIT,
                    holder,
                    thief,
                    10e6,
                    IUsdt(address(USDT)).nonces(holder),
                    type(uint256).max
                )
            )
        );
    }

    function sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
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
        Taker other = new Taker(owner, beneficiary, REACTOR, USDT, ROUTER);
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

    function test_OnlyTheOwnerTakes() public {
        (Taker taker, bytes memory swap) = replay("cngn");
        vm.expectRevert(Taker.Unauthorized.selector);
        taker.take(swap, CNGN, 100, 0);
        vm.prank(beneficiary);
        vm.expectRevert(Taker.Unauthorized.selector);
        taker.take(swap, CNGN, 100, 0);
    }

    function test_WithdrawsUsdtToTheBeneficiaryOnly() public {
        (Taker taker,) = replay("cngn");
        uint256 balance = USDT.balanceOf(address(taker));
        vm.prank(thief);
        vm.expectRevert(Taker.Unauthorized.selector);
        taker.withdraw(USDT, balance);

        vm.prank(owner);
        taker.withdraw(USDT, balance - 1);
        vm.prank(beneficiary);
        taker.withdraw(USDT, 1);
        assertEq(USDT.balanceOf(beneficiary), balance);
        assertEq(USDT.balanceOf(address(taker)), 0);
    }

    // Celo's USD₮ asks a contract holder to vouch for transfer authorizations and permits, so a
    // contract that vouches for anything can be emptied by anyone.
    function test_UsdtTakesSignaturesFromWalletsAndContracts() public {
        replay("cngn");
        Vm.Wallet memory holder = vm.createWallet("holder");
        deal(address(USDT), holder.addr, 10e6);
        IUsdt(address(USDT))
            .transferWithAuthorization(
                holder.addr,
                thief,
                10e6,
                0,
                type(uint256).max,
                bytes32(0),
                sign(holder.privateKey, transferAuthorization(holder.addr))
            );
        assertEq(USDT.balanceOf(thief), 10e6);

        YesWallet wallet = new YesWallet();
        deal(address(USDT), address(wallet), 10e6);
        IUsdt(address(USDT))
            .transferWithAuthorization(
                address(wallet), thief, 10e6, 0, type(uint256).max, bytes32(0), new bytes(65)
            );
        assertEq(USDT.balanceOf(thief), 20e6);
        IUsdt(address(USDT)).permit(address(wallet), thief, 10e6, type(uint256).max, new bytes(65));
        assertEq(USDT.allowance(address(wallet), thief), 10e6);
    }

    // The same attack with the Taker's own hot key fails, in either signature layout.
    function test_OwnerKeyCantSignAwayTheTakersUsdt() public {
        replay("cngn");
        Vm.Wallet memory key = vm.createWallet("hot key");
        Taker taker = new Taker(key.addr, beneficiary, REACTOR, USDT, ROUTER);
        deal(address(USDT), address(taker), 10e6);

        bytes memory transfer = sign(key.privateKey, transferAuthorization(address(taker)));
        bytes memory approval = sign(key.privateKey, permit(address(taker)));
        bytes[2] memory layouts = [transfer, bytes.concat(bytes32(0), bytes32(0), transfer)];
        for (uint256 i = 0; i < layouts.length; i++) {
            vm.expectRevert();
            IUsdt(address(USDT))
                .transferWithAuthorization(
                    address(taker), thief, 10e6, 0, type(uint256).max, bytes32(0), layouts[i]
                );
        }
        vm.expectRevert();
        IUsdt(address(USDT)).permit(address(taker), thief, 10e6, type(uint256).max, approval);

        assertEq(USDT.balanceOf(address(taker)), 10e6);
        assertEq(USDT.allowance(address(taker), thief), 0);
    }
}

contract TakerTest is Test {
    uint256 constant SECP256K1_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    bytes4 constant VALID = IERC1271.isValidSignature.selector;
    bytes4 constant INVALID = 0xffffffff;

    Vm.Wallet owner = vm.createWallet("owner");
    address beneficiary = makeAddr("beneficiary");
    Taker taker = deploy();
    bytes32 nonce = keccak256("nonce");
    uint256 issuedAt = 1_793_000_000_123;

    function deploy() internal returns (Taker) {
        return new Taker(
            owner.addr, beneficiary, address(1), IERC20(address(2)), ISwapRouter02(address(3))
        );
    }

    // What Textile verifies: the owner's personal_sign of its taker-control text, sent with the
    // nonce and issuedAt in front.
    function proof(Taker t, uint256 key)
        internal
        view
        returns (bytes32 hash, bytes memory signature)
    {
        hash = MessageHashUtils.toEthSignedMessageHash(bytes(t.takerControl(nonce, issuedAt)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
        signature = abi.encodePacked(nonce, issuedAt, r, s, v);
    }

    function test_KeepsItsSetup() public view {
        assertEq(taker.owner(), owner.addr);
        assertEq(taker.beneficiary(), beneficiary);
        assertEq(taker.reactor(), address(1));
        assertEq(address(taker.usdt()), address(2));
        assertEq(address(taker.router()), address(3));
    }

    // The text Textile accepted on 26 Oct, hashed by viem for this address, nonce and time on Celo.
    function test_BuildsTextilesTakerControlText() public {
        address at = 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed;
        vm.etch(at, address(taker).code);
        vm.chainId(42220);
        string memory text = Taker(payable(at))
            .takerControl(
                0x7b3f0e1c9a4d2b6e8f1a3c5e7d9b0a2c4e6f8a1b3d5c7e9f0a2b4c6d8e1f3a5b,
                1_793_000_000_123
            );
        assertEq(
            MessageHashUtils.toEthSignedMessageHash(bytes(text)),
            0xb44b9c1a19bf2c9aa68a9c6d84b65abba6c3bb9b164d790338ee192304007507
        );
    }

    function test_AcceptsTheOwnersProof() public view {
        (bytes32 hash, bytes memory signature) = proof(taker, owner.privateKey);
        assertEq(taker.isValidSignature(hash, signature), VALID);
    }

    function test_RejectsAProofForAnotherTaker() public {
        (bytes32 hash, bytes memory signature) = proof(deploy(), owner.privateKey);
        assertEq(taker.isValidSignature(hash, signature), INVALID);
    }

    function test_RejectsAProofFromAnotherChain() public {
        (bytes32 hash, bytes memory signature) = proof(taker, owner.privateKey);
        vm.chainId(42220);
        assertEq(taker.isValidSignature(hash, signature), INVALID);
    }

    function test_RejectsOtherSigners() public {
        (bytes32 hash, bytes memory signature) = proof(taker, vm.createWallet("other").privateKey);
        assertEq(taker.isValidSignature(hash, signature), INVALID);
    }

    function test_RejectsMalleableSignatures() public view {
        bytes32 hash =
            MessageHashUtils.toEthSignedMessageHash(bytes(taker.takerControl(nonce, issuedAt)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner.privateKey, hash);
        bytes memory flipped =
            abi.encodePacked(nonce, issuedAt, r, SECP256K1_N - uint256(s), v == 27 ? 28 : 27);
        assertEq(taker.isValidSignature(hash, flipped), INVALID);
    }

    // Like a USD₮ permit: signed by the owner, but not Textile's text.
    function test_RejectsTheOwnerSigningAnythingElse() public view {
        bytes32 hash = keccak256("a USDT permit");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(owner.privateKey, hash);
        assertEq(taker.isValidSignature(hash, abi.encodePacked(r, s, v)), INVALID);
        assertEq(taker.isValidSignature(hash, abi.encodePacked(nonce, issuedAt, r, s, v)), INVALID);
    }

    function testFuzz_RejectsAnythingElse(bytes32 hash, bytes calldata signature) public view {
        assertEq(taker.isValidSignature(hash, signature), INVALID);
    }

    function test_WithdrawsCeloToTheBeneficiaryOnly() public {
        vm.deal(address(this), 2 ether);
        (bool ok,) = address(taker).call{value: 2 ether}("");
        assertTrue(ok);

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(Taker.Unauthorized.selector);
        taker.withdraw(IERC20(address(0)), 1 ether);
        vm.prank(owner.addr);
        taker.withdraw(IERC20(address(0)), 1 ether);
        vm.prank(beneficiary);
        taker.withdraw(IERC20(address(0)), 1 ether);
        assertEq(beneficiary.balance, 2 ether);
        assertEq(owner.addr.balance, 0);
    }

    function test_RevertsWithdrawingMoreCeloThanItHolds() public {
        vm.prank(owner.addr);
        vm.expectRevert();
        taker.withdraw(IERC20(address(0)), 1);
    }
}
