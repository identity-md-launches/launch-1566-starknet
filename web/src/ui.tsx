import { useEffect, useState, type ReactNode } from 'react'
import { EXPLORER } from './config'

/** Copies `value` and confirms with text, not colour alone. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(t)
  }, [copied])
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => setCopied(false))
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function AddressRow({ label, address, kind = 'address', note }: { label: string; address: string; kind?: 'address' | 'tx' | 'none'; note?: ReactNode }) {
  const href = kind === 'none' ? undefined : `${EXPLORER}/${kind}/${address}`
  return (
    <div className="addr-row">
      <div className="addr-row-head">
        <span className="addr-label">{label}</span>
        {note ? <span className="addr-note">{note}</span> : null}
      </div>
      <div className="addr-row-body">
        <code className="addr">{address}</code>
        <div className="addr-actions">
          <CopyButton value={address} label={label} />
          {href ? (
            <a className="btn btn-ghost btn-sm" href={href} target="_blank" rel="noreferrer">
              Etherscan
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Polite status line. Always rendered so screen readers get a stable region. */
export function Status({ tone = 'neutral', children }: { tone?: 'neutral' | 'error' | 'success'; children?: ReactNode }) {
  return (
    <p className={`status status-${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? undefined : 'polite'}>
      {children}
    </p>
  )
}
