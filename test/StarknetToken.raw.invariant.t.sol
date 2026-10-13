// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StarknetToken} from "../src/StarknetToken.sol";

/// @notice The token itself as the fuzz target: no handler, no clamping. The fuzzer picks any
/// function, any arguments and any of the listed senders, and most calls revert. Reverts are not
/// failures here; what must survive them is the fixed supply and the ban on the zero address.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 64
/// forge-config: default.invariant.fail-on-revert = false
contract StarknetTokenRawInvariantTest is Test {
    uint256 internal constant SUPPLY = 1_000_000_000 * 1e18;

    StarknetToken internal token;
    address internal deployer;
    address[] internal senders;

    function setUp() public {
        deployer = makeAddr("deployer");
        vm.prank(deployer);
        token = new StarknetToken();

        senders.push(deployer);
        senders.push(makeAddr("alice"));
        senders.push(makeAddr("bob"));
        senders.push(makeAddr("carol"));
        for (uint256 i; i < senders.length; ++i) {
            targetSender(senders[i]);
        }
        targetContract(address(token));
    }

    function invariant_totalSupplyIsFixedUnderRandomCalls() public view {
        assertEq(token.totalSupply(), SUPPLY);
    }

    function invariant_zeroAddressNeverHoldsTokens() public view {
        assertEq(token.balanceOf(address(0)), 0);
    }

    /// @dev Random recipients may receive tokens, so the senders hold at most the supply; the
    /// deployer, the only account that was ever minted to, can never exceed it either.
    function invariant_knownHoldersNeverExceedSupply() public view {
        uint256 sum;
        for (uint256 i; i < senders.length; ++i) {
            uint256 balance = token.balanceOf(senders[i]);
            assertLe(balance, SUPPLY);
            sum += balance;
        }
        assertLe(sum, SUPPLY);
    }

    function invariant_metadataIsImmutableUnderRandomCalls() public view {
        assertEq(token.name(), "Starknet");
        assertEq(token.symbol(), "STARKNET");
        assertEq(token.decimals(), 18);
    }
}
