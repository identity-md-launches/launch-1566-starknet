import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { getAddress, parseUnits, type Address, type Hash } from 'viem'
import { addressProblem } from './address'
import { tokenAbi } from './abi'
import { describeError, formatAmount, getWalletClient, publicClient, readBalance, shortAddress } from './chain'
import { CHAIN_ID, CHAIN_ID_HEX, EXPLORER, TOKEN, WALLET_ADD_CHAIN } from './config'
import { CopyButton, Status } from './ui'

type Phase = 'idle' | 'sending' | 'confirming' | 'done' | 'error'

export interface WalletState {
  account: Address | null
  chainId: number | null
}

export function useWallet(): WalletState & {
  hasProvider: boolean
  connect: () => Promise<void>
  disconnect: () => void
  switchChain: () => Promise<void>
  error: string
  busy: boolean
} {
  const [account, setAccount] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const hasProvider = typeof window !== 'undefined' && !!window.ethereum

  useEffect(() => {
    const p = window.ethereum
    if (!p) return
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[]
      setAccount(list.length ? getAddress(list[0]) : null)
    }
    const onChain = (id: unknown) => setChainId(Number(id))
    p.on('accountsChanged', onAccounts)
    p.on('chainChanged', onChain)
    // Pick up an already-authorised account without prompting.
    p.request({ method: 'eth_accounts' }).then(onAccounts).catch(() => undefined)
    p.request({ method: 'eth_chainId' }).then(onChain).catch(() => undefined)
    return () => {
      p.removeListener('accountsChanged', onAccounts)
      p.removeListener('chainChanged', onChain)
    }
  }, [])

  const connect = useCallback(async () => {
    const p = window.ethereum
    setError('')
    if (!p) {
      setError('No wallet found in this browser. Install a wallet extension such as MetaMask, then reload this page.')
      return
    }
    setBusy(true)
    try {
      const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[]
      setAccount(accounts.length ? getAddress(accounts[0]) : null)
      const id = (await p.request({ method: 'eth_chainId' })) as string
      setChainId(Number(id))
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const switchChain = useCallback(async () => {
    const p = window.ethereum
    if (!p) return
    setError('')
    setBusy(true)
    try {
      try {
        await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] })
      } catch (e) {
        const code = (e as { code?: number }).code
        if (code === 4902) {
          await p.request({ method: 'wallet_addEthereumChain', params: [WALLET_ADD_CHAIN] })
        } else {
          throw e
        }
      }
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAccount(null)
    setError('')
  }, [])

  return { account, chainId, hasProvider, connect, disconnect, switchChain, error, busy }
}

export function WalletPanel({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const { account, chainId, connect, switchChain, disconnect, error, busy, hasProvider } = wallet
  const [balance, setBalance] = useState<bigint | null>(null)
  const [balanceError, setBalanceError] = useState('')

  const refreshBalance = useCallback(async () => {
    if (!account) return
    setBalanceError('')
    try {
      setBalance(await readBalance(account))
    } catch (e) {
      setBalanceError(describeError(e))
    }
  }, [account])

  useEffect(() => {
    setBalance(null)
    if (account) void refreshBalance()
  }, [account, refreshBalance])

  if (!account) {
    return (
      <section className="card" aria-labelledby="wallet-title">
        <h2 id="wallet-title">Your STARKNET</h2>
        <p className="muted">Connect a wallet to see your balance and send tokens.</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={connect} disabled={busy}>
            {busy ? 'Waiting for wallet…' : 'Connect wallet'}
          </button>
        </div>
        <Status tone={error ? 'error' : 'neutral'}>
          {error || (hasProvider ? '' : 'No wallet extension detected. You can still check any balance below.')}
        </Status>
      </section>
    )
  }

  const wrongChain = chainId !== null && chainId !== CHAIN_ID

  return (
    <section className="card" aria-labelledby="wallet-title">
      <div className="card-head">
        <h2 id="wallet-title">Your STARKNET</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={disconnect}>
          Disconnect
        </button>
      </div>
      <div className="kv">
        <span className="kv-label">Account</span>
        <span className="kv-value">
          <code className="addr" title={account}>
            {shortAddress(account)}
          </code>
          <CopyButton value={account} label="account address" />
        </span>
      </div>
      <div className="kv">
        <span className="kv-label">Balance</span>
        <span className="kv-value num">
          {balance === null ? (balanceError ? 'Unavailable' : 'Reading…') : `${formatAmount(balance, TOKEN.decimals, 4)} STARKNET`}
        </span>
      </div>
      {balanceError ? <Status tone="error">{balanceError}</Status> : null}

      {wrongChain ? (
        <div className="notice">
          <p>This wallet is on another network. STARKNET lives on Ethereum mainnet.</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={switchChain} disabled={busy}>
              {busy ? 'Waiting for wallet…' : 'Switch to Ethereum'}
            </button>
          </div>
          <Status tone={error ? 'error' : 'neutral'}>{error}</Status>
        </div>
      ) : (
        <TransferForm account={account} balance={balance} onSent={refreshBalance} />
      )}

      <div className="actions actions-secondary">
        <AddToWallet />
      </div>
    </section>
  )
}

function AddToWallet() {
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'neutral' | 'error' | 'success'>('neutral')
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          const p = window.ethereum
          if (!p) return
          setMsg('')
          try {
            const ok = await p.request({
              method: 'wallet_watchAsset',
              params: {
                type: 'ERC20',
                options: { address: TOKEN.address, symbol: TOKEN.symbol, decimals: TOKEN.decimals },
              },
            })
            setTone(ok ? 'success' : 'neutral')
            setMsg(ok ? 'STARKNET added to the wallet token list.' : 'The wallet did not add the token.')
          } catch (e) {
            setTone('error')
            setMsg(describeError(e))
          }
        }}
      >
        Add STARKNET to wallet
      </button>
      <Status tone={tone}>{msg}</Status>
    </>
  )
}

function TransferForm({ account, balance, onSent }: { account: Address; balance: bigint | null; onSent: () => void }) {
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [toError, setToError] = useState('')
  const [amountError, setAmountError] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [hash, setHash] = useState<Hash | null>(null)
  const [error, setError] = useState('')
  const toRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setToError('')
    setAmountError('')
    setError('')
    let value: bigint
    const target = to.trim()
    const problem = addressProblem(target)
    if (problem) {
      setToError(problem)
      toRef.current?.focus()
      return
    }
    try {
      value = parseUnits(amount.trim(), TOKEN.decimals)
    } catch {
      setAmountError('Enter an amount in STARKNET, for example 12.5.')
      amountRef.current?.focus()
      return
    }
    if (value <= 0n) {
      setAmountError('Enter an amount greater than 0.')
      amountRef.current?.focus()
      return
    }
    if (balance !== null && value > balance) {
      setAmountError(`Enter at most ${formatAmount(balance, TOKEN.decimals, 4)} STARKNET, the balance of this account.`)
      amountRef.current?.focus()
      return
    }
    const provider = window.ethereum
    if (!provider) return
    setPhase('sending')
    setHash(null)
    try {
      const wallet = getWalletClient(provider)
      const txHash = await wallet.writeContract({
        account,
        address: TOKEN.address,
        abi: tokenAbi,
        functionName: 'transfer',
        args: [getAddress(target), value],
      })
      setHash(txHash)
      setPhase('confirming')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status === 'success') {
        setPhase('done')
        setAmount('')
        onSent()
      } else {
        setPhase('error')
        setError('The transaction was mined but reverted. Nothing was sent.')
      }
    } catch (err) {
      setPhase('error')
      setError(describeError(err))
    }
  }

  const sending = phase === 'sending' || phase === 'confirming'

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h3>Send STARKNET</h3>
      <div className="field">
        <label htmlFor="to">Recipient address</label>
        <input
          ref={toRef}
          id="to"
          name="to"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-invalid={toError ? true : undefined}
          aria-describedby={toError ? 'to-error' : undefined}
        />
        {toError ? (
          <p id="to-error" className="field-error">
            {toError}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="amount">Amount in STARKNET</label>
        <div className="field-inline">
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? 'amount-error' : undefined}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={balance === null}
            onClick={() => balance !== null && setAmount(formatAmountPlain(balance))}
          >
            Max
          </button>
        </div>
        {amountError ? (
          <p id="amount-error" className="field-error">
            {amountError}
          </p>
        ) : null}
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={sending}>
          {phase === 'sending' ? 'Confirm in wallet…' : phase === 'confirming' ? 'Sending…' : 'Send STARKNET'}
        </button>
      </div>
      <Status tone={phase === 'error' ? 'error' : phase === 'done' ? 'success' : 'neutral'}>
        {phase === 'confirming' && hash ? (
          <>
            Waiting for Ethereum to confirm.{' '}
            <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
              View the transaction on Etherscan
            </a>
          </>
        ) : phase === 'done' && hash ? (
          <>
            Sent.{' '}
            <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
              View the transaction on Etherscan
            </a>
          </>
        ) : phase === 'error' ? (
          error
        ) : null}
      </Status>
    </form>
  )
}

function formatAmountPlain(value: bigint): string {
  // Full-precision decimal string without separators, suitable to feed back into parseUnits.
  const s = value.toString().padStart(TOKEN.decimals + 1, '0')
  const int = s.slice(0, -TOKEN.decimals)
  const frac = s.slice(-TOKEN.decimals).replace(/0+$/, '')
  return frac ? `${int}.${frac}` : int
}
