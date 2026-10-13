// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {StarknetToken} from "../src/StarknetToken.sol";

/// @title DeployStarknetToken
/// @notice Local and development deployment of `StarknetToken`.
/// @dev The production launch does not use this script: the launch factory deploys the token from
/// its compiled bytecode and receives the supply as `msg.sender`. This script exists so the same
/// bytecode can be exercised on a local node, and so tests can call `deploy()` directly. The token
/// has no configuration, so there is nothing to read from the environment.
contract DeployStarknetToken is Script {
    /// @notice Deploys the token. The caller of this function's broadcast context receives the supply.
    function deploy() public returns (StarknetToken token) {
        token = new StarknetToken();
    }

    /// @notice Entry point for `forge script`. Broadcasts a single creation transaction.
    function run() external returns (StarknetToken token) {
        vm.startBroadcast();
        token = deploy();
        vm.stopBroadcast();
    }
}
