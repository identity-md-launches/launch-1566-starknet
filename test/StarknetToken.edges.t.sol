// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {StarknetToken} from "../src/StarknetToken.sol";

/// @notice A stand-in for the launch factory that only the test may drive: creates the token
/// through CREATE2 and pays the supply out, the way ProjectFactory.launchCustom does.
contract LaunchFactoryStub {
    address private immutable controller = msg.sender;

    function deploy(bytes memory code, bytes32 salt) external returns (address deployed) {
        require(msg.sender == controller, "not the test");
        assembly ("memory-safe") {
            deployed := create2(0, add(code, 32), mload(code), salt)
        }
        require(deployed != address(0), "create2 failed");
    }

    function move(IERC20 token, address to, uint256 amount) external returns (bool) {
        require(msg.sender == controller, "not the test");
        return token.transfer(to, amount);
    }
}

/// @notice Edge cases and failure paths the first suite leaves out: the zero address on every side
/// of every call, zero amounts, the order in which checks fire, calldata the ABI rejects, the
/// exact launch split, and stateless properties over the arithmetic.
/// @dev Builds on `StarknetToken.t.sol`; nothing here repeats a case that file already pins.
/// forge-config: default.fuzz.runs = 1000
contract StarknetTokenEdgeTest is Test {
    uint256 internal constant SUPPLY = 1_000_000_000 * 1e18;
    uint256 internal constant BPS = 10_000;

    StarknetToken internal token;
    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        vm.prank(deployer);
        token = new StarknetToken();
    }

    // ---------------------------------------------------------------- constructor and zero address

    /// @dev If the creator were the zero address the supply would be stranded. The base refuses it,
    /// so the only way the contract exists is with the whole supply on a real creator.
    function test_constructorRefusesToMintToTheZeroAddress() public {
        vm.prank(address(0));
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        new StarknetToken();
    }

    function test_supplyIsExactlyTenToTheTwentySeven() public view {
        assertEq(token.totalSupply(), 10 ** 27);
        assertEq(token.totalSupply(), 1_000_000_000 * 10 ** uint256(token.decimals()));
    }

    function test_zeroAddressHoldsNothingAndAllowsNothing() public view {
        assertEq(token.balanceOf(address(0)), 0);
        assertEq(token.allowance(address(0), alice), 0);
        assertEq(token.allowance(alice, address(0)), 0);
        assertEq(token.balanceOf(address(token)), 0, "the token must not hold itself");
    }

    function test_transferFromTheZeroAddressRevertsEvenForZeroAmount() public {
        vm.prank(address(0));
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidSender.selector, address(0)));
        token.transfer(alice, 0);
    }

    function test_approveFromTheZeroAddressReverts() public {
        vm.prank(address(0));
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidApprover.selector, address(0)));
        token.approve(alice, 1);
    }

    function test_transferFromToTheZeroAddressRevertsAndKeepsTheAllowance() public {
        vm.prank(deployer);
        token.approve(alice, 10);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        token.transferFrom(deployer, address(0), 5);
        assertEq(token.allowance(deployer, alice), 10, "a reverted spend must not consume allowance");
        assertEq(token.totalSupply(), SUPPLY, "nothing may be burned through transferFrom");
        assertEq(token.balanceOf(deployer), SUPPLY);
    }

    /// @dev The allowance step runs before the sender check, so pulling from the zero address
    /// fails on allowance when an amount is named, and on the zero approver (the allowance
    /// rewrite refuses a zero owner) when it is not. Either way nothing moves and nothing is minted.
    function test_transferFromTheZeroOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, alice, 0, 1));
        token.transferFrom(address(0), bob, 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidApprover.selector, address(0)));
        token.transferFrom(address(0), bob, 0);

        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(bob), 0);
    }

    // ---------------------------------------------------------------- zero amounts and allowance semantics

    /// @dev Standard ERC-20 behaviour worth pinning: a zero-value transferFrom needs no allowance,
    /// emits a Transfer, and changes nothing.
    function test_zeroAmountTransferFromNeedsNoAllowance() public {
        assertEq(token.allowance(deployer, alice), 0);
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit IERC20.Transfer(deployer, bob, 0);
        assertTrue(token.transferFrom(deployer, bob, 0));
        assertEq(token.balanceOf(deployer), SUPPLY);
        assertEq(token.balanceOf(bob), 0);
    }

    function test_zeroAmountTransferEmitsTransfer() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit IERC20.Transfer(alice, bob, 0);
        assertTrue(token.transfer(bob, 0));
    }

    /// @dev OpenZeppelin v5 emits only a Transfer on transferFrom, never an Approval for the
    /// decremented allowance. Indexers that rely on Approval events must read `allowance()`.
    function test_transferFromEmitsExactlyOneTransferAndNoApproval() public {
        vm.prank(deployer);
        token.approve(alice, 100);
        vm.recordLogs();
        vm.prank(alice);
        token.transferFrom(deployer, bob, 40);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "expected exactly one event");
        assertEq(logs[0].emitter, address(token));
        assertEq(logs[0].topics[0], IERC20.Transfer.selector);
        assertEq(address(uint160(uint256(logs[0].topics[1]))), deployer);
        assertEq(address(uint160(uint256(logs[0].topics[2]))), bob);
        assertEq(abi.decode(logs[0].data, (uint256)), 40);
        assertEq(token.allowance(deployer, alice), 60);
    }

    function test_spendingTheWholeAllowanceLeavesZeroAndTheNextWeiReverts() public {
        vm.prank(deployer);
        token.approve(alice, 10);
        vm.prank(alice);
        token.transferFrom(deployer, bob, 10);
        assertEq(token.allowance(deployer, alice), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, alice, 0, 1));
        token.transferFrom(deployer, bob, 1);
        assertEq(token.balanceOf(bob), 10);
    }

    function test_approveZeroClearsTheAllowance() public {
        vm.startPrank(deployer);
        token.approve(alice, 10);
        vm.expectEmit(true, true, true, true);
        emit IERC20.Approval(deployer, alice, 0);
        token.approve(alice, 0);
        vm.stopPrank();
        assertEq(token.allowance(deployer, alice), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, alice, 0, 1));
        token.transferFrom(deployer, bob, 1);
    }

    function test_reducingAnInfiniteAllowanceMakesItFinite() public {
        vm.startPrank(deployer);
        token.approve(alice, type(uint256).max);
        token.approve(alice, 5);
        vm.stopPrank();
        vm.prank(alice);
        token.transferFrom(deployer, bob, 3);
        assertEq(token.allowance(deployer, alice), 2, "a re-approved allowance must decrement again");
    }

    /// @dev An allowance is a number, not a claim on a balance: it may exceed what the owner holds,
    /// and the balance check is what stops the spend.
    function test_allowanceMayExceedBalanceAndTheBalanceCheckStopsTheSpend() public {
        vm.prank(alice);
        token.approve(bob, SUPPLY);
        assertEq(token.allowance(alice, bob), SUPPLY);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 0, 1));
        token.transferFrom(alice, carol, 1);
        assertEq(token.allowance(alice, bob), SUPPLY, "a reverted spend must not consume allowance");
    }

    function test_whenBothAllowanceAndBalanceAreShortTheAllowanceErrorFires() public {
        vm.prank(alice);
        token.approve(bob, 5);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, bob, 5, 10));
        token.transferFrom(alice, carol, 10);
    }

    function test_ownerMayBeItsOwnSpender() public {
        vm.startPrank(deployer);
        token.approve(deployer, 7);
        assertTrue(token.transferFrom(deployer, alice, 7));
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 7);
        assertEq(token.allowance(deployer, deployer), 0);
    }

    function test_spenderMayBeTheRecipient() public {
        vm.prank(deployer);
        token.approve(alice, 7);
        vm.prank(alice);
        assertTrue(token.transferFrom(deployer, alice, 7));
        assertEq(token.balanceOf(alice), 7);
        assertEq(token.allowance(deployer, alice), 0);
    }

    function test_transferFromOwnerToItselfKeepsBalanceAndSpendsAllowance() public {
        vm.prank(deployer);
        token.approve(alice, 9);
        vm.prank(alice);
        assertTrue(token.transferFrom(deployer, deployer, 9));
        assertEq(token.balanceOf(deployer), SUPPLY);
        assertEq(token.allowance(deployer, alice), 0, "a self-transfer still consumes allowance");
    }

    // ---------------------------------------------------------------- atomicity and calldata

    function test_aRevertedTransferLeavesNoTrace() public {
        vm.startPrank(deployer);
        vm.expectRevert();
        token.transfer(alice, SUPPLY + 1);
        assertTrue(token.transfer(alice, SUPPLY));
        vm.stopPrank();
        assertEq(token.balanceOf(deployer), 0);
        assertEq(token.balanceOf(alice), SUPPLY);
    }

    function test_truncatedCalldataRevertsWithoutMovingAnything() public {
        vm.prank(deployer);
        (bool ok,) = address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, alice));
        assertFalse(ok, "transfer with a missing amount must revert");
        vm.prank(deployer);
        (ok,) = address(token).call(abi.encodePacked(IERC20.transfer.selector, uint256(uint160(alice)), uint128(1)));
        assertFalse(ok, "transfer with a short amount word must revert");
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(deployer), SUPPLY);
    }

    function test_metadataThroughTheStandardInterface() public view {
        IERC20Metadata meta = IERC20Metadata(address(token));
        assertEq(meta.name(), "Starknet");
        assertEq(meta.symbol(), "STARKNET");
        assertEq(meta.decimals(), 18);
        assertEq(meta.totalSupply(), SUPPLY);
    }

    // ---------------------------------------------------------------- launch flows, in plain ERC-20 terms

    /// @dev The factory pays out ten percent to the distributor, the pool share, and the remainder.
    /// With this supply every share is a whole number of minor units, the three parts sum to the
    /// supply with no dust, every leg arrives whole, and the factory is left with nothing.
    function test_launchSplitArrivesWholeAndLeavesNoDust() public {
        LaunchFactoryStub factory = new LaunchFactoryStub();
        StarknetToken launched = StarknetToken(factory.deploy(type(StarknetToken).creationCode, bytes32(uint256(1))));
        assertEq(launched.balanceOf(address(factory)), SUPPLY);

        address distributor = makeAddr("distributor");
        address pool = makeAddr("pool manager");
        address remainderTo = makeAddr("remainderTo");

        uint256 swarm = (SUPPLY * 1_000) / BPS;
        uint256 poolShare = (SUPPLY * 8_800) / BPS;
        uint256 remainder = SUPPLY - swarm - poolShare;
        assertEq(remainder, (SUPPLY * 200) / BPS, "the split must leave no dust");
        assertEq(swarm * BPS, SUPPLY * 1_000, "the swarm share must be exact");

        assertTrue(factory.move(launched, distributor, swarm));
        assertTrue(factory.move(launched, pool, poolShare));
        assertTrue(factory.move(launched, remainderTo, remainder));

        assertEq(launched.balanceOf(distributor), swarm, "the swarm's share arrived short");
        assertEq(launched.balanceOf(pool), poolShare, "the pool seed arrived short");
        assertEq(launched.balanceOf(remainderTo), remainder, "the remainder arrived short");
        assertEq(launched.balanceOf(address(factory)), 0, "the factory kept something back");
        assertEq(launched.totalSupply(), SUPPLY, "the launch flows changed the supply");

        // The factory holds nothing, so a fourth leg must fail rather than invent tokens.
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(factory), 0, 1));
        factory.move(launched, remainderTo, 1);
    }

    /// @dev Claims drain the distributor to exactly zero: the last claimant is not shorted.
    function test_distributorPaysEveryClaimWholeDownToZero() public {
        address distributor = makeAddr("distributor");
        uint256 swarm = (SUPPLY * 1_000) / BPS;
        vm.prank(deployer);
        token.transfer(distributor, swarm);

        // Two percent to three contributors, eight percent to seven seats, as the launch describes.
        uint256 contributors = (SUPPLY * 200) / BPS;
        uint256 seats = swarm - contributors;
        uint256 perContributor = contributors / 3;
        uint256 perSeat = seats / 7;
        uint256 dust = (contributors - perContributor * 3) + (seats - perSeat * 7);

        vm.startPrank(distributor);
        for (uint256 i; i < 3; ++i) {
            address claimant = makeAddr(string.concat("contributor", vm.toString(i)));
            assertTrue(token.transfer(claimant, perContributor));
            assertEq(token.balanceOf(claimant), perContributor);
        }
        for (uint256 i; i < 7; ++i) {
            address claimant = makeAddr(string.concat("seat", vm.toString(i)));
            assertTrue(token.transfer(claimant, perSeat));
            assertEq(token.balanceOf(claimant), perSeat);
        }
        assertEq(token.balanceOf(distributor), dust, "the claims did not sum to the share");
        if (dust > 0) assertTrue(token.transfer(makeAddr("sweep"), dust));
        vm.stopPrank();
        assertEq(token.balanceOf(distributor), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    // ---------------------------------------------------------------- stateless properties

    function testFuzz_transferFromAnEmptyAccountAlwaysReverts(uint256 fromSeed, address to, uint256 amount) public {
        address from = address(uint160(bound(fromSeed, 1, type(uint160).max)));
        if (from == deployer) from = alice;
        amount = bound(amount, 1, type(uint256).max);
        assertEq(token.balanceOf(from), 0);
        vm.prank(from);
        if (to == address(0)) {
            vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        } else {
            vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, from, 0, amount));
        }
        token.transfer(to, amount);
    }

    function testFuzz_transferToTheZeroAddressAlwaysReverts(uint256 amount) public {
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        token.transfer(address(0), amount);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(deployer), SUPPLY);
    }

    function testFuzz_approveSetsExactlyTheLastValue(uint256 spenderSeed, uint256 first, uint256 second) public {
        address spender = address(uint160(bound(spenderSeed, 1, type(uint160).max)));
        // The owner-as-its-own-spender case is covered by test_ownerMayBeItsOwnSpender; here the
        // reverse-direction slot must be a different slot, so steer the fuzzer off the deployer.
        if (spender == deployer) spender = address(uint160(spender) + 1);
        vm.startPrank(deployer);
        assertTrue(token.approve(spender, first));
        assertEq(token.allowance(deployer, spender), first);
        vm.expectEmit(true, true, true, true);
        emit IERC20.Approval(deployer, spender, second);
        assertTrue(token.approve(spender, second));
        vm.stopPrank();
        assertEq(token.allowance(deployer, spender), second);
        assertEq(token.allowance(spender, deployer), 0, "approval must not be symmetric");
        assertEq(token.balanceOf(spender), 0, "approval must not move tokens");
    }

    function testFuzz_allowanceErrorFiresFirstWhenBothAreShort(uint256 allowanceAmt, uint256 amount) public {
        amount = bound(amount, 1, type(uint256).max);
        allowanceAmt = bound(allowanceAmt, 0, amount - 1);
        vm.prank(alice);
        token.approve(bob, allowanceAmt);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, bob, allowanceAmt, amount)
        );
        token.transferFrom(alice, carol, amount);
        assertEq(token.allowance(alice, bob), allowanceAmt);
    }

    function testFuzz_balanceErrorFiresWhenOnlyTheBalanceIsShort(uint256 balance, uint256 allowanceAmt, uint256 amount)
        public
    {
        balance = bound(balance, 0, SUPPLY - 1);
        amount = bound(amount, balance + 1, SUPPLY);
        allowanceAmt = bound(allowanceAmt, amount, type(uint256).max);
        vm.prank(deployer);
        token.transfer(alice, balance);
        vm.prank(alice);
        token.approve(bob, allowanceAmt);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, balance, amount));
        token.transferFrom(alice, carol, amount);
        assertEq(token.allowance(alice, bob), allowanceAmt, "a reverted spend must not consume allowance");
        assertEq(token.balanceOf(alice), balance);
    }

    function testFuzz_infiniteAllowanceSurvivesAnySpend(uint256 amount) public {
        amount = bound(amount, 0, SUPPLY);
        vm.prank(deployer);
        token.approve(alice, type(uint256).max);
        vm.prank(alice);
        assertTrue(token.transferFrom(deployer, bob, amount));
        assertEq(token.allowance(deployer, alice), type(uint256).max);
        assertEq(token.balanceOf(bob), amount);
    }

    /// @dev No fee, no reflection: a transfer out and back restores both balances exactly.
    function testFuzz_roundTripRestoresBalancesExactly(uint256 amount) public {
        amount = bound(amount, 0, SUPPLY);
        vm.prank(deployer);
        token.transfer(alice, amount);
        vm.prank(alice);
        token.transfer(deployer, amount);
        assertEq(token.balanceOf(deployer), SUPPLY);
        assertEq(token.balanceOf(alice), 0);
    }

    /// @dev Transfers are additive: two pieces deliver exactly what one transfer of the sum would.
    function testFuzz_splittingATransferDeliversTheSameTotal(uint256 amount, uint256 cut) public {
        amount = bound(amount, 0, SUPPLY);
        cut = bound(cut, 0, amount);
        vm.startPrank(deployer);
        token.transfer(alice, cut);
        token.transfer(alice, amount - cut);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), amount);
        assertEq(token.balanceOf(deployer), SUPPLY - amount);
    }

    /// @dev A chain of transfers between four actors, each bounded by the sender's balance,
    /// conserves the supply and never lands anything on the zero address.
    function testFuzz_chainOfTransfersConservesSupply(uint256[8] memory seeds, uint256[8] memory amounts) public {
        address[4] memory actors = [deployer, alice, bob, carol];
        for (uint256 i; i < seeds.length; ++i) {
            address from = actors[seeds[i] % 4];
            address to = actors[(seeds[i] / 4) % 4];
            uint256 amount = bound(amounts[i], 0, token.balanceOf(from));
            vm.prank(from);
            assertTrue(token.transfer(to, amount));
        }
        uint256 sum;
        for (uint256 i; i < actors.length; ++i) {
            sum += token.balanceOf(actors[i]);
        }
        assertEq(sum, SUPPLY);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(address(0)), 0);
    }

    /// @dev The token exposes exactly the ERC-20 surface plus its two constants. Any other
    /// selector, with any payload, from anyone, reverts and changes nothing.
    function testFuzz_unknownSelectorsAlwaysRevert(bytes4 selector, bytes memory payload, uint256 callerSeed) public {
        bytes4[11] memory known = [
            IERC20.totalSupply.selector,
            IERC20.balanceOf.selector,
            IERC20.transfer.selector,
            IERC20.allowance.selector,
            IERC20.approve.selector,
            IERC20.transferFrom.selector,
            IERC20Metadata.name.selector,
            IERC20Metadata.symbol.selector,
            IERC20Metadata.decimals.selector,
            token.DECIMALS.selector,
            token.TOTAL_SUPPLY.selector
        ];
        for (uint256 i; i < known.length; ++i) {
            if (selector == known[i]) return;
        }
        address caller = callerSeed % 2 == 0 ? deployer : address(uint160(bound(callerSeed, 1, type(uint160).max)));
        vm.prank(caller);
        (bool ok,) = address(token).call(abi.encodePacked(selector, payload));
        assertFalse(ok, "unknown selector must revert");
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(deployer), SUPPLY);
    }
}
