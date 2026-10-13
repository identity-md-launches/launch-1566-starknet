# Starknet (STARKNET) — fixed-supply ERC-20

A custom token for an IdentityMD custom-token launch on Ethereum mainnet (chain id 1).

## Website

`web/` holds a single-page Vite + React + TypeScript site for the live token, and `dist/` is its
committed production export. The page reads the token and its Uniswap v4 pool over public RPCs
(supply, pool price in IMD, pool holdings, the launch remainder balance), lets anyone check a
balance by address, and lets a visitor connect a browser wallet (EIP-1193) to see their balance,
send STARKNET and add the token to their wallet. All addresses come from the launch's
`deployment.json` and `network.json` and live in `web/src/config.ts`; the ABI in `web/src/abi.ts`
is the `forge build` output of `src/StarknetToken.sol` (its sorted-key keccak matches the
deployment's `abiHash`). Design tokens and components are documented in `DESIGN.md`; the
validation record is `artifacts/validation.md`.

### Install, preview, rebuild

```
cd web
npm ci                 # Node 24 and npm 11 were used; installs from package-lock.json
npm run dev            # Vite dev server with hot reload
npm run build          # production export to ../dist (base ./, relative asset URLs)
npm run preview        # serves the built ../dist locally
npm run typecheck      # tsc --noEmit
npm run check          # static checks on ../dist: relative URLs, files present, share tags
```

`dist/` is served as committed; the publisher does not rebuild. Rebuild after any source change
and commit `dist/` with it. `node_modules/` is not committed.

Share images (`web/public/og.png`, `web/public/apple-touch-icon.png`) are rendered from inline
HTML by `node scripts/make-images.mjs`, which needs Playwright either installed as a package or
named through `IMD_PLAYWRIGHT=<path to playwright/index.mjs>`.

### Checks that were run

From the final source, on Linux with Node 24.21.0:

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; 452 kB JS (140 kB gzip), 7 kB CSS |
| `npm run check` | all pass |
| Design probe `node .imd/reads/skills/design-critic/scripts/taste.mjs` at 320, 390 and 1440 | 16/16 checks pass |
| `IMD_PLAYWRIGHT=… node web/scripts/interact.mjs dist` (headless Chromium, 390 and 1440) | 28/28 pass: live reads, balance lookup, validation and focus, keyboard order, connect, wrong network, transfer validation, cancelled signature, pending state, add to wallet |

The interaction script starts its own static server for the run and injects a mocked wallet
provider; reads go to the real public RPC. Limitations: no real transaction was sent (no wallet or
funds on the worker); WebKit could not launch on the host, so Safari was not checked; no screen
reader, forced-colors, zoom or physical-device checks. Details in `artifacts/validation.md`.

## Token

| Field | Value |
| --- | --- |
| Solidity contract | `StarknetToken` (`src/StarknetToken.sol`) |
| `name()` | `Starknet` |
| `symbol()` | `STARKNET` |
| `decimals()` | `18` |
| `totalSupply()` | `1000000000000000000000000000` minor units (1,000,000,000 tokens) |
| Constructor arguments | none |
| Minted to | `msg.sender` of the constructor, once, in the constructor |
| Compiler | solc `0.8.26`, optimizer on (200 runs), `bytecode_hash = "none"`, no CBOR metadata |

## What the token does

`StarknetToken` inherits OpenZeppelin v5.1.0 `ERC20` and adds nothing but a constructor that mints
the whole supply to its creator. There is:

- no owner, admin role or privileged function of any kind;
- no mint, so the supply can never grow after deployment;
- no burn, and the OpenZeppelin base rejects transfers to the zero address, so the supply never
  shrinks either: `totalSupply()` is a constant for the life of the contract;
- no fee, tax, reflection or burn on transfer: every transfer moves exactly the amount requested;
- no pause, blocklist, freeze or seizure: only a holder (or a spender it approved) moves its balance;
- no `DELEGATECALL`, `CALLCODE` or `SELFDESTRUCT` in the runtime, no proxy, no upgrade path;
- no external calls in the constructor, so it deploys on an empty chain and through a CREATE2 factory.

Standard ERC-20 semantics are OpenZeppelin's: `approve` overwrites the previous allowance, an
allowance of `type(uint256).max` is not decremented by `transferFrom`, and failures revert with the
ERC-6093 custom errors (`ERC20InsufficientBalance`, `ERC20InsufficientAllowance`,
`ERC20InvalidReceiver`, `ERC20InvalidSpender`).

## Assumptions

- The deployer is the creator of the contract. In the launch, that is the ProjectFactory, which
  deploys the token from its compiled bytecode and therefore receives the full supply. Nothing is
  sent to `tx.origin` or to any address named in code.
- The supply is fixed at 1,000,000,000 × 10^18 minor units and is stated exactly by the manifest's
  `token.totalSupply`. No contract in this repository is reserved or sent any part of it; the factory
  pays all of it out.
- The token has no transfer restrictions, so the launch flows (factory → MerkleDistributor,
  distributor → claimants, factory → Uniswap v4 PoolManager seed, trader swaps in both directions)
  move exactly what they say without any exemptions being needed.
- Pool parameters (pair IMD at `0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7`, fee 12500, tick spacing
  60, 88% of the supply to the pool, 2,500 IMD opening market cap, remainder to
  `0x49c95a6ee32e9c0dc7a353c078e6158304bbce9f`) are the launch's and are written by the manifest
  step, not by this repository. No `launch.json` is included on purpose.

## Deployment parameters

The constructor takes **no arguments**. The launch deploys `StarknetToken` from the creation code
in `out/StarknetToken.sol/StarknetToken.json` as built by `forge build` with this `foundry.toml`.
The contract name is 13 characters, within the 32-character manifest limit, and the bytecode has no
unlinked libraries (all library code used is internal to OpenZeppelin's `ERC20`).

For local or development use, `script/DeployStarknetToken.s.sol` exposes `deploy()` (tested
directly) and `run()`, which broadcasts a single creation transaction from whatever signer `forge
script` is given. It reads no environment variables itself. This script is not part of the launch
and this repository authorizes no transactions.

## After launch

There is nothing to configure: the token has no owner and no settable values. Operational
responsibilities are limited to:

- **Supply distribution** is the factory's: 10% to the swarm's MerkleDistributor, 88% to seed the
  pool, 2% to the requester's `remainderTo` address, as the launch economics state.
- **Holding the requester's remainder** safely is the requester's: whoever controls
  `0x49c95a6ee32e9c0dc7a353c078e6158304bbce9f` controls those tokens. There is no recovery path for
  tokens sent to a wrong address or a contract that cannot move them.
- **Verification** of the source on the explorer is the launch deployer's step after deployment,
  with the compiler settings above (`forge verify-contract` with `--compiler-version 0.8.26`,
  optimizer runs 200, no constructor arguments).
- **Nothing to pause, upgrade or rescue**: by design, no party can intervene in the token after
  deployment. If different behaviour is wanted (burns, vesting, governance), it must be a new token.

## Repository layout

```
foundry.toml                      compiler pins and profile (solc 0.8.26, bytecode_hash none, no ffi, no fs)
remappings.txt                    forge-std and @openzeppelin/contracts remappings
src/StarknetToken.sol             the token
script/DeployStarknetToken.s.sol  local deploy script (deploy() + run())
test/StarknetToken.t.sol          unit, failure and fuzz tests
test/StarknetToken.invariant.t.sol  supply-conservation invariants with a handler
test/DeployStarknetToken.t.sol    tests the script's deploy() function directly
lib/forge-std/                    vendored forge-std (commit 0258fe8, MIT/Apache-2.0), plain files
lib/openzeppelin-contracts/       vendored subset of OpenZeppelin Contracts v5.1.0 (MIT), plain files
```

Dependencies are committed as ordinary files, not git submodules, so the project builds offline.
The OpenZeppelin subset is exactly the files `ERC20.sol` imports: `ERC20.sol`, `IERC20.sol`,
`extensions/IERC20Metadata.sol`, `utils/Context.sol`, `interfaces/draft-IERC6093.sol`.

## Tests

```
forge build
forge test
forge fmt --check
```

Tests read no environment variables and do not depend on the calling address, so they pass in any
order, in parallel and with an empty environment. They cover:

- **Success**: metadata, exact supply and decimals, the single mint `Transfer` event, the whole
  supply landing on the creator (including a CREATE2 factory, with nothing to the EOA behind it),
  transfers, approvals, `transferFrom`, infinite allowance, whole-balance and zero-amount transfers.
- **Failure**: insufficient balance, insufficient allowance, transfer to the zero address, approving
  the zero spender, rejected ether and unknown selectors, every common mint/admin/pause/blocklist/
  seize selector failing from both a stranger and the deployer without changing supply or balances.
- **Code-level**: runtime contains no `DELEGATECALL`, `CALLCODE` or `SELFDESTRUCT` and is within
  EIP-170; the creation code deploys identically with no arguments.
- **Fuzz and invariants**: transfers and `transferFrom` conserve supply across random amounts; a
  handler-driven invariant run keeps `totalSupply()` constant and equal to the sum of balances.

Passing tests are not a security audit. The token is a thin wrapper over a widely reviewed library
with no custom logic, but the launch's independent review remains the gate before release.
