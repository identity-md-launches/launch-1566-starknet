// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {StarknetToken} from "../src/StarknetToken.sol";

/// @notice Drives the token with six actors and keeps ghost books of what every call should have
/// done. Successful calls are bounded so they succeed; failure paths are exercised on purpose and
/// the exact revert is asserted inside the handler, so the run fails on any revert it did not ask
/// for and on any revert that comes back with the wrong reason.
contract GhostHandler is Test {
    StarknetToken public immutable token;
    address[] public actors;

    /// @dev Minor units each actor has received through successful transfers.
    mapping(address => uint256) public ghost_received;
    /// @dev Minor units each actor has sent through successful transfers.
    mapping(address => uint256) public ghost_sent;
    /// @dev What the token's allowance table should say.
    mapping(address => mapping(address => uint256)) public ghost_allowance;

    uint256 public ghost_transfers;
    uint256 public ghost_expectedReverts;
    uint256 public ghost_zeroAmountTransfers;
    uint256 public ghost_infiniteSpends;

    constructor(StarknetToken token_, address[] memory actors_) {
        token = token_;
        actors = actors_;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    // ---------------------------------------------------------------- happy paths, bounded to succeed

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        amount = bound(amount, 0, token.balanceOf(from));
        uint256 fromBefore = token.balanceOf(from);
        uint256 toBefore = token.balanceOf(to);

        vm.prank(from);
        bool ok = token.transfer(to, amount);

        assertTrue(ok, "transfer returned false");
        if (from == to) {
            assertEq(token.balanceOf(from), fromBefore, "self-transfer changed the balance");
        } else {
            assertEq(token.balanceOf(from), fromBefore - amount, "sender debited the wrong amount");
            assertEq(token.balanceOf(to), toBefore + amount, "recipient credited the wrong amount");
        }
        ghost_sent[from] += amount;
        ghost_received[to] += amount;
        ghost_transfers++;
        if (amount == 0) ghost_zeroAmountTransfers++;
    }

    function approve(uint256 ownerSeed, uint256 spenderSeed, uint256 amount) external {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        vm.prank(owner);
        assertTrue(token.approve(spender, amount), "approve returned false");
        ghost_allowance[owner][spender] = amount;
    }

    function approveMax(uint256 ownerSeed, uint256 spenderSeed) external {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        vm.prank(owner);
        assertTrue(token.approve(spender, type(uint256).max), "approve returned false");
        ghost_allowance[owner][spender] = type(uint256).max;
    }

    function transferFrom(uint256 ownerSeed, uint256 spenderSeed, uint256 toSeed, uint256 amount) external {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        address to = _actor(toSeed);
        uint256 cap = token.allowance(owner, spender);
        uint256 balance = token.balanceOf(owner);
        amount = bound(amount, 0, cap < balance ? cap : balance);

        vm.prank(spender);
        assertTrue(token.transferFrom(owner, to, amount), "transferFrom returned false");

        if (cap == type(uint256).max) {
            assertEq(token.allowance(owner, spender), type(uint256).max, "infinite allowance was decremented");
            ghost_infiniteSpends++;
        } else {
            assertEq(token.allowance(owner, spender), cap - amount, "allowance decremented by the wrong amount");
            ghost_allowance[owner][spender] = cap - amount;
        }
        ghost_sent[owner] += amount;
        ghost_received[to] += amount;
        ghost_transfers++;
        if (amount == 0) ghost_zeroAmountTransfers++;
    }

    // ---------------------------------------------------------------- failure paths, asserted exactly

    function transferAboveBalance(uint256 fromSeed, uint256 toSeed, uint256 excess) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        uint256 balance = token.balanceOf(from);
        excess = bound(excess, 1, type(uint256).max - balance);
        uint256 amount = balance + excess;

        vm.prank(from);
        try token.transfer(to, amount) returns (bool) {
            revert("transfer above balance succeeded");
        } catch (bytes memory err) {
            assertEq(
                err,
                abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, from, balance, amount),
                "wrong revert for transfer above balance"
            );
        }
        assertEq(token.balanceOf(from), balance, "a reverted transfer moved the balance");
        ghost_expectedReverts++;
    }

    function transferToZeroAddress(uint256 fromSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        uint256 balance = token.balanceOf(from);

        vm.prank(from);
        try token.transfer(address(0), amount) returns (bool) {
            revert("transfer to the zero address succeeded");
        } catch (bytes memory err) {
            assertEq(
                err,
                abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)),
                "wrong revert for transfer to zero"
            );
        }
        assertEq(token.balanceOf(from), balance, "a reverted transfer moved the balance");
        ghost_expectedReverts++;
    }

    function transferFromAboveAllowance(uint256 ownerSeed, uint256 spenderSeed, uint256 toSeed, uint256 excess)
        external
    {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        address to = _actor(toSeed);
        uint256 cap = token.allowance(owner, spender);
        uint256 balance = token.balanceOf(owner);
        bytes memory expected;
        uint256 amount;
        if (cap == type(uint256).max) {
            // Nothing is above an infinite allowance; the balance is the only ceiling left.
            excess = bound(excess, 1, type(uint256).max - balance);
            amount = balance + excess;
            expected = abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, owner, balance, amount);
        } else {
            excess = bound(excess, 1, type(uint256).max - cap);
            amount = cap + excess;
            expected = abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, cap, amount);
        }

        vm.prank(spender);
        try token.transferFrom(owner, to, amount) returns (bool) {
            revert("transferFrom above allowance succeeded");
        } catch (bytes memory err) {
            assertEq(err, expected, "wrong revert for transferFrom above allowance");
        }
        assertEq(token.allowance(owner, spender), cap, "a reverted spend consumed allowance");
        assertEq(token.balanceOf(owner), balance, "a reverted spend moved the balance");
        ghost_expectedReverts++;
    }

    function transferFromToZeroAddress(uint256 ownerSeed, uint256 spenderSeed, uint256 amount) external {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        uint256 cap = token.allowance(owner, spender);
        amount = bound(amount, 0, cap);

        vm.prank(spender);
        try token.transferFrom(owner, address(0), amount) returns (bool) {
            revert("transferFrom to the zero address succeeded");
        } catch (bytes memory err) {
            assertEq(
                err,
                abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)),
                "wrong revert for transferFrom to zero"
            );
        }
        assertEq(token.allowance(owner, spender), cap, "a reverted spend consumed allowance");
        ghost_expectedReverts++;
    }

    function approveZeroSpender(uint256 ownerSeed, uint256 amount) external {
        address owner = _actor(ownerSeed);
        vm.prank(owner);
        try token.approve(address(0), amount) returns (bool) {
            revert("approve of the zero spender succeeded");
        } catch (bytes memory err) {
            assertEq(
                err,
                abi.encodeWithSelector(IERC20Errors.ERC20InvalidSpender.selector, address(0)),
                "wrong revert for approve of zero spender"
            );
        }
        ghost_expectedReverts++;
    }

    function attemptMint(uint256 callerSeed, uint256 amount) external {
        address caller = _actor(callerSeed);
        vm.prank(caller);
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", caller, amount));
        assertFalse(ok, "mint did not revert");
        vm.prank(caller);
        (ok,) = address(token).call(abi.encodeWithSignature("burn(uint256)", amount));
        assertFalse(ok, "burn did not revert");
        ghost_expectedReverts++;
    }

    function donateEther(uint256 callerSeed, uint256 amount) external {
        address caller = _actor(callerSeed);
        amount = bound(amount, 1, 100 ether);
        vm.deal(caller, amount);
        vm.prank(caller);
        (bool ok,) = address(token).call{value: amount}("");
        assertFalse(ok, "the token accepted ether");
        ghost_expectedReverts++;
    }
}

/// @notice Invariants over random sequences of the handler's calls, including the failing ones.
/// @dev Inline run counts because foundry.toml is not this suite's to change.
/// forge-config: default.invariant.runs = 128
/// forge-config: default.invariant.depth = 64
/// forge-config: default.invariant.fail-on-revert = true
contract StarknetTokenGhostInvariantTest is Test {
    uint256 internal constant SUPPLY = 1_000_000_000 * 1e18;

    StarknetToken internal token;
    GhostHandler internal handler;
    address[] internal actors;
    address internal deployer;
    address internal stranger;

    function setUp() public {
        deployer = makeAddr("deployer");
        stranger = makeAddr("stranger");
        vm.prank(deployer);
        token = new StarknetToken();

        actors.push(deployer);
        actors.push(makeAddr("alice"));
        actors.push(makeAddr("bob"));
        actors.push(makeAddr("carol"));
        actors.push(makeAddr("dave"));
        actors.push(makeAddr("erin"));
        handler = new GhostHandler(token, actors);

        bytes4[] memory selectors = new bytes4[](11);
        selectors[0] = GhostHandler.transfer.selector;
        selectors[1] = GhostHandler.approve.selector;
        selectors[2] = GhostHandler.approveMax.selector;
        selectors[3] = GhostHandler.transferFrom.selector;
        selectors[4] = GhostHandler.transferAboveBalance.selector;
        selectors[5] = GhostHandler.transferToZeroAddress.selector;
        selectors[6] = GhostHandler.transferFromAboveAllowance.selector;
        selectors[7] = GhostHandler.transferFromToZeroAddress.selector;
        selectors[8] = GhostHandler.approveZeroSpender.selector;
        selectors[9] = GhostHandler.attemptMint.selector;
        selectors[10] = GhostHandler.donateEther.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev Fixed supply: nothing in any sequence mints or burns.
    function invariant_totalSupplyNeverChanges() public view {
        assertEq(token.totalSupply(), SUPPLY);
    }

    /// @dev Conservation: what the actors hold is the whole supply; nothing leaks to anyone else.
    function invariant_actorBalancesSumToSupply() public view {
        uint256 sum;
        for (uint256 i; i < actors.length; ++i) {
            sum += token.balanceOf(actors[i]);
        }
        assertEq(sum, SUPPLY);
    }

    /// @dev Every balance equals its starting balance plus what it received minus what it sent.
    function invariant_balancesMatchGhostFlows() public view {
        for (uint256 i; i < actors.length; ++i) {
            address actor = actors[i];
            uint256 initial = actor == deployer ? SUPPLY : 0;
            assertEq(
                token.balanceOf(actor),
                initial + handler.ghost_received(actor) - handler.ghost_sent(actor),
                "balance disagrees with the ghost ledger"
            );
            assertLe(handler.ghost_sent(actor), initial + handler.ghost_received(actor), "sent more than it ever held");
        }
    }

    /// @dev The allowance table is exactly what approvals and spends should have left it.
    function invariant_allowancesMatchGhost() public view {
        for (uint256 i; i < actors.length; ++i) {
            for (uint256 j; j < actors.length; ++j) {
                assertEq(
                    token.allowance(actors[i], actors[j]),
                    handler.ghost_allowance(actors[i], actors[j]),
                    "allowance disagrees with the ghost table"
                );
            }
        }
    }

    /// @dev Nobody outside the actor set, and nothing that is not an account, ends up holding tokens.
    function invariant_outsidersHoldNothing() public view {
        assertEq(token.balanceOf(address(0)), 0, "the zero address holds tokens");
        assertEq(token.balanceOf(stranger), 0, "a stranger holds tokens");
        assertEq(token.balanceOf(address(token)), 0, "the token holds itself");
        assertEq(token.balanceOf(address(handler)), 0, "the handler holds tokens");
        assertEq(token.balanceOf(address(this)), 0, "the test holds tokens");
    }

    function invariant_tokenHoldsNoEther() public view {
        assertEq(address(token).balance, 0);
    }

    function invariant_metadataIsImmutable() public view {
        assertEq(token.name(), "Starknet");
        assertEq(token.symbol(), "STARKNET");
        assertEq(token.decimals(), 18);
        assertEq(token.TOTAL_SUPPLY(), SUPPLY);
    }

    /// @dev A sequence that never reaches a failure path proves little about them; this is a
    /// sanity check on the harness, not a property of the token.
    function afterInvariant() public view {
        assertGt(handler.actorCount(), 1);
        assertGt(handler.ghost_transfers() + handler.ghost_expectedReverts(), 0, "the run exercised nothing");
    }
}
