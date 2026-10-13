// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StarknetToken} from "../src/StarknetToken.sol";

/// @notice Drives the token with a small set of actors. Every call is clamped to succeed so the
/// invariant run can fail on revert and so each sequence covers real state changes.
contract TokenHandler is Test {
    StarknetToken public immutable token;
    address[] public actors;

    constructor(StarknetToken token_, address[] memory actors_) {
        token = token_;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        amount = bound(amount, 0, token.balanceOf(from));
        vm.prank(from);
        token.transfer(to, amount);
    }

    function approve(uint256 ownerSeed, uint256 spenderSeed, uint256 amount) external {
        vm.prank(_actor(ownerSeed));
        token.approve(_actor(spenderSeed), amount);
    }

    function transferFrom(uint256 ownerSeed, uint256 spenderSeed, uint256 toSeed, uint256 amount) external {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        uint256 cap = token.allowance(owner, spender);
        uint256 balance = token.balanceOf(owner);
        amount = bound(amount, 0, cap < balance ? cap : balance);
        vm.prank(spender);
        token.transferFrom(owner, _actor(toSeed), amount);
    }
}

contract StarknetTokenInvariantTest is Test {
    uint256 internal constant SUPPLY = 1_000_000_000 * 1e18;

    StarknetToken internal token;
    TokenHandler internal handler;
    address[] internal actors;

    function setUp() public {
        address deployer = makeAddr("deployer");
        vm.prank(deployer);
        token = new StarknetToken();

        actors.push(deployer);
        actors.push(makeAddr("a"));
        actors.push(makeAddr("b"));
        actors.push(makeAddr("c"));
        handler = new TokenHandler(token, actors);
        targetContract(address(handler));
    }

    function invariant_totalSupplyIsConstant() public view {
        assertEq(token.totalSupply(), SUPPLY);
    }

    function invariant_balancesSumToSupply() public view {
        uint256 sum;
        for (uint256 i; i < actors.length; ++i) {
            sum += token.balanceOf(actors[i]);
        }
        assertEq(sum, SUPPLY);
    }

    function invariant_noActorExceedsSupply() public view {
        for (uint256 i; i < actors.length; ++i) {
            assertLe(token.balanceOf(actors[i]), SUPPLY);
        }
    }
}
