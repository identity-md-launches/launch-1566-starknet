import { isAddress } from 'viem'

/** Returns an error sentence for a typed address, or '' when it is usable. */
export function addressProblem(value: string): string {
  const v = value.trim()
  if (!isAddress(v, { strict: false })) return 'Enter a 42-character Ethereum address starting with 0x.'
  // Mixed case that fails EIP-55 usually means a typo in a pasted address.
  if (!isAddress(v, { strict: true })) return 'This address fails its capitalization check. Paste it again from the source.'
  return ''
}
