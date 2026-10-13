// Chain facts and verified addresses. Every address here is copied from
// .imd/reads/deployment.json (token, pool key, launch economics) or
// .imd/reads/network.json (chain, RPCs, Uniswap v4 periphery, pair token).
// Nothing is derived from prose.

export const CHAIN_ID = 1
export const CHAIN_ID_HEX = '0x1'
export const CHAIN_NAME = 'Ethereum'
export const EXPLORER = 'https://etherscan.io'
export const RPC_URLS = ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'] as const

export const WALLET_ADD_CHAIN = {
  chainId: CHAIN_ID_HEX,
  chainName: CHAIN_NAME,
  rpcUrls: [...RPC_URLS],
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: [EXPLORER],
}

export const TOKEN = {
  address: '0x380cfcb68f13e6be8b27f34d24690764ad84a3ac',
  name: 'Starknet',
  symbol: 'STARKNET',
  decimals: 18,
  totalSupply: 1_000_000_000n * 10n ** 18n,
  deployTx: '0x18ea94998f7f56f8afa0159b2dc561e6a05c6aa89207254ed5db1a4390ca2c86',
  deployBlock: 26183562,
  sourceCommit: '20f1ecfe86dcccd94b18c4aa371a6fe8899f7a2b',
} as const

export const PAIR_TOKEN = {
  address: '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7',
  symbol: 'IMD',
  name: 'Identity.md',
  decimals: 18,
} as const

// Uniswap v4 pool key, exactly as deployed. currency0 is STARKNET, currency1 is IMD.
export const POOL_KEY = {
  currency0: TOKEN.address,
  currency1: PAIR_TOKEN.address,
  fee: 12500,
  tickSpacing: 60,
  hooks: '0x784ff9a3ac5d88a30bfff6f7f2a270161fbe6000',
} as const

export const UNISWAP_V4 = {
  poolManager: '0x000000000004444c5dc75cb358380d2e3de08a90',
  stateView: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
} as const

// Launch economics from deployment.json: 88% seeded into the pool, the rest split between the
// swarm's distributor and the requester's remainder address.
export const ECONOMICS = {
  poolBps: 8800,
  remainderTo: '0x49c95a6ee32e9c0dc7a353c078e6158304bbce9f',
  initialMarketCapWei: 2_500n * 10n ** 18n,
} as const

export const REPO_URL = 'https://github.com/identity-md-launches/launch-1566-starknet'
