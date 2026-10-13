// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {DeployStarknetToken} from "../script/DeployStarknetToken.s.sol";
import {StarknetToken} from "../src/StarknetToken.sol";

contract DeployStarknetTokenTest is Test {
    uint256 internal constant SUPPLY = 1_000_000_000 * 1e18;

    function test_deployMintsSupplyToTheScriptCaller() public {
        DeployStarknetToken script = new DeployStarknetToken();
        StarknetToken token = script.deploy();
        // Without a broadcast the script contract itself is the creator and so holds the supply.
        assertEq(token.balanceOf(address(script)), SUPPLY);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.name(), "Starknet");
        assertEq(token.symbol(), "STARKNET");
        assertEq(token.decimals(), 18);
    }

    function test_deployTwiceGivesIndependentTokens() public {
        DeployStarknetToken script = new DeployStarknetToken();
        StarknetToken first = script.deploy();
        StarknetToken second = script.deploy();
        assertTrue(address(first) != address(second));
        assertEq(first.totalSupply(), SUPPLY);
        assertEq(second.totalSupply(), SUPPLY);
        assertEq(first.balanceOf(address(script)), SUPPLY);
        assertEq(second.balanceOf(address(script)), SUPPLY);
    }
}
