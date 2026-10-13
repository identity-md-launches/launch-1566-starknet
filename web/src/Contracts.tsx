import { POOL_ID } from './chain'
import { ECONOMICS, PAIR_TOKEN, POOL_KEY, REPO_URL, TOKEN, UNISWAP_V4 } from './config'
import { AddressRow } from './ui'

export function Contracts() {
  return (
    <section className="card" aria-labelledby="contracts-title">
      <h2 id="contracts-title">Contracts and addresses</h2>
      <p className="muted">All on Ethereum mainnet, chain id 1. Verify an address here before you paste it anywhere else.</p>
      <div className="addr-list">
        <AddressRow label="STARKNET token" address={TOKEN.address} note="ERC-20, fixed supply" />
        <AddressRow label="Paired token (IMD)" address={PAIR_TOKEN.address} />
        <AddressRow label="Pool hook" address={POOL_KEY.hooks} note="PoolInitializationGuard" />
        <AddressRow label="Uniswap v4 PoolManager" address={UNISWAP_V4.poolManager} />
        <AddressRow label="Pool id" address={POOL_ID} kind="none" note={`fee ${POOL_KEY.fee}, tick spacing ${POOL_KEY.tickSpacing}`} />
        <AddressRow label="Launch remainder recipient" address={ECONOMICS.remainderTo} note="requester's 2% allocation" />
        <AddressRow label="Deployment transaction" address={TOKEN.deployTx} kind="tx" note={`block ${TOKEN.deployBlock.toLocaleString('en-US')}`} />
      </div>
      <p className="muted">
        Source at commit <code>{TOKEN.sourceCommit.slice(0, 12)}</code> in{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          the launch repository on GitHub
        </a>
        .
      </p>
    </section>
  )
}
