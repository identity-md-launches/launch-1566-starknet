// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Starknet (STARKNET)
/// @notice A fixed-supply ERC-20. The whole supply, 1,000,000,000 tokens with 18 decimals, is
/// minted once to the deployer (`msg.sender`) in the constructor. Nothing can mint afterwards.
/// @dev Deliberately minimal:
///  - no owner, no admin role, no pause, no blocklist, no fee or burn on transfer;
///  - no mint function of any kind, so `totalSupply()` can never grow;
///  - no burn function either, and the OpenZeppelin base refuses transfers to the zero address,
///    so `totalSupply()` is constant for the life of the contract;
///  - the constructor takes no arguments and calls no other contract, so it deploys on an empty
///    chain and through a CREATE2 factory, which then holds the supply.
/// Every behaviour on top of the ERC-20 standard is inherited unchanged from OpenZeppelin v5.1.0.
contract StarknetToken is ERC20 {
    /// @notice Number of decimals, as `decimals()` reports.
    uint8 public constant DECIMALS = 18;

    /// @notice The whole supply in minor units: 1,000,000,000 * 10**18. Minted once, never changed.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** uint256(DECIMALS);

    /// @notice Mints the entire supply to the deployer.
    /// @dev `msg.sender` is whoever creates the contract: the launch factory in production, or the
    /// account running the deploy script locally.
    constructor() ERC20("Starknet", "STARKNET") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }
}
