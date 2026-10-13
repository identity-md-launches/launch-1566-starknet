// Renders the share card (public/og.png, 1200x630) and the touch icon (public/apple-touch-icon.png)
// from inline HTML with the site's own tokens, so both stay in step with the design.
// Run from web/: IMD_PLAYWRIGHT=<path to playwright/index.mjs> node scripts/make-images.mjs
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'public')

async function loadPlaywright() {
  if (process.env.IMD_PLAYWRIGHT) return import(pathToFileURL(process.env.IMD_PLAYWRIGHT).href)
  return import('playwright')
}

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="SIZE" height="SIZE"><rect width="64" height="64" rx="14" fill="#0b1020"/><path d="M18 42c3 3 7 5 12 5 7 0 12-4 12-10 0-5-3-8-10-10l-4-1c-4-1-6-3-6-6 0-3 3-5 7-5 4 0 7 2 9 4l4-5c-3-3-8-5-13-5-7 0-12 4-12 10 0 5 3 8 10 10l4 1c4 1 6 3 6 6 0 3-3 5-7 5-4 0-8-2-10-5z" fill="#f4c542"/></svg>`

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;background:#0b1020;color:#eef1f8;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{position:relative;width:1200px;height:630px;padding:72px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;align-items:center;gap:20px;font-size:32px;font-weight:600}
h1{margin:0;font-size:96px;line-height:1.05;font-weight:600;letter-spacing:-0.02em;max-width:900px}
p{margin:16px 0 0;font-size:34px;line-height:1.3;color:#aab3cd;max-width:900px}
.chip{display:inline-block;margin-top:28px;padding:14px 24px;border:2px solid #2b3558;border-radius:999px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:26px;color:#aab3cd}
.glow{position:absolute;right:-160px;top:-160px;width:620px;height:620px;border-radius:50%;background:radial-gradient(closest-side,#f4c54233,transparent)}
</style></head><body><div class="wrap"><div class="glow"></div>
<div class="top">${icon.replace(/SIZE/g, '56')}<span>Starknet</span></div>
<div><h1>Starknet. Fixed supply.</h1><p>One billion STARKNET on Ethereum, no owner and no mint.</p>
<span class="chip">0x380cfcb68f13e6be8b27f34d24690764ad84a3ac</span></div>
</div></body></html>`

const touch = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body>${icon.replace(/SIZE/g, '180')}</body></html>`

const { chromium } = await loadPlaywright()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.setContent(og)
  await page.screenshot({ path: join(out, 'og.png'), type: 'png' })
  const icoPage = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 })
  await icoPage.setContent(touch)
  await icoPage.screenshot({ path: join(out, 'apple-touch-icon.png'), type: 'png', omitBackground: true })
  console.log('wrote', join(out, 'og.png'), 'and apple-touch-icon.png')
} finally {
  await browser.close()
}
