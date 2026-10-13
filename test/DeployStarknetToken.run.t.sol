// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DeployStarknetToken} from "../script/DeployStarknetToken.s.sol";
import {StarknetToken} from "../src/StarknetToken.sol";

/// @notice The script's broadcast entry point, driven under the test runner. Builds on
/// `DeployStarknetToken.t.sol`, which covers `deploy()` without a broadcast.
contract DeployStarknetTokenRunTest is Test {
    uint256 internal constant SUPPLY = 1_000_000_000 * 1e18;

    /// @dev Under a broadcast the creator is the broadcasting account, not the script contract,
    /// so the supply must land on whatever account signed, and the script must hold none of it.
    /// The broadcaster's address is read from the mint event rather than assumed.
    function test_runMintsTheWholeSupplyToTheBroadcaster() public {
        DeployStarknetToken script = new DeployStarknetToken();
        vm.recordLogs();
        StarknetToken token = script.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1, "deployment must emit exactly one event");
        assertEq(logs[0].emitter, address(token));
        assertEq(logs[0].topics[0], IERC20.Transfer.selector);
        assertEq(address(uint160(uint256(logs[0].topics[1]))), address(0), "the mint must come from nowhere");
        address broadcaster = address(uint160(uint256(logs[0].topics[2])));
        assertEq(abi.decode(logs[0].data, (uint256)), SUPPLY);

        assertTrue(broadcaster != address(0));
        assertTrue(broadcaster != address(script), "a broadcast must not mint to the script contract");
        assertEq(token.balanceOf(broadcaster), SUPPLY);
        assertEq(token.balanceOf(address(script)), 0);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.name(), "Starknet");
        assertEq(token.symbol(), "STARKNET");
        assertEq(token.decimals(), 18);
    }

    function test_runTwiceGivesTwoIndependentTokensWithTheSameHolder() public {
        DeployStarknetToken script = new DeployStarknetToken();
        vm.recordLogs();
        StarknetToken first = script.run();
        StarknetToken second = script.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        address firstHolder = address(uint160(uint256(logs[0].topics[2])));
        address secondHolder = address(uint160(uint256(logs[1].topics[2])));
        assertEq(firstHolder, secondHolder, "the same signer must receive both supplies");
        assertTrue(address(first) != address(second));
        assertEq(first.balanceOf(firstHolder), SUPPLY);
        assertEq(second.balanceOf(firstHolder), SUPPLY);
        assertEq(first.balanceOf(address(second)), 0);
        assertEq(second.balanceOf(address(first)), 0);
    }
}
