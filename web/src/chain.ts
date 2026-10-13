import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  fallback,
  formatUnits,
  http,
  keccak256,
  type Address,
  type EIP1193Provider,
} from 'viem'
import { mainnet } from 'viem/chains'
import { stateViewAbi, tokenAbi } from './abi'
import { POOL_KEY, RPC_URLS, TOKEN, UNISWAP_V4 } from './config'

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: fallback(RPC_URLS.map((url) => http(url, { timeout: 15_000 }))),
})

export function getWalletClient(provider: EIP1193Provider) {
  return createWalletClient({ chain: mainnet, transport: custom(provider) })
}

export const POOL_ID = keccak256(
  encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'address' },
      { type: 'uint24' },
      { type: 'int24' },
      { type: 'address' },
    ],
    [POOL_KEY.currency0, POOL_KEY.currency1, POOL_KEY.fee, POOL_KEY.tickSpacing, POOL_KEY.hooks],
  ),
)

export interface TokenState {
  name: string
  symbol: string
  decimals: number
  totalSupply: bigint
  poolBalance: bigint
  remainderBalance: bigint
  sqrtPriceX96: bigint
  tick: number
  lpFee: number
  liquidity: bigint
  blockNumber: bigint
}

export async function readTokenState(remainderTo: Address): Promise<TokenState> {
  const [blockNumber, results] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: TOKEN.address, abi: tokenAbi, functionName: 'name' },
        { address: TOKEN.address, abi: tokenAbi, functionName: 'symbol' },
        { address: TOKEN.address, abi: tokenAbi, functionName: 'decimals' },
        { address: TOKEN.address, abi: tokenAbi, functionName: 'totalSupply' },
        { address: TOKEN.address, abi: tokenAbi, functionName: 'balanceOf', args: [UNISWAP_V4.poolManager] },
        { address: TOKEN.address, abi: tokenAbi, functionName: 'balanceOf', args: [remainderTo] },
        { address: UNISWAP_V4.stateView, abi: stateViewAbi, functionName: 'getSlot0', args: [POOL_ID] },
        { address: UNISWAP_V4.stateView, abi: stateViewAbi, functionName: 'getLiquidity', args: [POOL_ID] },
      ],
    }),
  ])
  const [name, symbol, decimals, totalSupply, poolBalance, remainderBalance, slot0, liquidity] = results
  return {
    name,
    symbol,
    decimals,
    totalSupply,
    poolBalance,
    remainderBalance,
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
    lpFee: slot0[3],
    liquidity,
    blockNumber,
  }
}

export function readBalance(account: Address): Promise<bigint> {
  return publicClient.readContract({ address: TOKEN.address, abi: tokenAbi, functionName: 'balanceOf', args: [account] })
}

/** IMD per STARKNET from the pool's sqrtPriceX96 (currency1 per currency0, both 18 decimals). */
export function priceFromSqrtX96(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 === 0n) return 0
  const ratio = Number(sqrtPriceX96) / 2 ** 96
  return ratio * ratio
}

const compact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Whole-token amount with thousands separators and up to `digits` decimals. */
export function formatAmount(value: bigint, decimals: number = TOKEN.decimals, digits = 2): string {
  const text = formatUnits(value, decimals)
  const n = Number(text)
  if (!Number.isFinite(n)) return text
  if (digits === 0) return whole.format(n)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n)
}

export function formatPrice(n: number): string {
  if (n === 0) return '0'
  if (n >= 1) return compact.format(n)
  // Show enough significant digits for a small price without exponent notation.
  return n.toLocaleString('en-US', { maximumSignificantDigits: 4, maximumFractionDigits: 20 })
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Turn a wallet or RPC error into one plain sentence a visitor can act on. */
export function describeError(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } }
  const code = e?.code ?? e?.cause?.code
  if (code === 4001 || /user rejected|user denied/i.test(e?.message ?? '')) return 'Request cancelled in the wallet. Nothing was sent.'
  if (/insufficient funds/i.test(e?.message ?? '')) return 'Not enough ETH for gas. Add ETH to this account and try again.'
  if (/ERC20InsufficientBalance/i.test(e?.message ?? '')) return 'Amount is more than this account holds. Enter a smaller amount.'
  if (e?.shortMessage) return e.shortMessage
  if (e?.message) return e.message.split('\n')[0]
  return 'Unable to complete the request. Try again.'
}
