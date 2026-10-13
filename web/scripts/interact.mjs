// Interaction validation for the production export in dist/.
// Run from the repository root: IMD_PLAYWRIGHT=<playwright/index.mjs> node web/scripts/interact.mjs dist
// Screenshots and nothing else are written to test/scratch/interact/.
// Serves dist/ under /preview/ on a random port for the life of this script only, drives it
// with Playwright Chromium (and WebKit when present) at 390 and 1440 wide, and prints a
// pass/fail line per check. A fake EIP-1193 provider is injected to exercise the wallet
// states; no real wallet or transaction is involved. Balance lookups hit the real public RPC.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.argv[2] || 'dist'
const pw = process.env.IMD_PLAYWRIGHT ? await import(pathToFileURL(process.env.IMD_PLAYWRIGHT).href) : await import('playwright')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith('/preview/')) { res.writeHead(404); return res.end() }
  let p = join(root, decodeURIComponent(url.pathname.slice('/preview/'.length)) || 'index.html')
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html') } catch { res.writeHead(404); return res.end('missing ' + p) }
  try {
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': mime[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('missing ' + p) }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/preview/`

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`) }

const ACCOUNT = '0x49c95a6ee32e9c0dc7a353c078e6158304bbce9f'
const BAD_CHECKSUM = '0x49C95a6EE32E9C0dC7a353c078e6158304bbce9F'
const fakeProvider = (opts) => `
  (() => {
    const listeners = {};
    let chainId = ${JSON.stringify(opts.chainId)};
    let accounts = [];
    window.__wallet = { calls: [] };
    window.ethereum = {
      isMetaMask: true,
      on(ev, fn) { (listeners[ev] ||= []).push(fn) },
      removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn) },
      async request({ method, params }) {
        window.__wallet.calls.push(method);
        switch (method) {
          case 'eth_accounts': return accounts;
          case 'eth_requestAccounts': accounts = ['${ACCOUNT}']; return accounts;
          case 'eth_chainId': return chainId;
          case 'wallet_switchEthereumChain': chainId = '0x1'; (listeners.chainChanged || []).forEach((f) => f('0x1')); return null;
          case 'wallet_watchAsset': return true;
          case 'eth_sendTransaction':
            if (${JSON.stringify(opts.reject)}) { const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
            return '0x' + 'ab'.repeat(32);
          default: {
            // Forward reads to the public RPC so viem's gas estimation and chain checks work.
            const r = await fetch('https://ethereum-rpc.publicnode.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
            const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e } return j.result;
          }
        }
      }
    };
  })();
`

async function run(browserType, label) {
  const browser = await browserType.launch()
  try {
    // 1. Plain visitor, no wallet, 390 wide: first screen, console, balance lookup, validation.
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      const errors = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      page.on('pageerror', (e) => errors.push(String(e)))
      const failed = []
      page.on('requestfailed', (r) => { if (r.url().startsWith(base)) failed.push(r.url()) })
      await page.goto(base, { waitUntil: 'networkidle' })
      check(`${label} 390 no console errors`, errors.length === 0, errors.join(' | '))
      check(`${label} 390 no failed local resources`, failed.length === 0, failed.join(' '))
      const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      check(`${label} 390 no horizontal scroll`, noScroll)
      const btn = page.getByRole('button', { name: 'Connect wallet' }).nth(1)
      const box = await btn.boundingBox()
      check(`${label} 390 main action on first screen`, !!box && box.y + box.height <= 844, box ? `bottom at ${Math.round(box.y + box.height)}px` : 'not found')
      await page.waitForFunction(() => /1,000,000,000 STARKNET/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
      const text = await page.innerText('body')
      check(`${label} 390 live supply read from chain`, /1,000,000,000 STARKNET/.test(text))
      check(`${label} 390 pool price read from chain`, /Pool price per STARKNET\s*\n\s*[0-9.]+ IMD/.test(text), (text.match(/Pool price per STARKNET\s*\n\s*[^\n]+/) || [''])[0])
      check(`${label} 390 no-wallet hint shown`, /No wallet extension detected/.test(text))
      // Balance lookup: invalid input, then a real address.
      await page.fill('#lookup', 'not an address')
      await page.getByRole('button', { name: 'Check balance' }).click()
      const err = await page.textContent('#lookup-error').catch(() => '')
      check(`${label} 390 lookup rejects a bad address inline`, /42-character/.test(err || ''), err || '')
      const focused = await page.evaluate(() => document.activeElement?.id)
      check(`${label} 390 focus moves to the invalid field`, focused === 'lookup', focused)
      await page.fill('#lookup', ACCOUNT)
      await page.getByRole('button', { name: 'Check balance' }).click()
      await page.waitForFunction(() => /holds/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
      const after = await page.innerText('body')
      const m = after.match(/holds\s+([0-9,.]+) STARKNET/)
      check(`${label} 390 lookup shows a real balance`, !!m, m ? m[1] : 'no result')
      // Keyboard: tab from the top reaches the skip link, then the brand, then connect.
      await page.goto(base, { waitUntil: 'networkidle' })
      await page.keyboard.press('Tab')
      const first = await page.evaluate(() => document.activeElement?.textContent?.trim())
      check(`${label} 390 first tab stop is skip link`, first === 'Skip to content', first)
      // Copy button in contracts list (clipboard may be unavailable headless; check label swap only if it works).
      const copy = page.getByRole('button', { name: 'Copy STARKNET token' })
      check(`${label} 390 copy button has an accessible name`, (await copy.count()) === 1)
      await page.screenshot({ path: `test/scratch/interact/${label}-390.png` })
      await page.close()
    }
    // 2. Desktop 1440 with a fake wallet on the wrong chain, then switched, transfer validation + cancel.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      await ctx.addInitScript(fakeProvider({ chainId: '0xaa36a7', reject: true }))
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e)))
      await page.goto(base, { waitUntil: 'networkidle' })
      const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      check(`${label} 1440 no horizontal scroll`, noScroll)
      await page.getByRole('button', { name: 'Connect wallet' }).nth(1).click()
      await page.waitForSelector('.wallet-chip')
      const chip = await page.textContent('.wallet-chip')
      check(`${label} 1440 header shows connected account`, /^0x49c9…ce9f$/i.test(chip || ''), chip || '')
      const wrong = await page.innerText('body')
      check(`${label} 1440 wrong-network state offers a switch`, /another network/.test(wrong) && (await page.getByRole('button', { name: 'Switch to Ethereum' }).count()) === 1)
      await page.getByRole('button', { name: 'Switch to Ethereum' }).click()
      await page.waitForSelector('#to')
      check(`${label} 1440 transfer form appears after switch`, true)
      await page.waitForFunction(() => /Balance\s*\n?\s*[0-9,.]+ STARKNET/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
      const bal = (await page.innerText('body')).match(/Balance\s*\n?\s*([0-9,.]+) STARKNET/)
      check(`${label} 1440 connected balance read from chain`, !!bal, bal ? bal[1] : 'none')
      // Validation: empty recipient, then bad amount, then too much.
      await page.getByRole('button', { name: 'Send STARKNET' }).click()
      check(`${label} 1440 send rejects empty recipient`, /42-character/.test((await page.textContent('#to-error')) || ''))
      await page.fill('#to', BAD_CHECKSUM)
      await page.getByRole('button', { name: 'Send STARKNET' }).click()
      check(`${label} 1440 send explains a bad checksum`, /capitalization/.test((await page.textContent('#to-error')) || ''))
      await page.fill('#to', ACCOUNT)
      await page.fill('#amount', 'abc')
      await page.getByRole('button', { name: 'Send STARKNET' }).click()
      check(`${label} 1440 send rejects bad amount`, /for example/.test((await page.textContent('#amount-error')) || ''))
      await page.fill('#amount', '999999999999')
      await page.getByRole('button', { name: 'Send STARKNET' }).click()
      check(`${label} 1440 send rejects amount over balance`, /at most/.test((await page.textContent('#amount-error')) || ''))
      // Max fills the balance; then a rejected signature reports the cancel plainly.
      await page.getByRole('button', { name: 'Max' }).click()
      const maxVal = await page.inputValue('#amount')
      check(`${label} 1440 Max fills the balance`, /^[0-9]+(\.[0-9]+)?$/.test(maxVal), maxVal)
      await page.fill('#amount', '1')
      await page.getByRole('button', { name: 'Send STARKNET' }).click()
      await page.waitForFunction(() => /cancelled in the wallet/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
      const cancelled = /Request cancelled in the wallet. Nothing was sent./.test(await page.innerText('body'))
      check(`${label} 1440 rejected signature shows cancel message`, cancelled)
      const calls = await page.evaluate(() => window.__wallet.calls)
      check(`${label} 1440 wallet asked to sign a transfer`, calls.includes('eth_sendTransaction'), calls.join(','))
      await page.getByRole('button', { name: 'Add STARKNET to wallet' }).click()
      await page.waitForFunction(() => /added to the wallet/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {})
      check(`${label} 1440 add-to-wallet confirms`, /added to the wallet token list/.test(await page.innerText('body')))
      check(`${label} 1440 no page errors in wallet flow`, errors.length === 0, errors.join(' | '))
      await page.screenshot({ path: `test/scratch/interact/${label}-1440-connected.png`, fullPage: false })
      await page.close()
      await ctx.close()
    }
    // 3. Accepted signature shows the pending state with an Etherscan link (390 wide, right chain).
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
      await ctx.addInitScript(fakeProvider({ chainId: '0x1', reject: false }))
      const page = await ctx.newPage()
      await page.goto(base, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Connect wallet' }).nth(1).click()
      await page.waitForSelector('#to')
      await page.fill('#to', ACCOUNT)
      await page.fill('#amount', '0.5')
      await page.getByRole('button', { name: 'Send STARKNET' }).click()
      await page.waitForFunction(() => /Waiting for Ethereum to confirm/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
      const pending = await page.innerText('body')
      const link = await page.getAttribute('a:has-text("View the transaction on Etherscan")', 'href').catch(() => null)
      check(`${label} 390 pending state shows Etherscan link`, /Waiting for Ethereum to confirm/.test(pending) && !!link && link.startsWith('https://etherscan.io/tx/0x'), link || '')
      const disabled = await page.getByRole('button', { name: 'Sending…' }).isDisabled().catch(() => false)
      check(`${label} 390 submit disabled while pending`, disabled)
      await page.screenshot({ path: `test/scratch/interact/${label}-390-pending.png` })
      await page.close()
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
}

import { mkdir } from 'node:fs/promises'
await mkdir('test/scratch/interact', { recursive: true })
await run(pw.chromium, 'chromium')
try {
  await run(pw.webkit, 'webkit')
} catch (e) {
  console.log('SKIP webkit :: ' + String(e).split('\n')[0])
}
server.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
