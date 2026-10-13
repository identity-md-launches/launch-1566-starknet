import { useCallback, useEffect, useState } from 'react'
import { BalanceLookup } from './BalanceLookup'
import { describeError, readTokenState, shortAddress, type TokenState } from './chain'
import { ECONOMICS } from './config'
import { Contracts } from './Contracts'
import { TokenStats } from './TokenStats'
import { useWallet, WalletPanel } from './WalletPanel'

export default function App() {
  const wallet = useWallet()
  const [state, setState] = useState<TokenState | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setState(await readTokenState(ECONOMICS.remainderTo))
    } catch (e) {
      setError(`Unable to read Ethereum right now. ${describeError(e)}`)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Starknet, home">
          <img src="./favicon.svg" alt="" width="28" height="28" />
          <span>Starknet</span>
        </a>
        <div className="header-actions">
          {wallet.account ? (
            <span className="wallet-chip num" title={wallet.account}>
              {shortAddress(wallet.account)}
            </span>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={wallet.connect} disabled={wallet.busy}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      <main id="main" className="page">
        <div className="hero" id="top">
          <h1>Starknet. Fixed supply.</h1>
          <p className="lede">One billion STARKNET on Ethereum, no owner and no mint. Check a balance or send tokens.</p>
        </div>

        <div className="grid">
          <div className="col col-action">
            <WalletPanel wallet={wallet} />
            <BalanceLookup />
          </div>
          <div className="col col-info">
            <TokenStats state={state} error={error} onRetry={load} />
            <Contracts />
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <p>
          Starknet (STARKNET) is a fixed-supply ERC-20 built on OpenZeppelin v5.1.0. This page reads the chain through public RPCs and signs
          nothing without your wallet.
        </p>
      </footer>
    </>
  )
}
