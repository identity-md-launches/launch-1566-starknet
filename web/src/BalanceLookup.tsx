import { useRef, useState, type FormEvent } from 'react'
import { getAddress } from 'viem'
import { addressProblem } from './address'
import { describeError, formatAmount, readBalance } from './chain'
import { TOKEN } from './config'
import { Status } from './ui'

/** Reads any account's STARKNET balance over the public RPC. Needs no wallet. */
export function BalanceLookup() {
  const [address, setAddress] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [result, setResult] = useState<{ address: string; balance: bigint } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFieldError('')
    setError('')
    const target = address.trim()
    const problem = addressProblem(target)
    if (problem) {
      setFieldError(problem)
      inputRef.current?.focus()
      return
    }
    setLoading(true)
    try {
      const checksummed = getAddress(target)
      const balance = await readBalance(checksummed)
      setResult({ address: checksummed, balance })
    } catch (err) {
      setResult(null)
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card" aria-labelledby="lookup-title">
      <h2 id="lookup-title">Check any balance</h2>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="lookup">Ethereum address</label>
          <div className="field-inline">
            <input
              ref={inputRef}
              id="lookup"
              name="lookup"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'lookup-error' : undefined}
            />
            <button type="submit" className="btn btn-secondary" disabled={loading}>
              {loading ? 'Reading…' : 'Check balance'}
            </button>
          </div>
          {fieldError ? (
            <p id="lookup-error" className="field-error">
              {fieldError}
            </p>
          ) : null}
        </div>
      </form>
      <Status tone={error ? 'error' : 'neutral'}>
        {error ? (
          error
        ) : result ? (
          <>
            <code className="addr">{result.address}</code> holds{' '}
            <strong className="num">{formatAmount(result.balance, TOKEN.decimals, 4)} STARKNET</strong>.
          </>
        ) : null}
      </Status>
    </section>
  )
}
