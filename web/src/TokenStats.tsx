import { formatAmount, formatPrice, priceFromSqrtX96, type TokenState } from './chain'
import { ECONOMICS, PAIR_TOKEN, TOKEN } from './config'
import { Status } from './ui'

export function TokenStats({ state, error, onRetry }: { state: TokenState | null; error: string; onRetry: () => void }) {
  const price = state ? priceFromSqrtX96(state.sqrtPriceX96) : 0
  const supplyNumber = state ? Number(state.totalSupply / 10n ** BigInt(TOKEN.decimals)) : 0
  const marketCap = price * supplyNumber
  const poolShare = state && state.totalSupply > 0n ? Number((state.poolBalance * 10000n) / state.totalSupply) / 100 : null

  return (
    <section className="card" aria-labelledby="stats-title">
      <div className="card-head">
        <h2 id="stats-title">On chain now</h2>
        {state ? <span className="muted num">Block {state.blockNumber.toLocaleString('en-US')}</span> : null}
      </div>
      <dl className="stats">
        <div className="stat">
          <dt>Total supply</dt>
          <dd className="num">{state ? `${formatAmount(state.totalSupply, state.decimals, 0)} ${state.symbol}` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Pool price per {TOKEN.symbol}</dt>
          <dd className="num">{state ? `${formatPrice(price)} ${PAIR_TOKEN.symbol}` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Market value at pool price</dt>
          <dd className="num">{state ? `${formatPrice(marketCap)} ${PAIR_TOKEN.symbol}` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Held by the pool</dt>
          <dd className="num">{state ? `${formatAmount(state.poolBalance, state.decimals, 0)} ${state.symbol}${poolShare !== null ? ` (${poolShare}%)` : ''}` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Pool fee</dt>
          <dd className="num">{state ? `${(state.lpFee / 10000).toFixed(2)}%` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Launch remainder holds</dt>
          <dd className="num">{state ? `${formatAmount(state.remainderBalance, state.decimals, 0)} ${state.symbol}` : '—'}</dd>
        </div>
      </dl>
      <p className="muted">
        Price comes from the Uniswap v4 pool against {PAIR_TOKEN.name} ({PAIR_TOKEN.symbol}). The launch remainder is the requester&rsquo;s
        allocation at <code className="addr">{ECONOMICS.remainderTo}</code>.
      </p>
      <Status tone={error ? 'error' : 'neutral'}>
        {error ? (
          <>
            {error}{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              Retry
            </button>
          </>
        ) : state ? null : (
          'Reading Ethereum…'
        )}
      </Status>
    </section>
  )
}
